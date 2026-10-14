import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import {
  TEST_PASSWORD,
  createAdmin,
  deleteE2EGames,
  deleteUsersByEmailPrefix,
} from "./helpers";

const E2E_LOCATION = "Quadra Excluir E2E";

test.beforeAll(async () => {
  await deleteE2EGames(E2E_LOCATION);
});

test.afterAll(async () => {
  await deleteE2EGames(E2E_LOCATION);
  await deleteUsersByEmailPrefix("e2e-admin-");
});

test("an admin deletes a pelada for good, after confirming", async ({ page }) => {
  const admin = await createAdmin();
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const now = Date.now();
  const { data: game, error } = await db
    .from("games")
    .insert({
      slots: 10,
      location: E2E_LOCATION,
      list_opens_at: new Date(now - 60_000).toISOString(),
      starts_at: new Date(now + 3 * 3_600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(admin.email);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Navigating before the sign-in finishes would bounce back to /entrar.
  await expect(page.getByText("Olá, AdminE2E")).toBeVisible();

  await page.goto(`/admin/peladas/${game.id}`);

  // One click is not enough: it only asks.
  await page.getByRole("button", { name: "Excluir pelada" }).click();
  await expect(page.getByText("não tem como desfazer")).toBeVisible();
  await page.getByRole("button", { name: "Não" }).click();
  await expect(page.getByRole("button", { name: "Excluir pelada" })).toBeVisible();
  const stillThere = await db.from("games").select("id").eq("id", game.id);
  expect(stillThere.data).toHaveLength(1);

  await page.getByRole("button", { name: "Excluir pelada" }).click();
  await page.getByRole("button", { name: "Sim, excluir" }).click();

  await expect(page).toHaveURL(/\/admin\/peladas$/);
  await expect(page.getByText(E2E_LOCATION)).toHaveCount(0);

  const gone = await db.from("games").select("id").eq("id", game.id);
  expect(gone.data).toHaveLength(0);
});

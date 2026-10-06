import { expect, test } from "@playwright/test";

import {
  TEST_PASSWORD,
  createApprovedPlayer,
  deleteE2EGames,
  deleteUsersByEmailPrefix,
} from "./helpers";
import { toDateTimeLocalValue } from "../src/lib/datetime";

const E2E_LOCATION = "Quadra Multipla E2E";

test.beforeAll(async () => {
  await deleteE2EGames(E2E_LOCATION);
});

test.afterAll(async () => {
  await deleteE2EGames(E2E_LOCATION);
  await deleteUsersByEmailPrefix("e2e-multi-");
});

async function createGameViaForm(
  page: import("@playwright/test").Page,
  startsInMinutes: number,
) {
  await page.getByRole("link", { name: "Nova pelada" }).click();
  await page
    .getByLabel("Dia e hora do jogo")
    .fill(toDateTimeLocalValue(new Date(Date.now() + startsInMinutes * 60_000).toISOString()));
  await page
    .getByLabel("Abertura da lista")
    .fill(toDateTimeLocalValue(new Date(Date.now() - 10 * 60_000).toISOString()));
  await page.getByLabel("Local").fill(E2E_LOCATION);
  await page.getByLabel("Vagas").fill("10");
  await page.getByRole("button", { name: "Criar pelada" }).click();
  await page.waitForURL("http://localhost:3000/admin/peladas");
}

test("the home screen lists every upcoming pelada, not just the first one created", async ({
  browser,
}) => {
  const admin = await createApprovedPlayer("e2e-multi-", "AdminMulti", "Admin Multi");
  // Promote directly: createApprovedPlayer only approves, it does not grant admin.
  const { createClient } = await import("@supabase/supabase-js");
  const secret = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  await secret.from("profiles").update({ role: "admin" }).eq("id", admin.id);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto("/entrar");
  await adminPage.getByLabel("E-mail").fill(admin.email);
  await adminPage.getByLabel("Senha").fill(TEST_PASSWORD);
  await adminPage.getByRole("button", { name: "Entrar" }).click();
  await adminPage.waitForURL("http://localhost:3000/");

  await adminPage.getByRole("link", { name: "Admin" }).click();

  // Create two peladas, the second one further out than the first.
  await createGameViaForm(adminPage, 60);
  await createGameViaForm(adminPage, 48 * 60);

  // Both show up on the home screen, not just the one created first.
  await adminPage.goto("/");
  const locationMatches = adminPage.getByText(E2E_LOCATION);
  await expect(locationMatches).toHaveCount(2);

  await adminContext.close();
});

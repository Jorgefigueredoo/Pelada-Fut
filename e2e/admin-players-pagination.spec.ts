import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { TEST_PASSWORD, createAdmin, deleteUsersByEmailPrefix, uniqueEmail } from "./helpers";

const PREFIX = "e2e-page-";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.afterAll(async () => {
  await deleteUsersByEmailPrefix(PREFIX);
  await deleteUsersByEmailPrefix("e2e-admin-");
});

test("the player list shows 10 per page and pages through the rest", async ({ page }) => {
  const adminAccount = await createAdmin();
  const client = admin();

  // 13 approved players, so the search term matches 13 across 2 pages (10 + 3).
  await Promise.all(
    Array.from({ length: 13 }, async (_unused, index) => {
      const email = uniqueEmail(PREFIX);
      const { data, error } = await client.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: `Pager ${index}`, nickname: `Pager${index}` },
      });
      if (error) throw error;
      await client.from("profiles").update({ status: "approved" }).eq("id", data.user.id);
    }),
  );

  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(adminAccount.email);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByRole("link", { name: "Jogadores" }).click();

  await page.getByPlaceholder("Buscar por nome, apelido ou e-mail").fill("Pager");
  await page.getByRole("button", { name: "Buscar" }).click();

  await expect(page.getByText("Todos os jogadores (13)")).toBeVisible();
  await expect(page.getByText("Página 1 de 2")).toBeVisible();

  const cardsOnPageOne = await page.locator('[data-slot="card"]').filter({ hasText: "Pager" }).count();
  expect(cardsOnPageOne).toBe(10);

  await page.getByRole("link", { name: "Próxima" }).click();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();

  const cardsOnPageTwo = await page.locator('[data-slot="card"]').filter({ hasText: "Pager" }).count();
  expect(cardsOnPageTwo).toBe(3);

  // The search term survives paging.
  await expect(page.getByPlaceholder("Buscar por nome, apelido ou e-mail")).toHaveValue("Pager");
});

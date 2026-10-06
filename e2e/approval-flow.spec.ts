import { expect, test } from "@playwright/test";

import { TEST_PASSWORD, createAdmin, deleteUsersByEmailPrefix, uniqueEmail } from "./helpers";

const PLAYER_PREFIX = "e2e-player-";

test.afterAll(async () => {
  await deleteUsersByEmailPrefix(PLAYER_PREFIX);
  await deleteUsersByEmailPrefix("e2e-admin-");
});

test("a new account waits for approval, and an admin lets it in", async ({ page }) => {
  const admin = await createAdmin();
  const playerEmail = uniqueEmail(PLAYER_PREFIX);

  // 1. The player signs up and lands on the waiting screen.
  await page.goto("/criar-conta");
  await page.getByLabel("Nome").fill("Jogador E2E");
  await page.getByLabel("Apelido").fill("ZeE2E");
  await page.getByLabel("E-mail").fill(playerEmail);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByRole("heading", { name: "Aguardando aprovação" })).toBeVisible();

  // A pending player cannot reach the list by typing the URL.
  await page.goto("/");
  await expect(page).toHaveURL(/\/aguardando$/);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  // 2. The admin approves them.
  await page.getByLabel("E-mail").fill(admin.email);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Pelada de Quarta" })).toBeVisible();

  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByRole("link", { name: "Jogadores" }).click();
  const pendingCard = page.locator("div").filter({ hasText: "ZeE2E" }).first();
  await expect(pendingCard).toBeVisible();
  await page.getByRole("button", { name: "Aprovar" }).first().click();
  await expect(page.getByText("ZeE2E aprovado.")).toBeVisible();

  await page.getByRole("link", { name: "Perfil" }).click();
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  // 3. The player now reaches the list.
  await page.getByLabel("E-mail").fill(playerEmail);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("Olá, ZeE2E")).toBeVisible();
  await expect(page.getByText("Nenhuma pelada marcada")).toBeVisible();
  // A player never sees the admin tab.
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

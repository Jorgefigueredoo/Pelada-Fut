import { expect, test } from "@playwright/test";

import { TEST_PASSWORD, createAdmin, deleteUsersByEmailPrefix, uniqueEmail } from "./helpers";

const PLAYER_PREFIX = "e2e-crud-";

test.afterAll(async () => {
  await deleteUsersByEmailPrefix(PLAYER_PREFIX);
  await deleteUsersByEmailPrefix("e2e-admin-");
});

test("admin creates, edits, inactivates and deletes a player", async ({ page }) => {
  const admin = await createAdmin();
  const email = uniqueEmail(PLAYER_PREFIX);

  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(admin.email);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Pelada de Quarta" })).toBeVisible();

  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByRole("link", { name: "Jogadores" }).click();

  // 1. Create, with a typed-in password (the generated-password branch is covered
  // by unit-level behaviour; this proves the form and the approval-on-create).
  await page.getByRole("link", { name: "Novo jogador" }).click();
  await page.getByLabel("Nome").fill("Jogador CRUD");
  await page.getByLabel("Apelido").fill("CrudE2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha (opcional)").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Criar jogador" }).click();
  await expect(page.getByText("A conta já está aprovada e pronta para uso.")).toBeVisible();

  await page.getByRole("link", { name: "Voltar para jogadores" }).last().click();
  const card = page.locator('[data-slot="card"]').filter({ hasText: "CrudE2E" });
  await expect(card).toBeVisible();
  // Created directly by an admin, so there is no pending step to clear.
  await expect(page.getByText("Nenhum cadastro esperando aprovação.")).toBeVisible();

  // 2. Edit.
  await card.getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Apelido").fill("CrudEditado");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Jogador atualizado.")).toBeVisible();

  await page.getByRole("link", { name: "Voltar para jogadores" }).click();
  await expect(page.getByText("CrudEditado")).toBeVisible();

  // 3. Inactivate and reactivate.
  const editedCard = page.locator('[data-slot="card"]').filter({ hasText: "CrudEditado" });
  await editedCard.getByRole("button", { name: "Inativar" }).click();
  await expect(page.getByText("CrudEditado inativado.")).toBeVisible();
  await expect(editedCard.getByText("Inativo")).toBeVisible();

  await editedCard.getByRole("button", { name: "Reativar" }).click();
  await expect(page.getByText("CrudEditado reativado.")).toBeVisible();

  // 4. Delete, with the explicit two-step confirmation.
  await editedCard.getByRole("button", { name: "Excluir" }).click();
  await editedCard.getByRole("button", { name: "Sim, excluir" }).click();
  await expect(page.getByText("CrudEditado excluído.")).toBeVisible();
  await expect(page.getByText("CrudEditado")).toHaveCount(0);
});

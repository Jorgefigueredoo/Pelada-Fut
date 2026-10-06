import { expect, test } from "@playwright/test";

import { TEST_PASSWORD, createAdmin, deleteUsersByEmailPrefix, uniqueEmail } from "./helpers";

const PREFIX = "e2e-notif-";

test.afterAll(async () => {
  await deleteUsersByEmailPrefix(PREFIX);
  await deleteUsersByEmailPrefix("e2e-admin-");
});

test("logging out from the header, and a notification arriving for an approved player", async ({
  browser,
}) => {
  const admin = await createAdmin();
  const playerEmail = uniqueEmail(PREFIX);

  // 1. Player signs up, sees no notifications yet (nothing has happened to them).
  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();

  await playerPage.goto("/criar-conta");
  await playerPage.getByLabel("Nome").fill("Jogador Notif");
  await playerPage.getByLabel("Apelido").fill("NotifE2E");
  await playerPage.getByLabel("E-mail").fill(playerEmail);
  await playerPage.getByLabel("Senha").fill(TEST_PASSWORD);
  await playerPage.getByRole("button", { name: "Criar conta" }).click();
  await expect(playerPage.getByRole("heading", { name: "Aguardando aprovação" })).toBeVisible();

  // 2. Admin approves them — this fires the "approved" notification.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto("/entrar");
  await adminPage.getByLabel("E-mail").fill(admin.email);
  await adminPage.getByLabel("Senha").fill(TEST_PASSWORD);
  await adminPage.getByRole("button", { name: "Entrar" }).click();
  await adminPage.waitForURL("http://localhost:3000/");

  await adminPage.getByRole("link", { name: "Admin" }).click();
  await adminPage.getByRole("link", { name: "Jogadores" }).click();
  await adminPage.getByRole("button", { name: "Aprovar" }).first().click();
  await expect(adminPage.getByText("NotifE2E aprovado.")).toBeVisible();

  // 3. The player's signup session is still live (no email confirmation step), and
  // now that they're approved, visiting the app shows the notification with an
  // unread badge, which clears once the bell is opened.
  await playerPage.goto("/");
  await playerPage.waitForURL("http://localhost:3000/");

  const bell = playerPage.getByRole("button", { name: /Notificações/ });
  await expect(bell.getByText("1")).toBeVisible();

  await bell.click();
  await expect(playerPage.getByText("Sua conta foi aprovada")).toBeVisible();

  // Badge clears after opening.
  await playerPage.keyboard.press("Escape");
  await expect(bell.getByText("1")).toHaveCount(0);

  // 4. Logout button in the header works from anywhere in the app.
  await playerPage.getByRole("link", { name: "Perfil" }).click();
  await playerPage.getByRole("button", { name: "Sair" }).click();
  await expect(playerPage).toHaveURL(/\/entrar$/);

  await Promise.all([playerContext.close(), adminContext.close()]);
});

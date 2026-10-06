import { expect, test, type Page } from "@playwright/test";

import {
  TEST_PASSWORD,
  createAdmin,
  createApprovedPlayer,
  deleteE2EGames,
  deleteUsersByEmailPrefix,
} from "./helpers";
import { toDateTimeLocalValue } from "../src/lib/datetime";

const E2E_LOCATION = "Quadra E2E";

test.beforeAll(async () => {
  await deleteE2EGames(E2E_LOCATION);
});

test.afterAll(async () => {
  await deleteE2EGames(E2E_LOCATION);
  await deleteUsersByEmailPrefix("e2e-list-");
  await deleteUsersByEmailPrefix("e2e-admin-");
});

async function signIn(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Pelada de Quarta" })).toBeVisible();
}

test("two slots, three players, and the promotion arrives without a reload", async ({
  browser,
}) => {
  const admin = await createAdmin();
  const one = await createApprovedPlayer("e2e-list-", "Um", "Alberto Um");
  const two = await createApprovedPlayer("e2e-list-", "Dois", "Bruno Dois");
  const three = await createApprovedPlayer("e2e-list-", "Tres", "Carlos Tres");

  // 1. The admin creates the pelada through the form: list already open, two slots.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin.email);

  await adminPage.getByRole("link", { name: "Admin" }).click();
  await adminPage.getByRole("link", { name: "Nova pelada" }).click();

  await adminPage
    .getByLabel("Dia e hora do jogo")
    .fill(toDateTimeLocalValue(new Date(Date.now() + 40 * 60_000).toISOString()));
  await adminPage
    .getByLabel("Abertura da lista")
    .fill(toDateTimeLocalValue(new Date(Date.now() - 10 * 60_000).toISOString()));
  await adminPage.getByLabel("Local").fill(E2E_LOCATION);
  await adminPage.getByLabel("Vagas").fill("2");
  await adminPage.getByRole("button", { name: "Criar pelada" }).click();

  await expect(adminPage.getByText(E2E_LOCATION).first()).toBeVisible();

  // 2. Two players take the two slots.
  const contextOne = await browser.newContext();
  const pageOne = await contextOne.newPage();
  await signIn(pageOne, one.email);
  await expect(pageOne.getByText(E2E_LOCATION)).toBeVisible();
  await expect(pageOne.getByText("Lista aberta")).toBeVisible();

  await pageOne.getByRole("button", { name: "Confirmar presença" }).click();
  await expect(pageOne.getByText("Você está confirmado, nº 1")).toBeVisible();

  const contextTwo = await browser.newContext();
  const pageTwo = await contextTwo.newPage();
  await signIn(pageTwo, two.email);
  await pageTwo.getByRole("button", { name: "Confirmar presença" }).click();
  await expect(pageTwo.getByText("Você está confirmado, nº 2")).toBeVisible();

  // Player one sees player two appear without touching anything.
  await expect(pageOne.getByRole("listitem").filter({ hasText: "Dois" })).toBeVisible({
    timeout: 15_000,
  });

  // 3. The third player goes to the waitlist.
  const contextThree = await browser.newContext();
  const pageThree = await contextThree.newPage();
  await signIn(pageThree, three.email);
  await pageThree.getByRole("button", { name: "Confirmar presença" }).click();
  await expect(pageThree.getByText("Lista de espera, 1º da fila")).toBeVisible();

  // 4. Player one drops out, and the promotion reaches the third player's screen.
  await pageOne.getByRole("button", { name: "Desistir" }).click();
  await pageOne.getByRole("button", { name: "Sim, desistir" }).click();
  await expect(pageOne.getByRole("button", { name: "Confirmar presença" })).toBeVisible();

  await expect(pageThree.getByText("Você subiu da lista de espera")).toBeVisible({
    timeout: 15_000,
  });
  await expect(pageThree.getByText("Você está confirmado, nº 2")).toBeVisible();

  // 5. Coming back puts player one at the end of the queue, not back in the slot.
  await pageOne.getByRole("button", { name: "Confirmar presença" }).click();
  await expect(pageOne.getByText("Lista de espera, 1º da fila")).toBeVisible();

  await Promise.all([
    adminContext.close(),
    contextOne.close(),
    contextTwo.close(),
    contextThree.close(),
  ]);
});

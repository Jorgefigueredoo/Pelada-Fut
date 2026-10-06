import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { createAdmin, TEST_PASSWORD } from "./helpers";

/**
 * Manual only (excluded from `npm run e2e` by the *.manual.spec.ts pattern): this
 * test runs a real `supabase db reset`, wiping the local database, which is too
 * invasive for the routine suite. Run it on its own:
 *   npx playwright test e2e/real-reset-repro.manual.spec.ts
 *
 * It reproduces, exactly, the bug a local db reset can cause while someone is still
 * signed in in their browser: the session's JWT still verifies (same JWT_SECRET
 * before and after the reset), but the profile row behind it is gone. Before the fix
 * in src/proxy.ts, this produced a real ERR_TOO_MANY_REDIRECTS, bouncing between "/"
 * and "/entrar" forever.
 */
test("surviving a real `supabase db reset` while logged in", async ({ page }) => {
  const account = await createAdmin();

  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("http://localhost:3000/");

  console.log(">>> running supabase db reset (this wipes the whole local database)");
  execSync("npx supabase db reset", { cwd: process.cwd(), stdio: "inherit" });
  console.log(">>> db reset done, navigating with the old browser session");

  const response = await page.goto("/entrar", { timeout: 15000 });
  console.log("status after reset:", response?.status(), "url:", page.url());
  expect(response?.status()).toBeLessThan(400);
});

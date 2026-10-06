import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { TEST_PASSWORD, createAdmin, deleteUsersByEmailPrefix } from "./helpers";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * The (auth) layout and the home page share the same "Pelada de Quarta" heading, so
 * waiting for that text is not proof the sign-in redirect actually happened. Waiting
 * for the URL is.
 */
async function signIn(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("http://localhost:3000/");
}

test.afterAll(async () => {
  await deleteUsersByEmailPrefix("e2e-admin-");
});

test("visiting /entrar while already signed in redirects to the home page", async ({
  page,
}) => {
  const account = await createAdmin();
  await signIn(page, account.email);

  // Exercises the proxy's "/entrar" branch for a valid, already-authenticated
  // session: it must redirect once to "/", not bounce back and forth.
  await page.goto("/entrar");
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByText("Nenhuma pelada marcada")).toBeVisible();
});

/**
 * Reproduces the bug a local `supabase db reset` can cause: the browser keeps a
 * session whose JWT still verifies (same JWT_SECRET), but the user row behind it is
 * gone. Before the fix, the proxy bounced it between "/" and "/entrar" forever
 * (ERR_TOO_MANY_REDIRECTS). It must now land cleanly on the sign-in page instead.
 */
test("a session for a deleted account lands on sign-in instead of looping", async ({
  page,
}) => {
  const account = await createAdmin();
  await signIn(page, account.email);

  // The browser keeps its session cookies; only the account disappears underneath it,
  // the same way a local db reset (or, in production, an account deletion whose
  // access token has not expired yet) would.
  await admin().auth.admin.deleteUser(account.id);

  // Any authenticated navigation should recover, not loop.
  const response = await page.goto("/entrar");
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();

  // The session was actually cleared, not just this one response: reloading /
  // goes to sign-in too, instead of bouncing back and forth.
  await page.goto("/");
  await expect(page).toHaveURL(/\/entrar$/);
});

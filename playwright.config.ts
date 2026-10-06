import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

export default defineConfig({
  testDir: "./e2e",
  // *.manual.spec.ts tests do something invasive (e.g. wiping the local database)
  // that a routine `npm run e2e` should never trigger as a side effect. Run them
  // explicitly: npx playwright test e2e/real-reset-repro.manual.spec.ts
  testIgnore: "**/*.manual.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  // The app is used on a phone, so that is what the test drives.
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/entrar",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

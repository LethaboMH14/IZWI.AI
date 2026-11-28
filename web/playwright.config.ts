import { defineConfig } from "@playwright/test";

// Tests use an existing local app backed by a disposable Postgres database. Start the feature-on app on 4300
// and the feature-off app on 4301; never take over the demo/worker ports.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "settings-*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { browserName: "chromium", baseURL: process.env.IZWI_E2E_URL || "http://127.0.0.1:4300" },
});

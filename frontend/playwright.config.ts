import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests â€” target the LIVE standalone server on :3001
 * (start it first with:  .\deploy.ps1 -SkipBuild   or full .\deploy.ps1).
 *
 * Run:            npm run test:e2e
 * Authed flows:   set E2E_USERNAME / E2E_PASSWORD in the environment to enable
 *                 the loginâ†’dashboard spec (otherwise it self-skips).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e-fixture.ts",
  globalTeardown: "./tests/e2e-fixture-teardown.ts",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});

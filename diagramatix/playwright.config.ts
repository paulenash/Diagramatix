import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end (browser) tests — the layer the Vitest suite can't reach: real
 * pointer drags on the SVG canvas + full user journeys through a real browser.
 *
 * The webServer (scripts/e2e-server.cjs) builds + serves the app on :3001 backed
 * by the `diagramatix_test` database, so e2e data never touches the dev DB. The
 * `setup` project seeds the e2e account through the real /api/register endpoint
 * before the smoke specs run. `reuseExistingServer` reuses a server you already
 * started instead of rebuilding.
 *
 * Run: `npm run e2e` (headless) · `npm run e2e:headed` · `npm run e2e:ui`.
 */
const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      // Reuse the session saved by the setup project — specs start authenticated.
      // (auth-smoke.spec overrides this back to an empty session.)
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.cjs",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});

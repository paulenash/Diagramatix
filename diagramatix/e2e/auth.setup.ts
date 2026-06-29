import { test as setup, expect } from "@playwright/test";
import { E2E_USER } from "./_user";

/** Where the authenticated session is saved for the other specs to reuse. */
export const AUTH_FILE = "e2e/.auth/user.json";

/**
 * Seed the e2e account (via the real register endpoint — no app-code import, so
 * no Prisma/ESM in Playwright's runner) and log in once, persisting the session
 * so the editor specs start already authenticated. Runs as a project dependency
 * before everything else, with the server guaranteed up. Idempotent: register is
 * 201 the first time, 409 thereafter.
 */
setup("authenticate", async ({ page, request }) => {
  const reg = await request.post("/api/register", {
    data: { email: E2E_USER.email, name: E2E_USER.name, password: E2E_USER.password },
  });
  expect([201, 409], `register returned ${reg.status()}`).toContain(reg.status());

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(E2E_USER.email);
  await page.locator('input[type="password"]').fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  await page.context().storageState({ path: AUTH_FILE });
});

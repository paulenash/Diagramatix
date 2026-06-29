import { test, expect } from "@playwright/test";
import { E2E_USER } from "./_user";

/**
 * Auth smoke — exercises auth itself, so it runs UNauthenticated (ignores the
 * saved session the other specs reuse): the seeded user logs in through the real
 * form → /dashboard, and an anonymous visitor is bounced off /dashboard → /login.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("auth smoke", () => {
  test("a seeded user can log in and reach the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(E2E_USER.email);
    await page.locator('input[type="password"]').fill(E2E_USER.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("an unauthenticated visitor is kept out of the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

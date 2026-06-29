import { test, expect } from "@playwright/test";
import { E2E_USER } from "./_user";

/**
 * Phase-1 smoke: proves the whole harness works end-to-end — a real browser
 * drives the real app on :3001 against diagramatix_test, the seeded user logs in
 * through the actual credentials form, and an unauthenticated visitor is bounced
 * off the dashboard. Once this is green, the canvas-interaction journeys
 * (drag-create connectors, move-and-reroute, save/reload) can be added.
 */
test.describe("auth smoke", () => {
  test("a seeded user can log in and reach the dashboard", async ({ page }) => {
    await page.goto("/login");
    // Labels aren't htmlFor-associated, so select by input type + the submit role.
    await page.locator('input[type="email"]').fill(E2E_USER.email);
    await page.locator('input[type="password"]').fill(E2E_USER.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("an unauthenticated visitor is kept out of the dashboard", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    // Auth bounces an anonymous visitor back to the login screen.
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

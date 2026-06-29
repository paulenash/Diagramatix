import { test, expect } from "@playwright/test";

/**
 * Editor journeys — runs authenticated (the project's saved storageState). Phase 2
 * foundation: a real browser creates a BPMN diagram through the dashboard and the
 * SVG editor canvas renders, then survives a reload (the diagram persisted). This
 * is the create→edit→persist path every canvas-interaction journey builds on.
 */
test.describe("diagram editor", () => {
  test("create a BPMN diagram → the editor canvas renders", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: /new diagram/i }).click();
    // BPMN is the default type — just name it and submit (Enter creates it).
    const name = `E2E BPMN ${Date.now()}`;
    const nameField = page.getByPlaceholder("My diagram");
    await nameField.fill(name);
    await nameField.press("Enter");

    // Landed on the editor with a live SVG canvas.
    await expect(page).toHaveURL(/\/diagram\//, { timeout: 20_000 });
    await expect(page.locator("svg[data-canvas]")).toBeVisible({ timeout: 15_000 });
  });

  test("a created diagram reopens (persists) on reload", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /new diagram/i }).click();
    const nameField = page.getByPlaceholder("My diagram");
    await nameField.fill(`E2E Persist ${Date.now()}`);
    await nameField.press("Enter");
    await expect(page).toHaveURL(/\/diagram\//, { timeout: 20_000 });
    const url = page.url();

    await page.reload();
    // Same diagram, canvas still renders → it was persisted, not lost.
    expect(page.url()).toBe(url);
    await expect(page.locator("svg[data-canvas]")).toBeVisible({ timeout: 15_000 });
  });
});

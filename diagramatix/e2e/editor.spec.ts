import { test, expect } from "@playwright/test";
import { createBpmnDiagram, openEditor } from "./_helpers";

/**
 * Editor journeys (authenticated via the project's saved storageState). The
 * create→edit→persist path every canvas-interaction journey builds on: the SVG
 * editor canvas renders for a created diagram, and the diagram survives a reload.
 */
test.describe("diagram editor", () => {
  test("the editor renders a created diagram's canvas", async ({ page }) => {
    const id = await createBpmnDiagram(page, "E2E BPMN");
    await openEditor(page, id);
    await expect(page).toHaveURL(new RegExp(`/diagram/${id}`));
  });

  test("a created diagram reopens (persists) on reload", async ({ page }) => {
    const id = await createBpmnDiagram(page, "E2E Persist");
    await openEditor(page, id);

    await page.reload();
    // Same diagram, canvas still renders → it was persisted, not lost.
    expect(page.url()).toContain(`/diagram/${id}`);
    await expect(page.locator("svg[data-canvas]")).toBeVisible({ timeout: 20_000 });
  });
});

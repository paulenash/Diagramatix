import { test, expect } from "@playwright/test";
import { createBpmnDiagram, openEditor, diagramData } from "./_helpers";

/**
 * Canvas pointer-layer journeys (Phase 2b) — the SVG interactions the unit suite
 * can't reach (jsdom has no layout/pointer). Driven by a real drag in a browser;
 * asserted on the PERSISTED diagram data (via the API), which is more robust than
 * SVG-DOM assertions and proves autosave actually saved the change.
 */
const taskCount = (d: { elements?: { type: string }[] }) =>
  (d.elements ?? []).filter((e) => e.type === "task").length;

test.describe("canvas interactions", () => {
  test("drag a Task from the palette onto the canvas → it persists", async ({ page }) => {
    const id = await createBpmnDiagram(page, "E2E Drag");
    await openEditor(page, id);

    await page.locator('[data-testid="palette-item-task"]').dragTo(page.locator("svg[data-canvas]"), {
      targetPosition: { x: 360, y: 240 },
    });

    await expect
      .poll(async () => taskCount(await diagramData(page, id)), {
        timeout: 15_000,
        message: "a task element should be autosaved after the drop",
      })
      .toBeGreaterThan(0);
  });

  // NEXT INCREMENT — element move + connector drag-create + reroute. These need a
  // stable per-element hook (`data-element-id` on the SymbolRenderer wrapper) so a
  // test can read the element's ACTUAL rendered box and drag its centre: fixed
  // coordinates miss because the editor re-fits the view after the first drop.
});

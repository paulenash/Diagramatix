import { test, expect } from "@playwright/test";
import { createBpmnDiagram, openEditor, diagramData } from "./_helpers";

/**
 * Canvas pointer-layer journeys (Phase 2b) — the SVG interactions the unit suite
 * can't reach (jsdom has no layout/pointer). Driven by real drag/pointer in a
 * browser; asserted on the PERSISTED diagram data (via the API), which is more
 * robust than SVG-DOM assertions and proves autosave actually saved the change.
 *
 * Elements carry `data-element-id` (added on the SymbolRenderer root) so a test
 * can locate a specific element and read its REAL rendered box — the editor
 * re-fits the view after a drop, so fixed coordinates can't be assumed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tasks = (d: any) => (d.elements ?? []).filter((e: any) => e.type === "task");

async function dropTask(page: import("@playwright/test").Page, x: number, y: number) {
  await page.locator('[data-testid="palette-item-task"]').dragTo(page.locator("svg[data-canvas]"), {
    targetPosition: { x, y },
  });
}

/** Centre of an element's rendered box, by its diagram id. */
async function centreOf(page: import("@playwright/test").Page, elementId: string) {
  const loc = page.locator(`[data-element-id="${elementId}"]`);
  await expect(loc).toBeVisible();
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

test.describe("canvas interactions", () => {
  test("drag a Task from the palette onto the canvas → it persists", async ({ page }) => {
    const id = await createBpmnDiagram(page, "E2E Drag");
    await openEditor(page, id);

    await dropTask(page, 360, 240);

    await expect
      .poll(async () => tasks(await diagramData(page, id)).length, {
        timeout: 15_000,
        message: "a task element should be autosaved after the drop",
      })
      .toBeGreaterThan(0);
  });

  test("move an element with the pointer → the new position persists", async ({ page }) => {
    const id = await createBpmnDiagram(page, "E2E Move");
    await openEditor(page, id);

    await dropTask(page, 360, 240);
    await expect.poll(async () => tasks(await diagramData(page, id)).length, { timeout: 15_000 }).toBeGreaterThan(0);
    const before = tasks(await diagramData(page, id))[0];

    // Locate the element by id, grab its real centre, and drag it down 160px.
    const c = await centreOf(page, before.id);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y + 160, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = (await diagramData(page, id)).elements.find((e: any) => e.id === before.id);
        return t ? t.y : before.y;
      }, { timeout: 15_000, message: "the moved task's persisted Y should increase" })
      .toBeGreaterThan(before.y + 40);
  });

  test("drag-create a connector between two tasks → it persists", async ({ page }) => {
    const id = await createBpmnDiagram(page, "E2E Connect");
    await openEditor(page, id);

    // Two tasks, left and right.
    await dropTask(page, 250, 240);
    await expect.poll(async () => tasks(await diagramData(page, id)).length, { timeout: 15_000 }).toBeGreaterThan(0);
    await dropTask(page, 560, 240);
    await expect.poll(async () => tasks(await diagramData(page, id)).length, { timeout: 15_000 }).toBeGreaterThan(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ts = tasks(await diagramData(page, id)).sort((a: any, b: any) => a.x - b.x);
    const [left, right] = ts;

    // Select the left task so its connection points appear.
    const cLeft = await centreOf(page, left.id);
    await page.mouse.click(cLeft.x, cLeft.y);
    const boxA = (await page.locator(`[data-element-id="${left.id}"]`).boundingBox())!;

    // Drag from the left task's RIGHT connection point to the right task's centre.
    const cRight = await centreOf(page, right.id);
    await page.mouse.move(boxA.x + boxA.width, boxA.y + boxA.height / 2);
    await page.mouse.down();
    await page.mouse.move(cRight.x, cRight.y, { steps: 15 });
    await page.mouse.up();

    await expect
      .poll(async () => (await diagramData(page, id)).connectors?.length ?? 0, {
        timeout: 15_000,
        message: "a connector should be created + autosaved",
      })
      .toBeGreaterThan(0);
  });
});

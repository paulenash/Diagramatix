import { test, expect, type Page } from "@playwright/test";
import { createDiagramWithData, openEditor, diagramData, boxOf } from "./_helpers";

/**
 * Obstacle avoidance — seed A→B with a third element C between them, nudge an
 * endpoint to force a re-route, and check whether the A→B connector routes AROUND
 * C or cuts through it. Parametrized over C's element TYPE. This is the
 * browser-level probe of the known #13 gap. (File named routing-avoid, not
 * "obstacle", so Playwright's discovery doesn't collide with the vitest file
 * tests/editor/obstacle-sweep.test.ts.)
 */
type Pt = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

function segCrossesBox(p: Pt, q: Pt, b: Box, m = 4): boolean {
  const x0 = b.x + m, x1 = b.x + b.width - m, y0 = b.y + m, y1 = b.y + b.height - m;
  if (x1 <= x0 || y1 <= y0) return false;
  if (Math.abs(p.x - q.x) < 0.5) { const x = p.x, a = Math.min(p.y, q.y), bb = Math.max(p.y, q.y); return x > x0 && x < x1 && bb > y0 && a < y1; }
  if (Math.abs(p.y - q.y) < 0.5) { const y = p.y, a = Math.min(p.x, q.x), bb = Math.max(p.x, q.x); return y > y0 && y < y1 && bb > x0 && a < x1; }
  return false;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function crosses(conn: any, box: Box): boolean {
  const w: Pt[] = conn?.waypoints ?? [];
  for (let i = 1; i < w.length; i++) if (segCrossesBox(w[i - 1], w[i], box)) return true;
  return false;
}

async function nudge(page: Page, id: string, dx: number, dy: number) {
  const b = await boxOf(page, `[data-element-id="${id}"]`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

const OBSTACLES = ["task", "gateway", "intermediate-event", "data-object"];

for (const obs of OBSTACLES) {
  test(`obstacle avoidance: A->B routes around a ${obs} between the endpoints`, async ({ page }) => {
    const data = {
      elements: [
        { id: "a", type: "task", x: 200, y: 240, width: 120, height: 70, label: "A", properties: {} },
        { id: "b", type: "task", x: 760, y: 240, width: 120, height: 70, label: "B", properties: {} },
        { id: "c", type: obs, x: 440, y: 235, width: 90, height: 80, label: "C", properties: {} },
      ],
      connectors: [
        { id: "conn", type: "sequence", sourceId: "a", targetId: "b", sourceSide: "right", targetSide: "left", routingType: "rectilinear", waypoints: [], directionType: "directed" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const id = await createDiagramWithData(page, `E2E Avoid ${obs}`, "bpmn", data);
    await openEditor(page, id);

    await nudge(page, "a", 0, 12); // force A->B to re-route

    const d = await diagramData(page, id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = d.elements.find((e: any) => e.id === "c");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (d.connectors ?? []).find((k: any) => k.id === "conn");
    const didCross = crosses(conn, { x: c.x, y: c.y, width: c.width, height: c.height });
    // eslint-disable-next-line no-console
    console.log(`[AVOID ${obs}] connector ${didCross ? "CROSSES" : "avoids"} C`);

    expect(conn, "the A->B connector should still exist").toBeTruthy();
    expect(didCross, `A->B should route around the ${obs}`).toBe(false);
  });
}

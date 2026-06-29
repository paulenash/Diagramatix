import { test, expect, type Page } from "@playwright/test";
import { createDiagramWithData, openEditor, diagramData, boxOf } from "./_helpers";

/**
 * Move-and-reroute across diagram types — move a connected element and verify its
 * connector follows (re-routes to the element's new position). Seeded via the API
 * (two elements + a connector) so each type's different connector-create UI isn't
 * in the way; the move is a real pointer drag; results read from persisted data.
 *
 * `SET_DATA` doesn't recompute on load, but MOVE_ELEMENT does — so after the drag
 * the connector's waypoints are freshly routed to the moved element.
 */
type Case = { name: string; type: string; elType: string; w: number; h: number; conn: string; routing: string; props?: Record<string, unknown> };

const CASES: Case[] = [
  { name: "BPMN sequence", type: "bpmn", elType: "task", w: 120, h: 70, conn: "sequence", routing: "rectilinear" },
  { name: "Flowchart flowline", type: "flowchart", elType: "flowchart-process", w: 140, h: 60, conn: "flowline", routing: "rectilinear" },
  { name: "ArchiMate serving", type: "archimate", elType: "archimate-shape", w: 140, h: 70, conn: "archi-serving", routing: "direct", props: { shapeKey: "business-business-actor-box" } },
];

function twoConnected(c: Case) {
  const props = c.props ?? {};
  return {
    elements: [
      { id: "a", type: c.elType, x: 220, y: 200, width: c.w, height: c.h, label: "A", properties: { ...props } },
      { id: "b", type: c.elType, x: 700, y: 200, width: c.w, height: c.h, label: "B", properties: { ...props } },
    ],
    connectors: [
      { id: "c", type: c.conn, sourceId: "a", targetId: "b", sourceSide: "right", targetSide: "left", routingType: c.routing, waypoints: [], directionType: "directed" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/** Drag element `id` down by `dy` screen px (grab its real rendered centre). */
async function dragDown(page: Page, id: string, dy: number) {
  const b = await boxOf(page, `[data-element-id="${id}"]`);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + dy, { steps: 12 });
  await page.mouse.up();
}

for (const c of CASES) {
  test(`move-and-reroute: ${c.name} connector follows the moved element`, async ({ page }) => {
    const id = await createDiagramWithData(page, `E2E Reroute ${c.name}`, c.type, twoConnected(c));
    await openEditor(page, id);

    await dragDown(page, "a", 240);

    await expect
      .poll(async () => {
        const d = await diagramData(page, id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = d.elements.find((e: any) => e.id === "a");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conn = (d.connectors ?? []).find((k: any) => k.id === "c");
        if (!a || !conn?.waypoints?.length) return false;
        const movedDown = a.y > 200 + 40; // it actually moved
        const M = 26;
        // some waypoint lands within A's CURRENT (moved) box → the connector followed it
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attaches = conn.waypoints.some((p: any) => p.x >= a.x - M && p.x <= a.x + a.width + M && p.y >= a.y - M && p.y <= a.y + a.height + M);
        return movedDown && attaches;
      }, { timeout: 15_000, message: `${c.name}: A should move down and its connector follow` })
      .toBe(true);
  });
}

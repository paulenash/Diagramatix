import { test, expect, type Page } from "@playwright/test";
import { createDiagramWithData, openEditor, diagramData, boxOf } from "./_helpers";
import issueData from "./fixtures/ep-issue.json";

/**
 * EP boundary-resize drift — LIVE drag reproduction harness.
 *
 * The unit tests (tests/editor/ep-resize.test.ts) proved the reducer's
 * RESIZE_ELEMENT is clean. This drives the FULL live path: grab a real edge
 * resize hit-zone (targeted by data-resize-handle) and drag it with the mouse,
 * so handleResizeDragStart's pointer→rect math (incl. the zoom divide) and every
 * per-move dispatch run exactly as for a user. Two independent drift checks:
 *   1. MID-DRAG (visual): read the EP's rendered box halfway through the drag —
 *      catches a "whole element drifts on the canvas" that snaps back on release.
 *   2. PERSISTED: after release, poll the saved data — catches committed drift.
 * Run against a synthetic EP and the exact reported diagram.
 */
const SYNTH = {
  elements: [
    { id: "ep", type: "subprocess-expanded", x: 140, y: 140, width: 440, height: 300, label: "Main Subprocess", properties: {} },
    { id: "es", type: "start-event", x: 180, y: 280, width: 36, height: 36, label: "Start", parentId: "ep", properties: {} },
    { id: "t1", type: "task", x: 280, y: 265, width: 110, height: 66, label: "Task 1", parentId: "ep", properties: {} },
    { id: "nep", type: "subprocess-expanded", x: 230, y: 350, width: 270, height: 64, label: "Handle Event", parentId: "ep", properties: {} },
    { id: "ee", type: "end-event", x: 510, y: 280, width: 36, height: 36, label: "End", parentId: "ep", properties: {} },
  ],
  connectors: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REPORTED = { elements: (issueData as any).elements, connectors: (issueData as any).connectors ?? [], viewport: { x: 0, y: 0, zoom: 1 } };

const SCENARIOS = [
  { name: "synthetic EP + nested", data: SYNTH, epId: "ep" },
  { name: "reported diagram", data: REPORTED, epId: "yqlnygs5" },
] as const;

type Box = { x: number; y: number; width: number; height: number };
type Pt = { x: number; y: number };
type Edge = "top" | "left" | "right" | "bottom";

const EDGES = {
  left: (b: Box) => b.x,
  right: (b: Box) => b.x + b.width,
  top: (b: Box) => b.y,
  bottom: (b: Box) => b.y + b.height,
} as const;
const fixed: Record<Edge, Edge[]> = {
  top: ["left", "right", "bottom"],
  bottom: ["left", "right", "top"],
  left: ["top", "bottom", "right"],
  right: ["top", "bottom", "left"],
};
const SIDE = { top: "n", bottom: "s", left: "w", right: "e" } as const;
const TOL = 8;          // px — a real "whole-element drift" is tens of px
const SCREEN_TOL = 12;  // screen px tolerance for the mid-drag visual check

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const epOf = (d: any, id: string) => d.elements.find((e: any) => e.id === id) as Box;

/** Drag the EP's edge hit-zone outward; capture the rendered box BEFORE and
 *  HALFWAY through the drag (screen coords) for the mid-drag visual check. */
async function dragEdge(page: Page, epId: string, edge: Edge, delta: number): Promise<{ beforeDom: Box; midDom: Box }> {
  const loc = page.locator(`[data-element-id="${epId}"]`);
  const dom = async (): Promise<Box> => {
    let b = await loc.boundingBox();
    for (let i = 0; i < 12 && !b; i++) { await page.waitForTimeout(80); b = await loc.boundingBox(); }
    if (!b) throw new Error(`no boundingBox for ${epId}`);
    return b;
  };
  // SELECT the EP first (click its top-left body, clear of children + edge
  // zones). When selected, the editor overlays a SECOND set of edge hit-zones
  // (Canvas selectedResizeContainer, above connectors) — the path a user
  // actually drags through.
  const body0 = await dom();
  await page.mouse.click(body0.x + 20, body0.y + 22);
  await page.waitForTimeout(200);
  const h = await boxOf(page, `[data-resize-handle="${epId}-${SIDE[edge]}"]`);
  const beforeDom = await dom();
  const from: Pt = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  const to: Pt = { ...from };
  if (edge === "top") to.y -= delta;
  if (edge === "bottom") to.y += delta;
  if (edge === "left") to.x -= delta;
  if (edge === "right") to.x += delta;
  const mid: Pt = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 8 });
  const midDom = await dom();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  return { beforeDom, midDom };
}

for (const sc of SCENARIOS) {
  for (const edge of ["top", "left", "right"] as Edge[]) {
    test(`${sc.name}: ${edge}-edge live drag — only that edge moves`, async ({ page }) => {
      const id = await createDiagramWithData(page, `E2E EP ${sc.name} ${edge}`, "bpmn", sc.data);
      await openEditor(page, id);
      const before = epOf(await diagramData(page, id), sc.epId);

      const { beforeDom, midDom } = await dragEdge(page, sc.epId, edge, 80);

      // 1. MID-DRAG visual drift: the fixed edges must hold their screen position.
      for (const f of fixed[edge]) {
        expect(
          Math.abs(EDGES[f](midDom) - EDGES[f](beforeDom)),
          `${sc.name}/${edge}: MID-DRAG ${f} edge drifted on screen by ${Math.round(EDGES[f](midDom) - EDGES[f](beforeDom))}px`,
        ).toBeLessThan(SCREEN_TOL);
      }

      // 2. PERSISTED drift: wait for save, then the dragged edge moved and the
      //    other three stayed put.
      let after = before;
      await expect
        .poll(async () => {
          after = epOf(await diagramData(page, id), sc.epId);
          return Math.abs(EDGES[edge](after) - EDGES[edge](before));
        }, { timeout: 12_000, message: `${edge} edge should move after the drag` })
        .toBeGreaterThan(10);
      for (const f of fixed[edge]) {
        expect(
          Math.abs(EDGES[f](after) - EDGES[f](before)),
          `${sc.name}/${edge}: PERSISTED ${f} edge drifted: ${Math.round(EDGES[f](before))} → ${Math.round(EDGES[f](after))}`,
        ).toBeLessThan(TOL);
      }
    });
  }
}

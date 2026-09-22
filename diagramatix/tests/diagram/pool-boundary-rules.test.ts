/**
 * T4627–T4631 — Paul's three rules for a pool boundary, 21 September 2026.
 *
 *   1. "Pool dissociation from its lanes when moving the Pool boundary up
 *       further than the minimum lane size is still a serious issue."
 *   2. "In addition Pool boundary moves should never move elements up. They
 *       should just be prevented from moving when the boundary hits anything
 *       in the pool or lane."
 *   3. "When surrounding elements manually with a Pool or when adding Lanes
 *       and Sublanes to a Pool with elements inside make sure there is always
 *       a gap of at least 1/2 event width between the left edge of the
 *       left-most element (normally a Start Event) and the right-hand edge of
 *       the new Pool, Lane or Sublane."
 *
 * Rules 1 and 2 are the same bug seen from two sides. A lane's minimum height
 * covered its LABEL and not its contents, so an inward drag squeezed the lane
 * past the process inside it; `clampChildrenToLane` then pushed the elements
 * along ahead of the edge (rule 2), and once a lane refused to shrink any
 * further the pool carried on without it (rule 1). The fix caps the drag at
 * the content — the edge comes to rest and nothing underneath moves — and
 * asserts "a pool is its lane stack" on the containment pass every path that
 * writes a pool height already ends with, because three separate reports from
 * three different gestures said the defect was never in any one of them.
 *
 * The fixture is Paul's own export (Block 2 Test 3), reduced to the three
 * elements that matter and re-based with the pool top at 0.
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import { clampRectToContent, poolFollowsLanes, leftGapShortfall, MIN_LEFT_GAP } from "@/app/lib/diagram/poolLaneBounds";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

/** Pool 0..585 · Lane 1 (with the process in it) over Lane 2. */
const world = (): DiagramData => ({
  elements: [
    E({ id: "p", type: "pool", label: "Pool 1", x: 100, y: 0, width: 900, height: 585, properties: {} }),
    E({ id: "L1", type: "lane", label: "Lane 1", x: 136, y: 0, width: 864, height: 518, parentId: "p", properties: {} }),
    E({ id: "L2", type: "lane", label: "Lane 2", x: 136, y: 518, width: 864, height: 67, parentId: "p", properties: {} }),
    E({ id: "s", type: "start-event", label: "Start", x: 300, y: 320, width: 36, height: 36, parentId: "L1", properties: {} }),
    E({ id: "t1", type: "task", label: "Receive order", x: 380, y: 310, width: 102, height: 65, parentId: "L1", properties: {} }),
    E({ id: "t2", type: "task", label: "Do nothing", x: 700, y: 430, width: 102, height: 65, parentId: "L1", properties: {} }),
  ],
  connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

/** Drag one pool edge, tick by tick, the way Canvas does: absolute rects
 *  measured from the geometry at the START of the drag, not from the last
 *  clamped result. */
function dragPool(
  state: DiagramData,
  edge: "top" | "bottom" | "left" | "right",
  step: number,
  ticks: number,
): DiagramData {
  const s0 = at(state, "p");
  const start = { x: s0.x, y: s0.y, width: s0.width, height: s0.height };
  let cur = state;
  for (let k = 1; k <= ticks; k++) {
    const d = step * k;
    const rect =
      edge === "top"    ? { x: start.x, y: start.y + d, width: start.width, height: start.height - d }
      : edge === "bottom" ? { x: start.x, y: start.y, width: start.width, height: start.height - d }
      : edge === "left"   ? { x: start.x + d, y: start.y, width: start.width - d, height: start.height }
      :                     { x: start.x, y: start.y, width: start.width - d, height: start.height };
    cur = reducer(cur, { type: "RESIZE_ELEMENT", payload: { id: "p", ...rect } } as never) as DiagramData;
  }
  return cur;
}

const lanesOf = (d: DiagramData) => d.elements.filter((e) => e.parentId === "p").sort((a, b) => a.y - b.y);

describe("T4627 — a pool boundary stops at the content; it never pushes it", () => {
  it("the top edge comes to rest half an event above the first element", () => {
    const before = world();
    const after = dragPool(before, "top", 40, 20);   // far past any minimum
    const p = at(after, "p");
    const contentTop = Math.min(...["s", "t1", "t2"].map((id) => at(after, id).y));
    expect(p.y).toBeCloseTo(contentTop - MIN_LEFT_GAP, 5);
  });

  it("not one element moves, however hard the edge is pushed", () => {
    const before = world();
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      const after = dragPool(world(), edge, 40, 20);
      for (const id of ["s", "t1", "t2"]) {
        const b = at(before, id), a = at(after, id);
        expect([a.x, a.y], `${edge} drag moved ${id}`).toEqual([b.x, b.y]);
      }
    }
  });

  it("stops the right edge at the last element too", () => {
    const after = dragPool(world(), "right", 40, 20);
    const p = at(after, "p");
    const contentRight = Math.max(...["s", "t1", "t2"].map((id) => at(after, id).x + at(after, id).width));
    expect(p.x + p.width).toBeCloseTo(contentRight + MIN_LEFT_GAP, 5);
  });

  it("an empty pool has nothing to stop at, and still shrinks", () => {
    const empty = {
      ...world(),
      elements: world().elements.filter((e) => ["p", "L1", "L2"].includes(e.id)),
    } as DiagramData;
    const after = dragPool(empty, "top", 40, 3);
    expect(at(after, "p").y).toBeGreaterThan(0);
  });
});

describe("T4628 — a pool is exactly its lane stack", () => {
  it("holds through a long drag on either edge", () => {
    for (const edge of ["top", "bottom"] as const) {
      for (const ticks of [1, 3, 6, 12, 20]) {
        const after = dragPool(world(), edge, 40, ticks);
        const p = at(after, "p");
        const ls = lanesOf(after);
        expect(Math.min(...ls.map((l) => l.y)), `${edge} ×${ticks}`).toBeCloseTo(p.y, 5);
        expect(Math.max(...ls.map((l) => l.y + l.height)), `${edge} ×${ticks}`).toBeCloseTo(p.y + p.height, 5);
      }
    }
  });

  it("is repaired wherever it was broken — the exact geometry Paul exported", () => {
    // His Block 2 Test 3 export: pool 552.14 tall, lanes totalling 584.86, so
    // the bottom lane hung 32.7px out of the pool. Whatever wrote that, the
    // containment pass now puts it right.
    const broken = [
      E({ id: "p", type: "pool", label: "Pool 1", x: 185, y: -126, width: 871, height: 552.1428571428572, properties: {} }),
      E({ id: "L1", type: "lane", label: "Lane 1", x: 221, y: -126, width: 835, height: 517.8571428571429, parentId: "p", properties: {} }),
      E({ id: "L2", type: "lane", label: "Lane 2", x: 221, y: 391.8571428571429, width: 835, height: 67, parentId: "p", properties: {} }),
    ];
    const fixed = poolFollowsLanes(broken);
    const p = fixed.find((e) => e.id === "p")!;
    expect(p.y).toBeCloseTo(-126, 5);
    expect(p.y + p.height).toBeCloseTo(458.8571428571429, 5);
  });

  it("leaves a lane-less pool's height alone", () => {
    const solo = [E({ id: "p", type: "pool", label: "Customer", x: 0, y: 0, width: 400, height: 90, properties: {} })];
    expect(poolFollowsLanes(solo)).toBe(solo);       // same array — no work done
  });
});

describe("T4629 — half an event's clear space in front of the first element", () => {
  /** Gap between a container's header strip and the leftmost thing inside. */
  const gapIn = (d: DiagramData, containerId: string, headerW: number) => {
    const c = at(d, containerId);
    const kids = d.elements.filter((e) => e.parentId === containerId && e.type !== "lane" && e.type !== "sublane");
    return Math.min(...kids.map((k) => k.x)) - (c.x + headerW);
  };

  it("survives adding a lane to a pool that has elements in it", () => {
    // A pool drawn around loose elements leaves 40px; the new lane's own 36px
    // header eats nearly all of it, which is the case Paul hit.
    const tight = {
      ...world(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 264, y: 0, width: 700, height: 200, properties: {} }),
        E({ id: "s", type: "start-event", label: "Start", x: 340, y: 60, width: 36, height: 36, parentId: "p", properties: {} }),
      ],
    } as DiagramData;
    const after = reducer(tight, { type: "ADD_LANE", payload: { poolId: "p" } } as never) as DiagramData;
    const lane = after.elements.find((e) => e.type === "lane")!;
    const kids = after.elements.filter((e) => e.type === "start-event");
    expect(Math.min(...kids.map((k) => k.x)) - (lane.x + 36)).toBeGreaterThanOrEqual(MIN_LEFT_GAP);
    // Revised 2026-09-22 — "Adding lanes to a Pool should not grow the Pool.
    // The lanes must be added within the Pool." The room is made by moving
    // the element right; the pool does not move or grow.
    expect(at(after, "p").x).toBe(264);
    expect(at(after, "p").width).toBe(700);
    expect(kids[0].x).toBeGreaterThan(340);
  });

  it("does nothing when the gap is already there", () => {
    const roomy = {
      ...world(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 700, height: 200, properties: {} }),
        E({ id: "s", type: "start-event", label: "Start", x: 400, y: 60, width: 36, height: 36, parentId: "p", properties: {} }),
      ],
    } as DiagramData;
    const after = reducer(roomy, { type: "ADD_LANE", payload: { poolId: "p" } } as never) as DiagramData;
    expect(at(after, "p").x).toBe(0);
    void gapIn;
  });

  it("measures the shortfall from the header's right edge", () => {
    expect(leftGapShortfall(0, 36, 100)).toBe(0);       // 64px of clear space
    expect(leftGapShortfall(0, 36, 54)).toBe(0);        // exactly 18 — enough
    expect(leftGapShortfall(0, 36, 50)).toBe(4);        // 14 short by 4
    expect(leftGapShortfall(0, 36, null)).toBe(0);      // nothing inside
  });
});

describe("T4630 — the clamp is inward-only", () => {
  const content = { x: 100, y: 100, width: 100, height: 100 };
  const before = { x: 0, y: 0, width: 400, height: 400 };

  it("lets an edge move AWAY from the content without limit", () => {
    const out = clampRectToContent(before, { x: -500, y: -500, width: 1400, height: 1400 }, content);
    expect(out).toEqual({ x: -500, y: -500, width: 1400, height: 1400 });
  });

  it("caps each edge independently, so a legal axis still moves", () => {
    // Top dragged past the content (illegal), left dragged but still clear.
    const out = clampRectToContent(before, { x: 50, y: 150, width: 350, height: 250 }, content);
    expect(out.x).toBe(50);                 // allowed: 100-8 = 92 is further in
    expect(out.y).toBe(92);                 // capped at content.y - pad
  });

  it("does not yank an already-overlapping container back out", () => {
    // A pool that already overlaps its content (import, older diagram) keeps
    // its edge — it just may not go any further in.
    const over = { x: 150, y: 150, width: 400, height: 400 };
    const same = clampRectToContent(over, { x: 160, y: 160, width: 390, height: 390 }, content);
    expect(same.x).toBe(150);
    expect(same.y).toBe(150);
    const away = clampRectToContent(over, { x: 120, y: 120, width: 430, height: 430 }, content);
    expect(away.x).toBe(120);
  });

  it("is a no-op for an empty container", () => {
    const raw = { x: 380, y: 380, width: 20, height: 20 };
    expect(clampRectToContent(before, raw, null)).toBe(raw);
  });
});

describe("T4631 — the stop is stable", () => {
  it("dragging further after the stop changes nothing at all", () => {
    const a = dragPool(world(), "top", 40, 12);
    const b = dragPool(world(), "top", 40, 30);
    expect(at(b, "p").y).toBeCloseTo(at(a, "p").y, 5);
    expect(at(b, "p").height).toBeCloseTo(at(a, "p").height, 5);
    expect(lanesOf(b).map((l) => l.height)).toEqual(lanesOf(a).map((l) => l.height));
  });
});

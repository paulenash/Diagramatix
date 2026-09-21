/**
 * T4632–T4634 — moving a pool's LEFT boundary, and what may move with it.
 *
 * Paul, 21 September 2026:
 *
 *   "I need to now reintroduce the ability to move the left-hand Pool
 *    boundary left and right. Make sure ONLY the Pool, Lanes and Sublanes
 *    boundaries are affected by the move. Nothing else must be affected at
 *    all."
 *
 *   "Also don't let sublanes be vertically minimised past their header width.
 *    Currently they can be narrowed so the name of the Sublanes overshoots
 *    the Sublane horizontal boundaries."
 *
 * He kept the white-box LOCKSTEP (asked, 2026-09-21): dragging one white-box
 * pool's left or right edge still moves every other white-box pool's matching
 * edge the same way, so the pools stay aligned as a stack. What was wrong was
 * what came along for the ride.
 *
 * THREE THINGS USED TO MOVE THAT SHOULD NOT HAVE.
 *
 *  1. The lockstep cascade translated every DESCENDANT of the other pools by
 *     the same delta — so nudging one pool's left edge in by 74px slid every
 *     task in every other pool 74px right. The lockstep is about EDGES.
 *
 *  2. The content stop measured one lane header (72px for a pool + lane) when
 *     a pool-lane-sublane stack spends 108. The sublane header crossed the
 *     start event, `clampChildrenToLane` pushed it right, and the content the
 *     stop is measured against moved with it — so the "stopped" boundary crept
 *     18px a tick for as long as the drag lasted. A stop that moves is not a
 *     stop.
 *
 *  3. Once the other pools' contents stopped travelling, their boundaries
 *     could be driven through them instead. The drag now stops at the first
 *     content ANY locked pool meets, which keeps the alignment the lockstep
 *     exists for AND the stop rule (T4627).
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import { clampRectToLimits } from "@/app/lib/diagram/poolLaneBounds";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

/**
 * Two white-box pools. Pool 1 is a three-level stack (pool → lane → sublane)
 * holding a start event at x=300; Pool 2 holds a task at x=600, so the two
 * pools' contents stop the drag at different places.
 */
const world = (): DiagramData => ({
  elements: [
    E({ id: "p", type: "pool", label: "Pool 1", x: 100, y: 0, width: 900, height: 300, properties: { poolType: "white-box" } }),
    E({ id: "L1", type: "lane", label: "Lane 1", x: 136, y: 0, width: 864, height: 200, parentId: "p", properties: {} }),
    E({ id: "L2", type: "lane", label: "Lane 2", x: 136, y: 200, width: 864, height: 100, parentId: "p", properties: {} }),
    E({ id: "SL", type: "lane", label: "Sub A", x: 172, y: 0, width: 828, height: 200, parentId: "L1", properties: {} }),
    E({ id: "s", type: "start-event", label: "Start", x: 300, y: 60, width: 36, height: 36, parentId: "SL", properties: {} }),
    E({ id: "q", type: "pool", label: "Pool 2", x: 100, y: 400, width: 900, height: 120, properties: { poolType: "white-box" } }),
    E({ id: "Q1", type: "lane", label: "Lane Q", x: 136, y: 400, width: 864, height: 120, parentId: "q", properties: {} }),
    E({ id: "t", type: "task", label: "Ship", x: 600, y: 430, width: 102, height: 65, parentId: "Q1", properties: {} }),
  ],
  connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;
const CONTAINERS = ["p", "L1", "L2", "SL", "q", "Q1"];
const CONTENT = ["s", "t"];

/** Drag the LEFT edge, tick by tick, from the geometry at drag start —
 *  which is how Canvas dispatches it. `+` moves the edge right (inward). */
function dragLeftEdge(state: DiagramData, step: number, ticks: number): DiagramData {
  const s0 = at(state, "p");
  const start = { x: s0.x, y: s0.y, width: s0.width, height: s0.height };
  let cur = state;
  for (let k = 1; k <= ticks; k++) {
    const d = step * k;
    cur = reducer(cur, {
      type: "RESIZE_ELEMENT",
      payload: { id: "p", x: start.x + d, y: start.y, width: start.width - d, height: start.height, wasWhiteBoxAtResizeStart: true },
    } as never) as DiagramData;
  }
  return cur;
}

describe("T4632 — the left boundary moves, in both directions", () => {
  it("moves OUT without limit, taking its lanes and sublanes with it", () => {
    const after = dragLeftEdge(world(), -40, 4);
    expect(at(after, "p").x).toBe(-60);
    expect(at(after, "p").width).toBe(1060);
    // Every level follows by the same 160, keeping the header strips nested.
    expect(at(after, "L1").x).toBe(-24);
    expect(at(after, "L2").x).toBe(-24);
    expect(at(after, "SL").x).toBe(12);
  });

  it("moves IN until it meets something, then stops dead", () => {
    const a = dragLeftEdge(world(), 40, 6);
    const b = dragLeftEdge(world(), 40, 20);
    // 300 (the start event) − 18 (half an event) − 108 (three header strips).
    expect(at(a, "p").x).toBe(174);
    expect(at(b, "p").x, "and dragging further changes nothing").toBe(174);
    expect(at(b, "SL").x + 36, "the sublane header clears the event by 18").toBe(300 - 18);
  });
});

describe("T4633 — only boundaries move", () => {
  it("leaves every element exactly where it was, in EVERY pool", () => {
    const before = world();
    for (const step of [40, -40, 13, -7]) {
      const after = dragLeftEdge(world(), step, 20);
      for (const id of CONTENT) {
        expect([at(after, id).x, at(after, id).y], `step ${step} moved ${id}`)
          .toEqual([at(before, id).x, at(before, id).y]);
      }
    }
  });

  it("keeps the lockstep — the other pool's edge follows", () => {
    const after = dragLeftEdge(world(), 40, 2);
    expect(at(after, "q").x).toBe(at(after, "p").x);
    expect(at(after, "Q1").x).toBe(at(after, "L1").x);
  });

  it("stops at the FIRST content any locked pool meets", () => {
    // Pool 1's event is at 300 and Pool 2's task at 600, so Pool 1 decides.
    // Without the shared stop, Pool 2's edge would have been free to keep
    // going and the two would have come apart.
    const after = dragLeftEdge(world(), 40, 20);
    expect(at(after, "q").x, "still aligned at the stop").toBe(at(after, "p").x);
    expect(at(after, "p").x).toBe(174);
  });

  it("a pool whose own content is nearer stops the whole gesture", () => {
    // Move Pool 2's task LEFT of Pool 1's event: now Pool 2 sets the limit.
    const s = world();
    (s.elements as DiagramElement[]).forEach((e) => { if (e.id === "t") e.x = 260; });
    const after = dragLeftEdge(s, 40, 20);
    // 260 − 18 − 72 (Pool 2 is only two levels deep: pool + lane).
    expect(at(after, "q").x).toBe(170);
    expect(at(after, "p").x, "the dragged pool stops there too").toBe(170);
  });

  it("changes nothing at all about the containers' vertical geometry", () => {
    const before = world();
    const after = dragLeftEdge(world(), 40, 20);
    for (const id of CONTAINERS) {
      expect([at(after, id).y, at(after, id).height], `${id} changed vertically`)
        .toEqual([at(before, id).y, at(before, id).height]);
    }
  });
});

describe("T4634 — a sub-lane is never shorter than its own name", () => {
  const poolWithLane = (laneH: number): DiagramData => ({
    elements: [
      E({ id: "p", type: "pool", label: "Warehouse", x: 0, y: 0, width: 800, height: laneH, properties: {} }),
      E({ id: "L", type: "lane", label: "Shipping", x: 36, y: 0, width: 764, height: laneH, parentId: "p", properties: {} }),
    ],
    connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as DiagramData;

  const splitInto = (laneH: number, labels: string[]) =>
    reducer(poolWithLane(laneH), { type: "SPLIT_LANE_EVEN", payload: { laneId: "L", labels } } as never) as DiagramData;

  it("gives a long name the height its rotated text needs", () => {
    // The name runs DOWN the header strip, so its length is spent on height.
    // "International Deliveries" is 24 characters: at 14px that is 217px, far
    // past the old flat 28px floor that let it run out of its own band.
    const r = splitInto(200, ["Domestic", "International Deliveries"]);
    const subs = r.elements.filter((e) => e.parentId === "L").sort((a, b) => a.y - b.y);
    const long = subs.find((s) => s.label === "International Deliveries")!;
    expect(long.height).toBeGreaterThanOrEqual(Math.ceil(24 * 14 * 0.6 + 16));
  });

  it("never lets one band's name overshoot its own band", () => {
    const labels = ["A", "Picking and Packing", "Quality Assurance Review", "Zz"];
    const r = splitInto(120, labels);
    const subs = r.elements.filter((e) => e.parentId === "L");
    for (const s of subs) {
      const needed = Math.max(40, Math.ceil((s.label ?? "").length * 14 * 0.6 + 16));
      expect(s.height, `"${s.label}" needs ${needed}`).toBeGreaterThanOrEqual(needed);
    }
  });

  it("grows the lane to hold them rather than squeezing one flat", () => {
    const r = splitInto(60, ["Domestic", "International Deliveries"]);
    const L = r.elements.find((e) => e.id === "L")!;
    const subs = r.elements.filter((e) => e.parentId === "L");
    expect(subs.reduce((s, x) => s + x.height, 0), "the bands tile the lane exactly").toBe(L.height);
    expect(L.height).toBeGreaterThan(60);
    // …and the pool came with it, as T4628 requires.
    const p = r.elements.find((e) => e.id === "p")!;
    expect(p.y + p.height).toBe(L.y + L.height);
  });

  it("shares the surplus, not the minimums", () => {
    // A roomy lane still gives every band its minimum FIRST and splits what
    // is left — so a long name is never funded out of a short one's floor.
    const r = splitInto(600, ["A", "International Deliveries"]);
    const subs = r.elements.filter((e) => e.parentId === "L").sort((a, b) => a.y - b.y);
    expect(subs.reduce((s, x) => s + x.height, 0)).toBe(600);
    expect(Math.min(...subs.map((s) => s.height))).toBeGreaterThanOrEqual(40);
  });
});

describe("T4635 — the shared clamp", () => {
  it("applies only the limits it is given", () => {
    const before = { x: 0, y: 0, width: 100, height: 100 };
    const raw = { x: 40, y: 40, width: 20, height: 20 };
    expect(clampRectToLimits(before, raw, {}), "no limits, no clamping").toEqual(raw);
    expect(clampRectToLimits(before, raw, { maxLeft: 10 }).x).toBe(10);
    expect(clampRectToLimits(before, raw, { maxLeft: 10 }).y, "the y axis is untouched").toBe(40);
  });
});

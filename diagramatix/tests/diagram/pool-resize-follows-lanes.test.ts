/**
 * T4625-T4626 — a pool boundary cannot outrun its lanes.
 *
 * Paul diagnosed this one himself, 21 September 2026, after three reports I
 * could not reproduce from the voice commands:
 *
 *   "when I move the Pool, with lanes, boundary upwards and the boundary of
 *    the Lane stops at any element, whereas the Pool boundary keeps moving and
 *    is dissociated with the Lanes at that point"
 *
 * and, the same thing from the other end: "if you reduce the bottom Lane to
 * its minimum size within a Pool, and then try to move the Pool boundary
 * upwards the same issue occurs". It happens with manually added lanes too —
 * which is what ruled out every voice path I had been probing.
 *
 * THE CAUSE. Each lane is clamped on resize — `Math.max(40, min, …)`, where
 * `min` covers its own label and its contents — but the pool was then written
 * with the RAW drag. So the instant a lane refused to shrink any further, the
 * pool carried on alone and the lanes hung out of the bottom of it.
 *
 * THE RULE. A pool with lanes has no height of its own: it is exactly the
 * stack. So the lanes are computed first, clamps and all, and the pool is
 * derived from what they came to.
 *
 * A SECOND DEFECT fell out of it. The height clamp raised `newH` without
 * moving `newY`, so a top-edge drag pushed the BOTTOM edge down — and the
 * top/bottom test then read the gesture as "both edges moved" and fell into
 * the pro-rata branch, resizing every lane instead of the one grabbed.
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";

const lane = (id: string, label: string, y: number, h: number): DiagramElement =>
  ({ id, type: "lane", label, x: 36, y, width: 764, height: h, parentId: "p", properties: {} }) as unknown as DiagramElement;

/** A pool 0..300 with three 100px lanes. */
const world = (): DiagramData => ({
  elements: [
    ({ id: "p", type: "pool", label: "Warehouse", x: 0, y: 0, width: 800, height: 300, properties: {} }) as unknown as DiagramElement,
    lane("L1", "Sales", 0, 100), lane("L2", "Picking", 100, 100), lane("L3", "Shipping", 200, 100),
  ],
  connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

const resize = (y: number, height: number) =>
  reducer(world(), { type: "RESIZE_ELEMENT", payload: { id: "p", x: 0, y, width: 800, height } } as never);

const geom = (r: DiagramData) => {
  const p = r.elements.find((e) => e.id === "p")!;
  const lanes = r.elements.filter((e) => e.parentId === "p").sort((a, b) => a.y - b.y);
  return {
    poolTop: p.y, poolBottom: p.y + p.height,
    lanesTop: Math.min(...lanes.map((l) => l.y)),
    lanesBottom: Math.max(...lanes.map((l) => l.y + l.height)),
    heights: lanes.map((l) => l.height),
  };
};

describe("T4625 — the pool stops where the lanes stop", () => {
  it("never leaves a gap, however far the TOP edge is dragged", () => {
    // The defect: past the first lane's minimum the pool kept shrinking and
    // the lanes hung out of it.
    for (const dy of [10, 30, 50, 100, 200, 400, 1000]) {
      const g = geom(resize(dy, 300 - dy));
      expect(g.lanesTop, `top drag ${dy}`).toBe(g.poolTop);
      expect(g.lanesBottom, `top drag ${dy}`).toBe(g.poolBottom);
    }
  });

  it("never leaves a gap, however far the BOTTOM edge is dragged", () => {
    for (const dh of [-10, -50, -100, -200, -1000, 80, 400]) {
      const g = geom(resize(0, 300 + dh));
      expect(g.lanesTop, `bottom drag ${dh}`).toBe(g.poolTop);
      expect(g.lanesBottom, `bottom drag ${dh}`).toBe(g.poolBottom);
    }
  });

  it("comes to rest — dragging further changes nothing", () => {
    // Once the lanes are at their minimum the pool is at its minimum, and it
    // must stay put rather than creeping.
    const a = geom(resize(200, 100));
    const b = geom(resize(400, -100));
    expect([a.poolTop, a.poolBottom]).toEqual([b.poolTop, b.poolBottom]);
  });
});

describe("T4626 — the edge you did not drag stays put", () => {
  it("pins the BOTTOM when the top edge is dragged", () => {
    // The clamp used to raise the height without moving y, so the bottom edge
    // slid down on a gesture that never touched it.
    for (const dy of [30, 50, 100, 400]) {
      expect(geom(resize(dy, 300 - dy)).poolBottom, `top drag ${dy}`).toBe(300);
    }
  });

  it("pins the TOP when the bottom edge is dragged", () => {
    for (const dh of [-50, -200, 80]) {
      expect(geom(resize(0, 300 + dh)).poolTop, `bottom drag ${dh}`).toBe(0);
    }
  });

  it("resizes only the lane that was grabbed", () => {
    // Misreading a top-edge drag as "both edges moved" sent it down the
    // pro-rata branch, which resized ALL THREE lanes.
    const top = geom(resize(30, 270));
    expect(top.heights.slice(1), "the lanes below the first are untouched").toEqual([100, 100]);
    const bottom = geom(resize(0, 250));
    expect(bottom.heights.slice(0, 2), "the lanes above the last are untouched").toEqual([100, 100]);
  });

  it("still grows freely — the clamp is a floor, not a cage", () => {
    const g = geom(resize(0, 380));
    expect(g.poolBottom).toBe(380);
    expect(g.heights[2], "the bottom lane takes the extra").toBe(180);
  });
});

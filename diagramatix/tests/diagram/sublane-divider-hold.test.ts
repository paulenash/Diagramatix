/**
 * T4640–T4643 — dragging a lane boundary moves that boundary and nothing else.
 *
 * Paul, 21 September 2026:
 *
 *   "When moving the top or bottom boundary of a Lane with 2 or more sublanes
 *    the boundary moves ok but the middle sublane dividers also move. This
 *    does not happen with Lanes within a Pool. Only the boundary should move."
 *
 * He had caught the two levels of the same idea disagreeing with each other.
 * A pool resize picks ONE lane to absorb the change — the top lane for a
 * top-edge drag, the bottom lane for a bottom-edge drag — and leaves every
 * other lane untouched. `MOVE_LANE_BOUNDARY` spread the change PROPORTIONALLY
 * across the sublanes instead, so dragging one divider moved all of them.
 *
 * A stack must always fill its container exactly — that is what a swimlane is
 * — so the change has to go somewhere. It goes to the band at the edge that
 * moved: ABOVE's bottom edge is the one being dragged, so its LAST sublane
 * absorbs; BELOW's top edge moved, so its FIRST one does. Every other divider
 * keeps its position, and a band that did not change size carries its own
 * sublanes along rather than being re-fitted (which was a second way for the
 * dividers to move).
 *
 * The clamp moved with it. It used to ask whether the LANE had 40px to spare;
 * it now asks the band that is actually giving way, so the drag stops when
 * that band reaches its own floor instead of passing the shortfall inward.
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import { absorbAtEdge, shrinkRoom, stackFrom, type Band } from "@/app/lib/diagram/laneBands";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

/** Pool → Lane A (three sublanes) over Lane B (two sublanes). */
const world = (): DiagramData => ({
  elements: [
    E({ id: "p", type: "pool", label: "Warehouse", x: 0, y: 0, width: 800, height: 600, properties: {} }),
    E({ id: "A", type: "lane", label: "Sales", x: 36, y: 0, width: 764, height: 360, parentId: "p", properties: {} }),
    E({ id: "A1", type: "lane", label: "One", x: 72, y: 0, width: 728, height: 120, parentId: "A", properties: {} }),
    E({ id: "A2", type: "lane", label: "Two", x: 72, y: 120, width: 728, height: 120, parentId: "A", properties: {} }),
    E({ id: "A3", type: "lane", label: "Three", x: 72, y: 240, width: 728, height: 120, parentId: "A", properties: {} }),
    E({ id: "B", type: "lane", label: "Ship", x: 36, y: 360, width: 764, height: 240, parentId: "p", properties: {} }),
    E({ id: "B1", type: "lane", label: "Air", x: 72, y: 360, width: 728, height: 120, parentId: "B", properties: {} }),
    E({ id: "B2", type: "lane", label: "Sea", x: 72, y: 480, width: 728, height: 120, parentId: "B", properties: {} }),
  ],
  connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

const drag = (dy: number) =>
  reducer(world(), { type: "MOVE_LANE_BOUNDARY", payload: { aboveLaneId: "A", belowLaneId: "B", dy } } as never) as DiagramData;

const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;
const span = (d: DiagramData, id: string) => [at(d, id).y, at(d, id).y + at(d, id).height];

describe("T4640 — only the dragged boundary moves", () => {
  it("leaves every other divider exactly where it was", () => {
    const before = world();
    // A1/A2 are above the absorbing band in the top lane; B2 is below it in
    // the bottom lane. None of their edges is the one being dragged.
    for (const dy of [40, -40, 5, -5, 200, -200, 1000, -1000]) {
      const after = drag(dy);
      for (const id of ["A1", "A2", "B2"]) {
        expect(span(after, id), `dy ${dy} moved ${id}`).toEqual(span(before, id));
      }
    }
  });

  it("gives the whole change to the band at the edge that moved", () => {
    const after = drag(40);
    // A's bottom edge moved → its LAST sublane absorbs.
    expect(span(after, "A3")).toEqual([240, 400]);
    // B's top edge moved → its FIRST sublane absorbs.
    expect(span(after, "B1")).toEqual([400, 480]);
  });

  it("keeps each stack filling its lane exactly", () => {
    for (const dy of [40, -40, 200, -200, 1000, -1000]) {
      const r = drag(dy);
      for (const [lane, kids] of [["A", ["A1", "A2", "A3"]], ["B", ["B1", "B2"]]] as const) {
        const L = at(r, lane);
        const tops = kids.map((k) => at(r, k).y);
        const bottoms = kids.map((k) => at(r, k).y + at(r, k).height);
        expect(Math.min(...tops), `dy ${dy} ${lane} top`).toBe(L.y);
        expect(Math.max(...bottoms), `dy ${dy} ${lane} bottom`).toBe(L.y + L.height);
      }
    }
  });

  it("moves the two lanes' shared edge and no other lane edge", () => {
    const after = drag(40);
    expect(span(after, "A")).toEqual([0, 400]);
    expect(span(after, "B")).toEqual([400, 600]);
    expect(span(after, "p"), "the pool is unchanged").toEqual([0, 600]);
  });
});

describe("T4641 — the drag stops at the band that is giving way", () => {
  it("stops when the absorbing sublane reaches its own label floor", () => {
    // Down: B1 "Air" floors at 42 (3 chars at 14px). Up: A3 "Three" at 58.
    const far = drag(1000);
    expect(at(far, "B1").height).toBe(42);
    const back = drag(-1000);
    expect(at(back, "A3").height).toBe(58);
  });

  it("comes to rest — dragging further changes nothing", () => {
    expect(span(drag(1000), "A")).toEqual(span(drag(200), "A"));
    expect(span(drag(-1000), "A")).toEqual(span(drag(-200), "A"));
  });

  it("asks the BAND, not the lane", () => {
    // The old clamp asked whether the LANE had 40px spare — B is 240 tall, so
    // it would have allowed a 200px drag and then squeezed B1 to 40, moving
    // B2's divider to make up the difference.
    const r = drag(200);
    expect(at(r, "B1").height).toBe(42);
    expect(span(r, "B2"), "B2 stayed put").toEqual([480, 600]);
  });
});

describe("T4642 — the band arithmetic", () => {
  const bands: Band[] = [{ height: 100, min: 40 }, { height: 80, min: 40 }, { height: 60, min: 40 }];

  it("gives the delta to one end and leaves the rest alone", () => {
    expect(absorbAtEdge(bands, 30, "last")).toEqual([100, 80, 90]);
    expect(absorbAtEdge(bands, 30, "first")).toEqual([130, 80, 60]);
    expect(absorbAtEdge(bands, -30, "last")).toEqual([100, 80, 30].map((h, i) => i === 2 ? 40 : h));
  });

  it("floors the absorbing band at its own minimum", () => {
    expect(absorbAtEdge(bands, -1000, "first")[0]).toBe(40);
    expect(absorbAtEdge(bands, -1000, "last")[2]).toBe(40);
  });

  it("reports the room the edge band has", () => {
    expect(shrinkRoom({ height: 240, min: 40, bands }, "first")).toBe(60);
    expect(shrinkRoom({ height: 240, min: 40, bands }, "last")).toBe(20);
    // No bands → the container answers for itself.
    expect(shrinkRoom({ height: 100, min: 40 }, "first")).toBe(60);
    // Already past its floor → no room, and none demanded back.
    expect(shrinkRoom({ height: 30, min: 40, bands: [{ height: 30, min: 40 }] }, "first")).toBe(0);
  });

  it("looks all the way down, not at the sum", () => {
    // The room of a stack is the room of its EDGE band, recursively — summing
    // every band's minimum over-states it by whatever the untouched bands are
    // holding, and the drag then runs two pixels past the real floor.
    const nested = {
      height: 120, min: 58,
      bands: [
        { height: 60, min: 58 },                                  // untouched
        { height: 60, min: 50, bands: [{ height: 60, min: 50 }] }, // the edge
      ],
    };
    expect(shrinkRoom(nested, "last")).toBe(10);          // 60 − 50
    expect(nested.height - (58 + 50), "the sum would have said 12").toBe(12);
  });

  it("stacks tight, with no gaps to close", () => {
    expect(stackFrom(200, [100, 80, 60])).toEqual([200, 300, 380]);
    expect(stackFrom(0, [])).toEqual([]);
  });
});

describe("T4643 — deeper nesting obeys the same edge", () => {
  const deep = (): DiagramData => {
    const w = world();
    (w.elements as DiagramElement[]).push(
      // Two sub-sublanes inside A3, the band that absorbs a downward drag.
      E({ id: "A3a", type: "lane", label: "Alpha", x: 108, y: 240, width: 692, height: 60, parentId: "A3", properties: {} }),
      E({ id: "A3b", type: "lane", label: "Beta", x: 108, y: 300, width: 692, height: 60, parentId: "A3", properties: {} }),
    );
    return w;
  };
  const dragDeep = (dy: number) =>
    reducer(deep(), { type: "MOVE_LANE_BOUNDARY", payload: { aboveLaneId: "A", belowLaneId: "B", dy } } as never) as DiagramData;

  it("does not tidy up a band it was not asked to touch", () => {
    // A band that is NOT absorbing keeps its size, so it travels with its own
    // sublanes rather than being re-fitted. The difference only shows on a
    // stack that is already inconsistent — here A1's inner band sits below
    // the height its name needs. Re-fitting would "correct" it and move a
    // divider the user never touched, three levels away from their mouse.
    const w = world();
    (w.elements as DiagramElement[]).push(
      E({ id: "A1a", type: "lane", label: "Home", x: 108, y: 0, width: 692, height: 100, parentId: "A1", properties: {} }),
      E({ id: "A1b", type: "lane", label: "International", x: 108, y: 100, width: 692, height: 20, parentId: "A1", properties: {} }),
    );
    const r = reducer(w, { type: "MOVE_LANE_BOUNDARY", payload: { aboveLaneId: "A", belowLaneId: "B", dy: 40 } } as never) as DiagramData;
    expect(span(r, "A1a"), "an untouched band was re-fitted").toEqual([0, 100]);
    expect(span(r, "A1b"), "and its sub-band was stretched to its label")
      .toEqual([100, 120]);
    expect(at(r, "A1").height, "A1 itself never moved").toBe(120);
  });

  it("passes the change to the same edge all the way down", () => {
    const r = dragDeep(40);
    // A3 grew by 40; inside it, the LAST band takes that 40 and the first
    // keeps its height — so the divider between them does not move.
    expect(span(r, "A3a"), "the inner divider moved").toEqual([240, 300]);
    expect(span(r, "A3b")).toEqual([300, 400]);
  });

  it("stops on the floor of the DEEPEST band that must give way", () => {
    // A shrinking drag has to come out of A3, and out of A3b inside it.
    // "Beta" floors at 50 and A3b is 60, so the whole gesture has 10px of
    // room — not the 40 asked for, and not the 12 a sum of the minimums
    // would have allowed (which overflowed the lane by 2).
    const r = dragDeep(-40);
    expect(span(r, "A"), "the lane stops 10px up").toEqual([0, 350]);
    expect(span(r, "A3a"), "the inner divider held").toEqual([240, 300]);
    expect(span(r, "A3b"), "only the absorbing inner band changed").toEqual([300, 350]);
    // …and the inner stack still fills A3 exactly.
    expect(at(r, "A3").y + at(r, "A3").height).toBe(350);
  });
});

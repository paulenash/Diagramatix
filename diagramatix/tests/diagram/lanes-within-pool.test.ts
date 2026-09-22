/**
 * T4685–T4689 — lanes and sublanes are added within the pool; it never grows.
 *
 * Paul, 2026-09-22: "Adding lanes to a Pool should not grow the Pool. The
 * lanes must be added within the Pool." — and, of the leftward growth: "This
 * was added to fix another problem recently. Revisit."
 *
 * The other problem was his rule of 2026-09-21: "make sure there is always a
 * gap of at least 1/2 event width between the left edge of the left-most
 * element (normally a Start Event) and the right-hand edge of the new Pool,
 * Lane or Sublane." It was met by growing the pool and its lanes leftwards.
 * Both rules now hold together: the pool stays exactly where it is, and the
 * CONTENT moves right to make the gap.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reducer } from "@/app/hooks/useDiagram";
import { MIN_LEFT_GAP } from "@/app/lib/diagram/poolLaneBounds";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;
const run = (d: DiagramData, type: string, payload: Record<string, unknown>) =>
  reducer(d, { type, payload } as never) as DiagramData;

/** A pool drawn tight around a start event and a task, flow between them. */
const loose = (poolWidth = 700): DiagramData => ({
  elements: [
    E({ id: "p", type: "pool", label: "Pool 1", x: 264, y: 0, width: poolWidth, height: 200, properties: {} }),
    E({ id: "s", type: "start-event", label: "Start", x: 304, y: 80, width: 36, height: 36, parentId: "p", properties: {} }),
    E({ id: "t", type: "task", label: "Review", x: 400, y: 66, width: 100, height: 64, parentId: "p", properties: {} }),
  ],
  connectors: [{
    id: "c", type: "sequence", sourceId: "s", targetId: "t", sourceSide: "right", targetSide: "left",
    directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false,
    waypoints: [{ x: 340, y: 98 }, { x: 400, y: 98 }],
  }],
  viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

/** The same, already in one lane whose header sits tight against the start. */
const laned = (): DiagramData => {
  const d = loose();
  return {
    ...d,
    elements: [
      d.elements[0],
      E({ id: "L", type: "lane", label: "Lane 1", x: 300, y: 0, width: 664, height: 200, parentId: "p", properties: {} }),
      { ...d.elements[1], x: 358, parentId: "L" } as DiagramElement,
      { ...d.elements[2], x: 440, parentId: "L" } as DiagramElement,
    ],
    connectors: [{ ...d.connectors[0], waypoints: [{ x: 394, y: 98 }, { x: 440, y: 98 }] }],
  } as DiagramData;
};

/** Clear space between the deepest header and the leftmost element. */
function gap(d: DiagramData): number {
  const lanes = d.elements.filter((e) => e.type === "lane");
  const headerRight = Math.max(at(d, "p").x + 36, ...lanes.map((l) => l.x + 36));
  return Math.min(at(d, "s").x, at(d, "t").x) - headerRight;
}

const CASES: Array<[string, () => DiagramData, string, Record<string, unknown>]> = [
  ["first lane", loose, "ADD_LANE", { poolId: "p" }],
  ["another lane", laned, "ADD_LANE", { poolId: "p" }],
  ["lane below", laned, "ADD_LANE_AT", { poolId: "p", position: "below", refLaneId: "L", label: "Two" }],
  ["N lanes", loose, "SPLIT_POOL_EVEN", { poolId: "p", labels: ["A", "B"] }],
  ["sublanes", laned, "ADD_SUBLANE", { laneId: "L" }],
  ["N sublanes", laned, "SPLIT_LANE_EVEN", { laneId: "L", labels: ["A", "B"] }],
];

describe("T4685 — adding lanes or sublanes never moves or widens the pool", () => {
  for (const [name, make, type, payload] of CASES) {
    it(`${name} (${type})`, () => {
      const before = make();
      const after = run(before, type, payload);
      const lanesIn = (d: DiagramData) => d.elements.filter((e) => e.type === "lane").length;
      expect(lanesIn(after), "a lane was actually added").toBeGreaterThan(lanesIn(before));
      expect(at(after, "p").x, "pool left edge").toBe(at(before, "p").x);
      expect(at(after, "p").width, "pool width").toBe(at(before, "p").width);
      expect(at(after, "p").y, "pool top").toBe(at(before, "p").y);
      expect(at(after, "p").height, "pool height").toBe(at(before, "p").height);
      // Every lane stays inside the pool.
      const p = at(after, "p");
      for (const l of after.elements.filter((e) => e.type === "lane")) {
        expect(l.x, `${l.label} left`).toBeGreaterThanOrEqual(p.x);
        expect(l.x + l.width, `${l.label} right`).toBeLessThanOrEqual(p.x + p.width + 0.001);
      }
      // …and the half-event gap still holds — made by the content moving.
      expect(gap(after)).toBeGreaterThanOrEqual(MIN_LEFT_GAP - 0.001);
    });
  }
});

describe("T4686 — the content moves as one, connectors with it", () => {
  it("elements and the flow between them shift by the same amount", () => {
    const before = loose();
    const after = run(before, "ADD_LANE", { poolId: "p" });
    const dx = at(after, "s").x - at(before, "s").x;
    expect(dx).toBeGreaterThan(0);
    expect(at(after, "t").x - at(before, "t").x).toBe(dx);
    expect(at(after, "s").y).toBe(at(before, "s").y);
    // The flow is re-derived by the lane pass, so pin where it runs rather than
    // its exact points: between the two shapes at their NEW positions.
    const c = after.connectors.find((k) => k.id === "c")!;
    const xs = c.waypoints.map((w) => w.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(at(after, "s").x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(at(after, "t").x + at(after, "t").width);
  });

  it("does nothing when the gap is already there", () => {
    const roomy = loose();
    roomy.elements = roomy.elements.map((e) => (e.id === "s" ? { ...e, x: 400 } : e.id === "t" ? { ...e, x: 480 } : e));
    const after = run(roomy, "ADD_LANE", { poolId: "p" });
    expect(at(after, "s").x).toBe(400);
    expect(at(after, "t").x).toBe(480);
  });
});

describe("T4687 — with no room on the right, the content stops at the pool's edge", () => {
  it("moves only as far as there is room and never past the right boundary", () => {
    // Pool ends 6px after the task: the 14px+ shortfall can't all be made.
    const before = loose(242);
    const after = run(before, "ADD_LANE", { poolId: "p" });
    const p = at(after, "p");
    expect(p.x).toBe(264);
    expect(p.width).toBe(242);
    const t = at(after, "t");
    expect(t.x + t.width).toBeLessThanOrEqual(p.x + p.width);
    expect(t.x - at(before, "t").x).toBe(6);
  });

  it("the reducer no longer has a path that widens a pool for the gap", () => {
    const src = readFileSync("app/hooks/useDiagram.ts", "utf8");
    expect(src).not.toMatch(/ensureLeftGap/);
    const body = src.slice(src.indexOf("function withLeftGap("), src.indexOf("function getBounds(el: DiagramElement)"));
    expect(body).toContain('type: "MOVE_ELEMENTS"');
    expect(body).not.toMatch(/width:\s*e\.width\s*\+/);
  });
});

/** Three lanes, a task in each, room below every task. */
const threeLanes = (): DiagramData => ({
  elements: [
    E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 600, properties: {} }),
    E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 200, parentId: "p", properties: {} }),
    E({ id: "B", type: "lane", label: "B", x: 36, y: 200, width: 764, height: 200, parentId: "p", properties: {} }),
    E({ id: "C", type: "lane", label: "C", x: 36, y: 400, width: 764, height: 200, parentId: "p", properties: {} }),
    E({ id: "ta", type: "task", label: "Ta", x: 200, y: 30, width: 100, height: 60, parentId: "A", properties: {} }),
    E({ id: "tb", type: "task", label: "Tb", x: 200, y: 230, width: 100, height: 60, parentId: "B", properties: {} }),
    E({ id: "tc", type: "task", label: "Tc", x: 200, y: 430, width: 100, height: 60, parentId: "C", properties: {} }),
  ],
  connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

const drop = (y: number) => ({ symbolType: "pool", position: { x: 400, y } });
const stackOf = (d: DiagramData, parentId: string) =>
  d.elements.filter((e) => e.type === "lane" && e.parentId === parentId).sort((a, b) => a.y - b.y);

describe("T4688 — every drop zone adds its band within the pool", () => {
  const ZONES: Array<[string, number]> = [["pool top", 5], ["pool bottom", 595], ["separator", 200], ["inside a lane", 350]];
  for (const [name, y] of ZONES) {
    it(`${name}: pool unchanged, lanes still tile it, every task keeps its lane`, () => {
      const before = threeLanes();
      const after = run(before, "ADD_ELEMENT", drop(y));
      const lanes = stackOf(after, "p");
      expect(lanes.length).toBe(4);
      expect(at(after, "p")).toMatchObject({ x: 0, y: 0, width: 800, height: 600 });
      // Tight, in order, filling the pool exactly.
      for (let i = 1; i < lanes.length; i++) expect(lanes[i].y).toBe(lanes[i - 1].y + lanes[i - 1].height);
      expect(lanes[0].y).toBe(0);
      expect(lanes[3].y + lanes[3].height).toBe(600);
      // Carved from EMPTY space: no task changed lane, and each is still
      // wholly inside it (a crowded edge slides the task into its lane's own
      // free space rather than covering it).
      for (const t of ["ta", "tb", "tc"]) {
        const task = at(after, t);
        expect(task.parentId, t).toBe(at(before, t).parentId);
        const lane = at(after, task.parentId!);
        expect(task.y, t).toBeGreaterThanOrEqual(lane.y);
        expect(task.y + task.height, t).toBeLessThanOrEqual(lane.y + lane.height);
        expect(task.x, t).toBe(at(before, t).x);
      }
    });
  }

  it("a sublane dropped into a lane that has sublanes stays within that lane", () => {
    // B is 300 tall here: B1 100 over B2 200 — room for a labelled sublane.
    const before = threeLanes();
    before.elements = before.elements.map((e) =>
      e.id === "B" ? { ...e, height: 300 }
      : e.id === "C" ? { ...e, y: 500, height: 100 }
      : e.id === "tc" ? { ...e, y: 520 }
      : e.id === "tb" ? { ...e, parentId: "B1" }
      : e);
    before.elements.push(
      E({ id: "B1", type: "lane", label: "B1", x: 72, y: 200, width: 728, height: 100, parentId: "B", properties: {} }),
      E({ id: "B2", type: "lane", label: "B2", x: 72, y: 300, width: 728, height: 200, parentId: "B", properties: {} }),
    );
    const after = run(before, "ADD_ELEMENT", drop(480));        // lower third of the last sublane
    expect(stackOf(after, "B").length).toBe(3);
    expect(at(after, "B")).toMatchObject({ y: 200, height: 300 });
    expect(at(after, "p").height).toBe(600);
    const subs = stackOf(after, "B");
    expect(subs[2].y + subs[2].height).toBe(500);
  });
});

describe("T4689 — with no room, nothing is added and nothing grows", () => {
  it("a lane too full to give up a band refuses", () => {
    const tight = {
      ...loose(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 120, properties: {} }),
        E({ id: "L", type: "lane", label: "Lane 1", x: 36, y: 0, width: 764, height: 60, parentId: "p", properties: {} }),
        E({ id: "M", type: "lane", label: "Lane 2", x: 36, y: 60, width: 764, height: 60, parentId: "p", properties: {} }),
      ],
      connectors: [],
    } as DiagramData;
    const after = run(tight, "ADD_LANE", { poolId: "p" });
    expect(stackOf(after, "p").length).toBe(2);
    expect(at(after, "p").height).toBe(120);
  });

  it("a lane its process fills is halved, and the element is left where it is", () => {
    // Revised 2026-09-23. Paul: "If this is not possible just divide the Pool
    // in two and let the user resolve the lane divider issue if some elements
    // now straddle two lanes." Refusing was the old rule; it made a drop do
    // nothing on exactly the pool a person is most likely to be reorganising.
    const packed = threeLanes();
    packed.elements = packed.elements.map((e) => (e.id === "tc" ? { ...e, y: 430, height: 140 } : e));
    const after = run(packed, "ADD_ELEMENT", drop(595));       // pool bottom → carve from C
    expect(stackOf(after, "p").length, "a lane was added").toBe(4);
    expect(at(after, "p").height, "and the pool did not grow").toBe(600);
    expect(at(after, "tc").y, "the process is not moved to make room").toBe(430);
    // C was 400..600 with the task at 430..570; halving puts the divider at
    // 500, so the task straddles it — visible, and the user's to settle.
    const bands = stackOf(after, "p");
    expect(bands.map((b) => b.height).reduce((a, b) => a + b, 0)).toBe(600);
  });

  it("the drop no longer draws a coloured insertion line", () => {
    const canvas = readFileSync("app/components/canvas/Canvas.tsx", "utf8");
    expect(canvas).not.toMatch(/poolDropPreview/);
    expect(canvas).not.toMatch(/#a855f7/);
  });

  it("no lane-adding path grows the pool any more", () => {
    const src = readFileSync("app/hooks/useDiagram.ts", "utf8");
    for (const kase of ['case "ADD_SUBLANE"', 'case "ADD_LANE_AT"']) {
      const a = src.indexOf(kase);
      const body = src.slice(a, src.indexOf("\n    case ", a + 10));
      expect(body, kase).toContain("carveBandWithin(");
      expect(body, kase).not.toMatch(/height: e\.height \+/);
    }
    const drop = src.slice(src.indexOf("// Case B: pool with lanes"), src.indexOf("// ── Vertical swimlane drop intercept"));
    expect(drop).not.toMatch(/height: e\.height \+ NEW_(SUB)?LANE_H/);
  });
});

describe("T4701 — empty space first, halve second, refuse only on the name", () => {
  /** A pool of two lanes: the top one full of task, the bottom one empty. */
  const lopsided = (): DiagramData => ({
    elements: [
      E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 400, properties: {} }),
      E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 200, parentId: "p", properties: {} }),
      E({ id: "B", type: "lane", label: "B", x: 36, y: 200, width: 764, height: 200, parentId: "p", properties: {} }),
      E({ id: "t", type: "task", label: "T", x: 200, y: 10, width: 100, height: 180, parentId: "A", properties: {} }),
    ],
    connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as DiagramData;

  it("a lane asked for at the crowded end is placed at the empty one instead", () => {
    // Paul, 2026-09-23: "always add the new lane by trying to locate it at the
    // top or the bottom where there are no existing elements, if possible."
    const before = lopsided();
    const after = run(before, "ADD_ELEMENT", drop(5));   // the pool TOP, which is full
    const bands = stackOf(after, "p");
    expect(bands.length).toBe(3);
    expect(at(after, "t").y, "the task is not moved").toBe(10);
    // A is left whole, and the new band comes out of the empty B.
    expect(at(after, "A")).toMatchObject({ y: 0, height: 200 });
    expect(bands[bands.length - 1].y + bands[bands.length - 1].height).toBe(400);
  });

  it("with no empty space anywhere, the neighbour is halved", () => {
    const full = lopsided();
    full.elements = [...full.elements, E({ id: "t2", type: "task", label: "T2", x: 200, y: 210, width: 100, height: 180, parentId: "B", properties: {} })];
    const after = run(full, "ADD_ELEMENT", drop(5));
    expect(stackOf(after, "p").length, "added anyway — the divider is the user's to move").toBe(3);
    expect(at(after, "t").y, "and nothing was shifted to make room").toBe(10);
    expect(at(after, "t2").y).toBe(210);
    expect(at(after, "p").height).toBe(400);
  });

  it("the sublane level follows the same rule", () => {
    // B is 300 tall here (B1 100 over B2 200): a sublane named "Sublane 3"
    // needs ~92px down its header, and a 100px band could not give that — the
    // one refusal the rule keeps.
    const withSubs = {
      ...lopsided(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 500, properties: {} }),
        E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 200, parentId: "p", properties: {} }),
        E({ id: "B", type: "lane", label: "B", x: 36, y: 200, width: 764, height: 300, parentId: "p", properties: {} }),
        E({ id: "B1", type: "lane", label: "B1", x: 72, y: 200, width: 728, height: 100, parentId: "B", properties: {} }),
        E({ id: "B2", type: "lane", label: "B2", x: 72, y: 300, width: 728, height: 200, parentId: "B", properties: {} }),
        E({ id: "t", type: "task", label: "T", x: 200, y: 10, width: 100, height: 180, parentId: "A", properties: {} }),
      ],
    } as DiagramData;
    const after = run(withSubs, "ADD_ELEMENT", drop(460));   // lower third of B2, clear of the pool-bottom zone
    expect(stackOf(after, "B").length).toBe(3);
    expect(at(after, "B"), "the lane itself keeps its size").toMatchObject({ y: 200, height: 300 });
    expect(at(after, "p").height, "and so does the pool").toBe(500);
  });
});

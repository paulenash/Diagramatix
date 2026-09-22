/**
 * T4692–T4694 — the ghost shows what the drop will do, because it IS what the
 * drop will do.
 *
 * Paul, 2026-09-23: "When adding Lanes, sublanes etc. I want the user to have
 * some feedback about what would happen if they stop the Pool/Lane symbol
 * drag. How about as the drag moves inside the Pool a ghostly image of the new
 * Lane or Sublanes appears inside the Pool to show what would happen so the
 * user can move the cursor further down or up to get either another Lane or 2
 * sublanes within the current lane. If no new lane or sublane is going to be
 * created, then the Pool boundary should turn red to indicate nothing will
 * happen on release."
 *
 * The preview and the action are ONE decision — `planLaneDrop` — so these
 * tests mostly compare the plan with what the reducer then produces. A ghost
 * worked out separately would drift the first time either side was touched.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reducer } from "@/app/hooks/useDiagram";
import { planLaneDrop, samePlan, type LaneDropPlan } from "@/app/lib/diagram/laneDropPlan";
import { laneMetrics } from "@/app/lib/diagram/containerMetrics";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const src = (p: string) => readFileSync(p, "utf8");
const LANE_FS = 14;

/** A pool with two lanes, a task in each, room to spare. */
const world = (): DiagramData => ({
  elements: [
    E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 600, properties: {} }),
    E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 300, parentId: "p", properties: {} }),
    E({ id: "B", type: "lane", label: "B", x: 36, y: 300, width: 764, height: 300, parentId: "p", properties: {} }),
    E({ id: "ta", type: "task", label: "Ta", x: 200, y: 30, width: 100, height: 60, parentId: "A", properties: {} }),
    E({ id: "tb", type: "task", label: "Tb", x: 200, y: 330, width: 100, height: 60, parentId: "B", properties: {} }),
  ],
  connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

const drop = (d: DiagramData, y: number, x = 400) =>
  reducer(d, { type: "ADD_ELEMENT", payload: { symbolType: "pool", position: { x, y } } } as never) as DiagramData;
const plan = (d: DiagramData, y: number, x = 400) => planLaneDrop(d.elements, { x, y }, LANE_FS);
const lanesOf = (d: DiagramData, parentId: string) =>
  d.elements.filter((e) => e.type === "lane" && e.parentId === parentId).sort((a, b) => a.y - b.y);
const rectOf = (e: DiagramElement) => ({ x: e.x, y: e.y, width: e.width, height: e.height });

describe("T4692 — the ghosted band is the band that appears", () => {
  const CASES: Array<[string, number, LaneDropPlan["kind"]]> = [
    ["pool top", 5, "band"],
    ["pool bottom", 595, "band"],
    ["a lane divider", 300, "band"],
    ["the middle of a lane", 150, "split"],
    ["an empty pool", 300, "first-lane"],
  ];
  for (const [name, y, kind] of CASES) {
    it(`${name} → ${kind}, drawn exactly where it lands`, () => {
      const before = name === "an empty pool"
        ? ({ ...world(), elements: [world().elements[0]] } as DiagramData)
        : world();
      const p = plan(before, y);
      expect(p.kind).toBe(kind);
      const after = drop(before, y);

      // Checked against the RESULT, not against the plan: the reducer applies
      // the plan, so a plan that lied would otherwise agree with itself.
      const pool = after.elements.find((e) => e.id === "p")!;
      const stack = lanesOf(after, "p");
      expect(stack[0].y, "the stack starts at the pool top").toBe(pool.y);
      for (let i = 1; i < stack.length; i++) {
        expect(stack[i].y, "tight, no gap or overlap").toBe(stack[i - 1].y + stack[i - 1].height);
      }
      expect(stack[stack.length - 1].y + stack[stack.length - 1].height).toBe(pool.y + pool.height);
      for (const band of after.elements.filter((e) => e.type === "lane")) {
        expect(band.height, `${band.label} fits its own name`)
          .toBeGreaterThanOrEqual(laneMetrics(band.label ?? "", LANE_FS).minHeight);
      }
      // Every task still inside the lane it belongs to.
      for (const t of after.elements.filter((e) => e.type === "task")) {
        const lane = after.elements.find((e) => e.id === t.parentId);
        if (!lane || lane.type !== "lane") continue;
        expect(t.y, t.label).toBeGreaterThanOrEqual(lane.y);
        expect(t.y + t.height, t.label).toBeLessThanOrEqual(lane.y + lane.height);
      }

      if (p.kind === "split") {
        const subs = lanesOf(after, p.laneId);
        expect(subs.map(rectOf)).toEqual(p.rects);
        expect(subs.map((s) => s.label)).toEqual(p.labels);
      } else if (p.kind === "band") {
        const added = lanesOf(after, p.carve.parentId).find(
          (l) => !before.elements.some((e) => e.id === l.id));
        expect(added, "the plan promised a band").toBeTruthy();
        expect(rectOf(added!)).toEqual(p.carve.rect);
        expect(added!.label).toBe(p.carve.label);
      } else if (p.kind === "first-lane") {
        const added = lanesOf(after, p.poolId!);
        expect(added.map(rectOf)).toEqual([p.rect]);
        expect(added[0].label).toBe(p.label);
      }
    });
  }
});

describe("T4693 — 'nothing will happen' is the truth, and it is shown in red", () => {
  /** A pool whose lanes are both too full to give up a labelled band. */
  const packed = (): DiagramData => ({
    ...world(),
    elements: [
      E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 200, properties: {} }),
      E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 100, parentId: "p", properties: {} }),
      E({ id: "B", type: "lane", label: "B", x: 36, y: 100, width: 764, height: 100, parentId: "p", properties: {} }),
      E({ id: "ta", type: "task", label: "Ta", x: 200, y: 10, width: 100, height: 80, parentId: "A", properties: {} }),
      E({ id: "tb", type: "task", label: "Tb", x: 200, y: 110, width: 100, height: 80, parentId: "B", properties: {} }),
    ],
  }) as DiagramData;

  it("a plan of 'none' names the pool, and the drop really does nothing", () => {
    const before = packed();
    const p = plan(before, 5);
    expect(p.kind).toBe("none");
    expect(p.poolId, "the red outline needs to know which pool").toBe("p");
    const after = drop(before, 5);
    expect(after.elements.length).toBe(before.elements.length);
    expect(after.elements.filter((e) => e.type === "lane").length).toBe(2);
  });

  it("a lane too short to split in two says so instead of ghosting a split", () => {
    const p = plan(packed(), 50);                    // middle third of a 100px lane
    expect(p.kind).toBe("none");
  });

  it("a band that could not fit its own name is never promised", () => {
    // Two empty 120px lanes: half of one is 60, and "Lane 3" needs 66 down a
    // vertical header. Room is not the constraint here — the NAME is.
    const narrow = {
      ...world(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 240, properties: {} }),
        E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 120, parentId: "p", properties: {} }),
        E({ id: "B", type: "lane", label: "B", x: 36, y: 120, width: 764, height: 120, parentId: "p", properties: {} }),
      ],
    } as DiagramData;
    expect(laneMetrics("Lane 3", LANE_FS).minHeight).toBeGreaterThan(60);
    expect(plan(narrow, 5).kind, "60px is not enough for its name").toBe("none");
    const after = drop(narrow, 5);
    expect(after.elements.filter((e) => e.type === "lane").length).toBe(2);
  });

  it("outside every pool there is no pool to redden — that drop makes a POOL", () => {
    const before = world();
    const p = plan(before, 900, 2000);
    expect(p).toEqual({ kind: "none", poolId: null });
    const after = drop(before, 900, 2000);
    expect(after.elements.filter((e) => e.type === "pool").length, "a new pool, as always").toBe(2);
  });

  it("the canvas draws the pool's boundary red for a blocked plan, and the band otherwise", () => {
    const canvas = src("app/components/canvas/Canvas.tsx");
    expect(canvas).toContain('planLaneDrop(data.elements, wp, data.laneFontSize ?? 14)');
    expect(canvas).toContain('data-lane-drop="blocked"');
    expect(canvas, "the blocked outline is red").toContain('stroke="#dc2626"');
    expect(canvas).toContain('data-lane-drop="ghost"');
    // The ghost is drawn from the plan's own rectangles, not re-derived.
    expect(canvas).toContain("laneDropPlan.carve.rect");
    expect(canvas).toContain("laneDropPlan.rects");
  });
});

describe("T4694 — one decision, drawn or done", () => {
  it("the reducer applies the plan rather than deciding again", () => {
    const s = src("app/hooks/useDiagram.ts");
    const branch = s.slice(s.indexOf("// ── Pool/Lane drop intercept"), s.indexOf("// ── Vertical swimlane drop intercept"));
    expect(branch).toContain("planLaneDrop(state.elements, action.payload.position, laneFs)");
    expect(branch).toContain("applyCarve(state, plan.carve)");
    // The zone arithmetic lives in the planner alone.
    expect(branch).not.toMatch(/TOP_BOTTOM_THRESHOLD|SEPARATOR_THRESHOLD|height \/ 3/);
  });

  it("samePlan keeps the ghost still while the answer has not changed", () => {
    const d = world();
    expect(samePlan(plan(d, 5), plan(d, 8)), "both add a lane at the pool top").toBe(true);
    expect(samePlan(plan(d, 5), plan(d, 150)), "top vs a split").toBe(false);
    expect(samePlan(null, plan(d, 5))).toBe(false);
    expect(samePlan(null, null)).toBe(true);
    const outside = plan(d, 900, 2000);
    expect(samePlan(outside, plan(d, 950, 2100)), "nothing either way").toBe(true);
  });
});

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
import { movedBandIds, movedBands, planLaneDrop, previewBands, samePlan, type LaneDropPlan } from "@/app/lib/diagram/laneDropPlan";
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
    // The ONLY refusal left (Paul, 2026-09-23: "Only reject adding at any level
    // if the new lane/sublane etc. has not enough space for the name in its
    // header region"). Two 60px lanes whose own names need 40 apiece can spare
    // 20px between them; "Lane 3" needs 66 down a vertical header.
    const narrow = {
      ...world(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 120, properties: {} }),
        E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 60, parentId: "p", properties: {} }),
        E({ id: "B", type: "lane", label: "B", x: 36, y: 60, width: 764, height: 60, parentId: "p", properties: {} }),
      ],
    } as DiagramData;
    expect(laneMetrics("Lane 3", LANE_FS).minHeight).toBeGreaterThan(20);
    expect(plan(narrow, 5).kind, "20px is not enough for its name").toBe("none");
    const after = drop(narrow, 5);
    expect(after.elements.filter((e) => e.type === "lane").length).toBe(2);
  });

  it("an empty lane gives more than half, because the space is free", () => {
    // Two empty 120px lanes: the top one can give 80 and still fit "A", so a
    // lane needing 66 goes in — the old half-cap refused this.
    const roomy = {
      ...world(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 240, properties: {} }),
        E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 120, parentId: "p", properties: {} }),
        E({ id: "B", type: "lane", label: "B", x: 36, y: 120, width: 764, height: 120, parentId: "p", properties: {} }),
      ],
    } as DiagramData;
    const p = plan(roomy, 5);
    expect(p.kind).toBe("band");
    const after = drop(roomy, 5);
    expect(after.elements.filter((e) => e.type === "lane").length).toBe(3);
    expect(after.elements.find((e) => e.id === "p")!.height, "and still no growth").toBe(240);
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
    // The ghost is drawn from the plan's own bands, not re-derived.
    expect(canvas).toContain("previewBands(laneDropPlan)");
    // EXACTLY what would be added: each band's own header strip, inside it, and
    // the name it will be given — never the parent's header column.
    expect(canvas).toContain("<rect x={band.x} y={band.y} width={band.headerWidth}");
    expect(canvas).toContain("{band.label}");
    expect(canvas, "the parent's strip is not part of what is being added")
      .not.toContain("x={r.x - headerW}");
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

describe("T4702 — the ghost shows exactly what will be added, named", () => {
  const bands = (d: DiagramData, y: number) => previewBands(plan(d, y));

  it("one band for a lane, two for a split, none for a refusal", () => {
    expect(bands(world(), 5).length, "a lane at the pool top").toBe(1);
    expect(bands(world(), 150).length, "the middle third of a lane").toBe(2);
    const packed = {
      ...world(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 120, properties: {} }),
        E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 60, parentId: "p", properties: {} }),
        E({ id: "B", type: "lane", label: "B", x: 36, y: 60, width: 764, height: 60, parentId: "p", properties: {} }),
      ],
    } as DiagramData;
    expect(bands(packed, 5).length, "nothing to draw — the boundary goes red").toBe(0);
  });

  it("each band carries its OWN header strip and the name it will be given", () => {
    const [band] = bands(world(), 5);
    expect(band.headerWidth, "its own strip, not the parent's").toBe(36);
    // The fixture's lanes are called "A" and "B", so "Lane 1" is free.
    expect(band.label).toBe("Lane 1");
    // The strip is drawn INSIDE the band, at its left edge — so the band's box
    // starts after the POOL's header, and the strip starts with the band.
    const pool = world().elements.find((e) => e.id === "p")!;
    expect(band.x).toBe(pool.x + 36);
  });

  it("the strip is the BAND's width, even when the parent's differs", () => {
    // A pool whose own header has been widened to 60 for a long name; its
    // lanes still use 36. The ghost must show the strip the new lane will
    // have, not the one it sits beside.
    const wide = {
      ...world(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 600, properties: { poolHeaderWidth: 60 } }),
        E({ id: "A", type: "lane", label: "A", x: 60, y: 0, width: 740, height: 300, parentId: "p", properties: {} }),
        E({ id: "B", type: "lane", label: "B", x: 60, y: 300, width: 740, height: 300, parentId: "p", properties: {} }),
      ],
    } as DiagramData;
    const [band] = bands(wide, 5);
    expect(band.headerWidth, "the new lane's own strip").toBe(36);
    expect(band.x, "and it starts after the pool's 60px header").toBe(60);
  });

  it("a split names both sublanes, and never the same name twice", () => {
    const two = bands(world(), 150);
    expect(two.map((b) => b.label)).toEqual(["Sub 1", "Sub 2"]);
    expect(two[0].headerWidth).toBe(36);
    // Drawn inside the lane being split, after ITS header strip.
    const lane = world().elements.find((e) => e.id === "A")!;
    expect(two[0].x).toBe(lane.x + 36);
    expect(two[0].y).toBe(lane.y);
    expect(two[1].y).toBe(lane.y + two[0].height);
  });

  it("the name in the ghost is the name the drop gives", () => {
    const before = world();
    const [band] = bands(before, 5);
    const after = drop(before, 5);
    const added = after.elements.filter((e) => e.type === "lane").find((l) => !before.elements.some((e) => e.id === l.id));
    expect(added!.label).toBe(band.label);
  });
});

describe("T4708 — the names that MOVE are shown moving", () => {
  /** A pool of two lanes, the lower one empty, so a top drop carves from it. */
  const pair = (): DiagramData => ({
    elements: [
      E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 400, properties: {} }),
      E({ id: "A", type: "lane", label: "Alpha", x: 36, y: 0, width: 764, height: 200, parentId: "p", properties: {} }),
      E({ id: "B", type: "lane", label: "Bravo", x: 36, y: 200, width: 764, height: 200, parentId: "p", properties: {} }),
    ],
    connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as DiagramData;

  it("the donor's name is shown where it is going, with its own name", () => {
    // Paul, 2026-09-23: "move the current name of any sibling whose name will
    // be affected, to its new position and show in the same ghostly way so
    // that new names never appear over the top of old names."
    const before = pair();
    const p = plan(before, 5);                       // a lane at the pool top
    expect(p.kind).toBe("band");
    const moved = movedBands(p, before.elements, LANE_FS);
    expect(moved.length, "one band gives the room").toBe(1);
    expect(moved[0].label, "its OWN name, not the new one").toBe("Alpha");
  });

  it("the box it names is the box the drop really gives it", () => {
    const before = pair();
    const p = plan(before, 5);
    const moved = movedBands(p, before.elements, LANE_FS);
    const after = drop(before, 5);
    const real = after.elements.find((e) => e.id === moved[0].id)!;
    expect({ x: real.x, y: real.y, width: real.width, height: real.height })
      .toEqual({ x: moved[0].x, y: moved[0].y, width: moved[0].width, height: moved[0].height });
  });

  it("and its name comes off the canvas while the ghost holds it", () => {
    const before = pair();
    const ids = movedBandIds(plan(before, 5), before.elements, LANE_FS);
    expect(ids.length).toBe(1);
    const canvas = src("app/components/canvas/Canvas.tsx");
    expect(canvas).toContain("movedBandIds(laneDropPlan, data.elements");
    expect(canvas).toContain("<GhostMovedNameIdsCtx.Provider value={ghostMovedNameIds}>");
    expect(canvas).toContain('data-lane-drop="moved-name"');
    const renderer = src("app/components/canvas/SymbolRenderer.tsx");
    expect(renderer).toContain("const nameIsGhosted = useContext(GhostMovedNameIdsCtx).has(el.id);");
    expect(renderer).toContain('const lines = nameIsGhosted ? [] : (el.label ?? "").split');
  });

  it("a split moves nobody — the lane keeps its box, so its name stays put", () => {
    const before = pair();
    const p = plan(before, 100);                     // middle third of Alpha
    expect(p.kind).toBe("split");
    expect(movedBands(p, before.elements, LANE_FS)).toEqual([]);
    expect(movedBandIds(p, before.elements, LANE_FS)).toEqual([]);
  });

  it("nothing is ghosted when nothing would happen", () => {
    const packed = {
      ...pair(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 120, properties: {} }),
        E({ id: "A", type: "lane", label: "A", x: 36, y: 0, width: 764, height: 60, parentId: "p", properties: {} }),
        E({ id: "B", type: "lane", label: "B", x: 36, y: 60, width: 764, height: 60, parentId: "p", properties: {} }),
      ],
    } as DiagramData;
    const p = plan(packed, 5);
    expect(p.kind).toBe("none");
    expect(movedBands(p, packed.elements, LANE_FS)).toEqual([]);
  });

  it("a donor with sublanes moves those names too, as the reducer will", () => {
    const nested = {
      ...pair(),
      elements: [
        E({ id: "p", type: "pool", label: "Pool 1", x: 0, y: 0, width: 800, height: 600, properties: {} }),
        E({ id: "A", type: "lane", label: "Alpha", x: 36, y: 0, width: 764, height: 300, parentId: "p", properties: {} }),
        E({ id: "B", type: "lane", label: "Bravo", x: 36, y: 300, width: 764, height: 300, parentId: "p", properties: {} }),
        E({ id: "B1", type: "lane", label: "Bee One", x: 72, y: 300, width: 728, height: 150, parentId: "B", properties: {} }),
        E({ id: "B2", type: "lane", label: "Bee Two", x: 72, y: 450, width: 728, height: 150, parentId: "B", properties: {} }),
      ],
    } as DiagramData;
    const p = plan(nested, 595);                     // the pool BOTTOM → carve from Bravo
    const moved = movedBands(p, nested.elements, LANE_FS);
    const after = drop(nested, 595);
    for (const m of moved) {
      const real = after.elements.find((e) => e.id === m.id)!;
      expect({ x: real.x, y: real.y, width: real.width, height: real.height },
        `${m.label} is drawn where it lands`)
        .toEqual({ x: m.x, y: m.y, width: m.width, height: m.height });
    }
    expect(moved.map((m) => m.label)).toContain("Bravo");
  });
});

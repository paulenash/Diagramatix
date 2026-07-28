/**
 * Lane tiling invariant — lanes within a pool must tile CONTIGUOUSLY: no gaps,
 * no overlaps, and the lane stack must exactly cover the pool height.
 *
 * Motivation: a generated diagram (onboarding-saas-enterprise) showed a lane that
 * grew tall to fit an Expanded Subprocess while the lanes below it were NOT pushed
 * down — so they overlapped (Implementation 416–745 ran 49px into Configuration
 * 696–871). Overlapping lanes break the editor's boundary drag-handles (placed at
 * lane.y + lane.height) and scramble the on-screen lane order. These invariants
 * catch that.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// A pool whose MIDDLE lane is forced tall by a parallel fan-out of four tasks
// stacked vertically — the same shape that made the real diagram's lane grow.
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [
    { id: "top", name: "Top" }, { id: "mid", name: "Mid" }, { id: "bot", name: "Bot" },
  ] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "top" },
  { id: "g", type: "gateway", gatewayType: "parallel", label: "", pool: "p", lane: "mid" },
  { id: "a", type: "task", label: "A", pool: "p", lane: "mid" },
  { id: "b", type: "task", label: "B", pool: "p", lane: "mid" },
  { id: "c", type: "task", label: "C", pool: "p", lane: "mid" },
  { id: "d", type: "task", label: "D", pool: "p", lane: "mid" },
  { id: "m", type: "gateway", gatewayType: "parallel", label: "", pool: "p", lane: "mid" },
  { id: "tb", type: "task", label: "Bottom work", pool: "p", lane: "bot" },
  { id: "e", type: "end-event", label: "E", pool: "p", lane: "top" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "g" },
  { sourceId: "g", targetId: "a" }, { sourceId: "g", targetId: "b" },
  { sourceId: "g", targetId: "c" }, { sourceId: "g", targetId: "d" },
  { sourceId: "a", targetId: "m" }, { sourceId: "b", targetId: "m" },
  { sourceId: "c", targetId: "m" }, { sourceId: "d", targetId: "m" },
  { sourceId: "m", targetId: "tb" }, { sourceId: "tb", targetId: "e" },
];

const TOL = 1; // sub-pixel slack

// The actual repro: the MIDDLE lane holds a tall Expanded Subprocess (with an
// internal parallel fan-out), exactly like the real diagram's Implementation
// lane that grew to fit "Run Implementation Stage" and then overlapped the lanes
// below it.
const epEls: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [
    { id: "top", name: "Top" }, { id: "mid", name: "Mid" }, { id: "bot", name: "Bot" },
  ] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "top" },
  { id: "t0", type: "task", label: "Kickoff", pool: "p", lane: "top" },
  { id: "ep", type: "subprocess-expanded", label: "Run Stage", pool: "p", lane: "mid" },
  { id: "es", type: "start-event", label: "ES", parentSubprocess: "ep" },
  { id: "eg", type: "gateway", gatewayType: "parallel", label: "", parentSubprocess: "ep" },
  { id: "ea", type: "task", label: "EA", parentSubprocess: "ep" },
  { id: "eb", type: "task", label: "EB", parentSubprocess: "ep" },
  { id: "ec", type: "task", label: "EC", parentSubprocess: "ep" },
  { id: "em", type: "gateway", gatewayType: "parallel", label: "", parentSubprocess: "ep" },
  { id: "ee", type: "end-event", label: "EE", parentSubprocess: "ep" },
  { id: "tb", type: "task", label: "Bottom", pool: "p", lane: "bot" },
  { id: "e", type: "end-event", label: "E", pool: "p", lane: "top" },
];
const epConns: AiConnection[] = [
  { sourceId: "s", targetId: "t0" }, { sourceId: "t0", targetId: "ep" },
  { sourceId: "ep", targetId: "tb" }, { sourceId: "tb", targetId: "e" },
  { sourceId: "es", targetId: "eg" },
  { sourceId: "eg", targetId: "ea" }, { sourceId: "eg", targetId: "eb" }, { sourceId: "eg", targetId: "ec" },
  { sourceId: "ea", targetId: "em" }, { sourceId: "eb", targetId: "em" }, { sourceId: "ec", targetId: "em" },
  { sourceId: "em", targetId: "ee" },
];

const laneStack = (out: ReturnType<typeof layoutBpmnDiagram>) => {
  const pool = out.elements.find((x) => x.id === "p")!;
  const lanes = out.elements
    .filter((x) => x.type === "lane" && x.parentId === pool.id)
    .sort((a, b) => a.y - b.y);
  return { pool, lanes };
};

describe("Lane tiling — tall Expanded Subprocess in the middle lane", () => {
  it("T0526 — lanes stay contiguous when a lane grows to fit an EP", () => {
    const { lanes } = laneStack(layoutBpmnDiagram(epEls, epConns));
    expect(lanes.length, "expected three lanes").toBe(3);
    for (let i = 0; i < lanes.length - 1; i++) {
      const gap = lanes[i + 1].y - (lanes[i].y + lanes[i].height);
      expect(
        Math.abs(gap),
        `lanes "${lanes[i].label}" (bottom ${Math.round(lanes[i].y + lanes[i].height)}) and ` +
          `"${lanes[i + 1].label}" (top ${Math.round(lanes[i + 1].y)}) must be flush — gap ${Math.round(gap)}px`,
      ).toBeLessThanOrEqual(TOL);
    }
  });

  it("T0527 — the lane stack exactly covers the pool height (EP case)", () => {
    const { pool, lanes } = laneStack(layoutBpmnDiagram(epEls, epConns));
    const sum = lanes.reduce((acc, l) => acc + l.height, 0);
    expect(Math.abs(sum - pool.height), `Σlane heights ${Math.round(sum)} vs pool ${Math.round(pool.height)}`)
      .toBeLessThanOrEqual(TOL);
  });
});

describe("Lane tiling invariant", () => {
  it("T0524 — lanes within a pool tile contiguously (no gaps, no overlaps)", () => {
    const out = layoutBpmnDiagram(els, conns);
    const pool = out.elements.find((x) => x.id === "p")!;
    const lanes = out.elements
      .filter((x) => x.type === "lane" && x.parentId === pool.id)
      .sort((a, b) => a.y - b.y);
    expect(lanes.length, "expected three lanes").toBe(3);
    for (let i = 0; i < lanes.length - 1; i++) {
      const gap = lanes[i + 1].y - (lanes[i].y + lanes[i].height);
      expect(
        Math.abs(gap),
        `lanes "${lanes[i].label}" (bottom ${Math.round(lanes[i].y + lanes[i].height)}) and ` +
          `"${lanes[i + 1].label}" (top ${Math.round(lanes[i + 1].y)}) must be flush — gap ${Math.round(gap)}px`,
      ).toBeLessThanOrEqual(TOL);
    }
  });

  it("T0525 — the lane stack exactly covers the pool height", () => {
    const out = layoutBpmnDiagram(els, conns);
    const pool = out.elements.find((x) => x.id === "p")!;
    const lanes = out.elements.filter((x) => x.type === "lane" && x.parentId === pool.id);
    const sum = lanes.reduce((acc, l) => acc + l.height, 0);
    expect(Math.abs(sum - pool.height), `Σlane heights ${Math.round(sum)} vs pool ${Math.round(pool.height)}`)
      .toBeLessThanOrEqual(TOL);
    // lanes start at the pool top and finish at the pool bottom
    const top = Math.min(...lanes.map((l) => l.y));
    const bottom = Math.max(...lanes.map((l) => l.y + l.height));
    expect(Math.abs(top - pool.y), "top lane flush to pool top").toBeLessThanOrEqual(TOL);
    expect(Math.abs(bottom - (pool.y + pool.height)), "bottom lane flush to pool bottom").toBeLessThanOrEqual(TOL);
  });
});

describe("Lane hug — each lane sits close around its content (no dead space)", () => {
  // The final fitLanesToChildren(hug) pass sizes every lane band to its content
  // plus 1 Task-height (65px) top & bottom, collapsing the maxStack over-
  // reservation that left the real "Loan Assessment Team" lane 1151px tall for
  // 486px of content. Only activities (not gateways/events) bound a lane, so we
  // measure clearance to the outermost activity.
  const HUG_VPAD = 65;                            // 1 × Task-height
  const ACTIVITY = new Set(["task", "subprocess", "subprocess-expanded", "data-object", "data-store"]);
  const CLEAR_TOL = HUG_VPAD + 4;                 // 1-Task pad + sub-pixel slack

  it("T1044 — a lane hugs its outermost activity to ±1 Task-height", () => {
    const out = layoutBpmnDiagram(els, conns);
    const pool = out.elements.find((x) => x.id === "p")!;
    const lanes = out.elements.filter((x) => x.type === "lane" && x.parentId === pool.id);
    for (const lane of lanes) {
      const kids = out.elements.filter((e) => e.parentId === lane.id && ACTIVITY.has(e.type));
      if (kids.length === 0) continue;            // event/gateway-only lane isn't hug-bound
      const topAct = Math.min(...kids.map((k) => k.y));
      const botAct = Math.max(...kids.map((k) => k.y + k.height));
      const topGap = topAct - lane.y;
      const botGap = (lane.y + lane.height) - botAct;
      expect(topGap, `lane "${lane.label}" top gap ${Math.round(topGap)}px ≤ ${CLEAR_TOL}`).toBeLessThanOrEqual(CLEAR_TOL);
      expect(botGap, `lane "${lane.label}" bottom gap ${Math.round(botGap)}px ≤ ${CLEAR_TOL}`).toBeLessThanOrEqual(CLEAR_TOL);
      expect(topGap, `lane "${lane.label}" top gap must be non-negative`).toBeGreaterThanOrEqual(-TOL);
      expect(botGap, `lane "${lane.label}" bottom gap must be non-negative`).toBeGreaterThanOrEqual(-TOL);
    }
  });
});

/**
 * Gateway semantics as the engine actually implements them.
 *
 * Characterisation tests: these pin what happens TODAY, including the places it
 * diverges from BPMN, so the divergence is visible and a fix has a baseline to
 * move. Where a case is knowingly wrong the assertion says so.
 */
import { describe, it, expect } from "vitest";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { Engine } from "@/app/lib/simulation/engine";
import { DEFAULT_RUN_CONFIG } from "@/app/lib/simulation/types";
import type { DiagramData } from "@/app/lib/diagram/types";

const CASES = 4000;

/**
 * start → gateway → (A | B [| D]) → join → end, with a fixed number of arrivals.
 * `withDefault` adds a third branch D marked as the gateway's default flow —
 * the configuration an inclusive gateway is supposed to have, so the "no branch
 * fired" cases have somewhere to go instead of distorting branch A.
 */
function twoBranch(
  gatewayType: "exclusive" | "inclusive" | "parallel",
  pA?: number,
  pB?: number,
  withDefault = false,
): DiagramData {
  const base = {
    elements: [
      { id: "start", type: "start-event", label: "In", x: 0, y: 0, width: 40, height: 40,
        // A big sample: branch shares are stochastic, and at 100 cases a ±3%
        // swing is ordinary noise that would make these assertions flaky.
        properties: { sim: { arrival: { kind: "fixed", value: 10 }, maxArrivals: CASES } } },
      { id: "gw", type: "gateway", gatewayType, label: "Split", x: 100, y: 0, width: 50, height: 50, properties: {} },
      { id: "a", type: "task", label: "A", x: 200, y: -60, width: 100, height: 60,
        properties: { sim: { cycleTime: { kind: "fixed", value: 1 } } } },
      { id: "b", type: "task", label: "B", x: 200, y: 60, width: 100, height: 60,
        properties: { sim: { cycleTime: { kind: "fixed", value: 1 } } } },
      { id: "join", type: "gateway", gatewayType, label: "Join", x: 350, y: 0, width: 50, height: 50, properties: {} },
      { id: "end", type: "end-event", label: "Out", x: 450, y: 0, width: 40, height: 40, properties: {} },
    ],
    connectors: [
      { id: "c0", sourceId: "start", targetId: "gw", waypoints: [] },
      { id: "cA", sourceId: "gw", targetId: "a", waypoints: [], ...(pA !== undefined ? { branchProbability: pA } : {}) },
      { id: "cB", sourceId: "gw", targetId: "b", waypoints: [], ...(pB !== undefined ? { branchProbability: pB } : {}) },
      { id: "cA2", sourceId: "a", targetId: "join", waypoints: [] },
      { id: "cB2", sourceId: "b", targetId: "join", waypoints: [] },
      { id: "c3", sourceId: "join", targetId: "end", waypoints: [] },
    ],
  } as unknown as DiagramData;
  if (!withDefault) return base;
  base.elements.push({
    id: "d", type: "task", label: "D", x: 200, y: 140, width: 100, height: 60,
    properties: { sim: { cycleTime: { kind: "fixed", value: 1 } } },
  } as unknown as DiagramData["elements"][number]);
  base.connectors.push(
    { id: "cD", sourceId: "gw", targetId: "d", waypoints: [], isDefaultFlow: true } as unknown as DiagramData["connectors"][number],
    { id: "cD2", sourceId: "d", targetId: "join", waypoints: [] } as unknown as DiagramData["connectors"][number],
  );
  return base;
}

/** Run once and report how many tokens visited each task, and how many cases
 *  the engine counted as completed. */
function run(data: DiagramData) {
  const net = assembleFromDiagram(data, { teamCapacities: {} });
  const engine = new Engine(
    net,
    { ...DEFAULT_RUN_CONFIG, horizon: CASES * 10 + 500, warmUp: 0, replications: 1, seed: 7, collectQueues: false },
    undefined,
    { trace: true, maxTrace: 200000 },
  );
  const stats = engine.run();
  const visits: Record<string, number> = {};
  for (const ev of engine.getTrace()) {
    if (ev.kind === "enter" && ev.nodeId) visits[ev.nodeId] = (visits[ev.nodeId] ?? 0) + 1;
  }
  return { visits, stats };
}

describe("exclusive gateway", () => {
  it("sends each case down exactly one branch, in proportion", () => {
    const { visits } = run(twoBranch("exclusive", 70, 30));
    const a = visits.a ?? 0, b = visits.b ?? 0;
    expect(a + b).toBe(visits.gw ?? 0);          // exactly one branch per case
    expect(a / (a + b)).toBeCloseTo(0.7, 1);
  });
});

describe("inclusive gateway — independent per-branch (BPMN OR)", () => {
  it("honours each branch's stated probability independently", () => {
    // 90 / 30 with a default flow to absorb the "neither" cases.
    const { visits } = run(twoBranch("inclusive", 90, 30, true));
    const cases = visits.gw ?? 0;
    // Each branch fires at its OWN rate — B is 30%, not the 10% left over after
    // A. This is Paul's case: the two exceed 100% between them.
    expect((visits.a ?? 0) / cases).toBeCloseTo(0.9, 1);
    expect((visits.b ?? 0) / cases).toBeCloseTo(0.3, 1);
  });

  it("sends a real share of cases down BOTH branches", () => {
    const { visits } = run(twoBranch("inclusive", 90, 30, true));
    const cases = visits.gw ?? 0;
    // Independent branches ⇒ both ≈ 0.9 × 0.3 = 27%, so the branch visits
    // together exceed the number of cases. Under the old exclusive routing this
    // sum was exactly equal to it.
    expect((visits.a ?? 0) + (visits.b ?? 0)).toBeGreaterThan(cases * 1.1);
  });

  it("takes the default flow for exactly the cases where nothing fired", () => {
    const { visits } = run(twoBranch("inclusive", 90, 30, true));
    const cases = visits.gw ?? 0;
    // P(neither) = 0.1 × 0.7 = 7%.
    expect((visits.d ?? 0) / cases).toBeCloseTo(0.07, 1);
  });

  it("without a default, the un-fired cases distort the first branch", () => {
    // Documents WHY an inclusive gateway needs a default flow. With none, a case
    // where no branch fired has nowhere to go, so the engine keeps it alive on
    // the first edge rather than dropping it — and branch A silently reads
    // 0.90 + 0.07 = 0.97 instead of its stated 90%.
    const { visits } = run(twoBranch("inclusive", 90, 30));
    const cases = visits.gw ?? 0;
    expect((visits.a ?? 0) / cases).toBeCloseTo(0.97, 1);
    expect((visits.b ?? 0) / cases).toBeCloseTo(0.3, 1);
  });

  it("re-joins, so one case in is one case out", () => {
    const { visits, stats } = run(twoBranch("inclusive", 90, 30, true));
    expect(stats.completed).toBe(visits.gw ?? 0);
  });
});

describe("parallel gateway", () => {
  it("splits a token down every branch", () => {
    const { visits } = run(twoBranch("parallel"));
    expect(visits.a).toBe(visits.gw);
    expect(visits.b).toBe(visits.gw);
  });

  it("re-joins the branches into one case (was 2× inflated)", () => {
    const { visits, stats } = run(twoBranch("parallel"));
    const cases = visits.gw ?? 0;
    expect(cases).toBe(CASES);
    // The AND-join merges both branch tokens back into one case. Before this
    // was implemented, 100 cases reported 200 completed.
    expect(stats.completed).toBe(cases);
  });

  it("waits for the SLOWER branch before continuing", () => {
    // B takes far longer than A; the join must hold A until B lands, so the
    // case's flow time reflects the slow branch, not the fast one.
    const data = twoBranch("parallel");
    const b = data.elements.find((e) => e.id === "b")!;
    (b.properties as { sim: { cycleTime: unknown } }).sim.cycleTime = { kind: "fixed", value: 50 };

    const { stats } = run(data);
    expect(stats.completed).toBe(CASES);
    expect(stats.avgFlowTime).toBeGreaterThanOrEqual(50);
  });
});

/**
 * Rework as a named parameter, and "automate this task" as a runnable scenario.
 *
 * Smaller items 01 and 05. Neither needs an engine change — the point of both is
 * that the capability was already there and nobody could reach it in the words
 * they actually use.
 */
import { describe, it, expect } from "vitest";
import {
  findReworkLoops, reworkOverride, describeRework,
  automateTaskOverride, AUTOMATION_RESIDUAL,
} from "@/app/lib/simulation/rework";
import type { DiagramData } from "@/app/lib/diagram/types";

/** start → Assess → Check(gateway) → end, with Check looping back to Assess. */
function diagram(loopProb?: number): DiagramData {
  const el = (id: string, type: string, label: string) => ({
    id, type, label, x: 0, y: 0, width: 100, height: 60, properties: {},
  });
  const conn = (id: string, sourceId: string, targetId: string, probability?: number) => ({
    id, type: "sequence", sourceId, targetId, waypoints: [],
    ...(probability !== undefined ? { branchProbability: probability } : {}),
  });
  return {
    elements: [
      el("s", "start-event", "Claim arrives"),
      el("assess", "task", "Assess claim"),
      el("check", "gateway", "Complete?"),
      el("e", "end-event", "Done"),
    ],
    connectors: [
      conn("c1", "s", "assess"),
      conn("c2", "assess", "check"),
      conn("c3", "check", "e", loopProb !== undefined ? 1 - loopProb : undefined),
      conn("back", "check", "assess", loopProb),   // the rework loop
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as unknown as DiagramData;
}

describe("rework as a named parameter", () => {
  it("T3414 - the loop-back is found by walking the flow, not by geometry", () => {
    const loops = findReworkLoops(diagram(0.125));
    expect(loops).toHaveLength(1);
    expect(loops[0].connectorId).toBe("back");
    expect(loops[0].toLabel).toBe("Assess claim");
    expect(loops[0].fromLabel).toBe("Complete?");
  });

  it("T3415 - the same number reads as a rework rate and a first-pass yield", () => {
    const loop = findReworkLoops(diagram(0.125))[0];
    expect(loop.reworkRate).toBe(0.125);
    expect(loop.firstPassYield).toBe(0.875);
    expect(describeRework(loop)).toBe(
      "12.5% of cases come back to Assess claim from Complete? — a first-pass yield of 87.5%.",
    );
  });

  it("T3416 - a loop with no probability set is UNSET, not a zero rework rate", () => {
    const loop = findReworkLoops(diagram())[0];
    expect(loop.reworkRate).toBeUndefined();
    expect(describeRework(loop)).toMatch(/no rework rate has been set yet/i);
  });

  it("T3417 - setting the rate is an ordinary connector override, clamped to 0..1", () => {
    const loop = findReworkLoops(diagram(0.125))[0];
    expect(reworkOverride(loop, 0.3)).toEqual({ connectors: { back: { probability: 0.3 } } });
    expect(reworkOverride(loop, 5)).toEqual({ connectors: { back: { probability: 1 } } });
    expect(reworkOverride(loop, -1)).toEqual({ connectors: { back: { probability: 0 } } });
  });

  it("T3418 - a process with no loop back reports no rework, rather than inventing one", () => {
    const straight = diagram(0.1);
    straight.connectors = straight.connectors.filter((c) => c.id !== "back");
    expect(findReworkLoops(straight)).toEqual([]);
  });
});

describe("automate this task", () => {
  it("T3419 - automation keeps a residual time and drops the demand on the team", () => {
    const p = automateTaskOverride("assess", "Assess claim", 20);
    expect(p.overrides.elements!.assess.cycleTime).toEqual({ kind: "fixed", value: 1 });  // 5% of 20
    expect(p.overrides.elements!.assess.units).toBe(0);
    expect(p.scenarioName).toBe("Automate Assess claim");
  });

  it("T3420 - the residual scales with the task, so a short task does not stay long", () => {
    const big = automateTaskOverride("t", "Big", 100);
    const small = automateTaskOverride("t", "Small", 2);
    const value = (p: typeof big) => (p.overrides.elements!.t.cycleTime as { value: number }).value;
    expect(value(big)).toBeGreaterThan(value(small));
    expect(value(big)).toBe(100 * AUTOMATION_RESIDUAL);
  });

  it("T3421 - the assumption is carried WITH the proposal, including that building it is not free", () => {
    const p = automateTaskOverride("assess", "Assess claim", 20);
    expect(p.assumption).toMatch(/no longer occupies a person/i);
    expect(p.assumption).toMatch(/not assume the automation is free to build/i);
  });
});

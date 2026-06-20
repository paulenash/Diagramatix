/**
 * Planned (timed) interventions scheduled onto the calendar: capacity surge +
 * revert, arrival-rate scaling, branch-probability override + revert, and
 * token injection. Engine-local so replications stay independent.
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig, PlannedIntervention } from "@/app/lib/simulation/types";

const cfg: SimRunConfig = { clockUnit: "minute", horizon: 2000, warmUp: 0, replications: 1, seed: 3, collectQueues: true };
const run = (net: SimNetwork, planned?: PlannedIntervention[]) =>
  new Engine(net, cfg, undefined, planned ? { planned } : undefined).run();

// Saturated line: arrivals every 5, service 8 on capacity 1 (load 1.6).
const saturated = (): SimNetwork => ({
  nodes: [
    { id: "src", kind: "source", arrival: { kind: "fixed", value: 5 } },
    { id: "task", kind: "task", cycleTime: { kind: "fixed", value: 8 }, teamId: "ops", units: 1 },
    { id: "end", kind: "sink" },
  ],
  edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "end" }],
  teams: [{ id: "ops", capacity: 1 }],
});

describe("planned interventions", () => {
  it("capacity surge raises throughput on a saturated line", () => {
    const base = run(saturated());
    const surged = run(saturated(), [{ id: "a", t: 0, kind: "capacity", target: "ops", value: 5 }]);
    expect(surged.completed).toBeGreaterThan(base.completed);
  });

  it("a time-boxed capacity surge reverts (less throughput than a permanent one)", () => {
    const permanent = run(saturated(), [{ id: "a", t: 0, kind: "capacity", target: "ops", value: 5 }]);
    const brief = run(saturated(), [{ id: "a", t: 0, kind: "capacity", target: "ops", value: 5, duration: 50 }]);
    const baseline = run(saturated());
    expect(brief.completed).toBeLessThan(permanent.completed);   // it didn't stay surged
    expect(brief.completed).toBeGreaterThanOrEqual(baseline.completed);
  });

  it("arrival scaling increases the number of arrivals", () => {
    const net = (): SimNetwork => ({
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 } },
        { id: "task", kind: "task", cycleTime: { kind: "fixed", value: 1 }, teamId: "ops", units: 1 },
        { id: "end", kind: "sink" },
      ],
      edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "end" }],
      teams: [{ id: "ops", capacity: 1 }],
    });
    const base = run(net());
    const faster = run(net(), [{ id: "a", t: 0, kind: "arrival", target: "src", value: 2 }]);
    expect(faster.arrived).toBeGreaterThan(base.arrived * 1.5);
  });

  it("branchProb override forces routing, and reverts after its duration", () => {
    const net = (): SimNetwork => ({
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 }, maxArrivals: 100 },
        { id: "g", kind: "gateway", gateway: "decision" },
        { id: "L", kind: "task", cycleTime: { kind: "fixed", value: 1 } },
        { id: "R", kind: "task", cycleTime: { kind: "fixed", value: 1 } },
        { id: "end", kind: "sink" },
      ],
      edges: [
        { id: "e0", source: "src", target: "g" },
        { id: "eL", source: "g", target: "L", probability: 0.5 },
        { id: "eR", source: "g", target: "R", probability: 0.5 },
        { id: "lend", source: "L", target: "end" },
        { id: "rend", source: "R", target: "end" },
      ],
      teams: [],
    });
    // Force everything left for the first 500, then let it revert to 50/50.
    const forced = run(net(), [{ id: "a", t: 0, kind: "branchProb", target: "eL", value: 1, duration: 500 }]);
    // During the forced window all tokens go L; after revert some go R.
    expect(forced.perNode.L?.count ?? 0).toBeGreaterThan(forced.perNode.R?.count ?? 0);
    expect(forced.perNode.R?.count ?? 0).toBeGreaterThan(0); // it did revert
  });

  it("inject spawns tokens at a node", () => {
    const net: SimNetwork = {
      nodes: [
        { id: "task", kind: "task", cycleTime: { kind: "fixed", value: 1 }, teamId: "ops", units: 1 },
        { id: "end", kind: "sink" },
      ],
      edges: [{ id: "e1", source: "task", target: "end" }],
      teams: [{ id: "ops", capacity: 5 }],
    };
    const r = run(net, [{ id: "a", t: 10, kind: "inject", target: "task", value: 8 }]);
    expect(r.completed).toBe(8);
  });

  it("is deterministic with interventions across replications", () => {
    const planned: PlannedIntervention[] = [{ id: "a", t: 100, kind: "capacity", target: "ops", value: 3, duration: 200 }];
    const a = runMonteCarlo(saturated(), { ...cfg, replications: 5 }, planned);
    const b = runMonteCarlo(saturated(), { ...cfg, replications: 5 }, planned);
    expect(a.stats).toEqual(b.stats);
  });
});

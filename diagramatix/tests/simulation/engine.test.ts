/**
 * Engine correctness:
 *  • M/M/1 vs the closed-form queue formulae (the DES sanity oracle),
 *  • snapshot→resume is bit-identical (Operator fork + reproducibility),
 *  • token properties + expression conditions + a loop (the Car Repair shape).
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { makeRng } from "@/app/lib/simulation/rng";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 100000, warmUp: 5000, replications: 1, seed: 12345, collectQueues: true, ...over,
});

// source → server(task, team cap 1) → sink
function mm1Network(arrivalMean: number, serviceMean: number): SimNetwork {
  return {
    teams: [{ id: "T", capacity: 1 }],
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "exponential", mean: arrivalMean } },
      { id: "server", kind: "task", teamId: "T", units: 1, cycleTime: { kind: "exponential", mean: serviceMean } },
      { id: "sink", kind: "sink" },
    ],
    edges: [
      { id: "e1", source: "src", target: "server" },
      { id: "e2", source: "server", target: "sink" },
    ],
  };
}

describe("engine — M/M/1 analytic check", () => {
  it("matches utilisation, Wq and Lq for ρ=0.8", () => {
    // λ=0.8, μ=1.0 ⇒ ρ=0.8 ; Wq=ρ/(μ−λ)=4 ; Lq=ρ²/(1−ρ)=3.2
    const e = new Engine(mm1Network(1 / 0.8, 1 / 1.0), cfg());
    const r = e.run();
    expect(r.perTeam.T.utilization).toBeGreaterThan(0.76);
    expect(r.perTeam.T.utilization).toBeLessThan(0.84);
    expect(r.perNode.server.avgWait).toBeGreaterThan(3.2); // Wq≈4, ±20%
    expect(r.perNode.server.avgWait).toBeLessThan(4.8);
    expect(r.perTeam.T.avgQueue).toBeGreaterThan(2.5);     // Lq≈3.2, ±20%
    expect(r.perTeam.T.avgQueue).toBeLessThan(3.9);
    expect(r.completed).toBeGreaterThan(50000);
  });
});

describe("engine — determinism + snapshot/resume", () => {
  it("two fresh runs with the same seed are identical", () => {
    const net = mm1Network(1 / 0.8, 1);
    const a = new Engine(net, cfg({ horizon: 30000 })).run();
    const b = new Engine(net, cfg({ horizon: 30000 })).run();
    expect(b).toEqual(a);
  });

  it("snapshot mid-run + resume reproduces the uninterrupted result bit-identically", () => {
    const net = mm1Network(1 / 0.8, 1);
    const c = cfg({ horizon: 40000 });
    const a = new Engine(net, c, makeRng(c.seed));
    a.reset();
    a.runUntil(15000);
    const snap = a.snapshot();           // pure read
    a.runUntil(c.horizon);               // uninterrupted ground truth
    const resultA = a.finalize(c.horizon);

    const b = Engine.resume(net, c, snap);
    b.runUntil(c.horizon);
    const resultB = b.finalize(c.horizon);
    expect(resultB).toEqual(resultA);
  });
});

describe("engine — token properties + condition loop (Car Repair shape)", () => {
  it("loops a decision on a token property until it reaches zero", () => {
    // 5 well-spaced tokens, each seeded noOfIssues=3; the 'fix' task decrements
    // it and the decision loops while > 0. Each token must hit 'fix' 3×.
    const net: SimNetwork = {
      teams: [],
      properties: [{ name: "noOfIssues", init: { kind: "fixed", value: 3 } }],
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 }, maxArrivals: 5 },
        { id: "check", kind: "gateway", gateway: "decision" },
        { id: "fix", kind: "task", cycleTime: { kind: "fixed", value: 1 },
          assign: [{ property: "noOfIssues", value: { expr: "getProperty('noOfIssues') - 1" } }] },
        { id: "done", kind: "sink" },
      ],
      edges: [
        { id: "e1", source: "src", target: "check" },
        { id: "e2", source: "check", target: "fix", condition: { expr: "getProperty('noOfIssues') > 0" } },
        { id: "e3", source: "check", target: "done", isDefault: true },
        { id: "e4", source: "fix", target: "check" },
      ],
    };
    const r = new Engine(net, cfg({ horizon: 200, warmUp: 0 })).run();
    expect(r.completed).toBe(5);
    expect(r.perNode.fix.count).toBe(15); // 3 fixes × 5 tokens
  });
});

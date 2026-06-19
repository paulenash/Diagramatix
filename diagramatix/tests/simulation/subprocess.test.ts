/**
 * Hierarchical subprocess (EP) simulation: scoped recursion into the inline
 * body, standard loop, sequential + parallel multi-instance, nesting, and
 * snapshot/resume across a loop. The scope machinery here is the foundation
 * for Event Subprocesses (next increment).
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { makeRng } from "@/app/lib/simulation/rng";
import type { SimNetwork, SimNode, SimEdge, LoopSpec } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 1000, warmUp: 0, replications: 1, seed: 7, collectQueues: true, ...over,
});

/** src → S(subprocess, body: b1 → bend) → end.  Optional loop spec + team. */
function epNetwork(loop?: LoopSpec, team?: { cap: number; cycle: number; units?: number }): SimNetwork {
  const b1: SimNode = { id: "b1", kind: "task", scope: "S", cycleTime: { kind: "fixed", value: team?.cycle ?? 2 } };
  if (team) { b1.teamId = "T"; b1.units = team.units ?? 1; }
  const nodes: SimNode[] = [
    { id: "src", kind: "source", arrival: { kind: "fixed", value: 50 }, maxArrivals: 3 },
    { id: "S", kind: "subprocess", bodyStart: "b1", loop },
    b1,
    { id: "bend", kind: "sink", scope: "S" },
    { id: "end", kind: "sink" },
  ];
  const edges: SimEdge[] = [
    { id: "e1", source: "src", target: "S" },
    { id: "e2", source: "S", target: "end" },
    { id: "e3", source: "b1", target: "bend" },
  ];
  return { nodes, edges, teams: team ? [{ id: "T", capacity: team.cap }] : [] };
}

describe("subprocess recursion", () => {
  it("runs the inline body once and returns to the parent flow", () => {
    const r = new Engine(epNetwork(), cfg()).run();
    expect(r.completed).toBe(3);          // all tokens reach the top-level end
    expect(r.perNode.b1.count).toBe(3);   // body task ran once per token
  });

  it("nested EPs recurse two levels", () => {
    // S1.body = S2 ; S2.body = task t
    const net: SimNetwork = {
      teams: [],
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 50 }, maxArrivals: 2 },
        { id: "S1", kind: "subprocess", bodyStart: "S2" },
        { id: "S2", kind: "subprocess", bodyStart: "t", scope: "S1" },
        { id: "t", kind: "task", scope: "S2", cycleTime: { kind: "fixed", value: 1 } },
        { id: "e2end", kind: "sink", scope: "S2" },
        { id: "e1end", kind: "sink", scope: "S1" },
        { id: "end", kind: "sink" },
      ],
      edges: [
        { id: "a", source: "src", target: "S1" },
        { id: "b", source: "S1", target: "end" },
        { id: "c", source: "S2", target: "e1end" },
        { id: "d", source: "t", target: "e2end" },
      ],
    };
    const r = new Engine(net, cfg()).run();
    expect(r.completed).toBe(2);
    expect(r.perNode.t.count).toBe(2);
  });
});

describe("loop / multi-instance", () => {
  it("standard loop repeats the body a fixed number of iterations", () => {
    const r = new Engine(epNetwork({ kind: "standard", iterations: { kind: "fixed", value: 3 } }), cfg()).run();
    expect(r.completed).toBe(3);
    expect(r.perNode.b1.count).toBe(9); // 3 iterations × 3 tokens
  });

  it("sequential multi-instance runs N body instances serially", () => {
    const r = new Engine(epNetwork({ kind: "multi", instances: { kind: "fixed", value: 4 }, ordering: "sequential" }), cfg()).run();
    expect(r.perNode.b1.count).toBe(12); // 4 × 3 tokens
    expect(r.completed).toBe(3);
  });

  it("parallel multi-instance seizes concurrently and joins before continuing", () => {
    // 4 instances, capacity 2, cycle 5 ⇒ two waves ⇒ makespan ≈ 10 per token.
    const r = new Engine(epNetwork({ kind: "multi", instances: { kind: "fixed", value: 4 }, ordering: "parallel" }, { cap: 2, cycle: 5 }), cfg()).run();
    expect(r.perNode.b1.count).toBe(12);   // 4 instances × 3 tokens all serviced
    expect(r.completed).toBe(3);            // each parent continues after the join
    expect(r.perTeam.T.maxQueue).toBeGreaterThan(0); // contention spike (4 > capacity 2)
  });
});

describe("subprocess snapshot/resume", () => {
  it("is bit-identical across a looping subprocess", () => {
    const net = epNetwork({ kind: "standard", iterations: { kind: "fixed", value: 3 } });
    const c = cfg({ horizon: 400, maxArrivals: undefined } as Partial<SimRunConfig>);
    const a = new Engine(net, c, makeRng(c.seed));
    a.reset(); a.runUntil(120);
    const snap = a.snapshot();
    a.runUntil(c.horizon);
    const ra = a.finalize(c.horizon);
    const b = Engine.resume(net, c, snap); b.runUntil(c.horizon);
    expect(b.finalize(c.horizon)).toEqual(ra);
  });
});

import { describe, it, expect } from "vitest";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";

/**
 * T2868 — an unstable model is STOPPED and EXPLAINED, never left to run.
 *
 * When work arrives faster than the resources can finish it the queue never
 * drains: live tokens grow with the horizon, and memory grows with them. The
 * authoritative run executes SERVER-side, so unbounded that takes the whole
 * application down rather than one browser tab — which is what happened in
 * production. Stopping is only half of it: the run must also say WHY, or a
 * part-run gets presented as a complete answer and the numbers quietly lie.
 */
const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 2_000_000, warmUp: 0, replications: 3, seed: 7, collectQueues: false, ...over,
});

/** One case a minute into an hour-long task — `capacity` people to do it. */
function net(capacity: number): SimNetwork {
  return {
    teams: [{ id: "T", capacity }],
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "fixed", value: 1 } },
      { id: "task", kind: "task", teamId: "T", units: 1, cycleTime: { kind: "fixed", value: 60 } },
      { id: "sink", kind: "sink" },
    ],
    edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "sink" }],
  };
}

describe("runaway guard", () => {
  it("stops an unstable model and reports why", () => {
    // 1 person, 60 minutes of work arriving every minute — hopeless by 60×.
    const res = runMonteCarlo(net(1), cfg());
    expect(res.overload, "the run must not just end looking normal").toBeDefined();
    expect(res.overload!.liveTokens).toBeGreaterThan(1000);
    expect(res.overload!.at).toBeGreaterThan(0);
    expect(res.reps.length, "overloaded in every replication — don't burn the same time again for the same answer").toBe(1);
  });

  it("a model that keeps up runs its full horizon with no complaint", () => {
    // 90 people for 60 minutes of work a minute: comfortable headroom.
    const res = runMonteCarlo(net(90), cfg({ horizon: 20_000, replications: 2 }));
    expect(res.overload).toBeUndefined();
    expect(res.reps.length).toBe(2);
  });
});

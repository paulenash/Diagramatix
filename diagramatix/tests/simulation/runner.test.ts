/**
 * Monte-Carlo runner: deterministic replications, ranges that reflect
 * variance, and an M/M/1 utilisation sanity check across replications.
 */
import { describe, it, expect } from "vitest";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";

// M/M/1: exp arrivals (rate 0.1) + exp service (rate 0.125) on capacity 1 →
// ρ = λ/μ = 0.8, so long-run utilisation ≈ 0.8.
const mm1: SimNetwork = {
  nodes: [
    { id: "src", kind: "source", arrival: { kind: "exponential", mean: 10 } },
    { id: "task", kind: "task", cycleTime: { kind: "exponential", mean: 8 }, teamId: "ops", units: 1 },
    { id: "end", kind: "sink" },
  ],
  edges: [
    { id: "e1", source: "src", target: "task" },
    { id: "e2", source: "task", target: "end" },
  ],
  teams: [{ id: "ops", capacity: 1 }],
};

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 20000, warmUp: 2000, replications: 30, seed: 7, collectQueues: true, ...over,
});

describe("runMonteCarlo", () => {
  it("is deterministic for the same network + config", () => {
    const a = runMonteCarlo(mm1, cfg());
    const b = runMonteCarlo(mm1, cfg());
    expect(a.stats).toEqual(b.stats);
    expect(a.reps.length).toBe(30);
  });

  it("reports ordered percentiles and a non-degenerate range under variance", () => {
    const { stats } = runMonteCarlo(mm1, cfg());
    const u = stats.perTeam.ops.utilization;
    expect(u.p5).toBeLessThanOrEqual(u.p50);
    expect(u.p50).toBeLessThanOrEqual(u.p95);
    expect(u.p5).toBeLessThan(u.p95);                  // stochastic model → real spread
    expect(u.mean).toBeGreaterThanOrEqual(u.p5);
    expect(u.mean).toBeLessThanOrEqual(u.p95);
  });

  it("recovers the M/M/1 utilisation ρ≈0.8 across replications", () => {
    const { stats } = runMonteCarlo(mm1, cfg());
    expect(stats.perTeam.ops.utilization.mean).toBeGreaterThan(0.7);
    expect(stats.perTeam.ops.utilization.mean).toBeLessThan(0.9);
  });

  it("collapses to a zero-width range for a fully deterministic model", () => {
    const fixed: SimNetwork = {
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 }, maxArrivals: 50 },
        { id: "task", kind: "task", cycleTime: { kind: "fixed", value: 4 }, teamId: "ops", units: 1 },
        { id: "end", kind: "sink" },
      ],
      edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "end" }],
      teams: [{ id: "ops", capacity: 1 }],
    };
    const { stats } = runMonteCarlo(fixed, cfg({ warmUp: 0, horizon: 1000, replications: 8 }));
    const c = stats.completed;
    expect(c.p5).toBe(c.p95);   // no randomness → every replication identical
    expect(c.mean).toBe(c.p50);
  });
});

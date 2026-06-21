/**
 * Cost modelling: per-team cost = busy-hours × costPerHour; totalCost +
 * costPerCase roll up. Verified on a fully-deterministic line so the numbers
 * are exact.
 */
import { describe, it, expect } from "vitest";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";

// 10 cases, one at a time, 1 hour each on a capacity-1 team → 10 busy-hours.
const net: SimNetwork = {
  nodes: [
    { id: "src", kind: "source", arrival: { kind: "fixed", value: 2 }, maxArrivals: 10 },
    { id: "task", kind: "task", cycleTime: { kind: "fixed", value: 1 }, teamId: "ops", units: 1 },
    { id: "end", kind: "sink" },
  ],
  edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "end" }],
  teams: [{ id: "ops", capacity: 1 }],
};
const cfg: SimRunConfig = { clockUnit: "hour", horizon: 100, warmUp: 0, replications: 1, seed: 1, collectQueues: true };

describe("cost modelling", () => {
  it("per-team cost = busy-hours × costPerHour", () => {
    const { stats } = runMonteCarlo(net, cfg, undefined, { ops: 50 });
    // 10 services × 1 hour = 10 busy-hours × $50 = $500.
    expect(stats.perTeam.ops.cost.mean).toBeCloseTo(500, 6);
  });

  it("totalCost sums teams and costPerCase divides by completed", () => {
    const { stats } = runMonteCarlo(net, cfg, undefined, { ops: 50 });
    expect(stats.completed.mean).toBe(10);
    expect(stats.totalCost.mean).toBeCloseTo(500, 6);
    expect(stats.costPerCase.mean).toBeCloseTo(50, 6); // 500 / 10
  });

  it("unpriced teams cost nothing", () => {
    const { stats } = runMonteCarlo(net, cfg); // no teamCosts
    expect(stats.perTeam.ops.cost.mean).toBe(0);
    expect(stats.totalCost.mean).toBe(0);
  });

  it("converts the clock unit correctly (minutes)", () => {
    // Same 10 services but cycle = 60 minutes; clockUnit minute → still 10 busy-hours.
    const minNet: SimNetwork = {
      ...net,
      nodes: net.nodes.map((n) => (n.id === "task" ? { ...n, cycleTime: { kind: "fixed", value: 60 } } : n.id === "src" ? { ...n, arrival: { kind: "fixed", value: 120 } } : n)),
    };
    const { stats } = runMonteCarlo(minNet, { ...cfg, clockUnit: "minute", horizon: 6000 }, undefined, { ops: 50 });
    expect(stats.perTeam.ops.cost.mean).toBeCloseTo(500, 4);
  });
});

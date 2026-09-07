/**
 * Where the elapsed time that is NOT work goes, split into the two kinds that
 * have different remedies.
 *
 * The Simulator has always had three separate "waits" and priced none of them:
 * cost counts busy resource-hours only, so a process that takes three weeks
 * because of waiting costs the same as one that takes three hours. Before any
 * business case can put a number on waiting, the two kinds have to be measured
 * apart, because they are fixed by completely different things:
 *
 *   queueWait   — waiting for a person to be free. MORE CAPACITY SHORTENS IT.
 *   processWait — an authored non-seizing `waitTime`: the courier is collecting,
 *                 the overnight batch has not run. Capacity does NOTHING to it.
 *
 * Reporting them pooled would produce business cases recommending headcount to
 * fix waiting that headcount cannot touch.
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { makeRng } from "@/app/lib/simulation/rng";
import { aggregate, type RepStats } from "@/app/lib/simulation/statistics";
import type { SimNetwork } from "@/app/lib/simulation/model";
import { DEFAULT_RUN_CONFIG, type SimRunConfig } from "@/app/lib/simulation/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({ ...DEFAULT_RUN_CONFIG, horizon: 500, replications: 1, seed: 7, ...over });

/** One source → one task → sink. `capacity` drives queueing; `wait` is the
 *  authored non-seizing delay after the task. */
function net(opts: { cycle: number; wait?: number; capacity: number; every: number }): SimNetwork {
  return {
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "fixed", value: opts.every }, maxArrivals: 10 },
      {
        id: "task", kind: "task", label: "Do the work", teamId: "Team",
        cycleTime: { kind: "fixed", value: opts.cycle },
        ...(opts.wait ? { waitTime: { kind: "fixed", value: opts.wait } as const } : {}),
      },
      { id: "end", kind: "sink" },
    ],
    edges: [
      { id: "e1", source: "src", target: "task" },
      { id: "e2", source: "task", target: "end" },
    ],
    teams: [{ id: "Team", capacity: opts.capacity }],
  };
}

const run = (n: SimNetwork, c = cfg()) => new Engine(n, c, makeRng(c.seed)).run();

describe("the two waits are measured apart", () => {
  it("T3397 - an authored waitTime is counted as process wait, and does not become queue wait", () => {
    // Capacity 2 and arrivals every 10 with a 3-unit task: nothing ever queues.
    const r = run(net({ cycle: 3, wait: 5, capacity: 2, every: 10 }));
    expect(r.completed).toBeGreaterThan(0);
    expect(r.processWaitTotal).toBeCloseTo(5 * r.completed, 5);
    expect(r.queueWaitTotal).toBe(0);
  });

  it("T3398 - queueing for a busy team is counted as queue wait, and does not become process wait", () => {
    // One person, work arriving faster than it can be done: a real queue, and
    // no authored wait anywhere in the model.
    const r = run(net({ cycle: 8, capacity: 1, every: 2 }));
    expect(r.queueWaitTotal).toBeGreaterThan(0);
    expect(r.processWaitTotal).toBe(0);
  });

  it("T3399 - the two are independent: adding capacity cuts queue wait and leaves process wait alone", () => {
    const tight = run(net({ cycle: 8, wait: 5, capacity: 1, every: 2 }));
    const roomy = run(net({ cycle: 8, wait: 5, capacity: 4, every: 2 }));
    expect(roomy.queueWaitTotal!).toBeLessThan(tight.queueWaitTotal!);
    // ...and the courier is no faster for having more staff.
    expect(roomy.processWaitTotal! / roomy.completed).toBeCloseTo(5, 5);
    expect(tight.processWaitTotal! / tight.completed).toBeCloseTo(5, 5);
  });

  it("T3400 - waiting is part of elapsed time even though it costs no resource hours", () => {
    const without = run(net({ cycle: 3, capacity: 2, every: 10 }));
    const withWait = run(net({ cycle: 3, wait: 5, capacity: 2, every: 10 }));
    // the case takes longer...
    expect(withWait.avgFlowTime).toBeGreaterThan(without.avgFlowTime);
    // ...but nobody was working, so utilisation (and therefore cost) is unchanged
    expect(withWait.perTeam.Team.utilization).toBeCloseTo(without.perTeam.Team.utilization, 5);
  });

  it("T3401 - warm-up discards both, like every other statistic", () => {
    const n = net({ cycle: 3, wait: 5, capacity: 2, every: 10 });
    const all = run(n, cfg({ warmUp: 0 }));
    const warmed = run(n, cfg({ warmUp: 60 }));
    expect(warmed.processWaitTotal!).toBeLessThan(all.processWaitTotal!);
  });

  it("T3402 - aggregate reports the split, and OMITS it for runs that predate the measurement", () => {
    const { stats } = runMonteCarlo(net({ cycle: 8, wait: 5, capacity: 1, every: 2 }), cfg({ replications: 3 }));
    expect(stats.processWait?.mean).toBeGreaterThan(0);
    expect(stats.queueWait?.mean).toBeGreaterThan(0);

    // An older run carries neither field. Reporting 0 would be a lie — "no
    // waiting" and "never measured" are different answers.
    const legacy: RepStats = { arrived: 5, completed: 5, avgFlowTime: 10, perNode: {}, perTeam: {} };
    const old = aggregate([legacy]);
    expect(old.processWait).toBeUndefined();
    expect(old.queueWait).toBeUndefined();
  });
});

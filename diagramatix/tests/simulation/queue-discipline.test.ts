/**
 * Queue discipline, priority, and the service level PER SEGMENT.
 *
 * Every queue in the engine was first-in-first-out. Real departments are not:
 * urgent cases jump, complaints have a clock, someone is always expediting. And
 * a POOLED p95 can look healthy while the segment that matters most misses its
 * target entirely — the commonest way a simulation flatters a process.
 *
 * The first test is the important one. This is an engine change, so the bar is
 * that a model declaring none of it behaves EXACTLY as it did before.
 */
import { describe, it, expect } from "vitest";
import { ResourcePool } from "@/app/lib/simulation/resourcePool";
import { Engine } from "@/app/lib/simulation/engine";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { makeRng } from "@/app/lib/simulation/rng";
import type { SimNetwork } from "@/app/lib/simulation/model";
import { DEFAULT_RUN_CONFIG, type SimRunConfig } from "@/app/lib/simulation/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({ ...DEFAULT_RUN_CONFIG, horizon: 400, replications: 1, seed: 5, ...over });

/** One team, one task, arrivals faster than it can serve — a real queue. */
function net(opts: { discipline?: "fifo" | "priority" | "shortest-first"; segments?: boolean } = {}): SimNetwork {
  return {
    nodes: [
      {
        id: "src", kind: "source", arrival: { kind: "fixed", value: 2 }, maxArrivals: 12,
        ...(opts.segments
          ? {
              assign: [
                // Ordinary property assignments — no new token concept.
                { property: "segment", value: { expr: "1" } },
              ],
            }
          : {}),
      },
      { id: "task", kind: "task", label: "Work", teamId: "Team", cycleTime: { kind: "fixed", value: 6 } },
      { id: "end", kind: "sink" },
    ],
    edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "end" }],
    teams: [{ id: "Team", capacity: 1, ...(opts.discipline ? { discipline: opts.discipline } : {}) }],
  };
}

describe("queue discipline — the regression bar", () => {
  it("T3458 - a model that declares no discipline runs BIT-IDENTICALLY to before", () => {
    // Same network, one with the field absent and one explicitly "fifo": the
    // default must be the old behaviour, not merely close to it.
    const bare = new Engine(net(), cfg(), makeRng(5)).run();
    const explicit = new Engine(net({ discipline: "fifo" }), cfg(), makeRng(5)).run();
    expect(explicit).toEqual(bare);
  });

  it("T3459 - a segment-free model reports no per-segment split at all", () => {
    const { stats } = runMonteCarlo(net(), cfg({ replications: 3 }));
    expect(stats.caseFlowBySegment).toBeUndefined();
  });
});

describe("queue discipline — the pool", () => {
  const drain = <T,>(p: ResourcePool<T>) => p.release(10, 1);

  it("T3460 - FIFO serves in arrival order regardless of priority", () => {
    const p = new ResourcePool<string>(1, 0, "fifo");
    p.request(0, 1, "in-service");
    p.request(0, 1, "first", { priority: 0 });
    p.request(0, 1, "second", { priority: 99 });
    expect(drain(p)).toEqual(["first"]);
  });

  it("T3461 - a priority queue serves the urgent case first, and is FIFO within a priority", () => {
    const p = new ResourcePool<string>(1, 0, "priority");
    p.request(0, 1, "in-service");
    p.request(0, 1, "routine-a", { priority: 0 });
    p.request(0, 1, "urgent", { priority: 10 });
    p.request(0, 1, "routine-b", { priority: 0 });
    expect(p.release(10, 1)).toEqual(["urgent"]);
    expect(p.release(20, 1)).toEqual(["routine-a"]);   // arrival order preserved
    expect(p.release(30, 1)).toEqual(["routine-b"]);
  });

  it("T3462 - shortest-first serves the quick job first; an unknown length never jumps ahead", () => {
    const p = new ResourcePool<string>(1, 0, "shortest-first");
    p.request(0, 1, "in-service");
    p.request(0, 1, "long", { serviceEstimate: 100 });
    p.request(0, 1, "unknown");
    p.request(0, 1, "short", { serviceEstimate: 2 });
    expect(p.release(10, 1)).toEqual(["short"]);
    expect(p.release(20, 1)).toEqual(["long"]);
    expect(p.release(30, 1)).toEqual(["unknown"]);
  });

  it("T3463 - head-of-line blocking is kept: nothing is served past a request that does not fit", () => {
    const p = new ResourcePool<string>(2, 0, "fifo");
    p.request(0, 1, "holder");     // granted: 1 of 2 busy
    p.request(0, 2, "needs-two");  // 1+2 > 2, so it waits — at the head of the queue
    // A brand-new request still takes free capacity on arrival, even with someone
    // larger already waiting. That is admission at arrival, not queue ordering,
    // and it is pre-existing behaviour left deliberately alone.
    p.request(0, 1, "needs-one");  // granted: 1+1 = 2, the pool is now full

    // Releasing one unit leaves 1 free. The head needs 2, so NOTHING is served —
    // even though a smaller request behind it would fit. That is head-of-line
    // blocking, and serving past it would change every existing model's results.
    expect(p.release(10, 1)).toEqual([]);
    expect(p.queueLength).toBe(1);
  });

  it("T3464 - changing discipline mid-run re-orders those already waiting", () => {
    const p = new ResourcePool<string>(1, 0, "fifo");
    p.request(0, 1, "in-service");
    p.request(0, 1, "routine", { priority: 0 });
    p.request(0, 1, "urgent", { priority: 5 });
    p.setDiscipline(5, "priority");                 // the department starts triaging
    expect(p.release(10, 1)).toEqual(["urgent"]);
  });

  it("T3465 - discipline and ordering survive a snapshot, so a resumed run queues the same way", () => {
    const p = new ResourcePool<string>(1, 0, "priority");
    p.request(0, 1, "in-service");
    p.request(0, 1, "routine", { priority: 0 });
    p.request(0, 1, "urgent", { priority: 5 });
    const revived = ResourcePool.fromJSON(JSON.parse(JSON.stringify(p.toJSON())));
    expect(revived.release(10, 1)).toEqual(["urgent"]);
  });

  it("T3466 - an older snapshot with no discipline resumes as FIFO", () => {
    const p = new ResourcePool<string>(1, 0, "fifo");
    p.request(0, 1, "in-service");
    p.request(0, 1, "a", { priority: 0 });
    p.request(0, 1, "b", { priority: 9 });
    const legacy = JSON.parse(JSON.stringify(p.toJSON())) as Record<string, unknown>;
    delete legacy.discipline; delete legacy.seqCounter;
    const revived = ResourcePool.fromJSON(legacy as never);
    expect(revived.release(10, 1)).toEqual(["a"]);
  });
});

/** Two streams into ONE team: urgent work and routine work. Exactly the shape
 *  the audit describes — a pooled p95 that looks healthy while the segment that
 *  matters misses its target. */
function triage(discipline: "fifo" | "priority"): SimNetwork {
  const src = (id: string, seg: string, prio: number, start: number) => ({
    id, kind: "source" as const,
    arrival: { kind: "fixed" as const, value: 4 },
    maxArrivals: 10,
    assign: [
      { property: "priority", value: { expr: String(prio) } },
      { property: "segment", value: { expr: '"' + seg + '"' } },
    ],
  });
  return {
    nodes: [
      src("urgentSrc", "urgent", 10, 0),
      src("routineSrc", "routine", 0, 0),
      { id: "task", kind: "task", label: "Handle", teamId: "Team", cycleTime: { kind: "fixed", value: 6 } },
      { id: "end", kind: "sink" },
    ],
    edges: [
      { id: "e1", source: "urgentSrc", target: "task" },
      { id: "e2", source: "routineSrc", target: "task" },
      { id: "e3", source: "task", target: "end" },
    ],
    teams: [{ id: "Team", capacity: 1, discipline }],
    properties: [{ name: "priority", init: 0 }, { name: "segment", init: "" }],
  };
}

describe("queue discipline — end to end, and per segment", () => {
  it("T3468 - the service level is reported PER SEGMENT, not just pooled", () => {
    const { stats } = runMonteCarlo(triage("priority"), cfg({ replications: 2, horizon: 600 }));
    expect(stats.caseFlowBySegment).toBeDefined();
    expect(Object.keys(stats.caseFlowBySegment!).sort()).toEqual(["routine", "urgent"]);
    // ...and the pooled figure still exists alongside it, never instead of it
    expect(stats.caseFlow.count).toBeGreaterThan(0);
  });

  it("T3469 - triaging gets urgent cases through faster, at the routine cases' expense", () => {
    const opts = cfg({ replications: 2, horizon: 600 });
    const fifo = runMonteCarlo(triage("fifo"), opts).stats.caseFlowBySegment!;
    const prio = runMonteCarlo(triage("priority"), opts).stats.caseFlowBySegment!;

    expect(prio.urgent.p95).toBeLessThan(fifo.urgent.p95);
    // The work does not get done faster overall — someone else waits for it.
    expect(prio.routine.p95).toBeGreaterThanOrEqual(fifo.routine.p95);
  });

  it("T3470 - the POOLED figure can hide it: the whole barely moves while a segment does", () => {
    const opts = cfg({ replications: 2, horizon: 600 });
    const fifo = runMonteCarlo(triage("fifo"), opts).stats;
    const prio = runMonteCarlo(triage("priority"), opts).stats;
    const pooledShift = Math.abs(prio.caseFlow.p95 - fifo.caseFlow.p95);
    const urgentShift = Math.abs(prio.caseFlowBySegment!.urgent.p95 - fifo.caseFlowBySegment!.urgent.p95);
    // This is the whole argument for reporting segments: the urgent stream moves
    // substantially more than the pooled number suggests anything happened.
    expect(urgentShift).toBeGreaterThan(pooledShift);
  });
});

describe("queue discipline — it actually changes the answer", () => {
  it("T3467 - prioritising does not change the total work done, only who waits", () => {
    const fifo = runMonteCarlo(net({ discipline: "fifo" }), cfg({ replications: 2 }));
    const prio = runMonteCarlo(net({ discipline: "priority" }), cfg({ replications: 2 }));
    // With no priorities assigned the two are the same run: a priority queue where
    // every case has priority 0 IS a FIFO queue.
    expect(prio.stats.completed.mean).toBe(fifo.stats.completed.mean);
  });
});

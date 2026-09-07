/**
 * Batching and cut-off times.
 *
 * Smaller item 03. Back-office work is full of "posted at 4pm" and "processed in
 * batches of 50", and both change queueing behaviour completely: work gathers
 * doing nothing, then moves all at once. A model that cannot express it reports a
 * steady trickle where the real process has a daily cliff.
 *
 * The trade the feature exists to show is the one worth pinning: batching makes
 * the TEAM do less work while making individual CASES wait longer.
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { makeRng } from "@/app/lib/simulation/rng";
import type { SimNetwork, SimNode } from "@/app/lib/simulation/model";
import { DEFAULT_RUN_CONFIG, type SimRunConfig } from "@/app/lib/simulation/types";

/** Hours, so the cut-off times below read as wall-clock. */
const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig =>
  ({ ...DEFAULT_RUN_CONFIG, clockUnit: "hour", horizon: 72, replications: 1, seed: 3, ...over });

function net(batch?: SimNode["batch"], opts: { arrivals?: number; cycle?: number; capacity?: number } = {}): SimNetwork {
  return {
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "fixed", value: 1 }, maxArrivals: opts.arrivals ?? 6 },
      {
        id: "post", kind: "task", label: "Post to the ledger", teamId: "Team",
        cycleTime: { kind: "fixed", value: opts.cycle ?? 1 },
        ...(batch ? { batch } : {}),
      },
      { id: "end", kind: "sink" },
    ],
    edges: [{ id: "e1", source: "src", target: "post" }, { id: "e2", source: "post", target: "end" }],
    teams: [{ id: "Team", capacity: opts.capacity ?? 1 }],
  };
}

const run = (n: SimNetwork, c = cfg()) => new Engine(n, c, makeRng(c.seed)).run();

describe("batching — the regression bar", () => {
  it("T3483 - a task with no batch behaves exactly as before", () => {
    const bare = run(net());
    const emptyBatch = run(net({}));            // a batch with neither rule set is not a batch
    const sizeOne = run(net({ size: 1 }));      // a batch of one is not a batch either
    expect(emptyBatch).toEqual(bare);
    expect(sizeOne).toEqual(bare);
  });
});

describe("batching — by size", () => {
  it("T3484 - cases wait until the batch is full, then all go together", () => {
    // 6 arrivals one hour apart, batches of 3. Nothing completes until the third
    // arrives; then three complete together.
    const r = run(net({ size: 3 }, { arrivals: 6 }));
    expect(r.completed).toBe(6);
    // One service per BATCH, not per case: the team did two pieces of work.
    expect(r.perNode.post.count).toBe(2);
  });

  it("T3485 - a part-full batch never goes, so those cases are still waiting at the end", () => {
    // 5 arrivals, batches of 3: one full batch of 3 goes, 2 are left waiting.
    const r = run(net({ size: 3 }, { arrivals: 5 }));
    expect(r.completed).toBe(3);
    expect(r.arrived).toBe(5);
  });

  it("T3486 - batching costs the CASES time and saves the TEAM work", () => {
    const solo = run(net(undefined, { arrivals: 6 }));
    const batched = run(net({ size: 3 }, { arrivals: 6 }));
    // The team touches the work half as often...
    expect(batched.perNode.post.count).toBeLessThan(solo.perNode.post.count);
    // ...and each case takes longer to get through, because it waits for the batch.
    expect(batched.avgFlowTime).toBeGreaterThan(solo.avgFlowTime);
  });
});

describe("batching — by cut-off", () => {
  it("T3487 - whatever has gathered goes at the cut-off, full or not", () => {
    // Arrivals hourly from t=0 (Monday 00:00). A 04:00 cut-off takes the four
    // that arrived before it; the rest go at the next day's cut-off.
    const r = run(net({ cutoff: "04:00" }, { arrivals: 6 }), cfg({ horizon: 72 }));
    expect(r.completed).toBe(6);
    expect(r.perNode.post.count).toBeGreaterThanOrEqual(2);   // more than one posting run
    expect(r.perNode.post.count).toBeLessThan(6);             // but not one per case
  });

  it("T3488 - size and cut-off together: EITHER rule can send the batch", () => {
    // Batches of 2 with a 04:00 cut-off, six arrivals an hour apart. Size fills
    // and sends twice early on; the cut-off then sends what has gathered by 04:00
    // even though it is only a part-batch; the remainder waits for the NEXT
    // cut-off. Four postings, not three — and the part-batch going at the cut-off
    // is the point of having a cut-off at all.
    const r = run(net({ size: 2, cutoff: "04:00" }, { arrivals: 6 }));
    expect(r.completed).toBe(6);
    expect(r.perNode.post.count).toBe(4);
  });

  it("T3492 - a cut-off still fires after a size-triggered batch has gone", () => {
    // The specific behaviour above, isolated: with size never reached, the
    // cut-off alone is what sends the work.
    const sizeOnly = run(net({ size: 2 }, { arrivals: 5 }));
    expect(sizeOnly.completed).toBe(4);            // the 5th waits for a partner
    const withCutoff = run(net({ size: 2, cutoff: "04:00" }, { arrivals: 5 }));
    expect(withCutoff.completed).toBe(5);          // the cut-off releases the straggler
  });

  it("T3489 - the cut-off is armed once per batch, not once per arrival", () => {
    // Six arrivals before a single cut-off must produce ONE posting run, not six.
    const r = run(net({ cutoff: "12:00" }, { arrivals: 6 }), cfg({ horizon: 48 }));
    expect(r.perNode.post.count).toBe(1);
    expect(r.completed).toBe(6);
  });
});

describe("batching — it survives the machinery around it", () => {
  it("T3490 - a batch is carried through a snapshot, so parked cases are not lost", () => {
    const n = net({ size: 4 }, { arrivals: 6 });
    const c = cfg();
    const e = new Engine(n, c, makeRng(c.seed));
    e.runUntil(2);                               // part-way, with cases parked
    const snap = JSON.parse(JSON.stringify(e.snapshot()));
    const revived = Engine.resume(n, c, snap);
    const finished = revived.run();
    // The uninterrupted run is the reference: a snapshot must change nothing.
    const straight = run(n, c);
    expect(finished.completed).toBe(straight.completed);
    expect(finished.perNode.post.count).toBe(straight.perNode.post.count);
  });

  it("T3491 - Monte-Carlo aggregation is unaffected: batching is per-replication behaviour", () => {
    const { stats } = runMonteCarlo(net({ size: 3 }, { arrivals: 6 }), cfg({ replications: 3 }));
    expect(stats.completed.mean).toBe(6);
    expect(stats.replications).toBe(3);
  });
});

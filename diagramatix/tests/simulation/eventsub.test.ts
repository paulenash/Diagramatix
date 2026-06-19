/**
 * Event Subprocesses inside an Expanded Subprocess:
 *  • non-interrupting — a handler runs ALONGSIDE the parent (and is missed if
 *    the parent scope has already finished when the timer fires);
 *  • interrupting — cancels the parent scope's in-flight work, RELEASES its
 *    held resources, and diverts to the handler which becomes the continuation.
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import type { SimNetwork, SimNode } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 4000, warmUp: 0, replications: 1, seed: 3, collectQueues: true, ...over,
});

function netNonInterrupting(triggerAt: number): SimNetwork {
  const S: SimNode = {
    id: "S", kind: "subprocess", bodyStart: "b1",
    eventSubs: [{ id: "ev", bodyStart: "h1", trigger: { kind: "fixed", value: triggerAt }, interrupting: false }],
  };
  return {
    teams: [],
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "fixed", value: 1000 }, maxArrivals: 1 },
      S,
      { id: "b1", kind: "task", scope: "S", cycleTime: { kind: "fixed", value: 100 } },
      { id: "bend", kind: "sink", scope: "S" },
      { id: "h1", kind: "task", scope: "ev", cycleTime: { kind: "fixed", value: 5 } },
      { id: "hend", kind: "sink", scope: "ev" },
      { id: "end", kind: "sink" },
    ],
    edges: [
      { id: "e1", source: "src", target: "S" },
      { id: "e2", source: "S", target: "end" },
      { id: "e3", source: "b1", target: "bend" },
      { id: "e4", source: "h1", target: "hend" },
    ],
  };
}

describe("non-interrupting event subprocess", () => {
  it("fires a handler alongside the parent while the scope is active", () => {
    const r = new Engine(netNonInterrupting(10), cfg()).run(); // fires at t=1010, body runs 1000..1100
    expect(r.completed).toBe(1);          // parent finished normally
    expect(r.perNode.b1.count).toBe(1);   // parent body ran
    expect(r.perNode.h1.count).toBe(1);   // handler fired + ran alongside
  });

  it("is missed if the scope has already finished when the timer fires", () => {
    const r = new Engine(netNonInterrupting(200), cfg()).run(); // body ends at 1100, trigger at 1200
    expect(r.completed).toBe(1);
    expect(r.perNode.h1).toBeUndefined(); // handler never ran
  });
});

describe("interrupting event subprocess", () => {
  it("cancels the parent's in-flight work, releases its resource, and diverts", () => {
    const S: SimNode = {
      id: "S", kind: "subprocess", bodyStart: "b1",
      eventSubs: [{ id: "ev", bodyStart: "h1", trigger: { kind: "fixed", value: 10 }, interrupting: true }],
    };
    const net: SimNetwork = {
      teams: [{ id: "T", capacity: 1 }],
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 1000 }, maxArrivals: 1 },
        S,
        { id: "b1", kind: "task", scope: "S", teamId: "T", cycleTime: { kind: "fixed", value: 100 } },
        { id: "bend", kind: "sink", scope: "S" },
        { id: "h1", kind: "task", scope: "ev", cycleTime: { kind: "fixed", value: 5 } },
        { id: "hend", kind: "sink", scope: "ev" },
        { id: "after", kind: "task", teamId: "T", cycleTime: { kind: "fixed", value: 5 } },
        { id: "end", kind: "sink" },
      ],
      edges: [
        { id: "e1", source: "src", target: "S" },
        { id: "e2", source: "S", target: "after" },
        { id: "e3", source: "after", target: "end" },
        { id: "e4", source: "b1", target: "bend" },
        { id: "e5", source: "h1", target: "hend" },
      ],
    };
    const r = new Engine(net, cfg()).run();
    // Token enters at 1000; interrupt at 1010 kills b1 (releasing T); handler runs
    // 5 → continues to `after` (re-seizes the freed T) 5 → end at ~1020.
    expect(r.completed).toBe(1);
    expect(r.perNode.h1.count).toBe(1);      // handler ran
    expect(r.perNode.after.count).toBe(1);   // proves T was released (after could seize it)
    expect(r.avgFlowTime).toBeLessThan(50);  // diverted at 1010, NOT the full 100-min body
  });
});

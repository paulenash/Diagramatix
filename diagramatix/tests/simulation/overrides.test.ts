/**
 * Sparse scenario overrides deep-merge over a baseline network without ever
 * mutating it — the baseline is shared across every scenario in a run.
 */
import { describe, it, expect } from "vitest";
import { applyOverrides, isEmptyOverride, type OverrideSet } from "@/app/lib/simulation/overrides";
import type { SimNetwork } from "@/app/lib/simulation/model";

const baseline: SimNetwork = {
  nodes: [
    { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 } },
    { id: "t1", kind: "task", cycleTime: { kind: "fixed", value: 5 }, teamId: "ops", units: 1 },
    { id: "end", kind: "sink" },
  ],
  edges: [
    { id: "e1", source: "src", target: "t1", probability: 0.5 },
    { id: "e2", source: "t1", target: "end" },
  ],
  teams: [{ id: "ops", capacity: 3 }],
};

describe("applyOverrides", () => {
  it("treats an absent / empty override set as a no-op clone", () => {
    expect(isEmptyOverride(undefined)).toBe(true);
    expect(isEmptyOverride({})).toBe(true);
    expect(isEmptyOverride({ elements: {} })).toBe(true);
    const out = applyOverrides(baseline);
    expect(out).not.toBe(baseline);                 // new object
    expect(out.nodes[1].cycleTime).toEqual({ kind: "fixed", value: 5 });
  });

  it("sparsely overrides node params, edge probability and team capacity", () => {
    const ov: OverrideSet = {
      elements: { t1: { cycleTime: { kind: "fixed", value: 9 } } },
      connectors: { e1: { probability: 0.8 } },
      teams: { ops: { capacity: 7 } },
    };
    const out = applyOverrides(baseline, ov);
    expect(out.nodes[1].cycleTime).toEqual({ kind: "fixed", value: 9 });
    expect(out.nodes[1].teamId).toBe("ops");        // untouched field preserved
    expect(out.edges[0].probability).toBe(0.8);
    expect(out.teams[0].capacity).toBe(7);
  });

  it("never mutates the baseline", () => {
    applyOverrides(baseline, {
      elements: { t1: { cycleTime: { kind: "fixed", value: 99 } } },
      teams: { ops: { capacity: 99 } },
    });
    expect(baseline.nodes[1].cycleTime).toEqual({ kind: "fixed", value: 5 });
    expect(baseline.teams[0].capacity).toBe(3);
  });

  it("creates a pool when a node override retargets to an unknown team", () => {
    const out = applyOverrides(baseline, { elements: { t1: { teamId: "specialists" } } });
    expect(out.nodes[1].teamId).toBe("specialists");
    expect(out.teams.find((t) => t.id === "specialists")?.capacity).toBe(1);
  });

  it("ignores unknown ids", () => {
    const out = applyOverrides(baseline, { elements: { nope: { units: 4 } } });
    expect(out.nodes.find((n) => n.id === "nope")).toBeUndefined();
  });
});

/**
 * Phase 0.3 — the recompute contract.
 *
 * "Recompute this run" sounds like one operation and is two. A live run still
 * has its raw events in a source buffer and can be rebuilt properly. A manually
 * imported run has no raw events anywhere — they were transient by design — so
 * only what derives from the stored variants can be redone.
 *
 * The dangerous version of this feature is the one that recomputes an
 * approximation from `variants` and presents it as a recomputation: a variant
 * knows its activity sequence and its frequency, and has no timestamps, no
 * resources and no attributes, so every timing it produced would be invented.
 * What is pinned here is mostly the refusing.
 */
import { describe, it, expect } from "vitest";
import { planRecompute, type RecomputeSubject } from "@/app/lib/mining/recompute";

const run = (over: Partial<RecomputeSubject> = {}): RecomputeSubject => ({
  hasVariants: true, hasSourceBuffer: false,
  discoveredBpmnId: null, discoveredSmId: null, referenceSmId: null,
  ...over,
});

describe("Phase 0.3 — a live run is rebuilt from its raw events", () => {
  it("T3747 - a source buffer means everything can be recomputed for real", () => {
    const p = planRecompute(run({ hasSourceBuffer: true }));
    expect(p.mode).toBe("source");
    expect(p.refused).toEqual([]);
    expect(p.willRebuild).toContain("analytics");
    expect(p.willRebuild).toContain("performance");
  });

  it("T3748 - an EMPTY buffer is not a live run", () => {
    // A source that exists but has never received anything cannot rebuild the
    // run; treating it as live would replace a real import with nothing.
    expect(planRecompute(run({ hasSourceBuffer: false })).mode).toBe("stored");
  });
});

describe("Phase 0.3 — an imported run rebuilds only what variants can support", () => {
  it("T3749 - the four per-event fields are refused BY NAME, every time", () => {
    // Named, not silently skipped: the user pressed a button called "recompute"
    // and is owed an account of what did not happen.
    const p = planRecompute(run({ discoveredBpmnId: "b" }));
    expect(p.refused.map((r) => r.field)).toEqual(["stats", "performance", "analytics", "governance"]);
    for (const r of p.refused) expect(r.why.length).toBeGreaterThan(20);
  });

  it("T3750 - each existing artefact is rebuilt, and only the ones that exist", () => {
    expect(planRecompute(run()).willRebuild).toEqual([]);
    expect(planRecompute(run({ discoveredBpmnId: "b" })).willRebuild).toEqual(["the discovered process"]);
    expect(planRecompute(run({ discoveredSmId: "s" })).willRebuild).toEqual(["the discovered state machine"]);
    expect(planRecompute(run({ referenceSmId: "r" })).willRebuild).toEqual(["conformance against the reference"]);
    expect(planRecompute(run({ discoveredBpmnId: "b", discoveredSmId: "s", referenceSmId: "r" })).willRebuild).toHaveLength(3);
  });

  it("T3751 - a run with nothing to rebuild SAYS so, rather than reporting success", () => {
    const p = planRecompute(run());
    expect(p.mode).toBe("stored");
    expect(p.willRebuild).toEqual([]);
    expect(p.message).toMatch(/nothing to rebuild/i);
    expect(p.message).toMatch(/re-import/i);
  });

  it("T3752 - the message never claims the imported figures changed", () => {
    const p = planRecompute(run({ discoveredBpmnId: "b" }));
    expect(p.message).toMatch(/unchanged/i);
  });
});

describe("Phase 0.3 — a run with no stored variants", () => {
  it("T3753 - is impossible to rebuild, and is told to re-import", () => {
    // The pre-variants runs, and any run whose import failed part-way. There is
    // no honest half-measure here.
    const p = planRecompute(run({ hasVariants: false }));
    expect(p.mode).toBe("impossible");
    expect(p.willRebuild).toEqual([]);
    expect(p.message).toMatch(/re-import the log/i);
  });

  it("T3754 - unless it is live, in which case the buffer wins", () => {
    // Source mode is checked first on purpose: a live run whose variants were
    // never written can still be rebuilt from raw events.
    expect(planRecompute(run({ hasVariants: false, hasSourceBuffer: true })).mode).toBe("source");
  });
});

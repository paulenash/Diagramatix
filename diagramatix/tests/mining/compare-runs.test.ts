/**
 * Phase 9 — nobody mines a process once.
 *
 * The risk here is different from every other phase. Elsewhere the danger is a
 * figure that is too precise. Here it is comparing two things that are not the
 * same process: link January's "Order to Cash" to February's "Complaints
 * Handling" by accident and every delta in the table is arithmetic on unrelated
 * numbers — and it looks exactly like a real regression. So the refusal is
 * tested before anything else.
 */
import { describe, it, expect } from "vitest";
import { compareRuns, fitnessHistory, orderSeries, MIN_VOCABULARY_OVERLAP, type ComparableRun } from "@/app/lib/mining/compareRuns";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

const HOUR = 3_600_000, DAY = 86_400_000;
const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", state: "st" };
const HEADERS = ["case", "act", "ts", "st"];

/** A run of `n` cases following `steps`, each step `gapH` hours after the last. */
function mk(id: string, at: string, steps: [string, string][], n: number, gapH = 1, conformance: ComparableRun["conformance"] = null): ComparableRun {
  const rows: string[][] = [];
  const t0 = Date.parse(at);
  for (let i = 0; i < n; i++) {
    steps.forEach(([act, st], k) => {
      rows.push([`${id}-${i}`, act, new Date(t0 + i * DAY + k * gapH * HOUR).toISOString(), st]);
    });
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { id, name: id, createdAt: at, analytics: computeAnalytics(log), variants: log.variants, conformance };
}

const O2C: [string, string][] = [["Receive", "New"], ["Check", "Checked"], ["Close", "Done"]];

describe("Phase 9 — refusing to compare unrelated processes", () => {
  it("T3893 - two processes sharing almost no steps are REFUSED, not diffed", () => {
    // The failure this exists for: every delta would be arithmetic on unrelated
    // numbers, and it would look exactly like a real regression.
    const a = mk("jan", "2026-01-01T00:00:00Z", O2C, 10);
    const b = mk("feb", "2026-02-01T00:00:00Z", [["Log complaint", "Logged"], ["Investigate", "Open"], ["Resolve", "Shut"]], 10);
    const c = compareRuns(a, b);
    expect(c.ok).toBe(false);
    expect(c.refusal).toMatch(/different processes/);
    expect(c.headline).toEqual([]);
  });

  it("T3894 - the SAME process at two times is compared", () => {
    const a = mk("jan", "2026-01-01T00:00:00Z", O2C, 10);
    const b = mk("feb", "2026-02-01T00:00:00Z", O2C, 12);
    const c = compareRuns(a, b);
    expect(c.ok).toBe(true);
    expect(c.overlap).toBe(1);
  });

  it("T3895 - a process that gained ONE step is still the same process", () => {
    // Deliberately generous. A process genuinely changes between periods, and
    // refusing on any difference would refuse the comparisons worth making.
    const a = mk("jan", "2026-01-01T00:00:00Z", O2C, 10);
    const b = mk("feb", "2026-02-01T00:00:00Z", [...O2C, ["Archive", "Archived"]], 10);
    const c = compareRuns(a, b);
    expect(c.ok).toBe(true);
    expect(c.overlap).toBeGreaterThanOrEqual(MIN_VOCABULARY_OVERLAP);
    expect(c.added).toEqual(["Archive"]);
  });

  it("T3896 - a run with no analytics is refused rather than compared to nothing", () => {
    const a = mk("jan", "2026-01-01T00:00:00Z", O2C, 10);
    const c = compareRuns(a, { ...a, id: "b", analytics: null });
    expect(c.ok).toBe(false);
    expect(c.refusal).toMatch(/no analytics/);
  });
});

describe("Phase 9 — what changed", () => {
  it("T3897 - the headline figures carry both values and the direction that is good", () => {
    const a = mk("jan", "2026-01-01T00:00:00Z", O2C, 10, 1);
    const b = mk("feb", "2026-02-01T00:00:00Z", O2C, 10, 4);      // four times slower
    const c = compareRuns(a, b);
    const cycle = c.headline.find((h) => h.label === "Median cycle time")!;
    expect(cycle.before).toBe(2 * HOUR);
    expect(cycle.after).toBe(8 * HOUR);
    expect(cycle.change).toBe(6 * HOUR);
    expect(cycle.changePct).toBe(3);                              // +300%
    expect(cycle.betterWhen).toBe("lower");
  });

  it("T3898 - a change from zero has NO percentage rather than an infinite one", () => {
    const a = mk("jan", "2026-01-01T00:00:00Z", O2C, 10);
    const b = mk("feb", "2026-02-01T00:00:00Z", O2C, 10);
    const zeroed: ComparableRun = { ...a, analytics: { ...a.analytics!, totalCases: 0 } };
    const cases = compareRuns(zeroed, b).headline.find((h) => h.label === "Cases")!;
    expect(cases.before).toBe(0);
    expect(cases.changePct).toBeNull();
  });

  it("T3899 - an activity absent from one run is ADDED or REMOVED, never zero", () => {
    // "0ms, down 100%" buries a change of shape inside a number.
    const a = mk("jan", "2026-01-01T00:00:00Z", O2C, 10);
    const b = mk("feb", "2026-02-01T00:00:00Z", [["Receive", "New"], ["Close", "Done"]], 10);
    const c = compareRuns(a, b);
    const check = c.activities.find((x) => x.activity === "Check")!;
    expect(check.status).toBe("removed");
    expect(check.afterMs).toBeNull();
    expect(check.changeMs).toBeNull();
    expect(c.removed).toEqual(["Check"]);
  });

  it("T3900 - activities are ranked by the SIZE of the change, in either direction", () => {
    const a = mk("jan", "2026-01-01T00:00:00Z", O2C, 10, 1);
    const b = mk("feb", "2026-02-01T00:00:00Z", O2C, 10, 5);
    const changed = compareRuns(a, b).activities.filter((x) => x.changeMs !== null);
    const sizes = changed.map((x) => Math.abs(x.changeMs!));
    expect([...sizes].sort((p, q) => q - p)).toEqual(sizes);
  });
});

describe("Phase 9 — conformance across a series", () => {
  const REFERENCE: ReferenceSm = {
    elements: [
      { id: "i", type: "initial-state" },
      { id: "s1", type: "state", label: "New" },
      { id: "s2", type: "state", label: "Checked" },
      { id: "s3", type: "state", label: "Done" },
      { id: "f", type: "final-state" },
    ],
    connectors: [
      { id: "t0", sourceId: "i", targetId: "s1", type: "transition" },
      { id: "t1", sourceId: "s1", targetId: "s2", type: "transition" },
      { id: "t2", sourceId: "s2", targetId: "s3", type: "transition" },
      { id: "t3", sourceId: "s3", targetId: "f", type: "transition" },
    ],
  };
  const conformed = (r: ComparableRun) => ({ ...r, conformance: checkTransitionConformance(r.variants, REFERENCE) });

  it("T3901 - a deviation that appeared is named, and one that went away is too", () => {
    const clean = conformed(mk("jan", "2026-01-01T00:00:00Z", O2C, 10));
    const skipping = conformed(mk("feb", "2026-02-01T00:00:00Z", [["Receive", "New"], ["Close", "Done"]], 10));
    // Same vocabulary either side is needed for the comparison to be allowed at
    // all, so give the later run both paths.
    const mixed = conformed(mk("feb", "2026-02-01T00:00:00Z", O2C, 8));
    const later: ComparableRun = {
      ...mixed,
      variants: [...mixed.variants, ...skipping.variants],
      conformance: checkTransitionConformance([...mixed.variants, ...skipping.variants], REFERENCE),
    };
    const c = compareRuns(clean, later);
    expect(c.ok).toBe(true);
    expect(c.newViolations.some((m) => m.includes("New → Done"))).toBe(true);
    expect(c.clearedViolations).toEqual([]);
  });

  it("T3902 - fitness is NOT compared when only one run was checked", () => {
    // One result and one absence is not a decline from 94% to nothing.
    const a = conformed(mk("jan", "2026-01-01T00:00:00Z", O2C, 10));
    const b = mk("feb", "2026-02-01T00:00:00Z", O2C, 10);
    const c = compareRuns(a, b);
    expect(c.headline.some((h) => h.label === "Conformance")).toBe(false);
    expect(c.notes.join(" ")).toMatch(/only one of these runs has been checked/);
  });

  it("T3903 - the fitness history is oldest-first, and an unchecked run is a GAP", () => {
    // A zero would draw a catastrophic dip for a run that was simply never
    // asked — the most alarming possible way to say nothing.
    const series = [
      conformed(mk("mar", "2026-03-01T00:00:00Z", O2C, 10)),
      mk("feb", "2026-02-01T00:00:00Z", O2C, 10),
      conformed(mk("jan", "2026-01-01T00:00:00Z", O2C, 10)),
    ];
    const h = fitnessHistory(series);
    expect(h.map((p) => p.runId)).toEqual(["jan", "feb", "mar"]);
    expect(h[1].fitness).toBeNull();
    expect(h[0].fitness).toBe(1);
  });
});

describe("Phase 9 — assembling the series", () => {
  const r = (id: string, parentRunId: string | null) => ({ id, parentRunId });

  it("T3904 - runs chain oldest-first through parentRunId", () => {
    const chain = orderSeries([r("c", "b"), r("a", null), r("b", "a")]);
    expect(chain.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("T3905 - a run whose parent is outside the set starts the chain", () => {
    // The parent may be in another project, or deleted. Walking to it would
    // invent an ancestor; starting there is the honest reading.
    expect(orderSeries([r("b", "gone"), r("c", "b")]).map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("T3906 - a cycle terminates rather than looping forever", () => {
    expect(orderSeries([r("a", "b"), r("b", "a")])).toEqual([]);
  });

  it("T3907 - a single unlinked run is a series of one", () => {
    expect(orderSeries([r("solo", null)]).map((x) => x.id)).toEqual(["solo"]);
  });
});

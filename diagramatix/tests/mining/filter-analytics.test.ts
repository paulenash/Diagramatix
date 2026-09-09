/**
 * Phase 5 — slicing a mined run.
 *
 * The filter rebuilds the analytics from the stored per-case index, because the
 * raw events are long gone. Two kinds of test here, and the second kind matters
 * more:
 *
 *  1. That a slice's figures are RIGHT — exactly what recomputing from the
 *     matching cases alone would give.
 *  2. That the figures a slice CANNOT support are refused rather than
 *     approximated. A filtered heat map computed from a run with no per-event
 *     durations would look completely normal and be fiction, and this feature's
 *     whole claim is that its numbers can be cited.
 */
import { describe, it, expect } from "vitest";
import {
  filterAnalytics, isFilterActive, describeFilter, EMPTY_FILTER, MIN_SLICE_CASES,
  type MiningFilter,
} from "@/app/lib/mining/filterAnalytics";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { LogMapping, Variant } from "@/app/lib/mining/types";

const HOUR = 3_600_000, DAY = 86_400_000;
const MAPPING: LogMapping = {
  caseId: "case", activity: "act", timestamp: "ts", resource: "who",
  attributeMode: { region: "keep" },
};
const HEADERS = ["case", "act", "ts", "who", "region"];

/**
 * Twelve cases. Six from "North" run Receive → Check → Close and are slow (the
 * check takes eight hours); six from "South" skip the check and are quick.
 * Built a day apart so a date filter has something to bite on.
 */
function run() {
  const rows: string[][] = [];
  const at = (day: number, h: number) => new Date(Date.parse("2026-05-01T00:00:00Z") + day * DAY + h * HOUR).toISOString();
  for (let i = 0; i < 6; i++) {
    rows.push([`n${i}`, "Receive", at(i, 0), "Ops", "North"]);
    rows.push([`n${i}`, "Check", at(i, 1), "Finance", "North"]);
    rows.push([`n${i}`, "Close", at(i, 9), "Ops", "North"]);        // 8h in Check
  }
  for (let i = 0; i < 6; i++) {
    rows.push([`s${i}`, "Receive", at(6 + i, 0), "Ops", "South"]);
    rows.push([`s${i}`, "Close", at(6 + i, 1), "Ops", "South"]);    // 1h total
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { analytics: computeAnalytics(log), variants: log.variants };
}

const north: MiningFilter = { attrs: { region: "North" } };
const act = (a: RunAnalytics, name: string) => a.activities.find((x) => x.activity === name);

describe("Phase 5 — the identity case", () => {
  it("T3791 - an inactive filter changes nothing and allocates nothing new", () => {
    // The common case by far. It must cost nothing and, more importantly, must
    // not quietly produce a rebuilt-but-slightly-different set of numbers.
    const { analytics, variants } = run();
    const out = filterAnalytics(analytics, variants, EMPTY_FILTER)!;
    expect(out.analytics).toBe(analytics);
    expect(out.variants).toBe(variants);
    expect(out.timeUnfiltered).toBe(false);
    expect(out.belowFloor).toBe(false);
  });

  it("T3792 - what counts as active", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ attrs: {} })).toBe(false);
    expect(isFilterActive(null)).toBe(false);
    expect(isFilterActive({ from: 1 })).toBe(true);
    expect(isFilterActive({ to: 1 })).toBe(true);
    expect(isFilterActive({ resource: "Ops" })).toBe(true);
    expect(isFilterActive({ attrs: { region: "North" } })).toBe(true);
  });

  it("T3793 - no analytics filters to nothing rather than throwing", () => {
    expect(filterAnalytics(null, [], north)).toBeNull();
  });
});

describe("Phase 5 — the slice's counts", () => {
  it("T3794 - only the matching cases survive", () => {
    const { analytics, variants } = run();
    const out = filterAnalytics(analytics, variants, north)!;
    expect(out.matched).toBe(6);
    expect(out.analytics.totalCases).toBe(6);
    expect(out.analytics.cases.every((c) => c.attrs?.region === "North")).toBe(true);
  });

  it("T3795 - the cycle distribution is the SLICE's, not the run's", () => {
    // The finding: North takes nine hours and South takes one. A filter that
    // left the cycle figures alone would hide exactly the thing it was used for.
    const { analytics, variants } = run();
    expect(filterAnalytics(analytics, variants, north)!.analytics.cycle.medianMs).toBe(9 * HOUR);
    expect(filterAnalytics(analytics, variants, { attrs: { region: "South" } })!.analytics.cycle.medianMs).toBe(HOUR);
  });

  it("T3796 - variant counts become a histogram of the slice, keeping their indices", () => {
    // Positions must not move: `variantIdx` on every case, and conformance's
    // case-weighting, both index into this array.
    const { analytics, variants } = run();
    const out = filterAnalytics(analytics, variants, north)!;
    expect(out.variants).toHaveLength(variants.length);
    out.variants.forEach((v, i) => expect(v.events).toEqual(variants[i].events));
    expect(out.variants.reduce((s, v) => s + v.count, 0)).toBe(6);
    // The three-step variant is the North one; the two-step variant is South's.
    const three = out.variants.find((v) => v.events.length === 3)!;
    const two = out.variants.find((v) => v.events.length === 2)!;
    expect(three.count).toBe(6);
    expect(two.count).toBe(0);
  });

  it("T3797 - throughput is rebuilt on the SAME buckets, so the axis cannot move", () => {
    // The chart is the date control. Re-bucketing under a brush the user is
    // dragging would move the ground beneath them.
    const { analytics, variants } = run();
    const out = filterAnalytics(analytics, variants, north)!;
    expect(out.analytics.throughput.map((b) => b.t)).toEqual(analytics.throughput.map((b) => b.t));
    expect(out.analytics.throughput.reduce((s, b) => s + b.started, 0)).toBe(6);
  });

  it("T3798 - a date range selects on the case's START", () => {
    const { analytics, variants } = run();
    const firstThree = Date.parse("2026-05-03T00:00:00Z");
    const out = filterAnalytics(analytics, variants, { to: firstThree })!;
    expect(out.matched).toBe(3);                                  // days 0, 1, 2
  });
});

describe("Phase 5 — the slice's timings", () => {
  it("T3799 - activity durations are recomputed from the slice", () => {
    const { analytics, variants } = run();
    const out = filterAnalytics(analytics, variants, north)!;
    expect(act(out.analytics, "Check")!.medianDurMs).toBe(8 * HOUR);
    expect(act(out.analytics, "Check")!.totalTimeMs).toBe(6 * 8 * HOUR);
    // South never checks, so the step is absent from that slice entirely —
    // not present with a zero.
    expect(act(filterAnalytics(analytics, variants, { attrs: { region: "South" } })!.analytics, "Check")).toBeUndefined();
  });

  it("T3800 - a filtered rebuild matches recomputing that slice from scratch", () => {
    // The strongest available check: the filtered numbers equal what the
    // importer would have produced had only those cases ever been in the log.
    const rows: string[][] = [];
    const at = (day: number, h: number) => new Date(Date.parse("2026-05-01T00:00:00Z") + day * DAY + h * HOUR).toISOString();
    for (let i = 0; i < 6; i++) {
      rows.push([`n${i}`, "Receive", at(i, 0), "Ops", "North"]);
      rows.push([`n${i}`, "Check", at(i, 1), "Finance", "North"]);
      rows.push([`n${i}`, "Close", at(i, 9), "Ops", "North"]);
    }
    const scratch = computeAnalytics(buildEventLog(HEADERS, rows, MAPPING));
    const { analytics, variants } = run();
    const sliced = filterAnalytics(analytics, variants, north)!.analytics;

    const norm = (list: RunAnalytics["activities"]) =>
      [...list].sort((a, b) => a.activity.localeCompare(b.activity))
        .map((a) => ({ activity: a.activity, caseFreq: a.caseFreq, eventFreq: a.eventFreq, median: a.medianDurMs, total: a.totalTimeMs, res: a.resources, states: a.states }));
    expect(norm(sliced.activities)).toEqual(norm(scratch.activities));
    expect(sliced.cycle).toEqual(scratch.cycle);
    const key = (e: { from: string; to: string }) => `${e.from}->${e.to}`;
    expect(sliced.edges.map(key).sort()).toEqual(scratch.edges.map(key).sort());
  });

  it("T3801 - edges are recomputed too, so the transitions table filters", () => {
    const { analytics, variants } = run();
    const out = filterAnalytics(analytics, variants, north)!;
    const e = out.analytics.edges.find((x) => x.from === "Check" && x.to === "Close")!;
    expect(e.freq).toBe(6);
    expect(e.medianMs).toBe(8 * HOUR);
    expect(e.totalMs).toBe(6 * 8 * HOUR);
  });

  it("T3802 - filtering by team keeps the cases that team touched", () => {
    const { analytics, variants } = run();
    const out = filterAnalytics(analytics, variants, { resource: "Finance" })!;
    expect(out.matched).toBe(6);                              // only the North six
    expect(out.analytics.cases.every((c) => c.caseId.startsWith("n"))).toBe(true);
  });

  it("T3803 - a team that does not exist matches nothing, rather than everything", () => {
    // Silently dropping an unsatisfiable clause would show the whole run under a
    // filter chip claiming otherwise — the exact failure the seam exists for.
    const { analytics, variants } = run();
    expect(filterAnalytics(analytics, variants, { resource: "Nobody" })!.matched).toBe(0);
  });
});

describe("Phase 5 — what a slice refuses to claim", () => {
  it("T3804 - a run with no per-event detail hands back WHOLE-RUN timings, flagged", () => {
    // Never averaged, never narrowed, never silently omitted. The caller shows
    // the whole-run number with a "not filtered" chip beside it.
    const { analytics, variants } = run();
    const countsOnly: RunAnalytics = { ...analytics, detail: "counts" };
    const out = filterAnalytics(countsOnly, variants, north)!;
    expect(out.timeUnfiltered).toBe(true);
    expect(out.analytics.activities).toBe(analytics.activities);   // untouched
    expect(out.analytics.edges).toBe(analytics.edges);
    // …while the COUNTS still filter, because the case index alone supports them.
    expect(out.matched).toBe(6);
    expect(out.analytics.cycle.medianMs).toBe(9 * HOUR);
  });

  it("T3805 - a run imported before per-event vectors existed behaves the same way", () => {
    const { analytics, variants } = run();
    const legacy: RunAnalytics = { ...analytics, detail: undefined };
    expect(filterAnalytics(legacy, variants, north)!.timeUnfiltered).toBe(true);
  });

  it("T3806 - a slice with too few cases is flagged below the floor", () => {
    const { analytics, variants } = run();
    const one = filterAnalytics(analytics, variants, { attrs: { region: "North" }, to: Date.parse("2026-05-01T12:00:00Z") })!;
    expect(one.matched).toBeLessThan(MIN_SLICE_CASES);
    expect(one.belowFloor).toBe(true);
    // The counts are still reported — it is the distributions that are refused.
    expect(one.analytics.totalCases).toBe(one.matched);
  });

  it("T3807 - a slice at the floor is not flagged", () => {
    const { analytics, variants } = run();
    expect(filterAnalytics(analytics, variants, north)!.belowFloor).toBe(false);
  });

  it("T3808 - on a strided run, the matching count is SCALED and the raw count kept", () => {
    // 1-in-10: 6 stored matches stand for about 60 real cases. Reporting 6 would
    // be as wrong as reporting 60 without saying it is an estimate — so both
    // numbers are returned and the caller labels them.
    const { analytics, variants } = run();
    const strided: RunAnalytics = { ...analytics, capped: true, totalCases: 120 };
    const out = filterAnalytics(strided, variants, north)!;
    expect(out.matched).toBe(6);
    expect(out.estimatedCases).toBe(60);
    expect(out.analytics.totalCases).toBe(60);
  });
});

describe("Phase 5 — saying what is being shown", () => {
  it("T3809 - the filter describes itself for the chip and the report header", () => {
    expect(describeFilter(EMPTY_FILTER)).toBeNull();
    expect(describeFilter({ attrs: { region: "North" } })).toBe("region = North");
    expect(describeFilter({ resource: "Finance" })).toBe("team Finance");
    const both = describeFilter({ from: Date.parse("2026-05-01T00:00:00Z"), to: Date.parse("2026-05-31T00:00:00Z"), attrs: { region: "North" }, resource: "Finance" });
    expect(both).toBe("2026-05-01 to 2026-05-31 · region = North · team Finance");
  });

  it("T3810 - an open-ended range reads as open-ended", () => {
    expect(describeFilter({ from: Date.parse("2026-05-01T00:00:00Z") })).toBe("from 2026-05-01");
    expect(describeFilter({ to: Date.parse("2026-05-31T00:00:00Z") })).toBe("up to 2026-05-31");
  });
});

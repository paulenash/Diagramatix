/**
 * Slicing a mined run — the thing that turns a finding into a cause.
 *
 * "Invoices take nine days" is an observation. "Invoices from the Northern
 * region over £10,000 take nine days and everything else takes two" is a cause,
 * and the difference is entirely this module.
 *
 * It rebuilds the analytics from the stored per-case index rather than from raw
 * events, which no longer exist. Phase 1 is what makes that possible: each case
 * carries its variant, its start and end, and — when the run could afford it —
 * a per-event duration and resource vector. A variant supplies the activity
 * sequence those vectors line up with, so a filtered activity table, a filtered
 * heat map and filtered transition times are all reconstructable exactly.
 *
 * WHAT IT REFUSES TO DO IS THE POINT.
 *
 *  - A run whose per-event vectors are missing (too large for the budget, or
 *    imported before they existed) cannot honour a time-shaped filter. Its
 *    activity and edge figures are passed through UNCHANGED and flagged, so the
 *    caller shows a whole-run number and says so. They are never averaged,
 *    scaled, or quietly narrowed — a plausible wrong number is worse here than
 *    an honest gap, because the entire claim of this feature is that its figures
 *    can be cited.
 *  - A slice with very few cases reports its counts and refuses distributions.
 *    A median over three cases is not a median.
 *  - When the case index is a 1-in-N stride of a large run, every filtered
 *    figure is an estimate and the caller is told the stride.
 *
 * Pure — no DB, no React.
 */

import { quantile, sortedNums } from "./analytics";
import type { ActivityMetric, CaseSummary, EdgeMetric, RunAnalytics, ThroughputBucket } from "./analytics";
import type { MiningStats, Variant } from "./types";

/** What the user has narrowed the run to. All fields are AND-ed. */
export interface MiningFilter {
  /** Case START at or after this instant. */
  from?: number | null;
  /** Case START at or before this instant. */
  to?: number | null;
  /** Kept column → required value. */
  attrs?: Record<string, string>;
  /** A team that worked on the case at least once. */
  resource?: string | null;
}

export const EMPTY_FILTER: MiningFilter = {};

export function isFilterActive(f: MiningFilter | null | undefined): boolean {
  if (!f) return false;
  return f.from != null || f.to != null || !!f.resource || Object.keys(f.attrs ?? {}).length > 0;
}

/**
 * Below this many matching cases, a slice reports counts and refuses
 * distributions. Three cases have a median in the arithmetic sense and not in
 * any sense a reader would mean by it.
 */
export const MIN_SLICE_CASES = 5;

export interface FilteredRun {
  analytics: RunAnalytics;
  variants: Variant[];
  /** Matching cases in the STORED index. */
  matched: number;
  /** Matching cases in the real log — scaled by the stride when the index is a
   *  sample, equal to `matched` when it is complete. */
  estimatedCases: number;
  /** True when the time-shaped figures are the WHOLE-RUN ones, because this run
   *  cannot honour a time filter. The caller must label them. */
  timeUnfiltered: boolean;
  /** True when there are too few matching cases to quote a distribution. */
  belowFloor: boolean;
  /** 1 when the case index is complete; N when it is a 1-in-N stride. Every
   *  scaled figure in a slice uses this ONE number, so they cannot disagree
   *  with each other. */
  stride: number;
}

/** Does one case match? */
function matches(c: CaseSummary, f: MiningFilter, resourceIdx: number | null): boolean {
  if (f.from != null && c.startMs < f.from) return false;
  if (f.to != null && c.startMs > f.to) return false;
  for (const [k, v] of Object.entries(f.attrs ?? {})) {
    if ((c.attrs?.[k] ?? "") !== v) return false;
  }
  if (resourceIdx !== null && !(c.res ?? []).includes(resourceIdx)) return false;
  return true;
}

/** Rebuild the throughput chart on the SAME buckets, so the axis does not move
 *  under a brush the user is dragging. */
function rebuildThroughput(original: ThroughputBucket[], cases: CaseSummary[]): ThroughputBucket[] {
  if (original.length < 2) return original.map((b) => ({ ...b, started: 0, completed: 0 }));
  const width = original[1].t - original[0].t;
  const lo = original[0].t - width / 2;
  const N = original.length;
  const out = original.map((b) => ({ t: b.t, started: 0, completed: 0 }));
  const bucket = (ts: number) => Math.max(0, Math.min(N - 1, Math.floor((ts - lo) / width)));
  for (const c of cases) { out[bucket(c.startMs)].started++; out[bucket(c.endMs)].completed++; }
  return out;
}

/** Rebuild the per-activity and per-edge metrics from the filtered cases. */
function rebuildTimings(cases: CaseSummary[], variants: Variant[], dict: string[]) {
  const durByActivity = new Map<string, number[]>();
  const caseSetByActivity = new Map<string, Set<number>>();
  const eventCount = new Map<string, number>();
  const resByActivity = new Map<string, Map<string, number>>();
  const statesByActivity = new Map<string, Set<string>>();
  const edgeDur = new Map<string, number[]>();

  cases.forEach((c, ci) => {
    const v = variants[c.variantIdx];
    if (!v) return;                       // a case whose variant could not be resolved
    const evs = v.events;
    for (let i = 0; i < evs.length; i++) {
      const a = evs[i];
      eventCount.set(a, (eventCount.get(a) ?? 0) + 1);
      (caseSetByActivity.get(a) ?? caseSetByActivity.set(a, new Set()).get(a)!).add(ci);
      const st = v.states[i];
      if (st) (statesByActivity.get(a) ?? statesByActivity.set(a, new Set()).get(a)!).add(st);

      const ri = c.res?.[i];
      if (ri !== undefined && ri >= 0 && dict[ri]) {
        const m = resByActivity.get(a) ?? resByActivity.set(a, new Map()).get(a)!;
        m.set(dict[ri], (m.get(dict[ri]) ?? 0) + 1);
      }

      // The sojourn until the next event — the same single interval that is
      // this activity's time AND this edge's time. Counted once each, exactly
      // as `computeAnalytics` does it.
      const d = c.durs?.[i];
      if (d === undefined || i >= evs.length - 1) continue;
      (durByActivity.get(a) ?? durByActivity.set(a, []).get(a)!).push(d);
      const ek = JSON.stringify([a, evs[i + 1]]);
      (edgeDur.get(ek) ?? edgeDur.set(ek, []).get(ek)!).push(d);
    }
  });

  const activities: ActivityMetric[] = [...eventCount.keys()].map((a) => {
    const ds = sortedNums(durByActivity.get(a) ?? []);
    const res = resByActivity.get(a);
    const dominantResource = res && res.size ? [...res.entries()].sort((x, y) => y[1] - x[1])[0][0] : undefined;
    return {
      activity: a,
      caseFreq: caseSetByActivity.get(a)?.size ?? 0,
      eventFreq: eventCount.get(a) ?? 0,
      medianDurMs: quantile(ds, 0.5),
      p90DurMs: quantile(ds, 0.9),
      totalTimeMs: ds.reduce((s, d) => s + d, 0),
      ...(dominantResource ? { dominantResource } : {}),
      resources: res ? [...res.keys()].sort() : [],
      ...(res ? { resourceCounts: Object.fromEntries(res) } : {}),
      states: [...(statesByActivity.get(a) ?? [])].sort(),
    };
  }).sort((x, y) => y.totalTimeMs - x.totalTimeMs);

  const edges: EdgeMetric[] = [...edgeDur.entries()].map(([k, ds]) => {
    const [from, to] = JSON.parse(k) as [string, string];
    return { from, to, freq: ds.length, medianMs: quantile(sortedNums(ds), 0.5), totalMs: ds.reduce((s, d) => s + d, 0) };
  }).sort((x, y) => y.freq - x.freq);

  return { activities, edges };
}

/**
 * Narrow a run to the cases the filter selects.
 *
 * With no active filter this returns the inputs untouched — the identity case
 * is the common one and must cost nothing and change nothing.
 */
export function filterAnalytics(
  analytics: RunAnalytics | null,
  variants: Variant[],
  filter: MiningFilter,
): FilteredRun | null {
  if (!analytics) return null;
  if (!isFilterActive(filter)) {
    return {
      analytics, variants,
      matched: analytics.cases.length,
      estimatedCases: analytics.totalCases,
      timeUnfiltered: false,
      belowFloor: false,
      stride: 1,
    };
  }

  const dict = analytics.resourceDict ?? [];
  const resourceIdx = filter.resource ? dict.indexOf(filter.resource) : null;
  // A team that is not in the dictionary matches nothing — which is the honest
  // answer, and better than silently ignoring the clause and showing everything.
  const cases = analytics.cases.filter((c) => matches(c, filter, filter.resource ? resourceIdx : null));

  const stride = analytics.cases.length > 0 ? analytics.totalCases / analytics.cases.length : 1;
  const cycles = sortedNums(cases.map((c) => c.cycleMs));
  const belowFloor = cases.length < MIN_SLICE_CASES;

  // Variant counts become a histogram over the filtered cases. The array keeps
  // its ORDER and length so `variantIdx` stays a valid index everywhere — a
  // variant nobody in the slice followed simply has a count of zero, which is
  // exactly what conformance and the Pareto both want.
  const counts = new Array<number>(variants.length).fill(0);
  for (const c of cases) if (c.variantIdx >= 0 && c.variantIdx < counts.length) counts[c.variantIdx]++;
  const filteredVariants: Variant[] = variants.map((v, i) => ({ ...v, count: counts[i] }));

  // Time-shaped figures need the per-event vectors. Without them the ONLY honest
  // move is to hand back the whole-run numbers and say so.
  const timeUnfiltered = analytics.detail !== "full";
  const timings = timeUnfiltered
    ? { activities: analytics.activities, edges: analytics.edges }
    : rebuildTimings(cases, variants, dict);

  return {
    analytics: {
      ...analytics,
      activities: timings.activities,
      edges: timings.edges,
      throughput: rebuildThroughput(analytics.throughput, cases),
      cases,
      totalCases: Math.round(cases.length * stride),
      cycle: {
        medianMs: quantile(cycles, 0.5),
        p90Ms: quantile(cycles, 0.9),
        minMs: cycles[0] ?? 0,
        maxMs: cycles[cycles.length - 1] ?? 0,
      },
    },
    variants: filteredVariants,
    matched: cases.length,
    estimatedCases: Math.round(cases.length * stride),
    timeUnfiltered,
    belowFloor,
    stride,
  };
}

/**
 * The headline counts, restated for a slice.
 *
 * Without this the exported report's Summary would carry the WHOLE run's case
 * and event counts above tables that describe only the slice — the precise
 * kind of mixed-provenance page the run view exists to prevent, but in a file
 * that leaves the building and gets forwarded.
 */
export function filteredStats(base: MiningStats, run: FilteredRun): MiningStats {
  const a = run.analytics;
  const events = a.activities.reduce((s, x) => s + x.eventFreq, 0);
  const states = new Set<string>();
  for (const x of a.activities) for (const st of x.states ?? []) states.add(st);
  return {
    ...base,
    cases: run.estimatedCases,
    // Scaled by the SAME stride as the case count, so the two agree.
    events: Math.round(events * run.stride),
    activities: a.activities.map((x) => x.activity).sort(),
    states: [...states].sort(),
    variants: run.variants.filter((v) => v.count > 0).length,
  };
}

/** A one-line description of what is being shown, for a chip and for the report
 *  header. Null when nothing is filtered. */
export function describeFilter(f: MiningFilter): string | null {
  if (!isFilterActive(f)) return null;
  const bits: string[] = [];
  if (f.from != null || f.to != null) {
    const d = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    bits.push(f.from != null && f.to != null ? `${d(f.from)} to ${d(f.to)}`
      : f.from != null ? `from ${d(f.from)}`
      : `up to ${d(f.to!)}`);
  }
  for (const [k, v] of Object.entries(f.attrs ?? {})) bits.push(`${k} = ${v}`);
  if (f.resource) bits.push(`team ${f.resource}`);
  return bits.join(" · ");
}

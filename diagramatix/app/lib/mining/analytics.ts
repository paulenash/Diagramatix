/**
 * Insight-layer analytics mined from an event log's traces — the numbers that
 * power the DiagramatixMINER Insights views (bottleneck HEAT on the discovered
 * model, variant Pareto, case explorer, and KPI/SLA outcomes). Distinct from
 * `performance.ts`, whose aggregates feed the SIMULATION twin; this module keeps
 * everything in raw milliseconds and adds a per-case index so cases can be drilled
 * into and classified on-time/late without persisting full raw events.
 *
 * Pure — no DB, no React. Computed once at import/refresh (raw events are
 * transient) and persisted as `ProcessMiningRun.analytics`.
 */
import type { CaseTrace, EventLog, Variant } from "./types";
import type { ClockUnit } from "@/app/lib/simulation/types";
import { minOf, maxOf } from "./numeric";

/** Cap on stored per-case rows; larger logs are evenly strided down to this many
 *  (exact overall cycle stats + totalCases are still retained). */
export const CASE_CAP = 50_000;

const MS_PER_UNIT: Record<ClockUnit, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000 };
function pickUnit(medianMs: number): ClockUnit {
  if (medianMs < 60_000) return "second";
  if (medianMs < 3_600_000) return "minute";
  if (medianMs < 86_400_000) return "hour";
  return "day";
}
export function sortedNums(xs: number[]): number[] { return [...xs].sort((a, b) => a - b); }
/** Exported so a filtered rebuild quotes its percentiles the SAME way the
 *  import did — two implementations of a median is two different medians. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
/** ASCII-safe composite key for an edge (avoids any delimiter char). */
function edgeKey(from: string, to: string): string { return JSON.stringify([from, to]); }

export interface ActivityMetric {
  activity: string;
  caseFreq: number;       // distinct cases containing this activity
  eventFreq: number;      // total occurrences
  medianDurMs: number;    // median time-in-activity (sojourn until next event)
  p90DurMs: number;
  totalTimeMs: number;    // sum of sojourn over all occurrences (the true bottleneck signal)
  dominantResource?: string;
  resources: string[];    // distinct teams/resources seen for this activity (usually 1)
  /** How many events each resource performed. Already computed to pick the
   *  dominant one and previously thrown away — which is why the amber
   *  "more than one team does this" flag could be raised but never opened. */
  resourceCounts?: Record<string, number>;
  states: string[];       // distinct states this activity produced (usually 1)
}
export interface EdgeMetric {
  from: string;
  to: string;
  freq: number;           // observed directly-follows count
  medianMs: number;       // median transition time between the two events
  /** Sum of every observed transition time on this edge — how much of the log's
   *  elapsed time this one hand-off accounts for, which is what a RANKED view
   *  needs and what a median cannot give it: a rare two-day wait outranks a
   *  frequent two-hour one on median, and matters far less.
   *
   *  Optional because a run imported before this existed cannot gain it — raw
   *  events are transient. Readers fall back to `freq × median` and SAY it is
   *  an estimate rather than presenting it as measured. */
  totalMs?: number;
}
export interface ThroughputBucket { t: number; started: number; completed: number; }
export interface CaseSummary {
  idx: number;            // stable index into the run's traces
  caseId: string;
  variantIdx: number;     // index into the (frequency-sorted) variants array
  startMs: number;        // first event timestamp (epoch ms)
  endMs: number;          // last event timestamp (epoch ms)
  cycleMs: number;        // endMs - startMs
  events: number;
  /** Kept columns, from the case's FIRST event — the one that describes the
   *  case rather than a later state of it. Absent when none were kept. */
  attrs?: Record<string, string>;
  /** Per-event sojourn in whole ms, aligned to the variant's event sequence
   *  (length = events - 1; the last event has no "until next"). Present only
   *  when `detail === "full"`.
   *
   *  Without this, filtering an activity metric is impossible: the case index
   *  carried a cycle time and nothing else, so a filtered heat map — the
   *  workbench's flagship — could only ever have said "not filtered". */
  durs?: number[];
  /** Per-event resource, as indices into `RunAnalytics.resourceDict` (-1 when
   *  the event named none). Present only when `detail === "full"`. A dictionary
   *  rather than repeated strings: team names recur on every event of every
   *  case, and this is an uncompressed JSON column. */
  res?: number[];
}

/** One column kept from the log, and whether it can be used as a dimension. */
export interface AttributeDef {
  name: string;
  distinct: number;
  /** The values, when there are few enough to offer as a picker. */
  values?: string[];
  /** False when there are too many distinct values to be a dimension. The
   *  reason is carried so the user is TOLD why they cannot filter on an
   *  invoice number, rather than finding the column silently missing. */
  filterable: boolean;
  reason?: string;
}

/** How much per-event detail this run's case index actually carries.
 *
 *  `"full"`   — durations and resources per event; everything is filterable.
 *  `"counts"` — the vectors were dropped to stay inside the payload budget, so
 *               counts filter and time-shaped figures do not.
 *  `"none"`   — imported before any of this existed. Not zero; unknown. */
export type AnalyticsDetail = "full" | "counts" | "none";

/** Above this many stored per-event slots the vectors are omitted. `analytics`
 *  is an uncompressed jsonb column the console fetches whole on every Insights
 *  open, so this is a real ceiling rather than a theoretical one. */
export const DETAIL_BUDGET = 1_500_000;

/** Values beyond this are an identifier, not a dimension — nobody filters on
 *  an invoice number, and offering it as a picker would be a worse answer than
 *  saying why it is not there. */
export const MAX_ATTR_VALUES = 50;
export interface RunAnalytics {
  clockUnit: ClockUnit;              // suggested unit for humanising durations
  activities: ActivityMetric[];      // sorted by totalTimeMs desc (bottleneck-first)
  edges: EdgeMetric[];
  throughput: ThroughputBucket[];
  cases: CaseSummary[];              // capped/strided sample when totalCases > CASE_CAP
  totalCases: number;                // real count (>= cases.length)
  capped: boolean;
  cycle: { medianMs: number; p90Ms: number; minMs: number; maxMs: number }; // over ALL cases
  /** Resource names, indexed by `CaseSummary.res`. Present with `detail: "full"`. */
  resourceDict?: string[];
  /** Columns kept from the log and whether each can be filtered on. */
  attributes?: AttributeDef[];
  /** What the per-event vectors above actually contain. ABSENT means a run
   *  imported before this existed — read it as `"none"`, and say so rather than
   *  reporting a zero. */
  detail?: AnalyticsDetail;
}

/** The frequency-sorted variant key must match parseEventLog.ts's construction. */
function variantKey(states: string[], events: string[]): string {
  return JSON.stringify([states, events]);
}

export function computeAnalytics(log: EventLog): RunAnalytics {
  const { traces, variants } = log;

  // variant key -> index (variants are already frequency-sorted in the EventLog)
  const variantIdx = new Map<string, number>();
  variants.forEach((v: Variant, i) => variantIdx.set(variantKey(v.states, v.events), i));

  // Per-activity sojourn samples + directly-follows transition samples.
  const durByActivity: Record<string, number[]> = {};
  const caseCountByActivity: Record<string, Set<number>> = {};
  const eventCountByActivity: Record<string, number> = {};
  const resByActivity: Record<string, Record<string, number>> = {};
  const stateByActivity: Record<string, Set<string>> = {};
  const edgeDur = new Map<string, number[]>();   // edgeKey(from,to) -> transition ms samples
  const allDur: number[] = [];
  const cycleAll: number[] = [];

  traces.forEach((t: CaseTrace, ci) => {
    const evs = t.events;
    for (let i = 0; i < evs.length; i++) {
      const a = evs[i].activity;
      eventCountByActivity[a] = (eventCountByActivity[a] ?? 0) + 1;
      (caseCountByActivity[a] ??= new Set()).add(ci);
      if (evs[i].resource) {
        (resByActivity[a] ??= {})[evs[i].resource!] = (resByActivity[a]?.[evs[i].resource!] ?? 0) + 1;
      }
      if (evs[i].state) (stateByActivity[a] ??= new Set()).add(evs[i].state);
      if (i < evs.length - 1) {
        const d = evs[i + 1].timestamp - evs[i].timestamp;
        if (d >= 0) {
          (durByActivity[a] ??= []).push(d);
          allDur.push(d);
          const ek = edgeKey(a, evs[i + 1].activity);
          const bucket = edgeDur.get(ek) ?? edgeDur.set(ek, []).get(ek)!;
          bucket.push(d);
        }
      }
    }
    if (evs.length) cycleAll.push(evs[evs.length - 1].timestamp - evs[0].timestamp);
  });

  const clockUnit = pickUnit(quantile(sortedNums(allDur), 0.5));

  const activities: ActivityMetric[] = Object.keys(eventCountByActivity).map((a) => {
    const ds = sortedNums(durByActivity[a] ?? []);
    const res = resByActivity[a];
    const dominantResource = res ? Object.entries(res).sort((x, y) => y[1] - x[1])[0][0] : undefined;
    return {
      activity: a,
      caseFreq: caseCountByActivity[a]?.size ?? 0,
      eventFreq: eventCountByActivity[a],
      medianDurMs: quantile(ds, 0.5),
      p90DurMs: quantile(ds, 0.9),
      totalTimeMs: ds.reduce((s, d) => s + d, 0),
      ...(dominantResource ? { dominantResource } : {}),
      resources: res ? Object.keys(res).sort() : [],
      ...(res ? { resourceCounts: { ...res } } : {}),
      states: [...(stateByActivity[a] ?? [])].sort(),
    };
  }).sort((x, y) => y.totalTimeMs - x.totalTimeMs);

  const edges: EdgeMetric[] = [...edgeDur.entries()].map(([k, ds]) => {
    const [from, to] = JSON.parse(k) as [string, string];
    return {
      from, to,
      freq: ds.length,
      medianMs: quantile(sortedNums(ds), 0.5),
      totalMs: ds.reduce((s, d) => s + d, 0),
    };
  }).sort((x, y) => y.freq - x.freq);

  // Per-case summaries (capped, even-strided when over CASE_CAP).
  const totalCases = traces.length;
  const capped = totalCases > CASE_CAP;
  const stride = capped ? totalCases / CASE_CAP : 1;
  const storedCases = capped ? CASE_CAP : totalCases;

  // Can the per-event vectors be afforded? Decided BEFORE building them, so a
  // huge log never materialises millions of numbers on its way to being thrown
  // away. `analytics` is uncompressed jsonb and the console fetches it whole.
  const avgEvents = totalCases > 0 ? traces.reduce((s, t) => s + t.events.length, 0) / totalCases : 0;
  const detail: AnalyticsDetail = storedCases * avgEvents <= DETAIL_BUDGET ? "full" : "counts";

  // Resource dictionary — team names repeat on every event of every case, so a
  // dictionary plus indices is several times smaller than repeated strings.
  const resourceDict: string[] = [];
  const resIndex = new Map<string, number>();
  const resIdOf = (r: string | undefined): number => {
    if (!r) return -1;
    let i = resIndex.get(r);
    if (i === undefined) { i = resourceDict.length; resourceDict.push(r); resIndex.set(r, i); }
    return i;
  };

  // Kept columns, counted as we go so cardinality is known without a second pass.
  const attrValues = new Map<string, Set<string>>();

  const cases: CaseSummary[] = [];
  for (let k = 0; k < storedCases; k++) {
    const ci = capped ? Math.floor(k * stride) : k;
    const t = traces[ci];
    if (!t || t.events.length === 0) continue;
    const evs = t.events;
    const startMs = evs[0].timestamp;
    const endMs = evs[evs.length - 1].timestamp;

    // Attributes describe the CASE, so they come from its first event.
    const attrs = evs[0].attrs;
    if (attrs) {
      for (const [name, v] of Object.entries(attrs)) {
        const set = attrValues.get(name) ?? attrValues.set(name, new Set()).get(name)!;
        // Stop growing the set once it is past being a dimension — the count is
        // what matters from there, not the members.
        if (set.size <= MAX_ATTR_VALUES) set.add(v);
      }
    }

    let durs: number[] | undefined;
    let res: number[] | undefined;
    if (detail === "full") {
      durs = [];
      res = [];
      for (let i = 0; i < evs.length; i++) {
        res.push(resIdOf(evs[i].resource));
        // Length is events - 1: the last event has no "until the next one".
        // Negative gaps are clamped, matching how the aggregates above skip them.
        if (i < evs.length - 1) durs.push(Math.max(0, Math.round(evs[i + 1].timestamp - evs[i].timestamp)));
      }
    }

    cases.push({
      idx: ci,
      caseId: t.caseId,
      variantIdx: variantIdx.get(variantKey(evs.map((e) => e.state), evs.map((e) => e.activity))) ?? -1,
      startMs, endMs, cycleMs: endMs - startMs, events: evs.length,
      ...(attrs ? { attrs } : {}),
      ...(durs ? { durs } : {}),
      ...(res ? { res } : {}),
    });
  }

  const attributes: AttributeDef[] = [...attrValues.entries()].map(([name, set]) => {
    const filterable = set.size <= MAX_ATTR_VALUES;
    return {
      name,
      distinct: set.size,
      ...(filterable ? { values: [...set].sort() } : {}),
      filterable,
      ...(filterable ? {} : { reason: `more than ${MAX_ATTR_VALUES} distinct values — an identifier, not a dimension` }),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Throughput buckets (~30) across the observed span.
  const throughput: ThroughputBucket[] = [];
  const starts = traces.map((t) => t.events[0]?.timestamp).filter((x): x is number => x !== undefined);
  const ends = traces.map((t) => t.events[t.events.length - 1]?.timestamp).filter((x): x is number => x !== undefined);
  if (starts.length) {
    // Spreading these throws past ~125k cases — see numeric.ts.
    const lo = minOf(starts)!;
    const hi = Math.max(maxOf(ends) ?? lo, maxOf(starts) ?? lo);
    const N = 30;
    const span = Math.max(1, hi - lo);
    const bucket = (ts: number) => Math.min(N - 1, Math.floor(((ts - lo) / span) * N));
    for (let b = 0; b < N; b++) throughput.push({ t: lo + (b + 0.5) * (span / N), started: 0, completed: 0 });
    for (const s of starts) throughput[bucket(s)].started++;
    for (const e of ends) throughput[bucket(e)].completed++;
  }

  const cs = sortedNums(cycleAll);
  return {
    clockUnit,
    activities,
    edges,
    throughput,
    cases,
    totalCases,
    capped,
    cycle: { medianMs: quantile(cs, 0.5), p90Ms: quantile(cs, 0.9), minMs: cs[0] ?? 0, maxMs: cs[cs.length - 1] ?? 0 },
    // Only when there is something to say. An empty dictionary or an empty
    // attribute list would claim a capability the run does not have.
    ...(resourceDict.length ? { resourceDict } : {}),
    ...(attributes.length ? { attributes } : {}),
    detail,
  };
}

/** Format a millisecond duration in the run's clock unit (compact, for UI/reports). */
export function formatDuration(ms: number, unit: ClockUnit): string {
  const v = ms / MS_PER_UNIT[unit];
  const rounded = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded} ${unit}${rounded === 1 ? "" : "s"}`;
}

/** Convert between the run's clock unit and milliseconds (for the SLA input). */
export function toMs(value: number, unit: ClockUnit): number { return value * MS_PER_UNIT[unit]; }
export function fromMs(ms: number, unit: ClockUnit): number { return ms / MS_PER_UNIT[unit]; }

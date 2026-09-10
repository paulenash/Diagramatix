/**
 * Nobody mines a process once.
 *
 * A mining run is a photograph. The question everyone asks second is whether
 * things got better or worse, and until now the Miner could not answer it: the
 * snapshot route froze a run into a dated copy and recorded NO LINK back, so the
 * history existed and could only be reassembled by guessing at name prefixes.
 *
 * `parentRunId` is the link. This module is what reads it.
 *
 * THE HONEST FLOOR IS THE WHOLE DESIGN HERE, and it is different from the other
 * phases'. Elsewhere the risk is a figure that is too precise. Here it is
 * comparing two things that are not the same process — mine "Order to Cash" in
 * January and "Complaints Handling" in February, link them by accident, and
 * every delta in the table is arithmetic on unrelated numbers. It will look
 * exactly like a real regression. So the vocabularies are checked FIRST, and a
 * pair that does not overlap enough is refused rather than diffed.
 *
 * Pure — no DB, no React.
 */

import type { RunAnalytics } from "./analytics";
import type { ConformanceResult } from "./transitionConformance";
import type { Variant } from "./types";

/** One run, reduced to what a comparison needs. */
export interface ComparableRun {
  id: string;
  name: string;
  createdAt: string;
  analytics: RunAnalytics | null;
  variants: Variant[];
  conformance: ConformanceResult | null;
}

/**
 * Below this share of shared activities the two runs are treated as different
 * processes. Two thirds is deliberately generous: a process genuinely changes
 * between periods — a step is added, one is retired — and refusing on any
 * difference would refuse exactly the comparisons worth making. What it will not
 * pass is two unrelated processes, which typically share almost nothing.
 */
export const MIN_VOCABULARY_OVERLAP = 0.6;

export interface Delta {
  label: string;
  /** Earlier run's value, later run's value. */
  before: number;
  after: number;
  /** after − before. */
  change: number;
  /** Relative change, or null when `before` is zero and a ratio would be a
   *  division by nothing rather than an infinite improvement. */
  changePct: number | null;
  /** Which direction is good. Used for colour, never for ranking. */
  betterWhen: "lower" | "higher";
}

export interface ActivityDelta {
  activity: string;
  /** null when the activity is absent from that run entirely — which is a
   *  finding in itself, and not the same as zero. */
  beforeMs: number | null;
  afterMs: number | null;
  changeMs: number | null;
  status: "changed" | "added" | "removed";
}

export interface RunComparison {
  ok: boolean;
  /** Why not, when `ok` is false. */
  refusal: string | null;
  before: { id: string; name: string; createdAt: string };
  after: { id: string; name: string; createdAt: string };
  /** Share of the combined activity vocabulary the two runs share. */
  overlap: number;
  headline: Delta[];
  activities: ActivityDelta[];
  /** Activities in one run and not the other — the shape of the process moved. */
  added: string[];
  removed: string[];
  /** Deviations present in the later run that the earlier one did not have. */
  newViolations: string[];
  /** Deviations the earlier run had and the later one does not. */
  clearedViolations: string[];
  /** Anything that could not be compared, said out loud. */
  notes: string[];
}

const vocab = (r: ComparableRun) => new Set((r.analytics?.activities ?? []).map((a) => a.activity));

function delta(label: string, before: number, after: number, betterWhen: "lower" | "higher"): Delta {
  return {
    label, before, after,
    change: after - before,
    changePct: before > 0 ? (after - before) / before : null,
    betterWhen,
  };
}

/**
 * Compare two runs of what is meant to be the same process.
 *
 * `a` is the earlier run and `b` the later one. The caller orders them; this
 * does not sort by date, because a linked series can legitimately be built in
 * any order and silently swapping them would invert every sign in the table.
 */
export function compareRuns(a: ComparableRun, b: ComparableRun): RunComparison {
  const shell = {
    before: { id: a.id, name: a.name, createdAt: a.createdAt },
    after: { id: b.id, name: b.name, createdAt: b.createdAt },
    headline: [] as Delta[],
    activities: [] as ActivityDelta[],
    added: [] as string[],
    removed: [] as string[],
    newViolations: [] as string[],
    clearedViolations: [] as string[],
    notes: [] as string[],
  };

  if (!a.analytics || !b.analytics) {
    return {
      ...shell, ok: false, overlap: 0,
      refusal: "One of these runs has no analytics, so there is nothing to compare. Re-import its log.",
    };
  }

  const va = vocab(a), vb = vocab(b);
  const union = new Set([...va, ...vb]);
  const shared = [...va].filter((x) => vb.has(x));
  const overlap = union.size > 0 ? shared.length / union.size : 0;

  if (overlap < MIN_VOCABULARY_OVERLAP) {
    return {
      ...shell, ok: false, overlap,
      refusal: `These two runs share only ${Math.round(overlap * 100)}% of their steps, so they look like different processes rather than the same one at two times. Comparing them would produce differences that mean nothing.`,
    };
  }

  // ── Headline figures ─────────────────────────────────────────────────────
  const headline: Delta[] = [
    delta("Cases", a.analytics.totalCases, b.analytics.totalCases, "higher"),
    delta("Median cycle time", a.analytics.cycle.medianMs, b.analytics.cycle.medianMs, "lower"),
    delta("P90 cycle time", a.analytics.cycle.p90Ms, b.analytics.cycle.p90Ms, "lower"),
    delta("Variants", a.variants.filter((v) => v.count > 0).length, b.variants.filter((v) => v.count > 0).length, "lower"),
  ];

  // Fitness only when BOTH have been checked. One conformance result and one
  // absence is not a decline from 94% to nothing.
  if (a.conformance && b.conformance) {
    headline.push(delta("Conformance", a.conformance.fitness, b.conformance.fitness, "higher"));
  } else if (a.conformance || b.conformance) {
    shell.notes.push("Conformance is not compared: only one of these runs has been checked against a reference model.");
  }

  // ── Per-activity ─────────────────────────────────────────────────────────
  const byA = new Map(a.analytics.activities.map((x) => [x.activity, x]));
  const byB = new Map(b.analytics.activities.map((x) => [x.activity, x]));
  const activities: ActivityDelta[] = [...union].map((activity) => {
    const x = byA.get(activity), y = byB.get(activity);
    // Absent is not zero: a step nobody performed this period is a change of
    // shape, and showing it as "0ms, down 100%" would bury that in a number.
    if (x && y) return { activity, beforeMs: x.totalTimeMs, afterMs: y.totalTimeMs, changeMs: y.totalTimeMs - x.totalTimeMs, status: "changed" as const };
    if (y) return { activity, beforeMs: null, afterMs: y.totalTimeMs, changeMs: null, status: "added" as const };
    return { activity, beforeMs: x!.totalTimeMs, afterMs: null, changeMs: null, status: "removed" as const };
  }).sort((p, q) => Math.abs(q.changeMs ?? 0) - Math.abs(p.changeMs ?? 0));

  const added = activities.filter((x) => x.status === "added").map((x) => x.activity).sort();
  const removed = activities.filter((x) => x.status === "removed").map((x) => x.activity).sort();

  // ── Deviations that appeared or went away ────────────────────────────────
  let newViolations: string[] = [], clearedViolations: string[] = [];
  if (a.conformance && b.conformance) {
    const msgs = (c: ConformanceResult) => new Set(c.violations.filter((v) => v.cases > 0).map((v) => v.message));
    const before = msgs(a.conformance), after = msgs(b.conformance);
    newViolations = [...after].filter((m) => !before.has(m)).sort();
    clearedViolations = [...before].filter((m) => !after.has(m)).sort();
  }

  if (a.analytics.capped || b.analytics.capped) {
    shell.notes.push("At least one of these runs stores a sample of its cases, so the counts either side are estimates from the same stride.");
  }

  return { ...shell, ok: true, refusal: null, overlap, headline, activities, added, removed, newViolations, clearedViolations };
}

/** One point on the conformance-over-time chart. */
export interface FitnessPoint {
  runId: string;
  name: string;
  at: string;
  /** null when that run was never checked — a gap in the line, not a zero. */
  fitness: number | null;
  cases: number;
}

/**
 * The fitness of every run in a linked series, oldest first — item 11.
 *
 * A run that was never conformance-checked contributes `null` rather than 0. A
 * zero would draw a catastrophic dip on the chart for a run that was simply
 * never asked, which is the most alarming possible way to say nothing.
 */
export function fitnessHistory(series: ComparableRun[]): FitnessPoint[] {
  return [...series]
    .sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt))
    .map((r) => ({
      runId: r.id,
      name: r.name,
      at: r.createdAt,
      fitness: r.conformance ? r.conformance.fitness : null,
      cases: r.analytics?.totalCases ?? 0,
    }));
}

/**
 * Order a set of runs into a chain by `parentRunId`, oldest first.
 *
 * Returns only the runs actually reachable from the root: a cycle, or a run
 * whose parent is missing from the set, stops the walk rather than looping or
 * inventing an ancestor.
 */
export function orderSeries<T extends { id: string; parentRunId?: string | null }>(runs: T[]): T[] {
  const byId = new Map(runs.map((r) => [r.id, r]));
  const childOf = new Map<string, T>();
  for (const r of runs) if (r.parentRunId && byId.has(r.parentRunId)) childOf.set(r.parentRunId, r);

  // The root is the one nobody claims as a parent-of, i.e. whose own parent is
  // not in this set.
  const root = runs.find((r) => !r.parentRunId || !byId.has(r.parentRunId));
  if (!root) return [];                       // every run has a parent here: a cycle

  const out: T[] = [];
  const seen = new Set<string>();
  let cur: T | undefined = root;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = childOf.get(cur.id);
  }
  return out;
}

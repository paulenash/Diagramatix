/**
 * Who hands work to whom, and who does the same thing three times.
 *
 * Resource is captured on every event at import, but `computeAnalytics` keeps
 * only `dominantResource` per activity — so the actual team-to-team flows were
 * lost. Phase 1's per-event `res` vectors are what make them recoverable, and
 * this module is where they finally get read.
 *
 * TWO THINGS THE REVIEW GOT WRONG, BOTH CORRECTED HERE.
 *
 * 1. A handover map built from `edges × dominantResource` is buildable today and
 *    would be quietly wrong exactly where it matters most: on the activities
 *    that more than one team performs — the ones the Activities tab already
 *    flags amber. Attributing every one of those to its most frequent team
 *    invents handovers that never happened and hides ones that did. So the map
 *    is built from the per-event vectors when they exist, and when they do not
 *    the fallback is computed AND LABELLED `approximate`, with the number of
 *    multi-team activities that make it so.
 *
 * 2. `pingPongFromVariants` is not label-agnostic. It reads app names out of
 *    `"Switch to X"` / `"Open X"` / `"X:"` activity labels, so on an ordinary
 *    business log it returns **0** — a confident wrong number, which is worse
 *    than an absent one. The business analogue is not app ping-pong at all: it
 *    is TEAM ping-pong, A→B→A over the resource sequence, and that is a
 *    different function over different data. It is below.
 *
 * Rework needs no correction: `detectReworkActivities` really is label-agnostic
 * — it counts within-variant repeats and excludes navigation steps, which is
 * exactly the "credit check ran three times" figure on any log.
 *
 * Pure — no DB, no React.
 */

import type { RunAnalytics } from "./analytics";
import type { Variant } from "./types";

/** One team passing work to another. */
export interface Handover {
  from: string;
  to: string;
  /** How many times, frequency-weighted across the stored cases. */
  count: number;
  /** Median elapsed between the last step of `from` and the first of `to`.
   *  Null when the run has no per-event durations to measure it with. */
  medianGapMs: number | null;
  /** Total elapsed across the join — what the hand-off actually costs. */
  totalGapMs: number;
}

/** What one team does, and how much of the process it accounts for. */
export interface TeamLoad {
  team: string;
  events: number;
  cases: number;
  /** Time recorded against this team's steps (its sojourn), when measurable. */
  totalTimeMs: number;
  /** Share of all recorded time. 0 when nothing is measurable. */
  share: number;
}

/** Two teams passing a case back and forth: A → B → A. */
export interface PingPong {
  a: string;
  b: string;
  /** A→B→A occurrences, frequency-weighted. */
  bounces: number;
  /** Cases exhibiting at least one. */
  cases: number;
}

/** An activity that happens more than once in the same case. */
export interface Rework {
  activity: string;
  /** Cases in which it repeats. */
  cases: number;
  /** Mean occurrences per case that has it at all — the "2.4× per case" figure. */
  perCase: number;
}

export interface TeamFlowResult {
  handovers: Handover[];
  loads: TeamLoad[];
  pingPong: PingPong[];
  rework: Rework[];
  /**
   * `exact`       — built from per-event resources; every figure is measured.
   * `approximate` — built from each activity's dominant team, because the run
   *                 has no per-event vectors. Wrong wherever an activity has
   *                 more than one team.
   * `none`        — no resources in this log at all.
   */
  basis: "exact" | "approximate" | "none";
  /** How many activities more than one team performs — the size of the doubt in
   *  `approximate` mode, and 0 in exact mode. */
  multiTeamActivities: number;
  /** One line the UI prints verbatim. */
  note: string | null;
}

const EMPTY: TeamFlowResult = {
  handovers: [], loads: [], pingPong: [], rework: [],
  basis: "none", multiTeamActivities: 0,
  note: "No teams in this log. Map a resource column at import, or fill the activity → team table, and the hand-offs can be measured.",
};

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const pairKey = (a: string, b: string) => JSON.stringify([a, b]);
/** Unordered pair, for ping-pong, which is symmetric between two teams. */
const unordered = (a: string, b: string) => (a < b ? JSON.stringify([a, b]) : JSON.stringify([b, a]));

export function computeTeamFlow(analytics: RunAnalytics | null, variants: Variant[]): TeamFlowResult {
  if (!analytics) return EMPTY;

  const dict = analytics.resourceDict ?? [];
  const multiTeamActivities = analytics.activities.filter((a) => (a.resources ?? []).length > 1).length;
  const exact = analytics.detail === "full" && dict.length > 0;

  const rework = reworkFrom(variants);

  if (!exact) {
    // The fallback. Built from each activity's DOMINANT team over the edges,
    // which is the best the stored data allows — and stated as such, with the
    // count of activities that make it a guess.
    const teamOf = new Map(analytics.activities.map((a) => [a.activity, a.dominantResource]));
    if (![...teamOf.values()].some(Boolean)) return { ...EMPTY, rework };

    const flows = new Map<string, { count: number; total: number }>();
    for (const e of analytics.edges) {
      const from = teamOf.get(e.from), to = teamOf.get(e.to);
      if (!from || !to || from === to) continue;
      const k = pairKey(from, to);
      const cur = flows.get(k) ?? { count: 0, total: 0 };
      cur.count += e.freq;
      cur.total += e.totalMs ?? e.freq * e.medianMs;
      flows.set(k, cur);
    }
    const handovers: Handover[] = [...flows.entries()].map(([k, v]) => {
      const [from, to] = JSON.parse(k) as [string, string];
      // No per-event vectors means no honest median for the join: the edge
      // medians are per activity pair, not per hand-off. Null, not a guess.
      return { from, to, count: v.count, medianGapMs: null, totalGapMs: v.total };
    }).sort((a, b) => b.totalGapMs - a.totalGapMs || b.count - a.count);

    const loads: TeamLoad[] = loadsFromActivities(analytics);
    return {
      handovers, loads, pingPong: [], rework,
      basis: "approximate",
      multiTeamActivities,
      note: `Approximate: this run has no per-event team data, so each step is attributed to the team that performs it most often.`
        + (multiTeamActivities > 0
          ? ` ${multiTeamActivities} activit${multiTeamActivities === 1 ? "y is" : "ies are"} performed by more than one team, and those are exactly where this is wrong — re-import the log for the measured map.`
          : ` Re-import the log for the measured map.`)
        + " Team ping-pong cannot be measured at all without per-event teams, so it is not shown rather than shown as zero.",
    };
  }

  // ── Exact: walk each case's own team sequence ────────────────────────────
  const flows = new Map<string, { count: number; gaps: number[]; total: number }>();
  const bounceCount = new Map<string, { bounces: number; cases: number }>();
  const load = new Map<string, { events: number; cases: Set<number>; time: number }>();

  for (const c of analytics.cases) {
    const v = variants[c.variantIdx];
    if (!v) continue;
    const res = c.res ?? [];
    // The team sequence with consecutive repeats collapsed, carrying the gap
    // that sits at each boundary.
    const seq: { team: string; gapMs: number }[] = [];
    for (let i = 0; i < v.events.length; i++) {
      const ri = res[i];
      const team = ri !== undefined && ri >= 0 ? dict[ri] : undefined;
      if (!team) continue;
      const l = load.get(team) ?? { events: 0, cases: new Set<number>(), time: 0 };
      l.events++; l.cases.add(c.idx); l.time += c.durs?.[i] ?? 0;
      load.set(team, l);
      // The gap at this step is the wait before whatever comes next — which is
      // the hand-off cost when the next step belongs to somebody else.
      const gapMs = c.durs?.[i] ?? 0;
      if (seq.length && seq[seq.length - 1].team === team) seq[seq.length - 1].gapMs = gapMs;
      else seq.push({ team, gapMs });
    }

    for (let i = 1; i < seq.length; i++) {
      const k = pairKey(seq[i - 1].team, seq[i].team);
      const cur = flows.get(k) ?? { count: 0, gaps: [], total: 0 };
      cur.count++; cur.gaps.push(seq[i - 1].gapMs); cur.total += seq[i - 1].gapMs;
      flows.set(k, cur);
    }
    // A→B→A: the case came back to a team it had already left.
    const seen = new Set<string>();
    for (let i = 2; i < seq.length; i++) {
      if (seq[i].team !== seq[i - 2].team || seq[i].team === seq[i - 1].team) continue;
      const k = unordered(seq[i].team, seq[i - 1].team);
      const cur = bounceCount.get(k) ?? { bounces: 0, cases: 0 };
      cur.bounces++;
      if (!seen.has(k)) { cur.cases++; seen.add(k); }
      bounceCount.set(k, cur);
    }
  }

  const handovers: Handover[] = [...flows.entries()].map(([k, v]) => {
    const [from, to] = JSON.parse(k) as [string, string];
    return { from, to, count: v.count, medianGapMs: median(v.gaps), totalGapMs: v.total };
  }).sort((a, b) => b.totalGapMs - a.totalGapMs || b.count - a.count);

  const totalTime = [...load.values()].reduce((s, l) => s + l.time, 0);
  const loads: TeamLoad[] = [...load.entries()].map(([team, l]) => ({
    team, events: l.events, cases: l.cases.size, totalTimeMs: l.time,
    share: totalTime > 0 ? l.time / totalTime : 0,
  })).sort((a, b) => b.totalTimeMs - a.totalTimeMs || b.events - a.events);

  const pingPong: PingPong[] = [...bounceCount.entries()].map(([k, v]) => {
    const [a, b] = JSON.parse(k) as [string, string];
    return { a, b, bounces: v.bounces, cases: v.cases };
  }).sort((x, y) => y.bounces - x.bounces);

  return { handovers, loads, pingPong, rework, basis: "exact", multiTeamActivities: 0, note: null };
}

/** Workload from the activity table, when per-event data is unavailable. */
function loadsFromActivities(analytics: RunAnalytics): TeamLoad[] {
  const load = new Map<string, { events: number; time: number }>();
  for (const a of analytics.activities) {
    const team = a.dominantResource;
    if (!team) continue;
    const l = load.get(team) ?? { events: 0, time: 0 };
    l.events += a.eventFreq; l.time += a.totalTimeMs;
    load.set(team, l);
  }
  const total = [...load.values()].reduce((s, l) => s + l.time, 0);
  return [...load.entries()].map(([team, l]) => ({
    team, events: l.events, cases: 0, totalTimeMs: l.time,
    share: total > 0 ? l.time / total : 0,
  })).sort((a, b) => b.totalTimeMs - a.totalTimeMs);
}

/**
 * Activities that repeat within a case.
 *
 * `detectReworkActivities` already computes the case count label-agnostically;
 * this adds the per-case rate, which is the figure a reader actually quotes
 * ("credit check runs 2.4× per case"), and which the existing function does not
 * return.
 */
export function reworkFrom(variants: Variant[]): Rework[] {
  const cases = new Map<string, number>();
  const occurrences = new Map<string, number>();
  const casesWithIt = new Map<string, number>();
  for (const v of variants) {
    const seen = new Map<string, number>();
    for (const a of v.events) if (a) seen.set(a, (seen.get(a) ?? 0) + 1);
    for (const [a, n] of seen) {
      occurrences.set(a, (occurrences.get(a) ?? 0) + n * v.count);
      casesWithIt.set(a, (casesWithIt.get(a) ?? 0) + v.count);
      if (n > 1) cases.set(a, (cases.get(a) ?? 0) + v.count);
    }
  }
  return [...cases.entries()].map(([activity, c]) => ({
    activity,
    cases: c,
    perCase: (casesWithIt.get(activity) ?? 0) > 0
      ? (occurrences.get(activity) ?? 0) / (casesWithIt.get(activity) ?? 1)
      : 0,
  })).sort((a, b) => b.cases - a.cases);
}

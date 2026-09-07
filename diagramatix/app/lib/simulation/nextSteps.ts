/**
 * "What should I try next?" — computed from the runs already done.
 *
 * A simulator answers the question you ask it. This module is the first thing
 * that helps someone ask a better one: it reads a study's run history, works out
 * which levers have actually been pulled and what each was worth, and produces a
 * ranked list of what to try next — with the scenario that would test it.
 *
 * EVERY claim here is arithmetic over stored numbers. Nothing is inferred, and
 * nothing is handed to a model to "spot the pattern" — a fabricated trend in a
 * document that reaches a finance director is the worst failure this feature
 * could have. `facts/nextStepsFacts.ts` narrates the output; it cannot add to it.
 *
 * TWO HONEST LIMITS, both deliberate:
 *
 *  1. One observation per SCENARIO, not per run. A run snapshots its network but
 *     not its overrides, so a scenario edited after a run rewrites the apparent
 *     history of every earlier run beneath it. `latestRunPerScenario` is the
 *     subset where a scenario's overrides are genuinely what ran, so that is the
 *     only subset used. Deriving more from `networkSnapshot` is possible later;
 *     guessing is not.
 *  2. "Inside the noise" is a real significance test (Welch's, over the stored
 *     per-replication means) as of Phase 3. Runs recorded before those were
 *     persisted fall back to the p5–p95 band and are reported as APPROXIMATE —
 *     never as certainty.
 *
 * Pure — no DB, no React, no AI.
 */

import type { StudyRun } from "./studyRuns";
import { latestRunPerScenario } from "./studyRuns";
import type { OverrideSet } from "./overrides";
import type { RunMetrics } from "./results";
import { compareSamples } from "./significance";

/** Levers this module can see. Team capacity and the two per-node time levers are
 *  enumerable from stored metrics alone (`teamCapacities`, `nodeLabels`); edge
 *  probabilities are not, because metrics carry no edge list — so branch splits
 *  are out of scope here rather than half-covered. */
export type LeverKind = "teamCapacity" | "taskCycleTime" | "sourceArrival";

export interface Lever {
  kind: LeverKind;
  /** Team name (capacity) or engine node id (cycle time / arrival). */
  target: string;
  /** Human label — the node's diagram label, or the team name. */
  label: string;
}

export const leverKey = (l: Pick<Lever, "kind" | "target">): string => `${l.kind}${l.target}`;

/** The outcome of one run, reduced to the figures a comparison needs. */
export interface Outcome {
  /** Per-case p50 — the typical case. */
  typical: number;
  /** Per-case p95 — the near-worst case, and what a promise is made against. */
  nearWorst: number;
  /** Run-average flow time, and the half-width of its run-to-run band. The only
   *  pair we can currently judge significance on (see the header). */
  mean: number;
  meanHalfWidth: number;
  throughput: number;
  costPerCase: number;
  /** Per-replication mean flow times, when the run recorded them — what the
   *  significance test actually needs. Absent on older runs. */
  repMeans?: number[];
  /** Team ids ranked by utilisation, busiest first. */
  bottlenecks: string[];
}

/** One (value, outcome) point for a lever: what a scenario set it to, and what
 *  happened. `value` is null when the lever was left at its baseline. */
export interface Observation {
  scenarioId: string;
  scenarioName: string;
  runId: string;
  value: number | null;
  outcome: Outcome;
}

export interface LeverHistory {
  lever: Lever;
  /** Points where the lever was explicitly set, ascending by value. */
  tried: Observation[];
  /** Distinct values tried, ascending. */
  values: number[];
  /** Best (lowest near-worst) observation among `tried`, or null if never tried. */
  best: Observation | null;
  /** Improvement in the primary objective from the worst to the best tried value.
   *  Positive = the lever helped. Null when fewer than two values were tried. */
  bestGain: number | null;
  /** True when `bestGain` cannot be told apart from run-to-run noise. */
  insideNoise: boolean;
  /** True when the best value tried is the largest tried AND it was still
   *  improving — the range has not been taken far enough to find the knee. */
  stillImprovingAtEdge: boolean;
}

export type SuggestionKind =
  | "unaddressed-bottleneck"
  | "still-improving"
  | "untried-lever"
  | "abandoned-lever"
  | "inside-noise";

export interface Suggestion {
  kind: SuggestionKind;
  /** Ranking score, higher first. Deterministic; ties broken by title. */
  score: number;
  title: string;
  /** Why this is being suggested, stated as the numbers it came from. */
  evidence: string;
  lever: Lever;
  /** The scenario this would create — present only when the suggestion is
   *  actionable (capacity levers). Advisory suggestions carry neither, and the
   *  UI must not offer a button for them. */
  scenarioName?: string;
  overrides?: OverrideSet;
}

export interface NextStepsReport {
  /** False when there is not enough history to say anything. The feature says so
   *  rather than inventing advice. */
  enough: boolean;
  reason?: string;
  clockUnit: string;
  /** Scenarios with a completed run — the observations everything is computed from. */
  observations: number;
  levers: LeverHistory[];
  suggestions: Suggestion[];
}

/** Below this many distinct scenarios-with-runs there is nothing to compare, and
 *  the As-is/To-be comparison already covers one-or-two. The review's own floor:
 *  the feature "earns its place from about the third run onward". */
export const MIN_OBSERVATIONS = 3;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The mean of a distribution, for comparing a lever's setting across scenarios.
 *  Every SimDist kind reduces to one number; that is all a range needs. */
function distMean(d: unknown): number | null {
  if (!d || typeof d !== "object") return null;
  const x = d as Record<string, number | string>;
  switch (x.kind) {
    case "fixed": return typeof x.value === "number" ? x.value : null;
    case "uniform": return typeof x.min === "number" && typeof x.max === "number" ? (x.min + x.max) / 2 : null;
    case "triangular": return typeof x.min === "number" && typeof x.mode === "number" && typeof x.max === "number" ? (x.min + x.mode + x.max) / 3 : null;
    case "normal": return typeof x.mean === "number" ? x.mean : null;
    case "exponential": return typeof x.mean === "number" ? x.mean : null;
    default: return null;
  }
}

/** Reduce a run's stored metrics to the figures a comparison needs. Tolerates the
 *  older metric shapes: `caseFlow` post-dates the first runs, so fall back to the
 *  run-average percentiles rather than reporting a zero as if it were measured. */
export function outcomeOf(metrics: RunMetrics): Outcome {
  const s = metrics.stats;
  const cf = s.caseFlow;
  const ft = s.flowTime;
  return {
    typical: cf?.count ? cf.p50 : ft.p50,
    nearWorst: cf?.count ? cf.p95 : ft.p95,
    mean: cf?.count ? cf.mean : ft.mean,
    meanHalfWidth: Math.max(0, (ft.p95 - ft.p5) / 2),
    throughput: s.completed?.mean ?? 0,
    costPerCase: s.costPerCase?.mean ?? 0,
    ...(metrics.repMeans && metrics.repMeans.length > 1 ? { repMeans: metrics.repMeans } : {}),
    bottlenecks: metrics.bottlenecks ?? [],
  };
}

/**
 * Is a difference between two outcomes indistinguishable from run-to-run noise?
 *
 * PHASE 3: a real test. When both runs recorded their per-replication means this
 * is Welch's over those samples; when either did not (an older run), it falls
 * back to the p5–p95 band, which is approximate — and `compareSamples` labels it
 * so, rather than letting an approximation pass as a verdict.
 *
 * This was the ONE stand-in the suggestions rested on. Everything that used it
 * keeps working unchanged; the answers just became defensible.
 */
export function isInsideNoise(a: Outcome, b: Outcome): boolean {
  return compareSamples(a.repMeans, b.repMeans, {
    baseMeanFallback: a.mean,
    compareMeanFallback: b.mean,
    approxHalfWidth: Math.max(a.meanHalfWidth, b.meanHalfWidth),
  }).exceedsBand === false;
}

/** Every lever visible in a run's metrics: one per team, per task, per source. */
export function enumerateLevers(metrics: RunMetrics): Lever[] {
  const levers: Lever[] = [];
  for (const team of Object.keys(metrics.teamCapacities ?? {})) {
    levers.push({ kind: "teamCapacity", target: team, label: team });
  }
  for (const [id, n] of Object.entries(metrics.nodeLabels ?? {})) {
    if (n.kind === "task") levers.push({ kind: "taskCycleTime", target: id, label: n.label });
    else if (n.kind === "source") levers.push({ kind: "sourceArrival", target: id, label: n.label });
  }
  return levers;
}

/** What a scenario set this lever to, or null if it left it at the baseline.
 *  Capacity falls back to the run's library capacity, which IS recorded. */
function valueOf(lever: Lever, ov: OverrideSet, metrics: RunMetrics): number | null {
  if (lever.kind === "teamCapacity") {
    const overridden = ov.teams?.[lever.target]?.capacity;
    if (typeof overridden === "number") return overridden;
    const lib = metrics.teamCapacities?.[lever.target];
    return typeof lib === "number" ? lib : null;
  }
  const el = ov.elements?.[lever.target];
  if (!el) return null;
  return distMean(lever.kind === "taskCycleTime" ? el.cycleTime : el.arrival);
}

/** Was this lever EXPLICITLY set by the scenario (as opposed to left alone)? */
function wasSet(lever: Lever, ov: OverrideSet): boolean {
  if (lever.kind === "teamCapacity") return typeof ov.teams?.[lever.target]?.capacity === "number";
  const el = ov.elements?.[lever.target];
  if (!el) return false;
  return (lever.kind === "taskCycleTime" ? el.cycleTime : el.arrival) !== undefined;
}

/**
 * Per lever: the values tried, what each was worth, and whether the range was
 * pushed far enough. Computed from one observation per scenario (see the header).
 */
export function leverHistory(runs: StudyRun[]): LeverHistory[] {
  const latest = [...latestRunPerScenario(runs).values()];
  if (latest.length === 0) return [];

  // The lever catalog comes from the most recent run's metrics — the closest
  // thing to the study's current shape.
  const newest = latest.reduce((a, b) => (a.startedAt >= b.startedAt ? a : b));
  const levers = enumerateLevers(newest.metrics);

  return levers.map((lever) => {
    const tried: Observation[] = [];
    for (const r of latest) {
      if (!wasSet(lever, r.scenarioOverrides)) continue;
      const value = valueOf(lever, r.scenarioOverrides, r.metrics);
      if (value === null) continue;
      tried.push({
        scenarioId: r.scenarioId,
        scenarioName: r.scenarioName,
        runId: r.runId,
        value,
        outcome: outcomeOf(r.metrics),
      });
    }
    tried.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

    const values = [...new Set(tried.map((t) => t.value as number))];
    // "Best" = lowest near-worst case. That is the figure a promise is made
    // against, and the one the review uses to judge whether a lever mattered.
    const best = tried.length
      ? tried.reduce((a, b) => (b.outcome.nearWorst < a.outcome.nearWorst ? b : a))
      : null;
    const worst = tried.length
      ? tried.reduce((a, b) => (b.outcome.nearWorst > a.outcome.nearWorst ? b : a))
      : null;

    const bestGain = best && worst && values.length >= 2 ? worst.outcome.nearWorst - best.outcome.nearWorst : null;
    const insideNoise = !!(best && worst && values.length >= 2 && isInsideNoise(best.outcome, worst.outcome));

    // Still improving at the edge: the best result came from the LARGEST value
    // tried, and it genuinely beat the next-largest. So the knee has not been
    // found — one more step is worth taking.
    let stillImprovingAtEdge = false;
    if (best && values.length >= 2 && best.value === values[values.length - 1]) {
      const prev = tried.filter((t) => t.value === values[values.length - 2]);
      const prevBest = prev.length ? prev.reduce((a, b) => (b.outcome.nearWorst < a.outcome.nearWorst ? b : a)) : null;
      stillImprovingAtEdge = !!prevBest && best.outcome.nearWorst < prevBest.outcome.nearWorst && !isInsideNoise(best.outcome, prevBest.outcome);
    }

    return { lever, tried, values, best, bestGain, insideNoise, stillImprovingAtEdge };
  });
}

/** A capacity worth trying next, given where a lever has already been taken. */
function nextCapacity(from: number): number {
  return Math.max(from + 1, Math.round(from * 1.5));
}

const capacityOverride = (team: string, capacity: number): OverrideSet => ({ teams: { [team]: { capacity } } });

/**
 * The ranked list. Each entry says what to try, the numbers that justify it, and
 * — for capacity, the one lever we can propose a concrete value for — the
 * scenario that would test it.
 */
export function suggestNextSteps(runs: StudyRun[]): NextStepsReport {
  const latest = [...latestRunPerScenario(runs).values()];
  const observations = latest.length;
  const clockUnit = latest[0]?.metrics.clockUnit ?? "";

  if (observations < MIN_OBSERVATIONS) {
    return {
      enough: false,
      reason:
        observations === 0
          ? "No completed runs yet. Run a scenario, then change something and run it again."
          : `Only ${observations} scenario${observations === 1 ? "" : "s"} ${observations === 1 ? "has" : "have"} been run. ` +
            `Suggestions need at least ${MIN_OBSERVATIONS} to compare — until then, the As-is vs To-be comparison is the tool for the job.`,
      clockUnit,
      observations,
      levers: [],
      suggestions: [],
    };
  }

  const levers = leverHistory(runs);
  const byKey = new Map(levers.map((h) => [leverKey(h.lever), h]));
  const suggestions: Suggestion[] = [];
  const unit = clockUnit ? ` ${clockUnit}${clockUnit === "second" || clockUnit === "minute" || clockUnit === "hour" || clockUnit === "day" ? "s" : ""}` : "";

  // 1. A team that tops the bottleneck ranking in EVERY run and has never had its
  //    capacity changed. The strongest signal in the data: the model has been
  //    saying the same thing every time and nobody has answered it.
  const tops = latest.map((r) => r.metrics.bottlenecks?.[0]).filter((t): t is string => !!t);
  if (tops.length === latest.length && tops.length > 0 && new Set(tops).size === 1) {
    const team = tops[0];
    const h = byKey.get(leverKey({ kind: "teamCapacity", target: team }));
    if (h && h.tried.length === 0) {
      const cap = latest[0].metrics.teamCapacities?.[team];
      const util = latest[0].metrics.stats.perTeam?.[team]?.utilization.mean;
      suggestions.push({
        kind: "unaddressed-bottleneck",
        score: 100,
        title: `Add capacity to ${team}`,
        evidence:
          `${team} has been the busiest team in all ${latest.length} runs` +
          (util !== undefined ? `, at ${Math.round(util * 100)}% utilisation` : "") +
          `, and no scenario has ever changed its capacity.`,
        lever: { kind: "teamCapacity", target: team, label: team },
        ...(typeof cap === "number"
          ? { scenarioName: `${team} at ${nextCapacity(cap)}`, overrides: capacityOverride(team, nextCapacity(cap)) }
          : {}),
      });
    }
  }

  for (const h of levers) {
    const name = h.lever.label;

    // 2. Pushed as far as it has been pushed and still paying — find the knee.
    if (h.stillImprovingAtEdge && h.best?.value != null) {
      const edge = h.best.value;
      const next = h.lever.kind === "teamCapacity" ? nextCapacity(edge) : null;
      suggestions.push({
        kind: "still-improving",
        score: 90,
        title: next !== null ? `Take ${name} past ${edge} — try ${next}` : `Push ${name} further than ${edge}`,
        evidence:
          `Every increase in ${name} so far has helped, and ${edge} — the highest tried — is still the best ` +
          `(near-worst case ${r1(h.best.outcome.nearWorst)}${unit}). The point of diminishing returns has not been found.`,
        lever: h.lever,
        ...(next !== null && h.lever.kind === "teamCapacity"
          ? { scenarioName: `${name} at ${next}`, overrides: capacityOverride(h.lever.target, next) }
          : {}),
      });
      continue;
    }

    // 3. Tried once and left. One point is not a trend — it says nothing about
    //    whether the lever matters.
    if (h.values.length === 1 && h.best) {
      suggestions.push({
        kind: "abandoned-lever",
        score: 60,
        title: `${name} was tried once and left there`,
        evidence:
          `One scenario ("${h.best.scenarioName}") set ${name} to ${h.best.value} and nothing else varied it. ` +
          `A single point cannot show whether it is worth changing.`,
        lever: h.lever,
        ...(h.lever.kind === "teamCapacity" && h.best.value != null
          ? { scenarioName: `${name} at ${nextCapacity(h.best.value)}`, overrides: capacityOverride(h.lever.target, nextCapacity(h.best.value)) }
          : {}),
      });
      continue;
    }

    // 4. Varied, and it made no measurable difference. A negative result, and one
    //    of the most useful things to know: stop looking here.
    if (h.insideNoise && h.values.length >= 2) {
      suggestions.push({
        kind: "inside-noise",
        score: 40,
        title: `${name} is not your constraint`,
        evidence:
          `${h.values.length} different values of ${name} have been run (${h.values.join(", ")}) and the spread in ` +
          `the results is smaller than the run-to-run variation. Changing it further is unlikely to pay.`,
        lever: h.lever,
      });
    }
  }

  // 5. Levers nobody has touched at all — but only the ones that could plausibly
  //    matter, i.e. teams that appear in the bottleneck ranking. Listing every
  //    untouched task in the model would be noise, not advice.
  const ranked = latest[0]?.metrics.bottlenecks ?? [];
  for (const team of ranked.slice(0, 3)) {
    const h = byKey.get(leverKey({ kind: "teamCapacity", target: team }));
    if (!h || h.tried.length > 0) continue;
    if (suggestions.some((s) => s.lever.kind === "teamCapacity" && s.lever.target === team)) continue;
    const cap = latest[0].metrics.teamCapacities?.[team];
    const util = latest[0].metrics.stats.perTeam?.[team]?.utilization.mean;
    suggestions.push({
      kind: "untried-lever",
      score: 50 - ranked.indexOf(team),
      title: `${team} has never been varied`,
      evidence:
        `${team} ranks #${ranked.indexOf(team) + 1} for utilisation` +
        (util !== undefined ? ` (${Math.round(util * 100)}%)` : "") +
        `, and no scenario has changed its capacity.`,
      lever: { kind: "teamCapacity", target: team, label: team },
      ...(typeof cap === "number"
        ? { scenarioName: `${team} at ${nextCapacity(cap)}`, overrides: capacityOverride(team, nextCapacity(cap)) }
        : {}),
    });
  }

  suggestions.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return { enough: true, clockUnit, observations, levers, suggestions };
}

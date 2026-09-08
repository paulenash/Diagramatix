/**
 * Which assumption is load-bearing?
 *
 * A model has thirty numbers in it and most of them do not matter. This varies
 * each in turn and ranks them by how much the answer moves — the tornado chart.
 * It says where to spend effort on better data, and where a rough guess is
 * perfectly safe.
 *
 * THE HALF THAT MATTERS MOST is the bottom of the chart, not the top. "But you
 * guessed that number" is the commonest objection a simulation meets in a
 * meeting room, and the answer is: yes, and here is the evidence that it makes
 * no difference. A tornado that only showed the movers would leave that
 * objection standing.
 *
 * THREE OUTCOMES, NOT TWO. A parameter can move the answer, fail to move it, or
 * be one the model CANNOT VARY — a team of one cannot go down 20%, and an
 * integer headcount rounds back to itself. "Could not be tested" reported as
 * "made no difference" would be a lie of exactly the kind this feature exists to
 * disprove, so the three are kept apart.
 *
 * Cheap because Phase 4 landed first: a tornado is N one-step sweeps, and it
 * reuses that runner, its objective functions and its work clamp wholesale.
 *
 * Pure — no DB, no React, safe for a client component.
 */

import type { SimNetwork } from "./model";
import type { OverrideSet } from "./overrides";
import type { RunMetrics } from "./results";
import { compareSamples } from "./significance";
import { OBJECTIVES, objectiveOf, overrideFor, type SweepLever, type SweepObjective } from "./sweep";

/** How far each parameter is pushed either side of its current value. */
export const DEFAULT_VARIATION = 0.2;

export interface SensitivityParam extends SweepLever {
  /** The value the model currently holds. */
  baseline: number;
}

/** One parameter, pushed low and high. */
export interface SensitivityRun {
  param: SensitivityParam;
  low: { value: number; metrics: RunMetrics } | null;
  high: { value: number; metrics: RunMetrics } | null;
}

export type SensitivityVerdict = "moves" | "no-difference" | "not-testable";

export interface SensitivityBar {
  param: SensitivityParam;
  verdict: SensitivityVerdict;
  /** The objective at each end. Null where that end could not be run. */
  lowY: number | null;
  highY: number | null;
  lowValue: number | null;
  highValue: number | null;
  /** |highY − lowY| — the width of the bar, and the ranking key. */
  swing: number;
  /** The swing as a percentage of the baseline answer. */
  swingPct: number;
  /** Why, in one line — safe to show verbatim. */
  note: string;
}

export interface Tornado {
  objective: SweepObjective;
  objectiveLabel: string;
  unit: string;
  /** The answer as the model currently stands. */
  baselineY: number;
  variationPct: number;
  /** Widest swing first; not-testable parameters last, never interleaved. */
  bars: SensitivityBar[];
  statement: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every parameter worth varying, with the value the model currently holds.
 *
 * Read from the ASSEMBLED NETWORK rather than the diagram, so it is exactly what
 * the run used — including anything a scenario's overrides changed. Reuses the
 * same three lever kinds the suggestions and sweeps use, so the three features
 * can never disagree about what a parameter is.
 */
export function enumerateParameters(net: SimNetwork): SensitivityParam[] {
  const out: SensitivityParam[] = [];
  for (const t of net.teams) {
    out.push({ kind: "teamCapacity", target: t.id, label: t.id, baseline: t.capacity });
  }
  for (const n of net.nodes) {
    const label = n.label ?? n.id.split("::").pop() ?? n.id;
    if (n.kind === "task" && n.cycleTime) {
      const mean = distMean(n.cycleTime);
      if (mean !== null) out.push({ kind: "taskCycleTime", target: n.id, label, baseline: r2(mean) });
    } else if (n.kind === "source" && n.arrival) {
      const mean = distMean(n.arrival);
      if (mean !== null) out.push({ kind: "sourceArrival", target: n.id, label, baseline: r2(mean) });
    }
  }
  return out;
}

function distMean(d: unknown): number | null {
  if (!d || typeof d !== "object") return null;
  const x = d as Record<string, number | string>;
  switch (x.kind) {
    case "fixed": return typeof x.value === "number" ? x.value : null;
    case "uniform": return typeof x.min === "number" && typeof x.max === "number" ? (x.min + x.max) / 2 : null;
    case "triangular": return typeof x.min === "number" && typeof x.mode === "number" && typeof x.max === "number" ? (x.min + x.mode + x.max) / 3 : null;
    case "normal": case "exponential": return typeof x.mean === "number" ? x.mean : null;
    default: return null;
  }
}

/**
 * The two values a parameter is tested at, or null when it cannot meaningfully
 * be varied.
 *
 * Headcount is the case that matters: it is a whole number, so ±20% of 1 rounds
 * straight back to 1 and ±20% of 2 gives 2 and 2. Reporting that as "no
 * difference" would be a fabrication — nothing was tested. It comes back as
 * not-testable instead, and the chart says so.
 */
export function variationsFor(param: SensitivityParam, pct = DEFAULT_VARIATION): { low: number; high: number } | null {
  if (!Number.isFinite(param.baseline) || param.baseline <= 0) return null;
  if (param.kind === "teamCapacity") {
    const low = Math.max(1, Math.round(param.baseline * (1 - pct)));
    const high = Math.round(param.baseline * (1 + pct));
    // Rounding collapsed the range onto the baseline, so nothing would actually
    // be tested. It is tempting to widen it to 1-vs-2 and call that an answer,
    // but that is a +100% perturbation sitting in a chart of ±20% ones: the bar
    // would look like the biggest lever purely because it was pushed hardest.
    // Every bar in a tornado has to be the SAME relative change or the ranking
    // means nothing, so this comes back untestable instead.
    if (low >= high) return null;
    return { low, high };
  }
  const low = r2(param.baseline * (1 - pct));
  const high = r2(param.baseline * (1 + pct));
  if (low === high || low <= 0) return null;
  return { low, high };
}

/** The override that sets this parameter to `value` — the ordinary sweep one, so
 *  a tornado point runs through exactly the same path as any other run. */
export function overrideForParam(param: SensitivityParam, value: number): OverrideSet {
  return overrideFor(param, value);
}

/**
 * Rank the results. Widest swing first, and the parameters that made no
 * difference kept in the chart rather than dropped — that half is the answer to
 * "but you guessed that number".
 */
export function buildTornado(
  baseline: RunMetrics,
  runs: SensitivityRun[],
  objective: SweepObjective,
  variationPct = DEFAULT_VARIATION,
): Tornado {
  const meta = OBJECTIVES.find((o) => o.key === objective) ?? OBJECTIVES[0];
  const unit = baseline.clockUnit ?? "";
  const baselineY = r2(objectiveOf(baseline, objective));
  const half = (m: RunMetrics) => Math.max(0, (m.stats.flowTime.p95 - m.stats.flowTime.p5) / 2);

  const bars: SensitivityBar[] = runs.map((r) => {
    const base: SensitivityBar = {
      param: r.param, verdict: "not-testable",
      lowY: null, highY: null, lowValue: null, highValue: null,
      swing: 0, swingPct: 0,
      note: "",
    };

    if (!r.low || !r.high) {
      base.note = r.param.kind === "teamCapacity"
        ? `${r.param.label} could not be varied — a headcount of ${r.param.baseline} has no meaningful ±${Math.round(variationPct * 100)}%. This is UNTESTED, not unimportant.`
        : `${r.param.label} could not be varied at ±${Math.round(variationPct * 100)}%. This is UNTESTED, not unimportant.`;
      return base;
    }

    const lowY = r2(objectiveOf(r.low.metrics, objective));
    const highY = r2(objectiveOf(r.high.metrics, objective));
    const swing = r2(Math.abs(highY - lowY));
    const swingPct = baselineY !== 0 ? Math.round((swing / Math.abs(baselineY)) * 100) : 0;

    // "No difference" is a significance question, not a smallness one: a tiny
    // swing on noisy runs has not been shown to be nothing.
    const sig = compareSamples(r.low.metrics.repMeans, r.high.metrics.repMeans, {
      lowerIsBetter: meta.lowerIsBetter,
      baseMeanFallback: r.low.metrics.stats.flowTime.mean,
      compareMeanFallback: r.high.metrics.stats.flowTime.mean,
      approxHalfWidth: Math.max(half(r.low.metrics), half(r.high.metrics)),
    });

    return {
      ...base,
      verdict: sig.exceedsBand ? "moves" : "no-difference",
      lowY, highY, lowValue: r.low.value, highValue: r.high.value,
      swing, swingPct,
      note: sig.exceedsBand
        ? `${r.param.label} from ${r.low.value} to ${r.high.value} moves ${meta.label.toLowerCase()} by ${swing}${unit ? " " + unit : ""} (${swingPct}%).`
        : `${r.param.label} makes no measurable difference across ±${Math.round(variationPct * 100)}% — a rough figure here is safe.`,
    };
  });

  // Testable bars ranked by swing; untestable ones after them, never interleaved,
  // because they are a different KIND of answer and mixing them would imply a
  // ranking that does not exist.
  const testable = bars.filter((b) => b.verdict !== "not-testable").sort((a, b) => b.swing - a.swing || a.param.label.localeCompare(b.param.label));
  const untestable = bars.filter((b) => b.verdict === "not-testable").sort((a, b) => a.param.label.localeCompare(b.param.label));

  const movers = testable.filter((b) => b.verdict === "moves");
  const flat = testable.filter((b) => b.verdict === "no-difference");

  let statement: string;
  if (testable.length === 0) {
    statement = "No parameter could be varied meaningfully — there is nothing to rank. Check the model has cycle times and headcounts set.";
  } else if (movers.length === 0) {
    statement =
      `Nothing moved ${meta.label.toLowerCase()} measurably at ±${Math.round(variationPct * 100)}%. Either the model is ` +
      `insensitive over that range, or the runs are too noisy to tell — raise the replications and try again.`;
  } else {
    const top = movers[0];
    statement =
      `${top.param.label} is the load-bearing assumption: ±${Math.round(variationPct * 100)}% on it moves ` +
      `${meta.label.toLowerCase()} by ${top.swing}${unit ? " " + unit : ""} (${top.swingPct}%). ` +
      (flat.length
        ? `${flat.length} of the ${testable.length} parameters tested made NO measurable difference — a rough figure is safe for those.`
        : `Every parameter tested moved the answer, so none of them can be left as a rough guess.`) +
      (untestable.length ? ` ${untestable.length} could not be varied at all and remain untested.` : "");
  }

  return { objective, objectiveLabel: meta.label, unit, baselineY, variationPct, bars: [...testable, ...untestable], statement };
}

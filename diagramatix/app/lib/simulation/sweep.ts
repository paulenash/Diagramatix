/**
 * Sweep a number instead of guessing at it.
 *
 * "How many people do we need?" is answered today by creating a scenario, running
 * it, and repeating. This runs the whole range at once and draws the response
 * curve — and the interesting feature of that curve is the KNEE: the point where
 * one more person stops buying much.
 *
 * The answer to a staffing question is a curve, not a number, and the curve is
 * what stops the conversation coming round again in six months.
 *
 * TWO THINGS THIS MUST NOT DO. It must not report a knee on a curve that has none
 * — a flat response means the lever does nothing, and a straight one means the
 * range never reached the knee; both are findings, and inventing an elbow on
 * either would be worse than saying so. And it must not present a difference
 * inside the run-to-run noise as diminishing returns, which is why the point of
 * diminishing returns is decided by the Phase 3 significance test rather than by
 * eyeballing the gradient.
 *
 * Pure — no DB, no React, safe for a client component.
 */

import type { OverrideSet } from "./overrides";
import type { RunMetrics } from "./results";
import { compareSamples } from "./significance";

/** What a sweep can vary. Mirrors the lever kinds the suggestions already use. */
export type SweepLeverKind = "teamCapacity" | "taskCycleTime" | "sourceArrival" | "timerDelay";

export interface SweepLever {
  kind: SweepLeverKind;
  /** Team name (capacity) or engine node id (cycle time / arrival / delay). */
  target: string;
  label: string;
}

/** What the curve is plotted against. Lower is better for all but throughput. */
export type SweepObjective = "typical" | "nearWorst" | "throughput" | "costPerCase";

export const OBJECTIVES: { key: SweepObjective; label: string; lowerIsBetter: boolean }[] = [
  { key: "nearWorst", label: "Near-worst case (p95)", lowerIsBetter: true },
  { key: "typical", label: "Typical case (p50)", lowerIsBetter: true },
  { key: "throughput", label: "Cases completed", lowerIsBetter: false },
  { key: "costPerCase", label: "Cost per case", lowerIsBetter: true },
];

export interface SweepStep {
  value: number;
  overrides: OverrideSet;
}

/** A step once it has been run. */
export interface SweepPoint extends SweepStep {
  runId?: string;
  metrics: RunMetrics;
}

export interface SweepAnalysis {
  objective: SweepObjective;
  objectiveLabel: string;
  unit: string;
  points: { value: number; y: number; runId?: string }[];
  /** The elbow: the point furthest from the straight line joining the two ends.
   *  Absent when the curve is flat or straight — see the header. */
  knee?: { value: number; y: number; index: number };
  /** The first value beyond which further increases produce no improvement that
   *  can be told apart from run-to-run noise. Absent when it never happens
   *  within the swept range — which means the range was too short. */
  diminishingFrom?: number;
  /** Plain-English reading of the curve, safe to show verbatim. */
  statement: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Values from `from` to `to` in `steps` points, inclusive of both ends.
 *  Capacity is a headcount, so it is whole numbers and duplicates are dropped. */
export function sweepValues(lever: SweepLever, from: number, to: number, steps: number): number[] {
  const n = Math.max(2, Math.floor(steps));
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const raw = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  if (lever.kind !== "teamCapacity") return raw.map(r2);
  // A team of 2.5 people is not a thing to report to anyone.
  return [...new Set(raw.map((v) => Math.max(0, Math.round(v))))].sort((a, b) => a - b);
}

/** The override sets a sweep would run — one per value. */
export function buildSweep(lever: SweepLever, from: number, to: number, steps: number): SweepStep[] {
  return sweepValues(lever, from, to, steps).map((value) => ({ value, overrides: overrideFor(lever, value) }));
}

export function overrideFor(lever: SweepLever, value: number): OverrideSet {
  if (lever.kind === "teamCapacity") return { teams: { [lever.target]: { capacity: Math.max(0, Math.round(value)) } } };
  const dist = { kind: "fixed" as const, value };
  const key = lever.kind === "taskCycleTime" ? "cycleTime" : lever.kind === "timerDelay" ? "delay" : "arrival";
  return { elements: { [lever.target]: { [key]: dist } } };
}

/** The objective's value for one run. Falls back to the run-average percentiles
 *  on runs that predate `caseFlow`, rather than reporting a zero as measured. */
export function objectiveOf(m: RunMetrics, objective: SweepObjective): number {
  const s = m.stats, cf = s.caseFlow, ft = s.flowTime;
  switch (objective) {
    case "typical": return cf?.count ? cf.p50 : ft.p50;
    case "nearWorst": return cf?.count ? cf.p95 : ft.p95;
    case "throughput": return s.completed?.mean ?? 0;
    case "costPerCase": return s.costPerCase?.mean ?? 0;
  }
}

/**
 * The elbow, by maximum distance from the chord joining the first and last
 * points — the standard construction, and the one that matches what a reader
 * means by "the knee". Both axes are normalised first, so the answer does not
 * depend on the units.
 *
 * Returns null when there is nothing to find: fewer than three points, or a
 * curve so close to the chord that calling any point an elbow would be an
 * invention.
 */
export function findKnee(points: { value: number; y: number }[]): { value: number; y: number; index: number } | null {
  const n = points.length;
  if (n < 3) return null;

  const xs = points.map((p) => p.value), ys = points.map((p) => p.y);
  const xLo = Math.min(...xs), xHi = Math.max(...xs);
  const yLo = Math.min(...ys), yHi = Math.max(...ys);
  const xSpan = xHi - xLo, ySpan = yHi - yLo;
  // A flat response: the lever does nothing over this range. Not a knee.
  if (xSpan === 0 || ySpan === 0) return null;

  const nx = points.map((p) => (p.value - xLo) / xSpan);
  const ny = points.map((p) => (p.y - yLo) / ySpan);

  // Distance from each point to the chord (nx[0],ny[0]) → (nx[n-1],ny[n-1]).
  const x1 = nx[0], y1 = ny[0], x2 = nx[n - 1], y2 = ny[n - 1];
  const dx = x2 - x1, dy = y2 - y1;
  const chord = Math.hypot(dx, dy) || 1;

  let bestI = -1, best = 0;
  for (let i = 1; i < n - 1; i++) {
    const d = Math.abs(dy * nx[i] - dx * ny[i] + x2 * y1 - y2 * x1) / chord;
    if (d > best) { best = d; bestI = i; }
  }

  // Essentially a straight line — every point sits on the chord. That means the
  // curve is still improving at a constant rate and the range has NOT reached the
  // knee. Reporting the midpoint as an elbow would be a fabrication.
  if (bestI < 0 || best < 0.05) return null;

  return { value: points[bestI].value, y: points[bestI].y, index: bestI };
}

/** Read the curve: the knee, where the gains stop being real, and what that means. */
export function analyseSweep(lever: SweepLever, points: SweepPoint[], objective: SweepObjective): SweepAnalysis {
  const meta = OBJECTIVES.find((o) => o.key === objective) ?? OBJECTIVES[0];
  const unit = points[0]?.metrics.clockUnit ?? "";
  const plotted = points.map((p) => ({ value: p.value, y: r2(objectiveOf(p.metrics, objective)), runId: p.runId }));

  const analysis: SweepAnalysis = { objective, objectiveLabel: meta.label, unit, points: plotted, statement: "" };
  if (plotted.length < 2) {
    analysis.statement = "A sweep needs at least two values to draw a curve.";
    return analysis;
  }

  const knee = findKnee(plotted);
  if (knee) analysis.knee = knee;

  // Where do the gains stop being REAL? Walk the curve and find the first step
  // whose improvement over the previous point cannot be told apart from noise.
  // Significance, not gradient — a small gain on noisy runs is not a finding.
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].metrics, cur = points[i].metrics;
    const half = (m: RunMetrics) => Math.max(0, (m.stats.flowTime.p95 - m.stats.flowTime.p5) / 2);
    const sig = compareSamples(prev.repMeans, cur.repMeans, {
      lowerIsBetter: meta.lowerIsBetter,
      baseMeanFallback: prev.stats.flowTime.mean,
      compareMeanFallback: cur.stats.flowTime.mean,
      approxHalfWidth: Math.max(half(prev), half(cur)),
    });
    if (!sig.exceedsBand) { analysis.diminishingFrom = points[i - 1].value; break; }
  }

  const first = plotted[0], last = plotted[plotted.length - 1];
  const improved = meta.lowerIsBetter ? last.y < first.y : last.y > first.y;
  const changePct = first.y !== 0 ? Math.abs(((last.y - first.y) / first.y) * 100) : 0;

  if (changePct < 1) {
    analysis.statement =
      `${meta.label} barely moves across ${lever.label} from ${first.value} to ${last.value} ` +
      `(${changePct.toFixed(1)}%). Over this range the lever is not what is holding the process back.`;
  } else if (analysis.knee) {
    analysis.statement =
      `The curve bends at ${lever.label} = ${analysis.knee.value}: ${meta.label} is ${analysis.knee.y}${unit ? " " + unit : ""} there, ` +
      `and past it each further step buys much less. ` +
      (analysis.diminishingFrom !== undefined
        ? `Beyond ${analysis.diminishingFrom} the improvement is inside the run-to-run noise.`
        : `The gains beyond it are still real, so there may be more to take.`);
  } else if (analysis.diminishingFrom !== undefined) {
    analysis.statement =
      `${meta.label} ${improved ? "improves" : "worsens"} across the range, but from ${lever.label} = ` +
      `${analysis.diminishingFrom} onwards the change is inside the run-to-run noise. No clear elbow — ` +
      `the return simply runs out.`;
  } else {
    analysis.statement =
      `${meta.label} ${improved ? "improves" : "worsens"} steadily across the whole range ` +
      `(${changePct.toFixed(0)}% from ${first.value} to ${last.value}) with no bend in it. ` +
      `The point of diminishing returns is OUTSIDE this range — sweep further to find it.`;
  }

  return analysis;
}

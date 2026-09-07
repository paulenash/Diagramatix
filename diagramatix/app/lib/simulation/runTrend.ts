/**
 * The Run History trend: how a scenario's headline numbers have moved since the
 * run pinned as its baseline.
 *
 * Without this, "are we actually getting better?" is answered from memory — the
 * history lists runs but never puts them on the same axis. Pin one run as the
 * baseline and every run after it is measured against that fixed reference.
 *
 * PURE, and it must stay that way: `RunHistory.tsx` is a client component, so
 * anything this imports is bundled for the browser (see
 * tests/simulation/client-bundle-hygiene.test.ts for what happens otherwise).
 */

import type { RunMetrics } from "./results";

/** The subset of a history row this needs. */
export interface TrendRun {
  id: string;
  name: string | null;
  baseline?: boolean;
  startedAt: string;
  metrics: RunMetrics | null;
}

export interface TrendPoint {
  runId: string;
  label: string;
  startedAt: string;
  isBaseline: boolean;
  /** Per-case p50 — the typical case. */
  typical: number;
  /** Per-case p95 — the near-worst case. */
  nearWorst: number;
  throughput: number;
  costPerCase: number;
  /** Change in the typical case vs the baseline. Negative = faster. */
  typicalDelta: number;
  /** Percentage change in the typical case vs the baseline. Negative = faster. */
  typicalPct: number;
  nearWorstDelta: number;
  nearWorstPct: number;
}

export interface RunTrend {
  /** False when no run is pinned as the baseline — the UI says so rather than
   *  silently picking one, because "since when" is the user's judgement. */
  hasBaseline: boolean;
  clockUnit: string;
  /** Baseline first, then every later run in chronological order. */
  points: TrendPoint[];
  /** Net movement from the baseline to the most recent run. */
  net?: { typicalPct: number; nearWorstPct: number; runs: number };
}

/** Per-case percentiles when they were recorded, else the run-average ones —
 *  never a zero presented as if it were measured (older runs predate caseFlow). */
function headline(m: RunMetrics): { typical: number; nearWorst: number; throughput: number; costPerCase: number } {
  const cf = m.stats.caseFlow;
  const ft = m.stats.flowTime;
  return {
    typical: cf?.count ? cf.p50 : ft.p50,
    nearWorst: cf?.count ? cf.p95 : ft.p95,
    throughput: m.stats.completed?.mean ?? 0,
    costPerCase: m.stats.costPerCase?.mean ?? 0,
  };
}

const pct = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : 0);

/**
 * Build the trend from a scenario's run history. Runs before the baseline are
 * excluded: the baseline is the point you chose to measure from, so showing
 * earlier runs on the same axis would misrepresent it as a starting point.
 */
export function buildRunTrend(runs: TrendRun[]): RunTrend {
  const usable = runs.filter((r) => r.metrics && r.metrics.stats);
  const baseline = usable.find((r) => r.baseline);
  const clockUnit = baseline?.metrics?.clockUnit ?? usable[0]?.metrics?.clockUnit ?? "";
  if (!baseline) return { hasBaseline: false, clockUnit, points: [] };

  const base = headline(baseline.metrics!);
  const chronological = [...usable].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const from = chronological.findIndex((r) => r.id === baseline.id);

  const points: TrendPoint[] = chronological.slice(from).map((r) => {
    const h = headline(r.metrics!);
    return {
      runId: r.id,
      label: r.name || new Date(r.startedAt).toLocaleDateString(),
      startedAt: r.startedAt,
      isBaseline: r.id === baseline.id,
      ...h,
      typicalDelta: h.typical - base.typical,
      typicalPct: pct(base.typical, h.typical),
      nearWorstDelta: h.nearWorst - base.nearWorst,
      nearWorstPct: pct(base.nearWorst, h.nearWorst),
    };
  });

  const last = points[points.length - 1];
  return {
    hasBaseline: true,
    clockUnit,
    points,
    ...(last && points.length > 1
      ? { net: { typicalPct: last.typicalPct, nearWorstPct: last.nearWorstPct, runs: points.length - 1 } }
      : {}),
  };
}

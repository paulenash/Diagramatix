/**
 * Shape of the JSON persisted on SimulationRun.metrics by the run API, plus
 * small formatting helpers shared by the results dashboard components
 * (ResultsReport, ScenarioCompare). Kept separate from the engine so the UI
 * imports types without dragging the simulation core into the client bundle.
 */

import type { AggregatedStats, Stat } from "./statistics";

export interface RunMetrics {
  stats: AggregatedStats;
  /** Team ids ranked by mean utilisation, highest first. */
  bottlenecks: string[];
  /** Engine node id → display label + kind (id is namespaced per diagram). */
  nodeLabels: Record<string, { label: string; kind: string }>;
  clockUnit: string;
  /** Team name → capacity, so the comparison can express "FTE freed". */
  teamCapacities?: Record<string, number>;
}

/** A run row as returned by GET .../run (history, newest first). */
export interface RunRow {
  id: string;
  name?: string | null;
  pinned?: boolean;
  metrics: RunMetrics | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** Compact "mean (p5–p95)" for a Stat. */
export function fmtRange(s: Stat | undefined, digits = 1): string {
  if (!s) return "—";
  return `${s.mean.toFixed(digits)} (${s.p5.toFixed(digits)}–${s.p95.toFixed(digits)})`;
}

/** Compact money: $1.2k, $3.4M, $45. */
export function fmtMoney(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1e6) return `$${(x / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(x / 1e3).toFixed(1)}k`;
  return `$${x.toFixed(a < 10 ? 2 : 0)}`;
}

export function fmtPct(x: number | undefined): string {
  return x === undefined ? "—" : `${(x * 100).toFixed(0)}%`;
}

/** Signed delta string vs a baseline, blank when there's no baseline. */
export function fmtDelta(value: number, baseline: number | undefined, digits = 1): string {
  if (baseline === undefined) return "";
  const d = value - baseline;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(digits)}`;
}

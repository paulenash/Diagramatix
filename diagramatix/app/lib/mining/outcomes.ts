/**
 * KPI / SLA outcome analysis — classify each mined case on-time vs late against
 * a case SLA (max cycle time) and find the drivers of lateness: variants and
 * activities over-represented among late cases (lift vs the overall late rate).
 * Pure — no DB, no React. Operates on the persisted per-case index in RunAnalytics.
 */
import type { RunAnalytics } from "./analytics";
import type { Variant } from "./types";

/** Stored on ProcessMiningRun.kpiConfig. */
export interface KpiConfig {
  /** Case SLA: a case is "late" when its cycle time exceeds this many ms. */
  slaMs?: number;
}

export interface VariantDriver { variantIdx: number; cases: number; late: number; lateRate: number; lift: number }
export interface ActivityDriver { activity: string; cases: number; late: number; lateRate: number; lift: number }

export interface OutcomeReport {
  slaMs: number;
  total: number;
  onTime: number;
  late: number;
  onTimePct: number;
  variantDrivers: VariantDriver[];   // most over-represented in late cases first
  activityDrivers: ActivityDriver[];
}

/** Classify cases and rank late-drivers. Returns null when no SLA is set. */
export function computeOutcomes(analytics: RunAnalytics, variants: Variant[], kpi: KpiConfig | null | undefined): OutcomeReport | null {
  const slaMs = kpi?.slaMs;
  if (!slaMs || slaMs <= 0) return null;
  const cases = analytics.cases;
  const total = cases.length;
  if (total === 0) return { slaMs, total: 0, onTime: 0, late: 0, onTimePct: 0, variantDrivers: [], activityDrivers: [] };

  const late = cases.filter((c) => c.cycleMs > slaMs).length;
  const onTime = total - late;
  const overallLate = late / total;

  // Per-variant late rate + lift.
  const byVariant = new Map<number, { cases: number; late: number }>();
  for (const c of cases) {
    const v = byVariant.get(c.variantIdx) ?? { cases: 0, late: 0 };
    v.cases++; if (c.cycleMs > slaMs) v.late++;
    byVariant.set(c.variantIdx, v);
  }
  const variantDrivers: VariantDriver[] = [...byVariant.entries()].map(([variantIdx, v]) => ({
    variantIdx, cases: v.cases, late: v.late,
    lateRate: v.cases ? v.late / v.cases : 0,
    lift: overallLate > 0 && v.cases ? (v.late / v.cases) / overallLate : 0,
  })).filter((d) => d.late > 0).sort((a, b) => b.lift - a.lift || b.late - a.late);

  // Per-activity late rate + lift: a case "contains" an activity if its variant's path does.
  const actCases = new Map<string, { cases: number; late: number }>();
  for (const c of cases) {
    const acts = new Set(variants[c.variantIdx]?.events ?? []);
    const isLate = c.cycleMs > slaMs;
    for (const a of acts) {
      const e = actCases.get(a) ?? { cases: 0, late: 0 };
      e.cases++; if (isLate) e.late++;
      actCases.set(a, e);
    }
  }
  const activityDrivers: ActivityDriver[] = [...actCases.entries()].map(([activity, e]) => ({
    activity, cases: e.cases, late: e.late,
    lateRate: e.cases ? e.late / e.cases : 0,
    lift: overallLate > 0 && e.cases ? (e.late / e.cases) / overallLate : 0,
  })).filter((d) => d.late > 0 && d.lift > 1).sort((a, b) => b.lift - a.lift || b.late - a.late);

  return {
    slaMs, total, onTime, late,
    onTimePct: total ? (onTime / total) * 100 : 0,
    variantDrivers,
    activityDrivers,
  };
}

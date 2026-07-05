/**
 * Control operating-effectiveness from mined data (Phase 2). A Control can name
 * the conformance DEVIATION it guards against (its `monitorSignature`). When the
 * project's DiagramatixMINER conformance shows that deviation in N of M cases,
 * the control was "bypassed" N times — real evidence of whether it is operating,
 * not just that it exists. Pure functions over a ConformanceResult.
 */
import type { ConformanceResult, ConformanceViolation } from "@/app/lib/mining/transitionConformance";
import type { GovernanceStats } from "@/app/lib/mining/types";

/** Canonical signature for a deviation, used to match a control to it. */
export function deviationSignature(v: Pick<ConformanceViolation, "rule" | "data">): string {
  const d = (v.data ?? {}) as Record<string, unknown>;
  if (typeof d.from === "string" && typeof d.to === "string") return `${v.rule}|${d.from}|${d.to}`;
  if (typeof d.state === "string") return `${v.rule}|${d.state}`;
  return v.rule;
}

export interface ObservedDeviation {
  signature: string;
  label: string;     // human message (for the picker)
  rule: string;
  cases: number;
}

/** The deviations a run's conformance observed — the menu a user picks from to
 *  tell a control which deviation it guards. */
export function observedDeviations(conf: ConformanceResult): ObservedDeviation[] {
  return (conf.violations ?? [])
    .map((v) => ({ signature: deviationSignature(v), label: v.message, rule: v.rule, cases: v.cases }))
    .sort((a, b) => b.cases - a.cases);
}

export interface ControlEffectiveness {
  bypassedCases: number;
  totalCases: number;
  effectivenessPct: number | null;   // null when the run has no cases
  label: string;                      // the matched deviation's message (or the raw signature)
  source?: "conformance" | "log";     // deviation-based vs Control-ID-on-events
}

/** Effectiveness of one control against a conformance result. A monitored
 *  deviation that never occurred = 100% effective (0 bypasses). Returns null if
 *  the control monitors nothing. */
export function controlEffectiveness(
  monitorSignature: string | null | undefined,
  conf: ConformanceResult,
): ControlEffectiveness | null {
  if (!monitorSignature) return null;
  const total = conf.totalCases || 0;
  const match = (conf.violations ?? []).find((v) => deviationSignature(v) === monitorSignature);
  const bypassed = match?.cases ?? 0;
  const pct = total > 0 ? Math.round((1 - bypassed / total) * 1000) / 10 : null;
  return { bypassedCases: bypassed, totalCases: total, effectivenessPct: pct, label: match?.message ?? monitorSignature, source: "conformance" };
}

/** Control operating-effectiveness mined DIRECTLY from Control IDs carried on
 *  events (Change B). Matches a control's `code` to the run's governance summary:
 *  the control governed `expected` cases and was actually applied in `applied` of
 *  them — the shortfall was bypassed. Returns null when the log named no such
 *  control. This closes the loop without needing a hand-set monitorSignature. */
export function logControlEffectiveness(
  controlCode: string | null | undefined,
  governance: GovernanceStats | null | undefined,
): ControlEffectiveness | null {
  if (!controlCode || !governance) return null;
  const obs = governance.controls?.[controlCode];
  if (!obs) return null;
  return {
    bypassedCases: obs.bypassed,
    totalCases: obs.expected,
    effectivenessPct: obs.effectivenessPct,
    label: `Control ${controlCode} applied in ${obs.applied} of ${obs.expected} cases`,
    source: "log",
  };
}

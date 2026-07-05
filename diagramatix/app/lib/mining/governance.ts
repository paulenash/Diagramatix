/**
 * Governance aggregates mined from Control / Risk / Policy IDs carried on events —
 * the stored summary that closes the loop with the Risk & Control (GRC) feature.
 *
 * For each Control ID we learn which activities carry it (its "governed"
 * activities), then measure how often the control actually operated:
 *   expected  = distinct cases in which a governed activity occurred
 *   applied   = distinct cases in which the control id was actually recorded
 *   bypassed  = expected − applied   (the activity happened, the control didn't)
 *   effectiveness% = applied / expected
 * Risks and Policies get simple distinct-case counts (traceability, not effect).
 *
 * Computed at import time from the transient traces (raw events aren't stored),
 * so no per-event data is needed downstream. Pure.
 */
import type { CaseTrace, GovernanceStats, ControlObservation } from "./types";

export function computeGovernance(traces: CaseTrace[]): GovernanceStats {
  // Pass 1 — which activities does each control id govern?
  const controlActivities = new Map<string, Set<string>>();
  for (const t of traces) {
    for (const e of t.events) {
      if (e.controlId) (controlActivities.get(e.controlId) ?? controlActivities.set(e.controlId, new Set()).get(e.controlId)!).add(e.activity);
    }
  }

  // Pass 2 — per case, which controls applied and which governed activities occurred.
  const appliedCases = new Map<string, Set<string>>();   // control id → case ids
  const expectedCases = new Map<string, Set<string>>();   // control id → case ids
  const riskCases = new Map<string, Set<string>>();
  const policyCases = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, caseId: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(caseId);

  for (const t of traces) {
    const acts = new Set(t.events.map((e) => e.activity));
    for (const e of t.events) {
      if (e.controlId) add(appliedCases, e.controlId, t.caseId);
      if (e.riskId) add(riskCases, e.riskId, t.caseId);
      if (e.policyId) add(policyCases, e.policyId, t.caseId);
    }
    // A control is "expected" in this case if any of its governed activities occurred.
    for (const [control, governed] of controlActivities) {
      for (const a of governed) if (acts.has(a)) { add(expectedCases, control, t.caseId); break; }
    }
  }

  const controls: Record<string, ControlObservation> = {};
  for (const [control, governed] of controlActivities) {
    const applied = appliedCases.get(control)?.size ?? 0;
    const expected = expectedCases.get(control)?.size ?? 0;
    const bypassed = Math.max(0, expected - applied);
    controls[control] = {
      applied,
      expected,
      bypassed,
      effectivenessPct: expected > 0 ? Math.round((applied / expected) * 1000) / 10 : null,
      activities: [...governed].sort(),
    };
  }
  const risks: Record<string, { cases: number }> = {};
  for (const [risk, cases] of riskCases) risks[risk] = { cases: cases.size };
  const policies: Record<string, { cases: number }> = {};
  for (const [policy, cases] of policyCases) policies[policy] = { cases: cases.size };

  return { controls, risks, policies };
}

/** True when a log actually carried any governance ids (→ worth persisting). */
export function hasGovernance(g: GovernanceStats): boolean {
  return Object.keys(g.controls).length > 0 || Object.keys(g.risks).length > 0 || Object.keys(g.policies).length > 0;
}

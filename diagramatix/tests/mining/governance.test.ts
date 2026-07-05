/**
 * Change B — governance aggregate mined from Control/Risk/Policy IDs on events.
 * A control's effectiveness = applied / expected cases (a governed activity that
 * ran without the control id recorded = a bypass).
 */
import { describe, it, expect } from "vitest";
import { computeGovernance, hasGovernance } from "@/app/lib/mining/governance";
import { logControlEffectiveness } from "@/app/lib/riskControls/controlEffectiveness";
import type { CaseTrace } from "@/app/lib/mining/types";

// Case A exercises control C-01 on "Approve"; case B runs "Approve" WITHOUT it.
const TRACES: CaseTrace[] = [
  { caseId: "A", events: [
    { caseId: "A", activity: "Approve", state: "Approved", timestamp: 1, controlId: "C-01", riskId: "R-01" },
    { caseId: "A", activity: "Pay", state: "Paid", timestamp: 2, policyId: "P-01" },
  ] },
  { caseId: "B", events: [
    { caseId: "B", activity: "Approve", state: "Approved", timestamp: 3 },   // bypass — no control id
    { caseId: "B", activity: "Pay", state: "Paid", timestamp: 4, policyId: "P-01" },
  ] },
];

describe("governance aggregate (Change B)", () => {
  it("T0641 — control applied/expected/bypassed + effectiveness maths", () => {
    const g = computeGovernance(TRACES);
    expect(hasGovernance(g)).toBe(true);
    const c = g.controls["C-01"];
    expect(c.activities).toEqual(["Approve"]);
    expect(c.expected).toBe(2);   // both cases ran "Approve"
    expect(c.applied).toBe(1);    // only A recorded the control
    expect(c.bypassed).toBe(1);
    expect(c.effectivenessPct).toBe(50);
    // risks/policies get distinct-case counts
    expect(g.risks["R-01"].cases).toBe(1);
    expect(g.policies["P-01"].cases).toBe(2);
  });

  it("T0642 — logControlEffectiveness surfaces it for a control by code (loop closure)", () => {
    const g = computeGovernance(TRACES);
    const e = logControlEffectiveness("C-01", g);
    expect(e).not.toBeNull();
    expect(e!.source).toBe("log");
    expect(e!.bypassedCases).toBe(1);
    expect(e!.totalCases).toBe(2);
    expect(e!.effectivenessPct).toBe(50);
    // a control the log never named → no effectiveness
    expect(logControlEffectiveness("C-99", g)).toBeNull();
    // no governance at all
    expect(hasGovernance(computeGovernance([{ caseId: "X", events: [{ caseId: "X", activity: "A", state: "A", timestamp: 1 }] }]))).toBe(false);
  });
});

/**
 * Control operating-effectiveness from mining conformance (Phase 2): the
 * deviation-signature matching + the bypassed/effectiveness maths. Pure, no DB.
 */
import { describe, it, expect } from "vitest";
import { deviationSignature, observedDeviations, controlEffectiveness } from "@/app/lib/riskControls/controlEffectiveness";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";

const CONF: ConformanceResult = {
  fitness: 0.905, totalCases: 200, conformingCases: 181,
  violations: [
    { rule: "undocumented-transition", severity: "error", message: "Undocumented transition: In Progress → Ready to Pay", cases: 39, data: { from: "In Progress", to: "Ready to Pay" } },
    { rule: "unknown-state", severity: "error", message: 'State "Disputed" is not in the reference', cases: 6, data: { state: "Disputed" } },
  ],
  transitionStats: [],
};

describe("control effectiveness", () => {
  it("T0634 — signature matching + bypassed/effectiveness maths", () => {
    // Signature shape per rule.
    expect(deviationSignature(CONF.violations[0])).toBe("undocumented-transition|In Progress|Ready to Pay");
    expect(deviationSignature(CONF.violations[1])).toBe("unknown-state|Disputed");

    // The picker list, most-bypassed first.
    const obs = observedDeviations(CONF);
    expect(obs[0].signature).toBe("undocumented-transition|In Progress|Ready to Pay");
    expect(obs[0].cases).toBe(39);

    // A control guarding the skip-approval transition was bypassed 39/200 → 80.5%.
    const e = controlEffectiveness("undocumented-transition|In Progress|Ready to Pay", CONF)!;
    expect(e.bypassedCases).toBe(39);
    expect(e.totalCases).toBe(200);
    expect(e.effectivenessPct).toBe(80.5);

    // A control guarding a deviation that never occurred → 0 bypasses, 100%.
    const clean = controlEffectiveness("undocumented-transition|Approved|Paid", CONF)!;
    expect(clean.bypassedCases).toBe(0);
    expect(clean.effectivenessPct).toBe(100);

    // No monitor → null.
    expect(controlEffectiveness(null, CONF)).toBeNull();
    expect(controlEffectiveness("", CONF)).toBeNull();
  });
});

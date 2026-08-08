/**
 * KPI/SLA outcome analysis — on-time vs late classification against a case SLA
 * and the late-driver lift (variants/activities over-represented among late cases).
 */
import { describe, it, expect } from "vitest";
import { computeOutcomes } from "@/app/lib/mining/outcomes";
import type { RunAnalytics, CaseSummary } from "@/app/lib/mining/analytics";
import type { Variant } from "@/app/lib/mining/types";

const V = (events: string[], count: number): Variant => ({ states: events, events, count });
const kase = (idx: number, variantIdx: number, cycleMs: number): CaseSummary =>
  ({ idx, caseId: `c${idx}`, variantIdx, startMs: 0, endMs: cycleMs, cycleMs, events: 2 });

// variant 0 = fast path (A,B); variant 1 = slow path (A,X,B)
const VARIANTS = [V(["A", "B"], 3), V(["A", "X", "B"], 3)];
const analytics = {
  clockUnit: "hour",
  activities: [], edges: [], throughput: [],
  cases: [
    kase(0, 0, 10), kase(1, 0, 12), kase(2, 0, 11),   // variant 0 — all on-time
    kase(3, 1, 40), kase(4, 1, 50), kase(5, 1, 20),   // variant 1 — mostly late
  ],
  totalCases: 6, capped: false,
  cycle: { medianMs: 16, p90Ms: 48, minMs: 10, maxMs: 50 },
} as unknown as RunAnalytics;

describe("KPI/SLA outcomes", () => {
  it("T2234 — classifies on-time vs late against the SLA", () => {
    const r = computeOutcomes(analytics, VARIANTS, { slaMs: 30 })!;
    expect(r.total).toBe(6);
    expect(r.late).toBe(2);       // cycle 40 and 50
    expect(r.onTime).toBe(4);
    expect(r.onTimePct).toBeCloseTo((4 / 6) * 100);
  });

  it("T2235 — the slow variant + its unique activity X drive lateness (lift > 1)", () => {
    const r = computeOutcomes(analytics, VARIANTS, { slaMs: 30 })!;
    expect(r.variantDrivers[0].variantIdx).toBe(1);
    expect(r.variantDrivers[0].lift).toBeGreaterThan(1);
    // X only appears on the late variant → strongest activity driver
    const x = r.activityDrivers.find((d) => d.activity === "X");
    expect(x).toBeTruthy();
    expect(x!.lift).toBeGreaterThan(1);
  });

  it("T2236 — no SLA → null (nothing to classify)", () => {
    expect(computeOutcomes(analytics, VARIANTS, null)).toBeNull();
    expect(computeOutcomes(analytics, VARIANTS, { slaMs: 0 })).toBeNull();
  });
});

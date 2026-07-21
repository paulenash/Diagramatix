/**
 * buildComparisonFacts — the deterministic, grounded figures handed to the model
 * for the AI assessment. The prose is Claude's; these numbers are NOT, so they're
 * what we pin. T0547-T0548.
 */
import { describe, it, expect } from "vitest";
import { buildComparisonFacts, summariseComparison } from "@/app/lib/simulation/assessFacts";
import type { RunMetrics } from "@/app/lib/simulation/results";

const stat = (mean: number, p5 = mean, p50 = mean, p95 = mean) => ({ mean, p5, p50, p95 });
const caseDist = (p50: number, p95: number, mean: number, sd: number) => ({ count: 100, mean, sd, min: 0, p50, p90: p95, p95, max: p95, histogram: { min: 0, binWidth: 1, counts: [] } });

function mk(o: { p50: number; p95: number; mean: number; sd: number; completed: number; cpc: number; total: number; util: number; cap: number }): RunMetrics {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stats: {
      replications: 6,
      arrived: stat(o.completed), completed: stat(o.completed),
      flowTime: stat(o.mean, o.mean - 2, o.mean, o.mean + 2),
      totalCost: stat(o.total), costPerCase: stat(o.cpc),
      caseFlow: caseDist(o.p50, o.p95, o.mean, o.sd),
      perNode: {}, perTeam: { Ops: { utilization: stat(o.util), avgQueue: stat(0), maxQueue: stat(0), cost: stat(0) } },
    } as any,
    bottlenecks: ["Ops"], nodeLabels: {}, clockUnit: "minute", teamCapacities: { Ops: o.cap },
  } as unknown as RunMetrics;
}

describe("buildComparisonFacts", () => {
  it("T0547 — computes case-level speed/cost/bottleneck deltas from the two runs", () => {
    const base = mk({ p50: 154, p95: 310, mean: 181, sd: 68, completed: 299, cpc: 125, total: 37237, util: 0.83, cap: 3 });
    const tobe = mk({ p50: 24, p95: 116, mean: 40, sd: 36, completed: 299, cpc: 24, total: 7189, util: 0.14, cap: 3 });
    const f = buildComparisonFacts(base, tobe, "As-is", "To-be", "minute");

    expect(f.baseName).toBe("As-is");
    expect(f.tobeName).toBe("To-be");
    expect(f.flow.baseTypical).toBe(154);
    expect(f.flow.tobeTypical).toBe(24);
    expect(f.flow.typicalPctFaster).toBe(Math.round(((154 - 24) / 154) * 100)); // 84
    expect(f.flow.nearWorstPctFaster).toBe(Math.round(((310 - 116) / 310) * 100)); // 63
    expect(f.cost?.perCaseSaved).toBe(101);
    expect(f.cost?.pctCheaper).toBe(Math.round(((125 - 24) / 125) * 100)); // 81
    expect(f.cost?.totalSaved).toBe(37237 - 7189);
    expect(f.bottleneck?.team).toBe("Ops");
    expect(f.bottleneck?.relievedPts).toBe(69);
    expect(f.bottleneck?.fteFreed).toBeCloseTo((0.83 - 0.14) * 3, 1);
    expect(f.throughput.pctChange).toBe(0); // equal demand cleared

    // Nothing NaN / undefined-number leaks into the facts.
    for (const v of [f.flow.baseTypical, f.flow.tobeTypical, f.flow.typicalPctFaster, f.cost!.perCaseSaved, f.bottleneck!.relievedPts]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("T0548 — omits the cost block when neither run has a cost", () => {
    const base = mk({ p50: 10, p95: 20, mean: 12, sd: 3, completed: 100, cpc: 0, total: 0, util: 0.5, cap: 2 });
    const tobe = mk({ p50: 8, p95: 15, mean: 9, sd: 2, completed: 100, cpc: 0, total: 0, util: 0.3, cap: 2 });
    const f = buildComparisonFacts(base, tobe, "A", "B", "minute");
    expect(f.cost).toBeUndefined();
    expect(f.flow.typicalPctFaster).toBe(Math.round(((10 - 8) / 10) * 100)); // 20
  });
});

describe("summariseComparison — deterministic fallback (AI off)", () => {
  it("T0936 — templates flow/throughput/cost/bottleneck + a verdict, no AI", () => {
    const base = mk({ p50: 154, p95: 310, mean: 181, sd: 68, completed: 299, cpc: 125, total: 37237, util: 0.83, cap: 3 });
    const tobe = mk({ p50: 24, p95: 116, mean: 40, sd: 36, completed: 299, cpc: 24, total: 7189, util: 0.14, cap: 3 });
    const f = buildComparisonFacts(base, tobe, "As-is", "To-be", "minute");
    const s = summariseComparison(f);
    expect(s).toContain("To-be vs As-is");
    expect(s).toContain("154 → 24 minute");          // typical flow
    expect(s).toContain("84% faster");                // typical delta
    expect(s).toContain("cheaper");                   // cost block present
    expect(s).toContain("Ops");                       // bottleneck
    expect(s).toContain("relieved 69 pts");
    expect(s).toContain("improvement on flow time");  // verdict
    expect(s).toContain("deterministically");         // no-AI footer
  });

  it("T0937 — omits the cost line when there is no cost", () => {
    const base = mk({ p50: 10, p95: 20, mean: 12, sd: 3, completed: 100, cpc: 0, total: 0, util: 0.5, cap: 2 });
    const tobe = mk({ p50: 8, p95: 15, mean: 9, sd: 2, completed: 100, cpc: 0, total: 0, util: 0.3, cap: 2 });
    const s = summariseComparison(buildComparisonFacts(base, tobe, "A", "B", "minute"));
    expect(s).not.toContain("Cost per case");
    expect(s).toContain("B is an improvement on flow time");
  });
});

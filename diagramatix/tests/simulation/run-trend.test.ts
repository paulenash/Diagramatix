/**
 * The Run History trend — headline numbers since the run pinned as the baseline.
 *
 * The whole value is that the reference is FIXED and chosen by the user, so the
 * cases that matter are: no baseline (say so, do not guess one), runs before the
 * baseline (excluded — the baseline is the starting point), and direction of the
 * percentages (lower flow time is better, and the sign must not lie about it).
 */
import { describe, it, expect } from "vitest";
import { buildRunTrend, type TrendRun } from "@/app/lib/simulation/runTrend";
import { runIdsToPrune } from "@/app/lib/simulation/runHistory";
import type { RunMetrics } from "@/app/lib/simulation/results";

const stat = (mean: number) => ({ mean, p5: mean, p50: mean, p95: mean });

function metrics(typical: number, nearWorst = typical): RunMetrics {
  return {
    stats: {
      replications: 5,
      arrived: stat(50), completed: stat(50), flowTime: stat(typical),
      totalCost: stat(0), costPerCase: stat(0),
      caseFlow: { count: 50, mean: typical, sd: 1, min: 0, p50: typical, p90: nearWorst, p95: nearWorst, max: nearWorst, histogram: { min: 0, binWidth: 1, counts: [] } },
      perNode: {}, perTeam: {},
    },
    bottlenecks: [], nodeLabels: {}, clockUnit: "minute", teamCapacities: {},
  };
}

const run = (id: string, day: number, typical: number, opts: { baseline?: boolean; name?: string } = {}): TrendRun => ({
  id,
  name: opts.name ?? null,
  baseline: opts.baseline,
  startedAt: `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  metrics: metrics(typical, typical + 20),
});

describe("run trend", () => {
  it("T3389 - with no baseline pinned it says so rather than picking one", () => {
    const t = buildRunTrend([run("a", 1, 100), run("b", 2, 80)]);
    expect(t.hasBaseline).toBe(false);
    expect(t.points).toEqual([]);
  });

  it("T3390 - the baseline comes first and every later run is measured against it", () => {
    const t = buildRunTrend([
      run("c", 3, 60),
      run("a", 1, 100, { baseline: true, name: "Baseline" }),
      run("b", 2, 80),
    ]);
    expect(t.hasBaseline).toBe(true);
    expect(t.points.map((p) => p.runId)).toEqual(["a", "b", "c"]);   // chronological from the baseline
    expect(t.points[0].isBaseline).toBe(true);
    expect(t.points[0].typicalPct).toBe(0);                          // the baseline vs itself
    expect(t.points[1].typicalPct).toBe(-20);                        // 100 → 80
    expect(t.points[2].typicalPct).toBe(-40);                        // 100 → 60
  });

  it("T3391 - runs BEFORE the baseline are excluded, so it reads as the starting point", () => {
    const t = buildRunTrend([
      run("older", 1, 200),
      run("base", 5, 100, { baseline: true }),
      run("later", 9, 90),
    ]);
    expect(t.points.map((p) => p.runId)).toEqual(["base", "later"]);
  });

  it("T3392 - a slower run reads as slower: the sign is not flipped", () => {
    const t = buildRunTrend([run("base", 1, 100, { baseline: true }), run("worse", 2, 130)]);
    expect(t.points[1].typicalPct).toBe(30);
    expect(t.points[1].typicalDelta).toBe(30);
    expect(t.net?.typicalPct).toBe(30);
  });

  it("T3393 - net movement is baseline to most recent, over the number of runs since", () => {
    const t = buildRunTrend([
      run("base", 1, 100, { baseline: true }),
      run("b", 2, 90),
      run("c", 3, 50),
    ]);
    expect(t.net).toEqual({ typicalPct: -50, nearWorstPct: expect.closeTo(-41.67, 1), runs: 2 });
  });

  it("T3394 - a baseline alone is not yet a trend", () => {
    const t = buildRunTrend([run("base", 1, 100, { baseline: true })]);
    expect(t.hasBaseline).toBe(true);
    expect(t.points).toHaveLength(1);
    expect(t.net).toBeUndefined();
  });

  it("T3395 - runs with no metrics are skipped rather than charted as zero", () => {
    const broken: TrendRun = { id: "x", name: null, startedAt: "2026-09-02T10:00:00.000Z", metrics: null };
    const t = buildRunTrend([run("base", 1, 100, { baseline: true }), broken, run("c", 3, 80)]);
    expect(t.points.map((p) => p.runId)).toEqual(["base", "c"]);
  });

  it("T3396 - a baseline run is never pruned, so the trend cannot lose its reference", () => {
    // The route pins a run when it is made the baseline; pruning only removes
    // unpinned runs. This pins that contract from the pruning side.
    const runs = [
      { id: "baseline", pinned: true, startedAt: new Date("2026-01-01") },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, pinned: false, startedAt: new Date(`2026-02-${String(i + 1).padStart(2, "0")}`) })),
    ];
    expect(runIdsToPrune(runs, 5)).not.toContain("baseline");
  });
});

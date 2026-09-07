/**
 * Sweeping a number, and reading the curve that comes back.
 *
 * The answer to "how many people do we need?" is a curve, and the useful feature
 * of the curve is the knee. So the tests that matter most are the ones where
 * there ISN'T one: a flat response means the lever does nothing, and a straight
 * line means the range never reached the elbow. Inventing a knee on either would
 * be worse than saying so, because someone would staff to it.
 */
import { describe, it, expect } from "vitest";
import {
  buildSweep, sweepValues, overrideFor, findKnee, analyseSweep, objectiveOf,
  type SweepLever, type SweepPoint,
} from "@/app/lib/simulation/sweep";
import { clampSweep, RUN_LIMITS } from "@/app/lib/simulation/runner";
import { DEFAULT_RUN_CONFIG } from "@/app/lib/simulation/types";
import type { RunMetrics } from "@/app/lib/simulation/results";

const CAP: SweepLever = { kind: "teamCapacity", target: "Assessment", label: "Assessment" };
const stat = (mean: number, spread = 0) => ({ mean, p5: mean - spread, p50: mean, p95: mean + spread });

/** A run whose near-worst case is `y`. `spread` widens the run-to-run band. */
function metrics(y: number, spread = 0, reps?: number[]): RunMetrics {
  return {
    stats: {
      replications: reps?.length ?? 5,
      arrived: stat(100), completed: stat(100), flowTime: stat(y, spread),
      totalCost: stat(0), costPerCase: stat(0),
      caseFlow: { count: 100, mean: y, sd: 1, min: 0, p50: y, p90: y, p95: y, max: y, histogram: { min: 0, binWidth: 1, counts: [] } },
      perNode: {}, perTeam: {},
    },
    bottlenecks: [], nodeLabels: {}, clockUnit: "minute", teamCapacities: {},
    ...(reps ? { repMeans: reps } : {}),
  };
}

/** Points at values 1..n with the given y values. */
const pts = (ys: number[], spread = 0, reps?: (i: number) => number[]): SweepPoint[] =>
  ys.map((y, i) => ({ value: i + 1, overrides: {}, metrics: metrics(y, spread, reps?.(i)) }));

describe("sweep — building the steps", () => {
  it("T3442 - a capacity sweep is whole people, inclusive of both ends, with no duplicates", () => {
    expect(sweepValues(CAP, 1, 6, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    // more steps than whole values between the ends collapses rather than repeating
    expect(sweepValues(CAP, 1, 3, 9)).toEqual([1, 2, 3]);
  });

  it("T3443 - a continuous lever keeps its fractions", () => {
    const t: SweepLever = { kind: "taskCycleTime", target: "n1", label: "Assess" };
    expect(sweepValues(t, 1, 2, 3)).toEqual([1, 1.5, 2]);
  });

  it("T3444 - each step is an ordinary override, so the sweep runs through the normal path", () => {
    expect(overrideFor(CAP, 4)).toEqual({ teams: { Assessment: { capacity: 4 } } });
    expect(overrideFor({ kind: "sourceArrival", target: "src", label: "Arrivals" }, 12))
      .toEqual({ elements: { src: { arrival: { kind: "fixed", value: 12 } } } });
    expect(buildSweep(CAP, 1, 3, 3).map((s) => s.value)).toEqual([1, 2, 3]);
  });
});

describe("sweep — the knee", () => {
  it("T3445 - a curve that bends reports the elbow", () => {
    // steep then flat: 100, 50, 30, 26, 25, 24
    const knee = findKnee([100, 50, 30, 26, 25, 24].map((y, i) => ({ value: i + 1, y })));
    expect(knee).not.toBeNull();
    expect(knee!.value).toBe(3);      // where it stops falling steeply
  });

  it("T3446 - a FLAT response has no knee, because the lever does nothing", () => {
    expect(findKnee([50, 50, 50, 50, 50].map((y, i) => ({ value: i + 1, y })))).toBeNull();
  });

  it("T3447 - a STRAIGHT line has no knee: the range never reached it", () => {
    expect(findKnee([100, 80, 60, 40, 20].map((y, i) => ({ value: i + 1, y })))).toBeNull();
  });

  it("T3448 - two points cannot have a knee", () => {
    expect(findKnee([{ value: 1, y: 100 }, { value: 2, y: 50 }])).toBeNull();
  });
});

describe("sweep — reading the curve", () => {
  it("T3449 - a bending curve is described with the knee and what lies past it", () => {
    const a = analyseSweep(CAP, pts([100, 50, 30, 26, 25, 24]), "nearWorst");
    expect(a.knee?.value).toBe(3);
    expect(a.statement).toContain("bends at Assessment = 3");
  });

  it("T3450 - a straight curve SAYS the knee is outside the range instead of inventing one", () => {
    const a = analyseSweep(CAP, pts([100, 80, 60, 40, 20]), "nearWorst");
    expect(a.knee).toBeUndefined();
    expect(a.statement).toMatch(/OUTSIDE this range/);
    expect(a.statement).toMatch(/sweep further/i);
  });

  it("T3451 - a flat curve reports the lever as not the constraint", () => {
    const a = analyseSweep(CAP, pts([50, 50, 50, 50]), "nearWorst");
    expect(a.statement).toMatch(/not what is holding the process back/i);
  });

  it("T3452 - diminishing returns are decided by significance, not by the gradient", () => {
    // Values fall 100 → 60 → 58 → 57. The last two steps are tiny AND the runs
    // are noisy, so they must not be presented as real improvement.
    const noisy = pts([100, 60, 58, 57], 20, (i) => [100, 60, 58, 57][i] === 100 ? [110, 90] : [65, 55]);
    const a = analyseSweep(CAP, noisy, "nearWorst");
    expect(a.diminishingFrom).toBeDefined();
    expect(a.diminishingFrom).toBeLessThanOrEqual(3);
  });

  it("T3453 - the objective picked is the one plotted", () => {
    const m = metrics(42);
    m.stats.completed = stat(999);
    expect(objectiveOf(m, "nearWorst")).toBe(42);
    expect(objectiveOf(m, "throughput")).toBe(999);
  });
});

describe("sweep — the cost guard", () => {
  const cfg = (over: Record<string, number> = {}) => ({ ...DEFAULT_RUN_CONFIG, horizon: 1000, replications: 10, ...over });

  it("T3454 - the step count is capped, and the caller is told it was", () => {
    const r = clampSweep(cfg(), 500);
    expect(r.steps).toBe(RUN_LIMITS.maxSweepSteps);
    expect(r.clamped).toBe(true);
  });

  it("T3455 - a sweep that would blow the work budget loses REPLICATIONS before steps", () => {
    // 20 steps x 100_000 horizon x 100 reps is far past maxWork
    const r = clampSweep(cfg({ horizon: 100_000, replications: 100 }), 20);
    expect(r.steps).toBe(20);                       // the curve keeps its shape
    expect(r.cfg.replications).toBeLessThan(100);   // precision gives way first
    expect(r.steps * r.cfg.horizon * r.cfg.replications).toBeLessThanOrEqual(RUN_LIMITS.maxWork);
    expect(r.clamped).toBe(true);
  });

  it("T3456 - a reasonable sweep passes through untouched", () => {
    const r = clampSweep(cfg({ horizon: 480, replications: 8 }), 8);
    expect(r.steps).toBe(8);
    expect(r.cfg.replications).toBe(8);
    expect(r.clamped).toBe(false);
  });

  it("T3457 - a sweep is never reduced below two points, which would not be a curve", () => {
    const r = clampSweep(cfg({ horizon: 100_000 }), 1);
    expect(r.steps).toBeGreaterThanOrEqual(2);
  });
});

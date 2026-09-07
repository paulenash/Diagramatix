/**
 * "Is the difference real?" — Welch's test over the per-replication means.
 *
 * The failure this module exists to prevent is someone presenting a 4%
 * improvement that is entirely sampling noise. So the tests that matter are the
 * ones where the answer is NO, and the one where the data is not good enough to
 * answer at all: those must never come back as a finding.
 */
import { describe, it, expect } from "vitest";
import {
  compareSamples, replicationsNeeded, tCritical95, mean, variance,
} from "@/app/lib/simulation/significance";

/** n samples around `m`, alternating ±spread — a controlled, exact variance. */
const around = (m: number, spread: number, n: number) =>
  Array.from({ length: n }, (_, i) => m + (i % 2 === 0 ? spread : -spread));

describe("significance — the verdict", () => {
  it("T3422 - a large difference against tight runs is reported as real, with an interval", () => {
    const r = compareSamples(around(100, 1, 10), around(60, 1, 10), { label: "the improvement" });
    expect(r.verdict).toBe("real");
    expect(r.difference).toBeCloseTo(40, 5);
    expect(r.halfWidth).toBeLessThan(40);
    expect(r.ci[0]).toBeGreaterThan(0);          // the interval excludes zero
    expect(r.statement).toMatch(/real difference, not sampling variation/i);
  });

  it("T3423 - a small difference against noisy runs is INSIDE the noise, and says so", () => {
    const r = compareSamples(around(100, 30, 6), around(96, 30, 6), { label: "the improvement" });
    expect(r.verdict).toBe("inside-noise");
    expect(r.statement).toMatch(/INSIDE the run-to-run noise/);
    expect(r.statement).not.toMatch(/real difference/);
  });

  it("T3424 - an inside-the-noise verdict says how many replications would settle it", () => {
    const r = compareSamples(around(100, 20, 5), around(90, 20, 5));
    expect(r.verdict).toBe("inside-noise");
    expect(r.replicationsNeeded).toBeGreaterThan(5);
    expect(r.statement).toContain(String(r.replicationsNeeded));
  });

  it("T3425 - a run with no stored per-replication vector is APPROXIMATE, never certain", () => {
    const r = compareSamples(undefined, undefined, {
      label: "the improvement", baseMeanFallback: 100, compareMeanFallback: 60, approxHalfWidth: 5,
    });
    expect(r.verdict).toBe("approximate");
    expect(r.statement).toMatch(/predate per-replication recording/i);
    expect(r.statement).toMatch(/Re-run both sides/i);
  });

  it("T3426 - with nothing at all it refuses to answer rather than guessing", () => {
    const r = compareSamples([], []);
    expect(r.verdict).toBe("not-enough-data");
    expect(r.statement).toMatch(/Not enough recorded runs/i);
  });

  it("T3427 - two perfectly steady runs: any difference is real, an identical one is not", () => {
    const same = compareSamples([50, 50, 50], [50, 50, 50]);
    expect(same.verdict).toBe("inside-noise");
    const differs = compareSamples([50, 50, 50], [40, 40, 40]);
    expect(differs.verdict).toBe("real");
    expect(differs.statement).toMatch(/neither run varied at all/i);
  });

  it("T3428 - direction is described from the reader's point of view, not the sign", () => {
    // flow time: lower is better, so a positive difference (base − compare) is an improvement
    const faster = compareSamples(around(100, 1, 8), around(60, 1, 8), { lowerIsBetter: true });
    expect(faster.statement).toContain("better");
    // throughput: higher is better, so the same sign is a regression
    const lessWork = compareSamples(around(100, 1, 8), around(60, 1, 8), { lowerIsBetter: false });
    expect(lessWork.statement).toContain("worse");
  });
});

describe("significance — the decision is separate from the confidence", () => {
  // Folding these together made every comparison against an older run read as
  // noise, because the fallback path could never return "real". `exceedsBand`
  // says which way the answer points; `verdict` says how much to trust it.
  it("T3432 - an approximate comparison can still exceed the band, and is labelled approximate", () => {
    const r = compareSamples(undefined, undefined, {
      baseMeanFallback: 100, compareMeanFallback: 60, approxHalfWidth: 5,
    });
    expect(r.exceedsBand).toBe(true);
    expect(r.verdict).toBe("approximate");
  });

  it("T3433 - a zero band means the replications agreed exactly, not that nothing is known", () => {
    const r = compareSamples(undefined, undefined, {
      baseMeanFallback: 100, compareMeanFallback: 99, approxHalfWidth: 0,
    });
    expect(r.exceedsBand).toBe(true);
    const same = compareSamples(undefined, undefined, {
      baseMeanFallback: 100, compareMeanFallback: 100, approxHalfWidth: 0,
    });
    expect(same.exceedsBand).toBe(false);
  });

  it("T3434 - a real verdict and an inside-noise verdict agree with exceedsBand", () => {
    expect(compareSamples(around(100, 1, 10), around(60, 1, 10)).exceedsBand).toBe(true);
    expect(compareSamples(around(100, 30, 6), around(96, 30, 6)).exceedsBand).toBe(false);
  });
});

describe("significance — the arithmetic", () => {
  it("T3429 - the t table is conservative between rows, never narrower than it should be", () => {
    expect(tCritical95(10)).toBe(2.228);
    expect(tCritical95(1)).toBe(12.706);
    // between 30 and 40 we keep the LARGER (df=30) value rather than interpolating down
    expect(tCritical95(35)).toBe(2.042);
    expect(tCritical95(500)).toBeCloseTo(1.96, 3);
  });

  it("T3430 - mean and sample variance use n-1, and are zero-safe", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(variance([2, 4, 6])).toBe(4);          // ((4+0+4)/2)
    expect(variance([5])).toBe(0);
    expect(mean([])).toBe(0);
  });

  it("T3431 - resolving a smaller difference needs more replications, and impossible ones return nothing", () => {
    const big = replicationsNeeded(100, 100, 20);
    const small = replicationsNeeded(100, 100, 2);
    expect(big).toBeDefined();
    expect(small === undefined || small > big!).toBe(true);
    // a difference of essentially zero cannot be resolved at any practical n
    expect(replicationsNeeded(100, 100, 0.0001)).toBeUndefined();
    expect(replicationsNeeded(100, 100, 0)).toBeUndefined();
  });
});

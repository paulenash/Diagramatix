/**
 * Does the model match reality?
 *
 * The value of a validation figure is entirely in its honesty, so the tests that
 * matter are the ones where the answer is uncomfortable:
 *
 *  - a model that DIVERGES must say so, not soften it;
 *  - too little data must REFUSE to answer, because a KS test on a handful of
 *    cases fails to reject almost anything and would read as "excellent";
 *  - agreement must never be worded as proof the model is correct.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  compareDistributions, ksStatistic, quantileVector, splitByTime, MIN_SAMPLES,
} from "@/app/lib/simulation/validate";

/** n samples spread evenly over [lo, hi] — a flat, exactly-known distribution. */
const spread = (n: number, lo: number, hi: number) =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

describe("validate — the KS statistic", () => {
  it("T3493 - identical distributions have a gap of zero", () => {
    const a = spread(100, 0, 100);
    expect(ksStatistic(a, [...a])).toBe(0);
  });

  it("T3494 - completely separated distributions have the largest possible gap", () => {
    expect(ksStatistic(spread(50, 0, 10), spread(50, 100, 110))).toBe(1);
  });

  it("T3495 - a partial shift lands between the two, and is symmetric", () => {
    const a = spread(100, 0, 100), b = spread(100, 50, 150);
    const d = ksStatistic(a, b);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1);
    expect(ksStatistic(b, a)).toBeCloseTo(d, 10);
  });
});

describe("validate — the verdict", () => {
  it("T3496 - a model matching the log reports agreement, and does NOT claim to be proven right", () => {
    const observed = spread(200, 10, 110);
    const simulated = spread(200, 10, 110);
    const r = compareDistributions(simulated, observed, { unit: "hours" });
    expect(r.enough).toBe(true);
    expect(r.close).toBe(true);
    expect(r.agreementPct).toBe(100);
    // The wording must not overstate what failing to reject means.
    expect(r.statement).toMatch(/not proof the model is right/i);
  });

  it("T3497 - a model that diverges says so plainly and points at what to check", () => {
    const observed = spread(200, 10, 110);
    const simulated = spread(200, 60, 160);      // systematically slower
    const r = compareDistributions(simulated, observed, { unit: "hours" });
    expect(r.close).toBe(false);
    expect(r.statement).toMatch(/DIVERGE/);
    expect(r.statement).toMatch(/arrival rate|branch splits|working calendar/i);
    expect(r.d).toBeGreaterThan(r.dCritical);
  });

  it("T3498 - too few cases REFUSES to answer rather than returning a flattering figure", () => {
    const few = spread(MIN_SAMPLES - 1, 10, 110);
    const r = compareDistributions(few, spread(500, 10, 110));
    expect(r.enough).toBe(false);
    expect(r.statement).toMatch(/Not enough cases/i);
    expect(r.statement).toMatch(/would read as agreement/i);
  });

  it("T3499 - the critical value reflects the TRUE case count, not the stored quantile vector", () => {
    const observed = spread(500, 10, 110);
    const quantiles = quantileVector(spread(5000, 10, 110));   // 101 numbers for 5000 cases
    const honest = compareDistributions(quantiles, observed, { simulatedN: 5000 });
    const lenient = compareDistributions(quantiles, observed);  // pretends there were 101
    // More evidence ⇒ a TIGHTER threshold. Passing 101 would make the test far
    // too easy to pass, which is the whole reason simulatedN exists.
    expect(honest.dCritical).toBeLessThan(lenient.dCritical);
  });

  it("T3500 - both distributions are summarised, so the reader can see WHERE they differ", () => {
    const r = compareDistributions(spread(200, 60, 160), spread(200, 10, 110), { unit: "hours" });
    expect(r.observed.p50).toBeCloseTo(60, 0);
    expect(r.simulated.p50).toBeCloseTo(110, 0);
    expect(r.observed.n).toBe(200);
    expect(r.statement).toContain("near-worst");
  });
});

describe("validate — the quantile vector", () => {
  it("T3501 - 101 quantiles reproduce the distribution closely enough to test against", () => {
    const full = spread(5000, 0, 1000);
    const q = quantileVector(full);
    expect(q).toHaveLength(101);
    expect(q[0]).toBeCloseTo(0, 5);
    expect(q[100]).toBeCloseTo(1000, 5);
    // The compact form must not itself create a difference.
    expect(ksStatistic(q, full)).toBeLessThan(0.02);
  });

  it("T3502 - an empty sample set yields no vector rather than a row of zeros", () => {
    expect(quantileVector([])).toEqual([]);
  });
});

describe("validate — holding data back", () => {
  const cases = Array.from({ length: 100 }, (_, i) => ({ startMs: i * 1000, id: i }));

  it("T3503 - the split is CHRONOLOGICAL: earlier cases fit, later cases test", () => {
    const { fit, holdout, splitMs } = splitByTime(cases, 0.2);
    expect(fit).toHaveLength(80);
    expect(holdout).toHaveLength(20);
    // Every held-out case must be later than every fitted one — a random split
    // would leak the future into the fit and validate the model against itself.
    expect(Math.max(...fit.map((c) => c.startMs))).toBeLessThan(Math.min(...holdout.map((c) => c.startMs)));
    expect(splitMs).toBe(80 * 1000);
  });

  it("T3504 - a zero holdout keeps everything for fitting, and holds nothing back", () => {
    const { fit, holdout, splitMs } = splitByTime(cases, 0);
    expect(fit).toHaveLength(100);
    expect(holdout).toEqual([]);
    expect(splitMs).toBeNull();
  });

  it("T3505 - the holdout is capped, so a model can never be fitted on nothing", () => {
    const { fit, holdout } = splitByTime(cases, 0.99);
    expect(fit.length).toBeGreaterThan(0);
    expect(holdout.length).toBeLessThan(cases.length);
  });

  it("T3506 - cases arriving out of order are sorted before splitting", () => {
    const shuffled = [...cases].reverse();
    const { fit, holdout } = splitByTime(shuffled, 0.1);
    expect(Math.max(...fit.map((c) => c.startMs))).toBeLessThan(Math.min(...holdout.map((c) => c.startMs)));
  });
});

describe("validate — the route is reachable", () => {
  it("T3507 - the path the panel posts to resolves to a route file", () => {
    const resolves = (pathname: string): boolean => {
      let dir = path.join(process.cwd(), "app");
      for (const raw of pathname.split("/").filter(Boolean)) {
        if (!fs.existsSync(dir)) return false;
        const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
        if (names.includes(raw)) { dir = path.join(dir, raw); continue; }
        const dyn = names.find((n) => n.startsWith("[") && n.endsWith("]") && !n.startsWith("[..."));
        if (!dyn) return false;
        dir = path.join(dir, dyn);
      }
      return fs.existsSync(path.join(dir, "route.ts"));
    };
    expect(resolves("/api/projects/p1/mining/runs/r1/validate")).toBe(true);
    // ...and the check can fail on a neighbouring path with no handler.
    expect(resolves("/api/projects/p1/mining/runs/r1/validate-typo")).toBe(false);
  });
});

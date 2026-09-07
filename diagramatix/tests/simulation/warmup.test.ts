/**
 * Suggesting a warm-up rather than asking someone to guess one.
 *
 * Smaller item 06. The suggestion must be exactly that — the cases that matter
 * are the ones where it declines to answer, because a wrong warm-up silently
 * throws away most of a run, and a transient is sometimes the very thing being
 * studied (a Monday backlog clearing).
 */
import { describe, it, expect } from "vitest";
import { suggestWarmUp } from "@/app/lib/simulation/warmup";

/** A run that starts fast (empty system) and settles at `level`. */
const settling = (n: number, level: number, startAt: number, settleBy: number) =>
  Array.from({ length: n }, (_, i) => (i >= settleBy ? level : startAt + ((level - startAt) * i) / settleBy));

const times = (n: number, step = 10) => Array.from({ length: n }, (_, i) => i * step);

describe("warm-up suggestion", () => {
  it("T3435 - a run that settles gets a warm-up covering the transient", () => {
    const n = 200;
    const r = suggestWarmUp(settling(n, 100, 20, 60), { completionTimes: times(n) });
    expect(r.warmUp).not.toBeNull();
    expect(r.warmUp!).toBeGreaterThan(0);
    // the transient ends around case 60, i.e. about t=600 at 10 per case
    expect(r.warmUp!).toBeLessThan(1200);
    expect(r.reason).toMatch(/settle/i);
  });

  it("T3436 - a run that is steady from the start needs no warm-up", () => {
    const n = 100;
    const r = suggestWarmUp(Array.from({ length: n }, () => 50), { completionTimes: times(n) });
    expect(r.warmUp).toBe(0);
    expect(r.reason).toMatch(/settles immediately/i);
  });

  it("T3437 - too few cases DECLINES to answer rather than inventing a number", () => {
    const r = suggestWarmUp([10, 12, 11, 13, 9], { completionTimes: times(5) });
    expect(r.warmUp).toBeNull();
    expect(r.reason).toMatch(/Too few completed cases/i);
  });

  it("T3438 - a run that never settles says so instead of suggesting a huge warm-up", () => {
    // steadily climbing: an overloaded model whose queue grows for the whole run
    const n = 200;
    const climbing = Array.from({ length: n }, (_, i) => 10 + i * 5);
    const r = suggestWarmUp(climbing, { completionTimes: times(n) });
    expect(r.warmUp).toBe(0);
    expect(r.reason).toMatch(/never settles|overloaded/i);
  });

  it("T3439 - without completion times it reports the case position and asks for a re-run", () => {
    const n = 200;
    const r = suggestWarmUp(settling(n, 100, 20, 60));
    expect(r.warmUp).toBeNull();
    expect(r.reason).toMatch(/did not record when each finished/i);
    expect(r.reason).toMatch(/Re-run/i);
  });

  it("T3440 - the smoothed series is returned, so the shape can be shown rather than trusted", () => {
    const n = 100;
    const r = suggestWarmUp(settling(n, 100, 20, 40), { completionTimes: times(n) });
    expect(r.smoothed).toHaveLength(n);
    // smoothing must not invent values outside the data's range
    expect(Math.min(...r.smoothed)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...r.smoothed)).toBeLessThanOrEqual(100);
  });
});

/**
 * Case-level flow-time distribution (caseDistOf) — the per-case percentiles,
 * spread + histogram that back the "Typical (p50) / Near worst (p95)" report and
 * the distribution display. Distinct from the run-to-run Stat. T0544-T0546.
 */
import { describe, it, expect } from "vitest";
import { caseDistOf } from "@/app/lib/simulation/statistics";

describe("caseDistOf", () => {
  it("T0544 — empty samples → zeroed distribution (no NaN)", () => {
    const d = caseDistOf([]);
    expect(d.count).toBe(0);
    expect(d.p50).toBe(0);
    expect(d.p95).toBe(0);
    expect(d.sd).toBe(0);
    expect(d.histogram.counts).toEqual([]);
  });

  it("T0545 — 1..100: correct mean/sd/percentiles/range, histogram covers every case", () => {
    const d = caseDistOf(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(d.count).toBe(100);
    expect(d.min).toBe(1);
    expect(d.max).toBe(100);
    expect(d.mean).toBeCloseTo(50.5, 6);
    expect(d.p50).toBeCloseTo(50.5, 1);
    expect(d.p95).toBeGreaterThan(94);
    expect(d.p95).toBeLessThan(97);
    expect(d.sd).toBeGreaterThan(28); // population sd of 1..100 ≈ 28.87
    expect(d.sd).toBeLessThan(30);
    // No case is lost or double-counted by the binning.
    expect(d.histogram.counts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("T0546 — a single repeated value → degenerate one-bin dist, zero spread", () => {
    const d = caseDistOf([42, 42, 42]);
    expect(d.p50).toBe(42);
    expect(d.p95).toBe(42);
    expect(d.sd).toBe(0);
    expect(d.histogram.counts.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

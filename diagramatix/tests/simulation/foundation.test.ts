/**
 * Engine foundation: RNG reproducibility (incl. snapshot/restore — the basis
 * of Operator fork determinism), distribution sampling, ISO-8601 durations,
 * and the event calendar's deterministic ordering.
 */
import { describe, it, expect } from "vitest";
import { makeRng, deriveSeed } from "@/app/lib/simulation/rng";
import { sample, meanOf } from "@/app/lib/simulation/distributions";
import { isoToSeconds, secondsToIso, isoToUnit, unitToIso } from "@/app/lib/simulation/duration";
import { EventCalendar } from "@/app/lib/simulation/eventCalendar";
import type { SimDist } from "@/app/lib/simulation/types";

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42), b = makeRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("snapshot/restore reproduces the continuation exactly (Operator fork basis)", () => {
    const r = makeRng(7);
    r.next(); r.next();
    const cursor = r.snapshot();
    const expected = [r.next(), r.next(), r.next()];
    r.restore(cursor);
    expect([r.next(), r.next(), r.next()]).toEqual(expected);
  });

  it("derives independent streams per replication", () => {
    const s0 = deriveSeed(1, 0), s1 = deriveSeed(1, 1);
    expect(s0).not.toEqual(s1);
    const a = makeRng(s0).next(), b = makeRng(s1).next();
    expect(a).not.toEqual(b);
  });
});

describe("distributions", () => {
  const rng = makeRng(123);
  it("fixed is exact; uniform + triangular stay in bounds", () => {
    expect(sample({ kind: "fixed", value: 5 }, rng)).toBe(5);
    for (let i = 0; i < 1000; i++) {
      const u = sample({ kind: "uniform", min: 2, max: 8 }, rng);
      expect(u).toBeGreaterThanOrEqual(2);
      expect(u).toBeLessThanOrEqual(8);
      const t = sample({ kind: "triangular", min: 1, mode: 3, max: 9 }, rng);
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(9);
    }
  });

  it("sample means converge to the analytic mean", () => {
    const dists: SimDist[] = [
      { kind: "uniform", min: 0, max: 10 },
      { kind: "triangular", min: 0, mode: 4, max: 8 },
      { kind: "exponential", mean: 5 },
      { kind: "normal", mean: 20, sd: 3 },
    ];
    for (const d of dists) {
      let sum = 0;
      const N = 20000;
      for (let i = 0; i < N; i++) sum += sample(d, rng);
      const m = sum / N;
      expect(m).toBeGreaterThan(meanOf(d) * 0.92);
      expect(m).toBeLessThan(meanOf(d) * 1.08);
    }
  });
});

describe("ISO-8601 durations", () => {
  it("parses common BPSim example values", () => {
    expect(isoToSeconds("PT24M")).toBe(1440);
    expect(isoToSeconds("PT60H")).toBe(216000);
    expect(isoToSeconds("PT0M")).toBe(0);
    expect(isoToSeconds("P1DT2H30M")).toBe(86400 + 7200 + 1800);
  });
  it("round-trips seconds → ISO → seconds", () => {
    for (const s of [0, 1440, 216000, 93600, 90]) {
      expect(isoToSeconds(secondsToIso(s))).toBe(s);
    }
  });
  it("converts to/from a base unit", () => {
    expect(isoToUnit("PT24M", "minute")).toBe(24);
    expect(isoToUnit("PT60H", "hour")).toBe(60);
    expect(unitToIso(24, "minute")).toBe("PT24M");
  });
  it("rejects malformed input", () => {
    expect(() => isoToSeconds("24m")).toThrow();
    expect(() => isoToSeconds("P")).toThrow();
  });
});

describe("event calendar", () => {
  it("pops in time order, FIFO on ties", () => {
    const cal = new EventCalendar<string>();
    cal.schedule(5, "b");
    cal.schedule(1, "a");
    cal.schedule(5, "c"); // same time as b, scheduled later → after b
    cal.schedule(3, "x");
    const out: string[] = [];
    for (let e = cal.pop(); e; e = cal.pop()) out.push(e.payload);
    expect(out).toEqual(["a", "x", "b", "c"]);
  });

  it("serialises + restores preserving order (SimState snapshot)", () => {
    const cal = new EventCalendar<number>();
    [9, 2, 7, 2, 4].forEach((t, i) => cal.schedule(t, i));
    const restored = EventCalendar.fromJSON(cal.toJSON());
    const a: number[] = []; for (let e = cal.pop(); e; e = cal.pop()) a.push(e.time);
    const b: number[] = []; for (let e = restored.pop(); e; e = restored.pop()) b.push(e.time);
    expect(b).toEqual(a);
    expect(a).toEqual([2, 2, 4, 7, 9]);
  });
});

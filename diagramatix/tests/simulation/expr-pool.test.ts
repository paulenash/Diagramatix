/**
 * Expression evaluator (BPSim PropertyParameters/Condition) + resource pool
 * (seize/release/queue contention, the source of wait time).
 */
import { describe, it, expect } from "vitest";
import { compileExpr } from "@/app/lib/simulation/expr";
import { ResourcePool } from "@/app/lib/simulation/resourcePool";

describe("expr — BPSim conditions & property assignments", () => {
  const ctx = (noOfIssues: number) => ({ props: { noOfIssues } });

  it("evaluates the actual Car Repair expressions", () => {
    expect(compileExpr("getProperty('noOfIssues') - 1").evalNumber(ctx(3))).toBe(2);
    expect(compileExpr("getProperty('noOfIssues') + 1").evalNumber(ctx(3))).toBe(4);
    expect(compileExpr("getProperty('noOfIssues') > 0").evalBool(ctx(3))).toBe(true);
    expect(compileExpr("getProperty('noOfIssues') > 0").evalBool(ctx(0))).toBe(false);
    // BPSim uses `=` for equality
    expect(compileExpr("getProperty('noOfIssues') = 0").evalBool(ctx(0))).toBe(true);
    expect(compileExpr("getProperty('noOfIssues') = 0").evalBool(ctx(2))).toBe(false);
  });

  it("respects arithmetic precedence + parentheses", () => {
    expect(compileExpr("2 + 3 * 4").evalNumber({ props: {} })).toBe(14);
    expect(compileExpr("(2 + 3) * 4").evalNumber({ props: {} })).toBe(20);
    expect(compileExpr("10 - 2 - 3").evalNumber({ props: {} })).toBe(5);
  });

  it("handles booleans, comparisons and string concat", () => {
    expect(compileExpr("true and false").evalBool({ props: {} })).toBe(false);
    expect(compileExpr("not (1 > 2)").evalBool({ props: {} })).toBe(true);
    expect(compileExpr("1 < 2 or 5 > 9").evalBool({ props: {} })).toBe(true);
    expect(compileExpr("'a' + 'b'").eval({ props: {} })).toBe("ab");
    expect(compileExpr("max(2, 7, 3)").evalNumber({ props: {} })).toBe(7);
  });

  it("is safe — no host access, errors on unknowns", () => {
    expect(() => compileExpr("foo(1)").eval({ props: {} })).toThrow(); // unknown function
    expect(() => compileExpr("process").eval({ props: {} })).toThrow(); // no globals
    expect(() => compileExpr("getProperty('missing')").eval({ props: {} })).toThrow();
    expect(() => compileExpr("'unterminated").eval({ props: {} })).toThrow();
  });
});

describe("resource pool — contention", () => {
  it("grants up to capacity, queues the rest, FIFO on release", () => {
    const pool = new ResourcePool<string>(1, 0);
    expect(pool.request(0, 1, "a")).toBe(true);   // granted
    expect(pool.request(0, 1, "b")).toBe(false);  // queued
    expect(pool.request(0, 1, "c")).toBe(false);  // queued
    expect(pool.queueLength).toBe(2);
    expect(pool.release(5, 1)).toEqual(["b"]);    // b dequeued
    expect(pool.release(8, 1)).toEqual(["c"]);    // c dequeued
    expect(pool.stats(8).maxQueue).toBe(2);
  });

  it("computes time-weighted utilisation", () => {
    const pool = new ResourcePool<string>(1, 0);
    pool.request(0, 1, "a");      // busy 0..10
    pool.release(10, 1);          // idle 10..20
    const s = pool.stats(20);
    expect(s.utilization).toBeCloseTo(0.5, 6);
    expect(s.avgQueue).toBeCloseTo(0, 6);
  });

  it("setCapacity is the live Operator lever — grants queued work", () => {
    const pool = new ResourcePool<string>(1, 0);
    pool.request(0, 1, "a");
    pool.request(0, 1, "b");                       // queued
    expect(pool.setCapacity(3, 2)).toEqual(["b"]); // +1 capacity releases b
    expect(pool.busy).toBe(2);
  });

  it("serialises + restores identically (SimState snapshot)", () => {
    const pool = new ResourcePool<string>(2, 0);
    pool.request(0, 1, "a");
    pool.request(1, 2, "b"); // queued (only 1 free)
    const restored = ResourcePool.fromJSON(pool.toJSON());
    // Both grant 'b' once a unit frees at the same time.
    expect(restored.release(5, 1)).toEqual(pool.release(5, 1));
    expect(restored.busy).toBe(pool.busy);
  });
});

/**
 * A business case must not be made out of a side that never ran.
 *
 * Paul, 2026-09-12, was shown this, verbatim:
 *
 *   "Moving to HR Operations at 14 removes 1,437.76 hours per case — the entire
 *    as-is workload of 1,437.76 hours, a 100% reduction — which at 1,200 cases a
 *    year comes to roughly 1.73 million hours saved annually against a one-off
 *    implementation cost of 50, so payback is effectively immediate (0 months)"
 *
 * Three separate faults in one paragraph:
 *
 *  1. The to-be scenario completed NOTHING. Every per-case figure divides by the
 *     case count, so it reported zero across the board — and zero against a real
 *     baseline is a 100% saving. The arithmetic was impeccable; the premise was
 *     absent.
 *  2. 1,437.76 was POUNDS, reported as HOURS. Money and hours sat side by side in
 *     the facts and only some field names said which was which.
 *  3. It stopped mid-sentence ("...while 40.16") — a 700-token budget, and
 *     nothing checking whether the reply had finished.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildBusinessCaseFacts, summariseBusinessCase } from "@/app/lib/simulation/facts/businessCase";
import type { RunMetrics } from "@/app/lib/simulation/results";

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "app/lib/simulation/facts/businessCase.ts"), "utf8");

/** A run with real figures. */
const real = (): RunMetrics => ({
  clockUnit: "hour",
  stats: {
    completed: { mean: 592 },
    costPerCase: { mean: 1437.76 },
    queueWait: { mean: 59676 },
    processWait: { mean: 23764 },
  },
} as unknown as RunMetrics);

/** A scenario that was never run: nothing completed, so everything divides to nought. */
const empty = (): RunMetrics => ({
  clockUnit: "hour",
  stats: {
    completed: { mean: 0 },
    costPerCase: { mean: 0 },
    queueWait: { mean: 0 },
    processWait: { mean: 0 },
  },
} as unknown as RunMetrics);

const INPUTS = { implementationCost: 50, annualVolume: 1200 };

describe("a business case refuses an absent premise", () => {
  it("T4299 — a side that completed nothing is FLAGGED, not treated as free", () => {
    const f = buildBusinessCaseFacts(real(), empty(), "As-is", "HR Operations at 14", "Study", INPUTS);
    expect(f.tobe.noResults).toBe(true);
    expect(f.base.noResults).toBe(false);
    expect(f.missing.join(" ")).toContain("completed no cases");
  });

  it("T4300 — no saving, no percentage, no payback are computed from it", () => {
    // Each of these was reported before, and each was arithmetic on nothing.
    // "100% reduction, payback immediate" is the most inviting wrong answer this
    // screen can give.
    const f = buildBusinessCaseFacts(real(), empty(), "As-is", "HR Operations at 14", "Study", INPUTS);
    expect(f.perCaseSaving).toBe(0);
    expect(f.perCasePct).toBe(0);
    expect(f.annualSaving).toBeUndefined();
    expect(f.paybackMonths).toBeUndefined();
  });

  it("T4301 — the written case LEADS with the blocker, before any figure", () => {
    // A reader who meets the numbers first has formed a view by the time the
    // caveat arrives.
    const f = buildBusinessCaseFacts(real(), empty(), "As-is", "HR Operations at 14", "Study", INPUTS);
    const text = summariseBusinessCase(f);
    expect(text).toContain("NO CASE CAN BE MADE YET");
    expect(text.indexOf("NO CASE CAN BE MADE YET")).toBeLessThan(text.indexOf("cost of doing"));
    expect(text, "no saving line at all").not.toMatch(/^Saving:/m);
  });

  it("T4302 — a normal comparison is untouched", () => {
    // The guard must not cost anything when both sides ran. A refusal that fires
    // on healthy data would be worse than the bug.
    const cheaper = (): RunMetrics => ({
      clockUnit: "hour",
      stats: { completed: { mean: 600 }, costPerCase: { mean: 1200 }, queueWait: { mean: 40000 }, processWait: { mean: 23000 } },
    } as unknown as RunMetrics);

    const f = buildBusinessCaseFacts(real(), cheaper(), "As-is", "To-be", "Study", INPUTS);
    expect(f.base.noResults).toBe(false);
    expect(f.tobe.noResults).toBe(false);
    expect(f.perCaseSaving).toBeCloseTo(237.76, 2);
    expect(f.annualSaving).toBe(285312);
    expect(f.paybackMonths).toBeDefined();
    expect(summariseBusinessCase(f)).not.toContain("NO CASE CAN BE MADE YET");
  });

  it("T4303 — the prompt states which fields are MONEY and which are hours", () => {
    // The model called £1,437.76 "1,437.76 hours". Money and hours sit side by
    // side in the facts, and only some names carry the unit.
    expect(SRC).toContain("UNITS ARE IN THE FIELD NAMES AND MUST BE OBEYED");
    expect(SRC).toMatch(/Only "queueHoursPerCase" and\s*\n?\s*"processHoursPerCase" are hours/);
    // ...and the no-results rule reaches the model too, not just the facts.
    expect(SRC).toContain("there is no case to make");
  });

  it("T4304 — the case has room to finish, and says so when it does not", () => {
    const m = SRC.match(/const CASE_MAX_TOKENS = (\d+)/);
    expect(m, "the budget must be a named constant").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1000);
    expect(SRC, "the old literal budget is gone").not.toContain("max_tokens: 700");
    expect(SRC).toContain('message.stop_reason === "max_tokens"');

    const route = fs.readFileSync(path.join(ROOT, "app/api/projects/[id]/simulation/studies/[studyId]/business-case/route.ts"), "utf8");
    expect(route).toContain("truncated: result.truncated ?? false");
    const panel = fs.readFileSync(path.join(ROOT, "app/components/simulation/results/BusinessCasePanel.tsx"), "utf8");
    expect(panel).toMatch(/cut off before it finished/i);
  });
});

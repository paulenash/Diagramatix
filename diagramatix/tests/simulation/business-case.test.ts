/**
 * The business case — money and a date, from two runs.
 *
 * The cases that matter are the honest ones: a missing input must never be
 * treated as zero, a change that does not pay back must say so instead of
 * producing a flattering month, and the two kinds of waiting must stay apart,
 * because queueing is answered by capacity and process waiting is not.
 */
import { describe, it, expect } from "vitest";
import {
  buildBusinessCaseFacts, sideCosts, summariseBusinessCase,
  type BusinessCaseInputs,
} from "@/app/lib/simulation/facts/businessCase";
import { buildBusinessCaseChapters, buildBusinessCaseSheets } from "@/app/lib/simulation/businessCaseDoc";
import type { RunMetrics } from "@/app/lib/simulation/results";

const stat = (mean: number) => ({ mean, p5: mean, p50: mean, p95: mean });

/** clockUnit is "hour" so the waiting totals convert 1:1 to hours. */
function metrics(opts: { costPerCase: number; completed: number; queue?: number; process?: number }): RunMetrics {
  return {
    stats: {
      replications: 5,
      arrived: stat(opts.completed), completed: stat(opts.completed),
      flowTime: stat(10), totalCost: stat(opts.costPerCase * opts.completed),
      costPerCase: stat(opts.costPerCase),
      caseFlow: { count: opts.completed, mean: 10, sd: 1, min: 5, p50: 10, p90: 15, p95: 16, max: 20, histogram: { min: 0, binWidth: 1, counts: [] } },
      ...(opts.queue !== undefined ? { queueWait: stat(opts.queue) } : {}),
      ...(opts.process !== undefined ? { processWait: stat(opts.process) } : {}),
      perNode: {}, perTeam: {},
    },
    bottlenecks: [], nodeLabels: {}, clockUnit: "hour", teamCapacities: {},
  };
}

const build = (base: RunMetrics, tobe: RunMetrics, inputs: BusinessCaseInputs = {}) =>
  buildBusinessCaseFacts(base, tobe, "As-is", "To-be", "Claims", inputs);

describe("business case — the three cost lines", () => {
  it("T3403 - waiting is reported in HOURS when no delay rate is supplied, and not priced", () => {
    const s = sideCosts("As-is", metrics({ costPerCase: 40, completed: 100, queue: 300, process: 900 }), {});
    expect(s.doingPerCase).toBe(40);
    expect(s.queueHoursPerCase).toBe(3);      // 300 hours / 100 cases
    expect(s.processHoursPerCase).toBe(9);
    expect(s.queueCostPerCase).toBeUndefined();
    expect(s.processCostPerCase).toBeUndefined();
    expect(s.totalPerCase).toBe(40);          // unpriced waiting adds no money
  });

  it("T3404 - a delay rate prices the two waits separately, on top of the cost of doing", () => {
    const s = sideCosts("As-is", metrics({ costPerCase: 40, completed: 100, queue: 300, process: 900 }), { costOfDelayPerHour: 2 });
    expect(s.queueCostPerCase).toBe(6);       // 3 h x $2
    expect(s.processCostPerCase).toBe(18);    // 9 h x $2
    expect(s.totalPerCase).toBe(64);          // 40 + 6 + 18
  });

  it("T3405 - a run predating the wait measurement is UNMEASURED, not zero-waiting", () => {
    const s = sideCosts("Old run", metrics({ costPerCase: 40, completed: 100 }), { costOfDelayPerHour: 2 });
    expect(s.waitingUnmeasured).toBe(true);
    expect(s.queueCostPerCase).toBeUndefined();
    const f = build(metrics({ costPerCase: 40, completed: 100 }), metrics({ costPerCase: 30, completed: 100 }));
    expect(f.missing.join(" ")).toMatch(/not recorded on one or both runs/i);
  });
});

describe("business case — what it is worth", () => {
  const base = metrics({ costPerCase: 100, completed: 200, queue: 400, process: 200 });
  const tobe = metrics({ costPerCase: 60, completed: 200, queue: 100, process: 200 });

  it("T3406 - saving per case, annual saving and payback follow from the inputs", () => {
    const f = build(base, tobe, { annualVolume: 1000, implementationCost: 20000 });
    expect(f.perCaseSaving).toBe(40);
    expect(f.perCasePct).toBe(40);
    expect(f.annualSaving).toBe(40000);
    expect(f.paybackMonths).toBe(6);          // 20000 / (40000/12)
  });

  it("T3407 - a missing input removes the figure it feeds and is NAMED, never assumed", () => {
    const f = build(base, tobe, { implementationCost: 20000 });
    expect(f.annualSaving).toBeUndefined();
    expect(f.paybackMonths).toBeUndefined();
    expect(f.missing.join(" ")).toMatch(/Annual case volume/i);
  });

  it("T3408 - a change that costs more says so, and produces no payback month", () => {
    const worse = metrics({ costPerCase: 150, completed: 200, queue: 400, process: 200 });
    const f = build(base, worse, { annualVolume: 1000, implementationCost: 20000 });
    expect(f.perCaseSaving).toBeLessThan(0);
    expect(f.paybackMonths).toBeUndefined();
    expect(f.paybackNote).toMatch(/does not save money/i);
  });

  it("T3409 - the ramp-up caveat is stated whenever a payback month is", () => {
    const f = build(base, tobe, { annualVolume: 1000, implementationCost: 20000 });
    expect(f.assumptions.join(" ")).toMatch(/accrues evenly from day one/i);
  });

  it("T3410 - the delay rate is described as business cost only, never staff cost", () => {
    const f = build(base, tobe, { annualVolume: 1000, implementationCost: 1 });
    expect(f.missing.join(" ")).toMatch(/never staff cost/i);
  });
});

describe("business case — the document says what the screen says", () => {
  const base = metrics({ costPerCase: 100, completed: 200, queue: 400, process: 200 });
  const tobe = metrics({ costPerCase: 60, completed: 200, queue: 100, process: 200 });

  it("T3411 - the Word chapters carry the split, the worth and the assumptions", () => {
    const f = build(base, tobe, { annualVolume: 1000, implementationCost: 20000, costOfDelayPerHour: 3 });
    const md = buildBusinessCaseChapters(f, summariseBusinessCase(f))[0].sections[0].bodyMarkdown;
    expect(md).toContain("Cost of doing the work");
    expect(md).toContain("Queueing for a person");
    expect(md).toContain("Waiting on the process");
    expect(md).toContain("Pays back in");
    expect(md).toContain("Assumptions");
  });

  it("T3412 - the spreadsheet omits the waiting rows entirely when they were never measured", () => {
    const f = build(metrics({ costPerCase: 100, completed: 200 }), metrics({ costPerCase: 60, completed: 200 }), {});
    const rows = buildBusinessCaseSheets(f).find((s) => s.name === "Cost per case")!.rows;
    const firstCol = rows.map((r) => String(r[0] ?? ""));
    expect(firstCol.some((c) => c.startsWith("Queueing"))).toBe(false);
    expect(firstCol).toContain("Total per case");
  });

  it("T3413 - the deterministic summary states the saving and every assumption", () => {
    const f = build(base, tobe, { annualVolume: 1000, implementationCost: 20000 });
    const text = summariseBusinessCase(f);
    expect(text).toContain("Saving: $40 per case");
    expect(text).toContain("Pays back in 6 months");
    expect(text).toContain("Assumptions");
    expect(text).toContain("deterministically");
  });
});

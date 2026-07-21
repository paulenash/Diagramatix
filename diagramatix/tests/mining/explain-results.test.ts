/**
 * The AI "Explain results" prompt is built from the run's data (stats, paths,
 * conformance, timing, artefacts). Only that assembly is pure/unit-testable (the
 * model call needs a live key). This pins that the model is fed the real numbers.
 */
import { describe, it, expect } from "vitest";
import { buildExplainPrompt, summariseMiningResults, type ExplainInput } from "@/app/lib/mining/explainResults";

const INPUT: ExplainInput = {
  apiKey: "x", model: "m", runName: "AP Jan",
  stats: { cases: 200, events: 987, activities: ["Approve", "Begin"], states: ["Draft", "Approved"], variants: 10, from: 1_700_000_000_000, to: 1_700_000_000_000 + 30 * 86_400_000, unmappedRows: 5 },
  variants: [
    { states: ["Draft", "Approved"], events: ["Create", "Approve"], count: 105 },
    { states: ["Draft", "Rejected"], events: ["Create", "Reject"], count: 20 },
  ],
  conformance: {
    fitness: 0.905, totalCases: 200, conformingCases: 181,
    violations: [{ rule: "undocumented-transition", severity: "error", message: "Undocumented transition: On Hold → In Progress", cases: 39 }],
    transitionStats: [],
  },
  performance: { clockUnit: "hour", activityDurations: { Create: [2, 4] }, interArrival: [10, 12], activityResource: {}, resourceConcurrency: { alice: 2 }, activeHours: new Array(168).fill(0) },
  hasBpmn: true, hasStateMachine: true, hasTwin: true, referenceName: "AP Reference",
};

describe("explain-results prompt", () => {
  it("T0624 — the brief carries stats, top paths, conformance + artefacts", () => {
    const p = buildExplainPrompt(INPUT);
    expect(p).toContain("200 cases");
    expect(p).toContain("30 days");
    expect(p).toContain("x105: Create → Approve");                 // top path by frequency
    expect(p).toContain("discovered BPMN process");
    expect(p).toContain("calibrated simulation digital twin");
    expect(p).toContain("fitness 90.5%");
    expect(p).toContain("181 of 200");
    expect(p).toContain("On Hold → In Progress");                  // the deviation
    expect(p).toContain('"AP Reference"');                          // the reference name
    expect(p).toContain("5 rows were dropped");
  });
});

describe("summariseMiningResults — deterministic fallback (AI off)", () => {
  it("T0934 — templates paths, conformance + timing from the same facts, no AI", () => {
    const s = summariseMiningResults(INPUT);
    expect(s).toContain("200 cases");
    expect(s).toContain("30 days");
    expect(s).toContain("Create → Approve");                        // top path
    expect(s).toContain("53% of cases");                            // 105 of 200 cases
    expect(s).toContain("90.5% fit");                               // conformance
    expect(s).toContain("181 of 200");
    expect(s).toContain("On Hold → In Progress");                   // top deviation
    expect(s).toContain("BPMN process");                            // artefacts
    expect(s).toContain("deterministically");                       // the "no AI" footer
  });

  it("T0935 — degrades gracefully with no conformance / performance", () => {
    const s = summariseMiningResults({ ...INPUT, conformance: null, performance: null });
    expect(s).toContain("200 cases");
    expect(s).not.toContain("fit");                                 // no conformance line
    expect(s).not.toContain("Slowest step");                        // no timing line
  });
});

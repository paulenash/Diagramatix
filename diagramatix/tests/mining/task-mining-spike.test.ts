/**
 * Task Mining — Phase 0 spike. Proves the central thesis: a UI-interaction (task)
 * log runs through the EXISTING DiagramatixMINER pipeline unchanged and yields a
 * task ROUTINE MAP with a branch + rework loop, plus task-specific insights
 * (ping-pong, rework, automation signal). No new discovery engine.
 */
import { describe, it, expect } from "vitest";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import { discoverProcess, edgeKey } from "@/app/lib/mining/discoverProcess";
import { computePerformance } from "@/app/lib/mining/performance";
import { toEventLog, taskStepLabel, TASK_LOG_MAPPING } from "@/app/lib/mining/taskMining/schema";
import { INVOICE_PROCESSING_TASK_LOG } from "@/app/lib/mining/taskMining/sampleInvoiceProcessing";
import { detectPingPong, detectReworkActivities, automationSignal, isTaskRun, pingPongFromVariants } from "@/app/lib/mining/taskMining/insights";
import { automationOpportunities, taskAutomationScore, buildAutomationSpec, automationRoi } from "@/app/lib/mining/taskMining/automation";
import { buildTaskProcedure } from "@/app/lib/mining/taskMining/procedure";
import { buildTaskMiningExample } from "@/app/lib/mining/taskMining/example";
import { validateMiningExamplePackage } from "@/app/lib/mining/examplePackage";
import { summariseMiningResults } from "@/app/lib/mining/explainResults";

describe("Task Mining Phase 0 spike (Invoice Processing / Enter Invoice)", () => {
  const { headers, rows, mapping } = toEventLog(INVOICE_PROCESSING_TASK_LOG);
  const log = buildEventLog(headers, rows, mapping);

  it("T2267 — the task-log schema projects onto the miner's {headers, rows, mapping}", () => {
    expect(mapping).toEqual(TASK_LOG_MAPPING);
    expect(headers).toEqual(["taskCaseId", "activity", "timestamp", "actor", "object"]);
    expect(rows.length).toBe(INVOICE_PROCESSING_TASK_LOG.length);
    // Composed, app-scoped step labels (and no "Submit Submit" duplication).
    expect(taskStepLabel({ taskCaseId: "x", seq: 0, timestamp: "", actor: "a", application: "Excel", control: "Amount", actionType: "copy" })).toBe("Excel: Copy Amount");
    expect(taskStepLabel({ taskCaseId: "x", seq: 0, timestamp: "", actor: "a", application: "Chrome", actionType: "switchApp" })).toBe("Switch to Chrome");
    expect(taskStepLabel({ taskCaseId: "x", seq: 0, timestamp: "", actor: "a", application: "Chrome", control: "Submit", actionType: "submit" })).toBe("Chrome: Submit");
  });

  it("T2268 — the existing buildEventLog compresses the task log into cases + variants", () => {
    expect(log.stats.cases).toBe(100);
    expect(log.stats.variants).toBe(2); // happy path vs rework
    expect(log.stats.activities).toEqual(expect.arrayContaining([
      "Open Excel", "Excel: Copy Vendor", "Switch to Chrome", "Chrome: Paste Vendor",
      "Excel: Copy Amount", "Chrome: Paste Amount", "Chrome: Validate", "Chrome: Submit",
    ]));
  });

  it("T2269 — discoverProcess renders a routine map with a branch + a rework back-edge", () => {
    const { plan, dfg, keptActivities } = discoverProcess(log.variants);
    // UI steps became task nodes.
    expect(keptActivities).toEqual(expect.arrayContaining(["Excel: Copy Amount", "Chrome: Validate", "Chrome: Submit"]));
    expect(plan.elements.some((e) => e.type === "task" && e.label === "Chrome: Validate")).toBe(true);
    // Validate branches (happy → Submit, rework → back to Excel) ⇒ a gateway.
    expect(plan.elements.some((e) => e.type === "gateway")).toBe(true);
    // The rework loop: Validate is directly followed BOTH by Submit and by a bounce
    // back to Excel to re-copy the Amount.
    expect(dfg.edges.has(edgeKey("Chrome: Validate", "Chrome: Submit"))).toBe(true);
    expect(dfg.edges.has(edgeKey("Chrome: Validate", "Switch to Excel"))).toBe(true);
  });

  it("T2270 — computePerformance mines step durations (calibration-ready)", () => {
    const perf = computePerformance(log.traces);
    expect(perf.clockUnit).toBeTruthy();
    expect((perf.activityDurations["Excel: Copy Amount"] ?? []).length).toBeGreaterThan(0);
    expect((perf.activityDurations["Chrome: Paste Amount"] ?? []).length).toBeGreaterThan(0);
  });

  it("T2271 — task-specific insights: ping-pong, rework, automation signal", () => {
    const pp = detectPingPong(INVOICE_PROCESSING_TASK_LOG);
    expect(Object.keys(pp.byCase).length).toBe(100); // every case bounces Excel↔Chrome
    expect(pp.total).toBeGreaterThanOrEqual(200);

    const rework = detectReworkActivities(log.variants);
    expect(rework.map((r) => r.activity)).toEqual(expect.arrayContaining(["Excel: Copy Amount", "Chrome: Paste Amount"]));
    expect(rework[0].cases).toBe(30); // the 30 rework cases

    const sig = automationSignal(INVOICE_PROCESSING_TASK_LOG, log.variants);
    expect(sig.copyPasteRate).toBeGreaterThan(0);
    expect(sig.appSwitchRate).toBeGreaterThan(0);
    expect(sig.score).toBeGreaterThan(0.35);
    expect(["medium", "high"]).toContain(sig.verdict);
  });
});

describe("Task Mining Phase 1 — Automation Opportunities + flagship example", () => {
  const { headers, rows, mapping } = toEventLog(INVOICE_PROCESSING_TASK_LOG);
  const log = buildEventLog(headers, rows, mapping);

  it("T2272 — automationOpportunities ranks the dominant routine first, from variants alone", () => {
    const opps = automationOpportunities(log.variants);
    expect(opps.length).toBe(2);
    // Most-followed routine first (the 70 happy-path cases).
    expect(opps[0].cases).toBe(70);
    expect(opps[0].copyPasteSteps).toBeGreaterThan(0);
    expect(opps[0].appSwitches).toBeGreaterThan(0);
    expect(opps[0].steps).toContain("Chrome: Submit");
    const score = taskAutomationScore(log.variants);
    expect(score.score).toBeGreaterThan(0.35);
    expect(["medium", "high"]).toContain(score.verdict);
  });

  it("T2273 — buildAutomationSpec emits a Markdown RPA recipe of the steps", () => {
    const spec = buildAutomationSpec(log.variants, "Enter Invoice");
    expect(spec).toContain("# Automation opportunity — Enter Invoice");
    expect(spec).toContain("Steps to automate");
    expect(spec).toMatch(/1\.\s+Open Excel/);
    expect(spec).toContain("Chrome: Submit");
  });

  it("T2274 — the flagship task example package is valid + adoptable (sample log + variants)", () => {
    const ex = buildTaskMiningExample();
    expect(ex.slug).toBe("task-mining-enter-invoice");
    expect(validateMiningExamplePackage(ex.package)).toEqual([]); // no validation problems
    expect(ex.package.run.variants.length).toBe(2);
    expect(ex.package.sampleLog?.rows.length).toBe(INVOICE_PROCESSING_TASK_LOG.length);
    expect(ex.package.diagrams).toEqual([]); // task routine is discovered live on adopt
  });

  it("T2275 — isTaskRun detects the task log by its UI-step vocabulary (and rejects a process log)", () => {
    expect(isTaskRun(log.variants)).toBe(true);
    // A business-milestone process log has no app switches / copy-paste steps.
    const processVariants = [{ states: [], events: ["Receive Invoice", "Approve Invoice", "Pay Invoice"], count: 5 }];
    expect(isTaskRun(processVariants)).toBe(false);
  });

  it("T2276 — pingPongFromVariants matches the interaction-based ping-pong count", () => {
    expect(pingPongFromVariants(log.variants)).toBe(detectPingPong(INVOICE_PROCESSING_TASK_LOG).total);
  });

  it("T2277 — automationRoi estimates savings from the automatable routines", () => {
    const roi = automationRoi(log.variants);
    expect(roi.cases).toBe(100);
    expect(roi.currentHours).toBeGreaterThan(0);
    expect(roi.savedHours).toBeGreaterThan(0);
    expect(roi.savedPct).toBeGreaterThan(0);
    expect(roi.savedPct).toBeLessThanOrEqual(1);
    expect(roi.automatableCases).toBeGreaterThan(0);
  });

  it("T2278 — buildTaskProcedure emits an as-actually-done SOP with steps, apps and rework", () => {
    const sop = buildTaskProcedure(log.variants, "Enter Invoice");
    expect(sop).toContain("# Standard Operating Procedure — Enter Invoice");
    expect(sop).toContain("## Applications used");
    expect(sop).toMatch(/- Excel/);
    expect(sop).toMatch(/- Chrome/);
    expect(sop).toMatch(/1\.\s+/); // a numbered step
    expect(sop).toContain("Exceptions / rework observed");
    expect(sop).toContain("Automation note");
  });

  it("T2279 — the deterministic Explain is task-framed when isTask (automation callout)", () => {
    const summary = summariseMiningResults({
      runName: "Enter Invoice", stats: log.stats, variants: log.variants,
      conformance: null, performance: null, hasBpmn: false, hasStateMachine: false, hasTwin: false,
      isTask: true,
    });
    expect(summary).toContain("Task automation:");
    expect(summary).toContain("Automation signal:");
    expect(summary).toContain("ping-pong bounces:");
  });
});

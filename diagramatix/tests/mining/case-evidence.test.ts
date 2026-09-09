/**
 * Phase 6 — from a conformance metric to the cases behind it.
 *
 * The tests that matter here are the ones about what the list is ALLOWED to
 * claim. A silently short list of offending cases is indistinguishable from a
 * correct one, and it is the single fastest way to stop an auditor trusting the
 * tool: they check five cases, find a sixth the tool never mentioned, and
 * nothing it says afterwards counts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { evidenceFor, caseTimeline, casesCsv } from "@/app/lib/mining/caseEvidence";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { filterAnalytics } from "@/app/lib/mining/filterAnalytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { LogMapping } from "@/app/lib/mining/types";

const HOUR = 3_600_000, DAY = 86_400_000;
const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", state: "st", resource: "who", attributeMode: { region: "keep" } };
const HEADERS = ["case", "act", "ts", "st", "who", "region"];

/**
 * Ten cases. Seven follow the reference (Receive → Check → Close). Three skip
 * the credit check entirely — the violation this phase is named after.
 */
function run() {
  const rows: string[][] = [];
  const at = (d: number, h: number) => new Date(Date.parse("2026-07-01T00:00:00Z") + d * DAY + h * HOUR).toISOString();
  for (let i = 0; i < 7; i++) {
    rows.push([`ok${i}`, "Receive", at(i, 0), "New", "Ops", "North"]);
    rows.push([`ok${i}`, "Check", at(i, 1), "Checked", "Finance", "North"]);
    rows.push([`ok${i}`, "Close", at(i, 3), "Done", "Ops", "North"]);
  }
  for (let i = 0; i < 3; i++) {
    rows.push([`skip${i}`, "Receive", at(7 + i, 0), "New", "Ops", "South"]);
    rows.push([`skip${i}`, "Close", at(7 + i, 2), "Done", "Ops", "South"]);   // New → Done
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { analytics: computeAnalytics(log), variants: log.variants };
}

/** A reference that requires the check: New → Checked → Done. */
const REFERENCE: ReferenceSm = {
  elements: [
    { id: "i", type: "initial-state" },
    { id: "s1", type: "state", label: "New" },
    { id: "s2", type: "state", label: "Checked" },
    { id: "s3", type: "state", label: "Done" },
    { id: "f", type: "final-state" },
  ],
  connectors: [
    { id: "t0", sourceId: "i", targetId: "s1", type: "transition" },
    { id: "t1", sourceId: "s1", targetId: "s2", type: "transition" },
    { id: "t2", sourceId: "s2", targetId: "s3", type: "transition" },
    { id: "t3", sourceId: "s3", targetId: "f", type: "transition" },
  ],
};

const skipViolation = (variants: ReturnType<typeof run>["variants"]) =>
  checkTransitionConformance(variants, REFERENCE).violations
    .find((v) => v.rule === "undocumented-transition" && v.message.includes("New → Done"))!;

describe("Phase 6 — a violation knows which variants did it", () => {
  it("T3822 - the undocumented transition records the variants that exhibit it", () => {
    const { variants } = run();
    const v = skipViolation(variants);
    expect(v.cases).toBe(3);
    expect(v.variantIdxs).toBeTruthy();
    // Exactly the two-step variant, and only it.
    expect(v.variantIdxs!.every((i) => variants[i].events.length === 2)).toBe(true);
  });

  it("T3823 - a transition nobody took records an EMPTY list, not an absent one", () => {
    // "No variant did this" is a fact. "We did not record which" is not, and the
    // two must not be represented the same way.
    const { variants } = run();
    const dead = checkTransitionConformance(variants, REFERENCE).violations.find((v) => v.rule === "dead-transition");
    if (dead) { expect(dead.variantIdxs).toEqual([]); expect(dead.cases).toBe(0); }
  });
});

describe("Phase 6 — here they are", () => {
  it("T3824 - the offending cases are named", () => {
    const { analytics, variants } = run();
    const e = evidenceFor(skipViolation(variants), analytics);
    expect(e.cases.map((c) => c.caseId).sort()).toEqual(["skip0", "skip1", "skip2"]);
    expect(e.claimed).toBe(3);
    expect(e.identifiable).toBe(3);
    expect(e.partial).toBe(false);
    expect(e.statement).toBe("3 cases, all listed.");
  });

  it("T3825 - conforming cases are not swept in", () => {
    const { analytics, variants } = run();
    expect(evidenceFor(skipViolation(variants), analytics).cases.some((c) => c.caseId.startsWith("ok"))).toBe(false);
  });
});

describe("Phase 6 — the floor: never a silently short list", () => {
  it("T3826 - a strided run says how many of the claimed cases it can actually name", () => {
    // THE test of this phase. Fourteen cases, nine identifiable — said out loud,
    // in the same sentence as the claim, or the list reads as complete.
    const { analytics, variants } = run();
    const strided: RunAnalytics = {
      ...analytics,
      capped: true,
      totalCases: 1000,
      cases: analytics.cases.filter((c) => c.caseId !== "skip2"),   // one not stored
    };
    const v = skipViolation(variants);
    const e = evidenceFor(v, strided);
    expect(e.claimed).toBe(3);
    expect(e.identifiable).toBe(2);
    expect(e.partial).toBe(true);
    expect(e.statement).toContain("3 cases · 2 identifiable in the stored sample");
    expect(e.statement).toContain("1,000");        // and why
  });

  it("T3827 - a run conformed before attribution existed reports UNKNOWN, not none", () => {
    // An empty list here would be a confident lie about a run that has simply
    // not been asked again — and the remedy is named.
    const { analytics, variants } = run();
    const old = { ...skipViolation(variants), variantIdxs: undefined };
    const e = evidenceFor(old, analytics);
    expect(e.unattributed).toBe(true);
    expect(e.cases).toEqual([]);
    expect(e.identifiable).toBe(0);
    expect(e.partial).toBe(false);                 // not a short list — an absent one
    expect(e.statement).toMatch(/was not recorded/);
    expect(e.statement).toMatch(/Re-check conformance/);
  });

  it("T3828 - nothing selected, or no analytics, is an honest empty rather than a throw", () => {
    const { analytics, variants } = run();
    expect(evidenceFor(null, analytics).cases).toEqual([]);
    expect(evidenceFor(skipViolation(variants), null).cases).toEqual([]);
  });
});

describe("Phase 6 — one case's story", () => {
  it("T3829 - the timeline is the case's path with its own timings", () => {
    const { analytics, variants } = run();
    const c = analytics.cases.find((x) => x.caseId === "ok0")!;
    const steps = caseTimeline(c, variants, analytics.resourceDict ?? []);
    expect(steps.map((s) => s.activity)).toEqual(["Receive", "Check", "Close"]);
    expect(steps.map((s) => s.state)).toEqual(["New", "Checked", "Done"]);
    expect(steps[0].durMs).toBe(HOUR);             // Receive → Check
    expect(steps[1].durMs).toBe(2 * HOUR);         // Check → Close
    expect(steps[0].resource).toBe("Ops");
    expect(steps[1].resource).toBe("Finance");
  });

  it("T3830 - the final step has NO duration, rather than a zero", () => {
    // A zero would draw a step that took no time, which is a different claim
    // from "there is nothing after it to measure against".
    const { analytics, variants } = run();
    const steps = caseTimeline(analytics.cases[0], variants, []);
    expect(steps[steps.length - 1].durMs).toBeNull();
  });

  it("T3831 - offsets accumulate, so the timeline can be drawn to scale", () => {
    const { analytics, variants } = run();
    const steps = caseTimeline(analytics.cases.find((c) => c.caseId === "ok0")!, variants, []);
    expect(steps.map((s) => s.offsetMs)).toEqual([0, HOUR, 3 * HOUR]);
  });

  it("T3832 - a run with no per-event durations still gives the PATH, with null timings", () => {
    // The sequence is the variant and always resolves; only the timings are
    // conditional. Null, not zero, so the caller can omit the bars.
    const { analytics, variants } = run();
    const bare = { ...analytics.cases[0], durs: undefined, res: undefined };
    const steps = caseTimeline(bare, variants, []);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.durMs === null && s.offsetMs === null && s.resource === null)).toBe(true);
  });

  it("T3833 - a case whose variant cannot be resolved yields no timeline, not a crash", () => {
    const { analytics, variants } = run();
    expect(caseTimeline({ ...analytics.cases[0], variantIdx: -1 }, variants, [])).toEqual([]);
    expect(caseTimeline(null, variants, [])).toEqual([]);
  });
});

describe("Phase 6 — the whole index, out", () => {
  it("T3834 - every stored case is a row, not the sixty the screen shows", () => {
    const { analytics, variants } = run();
    const lines = casesCsv(analytics, variants).trimEnd().split("\r\n");
    expect(lines).toHaveLength(analytics.cases.length + 1);
  });

  it("T3835 - kept columns become columns, so the export can be pivoted", () => {
    const { analytics, variants } = run();
    const lines = casesCsv(analytics, variants).split("\r\n");
    expect(lines[0]).toContain("region");
    expect(lines.slice(1).filter((l) => l.includes("North")).length).toBe(7);
  });

  it("T3836 - the path is exported, so a reader can see WHAT each case did", () => {
    const { analytics, variants } = run();
    expect(casesCsv(analytics, variants)).toContain("Receive → Check → Close");
  });

  it("T3837 - a value containing a comma or a quote does not break the file", () => {
    const { analytics, variants } = run();
    const nasty: RunAnalytics = {
      ...analytics,
      cases: [{ ...analytics.cases[0], caseId: 'ACME, Inc "Ltd"', attrs: { region: "a,b" } }],
    };
    const line = casesCsv(nasty, variants).split("\r\n")[1];
    expect(line).toContain('"ACME, Inc ""Ltd"""');
    expect(line).toContain('"a,b"');
  });
});

describe("Phase 6 — deviations under a filter", () => {
  it("T3838 - the claim is the SLICE's count when the variants are a slice's", () => {
    // The defect this prevents: a whole-run claim ("3 cases") beside a filtered
    // list ("1 identifiable"), which would trip the honest floor on a gap that
    // striding did not cause and re-checking would not fix.
    const { analytics, variants } = run();
    const v = skipViolation(variants);
    const sliced = filterAnalytics(analytics, variants, { attrs: { region: "South" }, to: Date.parse("2026-07-08T12:00:00Z") })!;
    const e = evidenceFor(v, sliced.analytics, sliced.variants);
    expect(e.identifiable).toBe(sliced.analytics.cases.length);
    expect(e.claimed).toBe(e.identifiable);          // agree, so no false warning
    expect(e.partial).toBe(false);
    expect(e.statement).toMatch(/all listed/);
  });

  it("T3839 - a slice containing NONE of the offenders reports zero, not the run's count", () => {
    const { analytics, variants } = run();
    const sliced = filterAnalytics(analytics, variants, { attrs: { region: "North" } })!;
    const e = evidenceFor(skipViolation(variants), sliced.analytics, sliced.variants);
    expect(e.claimed).toBe(0);
    expect(e.cases).toEqual([]);
    expect(e.statement).toMatch(/Never observed/);
  });

  it("T3840 - with no variants passed, the stored whole-run count still stands", () => {
    // The unfiltered call path, and the one every existing caller uses.
    const { analytics, variants } = run();
    expect(evidenceFor(skipViolation(variants), analytics).claimed).toBe(3);
  });
});

describe("Phase 6 — the recompute debt is settled", () => {
  it("T3841 - the recompute route now has a caller", () => {
    // Built in Phase 0.3 with no caller, and that debt named at the time rather
    // than left to accumulate — the `holdoutPct` pattern this programme has now
    // hit three times. Phase 6 is the consumer the plan predicted: an existing
    // run gains case attribution by replaying its OWN stored variants against
    // its OWN stored reference. No re-import.
    const panel = readFileSync("app/components/mining/insights/MiningInsightsPanel.tsx", "utf8");
    expect(panel).toContain("/recompute`");
    expect(readFileSync("app/api/projects/[id]/mining/runs/[runId]/recompute/route.ts", "utf8"))
      .toContain("checkTransitionConformance");
  });
});

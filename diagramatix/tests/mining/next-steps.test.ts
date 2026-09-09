/**
 * Phase 8 — what should I do about it?
 *
 * This is the phase that gives advice, so it is the phase that needs the most
 * restraint. Most of these tests are about what it must NOT say:
 *
 *  - it must be able to say "nothing stands out", because a tool that always
 *    produces a top recommendation eventually recommends noise, and the first
 *    time it does, nobody believes the next one;
 *  - it must say when a whole class of advice is unavailable rather than
 *    silently omitting it, or a reader takes silence for a clean bill;
 *  - it must never rank on anything a model chose.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { findActions, narrationFacts, longestBacklogRun } from "@/app/lib/mining/nextSteps";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { LogMapping } from "@/app/lib/mining/types";

const HOUR = 3_600_000, DAY = 86_400_000;
const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", state: "st", resource: "who" };
const HEADERS = ["case", "act", "ts", "st", "who"];

/** A process with an obvious problem: Approve holds almost all the time. */
function sick() {
  const rows: string[][] = [];
  const at = (d: number, h: number) => new Date(Date.parse("2026-09-01T00:00:00Z") + d * DAY + h * HOUR).toISOString();
  for (let i = 0; i < 10; i++) {
    rows.push([`c${i}`, "Receive", at(i, 0), "New", "Ops"]);
    rows.push([`c${i}`, "Approve", at(i, 1), "Approved", "Finance"]);    // 1h in Receive
    rows.push([`c${i}`, "Close", at(i, 49), "Done", "Ops"]);             // 48h in Approve
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { analytics: computeAnalytics(log), variants: log.variants };
}

/** A process where every step takes the same time — nothing to report. */
function healthy() {
  const rows: string[][] = [];
  const at = (d: number, h: number) => new Date(Date.parse("2026-09-01T00:00:00Z") + d * DAY + h * HOUR).toISOString();
  for (let i = 0; i < 10; i++) {
    rows.push([`c${i}`, "A", at(i, 0), "SA", "Ops"]);
    rows.push([`c${i}`, "B", at(i, 1), "SB", "Ops"]);
    rows.push([`c${i}`, "C", at(i, 2), "SC", "Ops"]);
    rows.push([`c${i}`, "D", at(i, 3), "SD", "Ops"]);
    rows.push([`c${i}`, "E", at(i, 4), "SE", "Ops"]);
    rows.push([`c${i}`, "F", at(i, 5), "SF", "Ops"]);
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { analytics: computeAnalytics(log), variants: log.variants };
}

const base = (over: Partial<Parameters<typeof findActions>[0]> = {}) => ({
  analytics: null, variants: [], conformance: null, kpiConfig: null, hasTwin: false, ...over,
});

describe("Phase 8 — the findings are real and carry their number", () => {
  it("T3857 - the bottleneck is named with its share of elapsed time", () => {
    const { analytics, variants } = sick();
    const r = findActions(base({ analytics, variants }));
    const f = r.findings.find((x) => x.kind === "bottleneck" && x.title.includes("Approve"))!;
    expect(f).toBeTruthy();
    expect(f.share).toBeGreaterThan(0.9);
    expect(f.title).toMatch(/9[0-9]% of elapsed time/);
  });

  it("T3858 - the slowest hand-off is named separately from the step", () => {
    const { analytics, variants } = sick();
    const f = findActions(base({ analytics, variants })).findings.find((x) => x.kind === "handover")!;
    expect(f.title).toContain("Approve");
    expect(f.title).toContain("Close");
    expect(f.detail).toMatch(/queue, not work/);
  });

  it("T3859 - every finding ends in an action, not a sentence", () => {
    // The whole point: a finding that ends in prose is homework.
    const { analytics, variants } = sick();
    for (const f of findActions(base({ analytics, variants })).findings) {
      expect(f.action.kind).toBeTruthy();
      expect(f.action.label.length).toBeGreaterThan(3);
    }
  });

  it("T3860 - findings are ranked by share of elapsed time where one exists", () => {
    const { analytics, variants } = sick();
    const r = findActions(base({ analytics, variants }));
    const weights = r.findings.map((f) => f.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    expect(r.findings[0].share).not.toBeNull();
  });
});

describe("Phase 8 — nothing stands out is a valid answer", () => {
  it("T3861 - an even process produces NO recommendations and says so", () => {
    // A tool that always has a top recommendation eventually recommends noise.
    const { analytics, variants } = healthy();
    const r = findActions(base({ analytics, variants }));
    expect(r.findings).toEqual([]);
    expect(r.nothingStandsOut).toBe(true);
  });

  it("T3862 - a run with no analytics says re-import rather than advising", () => {
    const r = findActions(base());
    expect(r.findings).toEqual([]);
    expect(r.skipped.join(" ")).toMatch(/re-import/i);
  });
});

describe("Phase 8 — what it refuses to advise on, out loud", () => {
  it("T3863 - no SLA means no lateness advice, and the reason is stated", () => {
    const { analytics, variants } = sick();
    const r = findActions(base({ analytics, variants }));
    expect(r.findings.some((f) => f.kind === "lateness")).toBe(false);
    expect(r.skipped.join(" ")).toMatch(/no SLA is set/);
  });

  it("T3864 - no reference model means no conformance advice, and the reason is stated", () => {
    const { analytics, variants } = sick();
    const r = findActions(base({ analytics, variants }));
    expect(r.findings.some((f) => f.kind === "deviation")).toBe(false);
    expect(r.skipped.join(" ")).toMatch(/not been checked against a reference/);
  });

  it("T3865 - no per-event detail means no hand-off or rework advice at all", () => {
    // NOT the approximate map. An approximation is fine to look at with a label
    // on it and is not a safe basis for telling somebody what to do.
    const { analytics, variants } = sick();
    const countsOnly: RunAnalytics = { ...analytics, detail: "counts" };
    const r = findActions(base({ analytics: countsOnly, variants }));
    expect(r.findings.some((f) => f.kind === "rework" || f.kind === "cross-team")).toBe(false);
    expect(r.skipped.join(" ")).toMatch(/approximate map is not a safe basis/);
  });

  it("T3866 - a log with no teams says so rather than staying quiet", () => {
    const rows: string[][] = [];
    for (let i = 0; i < 10; i++) {
      rows.push([`c${i}`, "Receive", new Date(Date.parse("2026-09-01T00:00:00Z") + i * DAY).toISOString()]);
      rows.push([`c${i}`, "Close", new Date(Date.parse("2026-09-01T00:00:00Z") + i * DAY + 48 * HOUR).toISOString()]);
    }
    const log = buildEventLog(["case", "act", "ts"], rows, { caseId: "case", activity: "act", timestamp: "ts" } as LogMapping);
    const r = findActions(base({ analytics: computeAnalytics(log), variants: log.variants }));
    expect(r.skipped.join(" ")).toMatch(/no teams/);
  });
});

describe("Phase 8 — deviations resolve to their evidence", () => {
  const REFERENCE: ReferenceSm = {
    elements: [
      { id: "i", type: "initial-state" },
      { id: "s1", type: "state", label: "New" },
      { id: "s2", type: "state", label: "Approved" },
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

  it("T3867 - a deviation finding carries the INDEX of the violation it came from", () => {
    // "Show me the cases" has to land on the right one. A finding that cannot be
    // traced back to its evidence is the thing this feature cannot afford.
    const rows: string[][] = [];
    const at = (d: number, h: number) => new Date(Date.parse("2026-09-01T00:00:00Z") + d * DAY + h * HOUR).toISOString();
    for (let i = 0; i < 8; i++) {
      rows.push([`ok${i}`, "Receive", at(i, 0), "New", "Ops"]);
      rows.push([`ok${i}`, "Approve", at(i, 1), "Approved", "Finance"]);
      rows.push([`ok${i}`, "Close", at(i, 2), "Done", "Ops"]);
    }
    for (let i = 0; i < 3; i++) {
      rows.push([`bad${i}`, "Receive", at(8 + i, 0), "New", "Ops"]);
      rows.push([`bad${i}`, "Close", at(8 + i, 1), "Done", "Ops"]);      // skips Approved
    }
    const log = buildEventLog(HEADERS, rows, MAPPING);
    const conformance = checkTransitionConformance(log.variants, REFERENCE);
    const r = findActions(base({ analytics: computeAnalytics(log), variants: log.variants, conformance }));
    const f = r.findings.find((x) => x.kind === "deviation")!;
    expect(f).toBeTruthy();
    expect(f.action.kind).toBe("show-cases");
    expect(typeof f.action.violationIdx).toBe("number");
    const cited = conformance.violations[f.action.violationIdx!];
    expect(cited.severity).toBe("error");
    expect(f.title).toContain(String(cited.cases));
  });
});

describe("Phase 8 — closing the loop", () => {
  it("T3868 - a time-shaped finding offers to calibrate a twin and sweep the busiest team", () => {
    // The one recommendation that hands off to another product surface, and the
    // loop the product already claims: mine → calibrate → simulate → re-mine.
    const { analytics, variants } = sick();
    const f = findActions(base({ analytics, variants })).findings.find((x) => x.action.kind === "calibrate")!;
    expect(f).toBeTruthy();
    expect(f.title).toMatch(/Build a twin/);
    expect(f.title).toContain("Finance");        // holds the 48h
  });

  it("T3869 - a run that already has a twin is told to open it, not to build another", () => {
    const { analytics, variants } = sick();
    const f = findActions(base({ analytics, variants, hasTwin: true })).findings.find((x) => x.action.kind === "calibrate")!;
    expect(f.title).toMatch(/twin you already have/);
    expect(f.action.label).toBe("Open the twin");
  });

  it("T3870 - a healthy process is not told to build a twin for nothing", () => {
    const { analytics, variants } = healthy();
    expect(findActions(base({ analytics, variants })).findings.some((f) => f.action.kind === "calibrate")).toBe(false);
  });
});

describe("Phase 8 — the backlog signal", () => {
  it("T3871 - CONSECUTIVE periods count; isolated busy ones do not", () => {
    // Three scattered busy weeks in a year is seasonality. Three in a row is a
    // backlog, and only the second is worth advice.
    const bucket = (started: number, completed: number) => ({ t: 0, started, completed });
    const scattered = { throughput: [bucket(5, 1), bucket(1, 5), bucket(5, 1), bucket(1, 5), bucket(5, 1)] } as unknown as RunAnalytics;
    const sustained = { throughput: [bucket(1, 5), bucket(5, 1), bucket(5, 1), bucket(5, 1), bucket(1, 5)] } as unknown as RunAnalytics;
    expect(longestBacklogRun(scattered)).toBe(1);
    expect(longestBacklogRun(sustained)).toBe(3);
  });

  it("T3872 - an empty throughput is zero, not a crash", () => {
    expect(longestBacklogRun({ throughput: [] } as unknown as RunAnalytics)).toBe(0);
  });
});

describe("Phase 8 — the model narrates, it does not decide", () => {
  it("T3873 - the facts handed to AI are the computed findings and nothing else", () => {
    // A model given the underlying analytics would invent an ordering. Given
    // only the ranked findings, the most it can do is rewrite sentences.
    const { analytics, variants } = sick();
    const r = findActions(base({ analytics, variants }));
    const facts = narrationFacts(r);
    for (const f of r.findings) expect(facts).toContain(f.title);
    expect(facts).not.toMatch(/variantIdx|resourceDict|cycleMs/);
    // The ranking is already in the text, as numbered lines.
    expect(facts.startsWith("1. ")).toBe(true);
  });

  it("T3874 - what was NOT assessed travels with the facts", () => {
    // Otherwise a narrator writes a confident summary of a process whose SLA
    // and reference model were never set.
    const { analytics, variants } = sick();
    const facts = narrationFacts(findActions(base({ analytics, variants })));
    expect(facts).toMatch(/Not assessed:/);
    expect(facts).toMatch(/no SLA is set/);
  });
});

/**
 * The claim this phase rests on: the ranking is computed and the model only
 * narrates. That is a property of what the route SENDS, and no unit test of
 * `narrationFacts` alone can establish it — the route could pass anything.
 */
describe("Phase 8 — the narration route sends findings, not data", () => {
  const src = readFileSync("app/api/projects/[id]/mining/runs/[runId]/next-steps/route.ts", "utf8");

  it("T3875 - the only user content is narrationFacts", () => {
    // If a future edit hands the model `analytics` or `variants` to "give it
    // more context", it gains the ability to reorder and to invent — and the
    // Miner stops being a tool whose numbers you can cite without checking.
    const body = src.slice(src.indexOf("messages: ["), src.indexOf("messages: [") + 200);
    expect(body).toContain("narrationFacts(result)");
    expect(body).not.toMatch(/analytics|variants|run\.stats/);
  });

  it("T3876 - findActions runs BEFORE any model call, unconditionally", () => {
    // Measured inside the function body: the imports at the top of the file
    // mention these names first and are not an ordering.
    const body = src.slice(src.indexOf("export async function POST"));
    expect(body.indexOf("findActions(")).toBeGreaterThan(-1);
    expect(body.indexOf("findActions(")).toBeLessThan(body.indexOf("messages.create"));
    // …and before the AI is even asked whether it is allowed, so the findings
    // exist on every path through the route.
    expect(body.indexOf("findActions(")).toBeLessThan(body.indexOf("orgPolicyAllows("));
  });

  it("T3877 - the computed findings are returned whatever the model does", () => {
    // Three exits — nothing to say, AI off, AI failed — and all three carry the
    // findings. The prose is a garnish; the list is the product.
    const returns = [...src.matchAll(/return NextResponse\.json\(\{[^}]*\}/g)].map((m) => m[0]);
    const narrationReturns = returns.filter((r) => r.includes("narration"));
    expect(narrationReturns.length).toBeGreaterThanOrEqual(3);
    for (const r of narrationReturns) expect(r).toContain("...result");
  });

  it("T3878 - the system prompt forbids reordering and inventing", () => {
    expect(src).toMatch(/Do not reorder them/);
    expect(src).toMatch(/Do not add findings/);
  });
});

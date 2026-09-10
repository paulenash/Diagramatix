/**
 * Phase 11 — the Compare view, and the one property that makes it worth having.
 *
 * `compareRuns` and the alert rules shipped in Phases 9 and 10 with no screen
 * at all: reachable by the cron and by curl. Giving them a screen creates a
 * failure mode neither had before — the panel and the email disagreeing about
 * whether anything is wrong. There is no version of that which is not damaging:
 * either the alert is noise, or the screen is lying, and the reader cannot tell
 * which.
 *
 * So the arithmetic has exactly one home. `alertPointsFrom` is tested here as a
 * function, and the two callers are checked to be callers rather than copies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { alertPointsFrom, type HistoryRow } from "@/app/lib/mining/alertHistory";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";

const HOUR = 3_600_000, DAY = 86_400_000;
const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts" };
const HEADERS = ["case", "act", "ts"];

/** `n` cases, each taking `hours` end to end, starting on `dayOffset`. */
function runOf(prefix: string, n: number, hours: number, dayOffset = 0) {
  const rows: string[][] = [];
  const at = (d: number, h: number) => new Date(Date.parse("2026-01-01T00:00:00Z") + d * DAY + h * HOUR).toISOString();
  for (let i = 0; i < n; i++) {
    rows.push([`${prefix}${i}`, "Receive", at(dayOffset + i, 0)]);
    rows.push([`${prefix}${i}`, "Close", at(dayOffset + i, hours)]);
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { analytics: computeAnalytics(log), variants: log.variants };
}

function row(id: string, name: string, createdAt: string, opts: Partial<HistoryRow> = {}): HistoryRow {
  const { analytics, variants } = runOf(id, 10, 4);
  return {
    id, name, createdAt,
    analytics, variants,
    conformance: null,
    kpiConfig: null,
    ...opts,
  };
}

describe("Phase 11 — the history behind an alert", () => {
  it("T3953 - each run is judged under the SLA IT was judged under", () => {
    // The trap this avoids: taking the current run's SLA and applying it
    // backwards. A target tightened this month would make last month's cases
    // retrospectively late, and the alert would report a late rate that
    // "doubled" because somebody edited a number in a form.
    const slow = runOf("a", 10, 10);
    const fast = runOf("b", 10, 1);
    const points = alertPointsFrom([
      { id: "a", name: "Old", createdAt: "2026-01-01T00:00:00Z", ...slow, conformance: null, kpiConfig: { slaMs: 20 * HOUR } },
      { id: "b", name: "New", createdAt: "2026-02-01T00:00:00Z", ...fast, conformance: null, kpiConfig: { slaMs: 2 * HOUR } },
    ]);
    // Under its own generous SLA nothing in the old run was late; under its own
    // tight one nothing in the fast run is either. A single SLA applied to both
    // could not produce that pair.
    expect(points).toHaveLength(2);
    expect(points[0].lateRate).toBe(0);
    expect(points[1].lateRate).toBe(0);
  });

  it("T3954 - a run with no SLA has an UNKNOWN late rate, not a zero one", () => {
    const [p] = alertPointsFrom([row("a", "One", "2026-01-01T00:00:00Z")]);
    expect(p.lateRate).toBeNull();
  });

  it("T3955 - a run that was never conformance-checked has an unknown fitness", () => {
    const [p] = alertPointsFrom([row("a", "One", "2026-01-01T00:00:00Z")]);
    expect(p.fitness).toBeNull();
  });

  it("T3956 - a deviation that matched NOTHING is not a deviation this run had", () => {
    // Otherwise it shows up in the next run's "appeared that was not there
    // before" list purely because a rule exists, and the recipient is told the
    // process changed when nothing did.
    const conformance = {
      violations: [
        { message: "Paid without approval", cases: 0 },
        { message: "Reopened after payment", cases: 3 },
      ],
    } as unknown as ConformanceResult;
    const [p] = alertPointsFrom([row("a", "One", "2026-01-01T00:00:00Z", { conformance })]);
    expect(p.violations).toEqual(["Reopened after payment"]);
  });

  it("T3957 - an observation that cannot be scored is still an observation", () => {
    // Dropping it would silently shorten the history, and the history length is
    // what decides whether anything is watched at all — a series of three that
    // quietly becomes a series of one reports "mined once, nothing to compare".
    const points = alertPointsFrom([
      { id: "a", name: "No analytics", createdAt: "2026-01-01T00:00:00Z", analytics: null, variants: [], conformance: null, kpiConfig: null },
      row("b", "Two", "2026-02-01T00:00:00Z"),
    ]);
    expect(points).toHaveLength(2);
    expect(points[0].lateRate).toBeNull();
  });
});

describe("Phase 11 — one home for the arithmetic", () => {
  const poll = () => readFileSync("app/api/mining/poll/route.ts", "utf8");
  const series = () => readFileSync("app/api/projects/[id]/mining/runs/[runId]/series/route.ts", "utf8");

  it("T3958 - the cron and the screen both CALL the shared assembly", () => {
    expect(poll()).toContain("alertPointsFrom");
    expect(series()).toContain("alertPointsFrom");
  });

  it("T3959 - neither route builds its own alert points", () => {
    // The specific shape being forbidden: a local late-rate loop next to a
    // local fitness history, which is what the poll route used to have and what
    // the series route would most naturally have grown.
    for (const [name, src] of [["poll", poll()], ["series", series()]] as const) {
      expect(src, `${name} computes outcomes itself instead of going through alertPointsFrom`)
        .not.toContain("computeOutcomes(");
    }
  });

  it("T3960 - the screen calls the alert RULES rather than restating them", () => {
    const src = series();
    expect(src).toContain("evaluateAlerts(");
    // The thresholds live in alerts.ts. A copy of any of them here is a second
    // definition that will drift the first time one is tuned.
    for (const constant of ["SILENCE_HOURS", "FITNESS_DROP", "FITNESS_FLOOR", "LATE_RATE_FLOOR"]) {
      expect(src, `series route restates ${constant}`).not.toContain(`${constant} =`);
    }
  });
});

describe("Phase 11 — what the Compare view is not allowed to do", () => {
  const tab = () => readFileSync("app/components/mining/insights/CompareTab.tsx", "utf8");

  it("T3961 - it computes nothing in the browser", () => {
    // The whole point. A delta computed client-side is a delta the alert email
    // did not produce, and the two can then differ while both look right.
    //
    // Reading the SHAPES from those modules is fine and is how the payload is
    // typed; calling the functions is not. So the check is on call sites, and
    // on every import from them being type-only.
    const src = tab();
    for (const fn of ["compareRuns", "evaluateAlerts", "computeOutcomes", "filterAnalytics", "fitnessHistory", "alertPointsFrom"]) {
      expect(src, `CompareTab calls ${fn}() — it must render what the server computed`)
        .not.toMatch(new RegExp(`\\b${fn}\\s*\\(`));
    }
    for (const line of src.split("\n").filter((l) => /^import .*mining\/(compareRuns|alerts|alertHistory|outcomes|filterAnalytics)"/.test(l))) {
      expect(line, `a value import from a compute module: ${line.trim()}`).toMatch(/^import type /);
    }
  });

  it("T3962 - a refusal REPLACES the table, it does not caption it", () => {
    const src = tab();
    // The deltas render only under `ok`, and the refusal only under its
    // negation. If the table ever renders unconditionally, every difference
    // between two unrelated processes is presented as a finding.
    expect(src).toMatch(/cmp\?\.ok\s*&&\s*<Comparison/);
    expect(src).toMatch(/cmp\s*&&\s*!cmp\.ok\s*&&/);
  });

  it("T3963 - it says the comparison is of whole runs, beside a filter bar that is not", () => {
    // The filter bar sits directly above this tab and does not apply to it.
    // Saying nothing would leave the reader to assume it does.
    expect(tab()).toMatch(/WHOLE/);
  });

  it("T3964 - the units come from the shared rule, not a local one", () => {
    const src = tab();
    expect(src).toContain("pickClockUnit");
    // A private ladder of millisecond thresholds here is how the same hand-off
    // ends up described in hours on one tab and minutes on another.
    expect(src).not.toMatch(/3_600_000|86_400_000|60_000/);
  });
});

/**
 * Phase 5 — the exported report under a filter.
 *
 * A filtered report that does not say it is filtered is worse than a mixed
 * screen, because the screen at least has the filter bar visible above it. A
 * .docx gets emailed to someone who never saw the console, and every figure in
 * it reads as the whole process.
 *
 * Two things have to hold: the report SAYS what it covers, and its Summary
 * counts agree with the tables beneath them.
 */
import { describe, it, expect } from "vitest";
import { buildAnalysisChapters, buildAnalysisSheets, type AnalysisInput } from "@/app/lib/mining/exportAnalysis";
import { filterAnalytics, filteredStats, describeFilter, type MiningFilter } from "@/app/lib/mining/filterAnalytics";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

const HOUR = 3_600_000, DAY = 86_400_000;
const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", resource: "who", attributeMode: { region: "keep" } };
const HEADERS = ["case", "act", "ts", "who", "region"];

/** Six slow North cases (with a Check step) and six quick South ones. */
function run() {
  const rows: string[][] = [];
  const at = (d: number, h: number) => new Date(Date.parse("2026-06-01T00:00:00Z") + d * DAY + h * HOUR).toISOString();
  for (let i = 0; i < 6; i++) {
    rows.push([`n${i}`, "Receive", at(i, 0), "Ops", "North"]);
    rows.push([`n${i}`, "Check", at(i, 1), "Finance", "North"]);
    rows.push([`n${i}`, "Close", at(i, 9), "Ops", "North"]);
  }
  for (let i = 0; i < 6; i++) {
    rows.push([`s${i}`, "Receive", at(6 + i, 0), "Ops", "South"]);
    rows.push([`s${i}`, "Close", at(6 + i, 1), "Ops", "South"]);
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { stats: log.stats, analytics: computeAnalytics(log), variants: log.variants };
}

/** Build the report input exactly as the export route does. */
function report(filter: MiningFilter): AnalysisInput {
  const { stats, analytics, variants } = run();
  const sliced = filterAnalytics(analytics, variants, filter);
  const filterNote = describeFilter(filter);
  return {
    name: "Order handling",
    stats: sliced && filterNote ? filteredStats(stats, sliced) : stats,
    analytics: sliced?.analytics ?? analytics,
    variants: sliced?.variants ?? variants,
    kpiConfig: null,
    filterNote,
  };
}

const md = (i: AnalysisInput) => buildAnalysisChapters(i)[0].sections[0].bodyMarkdown!;
const summaryRows = (i: AnalysisInput) => buildAnalysisSheets(i).find((s) => s.name === "Summary")!.rows;

describe("Phase 5 — a filtered report says so", () => {
  it("T3811 - the Word report states its filter before any figure", () => {
    const body = md(report({ attrs: { region: "North" } }));
    expect(body).toContain("Filtered to: region = North");
    // Before the Summary heading, so a reader cannot take in a number first.
    expect(body.indexOf("Filtered to")).toBeLessThan(body.indexOf("## Summary"));
  });

  it("T3812 - the spreadsheet says so too, in the Summary sheet", () => {
    const rows = summaryRows(report({ resource: "Finance" }));
    expect(rows.some((r) => r[0] === "Filtered to" && r[1] === "team Finance")).toBe(true);
  });

  it("T3813 - an UNfiltered report says nothing, rather than 'no filter'", () => {
    // A caveat on every whole-run report trains people to ignore caveats.
    const body = md(report({}));
    expect(body).not.toContain("Filtered to");
    expect(summaryRows(report({})).some((r) => r[0] === "Filtered to")).toBe(false);
  });
});

describe("Phase 5 — the report's own figures agree with each other", () => {
  it("T3814 - the Summary counts describe the SLICE, not the whole run", () => {
    // The failure this prevents: a Summary saying 12 cases above a bottleneck
    // table built from 6, in a document nobody can cross-check.
    const i = report({ attrs: { region: "North" } });
    expect(i.stats.cases).toBe(6);
    expect(md(i)).toContain("| Cases | 6 |");
  });

  it("T3815 - the activity list is the slice's, so a step only South does is gone", () => {
    const i = report({ attrs: { region: "South" } });
    expect(i.stats.activities).not.toContain("Check");
    expect(md(i)).not.toContain("| Check |");
  });

  it("T3816 - the variant count is how many variants the slice actually followed", () => {
    // Not the run's variant count. North follows exactly one path.
    expect(report({ attrs: { region: "North" } }).stats.variants).toBe(1);
    expect(report({}).stats.variants).toBe(2);
  });

  it("T3817 - the bottleneck table carries the slice's timings", () => {
    // 8h per case in Check, six cases — and Check does not appear at all in the
    // South slice, so the two reports cannot be confused for one another.
    const body = md(report({ attrs: { region: "North" } }));
    expect(body).toMatch(/\| Check \| 6 \| 6 \|/);
  });
});

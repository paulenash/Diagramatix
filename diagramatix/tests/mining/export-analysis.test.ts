/**
 * Phase 0.4 — a test floor under `exportAnalysis.ts`.
 *
 * This is what leaves the building: the Word/PDF report and the spreadsheet a
 * user sends to someone who will never open the Miner. It had no coverage, and
 * a report is the worst place for a silent defect — a missing chapter or a
 * duration in the wrong unit reads as a fact rather than as a bug.
 */
import { describe, it, expect } from "vitest";
import { buildAnalysisChapters, buildAnalysisSheets, type AnalysisInput } from "@/app/lib/mining/exportAnalysis";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", resource: "who" };
const HEADERS = ["case", "act", "ts", "who"];
const HOUR = 3_600_000;

/**
 * Six cases. Four run Receive → Check → Close; two skip the check. The slow
 * ones breach a 6-hour SLA, so the outcome split has something to report.
 */
function input(kpiConfig: AnalysisInput["kpiConfig"] = null): AnalysisInput {
  const rows: string[][] = [];
  const at = (h: number) => new Date(Date.parse("2026-03-02T09:00:00Z") + h * HOUR).toISOString();
  for (const c of ["c1", "c2", "c3", "c4"]) {
    rows.push([c, "Receive", at(0), "Ops"]);
    rows.push([c, "Check", at(1), "Finance"]);
    rows.push([c, "Close", at(9), "Ops"]);           // 9h cycle → late
  }
  for (const c of ["c5", "c6"]) {
    rows.push([c, "Receive", at(0), "Ops"]);
    rows.push([c, "Close", at(2), "Ops"]);           // 2h cycle → on-time
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { name: "Order handling", stats: log.stats, analytics: computeAnalytics(log), variants: log.variants, kpiConfig };
}

const markdown = (i: AnalysisInput) => buildAnalysisChapters(i)[0].sections[0].bodyMarkdown!;
const sheet = (i: AnalysisInput, name: string) => buildAnalysisSheets(i).find((s) => s.name === name);

describe("Phase 0.4 — the Word report", () => {
  it("T3712 - one chapter, titled with the run's own name", () => {
    const chapters = buildAnalysisChapters(input());
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Process Insights — Order handling");
  });

  it("T3713 - the summary reports the run's real counts", () => {
    const i = input();
    const md = markdown(i);
    expect(md).toContain(`| Cases | ${i.stats.cases} |`);
    expect(md).toContain(`| Events | ${i.stats.events} |`);
    expect(md).toContain(`| Variants | ${i.stats.variants} |`);
    expect(i.stats.cases).toBe(6);
    expect(i.stats.variants).toBe(2);
  });

  it("T3714 - every section a reader expects is present", () => {
    const md = markdown(input());
    expect(md).toContain("## Summary");
    expect(md).toContain("## Bottlenecks");
    expect(md).toContain("## Variants");
  });

  it("T3715 - bottlenecks are listed worst-first, because that is the point", () => {
    // `analytics.activities` is sorted by total time; a report that re-sorted or
    // truncated from the wrong end would bury the finding it exists to deliver.
    const i = input();
    const md = markdown(i);
    const rows = md.split("\n").filter((l) => l.startsWith("| ") && i.analytics.activities.some((a) => l.startsWith(`| ${a.activity} |`)));
    expect(rows[0].startsWith("| Check |")).toBe(true);    // 8h per case — the bottleneck
  });

  it("T3716 - with NO SLA there is no outcome section at all", () => {
    // Rather than an empty table, or 100% on-time against an SLA nobody set.
    expect(markdown(input(null))).not.toContain("## Outcomes");
  });

  it("T3717 - with an SLA the split is reported, and it is the real split", () => {
    const md = markdown(input({ slaMs: 6 * HOUR }));
    expect(md).toContain("## Outcomes");
    expect(md).toContain("**4**");        // four late
    expect(md).toContain("of 6 cases");
  });

  it("T3718 - a variant path is rendered as a path, not as a raw array", () => {
    expect(markdown(input())).toContain("Receive → Check → Close");
  });
});

describe("Phase 0.4 — the spreadsheet", () => {
  it("T3719 - the four standard sheets are always produced", () => {
    expect(buildAnalysisSheets(input()).map((s) => s.name)).toEqual(["Summary", "Bottlenecks", "Variants", "Cases"]);
  });

  it("T3720 - the Outcomes sheet appears only when an SLA is set", () => {
    expect(buildAnalysisSheets(input()).some((s) => s.name === "Outcomes")).toBe(false);
    expect(buildAnalysisSheets(input({ slaMs: 6 * HOUR })).some((s) => s.name === "Outcomes")).toBe(true);
  });

  it("T3721 - durations are NUMBERS in the run's clock unit, not formatted text", () => {
    // A spreadsheet exists to be summed and charted. "8h 0m" in a cell cannot be.
    const i = input();
    const rows = sheet(i, "Bottlenecks")!.rows;
    expect(rows[0]).toContain(`Median (${i.analytics.clockUnit}s)`);
    const check = rows.find((r) => r[0] === "Check")!;
    expect(typeof check[3]).toBe("number");
    expect(check[3]).toBe(8);                        // eight hours, as a number
  });

  it("T3722 - every case is listed with its variant and cycle time", () => {
    const rows = sheet(input(), "Cases")!.rows;
    expect(rows).toHaveLength(7);                    // header + six cases
    expect(rows[0]).toEqual(["Case", "Variant", "Cycle (hours)", "Steps", "Late?"]);
  });

  it("T3723 - the Late? column is blank without an SLA, and decided with one", () => {
    const without = sheet(input(), "Cases")!.rows.slice(1);
    expect(without.every((r) => r[4] === "")).toBe(true);

    const withSla = sheet(input({ slaMs: 6 * HOUR }), "Cases")!.rows.slice(1);
    expect(withSla.filter((r) => r[4] === "late")).toHaveLength(4);
    expect(withSla.filter((r) => r[4] === "on-time")).toHaveLength(2);
  });

  it("T3724 - a run with one case and no timing still exports", () => {
    // The degenerate log a user tries first. It must produce a report, not throw.
    const log = buildEventLog(HEADERS, [["c1", "Only", "2026-03-02T09:00:00Z", "Ops"]], MAPPING);
    const one: AnalysisInput = { name: "Tiny", stats: log.stats, analytics: computeAnalytics(log), variants: log.variants, kpiConfig: null };
    expect(() => buildAnalysisChapters(one)).not.toThrow();
    expect(buildAnalysisSheets(one)).toHaveLength(4);
  });
});

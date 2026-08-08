/**
 * Build the DiagramatixMINER analysis report — summary stats, bottleneck table,
 * variant Pareto, and (when an SLA is set) the on-time/late outcome split +
 * drivers — as Word chapters (buildDocx) and as spreadsheet sheets (buildXlsx).
 * The route renders Word directly, converts to PDF via docxToPdf, or ships xlsx.
 * Pure content building — no DB, no React.
 */
import type { MiningStats, Variant } from "./types";
import type { RunAnalytics } from "./analytics";
import { formatDuration, fromMs } from "./analytics";
import { variantPareto } from "./variantView";
import { computeOutcomes, type KpiConfig } from "./outcomes";
import type { DocxChapter } from "@/app/lib/documents/exportDocx";
import type { Sheet, Cell } from "@/app/lib/riskControls/xlsx";

export interface AnalysisInput {
  name: string;
  stats: MiningStats;
  analytics: RunAnalytics;
  variants: Variant[];
  kpiConfig: KpiConfig | null;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Word report → one chapter with markdown sections (tables supported by buildDocx). */
export function buildAnalysisChapters(input: AnalysisInput): DocxChapter[] {
  const { name, stats, analytics, variants, kpiConfig } = input;
  const unit = analytics.clockUnit;
  const fmt = (ms: number) => formatDuration(ms, unit);
  const md: string[] = [];

  md.push("## Summary", "");
  md.push("| Metric | Value |", "|---|---|");
  md.push(`| Cases | ${stats.cases} |`);
  md.push(`| Events | ${stats.events} |`);
  md.push(`| Activities | ${stats.activities.length} |`);
  md.push(`| Variants | ${stats.variants} |`);
  md.push(`| Median cycle time | ${fmt(analytics.cycle.medianMs)} |`);
  md.push(`| P90 cycle time | ${fmt(analytics.cycle.p90Ms)} |`, "");

  md.push("## Bottlenecks — steps by total time", "");
  md.push("| Step | Cases | Occurrences | Median time | Total time |", "|---|---|---|---|---|");
  for (const a of analytics.activities.slice(0, 15)) {
    md.push(`| ${a.activity} | ${a.caseFreq} | ${a.eventFreq} | ${fmt(a.medianDurMs)} | ${fmt(a.totalTimeMs)} |`);
  }
  md.push("");

  md.push("## Variants — most frequent", "");
  md.push("| # | Cases | Share | Cumulative | Path |", "|---|---|---|---|---|");
  for (const r of variantPareto(variants).slice(0, 12)) {
    md.push(`| ${r.idx + 1} | ${r.count} | ${pct(r.share)} | ${pct(r.cumulative)} | ${r.events.join(" → ")} |`);
  }
  md.push("");

  const report = computeOutcomes(analytics, variants, kpiConfig);
  if (report && report.total > 0) {
    md.push("## Outcomes — on-time vs late", "");
    md.push(`SLA: a case is late when its cycle time exceeds **${fmt(report.slaMs)}**.`, "");
    md.push(`On-time: **${report.onTime}** (${report.onTimePct.toFixed(0)}%) · Late: **${report.late}** of ${report.total} cases.`, "");
    if (report.activityDrivers.length) {
      md.push("### Steps driving late cases", "");
      md.push("| Step | Late rate | × average |", "|---|---|---|");
      for (const d of report.activityDrivers.slice(0, 8)) md.push(`| ${d.activity} | ${(d.lateRate * 100).toFixed(0)}% | ${d.lift.toFixed(1)}× |`);
      md.push("");
    }
    if (report.variantDrivers.length) {
      md.push("### Variants over-represented in late cases", "");
      md.push("| Variant | Late / cases | × average |", "|---|---|---|");
      for (const d of report.variantDrivers.slice(0, 6)) md.push(`| #${d.variantIdx + 1} | ${d.late}/${d.cases} | ${d.lift.toFixed(1)}× |`);
      md.push("");
    }
  }

  return [{ title: `Process Insights — ${name}`, sections: [{ heading: null, bodyMarkdown: md.join("\n") }] }];
}

/** Spreadsheet report → one sheet per section. Durations are numeric in the run's clock unit. */
export function buildAnalysisSheets(input: AnalysisInput): Sheet[] {
  const { name, stats, analytics, variants, kpiConfig } = input;
  const unit = analytics.clockUnit;
  const u = (ms: number) => Math.round(fromMs(ms, unit) * 100) / 100;

  const summary: Cell[][] = [
    ["Process Insights", name],
    ["Metric", "Value"],
    ["Cases", stats.cases], ["Events", stats.events], ["Activities", stats.activities.length],
    ["Variants", stats.variants],
    [`Median cycle (${unit}s)`, u(analytics.cycle.medianMs)], [`P90 cycle (${unit}s)`, u(analytics.cycle.p90Ms)],
  ];

  const bottlenecks: Cell[][] = [["Step", "Cases", "Occurrences", `Median (${unit}s)`, `Total (${unit}s)`, "Resource"]];
  for (const a of analytics.activities) bottlenecks.push([a.activity, a.caseFreq, a.eventFreq, u(a.medianDurMs), u(a.totalTimeMs), a.dominantResource ?? ""]);

  const variantRows: Cell[][] = [["#", "Cases", "Share %", "Cumulative %", "Path"]];
  for (const r of variantPareto(variants)) variantRows.push([r.idx + 1, r.count, +(r.share * 100).toFixed(1), +(r.cumulative * 100).toFixed(1), r.events.join(" → ")]);

  const caseRows: Cell[][] = [["Case", "Variant", `Cycle (${unit}s)`, "Steps", "Late?"]];
  const slaMs = kpiConfig?.slaMs;
  for (const c of analytics.cases.slice(0, 5000)) caseRows.push([c.caseId, c.variantIdx + 1, u(c.cycleMs), c.events, slaMs ? (c.cycleMs > slaMs ? "late" : "on-time") : ""]);

  const sheets: Sheet[] = [
    { name: "Summary", rows: summary },
    { name: "Bottlenecks", rows: bottlenecks },
    { name: "Variants", rows: variantRows },
    { name: "Cases", rows: caseRows },
  ];

  const report = computeOutcomes(analytics, variants, kpiConfig);
  if (report && report.total > 0) {
    const out: Cell[][] = [
      [`SLA (${unit}s)`, u(report.slaMs)],
      ["On-time", report.onTime], ["Late", report.late], ["On-time %", +report.onTimePct.toFixed(1)],
      [],
      ["Step driver", "Late rate %", "Lift ×"],
      ...report.activityDrivers.map((d) => [d.activity, +(d.lateRate * 100).toFixed(0), +d.lift.toFixed(2)] as Cell[]),
      [],
      ["Variant driver", "Late / cases", "Lift ×"],
      ...report.variantDrivers.map((d) => [`#${d.variantIdx + 1}`, `${d.late}/${d.cases}`, +d.lift.toFixed(2)] as Cell[]),
    ];
    sheets.push({ name: "Outcomes", rows: out });
  }
  return sheets;
}

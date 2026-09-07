/**
 * The business case as a document — Word chapters and spreadsheet sheets, built
 * from the already-computed facts.
 *
 * Mirrors `app/lib/mining/exportAnalysis.ts`: pure content building, no DB and no
 * React, so the route stays thin and the content is unit-testable without
 * rendering anything.
 *
 * The narrative (AI or deterministic) is passed in rather than fetched, so the
 * document says exactly what the screen said.
 */
import type { BusinessCaseFacts, SideCosts } from "./facts/businessCase";
import type { DocxChapter } from "@/app/lib/documents/exportDocx";
import type { Sheet, Cell } from "@/app/lib/riskControls/xlsx";

const money = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const hrs = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;

/** The per-case cost table, the heart of the document. */
function costTable(f: BusinessCaseFacts): string[] {
  const md: string[] = [];
  const priced = f.base.queueCostPerCase !== undefined;
  const unmeasured = f.base.waitingUnmeasured || f.tobe.waitingUnmeasured;

  md.push("| Per case | " + f.base.name + " | " + f.tobe.name + " | Difference |", "|---|---|---|---|");
  md.push(`| Cost of doing the work | ${money(f.base.doingPerCase)} | ${money(f.tobe.doingPerCase)} | ${money(f.base.doingPerCase - f.tobe.doingPerCase)} |`);

  if (!unmeasured) {
    const q = (s: SideCosts) => (priced ? `${hrs(s.queueHoursPerCase)} · ${money(s.queueCostPerCase!)}` : hrs(s.queueHoursPerCase));
    const p = (s: SideCosts) => (priced ? `${hrs(s.processHoursPerCase)} · ${money(s.processCostPerCase!)}` : hrs(s.processHoursPerCase));
    md.push(`| Queueing for a person | ${q(f.base)} | ${q(f.tobe)} | ${hrs(f.base.queueHoursPerCase - f.tobe.queueHoursPerCase)} |`);
    md.push(`| Waiting on the process | ${p(f.base)} | ${p(f.tobe)} | ${hrs(f.base.processHoursPerCase - f.tobe.processHoursPerCase)} |`);
  }

  md.push(`| **Total** | **${money(f.base.totalPerCase)}** | **${money(f.tobe.totalPerCase)}** | **${money(f.perCaseSaving)}** |`, "");
  return md;
}

export function buildBusinessCaseChapters(f: BusinessCaseFacts, narrative: string): DocxChapter[] {
  const md: string[] = [];

  md.push("## The case", "", narrative, "");

  md.push("## What it costs per case", "");
  md.push(...costTable(f));
  if (f.base.waitingUnmeasured || f.tobe.waitingUnmeasured) {
    md.push(
      "_Waiting time was not recorded on one or both runs, so only the cost of doing the work is shown. " +
      "It is absent, not zero._",
      "",
    );
  } else if (f.base.queueCostPerCase === undefined) {
    md.push(
      "_Waiting is shown in hours only: no cost of delay was supplied. The two are kept apart because " +
      "queueing is shortened by more capacity and waiting on the process is not._",
      "",
    );
  }

  md.push("## What it is worth", "");
  md.push("| | |", "|---|---|");
  md.push(`| Saving per case | ${money(f.perCaseSaving)} (${f.perCasePct}%) |`);
  if (f.annualVolume !== undefined) md.push(`| Cases a year | ${f.annualVolume.toLocaleString()} |`);
  if (f.annualSaving !== undefined) md.push(`| Saving a year | ${money(f.annualSaving)} |`);
  if (f.implementationCost !== undefined) md.push(`| One-off cost | ${money(f.implementationCost)} |`);
  if (f.paybackMonths !== undefined) md.push(`| Pays back in | ${f.paybackMonths} month${f.paybackMonths === 1 ? "" : "s"} |`);
  md.push("");
  if (f.paybackNote) md.push(`_${f.paybackNote}_`, "");

  if (f.assumptions.length) {
    md.push("## Assumptions", "");
    for (const a of f.assumptions) md.push(`- ${a}`);
    md.push("");
  }
  if (f.missing.length) {
    md.push("## What would sharpen this", "");
    for (const m of f.missing) md.push(`- ${m}`);
    md.push("");
  }

  return [{ title: `Business case — ${f.studyName}`, sections: [{ heading: null, bodyMarkdown: md.join("\n") }] }];
}

export function buildBusinessCaseSheets(f: BusinessCaseFacts): Sheet[] {
  // Cell is a plain scalar (string | number | null | undefined) - no wrappers.
  const t = (v: string): Cell => v;
  const n = (v: number): Cell => v;

  const costs: Cell[][] = [
    [t("Per case"), t(f.base.name), t(f.tobe.name), t("Difference")],
    [t("Cost of doing the work"), n(f.base.doingPerCase), n(f.tobe.doingPerCase), n(f.base.doingPerCase - f.tobe.doingPerCase)],
  ];
  if (!f.base.waitingUnmeasured && !f.tobe.waitingUnmeasured) {
    costs.push([t("Queueing — hours"), n(f.base.queueHoursPerCase), n(f.tobe.queueHoursPerCase), n(f.base.queueHoursPerCase - f.tobe.queueHoursPerCase)]);
    costs.push([t("Waiting on the process — hours"), n(f.base.processHoursPerCase), n(f.tobe.processHoursPerCase), n(f.base.processHoursPerCase - f.tobe.processHoursPerCase)]);
    if (f.base.queueCostPerCase !== undefined) {
      costs.push([t("Queueing — cost"), n(f.base.queueCostPerCase), n(f.tobe.queueCostPerCase!), n(f.base.queueCostPerCase - f.tobe.queueCostPerCase!)]);
      costs.push([t("Waiting on the process — cost"), n(f.base.processCostPerCase!), n(f.tobe.processCostPerCase!), n(f.base.processCostPerCase! - f.tobe.processCostPerCase!)]);
    }
  }
  costs.push([t("Total per case"), n(f.base.totalPerCase), n(f.tobe.totalPerCase), n(f.perCaseSaving)]);

  const summary: Cell[][] = [
    [t("Study"), t(f.studyName)],
    [t("Saving per case"), n(f.perCaseSaving)],
    [t("Saving per case (%)"), n(f.perCasePct)],
  ];
  if (f.annualVolume !== undefined) summary.push([t("Cases a year"), n(f.annualVolume)]);
  if (f.annualSaving !== undefined) summary.push([t("Saving a year"), n(f.annualSaving)]);
  if (f.implementationCost !== undefined) summary.push([t("One-off cost"), n(f.implementationCost)]);
  if (f.paybackMonths !== undefined) summary.push([t("Payback (months)"), n(f.paybackMonths)]);
  if (f.paybackNote) summary.push([t("Note"), t(f.paybackNote)]);

  const notes: Cell[][] = [
    [t("Assumptions")],
    ...f.assumptions.map((a) => [t(a)]),
    [t("")],
    [t("What would sharpen this")],
    ...f.missing.map((m) => [t(m)]),
  ];

  return [
    { name: "Summary", rows: summary },
    { name: "Cost per case", rows: costs },
    { name: "Assumptions", rows: notes },
  ];
}

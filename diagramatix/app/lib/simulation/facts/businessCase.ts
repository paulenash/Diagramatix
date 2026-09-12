/**
 * The business case: what a change is worth, with a currency symbol and a date.
 *
 * A department head does not approve a change because a team is at 94%
 * utilisation. They approve it because of a number with money and a month on it.
 * This turns two runs into that number.
 *
 * THREE COST LINES, NOT ONE. The Simulator has always priced only busy resource
 * hours, so a process that takes three weeks because of waiting cost the same as
 * one that took three hours. Waiting is now measured, and it is reported in two
 * parts because they have different remedies:
 *
 *   cost of DOING          busy resource hours × rate — already computed
 *   cost of QUEUE waiting  waiting for a person; MORE CAPACITY SHORTENS IT
 *   cost of PROCESS waiting an authored waitTime (courier, overnight batch);
 *                          no amount of staffing touches it
 *
 * Pooling the two waits would produce a case recommending headcount to fix
 * waiting that headcount cannot fix — the sort of error that gets a business
 * case thrown out in the room.
 *
 * The delay rate is OPTIONAL and is purely the BUSINESS cost of elapsed time —
 * an SLA penalty, lost revenue, working capital, a customer who goes elsewhere.
 * It must never include staff cost, which is already counted in the doing line.
 * Leave it unset and the waiting appears in HOURS with no money against it: "we
 * lose 40 hours per case to waiting, 31 of it to the courier" is an argument on
 * its own, and inventing a rate would not make it a better one.
 *
 * Pure — no DB, no React. The AI narrates these figures and cannot add to them.
 */
import { makeAiClient } from "@/app/lib/ai/anthropicClient";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import type { Redactor } from "@/app/lib/ai/redaction";
import type { RunMetrics } from "../results";
import { SECONDS_PER_UNIT, type ClockUnit } from "../types";

/** Stored on SimulationStudy.businessCase. Every field is optional: the case
 *  reports what it can and says plainly what is missing. */
export interface BusinessCaseInputs {
  /** One-off cost of making the change (build, licences, training). */
  implementationCost?: number;
  /** Cases per year, for turning a per-case saving into an annual one. */
  annualVolume?: number;
  /** BUSINESS cost of an hour of elapsed time — penalties, lost revenue,
   *  working capital. NOT staff cost, which the doing line already carries. */
  costOfDelayPerHour?: number;
}

/** One side of the comparison, reduced to money and hours per case. */
export interface SideCosts {
  name: string;
  /** Resource cost per case — busy hours × rate. */
  doingPerCase: number;
  /** Hours per case spent queueing for a person. */
  queueHoursPerCase: number;
  /** Hours per case spent on authored, non-seizing waits. */
  processHoursPerCase: number;
  /** Priced only when a delay rate was supplied. */
  queueCostPerCase?: number;
  processCostPerCase?: number;
  /** doing + whatever waiting could be priced. */
  totalPerCase: number;
  /** True when this run predates the wait measurement — the waiting figures are
   *  absent, not zero, and every reader must say so. */
  waitingUnmeasured: boolean;
  /**
   * NOTHING COMPLETED on this side.
   *
   * Every per-case figure divides by the case count, so a side that never ran —
   * or ran and finished nothing — reports zero for doing, queueing and waiting
   * alike. Compared against a real baseline that is a 100% saving, and the
   * arithmetic is impeccable: it is the premise that is absent.
   *
   * Paul, 2026-09-12, was shown exactly that: "removes 1,437.76 hours per case —
   * the entire as-is workload... a 100% reduction". Reported so no reader has to
   * infer it from a suspiciously round result.
   */
  noResults: boolean;
}

export interface BusinessCaseFacts {
  studyName: string;
  unit: string;
  base: SideCosts;
  tobe: SideCosts;
  /** Positive = the change saves money per case. */
  perCaseSaving: number;
  perCasePct: number;
  /** Present only when an annual volume was given. */
  annualSaving?: number;
  annualVolume?: number;
  implementationCost?: number;
  /** Months to repay the one-off cost. Absent when it cannot be computed, with
   *  `paybackNote` saying why — never a fabricated number. */
  paybackMonths?: number;
  paybackNote?: string;
  /** Stated on the face of the case, because every one of them is arguable. */
  assumptions: string[];
  /** What was left out, and what supplying it would add. */
  missing: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r0 = (n: number) => Math.round(n);

/** Per-case costs and waiting hours for one run. */
export function sideCosts(name: string, m: RunMetrics, inputs: BusinessCaseInputs): SideCosts {
  const cases = m.stats.completed?.mean ?? 0;
  const hoursPerUnit = SECONDS_PER_UNIT[(m.clockUnit as ClockUnit) ?? "minute"] / 3600;
  const doingPerCase = m.stats.costPerCase?.mean ?? 0;

  const qw = m.stats.queueWait, pw = m.stats.processWait;
  const waitingUnmeasured = !qw || !pw;
  const queueHoursPerCase = qw && cases > 0 ? (qw.mean / cases) * hoursPerUnit : 0;
  const processHoursPerCase = pw && cases > 0 ? (pw.mean / cases) * hoursPerUnit : 0;

  const rate = inputs.costOfDelayPerHour;
  const priced = typeof rate === "number" && rate > 0 && !waitingUnmeasured;
  const queueCostPerCase = priced ? queueHoursPerCase * rate! : undefined;
  const processCostPerCase = priced ? processHoursPerCase * rate! : undefined;

  return {
    name,
    noResults: cases <= 0,
    doingPerCase: r2(doingPerCase),
    queueHoursPerCase: r2(queueHoursPerCase),
    processHoursPerCase: r2(processHoursPerCase),
    ...(queueCostPerCase !== undefined ? { queueCostPerCase: r2(queueCostPerCase) } : {}),
    ...(processCostPerCase !== undefined ? { processCostPerCase: r2(processCostPerCase) } : {}),
    totalPerCase: r2(doingPerCase + (queueCostPerCase ?? 0) + (processCostPerCase ?? 0)),
    waitingUnmeasured,
  };
}

export function buildBusinessCaseFacts(
  baseMetrics: RunMetrics,
  tobeMetrics: RunMetrics,
  baseName: string,
  tobeName: string,
  studyName: string,
  inputs: BusinessCaseInputs,
): BusinessCaseFacts {
  const base = sideCosts(baseName, baseMetrics, inputs);
  const tobe = sideCosts(tobeName, tobeMetrics, inputs);

  // A saving computed against a side that completed nothing is not a saving.
  // Left at zero and flagged, rather than reported as a total win — the numbers
  // would be arithmetically correct and completely misleading.
  const unusable = base.noResults || tobe.noResults;
  const perCaseSaving = unusable ? 0 : r2(base.totalPerCase - tobe.totalPerCase);
  const perCasePct = unusable || base.totalPerCase <= 0
    ? 0
    : Math.round((perCaseSaving / base.totalPerCase) * 100);

  const facts: BusinessCaseFacts = {
    studyName,
    unit: baseMetrics.clockUnit ?? "",
    base, tobe,
    perCaseSaving, perCasePct,
    assumptions: [],
    missing: [],
  };

  // The blocker rides in `missing`, which every consumer already renders as
  // "here is what this case cannot tell you" — the same channel as a blank
  // input field, and for the same reason.
  for (const side of [base, tobe]) {
    if (side.noResults) {
      facts.missing.push(
        `"${side.name}" completed no cases, so every per-case figure for it is zero — not because the work is free, ` +
        "but because there is nothing measured. Run that scenario before reading any saving here.",
      );
    }
  }

  if (unusable) {
    // No annual figure, no payback. Both would be scaled from a saving that
    // does not exist, and a payback of "immediate" is the most inviting wrong
    // answer this screen could give.
    if (typeof inputs.annualVolume === "number" && inputs.annualVolume > 0) facts.annualVolume = inputs.annualVolume;
    if (typeof inputs.implementationCost === "number" && inputs.implementationCost >= 0) facts.implementationCost = inputs.implementationCost;
    return facts;
  }

  if (typeof inputs.annualVolume === "number" && inputs.annualVolume > 0) {
    facts.annualVolume = inputs.annualVolume;
    facts.annualSaving = r0(perCaseSaving * inputs.annualVolume);
  } else {
    facts.missing.push("Annual case volume — without it the per-case saving cannot become an annual figure.");
  }

  if (typeof inputs.implementationCost === "number" && inputs.implementationCost >= 0) {
    facts.implementationCost = inputs.implementationCost;
  } else {
    facts.missing.push("One-off implementation cost — without it there is no payback period.");
  }

  // Payback, or an explicit reason there is none. Never a fabricated month.
  if (facts.annualSaving !== undefined && facts.implementationCost !== undefined) {
    if (facts.annualSaving <= 0) {
      facts.paybackNote =
        "The change does not save money on these figures, so there is no payback period. It may still be " +
        "worth doing for speed or predictability — but not on cost.";
    } else if (facts.implementationCost === 0) {
      facts.paybackMonths = 0;
      facts.paybackNote = "No one-off cost was entered, so the saving starts immediately.";
    } else {
      facts.paybackMonths = r2(facts.implementationCost / (facts.annualSaving / 12));
    }
  }

  if (base.waitingUnmeasured || tobe.waitingUnmeasured) {
    facts.missing.push(
      "Waiting time was not recorded on one or both runs (they predate the measurement). Re-run both " +
      "sides to include the cost of waiting.",
    );
  } else if (inputs.costOfDelayPerHour === undefined || inputs.costOfDelayPerHour <= 0) {
    facts.missing.push(
      "Cost of delay per hour — waiting is reported in hours only. Supply a rate to price it, counting " +
      "only the business cost of elapsed time (penalties, lost revenue, working capital), never staff cost.",
    );
  }

  facts.assumptions.push(
    "Cost of doing is busy resource hours × the team rates entered in the team library.",
  );
  if (!base.waitingUnmeasured && !tobe.waitingUnmeasured) {
    facts.assumptions.push(
      "Waiting is split in two: queueing for a person, which more capacity shortens, and waiting on the " +
      "process (a courier, an overnight batch), which staffing does not change at all.",
    );
  }
  if (facts.paybackMonths !== undefined && facts.paybackMonths > 0) {
    facts.assumptions.push(
      "Payback assumes the saving accrues evenly from day one. A real implementation ramps up, so treat " +
      "the month as the earliest plausible, not a forecast.",
    );
  }
  if (facts.annualSaving !== undefined) {
    facts.assumptions.push(
      `Annual figures scale the per-case saving by ${facts.annualVolume!.toLocaleString()} cases a year, ` +
      "assuming the mix of work stays as simulated.",
    );
  }

  return facts;
}

const money = (n: number) => (n >= 0 ? "" : "-") + "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** The same case, rendered deterministically — the fallback when AI is off, and
 *  the content the Word/Excel/PDF export is built from. Pure. */
export function summariseBusinessCase(f: BusinessCaseFacts): string {
  const out: string[] = [];
  const side = (s: SideCosts) => {
    const bits = [`cost of doing ${money(s.doingPerCase)}`];
    if (!s.waitingUnmeasured) {
      bits.push(
        s.queueCostPerCase !== undefined
          ? `queueing ${s.queueHoursPerCase}h (${money(s.queueCostPerCase)})`
          : `queueing ${s.queueHoursPerCase}h`,
      );
      bits.push(
        s.processCostPerCase !== undefined
          ? `waiting on the process ${s.processHoursPerCase}h (${money(s.processCostPerCase)})`
          : `waiting on the process ${s.processHoursPerCase}h`,
      );
    }
    return `- ${s.name}: ${bits.join(", ")} — ${money(s.totalPerCase)} per case.`;
  };

  out.push(`${f.tobe.name} vs ${f.base.name} — ${f.studyName}`, "");

  // LEAD with the blocker. A side that completed nothing makes every figure
  // below it zero, and a reader who meets the numbers first has already formed
  // a view by the time the caveat arrives.
  const dead = [f.base, f.tobe].filter((x) => x.noResults);
  if (dead.length > 0) {
    out.push(
      `NO CASE CAN BE MADE YET: ${dead.map((d) => `"${d.name}"`).join(" and ")} completed no cases.`,
      "Its per-case figures are zero because nothing was measured, not because the work is free —",
      "so any saving, percentage or payback computed against it would be arithmetic on an absent premise.",
      "Run that scenario, then come back.",
      "",
    );
  }

  out.push(side(f.base));
  out.push(side(f.tobe));
  out.push("");
  if (dead.length === 0) {
    out.push(
      f.perCaseSaving >= 0
        ? `Saving: ${money(f.perCaseSaving)} per case (${f.perCasePct}%).`
        : `This costs ${money(-f.perCaseSaving)} more per case (${-f.perCasePct}%).`,
    );
  }
  if (f.annualSaving !== undefined) out.push(`Over ${f.annualVolume!.toLocaleString()} cases a year: ${money(f.annualSaving)}.`);
  if (f.implementationCost !== undefined) out.push(`One-off cost to get there: ${money(f.implementationCost)}.`);
  if (f.paybackMonths !== undefined) out.push(`Pays back in ${f.paybackMonths} month${f.paybackMonths === 1 ? "" : "s"}.`);
  if (f.paybackNote) out.push(f.paybackNote);

  if (f.assumptions.length) {
    out.push("", "Assumptions");
    for (const a of f.assumptions) out.push(`- ${a}`);
  }
  if (f.missing.length) {
    out.push("", "Not included");
    for (const m of f.missing) out.push(`- ${m}`);
  }
  out.push("", "(Written deterministically from the run figures — enable AI for a narrated version.)");
  return out.join("\n");
}

const SYSTEM = `You are a process-improvement analyst writing the money paragraph of a business case for a department head, from a discrete-event simulation comparing a current process with a proposed one.

You are given a JSON object of ALREADY-COMPUTED figures. Write a SHORT case — 3 to 6 sentences, plain English, no headings, no bullets — that a non-technical decision-maker could act on.

STRICT RULES
- Use ONLY numbers present in the facts JSON. Never invent, recompute or infer a figure. You MAY round for readability and convert hours to days where it reads better.
- UNITS ARE IN THE FIELD NAMES AND MUST BE OBEYED. Anything ending "CostPerCase",
  and also "doingPerCase", "totalPerCase", "perCaseSaving", "annualSaving" and
  "implementationCost", is MONEY. Only "queueHoursPerCase" and
  "processHoursPerCase" are hours. Reporting a money figure as hours — "removes
  1,437.76 hours per case" when 1437.76 was pounds — turns a cost saving into an
  impossible time saving, and it reads perfectly plausibly.
- IF "base.noResults" OR "tobe.noResults" IS TRUE, there is no case to make. Say
  which side completed no cases and that its figures are absent rather than zero,
  and STOP. Do not report a saving, a percentage or a payback: every one of them
  would be computed from a side that never ran, and "100% reduction, payback
  immediate" is the most inviting wrong answer this screen can give.
- Lead with the money: saving per case, the annual figure, and the payback if there is one.
- If there is no payback (paybackNote present), say so plainly and do not argue around it. A change that does not pay back may still be worth doing for speed — say that only if the figures support it.
- The two kinds of waiting are NOT interchangeable. Queue waiting is shortened by more capacity; process waiting (a courier, an overnight batch) is not changed by staffing at all. Never suggest staffing as a remedy for process waiting.
- If \`missing\` is non-empty, close with one sentence naming what would sharpen the case. Do not treat a missing figure as zero.
- Mention the ramp-up caveat if a payback month is stated.
- Output plain prose only. No preamble like "Here is". Start directly.`;

export type BusinessCaseAiResult =
  | { ok: true; narrative: string; model: string; truncated?: boolean }
  | { ok: false; status: number; error: string };

/**
 * Output budget. It was 700, which cut a normal case off mid-sentence — Paul,
 * 2026-09-12, quoting one that ended "...while 40.16". Same cause as the
 * assessment budget, and the same fix: enough room for the reply the prompt asks
 * for, plus a check that it FINISHED, because a budget can always be beaten and
 * half a sentence reads exactly like a whole one.
 */
const CASE_MAX_TOKENS = 1500;

export async function generateBusinessCaseNarrative(
  args: { apiKey: string; facts: BusinessCaseFacts },
  redactor?: Redactor,
): Promise<BusinessCaseAiResult> {
  const model = await getAiGenerateModel();
  const client = makeAiClient(model, args.apiKey);
  const payload = JSON.stringify(args.facts, null, 2);
  try {
    const message = await client.messages.create({
      model,
      max_tokens: CASE_MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content: redactor ? redactor.redact(payload) : payload }],
    });
    const block = message.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { ok: false, status: 500, error: "No response from AI" };
    // Did it FINISH? A case that stops mid-sentence still reads like a case, so
    // the reader takes a half-formed argument for a complete one.
    const truncated = message.stop_reason === "max_tokens";
    const text = block.text.trim();
    return {
      ok: true,
      narrative: redactor ? redactor.restore(text) : text,
      model,
      ...(truncated ? { truncated: true } : {}),
    };
  } catch (err) {
    return { ok: false, status: 500, error: `Business case narration failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

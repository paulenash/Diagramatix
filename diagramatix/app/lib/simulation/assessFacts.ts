/**
 * Grounded AI assessment of an As-is → To-be comparison. We compute every figure
 * deterministically here (buildComparisonFacts) and hand the model ONLY those
 * numbers, so the prose is natural but can never invent or misstate a statistic.
 *
 * Keep the Anthropic-facing logic here so the API route stays thin (mirrors
 * staffNarrative.ts).
 */
import { makeAiClient } from "@/app/lib/ai/anthropicClient";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import type { Redactor } from "@/app/lib/ai/redaction";
import type { RunMetrics } from "./results";

// Model resolved centrally via getAiGenerateModel() (was pinned to claude-opus-4-8)
// so all AI honours the single admin-controlled model. See enterprise/ ENT-08.

export interface ComparisonFacts {
  unit: string;
  baseName: string;
  tobeName: string;
  flow: {
    baseTypical: number; tobeTypical: number;         // p50 (per case)
    baseNearWorst: number; tobeNearWorst: number;     // p95 (per case)
    baseSpreadSd: number; tobeSpreadSd: number;       // case sd
    typicalPctFaster: number; nearWorstPctFaster: number;
    baseMean: number; tobeMean: number; meanPctFaster: number;
    baseMeanConfidence: number; tobeMeanConfidence: number; // ± half-width over runs
  };
  throughput: { base: number; tobe: number; pctChange: number };
  cost?: { basePerCase: number; tobePerCase: number; perCaseSaved: number; pctCheaper: number; baseTotal: number; tobeTotal: number; totalSaved: number };
  bottleneck?: { team: string; baseUtilPct: number; tobeUtilPct: number; relievedPts: number; fteFreed?: number };
  replications: number;
}

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const pctFaster = (from: number, to: number) => (from > 0 ? Math.round(((from - to) / from) * 100) : 0);

/** Compute the comparison facts from two runs' persisted metrics. Uses the true
 *  per-case distribution (caseFlow) when present, else the run-average flowTime. */
export function buildComparisonFacts(base: RunMetrics, tobe: RunMetrics, baseName: string, tobeName: string, unit: string): ComparisonFacts {
  const bC = base.stats.caseFlow, tC = tobe.stats.caseFlow;
  const bTyp = bC?.p50 ?? base.stats.flowTime.p50, tTyp = tC?.p50 ?? tobe.stats.flowTime.p50;
  const bNW = bC?.p95 ?? base.stats.flowTime.p95, tNW = tC?.p95 ?? tobe.stats.flowTime.p95;
  const bMean = bC?.mean ?? base.stats.flowTime.mean, tMean = tC?.mean ?? tobe.stats.flowTime.mean;
  const conf = (s: { p5: number; p95: number }) => r1(Math.max(0, (s.p95 - s.p5) / 2));

  const facts: ComparisonFacts = {
    unit, baseName, tobeName,
    replications: base.stats.replications,
    flow: {
      baseTypical: r0(bTyp), tobeTypical: r0(tTyp),
      baseNearWorst: r0(bNW), tobeNearWorst: r0(tNW),
      baseSpreadSd: r0(bC?.sd ?? 0), tobeSpreadSd: r0(tC?.sd ?? 0),
      typicalPctFaster: pctFaster(bTyp, tTyp), nearWorstPctFaster: pctFaster(bNW, tNW),
      baseMean: r0(bMean), tobeMean: r0(tMean), meanPctFaster: pctFaster(bMean, tMean),
      baseMeanConfidence: conf(base.stats.flowTime), tobeMeanConfidence: conf(tobe.stats.flowTime),
    },
    throughput: {
      base: r1(base.stats.completed.mean), tobe: r1(tobe.stats.completed.mean),
      pctChange: base.stats.completed.mean > 0 ? Math.round(((tobe.stats.completed.mean - base.stats.completed.mean) / base.stats.completed.mean) * 100) : 0,
    },
  };

  const bCpc = base.stats.costPerCase?.mean, tCpc = tobe.stats.costPerCase?.mean;
  if (bCpc != null && tCpc != null && (bCpc > 0 || tCpc > 0)) {
    facts.cost = {
      basePerCase: r0(bCpc), tobePerCase: r0(tCpc), perCaseSaved: r0(bCpc - tCpc), pctCheaper: pctFaster(bCpc, tCpc),
      baseTotal: r0(base.stats.totalCost?.mean ?? 0), tobeTotal: r0(tobe.stats.totalCost?.mean ?? 0),
      totalSaved: r0((base.stats.totalCost?.mean ?? 0) - (tobe.stats.totalCost?.mean ?? 0)),
    };
  }

  const top = base.bottlenecks?.[0];
  if (top) {
    const bU = base.stats.perTeam[top]?.utilization.mean ?? 0;
    const tU = tobe.stats.perTeam[top]?.utilization.mean ?? 0;
    const cap = base.teamCapacities?.[top];
    facts.bottleneck = {
      team: top, baseUtilPct: Math.round(bU * 100), tobeUtilPct: Math.round(tU * 100), relievedPts: Math.round((bU - tU) * 100),
      fteFreed: cap ? r1((bU - tU) * cap) : undefined,
    };
  }
  return facts;
}

/**
 * Deterministic "poor-man's" alternative to the AI assessment — a plain-English
 * comparison templated from the same computed facts. Used as the fallback when AI
 * is turned off for the org (ENT-05). Pure.
 */
export function summariseComparison(f: ComparisonFacts): string {
  const dir = (pct: number) => (pct > 2 ? "faster" : pct < -2 ? "slower" : "about the same");
  const signed = (pct: number) => `${pct >= 0 ? "+" : ""}${pct}%`;
  const out: string[] = [];
  out.push(`${f.tobeName} vs ${f.baseName} (${f.replications} replications):`);
  out.push(`- Typical time per case (p50): ${r0(f.flow.baseTypical)} → ${r0(f.flow.tobeTypical)} ${f.unit} (${Math.abs(f.flow.typicalPctFaster)}% ${dir(f.flow.typicalPctFaster)}).`);
  out.push(`- Near-worst per case (p95): ${r0(f.flow.baseNearWorst)} → ${r0(f.flow.tobeNearWorst)} ${f.unit} (${Math.abs(f.flow.nearWorstPctFaster)}% ${dir(f.flow.nearWorstPctFaster)}).`);
  out.push(`- Spread (sd): ${r0(f.flow.baseSpreadSd)} → ${r0(f.flow.tobeSpreadSd)} ${f.unit} — ${f.flow.tobeSpreadSd < f.flow.baseSpreadSd ? "more predictable" : f.flow.tobeSpreadSd > f.flow.baseSpreadSd ? "less predictable" : "unchanged"}.`);
  out.push(`- Throughput: ${r1(f.throughput.base)} → ${r1(f.throughput.tobe)} cases/${f.unit} (${signed(f.throughput.pctChange)}).`);
  if (f.cost) {
    const c = f.cost;
    out.push(`- Cost per case: ${r0(c.basePerCase)} → ${r0(c.tobePerCase)} (${c.pctCheaper >= 0 ? `${c.pctCheaper}% cheaper` : `${Math.abs(c.pctCheaper)}% dearer`}; ${c.totalSaved >= 0 ? "saves" : "adds"} ${Math.abs(r0(c.totalSaved))} total).`);
  }
  if (f.bottleneck) {
    const b = f.bottleneck;
    out.push(`- Bottleneck (${b.team}): ${r0(b.baseUtilPct)}% → ${r0(b.tobeUtilPct)}% utilisation (${b.relievedPts >= 0 ? "relieved" : "worsened"} ${Math.abs(r0(b.relievedPts))} pts${b.fteFreed != null ? `, ~${r1(b.fteFreed)} FTE freed` : ""}).`);
  }
  const verdict = f.flow.typicalPctFaster > 2 ? "an improvement on flow time" : f.flow.typicalPctFaster < -2 ? "a regression on flow time" : "roughly neutral on flow time";
  out.push(`Overall: ${f.tobeName} is ${verdict}${f.cost && f.cost.pctCheaper > 2 ? ` and cheaper per case` : ""}.`);
  out.push(``, `(Summary generated deterministically — enable AI for a narrated assessment.)`);
  return out.join("\n");
}

const ASSESS_SYSTEM = `You are a process-improvement analyst helping a business audience read a discrete-event simulation that compares two versions of the same process: a baseline ("as-is") and a proposed redesign ("to-be").

You are given a JSON object of ALREADY-COMPUTED figures. Write a SHORT assessment — 2 to 4 sentences, plain English, no bullet points, no headings — that explains not just WHAT changed but WHY. Good causal explanations: lower bottleneck utilisation means work stops queueing, so both the typical time and its variability fall; a tighter spread (sd) or smaller typical→near-worst gap means the process is more predictable; cheaper cost-per-case comes from moving work to a lower-cost resource; equal throughput means both versions clear the same demand, so the win is speed/cost/predictability, not volume.

STRICT RULES
- Use ONLY numbers present in the facts JSON. Never invent, recompute, or infer a figure that isn't there. You MAY round for readability ("about 4.5x faster", "~80% cheaper") and convert minutes to hours when it reads better.
- Vocabulary: "typical" = per-case p50; "near-worst" = per-case p95; "spread" = sd. These describe individual cases, not run averages.
- Be honest and specific. If throughput is essentially unchanged, say so and explain why. Don't oversell; if a metric barely moved, don't dwell on it.
- Refer to the two versions by their given names (baseName, tobeName).
- Output plain prose only. No preamble like "Here is". Start directly with the assessment.`;

export type SimAssessmentResult =
  | { ok: true; assessment: string; model: string }
  | { ok: false; status: number; error: string };

export async function generateSimAssessment(args: { apiKey: string; facts: ComparisonFacts }, redactor?: Redactor): Promise<SimAssessmentResult> {
  const model = await getAiGenerateModel();
  const client = makeAiClient(model, args.apiKey);
  // ENT-06: pseudonymise scenario/team names in the facts JSON before egress,
  // restore them in the reply. redactor is undefined (no-op) unless the org opts in.
  const payload = JSON.stringify(args.facts, null, 2);
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 512,
      system: ASSESS_SYSTEM,
      messages: [{ role: "user", content: redactor ? redactor.redact(payload) : payload }],
    });
    const block = message.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { ok: false, status: 500, error: "No response from AI" };
    return { ok: true, assessment: redactor ? redactor.restore(block.text.trim()) : block.text.trim(), model };
  } catch (err) {
    return { ok: false, status: 500, error: `Assessment failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

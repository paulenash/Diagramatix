/**
 * Grounded AI assessment of an As-is → To-be comparison. We compute every figure
 * deterministically here (buildComparisonFacts) and hand the model ONLY those
 * numbers, so the prose is natural but can never invent or misstate a statistic.
 *
 * Keep the Anthropic-facing logic here so the API route stays thin (mirrors
 * staffNarrative.ts).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { RunMetrics } from "./results";

const ASSESS_MODEL = "claude-opus-4-8";

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

export async function generateSimAssessment(args: { apiKey: string; facts: ComparisonFacts }): Promise<SimAssessmentResult> {
  const client = new Anthropic({ apiKey: args.apiKey });
  try {
    const message = await client.messages.create({
      model: ASSESS_MODEL,
      max_tokens: 512,
      system: ASSESS_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(args.facts, null, 2) }],
    });
    const block = message.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { ok: false, status: 500, error: "No response from AI" };
    return { ok: true, assessment: block.text.trim(), model: ASSESS_MODEL };
  } catch (err) {
    return { ok: false, status: 500, error: `Assessment failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

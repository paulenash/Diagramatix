/**
 * Grounded narration of "what to try next".
 *
 * Follows this folder's pattern exactly: `nextSteps.ts` computes every figure and
 * every suggestion deterministically, `buildNextStepsFacts` reduces that to a
 * small facts object, and the model is handed ONLY that. It writes the prose and
 * the ordering of the paragraphs; it cannot introduce a lever, a number, or a
 * recommendation that the arithmetic did not produce.
 *
 * That constraint is the point of the feature. The model must never be shown raw
 * runs and asked to spot the pattern — it would find one whether or not it
 * exists, and this output is meant to survive a finance director reading it.
 */
import { makeAiClient } from "@/app/lib/ai/anthropicClient";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import type { Redactor } from "@/app/lib/ai/redaction";
import type { NextStepsReport, SuggestionKind } from "../nextSteps";

/** One suggestion, flattened to the fields the model may speak about. */
export interface SuggestionFact {
  rank: number;
  kind: SuggestionKind;
  title: string;
  evidence: string;
  /** Present only when the suggestion is actionable. */
  createsScenario?: string;
}

export interface NextStepsFacts {
  studyName: string;
  unit: string;
  /** Scenarios with a completed run — what the analysis is based on. */
  observations: number;
  /** Levers that have been varied at all, with the values tried. */
  leversTried: { name: string; values: number[] }[];
  /** Levers visible in the model that no scenario has ever set. */
  leversUntouched: string[];
  suggestions: SuggestionFact[];
}

export function buildNextStepsFacts(report: NextStepsReport, studyName: string): NextStepsFacts {
  return {
    studyName,
    unit: report.clockUnit,
    observations: report.observations,
    leversTried: report.levers
      .filter((h) => h.values.length > 0)
      .map((h) => ({ name: h.lever.label, values: h.values })),
    leversUntouched: report.levers.filter((h) => h.values.length === 0).map((h) => h.lever.label),
    suggestions: report.suggestions.map((s, i) => ({
      rank: i + 1,
      kind: s.kind,
      title: s.title,
      evidence: s.evidence,
      ...(s.scenarioName ? { createsScenario: s.scenarioName } : {}),
    })),
  };
}

/**
 * Deterministic rendering of the same facts — the fallback when AI is off for the
 * org, and the reference the AI version is checked against. Pure.
 */
export function summariseNextSteps(f: NextStepsFacts): string {
  const out: string[] = [];
  out.push(`Based on ${f.observations} scenarios that have been run:`);
  out.push("");
  for (const s of f.suggestions) {
    out.push(`${s.rank}. ${s.title}`);
    out.push(`   ${s.evidence}`);
    if (s.createsScenario) out.push(`   Creates the scenario "${s.createsScenario}".`);
  }
  if (f.suggestions.length === 0) {
    out.push("Nothing stands out. Every lever that has been varied moved the result, and no team has been left unexamined.");
  }
  if (f.leversUntouched.length > 0) {
    out.push("");
    out.push(`Never varied: ${f.leversUntouched.join(", ")}.`);
  }
  out.push("");
  out.push("(Written deterministically from the run history — enable AI for a narrated version.)");
  return out.join("\n");
}

const SYSTEM = `You are a process-improvement analyst helping someone decide what to test next in a discrete-event simulation of their process.

You are given a JSON object of ALREADY-COMPUTED findings: which levers have been varied and to what values, which have never been touched, and a ranked list of suggestions each with the evidence that produced it.

Write a SHORT briefing — 2 to 5 sentences, or up to 5 short "- " bullet lines, plain English — telling them what to try next and why.

STRICT RULES
- Use ONLY the levers, values, numbers and suggestions present in the facts JSON. Never invent a lever, a figure, a team, or a recommendation that is not there. You MAY round for readability.
- Keep the given ranking. The first suggestion is the most strongly evidenced; lead with it.
- The evidence strings are the justification — restate them naturally, do not embellish them. If a suggestion says a lever made no measurable difference, say exactly that; a negative result is useful and must not be softened into a maybe.
- Do not speculate about causes the facts do not state. Do not suggest anything not in the list.
- Output plain text: short paragraphs or simple '- ' bullet lines only. No markdown headings, no bold, no preamble like "Here is". Start directly.`;

export type NextStepsAiResult =
  | { ok: true; narrative: string; model: string }
  | { ok: false; status: number; error: string };

export async function generateNextStepsNarrative(
  args: { apiKey: string; facts: NextStepsFacts },
  redactor?: Redactor,
): Promise<NextStepsAiResult> {
  const model = await getAiGenerateModel();
  const client = makeAiClient(model, args.apiKey);
  const payload = JSON.stringify(args.facts, null, 2);
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: redactor ? redactor.redact(payload) : payload }],
    });
    const block = message.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { ok: false, status: 500, error: "No response from AI" };
    return { ok: true, narrative: redactor ? redactor.restore(block.text.trim()) : block.text.trim(), model };
  } catch (err) {
    return { ok: false, status: 500, error: `Next-steps narration failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

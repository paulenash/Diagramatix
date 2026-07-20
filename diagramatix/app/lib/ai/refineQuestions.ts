/**
 * "Refine" — AI-generated clarifying questions for a BPMN generation prompt.
 *
 * Reads the user's current prompt (which may already contain a CLARIFICATIONS
 * block from a previous Refine round) and returns a small set of the highest-
 * impact questions about information a BPMN process needs but the prompt is
 * missing. The client renders these as radio (single) / checkbox (multi)
 * questions; the answers are appended back to the prompt (see
 * app/lib/diagram/clarifications.ts `appendRefinements`) BEFORE Plan is pressed.
 *
 * This never touches the diagram — it only produces questions. Model + metering
 * are the caller's responsibility (see /api/ai/bpmn/refine-questions).
 */
import Anthropic from "@anthropic-ai/sdk";
import { makeAnthropic } from "@/app/lib/ai/anthropicClient";

export interface RefineQuestion {
  /** Short crisp label used for the appended prompt line, e.g. "Process initiator". */
  label: string;
  /** The question shown to the user. */
  question: string;
  /** "single" → radio (mutually exclusive); "multi" → checkboxes. */
  type: "single" | "multi";
  /** 2–5 concrete options. The UI always adds its own Other/Skip valves. */
  options: string[];
}

export type RefineQuestionsResult =
  | { ok: true; questions: RefineQuestion[]; model: string }
  | { ok: false; status: number; error: string; raw?: string };

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_QUESTIONS = 6;

/**
 * The BPMN structural dimensions a good process description needs. The generator
 * checks which are under-specified and asks about the biggest gaps first. Kept
 * here as the single tunable list (candidate to externalise into a DiagramRules
 * entry later — see the refine plan's open items).
 */
export const BPMN_REFINE_DIMENSIONS = `A complete BPMN process description should establish:
- Participants / pools (the organisations or black-box systems involved).
- Roles / lanes (who performs each step — job functions, never individuals).
- The start trigger (what kicks the process off: a request, a timer, a message, an event).
- The key activities / steps in order.
- Decision points (gateways) — the conditions that branch the flow.
- Exception / error handling (what happens when a step fails or is rejected).
- External systems and the message flows / hand-offs between participants.
- The end state(s) — how the process concludes (success and failure outcomes).`;

function buildSystemPrompt(dimensions: string, rules: string): string {
  return `You are a BPMN process-modelling analyst. Your job is NOT to draw a diagram — it is to interview the author to gather the missing information a BPMN process needs, by asking a few sharp multiple-choice questions.

${dimensions}

${rules ? `USER RULES AND PREFERENCES (respect these when framing questions):\n${rules}\n\n` : ""}INSTRUCTIONS:
- Read the author's prompt below. It MAY already contain a "CLARIFICATIONS" block with answers from a previous round — treat anything already stated or answered as RESOLVED and never re-ask it.
- Identify the dimensions above that are still under-specified. Ask about the HIGHEST-IMPACT gaps first.
- Ask at most ${MAX_QUESTIONS} questions. If the prompt is already well-specified and nothing important is missing, return an EMPTY questions array.
- Each question is either "single" (mutually exclusive → radio) or "multi" (several may apply → checkbox). Give 2–5 concrete, plausible options drawn from the domain of the prompt. Do NOT include "Other", "None", "Skip" or "Not sure" options — the UI adds those automatically.
- Give each question a short "label" (2–4 words) suitable as a form-field caption, e.g. "Process initiator", "Rejection path", "Systems involved".
- Questions must be answerable by a business user, specific to THIS process (not generic BPMN theory).

Return ONLY a JSON object of this exact shape, nothing else:
{"questions":[{"label":"Process initiator","question":"Who starts this process?","type":"single","options":["Customer","Sales rep","Automated schedule"]}]}
If nothing needs asking: {"questions":[]}`;
}

function isValidQuestion(q: unknown): q is RefineQuestion {
  if (!q || typeof q !== "object") return false;
  const r = q as Record<string, unknown>;
  return typeof r.label === "string" && r.label.trim().length > 0
    && typeof r.question === "string" && r.question.trim().length > 0
    && (r.type === "single" || r.type === "multi")
    && Array.isArray(r.options) && r.options.every((o) => typeof o === "string")
    && r.options.filter((o) => (o as string).trim().length > 0).length >= 2;
}

/**
 * Parse a model's raw text response into validated questions. Tolerant of
 * markdown fences and prose around the JSON; drops malformed questions and caps
 * the count. Returns [] on unparseable/missing output (the caller treats an
 * empty result as "nothing to ask / safe no-op"). Pure — unit-testable.
 */
export function parseRefineQuestions(text: string): RefineQuestion[] {
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }
  const rawQuestions = (parsed as { questions?: unknown })?.questions;
  if (!Array.isArray(rawQuestions)) return [];
  return rawQuestions
    .filter(isValidQuestion)
    .map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter((o) => o.length > 0) }))
    .slice(0, MAX_QUESTIONS);
}

export async function refineQuestions(opts: {
  apiKey: string;
  prompt: string;
  rules: string;
  model?: string;
  dimensions?: string;
}): Promise<RefineQuestionsResult> {
  const { apiKey, prompt, rules, model = DEFAULT_MODEL, dimensions = BPMN_REFINE_DIMENSIONS } = opts;
  const client = makeAnthropic(apiKey);
  const systemPrompt = buildSystemPrompt(dimensions, rules);

  let message: Anthropic.Messages.Message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: prompt.trim() +
          "\n\nReturn ONLY the JSON object. No prose, no preamble, no markdown fences. " +
          "Your entire response MUST start with `{` and end with `}`.",
      }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `AI request failed: ${msg}` };
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { ok: false, status: 500, error: "No response from AI" };
  }

  // Tolerant parse → validated, capped questions. An empty result is valid
  // ("nothing to ask" / unparseable) and the caller treats it as a safe no-op.
  const questions = parseRefineQuestions(textBlock.text);
  return { ok: true, questions, model };
}

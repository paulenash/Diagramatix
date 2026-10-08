/**
 * The questions asked BEFORE a Process Repository process prompt is written (Paul, 2026-10-08).
 *
 * The Diagramatix BPMN prompt skill interviews its author before it drafts: up to six questions, the gaps that would change the diagram,
 * then a draft. The Repository wrote a prompt from the chain narrative in one shot, with no say for the person asking. This brings the two
 * into line: when prompts are written for a Repository process, up to MAX_PROMPT_QUESTIONS questions are put first, and the answers go to the
 * generator with the narrative. The person can still use Refine Prompt in AI Generate afterwards.
 *
 * HOW THE QUESTIONS ARE CHOSEN. A fixed CORE list — so entity alignment, task detail and exception handling are never skipped — and ONE small
 * AI call that reads the narrative and (a) strikes the core questions the narrative already answers outright and (b) adds questions specific to
 * THIS process with options drawn from it. If the call fails or returns rubbish the core list stands, so asking never depends on the AI.
 *
 * The question shape is the Refine one (RefineQuestion), so the same dialog renders them.
 */
import { makeAiClient } from "@/app/lib/ai/anthropicClient";
import { isValidQuestion, type RefineQuestion } from "@/app/lib/ai/refineQuestions";

export const MAX_PROMPT_QUESTIONS = 10;

export interface CoreQuestion extends RefineQuestion { id: string }

/** The entity-alignment answer that asks for the organisation's own names; the route reads it to load them. */
export const ENTITY_ALIGN_LISTS = "Use the names in our Entity Lists wherever one matches (organisation units, roles, systems)";

export const CORE_QUESTIONS: CoreQuestion[] = [
  {
    id: "entity-alignment", label: "Entity alignment", type: "single",
    question: "How should the process line up with your organisation's own names?",
    options: [
      ENTITY_ALIGN_LISTS,
      "Use the roles and systems exactly as the narrative names them",
      "Use generic role names only (no organisation-specific names)",
    ],
  },
  {
    id: "task-detail", label: "Task detail", type: "single",
    question: "How detailed should the tasks be?",
    options: [
      "High level — one task per major step (about 5–8)",
      "Standard — one task per distinct piece of work (about 10–20)",
      "Detailed — every check, hand-off and system update (20 or more)",
    ],
  },
  {
    id: "exception-handling", label: "Exception handling", type: "single",
    question: "How much exception handling should be shown?",
    options: [
      "None — the normal path only",
      "Key exceptions — rejections and missing information",
      "Full — rejections, deadlines with escalation, and system failures",
    ],
  },
  {
    id: "pools-lanes", label: "Pools and lanes", type: "single",
    question: "Which parties should be separate pools rather than lanes?",
    options: [
      "External parties and IT systems as pools; internal teams as lanes",
      "Every named party as its own pool",
      "One pool with lanes only (no external pools)",
    ],
  },
  {
    id: "decisions", label: "Decisions", type: "single",
    question: "How should decisions be shown?",
    options: [
      "A decision wherever the narrative states a rule or a condition",
      "Fewer decisions — only the main ones, with the detail in the task names",
      "Every approval, check and eligibility test as a decision",
    ],
  },
  {
    id: "systems", label: "IT systems", type: "single",
    question: "How should IT systems appear?",
    options: [
      "Every system the narrative mentions, as a pool with message flows",
      "Only the principal systems",
      "Not drawn — mention them in the task names",
    ],
  },
  {
    id: "timing", label: "Waits and deadlines", type: "single",
    question: "How should waiting and deadlines be modelled?",
    options: [
      "Timers with an escalation wherever the narrative states a deadline",
      "Waits only — no timeouts",
      "Leave timing out",
    ],
  },
  {
    id: "endings", label: "How it ends", type: "single",
    question: "How should the process end?",
    options: [
      "One End event for each distinct outcome (completed, rejected, abandoned)",
      "One End event for success; failures stop the process",
      "A single End event handing over to the next process",
    ],
  },
];

export interface PromptQuestionSet {
  questions: RefineQuestion[];
  /** Core questions the narrative already answers outright — struck from the list, shown so the person knows why they were not asked. */
  alreadyAnswered: { label: string; answer: string }[];
  /** "ai" when the tailoring call ran; "core" when the fixed list stands on its own. */
  source: "ai" | "core";
}

interface Tailoring { resolved: { id: string; answer: string }[]; extra: RefineQuestion[] }

/** Parse the model's reply. Tolerant of fences and prose; anything malformed is dropped, never thrown. Pure. */
export function parseTailoring(text: string): Tailoring {
  let s = (text ?? "").trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  let parsed: unknown;
  try { parsed = JSON.parse(s); } catch { return { resolved: [], extra: [] }; }
  const o = (parsed && typeof parsed === "object" ? parsed : {}) as { resolved?: unknown; extra?: unknown };
  const ids = new Set(CORE_QUESTIONS.map((q) => q.id));
  const resolved = (Array.isArray(o.resolved) ? o.resolved : [])
    .filter((r): r is { id: string; answer: string } =>
      !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string" && ids.has((r as { id: string }).id)
      && typeof (r as { answer?: unknown }).answer === "string" && (r as { answer: string }).answer.trim().length > 0)
    .map((r) => ({ id: r.id, answer: r.answer.trim() }));
  const extra = (Array.isArray(o.extra) ? o.extra : [])
    .filter(isValidQuestion)
    .map((q) => ({ ...q, options: q.options.map((x) => x.trim()).filter((x) => x.length > 0) }));
  return { resolved, extra };
}

/** Core minus what the narrative answered, plus the tailored extras, capped at `max`. Pure. */
export function mergeQuestions(t: Tailoring, max = MAX_PROMPT_QUESTIONS): PromptQuestionSet {
  const done = new Map(t.resolved.map((r) => [r.id, r.answer] as const));
  const core: RefineQuestion[] = CORE_QUESTIONS.filter((q) => !done.has(q.id)).map(({ id: _id, ...q }) => q);
  const labels = new Set(core.map((q) => q.label.toLowerCase()));
  const extra = t.extra.filter((q) => !labels.has(q.label.toLowerCase()));
  return {
    questions: [...core, ...extra].slice(0, max),
    alreadyAnswered: CORE_QUESTIONS.filter((q) => done.has(q.id)).map((q) => ({ label: q.label, answer: done.get(q.id)! })),
    source: t.resolved.length > 0 || t.extra.length > 0 ? "ai" : "core",
  };
}

/** The fixed list on its own — what is asked when the AI call is not made or fails. */
export const coreQuestionSet = (): PromptQuestionSet => mergeQuestions({ resolved: [], extra: [] });

function systemPrompt(max: number): string {
  const core = CORE_QUESTIONS.map((q) => `- ${q.id}: ${q.question}`).join("\n");
  return `You help author a BPMN process prompt for a business process. You will be given the process's narrative. Some questions are ALWAYS asked of the author; your job is to trim and sharpen that list for THIS process.

THE CORE QUESTIONS:
${core}

1. "resolved": list a core question ONLY when the narrative states the answer outright and unambiguously (for example it says the process is a high-level summary, or names the exact deadline and escalation). Give its id and the answer in the author's terms, one short sentence. When in doubt leave it out — it will simply be asked.
2. "extra": add questions specific to THIS process that the narrative leaves open and that would change the diagram (which of several approval routes applies, whether a named system is in scope, who may override a decision, what happens on a rejection). Each has a short "label" (2–4 words), a "question", a "type" ("single" or "multi") and 2–5 concrete "options" drawn from this process. Never repeat a core question. Business language only.
3. Keep the total at ${max} or fewer: core questions NOT resolved + extras.

Return ONLY a JSON object of this exact shape, nothing else:
{"resolved":[{"id":"task-detail","answer":"Detailed — the narrative lists every check"}],"extra":[{"label":"Approval route","question":"Who approves a claim over the limit?","type":"single","options":["Line manager","Finance manager"]}]}
If nothing applies: {"resolved":[],"extra":[]}`;
}

const NARRATIVE_CAP = 14_000;
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Choose the questions for one process. Never throws; falls back to the core list. */
export async function choosePromptQuestions(args: {
  apiKey: string; processTitle: string; narrative: string; model?: string;
  /** Test seam: replaces the model call. Returns the model's raw text. */
  complete?: (system: string, user: string) => Promise<string>;
}): Promise<PromptQuestionSet> {
  const { apiKey, processTitle, narrative, model = DEFAULT_MODEL } = args;
  if (!narrative.trim()) return coreQuestionSet();
  const user = `PROCESS: ${processTitle}\n\nNARRATIVE:\n${narrative.slice(0, NARRATIVE_CAP)}\n\nReturn ONLY the JSON object. No prose, no markdown fences.`;
  try {
    const text = args.complete
      ? await args.complete(systemPrompt(MAX_PROMPT_QUESTIONS), user)
      : await (async () => {
        const msg = await makeAiClient(model, apiKey).messages.create({
          model, max_tokens: 2048, system: systemPrompt(MAX_PROMPT_QUESTIONS), messages: [{ role: "user", content: user }],
        });
        const block = msg.content.find((b) => b.type === "text");
        return block && block.type === "text" ? block.text : "";
      })();
    return mergeQuestions(parseTailoring(text));
  } catch {
    return coreQuestionSet();
  }
}

/**
 * The answers as the generator receives them. Skipped questions (empty answers) are left out. An empty string means there was nothing to say.
 */
export function answersBlock(items: { label: string; answer: string }[]): string {
  const lines = items.filter((x) => (x.answer ?? "").trim().length > 0).map((x) => `- ${x.label.trim()}: ${x.answer.trim()}`);
  if (lines.length === 0) return "";
  return [
    "THE AUTHOR'S ANSWERS TO CLARIFYING QUESTIONS — apply these when you write the prompt. They take precedence over the defaults in your",
    "instructions wherever they differ (but never over the rules about what can be drawn). Do not quote them in the prompt.",
    ...lines,
  ].join("\n");
}

/** Did the author ask for the organisation's own entity names? (The route then loads them for the generator.) */
export const wantsEntityNames = (items: { label: string; answer: string }[]): boolean =>
  items.some((x) => /^entity alignment$/i.test(x.label.trim()) && x.answer.trim() === ENTITY_ALIGN_LISTS);

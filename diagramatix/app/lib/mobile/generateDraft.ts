/**
 * What the phone's Generate sheet is holding before it is sent (2026-09-28,
 * mobile voice stage 1), and how that becomes the prompt the server job runs.
 * Pure, so the rules are tested without a phone.
 */
import { appendClarifications } from "@/app/lib/diagram/clarifications";
import { hasSpokenPreamble, stripSpokenPreamble, withSpokenPreamble } from "@/app/lib/ai/promptPreambles";

export interface SavedPromptPick { id: string; name: string; text: string }

export interface GenerateDraft {
  /** The description, as the person sees and edits it. */
  prompt: string;
  /** Any of it was spoken (not just typed or picked). */
  dictated: boolean;
  /** The saved prompt it was started from, if any. */
  selected: SavedPromptPick | null;
  /** Tidy's open questions, with whatever answers were given. */
  questions: { q: string; a: string }[];
}

export const EMPTY_DRAFT: GenerateDraft = { prompt: "", dictated: false, selected: null, questions: [] };

/** Add a spoken phrase to what is already there, with one space between. */
export function joinSpoken(prev: string, text: string): string {
  const t = text.trim();
  if (!t) return prev;
  return prev && !/\s$/.test(prev) ? `${prev} ${t}` : prev + t;
}

/** Where spoken words go: the description, or the answer to question i. */
export type SpokenTarget = "prompt" | number;

/** The draft with spoken words added where they were said. */
export function addSpokenTo(draft: GenerateDraft, target: SpokenTarget, text: string): GenerateDraft {
  return target === "prompt"
    ? { ...draft, prompt: joinSpoken(draft.prompt, text), dictated: true }
    : { ...draft, questions: draft.questions.map((x, i) => (i === target ? { ...x, a: joinSpoken(x.a, text) } : x)) };
}

/**
 * The description with any answered questions on the end, as the consoles'
 * CLARIFICATIONS block — what is sent to the job, and to a second Tidy (so a
 * re-tidy folds the answers in rather than asking the same questions again).
 */
export function withAnswers(draft: GenerateDraft): string {
  const text = draft.prompt.trim();
  if (!draft.questions.some((x) => x.a.trim())) return text;
  return appendClarifications(text, {
    questions: draft.questions.map((x) => ({ q: x.q, a: x.a.trim() || undefined })),
    createdAt: new Date(0).toISOString(),
  });
}

export interface GenerateRequestBody {
  prompt: string;
  promptSource: "dictated" | "typed";
  selectedPromptId?: string;
}

/**
 * The request the job is started with:
 *   • answered questions go on the end as the consoles' CLARIFICATIONS block;
 *   • spoken words get the one-speaker note in front, so one person is not
 *     read as one lane — unless it is a saved prompt, unchanged, which is
 *     linked as it is;
 *   • the saved prompt's id goes along; the server decides whether it still
 *     matches.
 */
export function draftToRequest(draft: GenerateDraft): GenerateRequestBody {
  let text = withAnswers(draft);
  const unchangedSaved = !!draft.selected && draft.selected.text.trim() === text;
  if (text && draft.dictated && !unchangedSaved) text = withSpokenPreamble(text);
  return {
    prompt: text,
    promptSource: draft.dictated ? "dictated" : "typed",
    ...(draft.selected ? { selectedPromptId: draft.selected.id } : {}),
  };
}

/** A failed run's prompt, put back in the sheet for another go — without the note. */
export function draftFromFailedJob(promptText: string): GenerateDraft {
  return { ...EMPTY_DRAFT, prompt: stripSpokenPreamble(promptText), dictated: hasSpokenPreamble(promptText) };
}

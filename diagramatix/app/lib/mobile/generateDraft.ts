/**
 * What the phone's Generate sheet is holding before it is sent (2026-09-28,
 * mobile voice stage 1), and how that becomes the prompt the server job runs.
 * Pure, so the rules are tested without a phone.
 */
import { appendClarifications } from "@/app/lib/diagram/clarifications";
import { hasSpokenPreamble, photoNoteParts, stripSpokenPreamble, withPhotoNote, withSpokenPreamble } from "@/app/lib/ai/promptPreambles";

export interface SavedPromptPick { id: string; name: string; text: string }

/** A photographed whiteboard (stage 2): shrunk on the phone, then kept in the diagram's store. */
export interface DraftPhoto {
  /** The phone-shrunk JPEG. Absent for a photo restored from a failed run — that one is already kept. */
  blob?: Blob;
  /** Its id in the source-image store, once kept — a retry never sends it again. */
  storedId?: string;
  name: string;
  /** Its size as sent (0 when restored — not needed then). */
  width: number;
  height: number;
}

export interface GenerateDraft {
  /** The description, as the person sees and edits it. */
  prompt: string;
  /** Any of it was spoken (not just typed or picked). */
  dictated: boolean;
  /** The saved prompt it was started from, if any. */
  selected: SavedPromptPick | null;
  /** Tidy's open questions, with whatever answers were given. */
  questions: { q: string; a: string }[];
  /** A photo of a whiteboard; the words then CORRECT it. */
  photo: DraftPhoto | null;
  /** With a photo: reproduce its layout (Free Form) rather than lay the process out afresh. Off unless asked for. */
  freeForm?: boolean;
}

export const EMPTY_DRAFT: GenerateDraft = { prompt: "", dictated: false, selected: null, questions: [], photo: null };

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
  /** Absent for a photo with no words. */
  promptSource?: "dictated" | "typed";
  selectedPromptId?: string;
  /** Only with a photo, and only when asked for. */
  freeForm?: true;
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
  // A photo: the photo note, then the person's words under the corrections
  // heading — they win over the photo. No spoken-description note (the photo is
  // the description) and never a saved prompt.
  if (draft.photo) {
    const words = withAnswers(draft);
    return {
      prompt: withPhotoNote(draft.photo.name, words),
      ...(words ? { promptSource: draft.dictated ? "dictated" as const : "typed" as const } : {}),
      ...(draft.freeForm ? { freeForm: true as const } : {}),
    };
  }
  let text = withAnswers(draft);
  const unchangedSaved = !!draft.selected && draft.selected.text.trim() === text;
  if (text && draft.dictated && !unchangedSaved) text = withSpokenPreamble(text);
  return {
    prompt: text,
    promptSource: draft.dictated ? "dictated" : "typed",
    ...(draft.selected ? { selectedPromptId: draft.selected.id } : {}),
  };
}

/**
 * A failed run's prompt, put back in the sheet for another go — without the
 * note, and linked again to the saved prompt it was started from (when that is
 * still the caller's; the server looks it up).
 */
export function draftFromFailedJob(promptText: string, selected?: SavedPromptPick | null): GenerateDraft {
  // Sent unchanged: back exactly as it was picked (its own words, note and all),
  // so the sheet does not call it "changed".
  if (selected && selected.text.trim() === promptText.trim()) return { ...EMPTY_DRAFT, prompt: selected.text, dictated: false, selected };
  return { ...EMPTY_DRAFT, prompt: stripSpokenPreamble(promptText), dictated: hasSpokenPreamble(promptText), selected: selected ?? null };
}

/**
 * A failed PHOTO run, put back: the photo (already kept — by its id) and the
 * person's own words, without the photo note. Anything else is left as it is.
 */
export function withRestoredPhoto(draft: GenerateDraft, job: { promptText: string; sourceImageId: string | null; freeForm?: boolean }): GenerateDraft {
  const parts = job.sourceImageId ? photoNoteParts(job.promptText) : null;
  if (!parts || !job.sourceImageId) return draft;
  return {
    ...EMPTY_DRAFT,
    prompt: parts.words,
    dictated: false,
    photo: { storedId: job.sourceImageId, name: parts.imageName || "Whiteboard photo.jpg", width: 0, height: 0 },
    ...(job.freeForm ? { freeForm: true } : {}),
  };
}

/** The words a person has said or typed, kept for the moment the camera takes the screen (the page may be reloaded meanwhile). */
export function draftWordsForStorage(draft: GenerateDraft): string {
  return JSON.stringify({ prompt: draft.prompt, dictated: draft.dictated, questions: draft.questions });
}

export function draftWordsFromStorage(raw: string | null): Pick<GenerateDraft, "prompt" | "dictated" | "questions"> | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { prompt?: unknown; dictated?: unknown; questions?: unknown };
    if (typeof j.prompt !== "string") return null;
    const questions = Array.isArray(j.questions)
      ? j.questions.filter((x): x is { q: string; a: string } => !!x && typeof (x as { q?: unknown }).q === "string" && typeof (x as { a?: unknown }).a === "string")
      : [];
    return { prompt: j.prompt, dictated: j.dictated === true, questions };
  } catch { return null; }
}

/**
 * At Generate: the draft's photo is already kept (reuse its id), still to
 * upload, missing (restored without its bytes and without an id — cannot be
 * sent), or there is none.
 */
export function photoToUpload(draft: GenerateDraft): "none" | "reuse" | "upload" | "missing" {
  if (!draft.photo) return "none";
  if (draft.photo.storedId) return "reuse";
  return draft.photo.blob ? "upload" : "missing";
}

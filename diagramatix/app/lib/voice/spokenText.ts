/**
 * Turning written text into something worth hearing.
 *
 * Two jobs, deliberately separate:
 *   • `speechTransform` — the cleanup every spoken string gets, wherever it came
 *     from (a Voice Assist log line, an element's label in Animate, a narrative).
 *   • `spokenText` — that cleanup behind the verbosity gate, for log lines.
 *
 * They are split because Animate narrates bare labels, which the verbosity gate
 * would silence as "not a question and not a refusal". One transform, two
 * callers, rather than a second copy that drifts.
 */

export type SpeechVerbosity = "off" | "questions" | "problems" | "everything";

/**
 * An element id must never be read out — "moved 123e4567-e89b…" is not a
 * sentence. Ids reach the log when a command names an element the user has not
 * labelled, and they are dropped rather than spelled.
 */
function looksLikeElementId(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-z-]+)?$/i.test(s.trim());
}

/**
 * Quotation marks are punctuation for the eye; the voice does not need them, and
 * Deepgram reads a stray one as a pause. Apostrophes STAY — stripping them turns
 * "can't" into "cant", which is both wrong and audibly wrong.
 */
function removeQuoteMarks(s: string): string {
  return s.replace(/["“”‘’]/g, (m) => (m === "‘" || m === "’" ? "'" : ""));
}

const DIGIT_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
  "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
};

/**
 * A lone digit is spoken as a word. This matters for the numbered picker —
 * "say 1 or 2" read as digits comes out clipped, where "say one or two" is what
 * a person would say. Multi-digit numbers are left alone: Deepgram reads "2026"
 * better than any naive expansion would.
 */
function readSingleDigits(s: string): string {
  return s.replace(/\b(\d)\b/g, (d) => DIGIT_WORDS[d] ?? d);
}

function dropElementIds(s: string): string {
  return s.split(/\s+/).filter((w) => !looksLikeElementId(w)).join(" ");
}

/** The cleanup every spoken string gets. Pure. */
export function speechTransform(text: string): string {
  let out = removeQuoteMarks(text.trim());
  out = out.replace(/→/g, " to ");   // → reads as the word
  out = dropElementIds(out);
  out = readSingleDigits(out);
  return out.replace(/\s+/g, " ").trim();
}

/** A line that needs an answer. */
function isQuestion(s: string): boolean {
  return s.includes("?");
}

/**
 * A line saying the command did not happen. These are the ones worth hearing
 * even when successes are silent: the user's eyes are on the canvas, and nothing
 * moved, so without the voice there is no signal at all.
 */
function isRefusal(s: string): boolean {
  return /^(no\b|not\b|can'?t\b|cannot\b|won'?t\b|unable\b|there (is|are|was|were)\b|nothing\b)/i.test(s.trim());
}

/**
 * A log line as it should be spoken, or "" when this line stays silent.
 *
 * @param verbosity off → silent; questions → only what needs an answer;
 *   problems → that plus refusals (the default); everything → successes too.
 */
export function spokenText(text: string, verbosity: SpeechVerbosity): string {
  if (verbosity === "off") return "";

  const trimmed = text.trim();
  if (verbosity === "questions" && !isQuestion(trimmed)) return "";
  if (verbosity === "problems" && !isQuestion(trimmed) && !isRefusal(trimmed)) return "";

  return speechTransform(trimmed);
}

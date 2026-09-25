/**
 * Transform a log line or message into speech-friendly text.
 *
 * Pure function, tested. Handles:
 * - Quote removal and normalization
 * - Arrow → becomes "to"
 * - Never element ids (drops them)
 * - Number reading (one, two, etc. for digits)
 * - Verbosity filtering (off / questions / questions+problems / everything)
 */

export type SpeechVerbosity = "off" | "questions" | "problems" | "everything";

/**
 * Check if text looks like an element id (UUID, UUID:role, etc.),
 * so it can be dropped rather than read aloud.
 */
function looksLikeElementId(s: string): boolean {
  // UUID format: 8-4-4-4-12 hex digits. Optionally followed by :role.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-z]+)?$/i.test(s.trim());
}

/**
 * Normalize quotes: curly quotes → straight, remove them for speech.
 */
function normalizeQuotes(s: string): string {
  return s.replace(/[""]/g, '"').replace(/['']/g, "'");
}

/**
 * Read a number naturally: "1" → "one", "2" → "two", etc.
 * Multi-digit numbers stay as-is for now (future: "21" → "twenty-one").
 */
const DIGIT_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
  "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
};

function readNumbers(s: string): string {
  return s.replace(/\b(\d)\b/g, (match) => DIGIT_WORDS[match] ?? match);
}

/**
 * Drop element ids (UUIDs) and other noise, then collapse whitespace.
 */
function dropElementIds(s: string): string {
  const words = s.split(/\s+/).filter(w => !looksLikeElementId(w));
  return words.join(" ").trim();
}

/**
 * Transform a log line into speech text.
 *
 * @param text the log line or message
 * @param verbosity "off" → empty string; "questions" → only picker/confirm/question lines;
 *                  "problems" → questions + refusals; "everything" → all lines.
 * @returns speech text, empty if this line should not be spoken
 */
export function spokenText(text: string, verbosity: SpeechVerbosity): string {
  if (verbosity === "off") return "";

  // Determine if this line should be spoken based on verbosity.
  const trimmed = text.trim();

  // Question markers: "?" usually means a question that needs an answer.
  const isQuestion = trimmed.includes("?");
  // Refusal markers: "no ", "can't ", "won't", "unable", etc.
  const isRefusal = /^(no |can't |won't |unable|there|nothing)/i.test(trimmed);
  // Success: something got done, no uncertainty.
  const isSuccess = !isQuestion && !isRefusal && (trimmed.startsWith("✓") || trimmed.startsWith("added") || trimmed.startsWith("put") || trimmed.startsWith("moved"));

  // Apply verbosity filter.
  if (verbosity === "questions" && !isQuestion) return "";
  if (verbosity === "problems" && !isQuestion && !isRefusal) return "";
  if (verbosity === "everything") {
    // All lines go through.
  }

  // Transform the text.
  let result = normalizeQuotes(trimmed);
  result = result.replace(/→/g, " to ");
  result = dropElementIds(result);
  result = readNumbers(result);
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

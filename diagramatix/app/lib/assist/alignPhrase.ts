/**
 * M7 (the align half) — "align these", said out loud.
 *
 * The reducer has done this all along: `ALIGN_ELEMENTS` with seven modes,
 * driven by the Alignment ▾ menu. The plan's note that "no align/distribute
 * reducers exist today" was written before that landed and is stale — only the
 * *way to say it* was missing, which makes this the same shape as M3.
 *
 * WHAT IS AND IS NOT HERE. Aligning is one dispatch away, so it ships. The
 * other two thirds of M7 — "space these evenly" and "same size as this" — need
 * reducers that genuinely do not exist, and are deliberately left out rather
 * than approximated with a loop over `moveElements`: distributing badly is
 * worse than not distributing, because it looks done.
 *
 * THE AXIS WORDS ARE THE TRAP. "Align these horizontally" is ambiguous in
 * English and people mean both things by it: some mean "lay them out along a
 * horizontal line" (which moves them vertically, to a shared centre — the
 * menu's *Align Centres Horizontally*), others mean "move them horizontally".
 * Guessing would be a coin toss on every utterance, so a bare axis word is NOT
 * accepted; the unambiguous phrasings are ("align these in a row", "line these
 * up vertically", "align their left edges"), and anything else falls through to
 * the AI, which can ask.
 *
 * Pure.
 */

/** The reducer's modes. Kept in this order so the catalogue reads sensibly. */
export type AlignMode = "smart" | "center" | "vcenter" | "left" | "right" | "top" | "bottom";

export interface AlignMatch {
  mode: AlignMode;
  /** What to call it in the log line. */
  label: string;
}

/**
 * Phrase → mode. Longest match wins, so "left edges" beats "left".
 *
 * `center` is the menu's *Align Centres Horizontally*: the elements end up on
 * one horizontal line, which is what "in a row" means to everyone.
 */
const PHRASES: { re: RegExp; mode: AlignMode; label: string }[] = [
  // Smart — the menu's own default, and the right answer when no axis is named.
  { re: /^(?:up|nicely|properly|tidily)?$/, mode: "smart", label: "tidied up" },
  { re: /^(?:up\s+)?(?:smartly|automatically|the best way)$/, mode: "smart", label: "tidied up" },

  // One horizontal line — they share a vertical centre.
  { re: /^(?:up\s+)?(?:in\s+)?a?\s*row$/, mode: "center", label: "into a row" },
  { re: /^(?:up\s+)?horizontally\s+in\s+a\s+line$/, mode: "center", label: "into a row" },
  { re: /^(?:up\s+)?(?:on|along)\s+(?:one|a|the same)\s+(?:horizontal\s+)?line$/, mode: "center", label: "into a row" },
  { re: /^(?:up\s+)?(?:their\s+)?(?:horizontal\s+)?cent(?:re|er)s?\s+horizontally$/, mode: "center", label: "on their centres" },

  // One vertical line — they share a horizontal centre.
  { re: /^(?:up\s+)?(?:in\s+)?a?\s*column$/, mode: "vcenter", label: "into a column" },
  { re: /^(?:up\s+)?vertically\s+in\s+a\s+line$/, mode: "vcenter", label: "into a column" },
  { re: /^(?:up\s+)?(?:their\s+)?(?:vertical\s+)?cent(?:re|er)s?\s+vertically$/, mode: "vcenter", label: "on their centres" },

  // Edges — never ambiguous, because an edge has only one meaning.
  { re: /^(?:up\s+)?(?:on\s+)?(?:their\s+)?left(?:\s+edges?|\s+sides?)?$/, mode: "left", label: "on their left edges" },
  { re: /^(?:up\s+)?(?:on\s+)?(?:their\s+)?right(?:\s+edges?|\s+sides?)?$/, mode: "right", label: "on their right edges" },
  { re: /^(?:up\s+)?(?:on\s+)?(?:their\s+)?tops?(?:\s+edges?)?$/, mode: "top", label: "on their top edges" },
  { re: /^(?:up\s+)?(?:on\s+)?(?:their\s+)?bottoms?(?:\s+edges?)?$/, mode: "bottom", label: "on their bottom edges" },
];

/**
 * A bare axis word means different things to different people, so it is
 * refused rather than guessed. Reported separately from "no match" so the
 * caller can say why instead of falling silently through to the AI.
 */
const BARE_AXIS = /^(?:up\s+)?(?:horizontally|vertically|across|down)$/;

const norm = (s: string) =>
  s.toLowerCase().replace(/[.,!?;:]+$/g, "").replace(/\s+/g, " ").trim();

export type AlignParse =
  | { kind: "align"; mode: AlignMode; label: string }
  | { kind: "ambiguous-axis"; said: string }
  | null;

/**
 * Parse what follows "align these" / "line these up".
 *
 * An empty tail is the smart mode, which is what the menu leads with and what
 * someone who says only "align these" wants.
 */
export function parseAlignTail(tail: string): AlignParse {
  const s = norm(tail);
  if (BARE_AXIS.test(s)) return { kind: "ambiguous-axis", said: s.replace(/^up\s+/, "") };
  for (const p of PHRASES) {
    if (p.re.test(s)) return { kind: "align", mode: p.mode, label: p.label };
  }
  return null;
}

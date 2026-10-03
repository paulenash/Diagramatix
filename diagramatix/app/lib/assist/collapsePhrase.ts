/**
 * "Collapse this subprocess to a new diagram [called X]" — the words, in ONE place.
 *
 * The parser reads the whole phrase from here, and the fragment hold (`isIncompleteCommand`) asks whether what has been
 * heard so far is the FRONT of it — so a speaker who pauses ("collapse this" … "expanded subprocess into a new" …
 * "diagram called Seven") gets one command, not three (Paul's capture, 2026-10-03: the first fragment ran as a compress
 * and the other two went to the AI). One rule, one place.
 */
const LEAD = "(?:collapse|move|convert|turn|put|extract|push|send)";
const OBJ = "(?:the\\s+|this\\s+|that\\s+)?(?:selected\\s+)?(?:(?:expanded\\s+)?sub-?\\s?process|ep|it|this|that)?";
const TO = "(?:(?:in)?to|as|in)\\s+(?:a\\s+)?(?:new|linked|its\\s+own|separate|child|sub)[\\s-]*(?:diagram|process\\s+diagram)";

/** The whole phrase; group 1 is the optional " called / named <name>". */
export const COLLAPSE_TO_DIAGRAM_RE = new RegExp(`^${LEAD}\\s+${OBJ}\\s*${TO}(?:\\s+(?:called|named)\\s+(.+))?$`, "i");

const NO_NAME_RE = new RegExp(`^${LEAD}\\s+${OBJ}\\s*${TO}$`, "i");
/** "collapse" and who — nothing else yet. ("collapse this" is also a compress; held only for this weaker verb.) */
const FRONT_RE = /^collapse\s+(?:the\s+)?(?:selected|this|that|it)(?:\s+(?:expanded\s+)?(?:sub-?\s?process|ep))?$/i;
/** The way in, up to "a new" / "its own" — the word "diagram" still to come. */
const MIDWAY_RE = new RegExp(`^${LEAD}\\s+${OBJ}\\s*(?:(?:in)?to|as)\\s+(?:a\\s+(?:new|linked)|its\\s+own)$`, "i");

/**
 * What has been heard so far is the start of a collapse-to-diagram command that may still get more — its front, its
 * middle, or the whole of it with no name yet (a "called X" may follow a pause).
 */
export function isCollapsePhraseInProgress(text: string): boolean {
  const t = text.trim().replace(/[.?!,]+$/g, "").trim();
  return FRONT_RE.test(t) || MIDWAY_RE.test(t) || NO_NAME_RE.test(t);
}

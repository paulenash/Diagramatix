/**
 * "compress the Customer pool", "compress pool three", "shrink Sales" — what
 * the compress command names, WITH the kind word the user said.
 *
 * THE KIND WORD IS KEPT (Paul's log, 2026-09-23: "Compact pool three." →
 * `which “three”? 2 match: “Pool 3”, “Lane 3”`). The old rule stripped "pool"
 * and handed the resolver "three", which then offered a lane the user had
 * already ruled out. The word now travels to the front of the ref — "pool
 * three", "pool Customer" — where the resolver reads it as a constraint.
 *
 * NOT A COMPRESS: plural kinds ("compress the lanes", "compress all pools") and
 * the gap/space/diagram phrasings ("reduce the gap between X and Y", "compact
 * the diagram"). Those used to be swallowed here as a pool called "gap" and
 * blocked the AI; now they fall through.
 *
 * Pure.
 */
import { COMPRESS_VERB_SOURCE } from "./commandVerbs";
import { namesNonContainerKind } from "./greedyGuards";

const VERB_THEN_REF = new RegExp(`^${COMPRESS_VERB_SOURCE}\\s+(?:the\\s+)?(.+?)[.!?]*$`, "i");

/** A kind word at the FRONT — every spelling and mis-hear the resolver knows (containerWords.ts). */
const LEAD_KIND = /^(pool|poll|pull|participant(?:\s+box)?|lane|line|lain|sub[\s-]?lane|sub[\s-]?line|sub)(?:\s+|$)/i;
/**
 * A kind word at the END. Narrower than the front on purpose: a trailing
 * "line" is a name ("the Production Line"), and a trailing "sub" means nothing.
 */
const TRAIL_KIND = /\s+(pool|poll|pull|participant|lane|lain|sub[\s-]?lane)$/i;
/** Plural kinds and "all …" are about several containers — the AI's job, not a guess at one. */
const PLURAL = /^(?:all\b|every\b|(?:pools|polls|pulls|lanes|lines|sub[\s-]?lanes|sub[\s-]?lines|subs)\b)|\s(?:pools|lanes|sub[\s-]?lanes)$/i;
/** The gap and the diagram are not containers. */
const NOT_A_CONTAINER = /\b(?:gaps?|spaces?|diagram|everything|between|the\s+lot|whole\s+thing|it\s+all)\b/i;

/** The kind word's canonical spelling, as the resolver reads it. */
function canonicalKind(word: string): "pool" | "lane" | "sublane" {
  const w = word.toLowerCase().replace(/[\s-]+/g, "");
  if (/^(?:pool|poll|pull|participant(?:box)?)$/.test(w)) return "pool";
  if (/^sub/.test(w)) return "sublane";
  return "lane";
}

/**
 * The ref a compress sentence names, with any kind word moved to the front, or
 * null when the sentence is not a compress of ONE container.
 */
export function parseCompressPhrase(raw: string): { ref: string } | null {
  const m = raw.trim().match(VERB_THEN_REF);
  if (!m) return null;
  const said = m[1].trim();
  if (!said || PLURAL.test(said) || NOT_A_CONTAINER.test(said)) return null;
  // "collapse the subprocess" is an EP collapse — judged on the words as SAID,
  // before "sub process" could be read as a sub-lane called "process".
  if (namesNonContainerKind(said)) return null;

  const lead = said.match(LEAD_KIND);
  if (lead) {
    const rest = said.slice(lead[0].length).trim();
    return { ref: rest ? `${canonicalKind(lead[1])} ${rest}` : canonicalKind(lead[1]) };
  }
  const trail = said.match(TRAIL_KIND);
  if (trail) {
    const name = said.slice(0, trail.index).trim();
    return { ref: name ? `${canonicalKind(trail[1])} ${name}` : canonicalKind(trail[1]) };
  }
  return { ref: said };
}

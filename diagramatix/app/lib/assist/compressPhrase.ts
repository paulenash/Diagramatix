/**
 * "compress the Customer pool", "compress pool three", "shrink Sales",
 * "expand lane Underwriters by 100" — what a compress or expand command names,
 * WITH the kind word the user said.
 *
 * THE KIND WORD IS KEPT (Paul's log, 2026-09-23: "Compact pool three." →
 * `which “three”? 2 match: “Pool 3”, “Lane 3”`). The old rule stripped "pool"
 * and handed the resolver "three", which then offered a lane the user had
 * already ruled out. The word now travels to the front of the ref — "pool
 * three", "pool Customer" — where the resolver reads it as a constraint. And
 * it decides the command: a lane or sub-lane word is "compress lane" (Paul,
 * 2026-09-26: "Add commands Compress Lane <lane_name>, and, Expand Lane
 * <lane_name>"), a pool word or none is "compress pool", whose apply finds out
 * what the bare name is.
 *
 * NOT A COMPRESS: plural kinds ("compress the lanes", "compress all pools") and
 * the gap/space/diagram phrasings ("reduce the gap between X and Y", "compact
 * the diagram"). Those used to be swallowed here as a pool called "gap" and
 * blocked the AI; now they fall through.
 *
 * EXPAND IS A LANE COMMAND ONLY WHEN A LANE WORD SAYS SO. "Expand" is a BPMN
 * word — expanding a subprocess opens it — and "expand the pools" already
 * means widen them all (extendPools). So "expand the subprocess", "expand
 * Review" and "expand the Production Line" (a trailing "line" is a name) go to
 * the AI, and so does a "by …" it cannot read: "by a hundred" is not quietly
 * turned into one Task row.
 *
 * Pure.
 */
import { COMPRESS_VERB_SOURCE, EXPAND_VERB_SOURCE } from "./commandVerbs";
import { namesNonContainerKind } from "./greedyGuards";
import {
  POOL_WORDS, PARTICIPANT_WORDS, LANE_WORDS, SUBLANE_WORDS, singularWords, wordAlternation, containerWordKind,
} from "./containerWords";

/** The container a phrase said it was naming, in the resolver's spelling. */
export type SaidKind = "pool" | "lane" | "sublane";

export interface ContainerPhrase {
  /** The reference, the kind word (when one was said) at its front. */
  ref: string;
  /** The kind word said, if any. */
  kind?: SaidKind;
}

const VERB_THEN_REF = new RegExp(`^${COMPRESS_VERB_SOURCE}\\s+(?:the\\s+)?(.+?)[.!?]*$`, "i");
/** The EXPAND_VERBS — they mean TALLER when a lane is named (not extend or widen, which mean wider). */
const EXPAND_VERB_THEN_REF = new RegExp(`^${EXPAND_VERB_SOURCE}\\s+(?:the\\s+)?(.+?)[.!?]*$`, "i");

/**
 * The words that name ONE container of the kinds each command is about — every
 * spelling and mis-hear the resolver knows (containerWords.ts), so "line", the
 * mis-hear Paul asked to be read as "lane" at once, is read here too.
 */
const ONE_LANE_WORDS = singularWords([...LANE_WORDS, ...SUBLANE_WORDS]);
/** What "compress" can name: a pool (or participant) or a lane. */
export const COMPRESS_KIND_WORDS: readonly string[] = [...singularWords([...POOL_WORDS, ...PARTICIPANT_WORDS]), ...ONE_LANE_WORDS];
/** What "expand" can name: a lane only — "expand the pools" is extend, and "expand the pool" with it. */
export const EXPAND_KIND_WORDS: readonly string[] = ONE_LANE_WORDS;

/**
 * A kind word at the FRONT. A full stop or comma after it is the recogniser's
 * (a pause): a held "Compress lane." joined to "Customer." reads "lane.
 * Customer", and without this lost its lane word and compressed the POOL.
 */
const LEAD_KIND = new RegExp(`^(${wordAlternation(COMPRESS_KIND_WORDS)})[.,]?(?:\\s+|$)`, "i");
/**
 * A kind word at the END. Narrower than the front on purpose: a trailing
 * "line" is a name ("the Production Line"), and a trailing "sub" means nothing.
 */
const namesNothingAtTheEnd = (w: string) => /line$/.test(w) || w === "sub";
const TRAIL_KIND = new RegExp(`\\s+(${wordAlternation(COMPRESS_KIND_WORDS.filter((w) => !namesNothingAtTheEnd(w)))})$`, "i");
/** For expand, only a LANE word at the end — "expand the Customer pool" is not a lane command. */
const TRAIL_LANE = new RegExp(`\\s+(${wordAlternation(EXPAND_KIND_WORDS.filter((w) => !namesNothingAtTheEnd(w)))})$`, "i");
/** Plural kinds and "all …" are about several containers — the AI's job, not a guess at one. */
const PLURAL = /^(?:all\b|every\b|(?:pools|polls|pulls|lanes|lines|sub[\s-]?lanes|sub[\s-]?lines|subs)\b)|\s(?:pools|lanes|sub[\s-]?lanes)$/i;
/** The gap and the diagram are not containers. */
const NOT_A_CONTAINER = /\b(?:gaps?|spaces?|diagram|everything|between|the\s+lot|whole\s+thing|it\s+all)\b/i;
/**
 * Words that already point at something — the selection, or "this". Moving the
 * kind word in front of them turned "the selected pool" into "pool selected",
 * a name that matches nothing.
 */
const SELECTION_WORD = /^(?:selected|highlighted|chosen)$/i;
const DEMONSTRATIVE = /^(?:this|that|it|this one|that one)$/i;
/** "by 100", "by 100 px", "by 100 pixels" — digits only (the recogniser's `smart_format` is off). */
const BY_TAIL = /\s+by\s+(\S.*)$/i;
const DISTANCE = /^(\d+)\s*(?:px|pixels?)?$/i;

/** The kind word's canonical spelling, as the resolver reads it. */
function canonicalKind(word: string): SaidKind {
  // The only words the patterns take that are not a pool, lane or sub-lane
  // word are PARTICIPANT_WORDS — a black-box pool's name.
  return containerWordKind(word) ?? "pool";
}

/** "<kind?> <name> <kind?>" → the ref with the kind word at its front. */
function readContainerRef(said: string, trailing: RegExp): ContainerPhrase {
  const lead = said.match(LEAD_KIND);
  if (lead) {
    const kind = canonicalKind(lead[1]);
    const rest = said.slice(lead[0].length).trim();
    return { ref: rest ? `${kind} ${rest}` : kind, kind };
  }
  const trail = said.match(trailing);
  if (trail) {
    const kind = canonicalKind(trail[1]);
    const name = said.slice(0, trail.index).trim();
    if (!name) return { ref: kind, kind };
    if (SELECTION_WORD.test(name)) return { ref: `selected ${kind}`, kind };
    if (DEMONSTRATIVE.test(name)) return { ref: name, kind };
    return { ref: `${kind} ${name}`, kind };
  }
  return { ref: said };
}

/** Is this the name of ONE container, rather than several, a gap, or an element of another kind? */
function namesOneContainer(said: string): boolean {
  if (!said || PLURAL.test(said) || NOT_A_CONTAINER.test(said)) return false;
  // "collapse the subprocess" is an EP collapse — judged on the words as SAID,
  // before "sub process" could be read as a sub-lane called "process".
  return !namesNonContainerKind(said);
}

/**
 * What a compress sentence names, with any kind word moved to the front, or
 * null when the sentence is not a compress of ONE container.
 */
export function parseCompressPhrase(raw: string): ContainerPhrase | null {
  const m = raw.trim().match(VERB_THEN_REF);
  if (!m) return null;
  const said = m[1].trim();
  if (!namesOneContainer(said)) return null;
  return readContainerRef(said, TRAIL_KIND);
}

/**
 * What an expand sentence names — a lane or sub-lane, and how far — or null
 * when it names no lane, or says a distance that cannot be read.
 */
export function parseExpandPhrase(raw: string): { ref: string; kind: "lane" | "sublane"; distance?: number } | null {
  const m = raw.trim().match(EXPAND_VERB_THEN_REF);
  if (!m) return null;
  let said = m[1].trim();
  let distance: number | undefined;
  // A sentence ending on its lane word has no distance after it: the "by" is
  // part of the name ("the Stand By lane").
  if (!TRAIL_LANE.test(said)) {
    const by = said.match(BY_TAIL);
    if (by) {
      const d = by[1].trim().match(DISTANCE);
      if (!d || Number(d[1]) <= 0) return null;
      distance = Number(d[1]);
      said = said.slice(0, by.index).trim();
    }
  }
  if (!namesOneContainer(said)) return null;
  const phrase = readContainerRef(said, TRAIL_LANE);
  if (phrase.kind !== "lane" && phrase.kind !== "sublane") return null;
  return { ref: phrase.ref, kind: phrase.kind, ...(distance !== undefined ? { distance } : {}) };
}

/**
 * The words people actually say for a pool, a lane and a sublane — including
 * the ones the recogniser hands us instead.
 *
 * Paul, 2026-09-23: "spoken 'line' should always resolve quickly to 'lane'."
 * The command GRAMMAR has spelled lane as `(?:lanes?|lines?)` and pool as
 * `(?:pool|poll|pull)` for a long time, because that is what comes back from
 * en-AU speech. The REFERENCE RESOLVER had its own, narrower list, so
 * "add a lane to poll three" worked and "delete line one" did not — the same
 * word, understood by one half of the feature and not the other.
 *
 * One list, used by both, so a mis-hear learned anywhere is known everywhere.
 * The same goes for the few other nouns an add names (participant, black/white
 * box, message), below.
 *
 * Pure.
 */

/** A pool, however it came back from the recogniser. */
export const POOL_WORDS = ["pool", "pools", "poll", "polls", "pull", "pulls"] as const;
/** A top-level lane. "Line" is the mis-hear; "lain" and "lanes" the rest. */
export const LANE_WORDS = ["lane", "lanes", "line", "lines", "lain"] as const;
/** A sublane, with or without the hyphen, and with the same mis-hears. */
export const SUBLANE_WORDS = [
  "sublane", "sublanes", "sub-lane", "sub-lanes", "sub lane", "sub lanes",
  "subline", "sublines", "sub-line", "sub-lines", "sub line", "sub lines",
  "sub", "subs",
] as const;

/**
 * The other nouns an "add a …" sentence can name, which are not symbol types
 * (those are `SYMBOL_SYNONYMS` in ops.ts). The command grammar spells each of
 * them in its regexes, and the add-word repair (`selectedWord.ts`) needs the
 * same list to know that "and a participant box …" is an add. One list, read by
 * both, so a word the grammar learns is a word the repair knows.
 */
/** "Participant box" is the spec's name for a black-box pool, and what Paul says (2026-09-21). */
export const PARTICIPANT_WORDS = ["participant", "participant box"] as const;
/** Said before the pool word: "a black box pool", "a white-box pool". */
export const BOX_WORDS = ["black box", "black-box", "blackbox", "white box", "white-box", "whitebox"] as const;
/** A message flow. Singular — a rule that takes a plural adds the `s` itself. */
export const MESSAGE_WORDS = ["message", "msg"] as const;

/**
 * The spellings in a list that name ONE container. Every plural above ends in
 * "s" and no singular does — "compress the lane" is one lane, "compress the
 * lanes" several, and the rules that must tell them apart read it from here.
 */
export function singularWords(words: readonly string[]): string[] {
  return words.filter((w) => !w.endsWith("s"));
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A regex alternation (source text, no group) for a word list: longest first,
 * so "participant box" is tried before "participant", and a space in a phrase
 * matches any run of whitespace.
 */
export function wordAlternation(words: readonly string[]): string {
  return [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.trim().split(/\s+/).map(escRe).join("\\s+"))
    .join("|");
}

export type ContainerWordKind = "pool" | "lane" | "sublane";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Longest first, so "sub lane" is read before "sub". */
const ALL: Array<{ word: string; kind: ContainerWordKind }> = [
  ...SUBLANE_WORDS.map((word) => ({ word, kind: "sublane" as const })),
  ...POOL_WORDS.map((word) => ({ word, kind: "pool" as const })),
  ...LANE_WORDS.map((word) => ({ word, kind: "lane" as const })),
].sort((a, b) => b.word.length - a.word.length);

/** Which container a single word names, or null. */
export function containerWordKind(word: string): ContainerWordKind | null {
  const w = norm(word);
  return ALL.find((e) => e.word === w)?.kind ?? null;
}

/**
 * The container kind a PHRASE leads with, and what is left after it —
 * "line one" → { kind: "lane", rest: "one" }. Null when it leads with
 * something else, and `rest` is empty when the phrase is only the kind word.
 */
export function leadingContainerWord(phrase: string): { kind: ContainerWordKind; rest: string } | null {
  const p = norm(phrase);
  for (const { word, kind } of ALL) {
    if (p === word) return { kind, rest: "" };
    if (p.startsWith(`${word} `)) return { kind, rest: p.slice(word.length + 1).trim() };
  }
  return null;
}

/**
 * Number words the recogniser swaps for the one that was said. Applied only
 * as a SECOND attempt, after a strict read has failed, because every one of
 * these is also an ordinary English word: an element called "Won" or "Ate"
 * must keep its name, and a diagram that has one is not made worse by a
 * fallback that only runs when nothing matched.
 */
export const NUMBER_HOMOPHONES: Record<string, string> = {
  won: "one", wun: "one", juan: "one",
  too: "two", to: "two", tu: "two",
  tree: "three", free: "three", thee: "three",
  fore: "four", for: "four", faw: "four",
  hive: "five", fife: "five",
  sicks: "six", sex: "six",
  heaven: "seven",
  ate: "eight", ait: "eight",
  wine: "nine", nein: "nine",
  tan: "ten", tin: "ten",
};

/** "lane won" → "lane one". Leaves everything that is not a homophone alone. */
export function foldNumberHomophones(s: string): string {
  return s.replace(/\b[a-z]+\b/gi, (w) => NUMBER_HOMOPHONES[w.toLowerCase()] ?? w);
}

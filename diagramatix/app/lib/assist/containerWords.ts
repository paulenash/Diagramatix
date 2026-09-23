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

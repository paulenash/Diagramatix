/**
 * V1 — bias the recogniser toward the names ON THIS DIAGRAM.
 *
 * The keyword list was a hard-coded dozen command words. A diagram's own
 * labels — "Pick Items", "Back Order", "Quality Check" — are exactly the words
 * a user says most and the recogniser has least chance with, because they are
 * proper nouns it has never seen.
 *
 * ⚠ THE STANDING WARNING, and why this module is so cautious.
 *
 * Paul, after the one day the number words were boosted: "Turn is often heard
 * as Ten." Every boost creates a mis-hear somewhere else. `lane:3` was beating
 * "one" on a numbered pick, so numbers were added to compete — which fixed the
 * pick and broke ordinary speech, because boosting "ten" makes the recogniser
 * REACH for it. The lesson is not "boost carefully"; it is that a boost is a
 * bet against every other word in the language.
 *
 * So the rules here are deliberately timid:
 *
 *   1. NO BOOST SUFFIX. A keyterm with no `:n` biases without the reaching that
 *      caused "ten". The command words keep their boosts; the labels do not
 *      compete with them.
 *   2. MULTI-WORD PHRASES ARE THE SAFE CASE. "Pick Items" as a phrase cannot be
 *      confused with ordinary speech. A bare common word can: "Order", "Check",
 *      "Review" are all real English, and biasing them costs more than it buys.
 *      Single words are kept only when they are long and distinctive.
 *   3. NOTHING THAT COLLIDES WITH THE COMMAND VOCABULARY. Biasing a command
 *      word — even inside a phrase — makes the recogniser reach for it where
 *      the user said a DIFFERENT command word: while "compact" was boosted,
 *      "compress" came back as "compact" 9 times in 20 (2026-09-25; the
 *      command list has sent nothing since). That is the `lane:3` mistake in a
 *      new costume.
 *   4. A CAP. Deepgram weighs a fixed list; a hundred terms dilute each other
 *      and the command words with them.
 *
 * The other half of the answer is V2: phonetic matching in reference
 * resolution, which repairs what the recogniser still gets wrong. They are
 * complementary on purpose — V1 lowers the error rate at the source, V2 catches
 * the rest without an AI call, and neither has to be perfect.
 *
 * Pure.
 */

import { COMPRESS_VERBS } from "../assist/commandVerbs";

/** Sent unboosted. Never give these a `:n` — see rule 1. */
export const MAX_DIAGRAM_KEYTERMS = 60;
/** A single word must be at least this long to be worth biasing on its own. */
export const MIN_SOLO_WORD = 6;
/** A label longer than this is a sentence, not a name; it will never be said verbatim. */
export const MAX_KEYTERM_WORDS = 4;

/**
 * Words the command vocabulary owns (rule 3). A label containing one of these is
 * not sent: the bias would act on the command word, not just on the name.
 * Every compress verb is here (the one list, commandVerbs.ts) — "compact" was
 * the word that took "compress".
 */
const COMMAND_WORDS = new Set<string>([
  "lane", "lanes", "sublane", "sublanes", "pool", "pools", "gateway", "gateways",
  "task", "tasks", "subprocess", "selected", "selection", "boundary", "connect",
  "rename", "delete", ...COMPRESS_VERBS, "voice", "assist", "start", "end", "event",
  "message", "swap", "move", "nudge", "add", "undo", "stop", "done",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
]);

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The keyterms for a diagram, in the order they should be sent (most
 * distinctive first, since the cap trims the tail).
 */
export function diagramKeyterms(
  labels: readonly (string | null | undefined)[],
  max: number = MAX_DIAGRAM_KEYTERMS,
): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const raw of labels) {
    if (typeof raw !== "string") continue;
    // A label can carry rich text or a line break; only the words matter.
    const label = clean(raw.replace(/<[^>]*>/g, " ").replace(/[\r\n]+/g, " "));
    if (!label) continue;

    const words = label.split(" ");
    if (words.length > MAX_KEYTERM_WORDS) continue;          // rule 2: a sentence

    const lower = words.map((w) => w.toLowerCase().replace(/[^a-z0-9'-]/g, ""));
    if (lower.some((w) => !w)) continue;                      // punctuation-only word
    if (lower.some((w) => COMMAND_WORDS.has(w))) continue;    // rule 3
    if (lower.some((w) => /^\d+$/.test(w))) continue;         // a number word by another name

    if (words.length === 1 && lower[0].length < MIN_SOLO_WORD) continue; // rule 2

    const key = lower.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(label);
  }

  // Most distinctive first: more words beats fewer, then longer beats shorter.
  kept.sort((a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length);
  return kept.slice(0, Math.max(0, max));
}

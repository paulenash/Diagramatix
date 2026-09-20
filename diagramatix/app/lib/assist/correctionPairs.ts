/**
 * V3, first half — measure before building.
 *
 * V3 is the personal phrase book: learn from corrections, because a failed
 * command followed by a working re-issue is a training pair. Paul's own
 * framing is that it is "worth doing only after V1 and V2 have been used
 * enough to say whether they left anything", and V1 and V2 shipped on
 * 20 September. So this is not the phrase book. This is the measurement the
 * phrase book would be built on, and the measurement that decides whether it
 * should be built at all.
 *
 * That order is not caution for its own sake — it is how V2 got its shape.
 * Measuring first showed that multi-word mis-hears already resolved on token
 * overlap, which cut the feature down to two narrow cases and made it small
 * enough to be safe. Building V3 today would be guessing at the shape of a
 * problem V1 and V2 may already have removed.
 *
 * WHAT A PAIR TELLS YOU. The original review asked for exactly this tally
 * (V0): were the failures the recogniser's fault, or the grammar's? Only the
 * first is a voice problem.
 *
 *   MISHEARD  — the re-issue says the SAME THING and worked. The words were
 *               right in the user's mouth and wrong on the wire. A phrase book
 *               could learn this; more recogniser bias might too.
 *   REPHRASED — the re-issue says something DIFFERENT and worked. The user
 *               changed their words to suit the grammar. No amount of phonetic
 *               learning helps; the grammar or the AI prompt is what is short.
 *
 * A phrase book built on a log that is mostly REPHRASED would learn the wrong
 * lesson and add a layer of aliases nobody needed.
 *
 * Pure.
 */
import { phoneticKey } from "./phonetic";
import { isMicStopWord, isFlowEndWord } from "./stopWords";

/** The shape this reads — a subset of the bar's `CommandLogEntry`. */
export interface LoggedCommand {
  heard: string;
  ok: boolean;
}

export interface CorrectionPair {
  /** What was said that did not work. */
  failed: string;
  /** The re-issue that did. */
  worked: string;
  /**
   * `misheard` — said again, heard properly the second time (an ASR problem).
   * `rephrased` — said differently (a grammar or vocabulary problem).
   */
  kind: "misheard" | "rephrased";
  /** How many log entries apart. 1 is straight after. */
  gap: number;
}

/**
 * How many entries after a failure still counts as a correction of it. Three
 * covers "say it again", "say it again louder" and "say it a third way"; past
 * that the user has moved on to something else.
 */
export const CORRECTION_WINDOW = 3;

/** Two utterances are "the same thing" at or above this token overlap. */
const SAME_THING = 0.6;

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

/**
 * Not a correction of anything: mic control, ending a numbered pick, undoing,
 * or a bare number answering a pick. Counting these would make every failure
 * near the end of a session look like it was corrected.
 */
function isBookkeeping(utterance: string): boolean {
  const s = norm(utterance);
  if (!s) return true;
  if (isMicStopWord(s) || isFlowEndWord(s)) return true;
  if (/^(?:undo|undo that|again|yes|no|ok|okay|cancel)$/.test(s)) return true;
  if (/^\d+$/.test(s)) return true;                     // answering a numbered pick
  return false;
}

/** Same words, or near enough that the user plainly said the same thing. */
function saysTheSameThing(a: string, b: string): boolean {
  const wa = words(a), wb = words(b);
  if (!wa.length || !wb.length) return false;
  const setA = new Set(wa);
  const shared = wb.filter((w) => setA.has(w)).length;
  const overlap = shared / Math.max(setA.size, wb.length);
  if (overlap >= SAME_THING) return true;
  // The whole point is that the words came back WRONG, so token overlap can be
  // low on exactly the case that matters most. Compare the sound as well.
  const ka = phoneticKey(a).replace(/\s+/g, "");
  const kb = phoneticKey(b).replace(/\s+/g, "");
  if (!ka || !kb) return false;
  const longer = Math.max(ka.length, kb.length);
  if (longer === 0) return false;
  // A cheap similarity: how much of the shorter key is a prefix of the other.
  let same = 0;
  while (same < ka.length && same < kb.length && ka[same] === kb[same]) same++;
  return same / longer >= SAME_THING;
}

/**
 * Every failure that was followed by a working re-issue.
 *
 * A failure is paired with the FIRST success inside the window, and a success
 * is used at most once, so "say it, fails, say it, fails, say it, works"
 * reports one pair rather than two.
 */
export function correctionPairs(
  log: readonly LoggedCommand[],
  window: number = CORRECTION_WINDOW,
): CorrectionPair[] {
  const out: CorrectionPair[] = [];
  const claimed = new Set<number>();

  for (let i = 0; i < log.length; i++) {
    const fail = log[i];
    if (fail.ok || isBookkeeping(fail.heard)) continue;
    for (let j = i + 1; j <= i + window && j < log.length; j++) {
      if (claimed.has(j)) continue;
      const cand = log[j];
      if (!cand.ok || isBookkeeping(cand.heard)) continue;
      claimed.add(j);
      out.push({
        failed: fail.heard,
        worked: cand.heard,
        kind: saysTheSameThing(fail.heard, cand.heard) ? "misheard" : "rephrased",
        gap: j - i,
      });
      break;
    }
  }
  return out;
}

export interface CorrectionTally {
  /** Commands that were run at all (bookkeeping excluded). */
  commands: number;
  /** Of those, how many failed. */
  failures: number;
  /** Failures that were followed by a working re-issue. */
  corrected: number;
  /** Of the corrected, said the same way again — the recogniser's fault. */
  misheard: number;
  /** Of the corrected, said differently — the grammar's fault. */
  rephrased: number;
}

/**
 * The V0 tally, from a session's log. This is the number that answers "is V3
 * worth building?": a session with real `misheard` counts says the recogniser
 * is still losing words that a personal phrase book could learn; one that is
 * almost all `rephrased` says the effort belongs in the grammar instead.
 */
export function correctionTally(log: readonly LoggedCommand[]): CorrectionTally {
  const real = log.filter((e) => !isBookkeeping(e.heard));
  const pairs = correctionPairs(log);
  return {
    commands: real.length,
    failures: real.filter((e) => !e.ok).length,
    corrected: pairs.length,
    misheard: pairs.filter((p) => p.kind === "misheard").length,
    rephrased: pairs.filter((p) => p.kind === "rephrased").length,
  };
}

/** One line for the session readout. Empty when there is nothing to say yet. */
export function formatCorrectionTally(t: CorrectionTally): string {
  if (t.commands === 0) return "";
  const bits = [`${t.commands} command${t.commands === 1 ? "" : "s"}`];
  if (t.failures === 0) return `${bits[0]}, none needed a second go`;
  bits.push(`${t.failures} didn't land`);
  if (t.corrected > 0) {
    const how: string[] = [];
    if (t.misheard) how.push(`${t.misheard} misheard`);
    if (t.rephrased) how.push(`${t.rephrased} rephrased`);
    bits.push(`${t.corrected} fixed on a re-try (${how.join(", ")})`);
  }
  return bits.join(" · ");
}

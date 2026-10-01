/**
 * What the help should READ from the words the recogniser heard — one place, shared by the editor's
 * panel and the SuperAdmin tile's Speak.
 *
 * Paul, 2026-10-01: "The real Voice Assist recognition is much better than the SuperAdmin Speak
 * feature which is very unreliable." The recogniser is the same one. The difference was that the real
 * session cleans the words up before it acts (the same repairs the parser and the hold use) and ends
 * an utterance when you stop talking; the tile and the panel read the raw words and kept adding to
 * one string forever. Both now go through here.
 *
 *   heardForHelp   the words after the parser's own mis-hear repairs (`repairHeardWords`: mood→move,
 *                  turn, add, delete, convert, "selected", spelled-out names) and, while a numbered
 *                  pick is open, the lost-"one" repair ("the" → "one").
 *   nextUtterance  the fragment buffer, as a pure state machine over the SAME numbers and the SAME
 *                  "does this look unfinished" test the live session uses (`fragmentBuffer.ts`).
 *
 * Pure.
 */
import { repairHeardWords } from "../selectedWord";
import { restoreLostOneNumber } from "../spokenNumber";
import { isFlowEndWord, isMicStopWord } from "../stopWords";
import { isIncompleteCommand } from "../incompleteCommand";
import { FRAGMENT_CONTINUE_MS, FRAGMENT_MAX_WAITS, FRAGMENT_SILENCE_MS } from "../fragmentBuffer";

/** The words as the help should read them. A trailing space is kept (the next word has not begun). */
export function heardForHelp(text: string, opts: { numberPick?: boolean } = {}): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";
  let t = repairHeardWords(raw.trim());
  if (opts.numberPick) t = restoreLostOneNumber(t);
  return t;
}

export interface Utterance {
  /** The finals heard since the last command ended. */
  buffer: string;
  /** How many times an unfinished command has been held for more. */
  waits: number;
}

export const EMPTY_UTTERANCE: Utterance = { buffer: "", waits: 0 };

export type FinalOutcome =
  | { kind: "stop"; utterance: Utterance }        // a spoken "stop" — the session ends
  | { kind: "clear"; utterance: Utterance }       // cancel / done / exit — the half command is dropped unexamined
  | { kind: "buffered"; utterance: Utterance; quietMs: number };

/** A recogniser final arrived. `quietMs` is how long to wait before calling `onQuiet`. */
export function onFinal(u: Utterance, text: string): FinalOutcome {
  const txt = String(text ?? "").trim();
  if (!txt) return { kind: "buffered", utterance: u, quietMs: FRAGMENT_SILENCE_MS };
  if (isMicStopWord(txt)) return { kind: "stop", utterance: EMPTY_UTTERANCE };
  if (isFlowEndWord(txt)) return { kind: "clear", utterance: EMPTY_UTTERANCE };
  return { kind: "buffered", utterance: { buffer: u.buffer ? `${u.buffer} ${txt}` : txt, waits: 0 }, quietMs: FRAGMENT_SILENCE_MS };
}

export type QuietOutcome =
  | { kind: "wait"; utterance: Utterance; quietMs: number }   // looks unfinished — hold for the rest
  | { kind: "commit"; command: string; utterance: Utterance }; // the command is over

/** Nothing new was heard for the quiet window (or `force`: the session ended). */
export function onQuiet(u: Utterance, force = false): QuietOutcome {
  const cmd = u.buffer.trim();
  if (!force && cmd && isIncompleteCommand(cmd) && u.waits < FRAGMENT_MAX_WAITS) {
    return { kind: "wait", utterance: { buffer: u.buffer, waits: u.waits + 1 }, quietMs: FRAGMENT_CONTINUE_MS };
  }
  return { kind: "commit", command: cmd, utterance: EMPTY_UTTERANCE };
}

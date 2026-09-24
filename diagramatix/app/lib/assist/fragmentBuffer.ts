/**
 * How spoken fragments are stitched back into one command.
 *
 * Deepgram finalises a segment after ~800 ms of silence, so one sentence with a
 * pause in it arrives as two finals: "rename Task 8 to" … "Approve". Running
 * the first half would rename nothing and lose the second. The editor therefore
 * holds fragments and waits.
 *
 * ─── What lives here, and what deliberately does not ───────────────────────
 *
 * **The numbers and the decision live here.** The editor imports them rather
 * than declaring its own, so the live path and a replayed clip cannot disagree
 * about how long to wait or when a sentence looks unfinished. Those are the
 * parts that would actually drift.
 *
 * **The live timer loop stays in the editor.** `stitchFinals` below is a second
 * implementation of the same policy, for a different shape of input: the editor
 * reacts to finals as they arrive and arms `setTimeout`; a replay has every
 * final with a timestamp once the socket has closed, and reconstructs what
 * would have happened. Unifying them would mean rewriting the live timer state
 * machine — the riskiest code in this feature, and the code Paul's fragment
 * defects were expensive to find — so that a test harness could share it. That
 * is the tail wagging the dog.
 *
 * The honest consequence, stated plainly rather than left to be discovered:
 * these are **two implementations** of one policy. They agree on the numbers
 * and on the predicate, and a test enforces that — those are the parts that
 * would actually drift. They could still diverge if somebody changed the SHAPE
 * of the loop. If that ever matters, extract the live path properly as its own
 * piece of work, with the walkthrough re-run afterwards.
 */
import { isIncompleteCommand } from "./incompleteCommand";

/** Quiet after a final before the buffer is run. */
export const FRAGMENT_SILENCE_MS = 2200;
/** The longer grace while waiting for the rest of a split command. */
export const FRAGMENT_CONTINUE_MS = 3200;
/** How many times a sentence may be held for a continuation before it runs anyway. */
export const FRAGMENT_MAX_WAITS = 3;

/** One recogniser final, with when it arrived. */
export interface Final {
  text: string;
  /** Milliseconds from the start of the clip. */
  atMs: number;
}

/**
 * Reconstruct the utterances the live buffer would have produced.
 *
 * Walks the finals in order, joining them into a buffer, and emits whenever the
 * gap to the next final exceeds the wait the live path would have been holding
 * for — `FRAGMENT_SILENCE_MS` normally, `FRAGMENT_CONTINUE_MS` while the
 * sentence still looks unfinished and the hold budget is not spent.
 *
 * `endMs` is when the audio stopped: the last buffer is always flushed, because
 * `stopAbraListening` and the socket's `onEnd` both force a flush.
 */
export function stitchFinals(finals: readonly Final[], endMs?: number): string[] {
  const out: string[] = [];
  let buffer = "";
  let waits = 0;

  const emit = () => {
    const cmd = buffer.trim();
    buffer = "";
    waits = 0;
    if (cmd) out.push(cmd);
  };

  for (let i = 0; i < finals.length; i++) {
    const f = finals[i];
    const text = f.text.trim();
    if (!text) continue;
    buffer = buffer ? `${buffer} ${text}` : text;
    // A fragment arriving resets the hold budget, exactly as `onText` does.
    waits = 0;

    const next = finals[i + 1];
    const gap = (next ? next.atMs : (endMs ?? f.atMs)) - f.atMs;

    // How long the live path would have waited before running this buffer,
    // extending while the sentence looks unfinished and the budget allows.
    let waited = FRAGMENT_SILENCE_MS;
    while (
      gap >= waited
      && isIncompleteCommand(buffer.trim())
      && waits < FRAGMENT_MAX_WAITS
    ) {
      waits += 1;
      waited += FRAGMENT_CONTINUE_MS;
    }

    if (!next) break;                 // the final flush happens below
    if (gap >= waited) emit();
  }

  emit();
  return out;
}

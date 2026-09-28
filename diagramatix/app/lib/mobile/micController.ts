/**
 * One microphone for the phone's Generate sheet, several places it can write
 * to (the description, or the answer to a question) — and only ever ONE live
 * dictation (the 2026-09-28 review).
 *
 * startDictation takes a second or two to connect (a token, the microphone, the
 * socket). A plain "stop requested" flag lost track of a start that was still
 * connecting when the sheet closed or another mic was tapped: the late session
 * was kept, could not be stopped, and went on writing into the draft. Here every
 * start takes a number; stopping, switching or closing moves the number on, and
 * anything from an older number — its words, its errors, its "ended" — is
 * ignored, and its handle, when it arrives, is stopped.
 *
 * Stopping also keeps the last phrase: the words still on screen as "interim"
 * when Stop is tapped have not been finalised, and closing the socket drops
 * the final that would have carried them.
 *
 * Framework-free, so the sequencing is tested without a phone or a DOM.
 */
import type { DictationCallbacks, DictationHandle } from "@/app/lib/dictation";

export type StartDictation = (cb: DictationCallbacks) => Promise<DictationHandle | null>;

export interface MicListener<T> {
  /** Finalised words for `target` (including a phrase kept at Stop). */
  onText: (target: T, text: string) => void;
  /** The live, not-yet-final words ("" to clear). */
  onInterim: (text: string) => void;
  /** Which target is listening, and whether the recogniser is live yet; null = off. */
  onState: (state: { target: T; ready: boolean } | null) => void;
  /** A message for the user (null to clear). */
  onMessage: (message: string | null) => void;
}

export const MIC_COULD_NOT_START =
  "Voice couldn't start on this device. Use “Mic not working? Test it” below to see why.";

export function createMicController<T>(start: StartDictation, listen: MicListener<T>) {
  let seq = 0;
  let handle: DictationHandle | null = null;
  let current: { target: T; ready: boolean } | null = null;
  let interim = "";

  const setState = (s: { target: T; ready: boolean } | null) => { current = s; listen.onState(s); };
  const setInterim = (t: string) => { interim = t; listen.onInterim(t); };

  /**
   * Stop whatever is listening (or still connecting). Returns the phrase that
   * was on screen and where it belonged, for the caller to keep — or null.
   */
  function stop(): { target: T; tail: string } | null {
    const was = current;
    const tail = interim.trim();
    seq++;
    const h = handle;
    handle = null;
    h?.stop();
    setInterim("");
    setState(null);
    return was && tail ? { target: was.target, tail } : null;
  }

  /** Start listening for `target`; tapping the listening target again stops it (keeping its last phrase). */
  async function toggle(target: T): Promise<void> {
    if (current) {
      const same = current.target === target;
      const kept = stop();
      if (kept) listen.onText(kept.target, kept.tail);
      if (same) return;
    }
    const my = ++seq;
    const live = () => my === seq;
    listen.onMessage(null);
    setInterim("");
    setState({ target, ready: false });
    let said = false;
    const h = await start({
      prose: true,
      onText: (text) => { if (!live()) return; setInterim(""); listen.onText(target, text); },
      onInterim: (text) => { if (live()) setInterim(text); },
      onReady: () => { if (live() && current) setState({ ...current, ready: true }); },
      onError: (m) => { if (!live()) return; said = true; listen.onMessage(m); },
      onEnd: () => { if (!live()) return; handle = null; setInterim(""); setState(null); },
    });
    // Stopped, switched, or closed while it was connecting: this one is not wanted.
    if (!live()) { h?.stop(); return; }
    if (!h) {
      setState(null);
      if (!said) listen.onMessage(MIC_COULD_NOT_START);
      return;
    }
    handle = h;
  }

  /** The sheet is closing: stop everything, including a start still connecting. */
  function dispose(): void {
    seq++;
    const h = handle;
    handle = null;
    h?.stop();
  }

  return { toggle, stop, dispose, get listening() { return current; } };
}

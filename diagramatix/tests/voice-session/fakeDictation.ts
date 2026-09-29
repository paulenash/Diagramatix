/**
 * A stand-in for the recogniser (app/lib/dictation startDictation), so the
 * mic loop runs in a test: the test says when the recogniser connects, what
 * it hears (finals and interims), and when it errors or ends.
 *
 * Like both real engines, stop() fires onEnd SYNCHRONOUSLY (Deepgram's
 * cleanup; the browser engine's finish()) — the voice block's stop order
 * depends on it.
 */
import type { DictationCallbacks, DictationHandle } from "@/app/lib/dictation";

export interface FakeSession {
  cb: DictationCallbacks;
  handle: DictationHandle;
  stopped: boolean;
  /** Resolve a start held back with `holdStarts` (null = the start failed). */
  resolve: (h: DictationHandle | null) => void;
}

export const fakeDictation = {
  sessions: [] as FakeSession[],
  /** When true, start() waits for the test to call session.resolve(). */
  holdStarts: false,

  start(cb: DictationCallbacks): Promise<DictationHandle | null> {
    let resolveStart!: (h: DictationHandle | null) => void;
    const started = new Promise<DictationHandle | null>((r) => { resolveStart = r; });
    const s: FakeSession = {
      cb,
      stopped: false,
      handle: { stop: () => { if (s.stopped) return; s.stopped = true; s.cb.onEnd?.(); } },
      resolve: (h) => resolveStart(h),
    };
    fakeDictation.sessions.push(s);
    if (!fakeDictation.holdStarts) { cb.onEngine?.("deepgram"); cb.onReady?.(); resolveStart(s.handle); }
    return started;
  },

  /** The latest session. */
  get current(): FakeSession {
    const s = fakeDictation.sessions[fakeDictation.sessions.length - 1];
    if (!s) throw new Error("no dictation session started");
    return s;
  },

  reset() {
    fakeDictation.sessions = [];
    fakeDictation.holdStarts = false;
  },
};

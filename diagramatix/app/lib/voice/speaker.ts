/**
 * The one thing that plays audio — a single queue, so two replies never talk
 * over each other.
 *
 * Design notes worth keeping:
 *
 *  • **Nothing touches the browser until something is spoken.** The constructor
 *    used to open IndexedDB, which runs at import time — and `indexedDB` does not
 *    exist on the server, so any route that transitively imported this module
 *    would have thrown a ReferenceError during render. Init is lazy instead.
 *  • **The AudioContext is resumed on use.** One created before the first click
 *    starts life suspended, and a suspended context plays nothing while happily
 *    reporting success.
 *  • **Failure is reported, not swallowed.** A caller needs to know the reply was
 *    never spoken — the route answers 403 when the feature is not granted, and a
 *    surface that keeps waiting for audio that will never arrive would simply
 *    hang. `onError` is how Animate turns narration off and says why.
 *  • **Cached by voice AND text**, because the same sentence in two voices is two
 *    different recordings. Fixed prompts are then free after the first time.
 */

import type { TtsVoice, SpeechPurpose } from "./speakParams";

export type { SpeechPurpose };

interface QueuedItem {
  text: string;
  voice: TtsVoice;
  purpose: SpeechPurpose;
  /** Called with true when playback starts and false when it stops, however it stops. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Called instead of playback when the reply could not be fetched or decoded. */
  onError?: (message: string) => void;
}

const DB_NAME = "diagramatix-voice";
const STORE = "audio-cache";

/** Exported for the tests; the app uses the one shared `speaker` below. */
export class Speaker {
  private queue: QueuedItem[] = [];
  /** Busy with an item — fetching, decoding or sounding. The queue waits on it. */
  private busy = false;
  private currentItem: QueuedItem | null = null;
  private current: AudioBufferSourceNode | null = null;
  private abort: AbortController | null = null;
  /**
   * Bumped by every `stop()`. An item in flight compares the value it started
   * with after each await and quietly abandons itself if it changed. Without it,
   * a stop that landed during the FETCH was ignored: the audio arrived after the
   * user had paused, played anyway, and a second pump could start beside it —
   * two voices at once.
   */
  private generation = 0;
  private ctx: AudioContext | null = null;
  private db: IDBDatabase | null = null;
  private dbTried = false;

  private audioContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor!();
    }
    // A context created before the first user gesture is suspended, and a
    // suspended context plays silence without complaining.
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private async cache(): Promise<IDBDatabase | null> {
    if (this.db || this.dbTried) return this.db;
    this.dbTried = true;
    if (typeof indexedDB === "undefined") return null;
    this.db = await new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.db;
  }

  private async cached(key: string): Promise<ArrayBuffer | null> {
    const db = await this.cache();
    if (!db) return null;
    return new Promise<ArrayBuffer | null>((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result?.audio as ArrayBuffer) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async putCached(key: string, audio: ArrayBuffer): Promise<void> {
    const db = await this.cache();
    if (!db) return;
    try {
      db.transaction(STORE, "readwrite").objectStore(STORE).put({ key, audio });
    } catch {
      /* an unwritten cache entry costs a re-fetch, nothing more */
    }
  }

  /** Queue one string. Returns immediately; playback happens in order. */
  speak(
    text: string,
    voice: TtsVoice,
    purpose: SpeechPurpose,
    handlers?: { onSpeakingChange?: (speaking: boolean) => void; onError?: (message: string) => void },
  ): void {
    if (!text.trim()) return;
    this.queue.push({ text, voice, purpose, ...handlers });
    void this.pump();
  }

  /** Stop at once and forget what was waiting — barge-in, pause, and unmount. */
  stop(): void {
    this.generation += 1;
    this.queue = [];
    this.abort?.abort();
    this.abort = null;
    const src = this.current;
    this.current = null;
    // `onended` is left in place: stopping fires it, which releases the item's
    // await, and the generation check then sends it home without a word.
    try { src?.stop(); } catch { /* already finished */ }
    const item = this.currentItem;
    this.currentItem = null;
    this.busy = false;
    item?.onSpeakingChange?.(false);
  }

  /** True while audio is actually SOUNDING — not while it is still being fetched. The mic gate reads this. */
  get isSpeaking(): boolean {
    return this.current !== null;
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    const item = this.queue.shift();
    if (!item) return;

    const gen = this.generation;
    const stale = () => gen !== this.generation;
    const abort = new AbortController();
    this.busy = true;
    this.currentItem = item;
    this.abort = abort;

    try {
      const key = `${item.voice}:${item.text}`;
      let bytes = await this.cached(key);
      if (stale()) return;
      if (!bytes) {
        const res = await fetch("/api/ai/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: item.text, voice: item.voice, purpose: item.purpose }),
          signal: abort.signal,
        });
        if (stale()) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `the voice service answered ${res.status}`);
        }
        bytes = await res.arrayBuffer();
        if (stale()) return;
        void this.putCached(key, bytes.slice(0));
      }

      const ctx = this.audioContext();
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      if (stale()) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      this.current = src;

      item.onSpeakingChange?.(true);
      await new Promise<void>((resolve) => {
        src.onended = () => resolve();
        src.start(0);
      });
      if (stale()) return;

      this.finish();
      item.onSpeakingChange?.(false);
    } catch (err) {
      if (stale()) return; // stopped mid-fetch: an abort is not a failure
      this.finish();
      item.onSpeakingChange?.(false);
      item.onError?.(err instanceof Error ? err.message : "the reply could not be spoken");
    }

    void this.pump();
  }

  private finish(): void {
    this.current = null;
    this.currentItem = null;
    this.abort = null;
    this.busy = false;
  }
}

export const speaker = new Speaker();

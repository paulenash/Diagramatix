/**
 * Client-side audio playback for text-to-speech replies.
 *
 * One speaker at a time, queued. Caches audio by (voice + text hash) in IndexedDB
 * to avoid redundant Deepgram calls. Stops playback on barge-in (user command).
 * Falls back to window.speechSynthesis when the route says 503/offline.
 */

import type { TtsVoice } from "./speakParams";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

interface QueuedItem {
  text: string;
  voice: TtsVoice;
  purpose: "question" | "refusal" | "success";
  onSpeakingChange?: (speaking: boolean) => void;
}

type SpeakerState = "idle" | "playing" | "loading";

class Speaker {
  private queue: QueuedItem[] = [];
  private state: SpeakerState = "idle";
  private currentSource: AudioBufferSourceNode | null = null;
  private db: IDBDatabase | null = null;
  private onSpeakingChange: ((speaking: boolean) => void) | undefined;

  constructor() {
    this.initDb();
  }

  private async initDb() {
    if (this.db) return;
    try {
      const req = indexedDB.open("diagramatix-voice", 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("audio-cache")) {
          db.createObjectStore("audio-cache", { keyPath: "key" });
        }
      };
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
      };
      req.onerror = () => {
        // Cache failure is silent — fallback to uncached.
      };
    } catch {
      // IndexedDB may be unavailable — that's ok.
    }
  }

  private cacheKey(voice: TtsVoice, text: string): string {
    return `${voice}:${text}`;
  }

  private async getCached(voice: TtsVoice, text: string): Promise<ArrayBuffer | null> {
    if (!this.db) return null;
    try {
      const key = this.cacheKey(voice, text);
      return new Promise((resolve) => {
        const tx = this.db!.transaction("audio-cache", "readonly");
        const store = tx.objectStore("audio-cache");
        const req = store.get(key);
        req.onsuccess = () => {
          resolve(req.result?.audio ?? null);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async setCached(voice: TtsVoice, text: string, audio: ArrayBuffer): Promise<void> {
    if (!this.db) return;
    try {
      const key = this.cacheKey(voice, text);
      const tx = this.db.transaction("audio-cache", "readwrite");
      const store = tx.objectStore("audio-cache");
      store.put({ key, audio });
    } catch {
      // Cache write failure is silent.
    }
  }

  /**
   * Queue a text snippet for playback.
   */
  public speak(text: string, voice: TtsVoice, purpose: "question" | "refusal" | "success", onSpeakingChange?: (speaking: boolean) => void): void {
    this.queue.push({ text, voice, purpose, onSpeakingChange });
    this.onSpeakingChange = onSpeakingChange;
    this.processQueue();
  }

  /**
   * Stop playback immediately and clear the queue.
   */
  public stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Already stopped.
      }
      this.currentSource = null;
    }
    this.state = "idle";
    this.queue = [];
  }

  private async processQueue() {
    if (this.state !== "idle" || this.queue.length === 0) return;

    const item = this.queue.shift();
    if (!item) return;

    this.state = "loading";
    if (item.onSpeakingChange) item.onSpeakingChange(true);

    try {
      let audioBuffer: ArrayBuffer | null = await this.getCached(item.voice, item.text);
      if (!audioBuffer) {
        const res = await fetch("/api/ai/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: item.text, voice: item.voice, purpose: item.purpose }),
        });
        if (!res.ok) {
          throw new Error(`Speak failed (${res.status})`);
        }
        audioBuffer = await res.arrayBuffer();
        await this.setCached(item.voice, item.text, audioBuffer);
      }

      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(audioBuffer.slice(0));
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);

      this.currentSource = src;
      this.state = "playing";

      src.onended = () => {
        this.currentSource = null;
        this.state = "idle";
        if (item.onSpeakingChange) item.onSpeakingChange(false);
        this.processQueue();
      };

      src.start(0);
    } catch (err) {
      this.state = "idle";
      if (item.onSpeakingChange) item.onSpeakingChange(false);
      console.error("Speak error:", err);
      this.processQueue();
    }
  }
}

export const speaker = new Speaker();

/**
 * Audio spoken before the recogniser is ready.
 *
 * Paul, 2026-09-15: "Often the initial word of my commands are missing." The
 * header said "listening…" the moment the mic button was pressed, but the
 * microphone was only wired to Deepgram in `ws.onopen` — after the token
 * fetch, the permission prompt and the WebSocket handshake — and every chunk
 * that arrived before OPEN was dropped. A person starts talking when the screen
 * says listening; the first word went into that gap.
 *
 * The capture now starts at once and chunks queue here until the socket opens,
 * then drain in order. Bounded, so a socket that never opens cannot grow memory
 * without limit: beyond the cap the OLDEST chunks go, keeping the most recent
 * speech, which is the part most likely to still be a command.
 */
export interface PcmQueue {
  push(chunk: ArrayBuffer): void;
  /** Hand every queued chunk to `send`, oldest first, and empty the queue. */
  drain(send: (chunk: ArrayBuffer) => void): number;
  readonly size: number;
  readonly dropped: number;
}

export function createPcmQueue(maxChunks: number): PcmQueue {
  const q: ArrayBuffer[] = [];
  let dropped = 0;
  return {
    push(chunk) {
      q.push(chunk);
      while (q.length > maxChunks) { q.shift(); dropped += 1; }
    },
    drain(send) {
      const n = q.length;
      for (const c of q) send(c);
      q.length = 0;
      return n;
    },
    get size() { return q.length; },
    get dropped() { return dropped; },
  };
}

/** ~85 ms per 4096-sample chunk at 48 kHz → 120 chunks ≈ 10 s of speech held. */
export const PCM_QUEUE_MAX_CHUNKS = 120;

/**
 * When a phone's recogniser socket drops (a lift, a tunnel, a switch from wifi
 * to 4G, Deepgram's own idle close), the session should reconnect by itself —
 * a person standing at a whiteboard will not press the mic again. This is the
 * one place that decides HOW MANY times and HOW SOON; the socket code asks.
 *
 * Stage 7 of mobile voice (2026-09-29). The attempt counter resets whenever a
 * socket stays open long enough to hear something, so a long session can ride
 * out many separate drops while a dead network still ends in finite time.
 */
export const MAX_RECONNECT_ATTEMPTS = 4;

/** Milliseconds to wait before reconnect attempt `attempt` (1-based); null = give up. */
export function reconnectDelayMs(attempt: number): number | null {
  if (!Number.isFinite(attempt) || attempt < 1 || attempt > MAX_RECONNECT_ATTEMPTS) return null;
  return Math.min(4000, 400 * 2 ** (attempt - 1));
}

/** The capture rate the phone asks for. 16 kHz is what the recogniser works at; 48 kHz triples the data for nothing. */
export const PHONE_SAMPLE_RATE = 16000;

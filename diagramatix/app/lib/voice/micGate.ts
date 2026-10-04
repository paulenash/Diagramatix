/**
 * The microphone gate: while Diagramatix is SPEAKING, what the microphone hears is its own voice, not a command.
 *
 * Plan layer 2 (diagramatix-voice-feedback-2026-09-25.md): "while Diagramatix is speaking, ignore what the microphone
 * hears, except the stop and cancel words". The gate stays shut a moment AFTER the voice ends (`TAIL_MS`) because the
 * recogniser finalises the tail of what it heard some hundreds of milliseconds late — the last word of a reply would
 * otherwise arrive as the first word of a "command".
 *
 * A tiny module-level state, because there is exactly one speaker (speaker.ts) and the voice session reads the gate
 * from a callback that outlives any render. Pure apart from that state; `now` is passed in so tests need no clock.
 */

/** How long the gate stays shut after the voice stops. */
export const MIC_GATE_TAIL_MS = 700;

let speaking = false;
let endedAt = 0;

/** Called by whatever plays audio, on every start and stop. */
export function noteSpeaking(on: boolean, now: number = Date.now()): void {
  if (speaking && !on) endedAt = now;
  speaking = on;
}

/** Is the microphone's transcript to be ignored right now? */
export function isMicGated(now: number = Date.now()): boolean {
  return speaking || now - endedAt < MIC_GATE_TAIL_MS;
}

/** For tests. */
export function resetMicGate(): void {
  speaking = false;
  endedAt = 0;
}

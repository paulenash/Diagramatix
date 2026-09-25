/**
 * Where the voice preferences live — ONE place for the localStorage keys.
 *
 * Two surfaces read the same chosen voice: the Voice Assist bar (spoken replies)
 * and Animate (narration). The keys were written out by hand in the first of
 * those, which is how a preference ends up saved under one name and read under
 * another. They are here instead, with the reads and writes that use them.
 *
 * Every accessor swallows its own failure: localStorage throws in a private
 * window and can come back empty after a clear, and a missing preference must
 * fall back to the default rather than break the surface that asked.
 */

import { isValidTtsVoice, DEFAULT_TTS_VOICE, type TtsVoice } from "./speakParams";
import type { SpeechVerbosity } from "./spokenText";

const KEY = {
  speak: "dgx.voice-assist.speak-enabled",
  voice: "dgx.voice-assist.voice",
  verbosity: "dgx.voice-assist.verbosity",
  narrate: "dgx.animate.narrate",
} as const;

/** Questions and refusals; successes stay silent. Paul's choice, 2026-09-25. */
export const DEFAULT_VERBOSITY: SpeechVerbosity = "problems";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* a preference that cannot be saved is not worth breaking a click over */
  }
}

export function readVoice(): TtsVoice {
  const v = read(KEY.voice);
  return isValidTtsVoice(v) ? v : DEFAULT_TTS_VOICE;
}
export function writeVoice(v: TtsVoice): void {
  write(KEY.voice, v);
}

const VERBOSITIES: readonly SpeechVerbosity[] = ["off", "questions", "problems", "everything"];

export function readVerbosity(): SpeechVerbosity {
  const v = read(KEY.verbosity);
  return VERBOSITIES.includes(v as SpeechVerbosity) ? (v as SpeechVerbosity) : DEFAULT_VERBOSITY;
}
export function writeVerbosity(v: SpeechVerbosity): void {
  write(KEY.verbosity, v);
}

/** Spoken replies are OFF until asked for, on every surface. */
export function readSpeakEnabled(): boolean {
  return read(KEY.speak) === "true";
}
export function writeSpeakEnabled(on: boolean): void {
  write(KEY.speak, on ? "true" : "false");
}

/** Animate narration, remembered separately from the reply toggle. */
export function readNarrate(): boolean {
  return read(KEY.narrate) === "true";
}
export function writeNarrate(on: boolean): void {
  write(KEY.narrate, on ? "true" : "false");
}

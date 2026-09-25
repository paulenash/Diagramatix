/**
 * The speaking voice's settings, in ONE place — the mirror of `asrParams.ts`.
 *
 * On Deepgram's `/v1/speak` the VOICE IS THE MODEL: `?model=aura-2-theia-en`.
 * There is no separate `voice` parameter, and sending one is silently ignored —
 * which is how the first cut of this file shipped `model=aura-2-theia-en` with
 * the caller's choice tacked on beside it, so all four voices spoke as Theia and
 * the panel built to compare them could not have told anyone. Hence the guard in
 * `tests/voice/speak-params.test.ts`: the chosen voice must reach `model`.
 */

/** The four Aura-2 voices Diagramatix offers. Australian first — this is an Australian product. */
export const TTS_VOICES = [
  "aura-2-theia-en",
  "aura-2-hyperion-en",
  "aura-2-pandora-en",
  "aura-2-draco-en",
] as const;

export type TtsVoice = (typeof TTS_VOICES)[number];

/**
 * How each voice is introduced on screen. Only what Deepgram's documentation
 * says (read 2026-09-25): it describes the two Australian voices and gives the
 * British ones no adjectives, so neither does this.
 */
export const TTS_VOICE_INFO: Record<TtsVoice, { name: string; accent: string; description: string }> = {
  "aura-2-theia-en": { name: "Theia", accent: "Australian", description: "feminine — expressive, polite, sincere" },
  "aura-2-hyperion-en": { name: "Hyperion", accent: "Australian", description: "masculine — caring, warm, empathetic" },
  "aura-2-pandora-en": { name: "Pandora", accent: "British", description: "feminine" },
  "aura-2-draco-en": { name: "Draco", accent: "British", description: "masculine" },
};

/** Theia, Australian and feminine — Paul's choice, 2026-09-25. */
export const DEFAULT_TTS_VOICE: TtsVoice = "aura-2-theia-en";

/** mp3, so playback can start before the whole reply has arrived. */
export const TTS_ENCODING = "mp3";

/**
 * Deepgram's cap per request. The caller splits longer text by sentence; the
 * route refuses anything over this with a 413 rather than sending it and having
 * Deepgram truncate mid-word.
 */
export const TTS_MAX_CHARS = 2000;

export function isValidTtsVoice(v: unknown): v is TtsVoice {
  return typeof v === "string" && (TTS_VOICES as readonly string[]).includes(v);
}

/**
 * Why something is being said. Recorded on every usage row, so the AI Usage
 * report can tell a narrated walkthrough (many short lines, one per element) from
 * a Voice Assist conversation. Listed once: the route validates against this and
 * the speaker's callers are typed by it.
 */
export const SPEECH_PURPOSES = ["question", "refusal", "success", "narration", "compare"] as const;
export type SpeechPurpose = (typeof SPEECH_PURPOSES)[number];

export function isSpeechPurpose(v: unknown): v is SpeechPurpose {
  return typeof v === "string" && (SPEECH_PURPOSES as readonly string[]).includes(v);
}

/**
 * Query for `POST https://api.deepgram.com/v1/speak?…`.
 *
 * The route (`app/api/ai/speak/route.ts`) is the only caller — the key is
 * server-side, so nothing on the client builds one of these.
 */
export function speakParams(voice: TtsVoice): URLSearchParams {
  return new URLSearchParams({
    model: voice,
    encoding: TTS_ENCODING,
  });
}

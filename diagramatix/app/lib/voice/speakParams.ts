/**
 * Text-to-speech settings, in ONE place.
 *
 * Mirror of asrParams.ts — the one place to build Deepgram /v1/speak params.
 * Guards ensure the route never reaches Deepgram with a parameter built elsewhere.
 */

export const TTS_MODEL = "aura-2-theia-en";

export const TTS_ENCODING = "mp3";

/**
 * Deepgram's TTS voices: Australian (Theia, Hyperion), British (Pandora, Draco).
 * Names are `aura-2-<voice>-en`. Flux voices live in a separate wss path.
 */
export const TTS_VOICES = ["aura-2-theia-en", "aura-2-hyperion-en", "aura-2-pandora-en", "aura-2-draco-en"] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export function isValidTtsVoice(v: unknown): v is TtsVoice {
  return typeof v === "string" && TTS_VOICES.includes(v as TtsVoice);
}

/**
 * Request params for POST https://api.deepgram.com/v1/speak?…
 *
 * The route (`app/api/ai/speak/route.ts`) is the ONLY caller.
 * Client code never touches this — speakParams sits server-side.
 */
export function speakParams(voice: TtsVoice): URLSearchParams {
  return new URLSearchParams({
    model: TTS_MODEL,
    encoding: TTS_ENCODING,
    voice,
  });
}

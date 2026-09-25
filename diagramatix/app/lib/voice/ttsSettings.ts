/**
 * The two settings a SuperAdmin controls from the Text to Speech tile — server-only.
 *
 *   `tts.enabled` — the master switch. Missing means ON: a brake, not a gate, so a
 *                   fresh database speaks. Off means nobody hears the Deepgram
 *                   voice, SuperAdmins included; the route answers 503 and the
 *                   browser stays silent rather than substituting its own voice,
 *                   so switching it off is never mistaken for a fault.
 *   `tts.voice`   — the default voice. A user who has picked one keeps theirs.
 */

import { prisma } from "@/app/lib/db";
import { DEFAULT_TTS_VOICE, isValidTtsVoice, type TtsVoice } from "./speakParams";

export const TTS_ENABLED_KEY = "tts.enabled";
export const TTS_VOICE_KEY = "tts.voice";

export interface TtsSettings {
  enabled: boolean;
  defaultVoice: TtsVoice;
}

/** Pure: the settings from whatever AppSetting rows exist. */
export function parseTtsSettings(rows: ReadonlyArray<{ key: string; value: string }>): TtsSettings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const voice = get(TTS_VOICE_KEY);
  return {
    enabled: get(TTS_ENABLED_KEY) !== "false",
    defaultVoice: isValidTtsVoice(voice) ? voice : DEFAULT_TTS_VOICE,
  };
}

export async function readTtsSettings(): Promise<TtsSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [TTS_ENABLED_KEY, TTS_VOICE_KEY] } },
    select: { key: true, value: true },
  });
  return parseTtsSettings(rows);
}

export async function writeTtsSettings(patch: Partial<TtsSettings>): Promise<void> {
  const writes: Array<{ key: string; value: string }> = [];
  if (patch.enabled !== undefined) writes.push({ key: TTS_ENABLED_KEY, value: patch.enabled ? "true" : "false" });
  if (patch.defaultVoice !== undefined) writes.push({ key: TTS_VOICE_KEY, value: patch.defaultVoice });
  await prisma.$transaction(
    writes.map((w) =>
      prisma.appSetting.upsert({ where: { key: w.key }, create: w, update: { value: w.value } }),
    ),
  );
}

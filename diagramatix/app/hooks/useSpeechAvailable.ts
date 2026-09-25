/**
 * May this user hear Diagramatix speak, and in which voice by default — asked
 * once per tab (the answer is held for the tab's life, so a grant made
 * meanwhile shows after a reload).
 *
 * `null` while the answer is on its way, so a surface can draw nothing rather
 * than flash a speech control that then disappears. A failed request counts as
 * "no": speech is off by default, and a doubtful answer should look like that.
 */

import { useEffect, useState } from "react";
import { DEFAULT_TTS_VOICE, isValidTtsVoice, type TtsVoice } from "@/app/lib/voice/speakParams";

export interface SpeechAvailability {
  available: boolean;
  /** The SuperAdmin's choice on the Text to Speech tile; a user's own pick beats it. */
  defaultVoice: TtsVoice;
}

const NO: SpeechAvailability = { available: false, defaultVoice: DEFAULT_TTS_VOICE };
let cached: Promise<SpeechAvailability> | null = null;

function ask(): Promise<SpeechAvailability> {
  cached ??= fetch("/api/ai/speak", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : NO))
    .then((j: { available?: unknown; defaultVoice?: unknown }) => ({
      available: j.available === true,
      defaultVoice: isValidTtsVoice(j.defaultVoice) ? j.defaultVoice : DEFAULT_TTS_VOICE,
    }))
    .catch(() => NO);
  return cached;
}

export function useSpeechAvailable(): SpeechAvailability | null {
  const [answer, setAnswer] = useState<SpeechAvailability | null>(null);
  useEffect(() => {
    let alive = true;
    void ask().then((a) => { if (alive) setAnswer(a); });
    return () => { alive = false; };
  }, []);
  return answer;
}

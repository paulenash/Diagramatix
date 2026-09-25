/**
 * Voice Assist's spoken-reply state: the toggle, the voice, how much to say, and
 * whether the voice is sounding right now (the mic gate reads that).
 *
 * The preferences are read and written through `voicePrefs.ts`, which Animate's
 * narration shares — one set of keys, not two.
 */

import { useEffect, useState, useCallback } from "react";
import type { TtsVoice } from "@/app/lib/voice/speakParams";
import { DEFAULT_TTS_VOICE } from "@/app/lib/voice/speakParams";
import { speaker, type SpeechPurpose } from "@/app/lib/voice/speaker";
import type { SpeechVerbosity } from "@/app/lib/voice/spokenText";
import {
  DEFAULT_VERBOSITY,
  readSpeakEnabled, writeSpeakEnabled,
  readVoice, writeVoice,
  readVerbosity, writeVerbosity,
} from "@/app/lib/voice/voicePrefs";

export function useVoiceAssist() {
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [voice, setVoiceState] = useState<TtsVoice>(DEFAULT_TTS_VOICE);
  const [verbosity, setVerbosityState] = useState<SpeechVerbosity>(DEFAULT_VERBOSITY);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read after mount, not in the initialiser, so the server render matches.
  useEffect(() => {
    setSpeakEnabled(readSpeakEnabled());
    setVoiceState(readVoice());
    setVerbosityState(readVerbosity());
  }, []);

  const toggleSpeak = useCallback((on: boolean) => {
    setSpeakEnabled(on);
    writeSpeakEnabled(on);
    setError(null);
    if (!on) {
      speaker.stop();
      setIsSpeaking(false);
    }
  }, []);

  const setVoice = useCallback((v: TtsVoice) => {
    setVoiceState(v);
    writeVoice(v);
  }, []);

  const setVerbosity = useCallback((v: SpeechVerbosity) => {
    setVerbosityState(v);
    writeVerbosity(v);
  }, []);

  const speak = useCallback(
    (text: string, purpose: SpeechPurpose) => {
      if (!speakEnabled) return;
      speaker.speak(text, voice, purpose, {
        onSpeakingChange: setIsSpeaking,
        onError: setError,
      });
    },
    [speakEnabled, voice],
  );

  return {
    speakEnabled,
    toggleSpeak,
    voice,
    setVoice,
    verbosity,
    setVerbosity,
    isSpeaking,
    /** While the voice is sounding the mic must not act on what it hears. */
    micGated: isSpeaking,
    error,
    speak,
  };
}

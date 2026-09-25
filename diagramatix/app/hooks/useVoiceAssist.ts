/**
 * Voice Assist speaker state and preferences.
 *
 * Manages:
 * - speak enabled toggle
 * - voice choice (persists to localStorage)
 * - verbosity (persists to localStorage)
 * - speaker queue state (isSpeaking)
 * - mic gate during playback
 */

import { useEffect, useState, useCallback } from "react";
import type { TtsVoice } from "@/app/lib/voice/speakParams";
import { speaker } from "@/app/lib/voice/speaker";
import type { SpeechVerbosity } from "@/app/lib/voice/spokenText";

const SPEAK_KEY = "dgx.voice-assist.speak-enabled";
const VOICE_KEY = "dgx.voice-assist.voice";
const VERBOSITY_KEY = "dgx.voice-assist.verbosity";

export function useVoiceAssist() {
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [voice, setVoiceState] = useState<TtsVoice>("aura-2-theia-en");
  const [verbosity, setVerbosityState] = useState<SpeechVerbosity>("problems");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micGated, setMicGated] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SPEAK_KEY);
      if (saved) setSpeakEnabled(JSON.parse(saved));
      const savedVoice = localStorage.getItem(VOICE_KEY);
      if (savedVoice) setVoiceState(JSON.parse(savedVoice));
      const savedVerbosity = localStorage.getItem(VERBOSITY_KEY);
      if (savedVerbosity) setVerbosityState(JSON.parse(savedVerbosity));
    } catch {
      // localStorage may be unavailable or corrupted — use defaults
    }
  }, []);

  const toggleSpeak = useCallback((enabled: boolean) => {
    setSpeakEnabled(enabled);
    try {
      localStorage.setItem(SPEAK_KEY, JSON.stringify(enabled));
    } catch {
      // ignore
    }
    if (!enabled) {
      speaker.stop();
      setIsSpeaking(false);
      setMicGated(false);
    }
  }, []);

  const setVoice = useCallback((v: TtsVoice) => {
    setVoiceState(v);
    try {
      localStorage.setItem(VOICE_KEY, JSON.stringify(v));
    } catch {
      // ignore
    }
  }, []);

  const setVerbosity = useCallback((v: SpeechVerbosity) => {
    setVerbosityState(v);
    try {
      localStorage.setItem(VERBOSITY_KEY, JSON.stringify(v));
    } catch {
      // ignore
    }
  }, []);

  const speak = useCallback(
    (text: string, purpose: "question" | "refusal" | "success") => {
      if (!speakEnabled) return;
      setMicGated(true);
      speaker.speak(text, voice, purpose, (speaking) => {
        setIsSpeaking(speaking);
        if (!speaking) setMicGated(false);
      });
    },
    [speakEnabled, voice]
  );

  return {
    speakEnabled,
    toggleSpeak,
    voice,
    setVoice,
    verbosity,
    setVerbosity,
    isSpeaking,
    micGated,
    speak,
  };
}

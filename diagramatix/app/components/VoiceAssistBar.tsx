"use client";

import { useState } from "react";
import type { TtsVoice } from "@/app/lib/voice/speakParams";
import { TTS_VOICES } from "@/app/lib/voice/speakParams";
import type { SpeechVerbosity } from "@/app/lib/voice/spokenText";

/**
 * Voice Assist bar: toggle, voice picker, verbosity control, mic gate status.
 *
 * Lives at the top of the VoiceAssistBar in DiagramEditor.
 * Slice 1: display only (no controls yet).
 * Slice 2: full controls + integration with speaker.
 */

interface Props {
  speakEnabled: boolean;
  onToggleSpeak: (enabled: boolean) => void;
  voice: TtsVoice;
  onVoiceChange: (voice: TtsVoice) => void;
  verbosity: SpeechVerbosity;
  onVerbosityChange: (v: SpeechVerbosity) => void;
  isSpeaking: boolean;
  micGated: boolean;
}

export function VoiceAssistBar({
  speakEnabled,
  onToggleSpeak,
  voice,
  onVoiceChange,
  verbosity,
  onVerbosityChange,
  isSpeaking,
  micGated,
}: Props) {
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [verbosityMenuOpen, setVerbosityMenuOpen] = useState(false);

  const voiceLabel = {
    "aura-2-theia-en": "Theia (AU, F)",
    "aura-2-hyperion-en": "Hyperion (AU, M)",
    "aura-2-pandora-en": "Pandora (UK, F)",
    "aura-2-draco-en": "Draco (UK, M)",
  }[voice];

  const verbosityLabel = {
    off: "Silent",
    questions: "Questions",
    problems: "Questions + Refusals",
    everything: "Everything",
  }[verbosity];

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-white border-b border-gray-200 text-xs">
      {/* Speak toggle */}
      <button
        onClick={() => onToggleSpeak(!speakEnabled)}
        className={`px-2 py-1 rounded font-medium transition-colors ${
          speakEnabled
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
        title={speakEnabled ? "Spoken replies ON" : "Spoken replies OFF"}
      >
        🔊 {speakEnabled ? "On" : "Off"}
      </button>

      {/* Voice picker */}
      {speakEnabled && (
        <div className="relative">
          <button
            onClick={() => setVoiceMenuOpen(!voiceMenuOpen)}
            className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-700"
            title="Choose TTS voice"
          >
            {voiceLabel}
          </button>
          {voiceMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50">
              {TTS_VOICES.map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    onVoiceChange(v);
                    setVoiceMenuOpen(false);
                  }}
                  className={`block w-full text-left px-3 py-2 hover:bg-blue-50 ${
                    voice === v ? "bg-blue-100 font-medium" : ""
                  }`}
                >
                  {voiceLabel === {
                    "aura-2-theia-en": "Theia (AU, F)",
                    "aura-2-hyperion-en": "Hyperion (AU, M)",
                    "aura-2-pandora-en": "Pandora (UK, F)",
                    "aura-2-draco-en": "Draco (UK, M)",
                  }[v]
                    ? {
                        "aura-2-theia-en": "Theia (AU, F)",
                        "aura-2-hyperion-en": "Hyperion (AU, M)",
                        "aura-2-pandora-en": "Pandora (UK, F)",
                        "aura-2-draco-en": "Draco (UK, M)",
                      }[v]
                    : v}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Verbosity selector */}
      {speakEnabled && (
        <div className="relative">
          <button
            onClick={() => setVerbosityMenuOpen(!verbosityMenuOpen)}
            className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-700"
            title="Choose what gets spoken"
          >
            {verbosityLabel}
          </button>
          {verbosityMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50">
              {(["off", "questions", "problems", "everything"] as SpeechVerbosity[]).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    onVerbosityChange(v);
                    setVerbosityMenuOpen(false);
                  }}
                  className={`block w-full text-left px-3 py-2 hover:bg-blue-50 ${
                    verbosity === v ? "bg-blue-100 font-medium" : ""
                  }`}
                >
                  {
                    {
                      off: "Silent",
                      questions: "Questions only",
                      problems: "Questions + Refusals",
                      everything: "Everything",
                    }[v]
                  }
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status indicators */}
      {speakEnabled && (
        <>
          {isSpeaking && (
            <span className="text-blue-600 font-medium flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              Speaking…
            </span>
          )}
          {micGated && !isSpeaking && (
            <span className="text-orange-600 flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-orange-600 rounded-full" />
              Mic gate ON
            </span>
          )}
        </>
      )}
    </div>
  );
}

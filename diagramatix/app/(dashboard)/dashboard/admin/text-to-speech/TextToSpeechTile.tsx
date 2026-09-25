"use client";

import { useState } from "react";

/**
 * Text-to-Speech tile for SuperAdmin Tools grid.
 *
 * Slice 1: master switch (org policy) + test voice button.
 * Slice 2: per-user access toggles + side-by-side comparison panel.
 */

interface Props {
  /** Called when the user clicks the master switch or "Test voice" */
  onTestVoice?: () => void;
}

export function TextToSpeechTile({ onTestVoice }: Props) {
  const [testing, setTesting] = useState(false);

  async function handleTestVoice() {
    setTesting(true);
    try {
      // Slice 1: just navigate to the test voice UI.
      // Slice 2: open the side-by-side comparison modal.
      if (onTestVoice) {
        onTestVoice();
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleTestVoice}
        disabled={testing}
        className="text-xs text-white font-medium border border-blue-600 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded px-2 py-1 w-fit"
        title="Hear the four Aura-2 voices (Theia, Hyperion, Pandora, Draco)"
      >
        {testing ? "Testing…" : "🔊 Test Voice"}
      </button>
      <p className="text-[11px] text-gray-500 leading-snug">
        Spoken replies to Voice Assist questions and refusals. Deepgram Aura-2 (Australian & British voices).
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { TtsVoice } from "@/app/lib/voice/speakParams";
import { TTS_VOICES } from "@/app/lib/voice/speakParams";

/**
 * Slice 1 test panel: hear all four Aura-2 voices.
 *
 * Each voice plays the same sentence: "rename Task 1 to Review Email".
 * Time-to-first-sound and total length shown for each.
 */

interface VoiceTest {
  voice: TtsVoice;
  label: string;
  description: string;
}

const VOICE_TESTS: VoiceTest[] = [
  {
    voice: "aura-2-theia-en",
    label: "Theia",
    description: "Australian, feminine — expressive, polite, sincere",
  },
  {
    voice: "aura-2-hyperion-en",
    label: "Hyperion",
    description: "Australian, masculine — caring, warm, empathetic",
  },
  {
    voice: "aura-2-pandora-en",
    label: "Pandora",
    description: "British, feminine — professional, clear",
  },
  {
    voice: "aura-2-draco-en",
    label: "Draco",
    description: "British, masculine — authoritative, confident",
  },
];

const TEST_SENTENCE = "rename Task 1 to Review Email";

export function TestVoicePanel() {
  const [playing, setPlaying] = useState<TtsVoice | null>(null);
  const [results, setResults] = useState<Partial<Record<TtsVoice, { duration?: number; error?: string }>>>({});

  async function testVoice(voice: TtsVoice) {
    setPlaying(voice);
    try {
      const res = await fetch("/api/ai/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: TEST_SENTENCE, voice, purpose: "question" }),
      });
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      const audioBuffer = await res.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(audioBuffer.slice(0));
      const duration = Math.round(decoded.duration * 1000);

      // Play it
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.start(0);

      setResults((p) => ({ ...p, [voice]: { duration } }));
      setTimeout(() => setPlaying(null), duration);
    } catch (err) {
      setResults((p) => ({
        ...p,
        [voice]: { error: err instanceof Error ? err.message : "Failed" },
      }));
      setPlaying(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <p className="text-xs text-gray-600 mb-4 max-w-3xl">
        Test sentence: <strong>"{TEST_SENTENCE}"</strong>
      </p>

      <div className="space-y-2">
        {VOICE_TESTS.map((v) => {
          const result = results[v.voice];
          return (
            <button
              key={v.voice}
              onClick={() => testVoice(v.voice)}
              disabled={playing !== null}
              className="w-full text-left px-4 py-3 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{v.label}</div>
                  <div className="text-xs text-gray-600">{v.description}</div>
                </div>
                <div className="text-right shrink-0">
                  {playing === v.voice && (
                    <span className="text-xs text-blue-600 font-medium">Playing…</span>
                  )}
                  {result?.duration !== undefined && (
                    <span className="text-xs text-gray-500">{(result.duration / 1000).toFixed(1)}s</span>
                  )}
                  {result?.error && (
                    <span className="text-xs text-red-600">{result.error}</span>
                  )}
                  {!result && playing !== v.voice && (
                    <span className="text-xs text-gray-400">▶ Play</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <details className="mt-6">
        <summary className="text-xs text-gray-500 cursor-pointer">About TTS voices</summary>
        <div className="mt-2 text-xs text-gray-600 space-y-1">
          <p>
            <strong>Aura-2 (Deepgram)</strong> · $0.030 per 1,000 characters · mp3 audio · Australian and British accents.
          </p>
          <p>
            <strong>Theia & Hyperion</strong> are Australian, used for Voice Assist replies. <strong>Pandora & Draco</strong> are British.
          </p>
          <p>
            Slice 1 (foundation only) · Slice 2 adds per-user toggles, side-by-side comparison, and live usage tracking.
          </p>
        </div>
      </details>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Microphone self-test for mobile: shows a live input-level meter, records a short
 * clip, and plays it back so the user can confirm their mic actually works before
 * relying on dictation. Uses MediaRecorder + an AnalyserNode (a different path from
 * the Deepgram dictation socket), so it also helps diagnose permission / hardware
 * problems independently of the speech engine.
 */
const MAX_MS = 8000;

export function MicTest({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "recorded" | "error">("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | undefined>(undefined);
  const acRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const urlRef = useRef<string | null>(null);

  function teardownCapture() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = undefined;
    timerRef.current = undefined;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    acRef.current?.close().catch(() => {});
    acRef.current = null;
    setLevel(0);
  }

  // Full cleanup on unmount (also revoke the last object URL).
  useEffect(() => () => {
    teardownCapture();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function start() {
    setError(null);
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setAudioUrl(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Live level meter.
      const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      acRef.current = ac;
      await ac.resume().catch(() => {}); // iOS needs an explicit resume within a gesture
      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i] - 128) / 128; if (v > peak) peak = v; }
        setLevel(peak);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Record.
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setAudioUrl(url);
        setState("recorded");
      };
      rec.start();
      setState("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          const n = e + 100;
          if (n >= MAX_MS) stop();
          return n;
        });
      }, 100);
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      const none = e instanceof DOMException && e.name === "NotFoundError";
      setError(
        denied ? "Microphone permission was denied. Allow it in your browser's site settings, then try again."
          : none ? "No microphone was found on this device."
          : e instanceof Error ? e.message : "Could not access the microphone.",
      );
      setState("error");
      teardownCapture();
    }
  }

  function stop() {
    try { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); } catch { /* noop */ }
    teardownCapture();
  }

  const secs = (elapsed / 1000).toFixed(1);

  return (
    <div className={`rounded-lg border border-gray-200 bg-gray-50 ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">Microphone test</span>
        {state === "recording" && <span className="text-[11px] text-red-600 tabular-nums">● {secs}s / {MAX_MS / 1000}s</span>}
      </div>

      {/* Live level meter */}
      <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden mb-2">
        <div className="h-full bg-green-500 transition-[width] duration-75"
          style={{ width: `${Math.min(100, Math.round(level * 140))}%` }} />
      </div>

      {state === "recording" ? (
        <p className="text-[11px] text-gray-500 mb-2">Speak now — the bar should move. Tap Stop when done.</p>
      ) : state === "idle" ? (
        <p className="text-[11px] text-gray-500 mb-2">Tap Record, say a few words, then play it back to confirm your mic works.</p>
      ) : null}

      {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}

      {audioUrl && (
        <div className="mb-2">
          <p className="text-[11px] text-gray-600 mb-1">Playback — you should hear what you just said:</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audioUrl} controls className="w-full h-9" />
        </div>
      )}

      <div className="flex gap-2">
        {state === "recording" ? (
          <button onClick={stop} className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg active:bg-red-700">■ Stop</button>
        ) : (
          <button onClick={start} className="flex-1 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg active:bg-pink-700">
            {state === "recorded" || state === "error" ? "Record again" : "🎤 Record"}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { transcribeAudioBlob, parseVtt, isVttFile } from "@/app/lib/dictation/audioInput";

interface Props {
  /** Called with the speaker-labelled transcript once ready. */
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  /** Reports record/transcribe activity so the host can disable Generate. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}

/**
 * Turn a meeting into a diagram: record audio in-browser, upload an audio file,
 * or upload a Microsoft Teams .vtt transcript. Audio is transcribed via the
 * server (Deepgram, diarized); .vtt is parsed locally. The resulting transcript
 * is handed back via onTranscript for the AI Generate prompt.
 */
export function AudioToProcessButton({ onTranscript, onError, onBusyChange, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => onBusyChange?.(recording || busy), [recording, busy, onBusyChange]);
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try { recorderRef.current?.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
  }, []);

  const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined";

  async function startRecording() {
    onError?.("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError?.("Microphone unavailable or blocked.");
      return;
    }
    chunksRef.current = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      await runTranscription(() => transcribeAudioBlob(blob));
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    setSecs(0);
    timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    try { recorderRef.current?.stop(); } catch { /* */ }
  }

  async function handleFile(file: File) {
    onError?.("");
    if (isVttFile(file)) {
      try {
        const text = parseVtt(await file.text());
        if (!text.trim()) { onError?.("That .vtt had no readable transcript."); return; }
        onTranscript(text);
      } catch (e) {
        onError?.(e instanceof Error ? e.message : "Could not read the .vtt file.");
      }
      return;
    }
    await runTranscription(() => transcribeAudioBlob(file));
  }

  async function runTranscription(fn: () => Promise<string>) {
    setBusy(true);
    try {
      const text = await fn();
      if (text) onTranscript(text);
      else onError?.("No speech detected.");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setBusy(false);
    }
  }

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const btn = "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border disabled:opacity-50";

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".vtt,text/vtt,audio/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      {canRecord && (
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={disabled || busy}
          className={`${btn} ${recording ? "text-red-600 border-red-300 bg-red-50 hover:bg-red-100" : "text-gray-500 border-gray-300 hover:bg-gray-50"}`}
          title="Record a process discussion, then turn it into a diagram"
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 11a3 3 0 0 0 3-3V4a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3z" />
            <path d="M13 8a1 1 0 1 0-2 0 3 3 0 0 1-6 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V14H5.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1H9v-1.1A5 5 0 0 0 13 8z" />
          </svg>
          {recording ? `Stop ${mmss}` : "Record"}
        </button>
      )}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={disabled || busy || recording}
        className={`${btn} text-gray-500 border-gray-300 hover:bg-gray-50`}
        title="Upload an audio file or a Microsoft Teams .vtt transcript to turn into a diagram"
      >
        {busy ? "Transcribing…" : "Audio / VTT"}
      </button>
    </>
  );
}

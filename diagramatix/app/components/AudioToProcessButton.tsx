"use client";

import { useEffect, useRef, useState } from "react";
import { transcribeAudioBlob, parseVtt, isVttFile, refineTranscript } from "@/app/lib/dictation/audioInput";

interface Props {
  /** Called with the transcript (or AI-tidied description) for the prompt. */
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  /** Surfaces AI-noted open questions the recording left ambiguous. */
  onNote?: (message: string) => void;
  /** Hands the AI's open questions to the host so it can offer "Ask for
   *  Clarification". Takes precedence over onNote when provided. */
  onFeedback?: (questions: string[]) => void;
  /** Reports record/transcribe/tidy activity so the host can disable Generate. */
  onBusyChange?: (busy: boolean) => void;
  /** Reports the current processing phase so the host can show a throbber. */
  onPhaseChange?: (phase: null | "transcribing" | "reading" | "tidying") => void;
  /** Target notation, passed to the AI tidy pass for better phrasing. */
  diagramType?: string;
  disabled?: boolean;
}

/**
 * Turn a meeting into a diagram: record audio in-browser, upload an audio file,
 * or upload a Microsoft Teams .vtt transcript. Audio is transcribed via the
 * server (Deepgram, diarized); .vtt is parsed locally. With "AI tidy" on, the
 * raw transcript is cleaned into an ordered process description first (and any
 * open questions are surfaced). The result is handed back via onTranscript.
 */
export function AudioToProcessButton({ onTranscript, onError, onNote, onFeedback, onBusyChange, onPhaseChange, diagramType, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<null | "transcribing" | "reading" | "tidying">(null);
  const [tidy, setTidy] = useState(true);
  const [secs, setSecs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = phase !== null;
  useEffect(() => onBusyChange?.(recording || busy), [recording, busy, onBusyChange]);
  useEffect(() => onPhaseChange?.(phase), [phase, onPhaseChange]);
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try { recorderRef.current?.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
  }, []);

  const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined";

  // Transcribe/parse → optionally AI-tidy → deliver to the prompt.
  async function process(getRaw: () => Promise<string>, firstPhase: "transcribing" | "reading") {
    onError?.("");
    setPhase(firstPhase);
    try {
      const raw = (await getRaw()).trim();
      if (!raw) { onError?.("No usable speech / transcript found."); return; }
      if (!tidy) { onTranscript(raw); return; }
      setPhase("tidying");
      const { description, openQuestions } = await refineTranscript(raw, diagramType);
      onTranscript(description);
      if (openQuestions.length) {
        if (onFeedback) onFeedback(openQuestions);
        else onNote?.("AI noted open questions to resolve:\n• " + openQuestions.join("\n• "));
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not process the audio.");
    } finally {
      setPhase(null);
    }
  }

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
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      void process(() => transcribeAudioBlob(blob), "transcribing");
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

  function handleFile(file: File) {
    if (isVttFile(file)) void process(async () => parseVtt(await file.text()), "reading");
    else void process(() => transcribeAudioBlob(file), "transcribing");
  }

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const btn = "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border disabled:opacity-50";
  const uploadLabel = phase === "transcribing" ? "Transcribing…"
    : phase === "reading" ? "Reading…"
    : phase === "tidying" ? "Tidying…"
    : "Audio / VTT";

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
        title="Upload an audio file or a Microsoft Teams / Zoom .vtt transcript to turn into a diagram"
      >
        {uploadLabel}
      </button>
      <label className="flex items-center gap-0.5 text-[10px] text-gray-500 select-none cursor-pointer"
        title="Clean the transcript into an ordered process description before generating (recommended for meeting recordings)">
        <input type="checkbox" checked={tidy} onChange={(e) => setTidy(e.target.checked)} disabled={busy} className="w-3 h-3" />
        AI tidy
      </label>
    </>
  );
}

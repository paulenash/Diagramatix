"use client";

/**
 * Mic Test & Replay, extracted from PlanPanel so any surface can reuse it.
 * Independent of dictation: grabs the raw audio stream, shows a live level meter
 * (so the user can confirm the browser actually hears the selected mic), and
 * records ~8 s for replay. Auto-stops after 8 s so the mic isn't held open.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useMicTest() {
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);            // 0–100
  const [device, setDevice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setTesting(false);
  }, []);

  const start = useCallback(async () => {
    setErr(null); setLevel(0); setDevice(null);
    setRecordingUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("This browser doesn't expose getUserMedia (mic access).");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as Error & { name?: string }).name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErr("Mic permission denied. Click the padlock in the address bar → Site settings → allow Microphone.");
      } else if (name === "NotFoundError") {
        setErr("No microphone detected by the browser.");
      } else {
        setErr(`Mic error: ${(e as Error).message ?? name ?? "unknown"}`);
      }
      return;
    }
    const track = stream.getAudioTracks()[0];
    setDevice(track?.label || "(unnamed device)");

    // Record so the user can hear what was captured.
    let recorder: MediaRecorder | null = null;
    const chunks: BlobPart[] = [];
    if (typeof MediaRecorder !== "undefined") {
      try {
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
        recorder.onstop = () => {
          if (chunks.length === 0) return;
          const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
          setRecordingUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
        };
        recorder.start();
      } catch { recorder = null; }
    }

    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const d = buf[i] - 128; sum += d * d; }
      const rms = Math.sqrt(sum / buf.length);          // 0–~128
      setLevel(Math.min(100, Math.round((rms / 64) * 100)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    setTesting(true);

    const cleanup = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch { /* */ }
      try { src.disconnect(); } catch { /* */ }
      try { ctx.close(); } catch { /* */ }
      stream.getTracks().forEach((t) => t.stop());
    };
    cleanupRef.current = cleanup;
    setTimeout(() => { if (cleanupRef.current === cleanup) stop(); }, 8000);
  }, [stop]);

  const toggle = useCallback(() => { if (testing) stop(); else void start(); }, [testing, start, stop]);

  useEffect(() => () => { cleanupRef.current?.(); }, []);
  useEffect(() => () => { if (recordingUrl) URL.revokeObjectURL(recordingUrl); }, [recordingUrl]);

  return { testing, level, device, err, recordingUrl, toggle };
}

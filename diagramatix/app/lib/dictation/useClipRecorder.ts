"use client";
/**
 * Record one short clip, as raw 16-bit PCM.
 *
 * The SHAPE is `useMicTest` — start, stop, a live level meter, an auto-stop, a
 * blob you can play back. The FORMAT is deliberately not: `useMicTest` uses
 * `MediaRecorder`, which gives Opus, and a corpus recorded through a lossy codec
 * would measure a pipeline the product does not have. This captures through the
 * same `ScriptProcessor` → Int16 path as `startDeepgram`, at the same
 * AudioContext sample rate, so the bytes stored are the bytes the live socket
 * would have received.
 *
 * Getting this wrong costs twenty minutes of somebody's voice and a corpus that
 * can no longer be compared with the first one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav, floatToInt16, peakLevel, SILENT_TAKE_PEAK } from "./wav";

export interface RecordedClip {
  wav: ArrayBuffer;
  sampleRate: number;
  durationMs: number;
  peak: number;
  /** For an <audio> element, revoked when the next clip replaces it. */
  url: string;
  /** True when the level never rose above the floor — a muted mic or the wrong device. */
  silent: boolean;
}

interface State {
  recording: boolean;
  level: number;
  error: string | null;
  clip: RecordedClip | null;
}

/** Nobody says a BPMN command for longer than this; a stuck recorder stops itself. */
const HARD_CAP_MS = 12_000;
/** Trailing quiet before the take ends on its own. */
const TRAILING_SILENCE_MS = 1500;
/** Level below which we call it quiet, for the auto-stop (not the silent-take test). */
const QUIET_LEVEL = 6;

export function useClipRecorder() {
  const [state, setState] = useState<State>({ recording: false, level: 0, error: null, clip: null });
  const stopRef = useRef<(() => void) | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => { stopRef.current?.(); }, []);

  const start = useCallback(async () => {
    if (stopRef.current) return;
    setState((s) => ({ ...s, error: null }));

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setState((s) => ({
        ...s,
        error: name === "NotAllowedError" ? "Microphone permission was refused."
          : name === "NotFoundError" ? "No microphone was found."
            : `Microphone error: ${(e as Error)?.message ?? name ?? "unknown"}`,
      }));
      return;
    }

    const AC: typeof AudioContext = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* best effort */ } }

    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    // A muted sink: the processor only fires while it is connected to the graph.
    const mute = ctx.createGain();
    mute.gain.value = 0;

    const chunks: Int16Array[] = [];
    let total = 0;
    let lastLoudAt = Date.now();
    let startedAt = Date.now();
    let finished = false;

    processor.onaudioprocess = (e) => {
      if (finished) return;
      const pcm = floatToInt16(e.inputBuffer.getChannelData(0));
      chunks.push(pcm);
      total += pcm.length;
      const lvl = peakLevel(pcm);
      setState((s) => (s.level === lvl ? s : { ...s, level: lvl }));
      const now = Date.now();
      if (lvl > QUIET_LEVEL) lastLoudAt = now;
      // Auto-stop: only after something was actually said, so a slow start does
      // not end the take before it begins.
      const saidSomething = now - startedAt > 600 && lastLoudAt > startedAt;
      if ((saidSomething && now - lastLoudAt > TRAILING_SILENCE_MS) || now - startedAt > HARD_CAP_MS) {
        finish();
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      try { processor.disconnect(); } catch { /* */ }
      try { source.disconnect(); } catch { /* */ }
      try { mute.disconnect(); } catch { /* */ }
      try { void ctx.close(); } catch { /* */ }
      stream.getTracks().forEach((t) => t.stop());
      stopRef.current = null;

      const all = new Int16Array(total);
      let at = 0;
      for (const c of chunks) { all.set(c, at); at += c.length; }
      const peak = peakLevel(all);
      const rate = Math.round(ctx.sampleRate);
      const wav = encodeWav(all, rate);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      urlRef.current = url;
      setState({
        recording: false,
        level: 0,
        error: null,
        clip: {
          wav, sampleRate: rate,
          durationMs: rate > 0 ? Math.round((all.length / rate) * 1000) : 0,
          peak, url,
          silent: peak < SILENT_TAKE_PEAK,
        },
      });
    };

    stopRef.current = finish;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    startedAt = Date.now();
    lastLoudAt = startedAt;
    setState({ recording: true, level: 0, error: null, clip: null });
  }, []);

  const discard = useCallback(() => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setState((s) => ({ ...s, clip: null }));
  }, []);

  useEffect(() => () => {
    stopRef.current?.();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  return { ...state, start, stop, discard };
}

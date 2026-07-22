"use client";

/**
 * SuperAdmin Screencast Studio — a Loom-style recorder mounted once at the root
 * shell so it's available in EVERY context and survives navigation + SuperAdmin
 * view-mode switches (it gates on real identity, passed as `enabled`).
 *
 * Captures the screen/tab (getDisplayMedia) + webcam (inset PiP) + a chosen mic,
 * composites them onto a canvas, records webm via MediaRecorder, then lets the
 * author review in-app and save locally (webm, or mp4 via /api/video/transcode).
 * Buffer publishing is a later slice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { insetRect, coverCrop, type InsetCorner } from "@/app/lib/video/composite";
import { useDraggable } from "@/app/components/useDraggable";

type Phase = "idle" | "setup" | "recording" | "paused" | "review";

// Prefer recording mp4 DIRECTLY (Edge/Chrome 126+) — instant, no server transcode,
// and mp4 is what social/Buffer needs. Fall back to webm on browsers that can't.
function pickMime(): { mime: string; ext: "mp4" | "webm" } {
  const cands: { mime: string; ext: "mp4" | "webm" }[] = [
    { mime: "video/mp4;codecs=avc1,mp4a", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  if (typeof MediaRecorder !== "undefined") {
    for (const c of cands) if (MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: "video/webm", ext: "webm" };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CORNERS: { id: InsetCorner; label: string; name: string }[] = [
  { id: "br", label: "↘", name: "Webcam in bottom-right" },
  { id: "bl", label: "↙", name: "Webcam in bottom-left" },
  { id: "tr", label: "↗", name: "Webcam in top-right" },
  { id: "tl", label: "↖", name: "Webcam in top-left" },
];

export function ScreencastStudio({ enabled }: { enabled: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [open, setOpen] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [camId, setCamId] = useState<string>("");
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [corner, setCorner] = useState<InsetCorner>("br");
  const [scale, setScale] = useState(0.22);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [transcoding, setTranscoding] = useState(false);
  const [convertElapsed, setConvertElapsed] = useState(0);
  const [pendingTo, setPendingTo] = useState<"mp4" | "webm" | null>(null);
  const [nativeExt, setNativeExt] = useState<"mp4" | "webm">("webm");
  const [error, setError] = useState<string | null>(null);
  const convertAbortRef = useRef<AbortController | null>(null);
  const convertTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Draggable launcher — sits just RIGHT of the camera button (which defaults to
  // left 64) and remembers where the user drags it. Smaller (32px) than the camera.
  const { pos, handlers, didDrag } = useDraggable("diagramatix.video.btnPos", () => ({ left: 112, top: window.innerHeight - 56 }), 32);

  // Refs the draw loop / recorder read without re-subscribing.
  const camOnRef = useRef(camOn); camOnRef.current = camOn;
  const cornerRef = useRef(corner); cornerRef.current = corner;
  const scaleRef = useRef(scale); scaleRef.current = scale;

  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);   // cam + mic
  const displayStreamRef = useRef<MediaStream | null>(null);   // screen
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelRafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enumerate = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setMics(list.filter((d) => d.kind === "audioinput"));
      setCams(list.filter((d) => d.kind === "videoinput"));
    } catch { /* ignore */ }
  }, []);

  const stopLevelMeter = useCallback(() => {
    cancelAnimationFrame(levelRafRef.current);
    try { audioCtxRef.current?.close(); } catch { /* */ }
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  // (Re)acquire cam+mic for preview/recording per the current device + toggles.
  const arm = useCallback(async () => {
    setError(null);
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    stopLevelMeter();
    const constraints: MediaStreamConstraints = {
      audio: micOn ? { deviceId: micId ? { exact: micId } : undefined } : false,
      video: camOn ? { deviceId: camId ? { exact: camId } : undefined, width: 640, height: 360 } : false,
    };
    if (!micOn && !camOn) { previewStreamRef.current = null; return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      setError(`Camera/mic error: ${(e as Error).message}`);
      return;
    }
    previewStreamRef.current = stream;
    await enumerate(); // labels now populated
    if (camVideoRef.current) { camVideoRef.current.srcObject = stream; void camVideoRef.current.play().catch(() => {}); }
    // Mic level meter on the selected mic.
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const d = buf[i] - 128; sum += d * d; }
        setLevel(Math.min(100, Math.round((Math.sqrt(sum / buf.length) / 64) * 100)));
        levelRafRef.current = requestAnimationFrame(tick);
      };
      levelRafRef.current = requestAnimationFrame(tick);
    }
  }, [micOn, camOn, micId, camId, enumerate, stopLevelMeter]);

  const openStudio = useCallback(async () => {
    setOpen(true);
    setPhase("setup");
    await enumerate();
    await arm();
  }, [enumerate, arm]);

  // Re-arm when device selection / toggles change while in setup.
  useEffect(() => {
    if (phase === "setup") void arm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micId, camId, micOn, camOn]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = () => void enumerate();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, [enabled, enumerate]);

  const cleanupRecording = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!previewStreamRef.current && (micOn || camOn)) await arm();
    let display: MediaStream;
    try {
      // preferCurrentTab + displaySurface:"browser" captures ONLY this Diagramatix
      // tab's web content — no browser tabs / address bar / OS chrome. (Chromium/Edge.)
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser", frameRate: 30 },
        audio: false,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions & { preferCurrentTab?: boolean });
    } catch (e) {
      setError(`Screen capture cancelled or failed: ${(e as Error).message}`);
      return;
    }
    displayStreamRef.current = display;
    const sv = screenVideoRef.current!;
    sv.srcObject = display; await sv.play().catch(() => {});
    // Stop if the user ends the share from the browser's own bar.
    display.getVideoTracks()[0].addEventListener("ended", () => stop());

    const cv = canvasRef.current!;
    const draw = () => {
      const ctx = cv.getContext("2d");
      if (ctx && sv.videoWidth) {
        if (cv.width !== sv.videoWidth) { cv.width = sv.videoWidth; cv.height = sv.videoHeight; }
        ctx.drawImage(sv, 0, 0, cv.width, cv.height);
        const camV = camVideoRef.current;
        if (camOnRef.current && camV && camV.videoWidth) {
          const r = insetRect(cv.width, cv.height, cornerRef.current, scaleRef.current);
          const crop = coverCrop(camV.videoWidth, camV.videoHeight, r.w, r.h);
          ctx.save(); roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.clip();
          ctx.drawImage(camV, crop.x, crop.y, crop.w, crop.h, r.x, r.y, r.w, r.h);
          ctx.restore();
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)";
          roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.stroke();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    // Mix mic audio into the recorded stream.
    const canvasStream = (cv as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    const micTrack = previewStreamRef.current?.getAudioTracks()[0];
    if (micTrack) tracks.push(micTrack);
    const mixed = new MediaStream(tracks);

    chunksRef.current = [];
    const chosen = pickMime();
    setNativeExt(chosen.ext);
    const rec = new MediaRecorder(mixed, { mimeType: chosen.mime });
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      recordedBlobRef.current = blob;
      setRecordedUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
      setPhase("review");
      cleanupRecording();
    };
    recorderRef.current = rec;
    rec.start(1000);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    setPhase("recording");
  }, [arm, micOn, camOn, cleanupRecording]);

  const stop = useCallback(() => {
    try { if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop(); }
    catch { cleanupRecording(); setPhase("review"); }
  }, [cleanupRecording]);

  const pauseResume = useCallback(() => {
    const rec = recorderRef.current; if (!rec) return;
    if (rec.state === "recording") {
      rec.pause(); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } setPhase("paused");
    } else if (rec.state === "paused") {
      rec.resume(); timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000); setPhase("recording");
    }
  }, []);

  const download = useCallback((blob: Blob, ext: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `diagramatix-screencast-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, []);

  const saveConverted = useCallback(async (to: "mp4" | "webm") => {
    const blob = recordedBlobRef.current; if (!blob || transcoding) return;
    const ac = new AbortController();
    convertAbortRef.current = ac;
    const hardTimeout = setTimeout(() => ac.abort(), 5 * 60 * 1000); // never hang forever
    setTranscoding(true); setPendingTo(to); setConvertElapsed(0); setError(null);
    convertTimerRef.current = setInterval(() => setConvertElapsed((e) => e + 1), 1000);
    try {
      const res = await fetch(`/api/video/transcode?to=${to}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "video/webm" },
        body: blob,
        signal: ac.signal,
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? `Conversion failed (HTTP ${res.status}). ffmpeg may be unavailable in this environment.`); return; }
      download(await res.blob(), to);
    } catch (e) {
      setError(ac.signal.aborted ? "Conversion cancelled or timed out." : `Conversion error: ${(e as Error).message}`);
    } finally {
      clearTimeout(hardTimeout);
      if (convertTimerRef.current) { clearInterval(convertTimerRef.current); convertTimerRef.current = null; }
      convertAbortRef.current = null;
      setTranscoding(false); setPendingTo(null);
    }
  }, [download, transcoding]);

  const cancelConvert = useCallback(() => { convertAbortRef.current?.abort(); }, []);
  // Reassuring progress that eases toward 90% over ~elapsed and completes on finish.
  const convertPct = Math.min(90, Math.round(90 * (1 - Math.exp(-convertElapsed / 8))));

  const discardRecording = useCallback(() => {
    setRecordedUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    recordedBlobRef.current = null;
    setElapsed(0); setError(null);
  }, []);

  const reRecord = useCallback(() => { discardRecording(); setPhase("setup"); void arm(); }, [discardRecording, arm]);

  const closeStudio = useCallback(() => {
    convertAbortRef.current?.abort();
    if (convertTimerRef.current) { clearInterval(convertTimerRef.current); convertTimerRef.current = null; }
    stop();
    cleanupRecording();
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    previewStreamRef.current = null;
    stopLevelMeter();
    discardRecording();
    setOpen(false); setPhase("idle");
  }, [stop, cleanupRecording, stopLevelMeter, discardRecording]);

  useEffect(() => () => { // unmount safety (shouldn't happen at root, but be tidy)
    cleanupRecording();
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    stopLevelMeter();
  }, [cleanupRecording, stopLevelMeter]);

  if (!enabled) return null;

  // Hidden media elements the compositor reads from.
  const hidden = (
    <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
      <video ref={screenVideoRef} muted playsInline />
      <video ref={camVideoRef} muted playsInline />
      <canvas ref={canvasRef} />
    </div>
  );

  // Compact pill while recording so it barely intrudes on the captured screen.
  if (phase === "recording" || phase === "paused") {
    return (
      <>
        {hidden}
        <div className="fixed bottom-16 left-4 z-[95] flex items-center gap-2 rounded-full bg-black/85 text-white px-3 py-1.5 shadow-lg text-xs">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${phase === "recording" ? "bg-red-500 animate-pulse" : "bg-amber-400"}`} />
          <span className="tabular-nums font-medium">{fmt(elapsed)}</span>
          <button onClick={pauseResume} className="ml-1 hover:text-amber-300" title={phase === "recording" ? "Pause" : "Resume"}>{phase === "recording" ? "⏸" : "▶"}</button>
          <button onClick={stop} className="hover:text-red-400" title="Stop">⏹</button>
        </div>
      </>
    );
  }

  return (
    <>
      {hidden}
      {!open && (
        <button
          onPointerDown={(e) => { e.preventDefault(); handlers.onPointerDown(e); }}
          onPointerMove={handlers.onPointerMove}
          onPointerUp={(e) => { handlers.onPointerUp(e); if (!didDrag()) void openStudio(); }}
          title="Screencast Studio — record this screen (SuperAdmin). Click to open · drag to move"
          aria-label="Open Screencast Studio"
          style={pos ? { left: pos.left, top: pos.top, touchAction: "none" } : { touchAction: "none" }}
          className={`fixed ${pos ? "" : "bottom-4 left-28"} z-[70] w-8 h-8 flex items-center justify-center rounded-full border-2 border-gray-300 bg-white text-gray-600 hover:border-red-500 hover:text-red-600 hover:scale-110 transition-all cursor-grab active:cursor-grabbing`}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </button>
      )}
      {open && (
        <div className="fixed bottom-16 left-4 z-[95] w-72 bg-white rounded-lg shadow-xl border border-gray-200 p-3 text-xs text-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-800">🎥 Screencast Studio</span>
            <button onClick={closeStudio} className="text-gray-600 hover:text-gray-700 text-base leading-none" title="Close">&times;</button>
          </div>

          {phase !== "review" && (
            <>
              <label className="block text-[10px] uppercase tracking-wide text-gray-600 mb-0.5">Microphone</label>
              <div className="flex items-center gap-1 mb-1">
                <select value={micId} onChange={(e) => setMicId(e.target.value)} disabled={!micOn}
                  className="flex-1 border border-gray-300 rounded px-1 py-1 text-[11px] disabled:opacity-50">
                  <option value="">Default</option>
                  {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 6)}`}</option>)}
                </select>
                <button onClick={() => setMicOn((v) => !v)} className={`px-1.5 py-1 rounded border ${micOn ? "border-green-300 text-green-700" : "border-gray-300 text-gray-600"}`} title="Toggle mic">{micOn ? "🎙" : "🔇"}</button>
              </div>
              {/* Mic test level meter (the selected device) */}
              {micOn && (
                <div className="h-2 bg-gray-100 rounded overflow-hidden mb-2" title="Mic level — speak to test">
                  <div className="h-full bg-green-500 transition-[width] duration-75" style={{ width: `${level}%` }} />
                </div>
              )}

              <label className="block text-[10px] uppercase tracking-wide text-gray-600 mb-0.5">Camera (inset)</label>
              <div className="flex items-center gap-1 mb-1">
                <select value={camId} onChange={(e) => setCamId(e.target.value)} disabled={!camOn}
                  className="flex-1 border border-gray-300 rounded px-1 py-1 text-[11px] disabled:opacity-50">
                  <option value="">Default</option>
                  {cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cam ${d.deviceId.slice(0, 6)}`}</option>)}
                </select>
                <button onClick={() => setCamOn((v) => !v)} className={`px-1.5 py-1 rounded border ${camOn ? "border-green-300 text-green-700" : "border-gray-300 text-gray-600"}`} title="Toggle camera">{camOn ? "📷" : "🚫"}</button>
              </div>
              {camOn && (
                <>
                  <label className="block text-[10px] uppercase tracking-wide text-gray-600 mb-0.5">Webcam corner &amp; size</label>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex gap-0.5">
                      {CORNERS.map((c) => (
                        <button key={c.id} onClick={() => setCorner(c.id)} className={`w-6 h-6 rounded border text-[11px] ${corner === c.id ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-600"}`} title={c.name} aria-label={c.name}>{c.label}</button>
                      ))}
                    </div>
                    <input type="range" min={0.12} max={0.4} step={0.02} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="flex-1" title="Webcam inset size" aria-label="Webcam inset size" />
                  </div>
                </>
              )}

              <button onClick={start}
                className="w-full py-1.5 bg-red-600 text-white rounded hover:bg-red-700 font-medium">
                ● Start recording
              </button>
              <p className="text-[10px] text-gray-600 mt-1">You&rsquo;ll be asked which screen/window/tab to capture. Recording keeps running as you navigate anywhere in Diagramatix.</p>
            </>
          )}

          {phase === "review" && recordedUrl && (
            <>
              <video src={recordedUrl} controls className="w-full rounded border border-gray-200 mb-2 bg-black" />
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => recordedBlobRef.current && download(recordedBlobRef.current, nativeExt)} disabled={transcoding} className="py-1.5 border border-gray-300 text-gray-800 font-medium rounded hover:bg-gray-50 disabled:opacity-50" title="Save the recording as-is (instant, no conversion)">Save .{nativeExt}</button>
                <button onClick={() => saveConverted(nativeExt === "mp4" ? "webm" : "mp4")} disabled={transcoding} className="py-1.5 border border-gray-300 text-gray-800 font-medium rounded hover:bg-gray-50 disabled:opacity-50" title="Convert on the server, then save">Save .{nativeExt === "mp4" ? "webm" : "mp4"}</button>
                <button onClick={reRecord} disabled={transcoding} className="py-1.5 border border-gray-300 text-gray-800 font-medium rounded hover:bg-gray-50 disabled:opacity-50">Re-record</button>
                <button onClick={() => { discardRecording(); setPhase("setup"); void arm(); }} disabled={transcoding} className="py-1.5 border border-red-300 text-red-700 font-medium rounded hover:bg-red-50 disabled:opacity-50">Discard</button>
              </div>
              {transcoding && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-gray-600 mb-0.5">
                    <span>Converting to .{pendingTo}… {convertElapsed}s</span>
                    <button onClick={cancelConvert} className="text-red-600 hover:underline">Cancel</button>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-blue-500 transition-[width] duration-500" style={{ width: `${convertPct}%` }} />
                  </div>
                </div>
              )}
              <p className="text-[10px] text-gray-600 mt-1">.{nativeExt} saves instantly (native recording); the other format converts on the server.</p>
            </>
          )}

          {error && <p className="text-[10px] text-red-600 mt-1.5">{error}</p>}
        </div>
      )}
    </>
  );
}

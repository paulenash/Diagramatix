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
import { useSession } from "next-auth/react";
import { insetRect, coverCrop, type InsetCorner } from "@/app/lib/video/composite";
import { useDraggable } from "@/app/components/useDraggable";
import { useMatrixRunning } from "@/app/components/useMatrixRunning";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { beginSession, appendChunk, listPending, getSessionBlob, clearSession, type RecMeta } from "@/app/lib/screencast/recordingStore";

type Phase = "idle" | "setup" | "recording" | "paused" | "review";

// Prefer recording mp4 DIRECTLY (Edge/Chrome 126+) — instant, no server transcode,
// and mp4 is what social/Buffer needs. BUT Chrome's mp4 MediaRecorder frequently
// records the video and silently DROPS the mic audio track (green level bar during
// capture, dead-silent file). webm/opus muxes audio reliably, so whenever we're
// recording a microphone we record webm — the "Save .mp4" button then transcodes on
// the server (which keeps the audio). Screen-only (no-mic) recordings still prefer mp4.
function pickMime(hasAudio: boolean): { mime: string; ext: "mp4" | "webm" } {
  const mp4: { mime: string; ext: "mp4" | "webm" }[] = [
    { mime: "video/mp4;codecs=avc1,mp4a", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
  ];
  const webm: { mime: string; ext: "mp4" | "webm" }[] = [
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  const cands = hasAudio ? [...webm, ...mp4] : [...mp4, ...webm];
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

// Turn a getUserMedia failure into something actionable. The name is what matters:
// NotReadableError = the OS/another app has the device; OverconstrainedError = the
// device rejected the requested settings; NotAllowedError = permission blocked.
function describeMediaError(e: DOMException): string {
  switch (e.name) {
    case "NotReadableError":
    case "TrackStartError":
      return "That microphone is in use or locked by another app (Zoom, Teams, OBS, Audacity, the AT2020’s own monitor mixer…) or by Windows exclusive mode. Close other apps using it — or unplug and replug the USB mic — then try again.";
    case "OverconstrainedError":
      return "That microphone rejected the requested audio settings. Try selecting it again, or pick a different mic.";
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone permission is blocked. Allow the mic for this site in the browser’s site settings, then reopen the studio.";
    case "NotFoundError":
      return "The selected microphone wasn’t found — it may have been unplugged. Pick another mic.";
    default:
      return `Camera/mic error: ${e.name || e.message}`;
  }
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
  const [gain, setGain] = useState(1); // mic recording volume (1 = 100%)
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
  const { pos, handlers, didDrag } = useDraggable("diagramatix.video.btnPos", () => ({ left: 112, bottom: 16 }), 44);
  const matrixRunning = useMatrixRunning();
  // Also detect the SuperAdmin from the CLIENT session (like the camera button) so
  // the launcher appears even if the server-rendered `enabled` prop was stale/cached
  // (the RSC layout occasionally renders without the session on a fresh login).
  const { data: session } = useSession();
  const clientSuper = !!session?.user?.email && SUPERUSER_EMAILS.has(session.user.email.toLowerCase());
  const show = enabled || clientSuper;

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
  // Crash-proof persistence: id of the IndexedDB session for the current/last
  // recording, and any recoverable session found on mount.
  const sessionIdRef = useRef<string | null>(null);
  const sessionMimeRef = useRef<string>("video/webm");
  const [recoverable, setRecoverable] = useState<RecMeta | null>(null);
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);            // live recording-volume control
  const processedTrackRef = useRef<MediaStreamTrack | null>(null); // gain-adjusted mic track we record
  const gainRef = useRef(gain); gainRef.current = gain;
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
    gainNodeRef.current = null;
    processedTrackRef.current = null;
    setLevel(0);
  }, []);

  // Live-adjust the recording volume while the slider moves (no re-arm needed).
  useEffect(() => { if (gainNodeRef.current) gainNodeRef.current.gain.value = gain; }, [gain]);

  // (Re)acquire cam+mic for preview/recording per the current device + toggles.
  const arm = useCallback(async () => {
    setError(null);
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    stopLevelMeter();
    // Record the RAW mic: turn off Chrome's echo-cancel / noise-suppress / auto-gain
    // pipeline. It's meant for two-way calls (headset mics like the JBL), but it chokes
    // on studio/USB condenser mics (e.g. AT2020USB-XP) running at high sample rates and
    // often yields a silent/dead track. Off = those mics work AND every mic sounds cleaner.
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (micId) audioConstraints.deviceId = { exact: micId };
    const video: MediaTrackConstraints | false = camOn
      ? { deviceId: camId ? { exact: camId } : undefined, width: 640, height: 360 }
      : false;
    if (!micOn && !camOn) { previewStreamRef.current = null; return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: micOn ? audioConstraints : false, video });
    } catch (e) {
      const err = e as DOMException;
      // If the exact-device / no-processing combo was rejected (some devices/drivers
      // reject exact deviceId or specific processing flags), retry once with a looser
      // ask before giving up — keeps the raw-audio intent but lets the browser adapt.
      if (micOn && (err.name === "OverconstrainedError" || err.name === "NotReadableError")) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: micId ? { deviceId: { ideal: micId } } : true,
            video,
          });
        } catch (e2) {
          setError(describeMediaError(e2 as DOMException));
          return;
        }
      } else {
        setError(describeMediaError(err));
        return;
      }
    }
    previewStreamRef.current = stream;
    await enumerate(); // labels now populated
    if (camVideoRef.current) { camVideoRef.current.srcObject = stream; void camVideoRef.current.play().catch(() => {}); }
    // Route the mic through a gain node so the user can set the RECORDING volume, then
    // to (a) a destination whose track we record and (b) the level meter — so the meter
    // shows the adjusted level and what you see is what gets recorded. Falls back to the
    // raw track if Web Audio is unavailable.
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      try {
        const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        void ctx.resume().catch(() => {}); // must be running or the recorded track is silent
        const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
        const gainNode = ctx.createGain();
        gainNode.gain.value = gainRef.current;
        gainNodeRef.current = gainNode;
        const dest = ctx.createMediaStreamDestination();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(gainNode);
        gainNode.connect(dest);      // this track is what we record (post-volume)
        gainNode.connect(analyser);  // meter reflects the adjusted level
        processedTrackRef.current = dest.stream.getAudioTracks()[0];
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) { const d = buf[i] - 128; sum += d * d; }
          // More sensitive meter (smaller divisor) so a quiet raw mic still reads clearly.
          setLevel(Math.min(100, Math.round((Math.sqrt(sum / buf.length) / 30) * 100)));
          levelRafRef.current = requestAnimationFrame(tick);
        };
        levelRafRef.current = requestAnimationFrame(tick);
      } catch { processedTrackRef.current = null; /* record the raw track instead */ }
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
    if (!show) return;
    const onChange = () => void enumerate();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, [show, enumerate]);

  // On mount, surface any recording that was interrupted (navigation, reload,
  // crash) and never saved — its chunks are safe in IndexedDB.
  useEffect(() => {
    if (!show) return;
    let on = true;
    void listPending().then((list) => { if (on) setRecoverable((cur) => cur ?? list[0] ?? null); });
    return () => { on = false; };
  }, [show]);

  // Best-effort flush of the final partial chunk when the page is being torn down
  // (navigating to the Portal, reload, close). The per-second chunks are already
  // persisted, so at most the last second is at risk; recovery restores the rest.
  useEffect(() => {
    const flush = () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") { try { rec.requestData(); } catch { /* */ } }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", flush); };
  }, []);

  // Rebuild the recorded blob from the persisted session and jump to review.
  const recoverLast = useCallback(async () => {
    const meta = recoverable;
    if (!meta) return;
    const blob = await getSessionBlob(meta.id, meta.mime);
    if (!blob) { await clearSession(meta.id); setRecoverable(null); return; }
    sessionIdRef.current = meta.id;
    sessionMimeRef.current = meta.mime;
    recordedBlobRef.current = blob;
    setNativeExt(meta.ext === "mp4" ? "mp4" : "webm");
    setRecordedUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    setRecoverable(null);
    setOpen(true);
    setPhase("review");
  }, [recoverable]);

  const discardRecoverable = useCallback(async () => {
    if (recoverable) await clearSession(recoverable.id);
    setRecoverable(null);
  }, [recoverable]);

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
    // Stop if the user ends the share from the browser's own bar.
    display.getVideoTracks()[0].addEventListener("ended", () => stop());

    // VIDEO SOURCE — the crux of audio/video sync. When the webcam PiP is OFF we
    // record the getDisplayMedia track DIRECTLY: its frames are hardware/OS-clocked,
    // so they mux tightly with the mic audio and stay in sync for the whole clip.
    // Only when the PiP is ON do we composite screen+cam onto a canvas and record
    // canvas.captureStream — whose rAF-driven frame clock can drift from the audio
    // clock under load (the small desync you saw). camOn is fixed once recording
    // starts (the camera toggle only exists in setup), so this choice is stable.
    let videoTrack: MediaStreamTrack;
    if (camOnRef.current) {
      const sv = screenVideoRef.current!;
      sv.srcObject = display; await sv.play().catch(() => {});
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
      const canvasStream = (cv as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
      videoTrack = canvasStream.getVideoTracks()[0];
    } else {
      videoTrack = display.getVideoTracks()[0];
    }

    // Mix mic audio into the recorded stream — the gain-adjusted track from arm() if
    // present (so the recording volume matches the slider/meter), else the raw device track.
    const tracks: MediaStreamTrack[] = [videoTrack];
    const micTrack = processedTrackRef.current ?? previewStreamRef.current?.getAudioTracks()[0];
    if (micTrack) tracks.push(micTrack);
    const mixed = new MediaStream(tracks);

    chunksRef.current = [];
    // Recording a mic → webm so the audio is actually muxed (see pickMime).
    const chosen = pickMime(!!micTrack);
    setNativeExt(chosen.ext);
    sessionMimeRef.current = chosen.mime;
    // Open a fresh persisted session BEFORE recording, so every chunk is written
    // to IndexedDB as it arrives — the recording survives navigation/reload/crash.
    sessionIdRef.current = await beginSession(chosen.mime, chosen.ext).catch(() => null);
    setRecoverable(null); // this new recording supersedes any old recoverable one
    const rec = new MediaRecorder(mixed, { mimeType: chosen.mime });
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunksRef.current.push(ev.data);
        const sid = sessionIdRef.current;
        if (sid) void appendChunk(sid, ev.data); // best-effort persist
      }
    };
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
      // Saved → the persisted session is no longer needed.
      if (sessionIdRef.current) { void clearSession(sessionIdRef.current); sessionIdRef.current = null; }
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
    // Explicit discard → drop the persisted session so it stops being offered.
    if (sessionIdRef.current) { void clearSession(sessionIdRef.current); sessionIdRef.current = null; }
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

  if (!show) return null;

  // Hidden media elements the compositor reads from. `data-no-capture` is ESSENTIAL:
  // the screen-capture tool (html-to-image) otherwise tries to snapshot these empty
  // <video>s, fetches their blank poster URL (which resolves to the current page →
  // app HTML → data:text/html), and the whole capture fails. Excluding them here is
  // why the camera works whether or not this launcher is present.
  const hidden = (
    <div data-no-capture style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
      <video ref={screenVideoRef} muted playsInline />
      <video ref={camVideoRef} muted playsInline />
      <canvas ref={canvasRef} />
    </div>
  );

  // Hide all visible chrome while the Matrix cascade runs (keep the offscreen
  // media so an in-progress recording keeps compositing).
  if (matrixRunning) return hidden;

  // Compact pill while recording so it barely intrudes on the captured screen.
  if (phase === "recording" || phase === "paused") {
    return (
      <>
        {hidden}
        <div data-no-capture className="fixed bottom-16 left-4 z-[95] flex items-center gap-2 rounded-full bg-black/85 text-white px-3 py-1.5 shadow-lg text-xs">
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
          data-no-capture
          onPointerDown={(e) => { e.preventDefault(); handlers.onPointerDown(e); }}
          onPointerMove={handlers.onPointerMove}
          onPointerUp={(e) => { handlers.onPointerUp(e); if (!didDrag()) void openStudio(); }}
          title="Screencast Studio — record this screen (SuperAdmin). Click to open · drag to move"
          aria-label="Open Screencast Studio"
          style={pos ? { left: pos.left, bottom: pos.bottom, touchAction: "none" } : { touchAction: "none" }}
          className={`fixed ${pos ? "" : "bottom-4 left-28"} z-[70] w-10 h-10 flex items-center justify-center rounded-full border-2 border-gray-300 bg-white text-gray-600 hover:border-red-500 hover:text-red-600 hover:scale-110 transition-all cursor-grab active:cursor-grabbing`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </button>
      )}
      {recoverable && !open && (
        <div data-no-capture className="fixed bottom-16 left-4 z-[96] w-72 bg-amber-50 border border-amber-300 rounded-lg shadow-xl p-3 text-xs">
          <div className="font-semibold text-amber-800 mb-1">Unsaved recording found</div>
          <p className="text-gray-700 mb-2">A screencast was interrupted before it was saved (e.g. a page change). You can recover it.</p>
          <div className="flex gap-2">
            <button onClick={() => void recoverLast()} className="flex-1 py-1.5 bg-amber-600 text-white rounded font-medium active:bg-amber-700">Recover</button>
            <button onClick={() => void discardRecoverable()} className="px-3 py-1.5 border border-gray-300 rounded text-gray-600">Discard</button>
          </div>
        </div>
      )}
      {open && (
        <div data-no-capture className="fixed bottom-16 left-4 z-[95] w-72 bg-white rounded-lg shadow-xl border border-gray-200 p-3 text-xs text-gray-800">
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
              {/* Mic test level meter (the selected device) — reflects the recording volume below */}
              {micOn && (
                <>
                  <div className="h-2 bg-gray-100 rounded overflow-hidden mb-1.5" title="Mic level — speak to test">
                    <div className={`h-full transition-[width] duration-75 ${level > 92 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${level}%` }} />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-[10px] uppercase tracking-wide text-gray-600 whitespace-nowrap">Rec volume</label>
                    <input type="range" min={0} max={2} step={0.05} value={gain} onChange={(e) => setGain(Number(e.target.value))}
                      className="flex-1" title="Recording volume — set so the meter peaks below red while you speak" aria-label="Recording volume" />
                    <span className="text-[10px] text-gray-600 tabular-nums w-9 text-right">{Math.round(gain * 100)}%</span>
                  </div>
                </>
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
                <button onClick={() => { if (recordedBlobRef.current) { download(recordedBlobRef.current, nativeExt); if (sessionIdRef.current) { void clearSession(sessionIdRef.current); sessionIdRef.current = null; } } }} disabled={transcoding} className="py-1.5 border border-gray-300 text-gray-800 font-medium rounded hover:bg-gray-50 disabled:opacity-50" title="Save the recording as-is (instant, no conversion)">Save .{nativeExt}</button>
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

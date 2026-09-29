/**
 * Dictation client. Prefers Deepgram real-time streaming (mic → linear16 PCM →
 * WebSocket → transcripts) for fast, lossless transcription; falls back to the
 * browser Web Speech engine when Deepgram isn't configured (the token endpoint
 * returns 503). One `startDictation()` entry point returns a uniform handle the
 * UI can `stop()`.
 */

export interface DictationCallbacks {
  /** Append a chunk of finalised transcript text. */
  onText: (text: string) => void;
  /** Live, not-yet-final transcript (updates as the user speaks). Optional. */
  onInterim?: (text: string) => void;
  /** A user-facing message (transient or fatal). */
  onError?: (message: string) => void;
  /** Fired once the session has fully stopped on its own (fatal / closed). */
  onEnd?: () => void;
  /** Which engine actually started — for an optional UI hint. */
  onEngine?: (engine: "deepgram" | "browser") => void;
  /** The recogniser is live — audio from now on is heard. Before this the UI
   *  should say "connecting…", not "listening…". */
  onReady?: () => void;
  /**
   * V1: names from THIS diagram, to bias recognition toward the proper nouns
   * the user is about to say. Sent UNBOOSTED and filtered by
   * `diagramKeyterms` — see that module for why the timidity is deliberate.
   */
  keyterms?: readonly string[];
  /**
   * Punctuated prose (capitals, full stops) — for a spoken PROMPT, never for a
   * command. Deepgram only: the browser engine has no such setting.
   */
  prose?: boolean;
  /**
   * Phone use (mobile voice stage 7). Asks for a capture rate (16 kHz — a third of
   * the data of the usual 48 kHz; falls back to the device's own rate if refused)
   * and makes the session RECONNECT by itself when the socket drops, instead of
   * ending. Deepgram only. Off on the desktop, whose recogniser settings were
   * measured at the device rate.
   */
  phone?: boolean;
}
import { createPcmQueue, PCM_QUEUE_MAX_CHUNKS } from "./pcmQueue";
import { liveStreamParams, ASR_LANGUAGE } from "./asrParams";
import { tokenOutcome, type TokenOutcome } from "./tokenOutcome";
import { PHONE_SAMPLE_RATE, reconnectDelayMs } from "./reconnectPolicy";

export interface DictationHandle {
  stop(): void;
}

// The browser fallback speaks the same language as the cloud recogniser. It
// named it separately until 2026-09-24, which is exactly the two-places-one-rule
// drift `asrParams` exists to remove — an AU setting changed in one place and
// not the other would be invisible until somebody noticed the fallback hearing
// differently.
const LANG = ASR_LANGUAGE;

export interface DictationDiagnostics {
  secureContext: boolean;
  cloud: { available: boolean; status: number | null; reason: string };
  browserSpeech: boolean;
  recommend: string;
}

/** Probe why dictation may not be working — used by the mobile mic-test panel.
 *  Reports secure-context, whether cloud (Deepgram) dictation is available (and
 *  why not), and whether this browser has on-device speech (absent on iPhone). */
export async function probeDictation(): Promise<DictationDiagnostics> {
  const secureContext = typeof window === "undefined" ? true : window.isSecureContext !== false;
  const browserSpeech = typeof window !== "undefined"
    && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  let cloud = { available: false, status: null as number | null, reason: "not checked" };
  try {
    const r = await fetch("/api/ai/dictation/token", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.token) cloud = { available: true, status: r.status, reason: "ready" };
    else if (r.status === 503) cloud = { available: false, status: 503, reason: "not configured on the server (no Deepgram key)" };
    else if (r.status === 403) cloud = { available: false, status: 403, reason: "blocked by org policy (allowVoiceAi)" };
    else if (r.status === 401) cloud = { available: false, status: 401, reason: "not signed in" };
    else cloud = { available: false, status: r.status, reason: (d?.error as string) ?? `error ${r.status}` };
  } catch {
    cloud = { available: false, status: null, reason: "network error reaching the token endpoint" };
  }

  let recommend: string;
  if (!secureContext) recommend = "Open the app over https — voice can't access the mic on a plain http:// address.";
  else if (cloud.available) recommend = "Cloud dictation is ready — voice should work.";
  else if (browserSpeech) recommend = `Cloud dictation unavailable (${cloud.reason}); falling back to on-device speech — works on Android, NOT on iPhone.`;
  else recommend = `No voice engine available on this device: cloud is ${cloud.reason}, and this browser has no on-device speech (e.g. iPhone/Safari). Configure Deepgram on the server to enable voice here.`;
  return { secureContext, cloud, browserSpeech, recommend };
}

/** Best-effort report of a finished dictation session (voice minutes visibility;
 *  Deepgram is billed separately). sendBeacon survives page unload. */
function reportDictationUsage(engine: "deepgram" | "browser", seconds: number) {
  if (seconds < 1) return;
  const body = JSON.stringify({ engine, seconds });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/ai/dictation/usage", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch { /* fall through to fetch */ }
  try { void fetch("/api/ai/dictation/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }); } catch { /* ignore */ }
}

/** Start a dictation session. Resolves to a handle, or null if nothing could
 *  start (e.g. mic blocked, or no engine available). */
export async function startDictation(cb: DictationCallbacks): Promise<DictationHandle | null> {
  // Voice needs a secure context — a plain http:// LAN address (e.g. testing the
  // dev server from a phone at http://192.168.x.x:3000) blocks getUserMedia
  // entirely, so neither engine can start. Fail with a clear message.
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    cb.onError?.("Voice needs a secure (https) connection. Open the app over https, not a plain http:// address.");
    cb.onEnd?.();
    return null;
  }

  // Open the microphone NOW, in parallel with the token fetch, so the capture
  // is running before the handshake — speech during the handshake is queued
  // and sent once the socket opens (pcmQueue.ts). The first word used to go
  // into that gap.
  const micPromise: Promise<MediaStream | null> =
    typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
      : Promise.resolve(null);

  // B8 — the three ways this can fail are not the same thing. A 403 is the
  // org's DECISION that audio must not leave the browser for transcription;
  // quietly starting a different speech engine defeats it. `tokenOutcome`
  // holds that distinction, and is pure so it can be tested without a network.
  let outcome: TokenOutcome;
  try {
    const r = await fetch("/api/ai/dictation/token", { method: "POST" });
    const body = await r.json().catch(() => null);
    outcome = tokenOutcome(r.status, body);
  } catch {
    outcome = tokenOutcome(null, null);   // offline → browser engine, said out loud
  }

  if (outcome.kind === "refused") {
    // Release the microphone we opened optimistically — nothing is going to
    // listen through it.
    (await micPromise)?.getTracks().forEach((t) => t.stop());
    cb.onError?.(outcome.message);
    cb.onEnd?.();
    return null;
  }

  const token = outcome.kind === "cloud" ? outcome.token : null;
  const scheme = outcome.kind === "cloud" ? outcome.scheme : "token";
  const engine: "deepgram" | "browser" = token ? "deepgram" : "browser";
  const startedAt = Date.now();
  let reported = false;
  const report = () => {
    if (reported) return;
    reported = true;
    reportDictationUsage(engine, Math.round((Date.now() - startedAt) / 1000));
  };
  // Meter once when the session ends — however it ends (own end or user stop).
  const metered: DictationCallbacks = { ...cb, onEnd: () => { report(); cb.onEnd?.(); } };

  cb.onEngine?.(engine);
  let handle: DictationHandle | null;
  if (token) {
    handle = await startDeepgram(token, scheme, metered, micPromise);
  } else {
    // The browser engine opens its own microphone; release the early one.
    (await micPromise)?.getTracks().forEach((t) => t.stop());
    handle = startBrowserSpeech(metered);
    if (handle) {
      // Say WHICH engine is listening and why. The bar's "(browser)" suffix
      // says it is the weaker one; this says what to do about it.
      if (outcome.kind === "fallback") cb.onError?.(outcome.notice);
      cb.onReady?.();
    }
  }
  if (!handle) { report(); return null; }
  return { stop: () => { report(); handle.stop(); } };
}

// ── Deepgram streaming ──────────────────────────────────────────────────────
async function startDeepgram(token: string, scheme: string, cb: DictationCallbacks, micPromise: Promise<MediaStream | null>): Promise<DictationHandle | null> {
  const early = await micPromise;
  if (!early) {
    cb.onError?.("Microphone unavailable or blocked. Allow mic access and try again.");
    cb.onEnd?.();
    return null;
  }
  const stream: MediaStream = early;

  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const phone = cb.phone === true;
  let ctx: AudioContext;
  try { ctx = phone ? new AC({ sampleRate: PHONE_SAMPLE_RATE }) : new AC(); } catch { ctx = new AC(); }
  // iOS Safari can start an AudioContext in "suspended" state; resume it (we're
  // inside a user gesture) so the mic actually captures on a phone.
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* best-effort */ } }
  // Every recogniser setting — model, language, endpointing, and the keyword
  // boosts with their long-won reasoning — lives in `asrParams.ts`, so the live
  // microphone and a replayed clip cannot drift apart. (2026-09-24.)
  const params = liveStreamParams({ sampleRate: ctx.sampleRate, keyterms: cb.keyterms, prose: cb.prose });

  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0; // keep the graph alive WITHOUT echoing the mic to speakers

  let stopped = false;
  let ws: WebSocket;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  function cleanup() {
    if (stopped) return;
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (phone && typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    try { processor.disconnect(); } catch { /* */ }
    try { source.disconnect(); } catch { /* */ }
    try { mute.disconnect(); } catch { /* */ }
    try { ctx.close(); } catch { /* */ }
    stream.getTracks().forEach((t) => t.stop());
    try {
      if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: "CloseStream" })); }
      ws.close();
    } catch { /* */ }
    cb.onEnd?.();
  }

  // Capture from the first moment; queue until the socket is open, then drain
  // in order so nothing said during the handshake (or a reconnect) is lost.
  const queue = createPcmQueue(PCM_QUEUE_MAX_CHUNKS);
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    if (ws.readyState === WebSocket.OPEN) ws.send(pcm.buffer);
    else if (ws.readyState === WebSocket.CONNECTING || (phone && !stopped)) queue.push(pcm.buffer);
  };

  function open(tok: string) {
    const sock = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, [scheme, tok]);
    ws = sock;
    sock.binaryType = "arraybuffer";
    sock.onopen = () => {
      queue.drain((chunk) => sock.send(chunk));
      cb.onReady?.();
    };
    sock.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        const transcript = msg?.channel?.alternatives?.[0]?.transcript;
        if (transcript) {
          attempts = 0;   // it heard something: the connection is good again
          if (msg.is_final) cb.onText(transcript);
          else cb.onInterim?.(transcript);
        }
      } catch { /* non-JSON keep-alive etc. */ }
    };
    sock.onerror = () => { if (!phone) cb.onError?.("Dictation connection error."); };
    sock.onclose = () => {
      if (sock !== ws) return;             // a superseded socket
      if (phone && !stopped) { reconnect(); return; }
      cleanup();
    };
  }

  /** Phone: the socket dropped — get a fresh token and reopen, keeping the microphone running. */
  function reconnect() {
    if (stopped || retryTimer) return;
    attempts += 1;
    const delay = reconnectDelayMs(attempts);
    if (delay === null) { cb.onError?.("Lost the connection and could not get it back. Tap the mic to start again."); cleanup(); return; }
    cb.onError?.("Connection dropped — reconnecting…");
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (stopped) return;
      try {
        const r = await fetch("/api/ai/dictation/token", { method: "POST" });
        const body = await r.json().catch(() => null);
        const out = tokenOutcome(r.status, body);
        if (out.kind !== "cloud") throw new Error("no token");
        if (!stopped) open(out.token);
      } catch {
        if (!stopped) reconnect();
      }
    }, delay);
  }

  // Phone: the OS suspends a page that is switched away from. When the person
  // comes back, wake the audio graph and, if the socket died meanwhile, reopen it now.
  function onVisible() {
    if (typeof document === "undefined" || document.visibilityState !== "visible" || stopped) return;
    if (ctx.state === "suspended" || (ctx.state as string) === "interrupted") { try { void ctx.resume(); } catch { /* best-effort */ } }
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) { attempts = 0; reconnect(); }
  }
  if (phone) {
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    // Another app (a phone call) taking the microphone ends its track: say so, and stop cleanly.
    stream.getAudioTracks().forEach((t) => { t.onended = () => { if (!stopped) { cb.onError?.("The microphone was taken by another app."); cleanup(); } }; });
  }

  open(token);
  return { stop: cleanup };
}

// ── Browser Web Speech fallback (auto-restart + backoff) ────────────────────
function startBrowserSpeech(cb: DictationCallbacks): DictationHandle | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) { cb.onError?.("This browser has no speech recognition."); cb.onEnd?.(); return null; }

  let want = true;
  let failures = 0;
  let ended = false;
  let recognition: any = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  // Fire onEnd EXACTLY ONCE — on a fatal error OR a user Stop. Previously stop()
  // never called onEnd (and onend bailed early when want=false), so the host UI
  // stayed stuck in the "listening" state and the Stop button did nothing.
  function finish() { if (ended) return; ended = true; cb.onEnd?.(); }

  function start() {
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = LANG;
    recognition.onresult = (event: any) => {
      failures = 0;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) cb.onText(event.results[i][0].transcript);
        else cb.onInterim?.(event.results[i][0].transcript);
      }
    };
    recognition.onend = () => {
      if (!want) { finish(); return; }   // stopped (or done) → reset the host
      if (failures >= 6) { want = false; cb.onError?.("Dictation keeps dropping out. Try again in a moment."); finish(); return; }
      const delay = failures > 0 ? Math.min(2000, 300 * failures) : 200;
      restartTimer = setTimeout(() => { if (want) start(); }, delay);
    };
    recognition.onerror = (e: any) => {
      const err = e?.error;
      if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") {
        want = false; cb.onError?.("Microphone unavailable or blocked."); finish();
      } else if (err === "network") { failures += 1; }
    };
    try { recognition.start(); } catch { /* already starting */ }
  }
  start();

  return {
    stop() {
      want = false;
      if (restartTimer) clearTimeout(restartTimer);
      try { recognition?.stop(); } catch { /* */ }
      finish();   // ensure the host UI resets even if `onend` never fires
    },
  };
}

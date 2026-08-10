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
}

export interface DictationHandle {
  stop(): void;
}

const LANG = "en-AU";

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

  let token: string | null = null;
  let scheme = "token";   // "bearer" for grant tokens, "token" for API keys
  try {
    const r = await fetch("/api/ai/dictation/token", { method: "POST" });
    if (r.ok) {
      const data = await r.json();
      token = data?.token ?? null;
      if (data?.scheme) scheme = data.scheme;
    }
  } catch { /* offline / not configured → fall back below */ }

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
  const handle = token ? await startDeepgram(token, scheme, metered) : startBrowserSpeech(metered);
  if (!handle) { report(); return null; }
  return { stop: () => { report(); handle.stop(); } };
}

// ── Deepgram streaming ──────────────────────────────────────────────────────
async function startDeepgram(token: string, scheme: string, cb: DictationCallbacks): Promise<DictationHandle | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    cb.onError?.("Microphone unavailable or blocked. Allow mic access and try again.");
    cb.onEnd?.();
    return null;
  }

  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  // iOS Safari can start an AudioContext in "suspended" state; resume it (we're
  // inside a user gesture) so the mic actually captures on a phone.
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* best-effort */ } }
  const params = new URLSearchParams({
    model: "nova-2",
    encoding: "linear16",
    sample_rate: String(Math.round(ctx.sampleRate)),
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    // Australian English — the default "en" leans US and mis-hears AU vowels.
    language: "en-AU",
    // Wait ~0.8s of silence before finalising a segment, so one paused sentence
    // arrives as fewer, larger finals instead of many fragments to re-stitch.
    endpointing: "800",
  });
  // Bias recognition toward the command vocabulary so "lane"≠"line", "pool"≠
  // "poll"/"pull", etc. (Deepgram `keywords`, with a boost on the confusable ones.)
  for (const kw of ["lane:3", "sublane:3", "pool:3", "gateway:2", "task:2", "subprocess:2",
    "boundary", "connect", "rename", "delete", "compact", "Abracadabra"]) {
    params.append("keywords", kw);
  }
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, [scheme, token]);
  ws.binaryType = "arraybuffer";

  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0; // keep the graph alive WITHOUT echoing the mic to speakers

  let stopped = false;
  function cleanup() {
    if (stopped) return;
    stopped = true;
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

  ws.onopen = () => {
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
  };
  processor.onaudioprocess = (e) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const input = e.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    ws.send(pcm.buffer);
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string);
      const transcript = msg?.channel?.alternatives?.[0]?.transcript;
      if (transcript) {
        if (msg.is_final) cb.onText(transcript);
        else cb.onInterim?.(transcript);
      }
    } catch { /* non-JSON keep-alive etc. */ }
  };
  ws.onerror = () => { cb.onError?.("Dictation connection error."); };
  ws.onclose = () => { cleanup(); };

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

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

/** Start a dictation session. Resolves to a handle, or null if nothing could
 *  start (e.g. mic blocked, or no engine available). */
export async function startDictation(cb: DictationCallbacks): Promise<DictationHandle | null> {
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

  if (token) {
    cb.onEngine?.("deepgram");
    return startDeepgram(token, scheme, cb);
  }
  cb.onEngine?.("browser");
  return startBrowserSpeech(cb);
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
  const params = new URLSearchParams({
    model: "nova-2",
    encoding: "linear16",
    sample_rate: String(Math.round(ctx.sampleRate)),
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    language: "en",
  });
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
      if (transcript && msg.is_final) cb.onText(transcript);
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
  let recognition: any = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  function start() {
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = LANG;
    recognition.onresult = (event: any) => {
      failures = 0;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) cb.onText(event.results[i][0].transcript);
      }
    };
    recognition.onend = () => {
      if (!want) return;
      if (failures >= 6) { want = false; cb.onError?.("Dictation keeps dropping out. Try again in a moment."); cb.onEnd?.(); return; }
      const delay = failures > 0 ? Math.min(2000, 300 * failures) : 200;
      restartTimer = setTimeout(() => { if (want) start(); }, delay);
    };
    recognition.onerror = (e: any) => {
      const err = e?.error;
      if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") {
        want = false; cb.onError?.("Microphone unavailable or blocked."); cb.onEnd?.();
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
    },
  };
}

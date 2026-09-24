"use client";
/**
 * Push a recorded clip back through the REAL recogniser.
 *
 * This is the leg that actually measures what Paul asked about. The live path
 * is a WebSocket fed raw Int16 frames — nothing about that socket requires a
 * microphone at the other end — so a stored clip can be replayed through the
 * identical socket, with the identical settings, and stitched by the identical
 * policy. What comes back is the transcript the live path would have produced.
 *
 * **Why it runs in the browser.** The socket is authenticated by a short-lived
 * grant token minted at `/api/ai/dictation/token`, which exists precisely so
 * the master key never leaves the server (SEC-19). Replaying server-side would
 * mean a second credential path for no benefit.
 *
 * **Why it is paced in real time.** Deepgram's endpointing is a wall-clock
 * measurement: blasting five seconds of audio down the wire in fifty
 * milliseconds would finalise everything as one segment and the fragment
 * behaviour — a real failure mode with its own test file — would be invisible.
 * The replay is therefore as slow as the recording, which is the cost of
 * measuring the thing rather than an approximation of it.
 */
import { decodeWav } from "./wav";
import { liveStreamParams } from "./asrParams";
import { stitchFinals, type Final } from "../assist/fragmentBuffer";

/** Frames of this many samples, matching the live `ScriptProcessor` buffer. */
const FRAME_SAMPLES = 4096;

export interface ReplayResult {
  /** The utterances the live path would have run, in order. */
  utterances: string[];
  /** Every final, with when it arrived — the evidence behind the stitching. */
  finals: Final[];
  /** How long the replay took, in ms. */
  elapsedMs: number;
  error?: string;
}

interface TokenResponse {
  token?: string;
  scheme?: string;
  error?: string;
}

/** Mint a short-lived credential for the socket. */
async function mintToken(): Promise<{ token: string; scheme: string } | { error: string }> {
  const res = await fetch("/api/ai/dictation/token", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.token) {
    // 403 = the org forbids cloud voice; 503 = no key configured. Both are
    // states a results table should print, not exceptions to swallow.
    return { error: body.error ?? (res.status === 403 ? "Voice AI is not allowed for this org." : `No recogniser token (${res.status}).`) };
  }
  return { token: body.token, scheme: body.scheme ?? "token" };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Replay one clip and return what the live path would have heard.
 *
 * Never throws: a replay failure is a row in a table.
 */
export async function replayClip(
  wav: ArrayBuffer,
  opts: { keyterms?: readonly string[]; timeoutMs?: number } = {},
): Promise<ReplayResult> {
  const started = Date.now();
  const decoded = decodeWav(wav);
  if (!decoded) return { utterances: [], finals: [], elapsedMs: 0, error: "Not a 16-bit mono PCM WAV." };

  const cred = await mintToken();
  if ("error" in cred) return { utterances: [], finals: [], elapsedMs: Date.now() - started, error: cred.error };

  const params = liveStreamParams({ sampleRate: decoded.sampleRate, keyterms: opts.keyterms });
  const finals: Final[] = [];

  return new Promise<ReplayResult>((resolve) => {
    let settled = false;
    const done = (error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      try { ws.close(); } catch { /* already closing */ }
      resolve({
        utterances: stitchFinals(finals, Date.now() - audioStart),
        finals,
        elapsedMs: Date.now() - started,
        ...(error ? { error } : {}),
      });
    };

    // A clip is seconds long; anything past this is a stuck socket, and a run of
    // a hundred clips must not hang on one of them.
    const guard = setTimeout(() => done("timed out waiting for the recogniser"), opts.timeoutMs ?? 30_000);

    let audioStart = Date.now();
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, [cred.scheme, cred.token]);
    ws.binaryType = "arraybuffer";

    ws.onopen = async () => {
      audioStart = Date.now();
      const { samples, sampleRate } = decoded;
      const frameMs = (FRAME_SAMPLES / sampleRate) * 1000;
      for (let at = 0; at < samples.length; at += FRAME_SAMPLES) {
        if (settled || ws.readyState !== WebSocket.OPEN) return;
        ws.send(samples.slice(at, at + FRAME_SAMPLES).buffer);
        // Real time, deliberately — see the docblock.
        await sleep(frameMs);
      }
      if (settled || ws.readyState !== WebSocket.OPEN) return;
      // Tell Deepgram the audio has ended, so it finalises rather than waiting
      // out its endpoint timer on silence that will never come.
      try { ws.send(JSON.stringify({ type: "CloseStream" })); } catch { /* */ }
      // Give the last segment a moment to come back before giving up.
      setTimeout(() => done(), 3000);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        const transcript = msg?.channel?.alternatives?.[0]?.transcript;
        if (transcript && msg.is_final) finals.push({ text: transcript, atMs: Date.now() - audioStart });
      } catch { /* keep-alives are not JSON */ }
    };

    ws.onerror = () => done("recogniser connection error");
    ws.onclose = () => done();
  });
}

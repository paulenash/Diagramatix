/**
 * 16-bit PCM WAV, encoded and decoded.
 *
 * **Why not `MediaRecorder`.** It is the obvious way to record in a browser and
 * it is the wrong one here. It produces Opus in a WebM container — a lossy
 * generation the live path never has, because the live path sends raw Int16
 * frames straight into the Deepgram socket. A corpus recorded through Opus
 * would measure a pipeline nobody uses, and every conclusion drawn from it
 * about the real microphone would be a guess.
 *
 * So clips are captured the same way the live socket captures: a
 * `ScriptProcessor`, Float32 → Int16, at the AudioContext's own sample rate.
 * This module wraps those samples in the 44-byte header that makes them a file.
 * The bytes inside are byte-identical to what the live socket would have sent.
 *
 * Size: ~5 s at 48 kHz mono 16-bit ≈ 480 kB a clip, so a hundred is ~16 MB
 * after the header. Comfortable for a `Bytes` column, and `audio/wav` is
 * accepted by Deepgram's pre-recorded endpoint too, so one artifact serves both
 * the streaming replay and the batch one.
 *
 * Pure. No DOM.
 */

export const WAV_MIME = "audio/wav";
/** RIFF + fmt + data chunk headers. */
export const WAV_HEADER_BYTES = 44;

/** Float32 samples in [-1, 1] → Int16, the same clamp the live capture uses. */
export function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Mono 16-bit PCM WAV from Int16 samples. */
export function encodeWav(samples: Int16Array, sampleRate: number): ArrayBuffer {
  const bytes = samples.length * 2;
  const buf = new ArrayBuffer(WAV_HEADER_BYTES + bytes);
  const view = new DataView(buf);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  ascii(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);          // file size - 8
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);                 // fmt chunk size (PCM)
  view.setUint16(20, 1, true);                  // audio format: 1 = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, bytes, true);
  // Little-endian, explicitly. `new Int16Array(buf, 44)` would inherit the
  // platform's endianness and produce a file that is silent noise on a
  // big-endian reader.
  for (let i = 0; i < samples.length; i++) view.setInt16(WAV_HEADER_BYTES + i * 2, samples[i], true);
  return buf;
}

export interface DecodedWav {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  durationMs: number;
}

/**
 * Read one of ours back. Returns null rather than throwing on anything that is
 * not a mono 16-bit PCM WAV — the replay leg reads bytes out of a database and
 * "that is not a clip" is a row in a results table, not a stack trace.
 */
export function decodeWav(buf: ArrayBuffer): DecodedWav | null {
  if (buf.byteLength < WAV_HEADER_BYTES) return null;
  const view = new DataView(buf);
  const tag = (offset: number) =>
    String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  if (view.getUint16(20, true) !== 1) return null;        // PCM only
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  if (view.getUint16(34, true) !== 16) return null;       // 16-bit only
  const dataBytes = view.getUint32(40, true);
  const available = Math.min(dataBytes, buf.byteLength - WAV_HEADER_BYTES);
  const count = Math.floor(available / 2);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) samples[i] = view.getInt16(WAV_HEADER_BYTES + i * 2, true);
  return {
    samples,
    sampleRate,
    channels,
    durationMs: sampleRate > 0 ? Math.round((count / channels / sampleRate) * 1000) : 0,
  };
}

/**
 * Loudest sample, 0–100.
 *
 * A silent take is by far the likeliest way to lose a recording session — the
 * mic was muted, or the wrong device was selected, and nobody finds out until
 * the replay an hour later. The recorder refuses to save a clip whose peak
 * never crossed a floor, and this is the number it checks.
 */
export function peakLevel(samples: Int16Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return Math.round((peak / 0x7fff) * 100);
}

/** Below this, treat the take as silence and refuse it. */
export const SILENT_TAKE_PEAK = 4;

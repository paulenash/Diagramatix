/**
 * Two measurements on a recorded clip, for the Replay harness. Pure.
 *
 * Why they exist (2026-09-25): seven of the twelve failures in a prod replay
 * lost or garbled the FIRST word ("connect" heard as "to", "add" as "and",
 * "make" dropped), and four of those sentences passed on another take. The clip
 * recorder opens the microphone fresh for every take, with no lead-in, so the
 * suspicion is the recordings rather than the grammar. Two numbers settle it:
 *
 *   • `leadInMs` — how long the clip runs before the voice starts. A take that
 *     starts speaking within a few tens of milliseconds may have lost its first
 *     sound before capture began.
 *   • `padWavStart` — the same clip with silence added in front. If a padded
 *     replay gets the first word back, the audio was complete and the recogniser
 *     wanted a run-up; if not, the first sound was never recorded.
 *
 * Handles what the recorder writes: 16-bit PCM WAV. Anything else returns null
 * or is passed through untouched rather than guessed at.
 */

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Byte offset of the first sample. */
  dataOffset: number;
  /** Bytes of sample data (clamped to what the buffer actually holds). */
  dataBytes: number;
}

export function readWav(buf: ArrayBuffer): WavInfo | null {
  const v = new DataView(buf);
  if (buf.byteLength < 12) return null;
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let format = 0, channels = 0, sampleRate = 0, bitsPerSample = 0;
  let off = 12;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt " && body + 16 <= buf.byteLength) {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bitsPerSample = v.getUint16(body + 14, true);
    } else if (id === "data") {
      if (format !== 1 || bitsPerSample !== 16 || channels < 1 || sampleRate < 1) return null;
      return { sampleRate, channels, bitsPerSample, dataOffset: body, dataBytes: Math.min(size, buf.byteLength - body) };
    }
    off = body + size + (size % 2); // chunks are word-aligned
  }
  return null;
}

/** 10 ms frames: fine enough to place an onset. */
const FRAME_MS = 10;
/**
 * The voice must stay up this many frames running (30 ms). One frame is not
 * enough: a key click or the pop of the microphone opening lasts a few
 * milliseconds and would otherwise read as "voice at 0 ms" — the very signature
 * of a clipped take, faked by the space bar that starts the recording.
 */
const SUSTAIN_FRAMES = 3;
/** Below this a frame is room noise, whatever the voice level is. */
const NOISE_FLOOR_RMS = 300;
/** A frame this fraction of the clip's voice level counts as voice. */
const ONSET_FRACTION = 0.1;
/**
 * The clip's voice level is the 95th-percentile frame, not the loudest one, so
 * a single loud click cannot set the bar that everything else is measured by.
 */
const LEVEL_PERCENTILE = 0.95;

/**
 * Milliseconds of clip before the voice starts, or null for a clip that is not
 * 16-bit PCM or never rises above room noise (a silent take is its own finding).
 *
 * The clip's DC offset is removed first — a device that sits at +350 instead of
 * 0 would otherwise read as speech from the first sample. The offset is taken
 * from AFTER the dead air, and the search starts there too: the wake-up zeros
 * are not the device's resting level, and subtracting a +400 offset from them
 * would turn silence into a signal and mark every clip "clipped".
 */
export function leadInMs(buf: ArrayBuffer): number | null {
  const w = readWav(buf);
  if (!w) return null;
  const v = new DataView(buf, w.dataOffset, w.dataBytes);
  const samples = Math.floor(w.dataBytes / 2);
  const perFrame = Math.max(1, Math.round((w.sampleRate * FRAME_MS) / 1000) * w.channels);
  const frames = Math.floor(samples / perFrame);
  if (frames < SUSTAIN_FRAMES) return null;

  let zeros = 0;
  while (zeros < frames * perFrame && v.getInt16(zeros * 2, true) === 0) zeros++;
  const firstLive = Math.floor(zeros / perFrame);
  const live = frames * perFrame - firstLive * perFrame;
  if (live <= 0) return null;
  let mean = 0;
  for (let i = firstLive * perFrame; i < frames * perFrame; i++) mean += v.getInt16(i * 2, true);
  mean /= live;

  // Dead-air frames stay at 0: they are the device waking, not a level.
  const rms = new Float64Array(frames);
  for (let f = firstLive; f < frames; f++) {
    let sum = 0;
    for (let i = 0; i < perFrame; i++) {
      const s = v.getInt16((f * perFrame + i) * 2, true) - mean;
      sum += s * s;
    }
    rms[f] = Math.sqrt(sum / perFrame);
  }
  const sorted = Array.from(rms.subarray(firstLive)).sort((a, b) => a - b);
  const level = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * LEVEL_PERCENTILE))];
  const threshold = Math.max(NOISE_FLOOR_RMS, level * ONSET_FRACTION);
  if (level < threshold) return null;

  for (let f = firstLive; f + SUSTAIN_FRAMES <= frames; f++) {
    let held = true;
    for (let k = 0; k < SUSTAIN_FRAMES; k++) if (rms[f + k] < threshold) { held = false; break; }
    if (held) return f * FRAME_MS;
  }
  return null;
}

/**
 * Milliseconds of EXACT digital silence at the start — every channel at 0.
 *
 * Measured apart from the lead-in because it means something different. Room
 * silence is recorded silence; exact zeros are the device delivering nothing
 * while it wakes up. A take whose voice starts right after 400 ms of zeros may
 * have lost its first sound inside those 400 ms, yet it reads as a healthy
 * lead-in — so it is shown on its own rather than folded in.
 */
export function deadAirMs(buf: ArrayBuffer): number | null {
  const w = readWav(buf);
  if (!w) return null;
  const v = new DataView(buf, w.dataOffset, w.dataBytes);
  const samples = Math.floor(w.dataBytes / 2);
  let i = 0;
  while (i < samples && v.getInt16(i * 2, true) === 0) i++;
  const frames = Math.floor(i / w.channels);
  return Math.round((frames / w.sampleRate) * 1000);
}

/**
 * The clip with `ms` of silence in front. The header's sizes are rewritten so
 * the result is a valid WAV; the samples themselves are untouched. A clip this
 * cannot read is returned as it came.
 */
export function padWavStart(buf: ArrayBuffer, ms: number): ArrayBuffer {
  const w = readWav(buf);
  if (!w || ms <= 0) return buf;
  const padBytes = Math.round((w.sampleRate * ms) / 1000) * w.channels * 2;
  const out = new Uint8Array(buf.byteLength + padBytes);
  const src = new Uint8Array(buf);
  out.set(src.subarray(0, w.dataOffset), 0);                          // header, unchanged
  out.set(src.subarray(w.dataOffset), w.dataOffset + padBytes);       // samples (and any trailing chunks), shifted
  const v = new DataView(out.buffer);
  v.setUint32(4, out.byteLength - 8, true);                           // RIFF size
  v.setUint32(w.dataOffset - 4, w.dataBytes + padBytes, true);        // data size
  return out.buffer;
}

/**
 * T4777–T4780 — measuring the Replay corpus, and a run that says what it measured.
 *
 * A prod replay (2026-09-25) failed 12 of 100, and 7 of those lost or garbled
 * the FIRST word; 4 of those sentences passed on another take. The Replay tab
 * can now replay each clip as recorded, padded, with punctuation on, or all
 * three in one pass — and every row carries the silence before its voice.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readWav, leadInMs, deadAirMs, padWavStart } from "@/app/lib/dictation/wavTools";
import { batchParams, asrFingerprint } from "@/app/lib/dictation/asrParams";
import {
  variantsFor, firstWordHeardRight, firstWordOf, firstWordFlips, flips, leadStats, possiblyClipped, VARIANTS, PAD_MS, CLIPPED_MS, SHORT_MS,
} from "@/app/lib/dictation/replayCompare";

interface Opts { rate?: number; channels?: number; noise?: number; dc?: number; amp?: number; click?: { atMs: number; ms: number; amp: number }; zerosMs?: number }

/** A 16-bit PCM WAV: `silenceMs` of room noise, then `toneMs` of a steady tone standing in for a voice. */
function wav(silenceMs: number, toneMs: number, o: Opts = {}): ArrayBuffer {
  const rate = o.rate ?? 16000;
  const ch = o.channels ?? 1;
  const frames = Math.round((rate * (silenceMs + toneMs)) / 1000);
  const quiet = Math.round((rate * silenceMs) / 1000);
  const zeros = Math.round((rate * (o.zerosMs ?? 0)) / 1000);
  const data = frames * ch * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const w = (off: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + data, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, data, true);
  for (let f = 0; f < frames; f++) {
    const t = (f / rate) * 1000;
    let s = f < zeros ? 0
      : f < quiet ? Math.round((o.noise ?? 40) * Math.sin(f * 1.3)) + (o.dc ?? 0)
      : Math.round((o.amp ?? 8000) * Math.sin((2 * Math.PI * 440 * f) / rate)) + (o.dc ?? 0);
    if (o.click && t >= o.click.atMs && t < o.click.atMs + o.click.ms) s = f % 2 ? o.click.amp : -o.click.amp;
    for (let c = 0; c < ch; c++) v.setInt16(44 + (f * ch + c) * 2, Math.max(-32768, Math.min(32767, s)), true);
  }
  return buf;
}

describe("T4777 — the silence before the voice", () => {
  it("is measured to the 10 ms frame, mono or stereo", () => {
    expect(leadInMs(wav(400, 500))).toBeGreaterThanOrEqual(390);
    expect(leadInMs(wav(400, 500))).toBeLessThanOrEqual(410);
    expect(leadInMs(wav(0, 500))).toBe(0);
    expect(leadInMs(wav(750, 300, { rate: 48000, channels: 2 }))).toBeGreaterThanOrEqual(740);
  });

  it("a key click or a mic-open pop is NOT the voice — it lasts milliseconds, the voice is sustained", () => {
    // The recorder starts on a key press; its click can land at the start of a
    // take and would otherwise read as "voice at 0 ms", faking a clipped start.
    expect(leadInMs(wav(600, 500, { click: { atMs: 0, ms: 3, amp: 15000 } }))).toBeGreaterThanOrEqual(590);
    expect(leadInMs(wav(600, 500, { click: { atMs: 50, ms: 3, amp: 30000 } }))).toBeGreaterThanOrEqual(590);
  });

  it("a device sitting off zero (DC offset) is not speech from the first sample", () => {
    expect(leadInMs(wav(600, 400, { dc: 400 }))).toBeGreaterThanOrEqual(590);
  });

  it("nor are the wake-up zeros, once that offset is removed — the offset is measured after them", () => {
    // Subtracting a +400 offset from 50 ms of exact zeros would make them read
    // as a signal above the room-noise floor, and a quiet voice would then mark
    // EVERY clip "possibly clipped".
    expect(leadInMs(wav(600, 400, { dc: 400, zerosMs: 50, amp: 2000 }))).toBeGreaterThanOrEqual(590);
  });

  it("room noise below the floor is not a voice, and a take that never rises has no onset", () => {
    expect(leadInMs(wav(600, 400, { noise: 250 }))).toBeGreaterThanOrEqual(590);
    expect(leadInMs(wav(800, 0))).toBeNull();
  });

  it("dead air — exact digital silence while the microphone wakes — is measured on its own", () => {
    expect(deadAirMs(wav(600, 400, { zerosMs: 400 }))).toBe(400);
    expect(deadAirMs(wav(600, 400))).toBe(0);
  });

  it("what it cannot read, it does not guess at", () => {
    expect(leadInMs(new ArrayBuffer(10))).toBeNull();
    const notPcm = wav(100, 100);
    new DataView(notPcm).setUint16(34, 8, true); // 8-bit
    expect(readWav(notPcm)).toBeNull();
    expect(padWavStart(notPcm, 500)).toBe(notPcm);
  });
});

describe("T4778 — padding adds exactly that much silence and nothing else", () => {
  it("keeps a valid header and the voice untouched", () => {
    const original = wav(200, 300);
    const padded = padWavStart(original, 500);
    const a = readWav(original)!;
    const b = readWav(padded)!;
    expect(b.dataBytes - a.dataBytes).toBe(16000 * 0.5 * 2);
    expect(new DataView(padded).getUint32(4, true)).toBe(padded.byteLength - 8);
    expect(new Uint8Array(padded, b.dataOffset + 16000, a.dataBytes)).toEqual(new Uint8Array(original, a.dataOffset, a.dataBytes));
    expect(leadInMs(padded)! - leadInMs(original)!).toBe(500);
    expect(padWavStart(original, 0)).toBe(original);
  });
});

describe("T4779 — what a run measures, compared clip by clip", () => {
  it("one choice, not three switches — punctuation and the comparison need the batch leg", () => {
    expect(variantsFor("recorded", "stream")).toEqual([VARIANTS.recorded]);
    expect(variantsFor("padded", "stream")).toEqual([VARIANTS.padded]);
    expect(variantsFor("punctuated", "stream"), "falls back rather than quietly doing something else").toEqual([VARIANTS.recorded]);
    expect(variantsFor("compare", "batch").map((v) => v.key), "as recorded first — the others are judged against it")
      .toEqual(["recorded", "padded", "punctuated"]);
    expect(variantsFor("compare", "stream").map((v) => v.key), "the live leg can still compare padding")
      .toEqual(["recorded", "padded"]);
    expect(VARIANTS.padded).toMatchObject({ padMs: PAD_MS, punctuate: false });
    expect(VARIANTS.punctuated).toMatchObject({ padMs: 0, punctuate: true });
  });

  it("the first word is compared as a word — case and punctuation ignored", () => {
    expect(firstWordOf("Connect, Pay Claim to Assess Risk.")).toBe("connect");
    expect(firstWordHeardRight("connect Pay Claim to Assess Risk", "to pay claim to assess risk")).toBe(false);
    expect(firstWordHeardRight("add a start event", "Add a start event.")).toBe(true);
    expect(firstWordHeardRight("add a start event", "")).toBe(false);
  });

  it("first word fixed/lost is counted on its own — question 2 is about first words, not whole sentences", () => {
    const said = { a: "connect Pay Claim to Assess Risk", b: "add a start event", c: "rename lanes", d: "bump Review right" };
    const base = { a: "to pay claim to assess risk", b: "add a start event", c: "name lines", d: "bump review right" };
    const padded = { a: "connect pay claim to a sess risk", b: "and a start event", c: "rename lines", d: "" };
    const r = firstWordFlips(said, base, padded, new Set(["d"]));
    expect(r.fixed.sort(), "fixed even when another word is still wrong").toEqual(["a", "c"]);
    expect(r.lost).toEqual(["b"]);
  });

  it("recovered and broke are counted against the same clips, leaving out any that errored", () => {
    const fail = (o: string) => o !== "pass" && o !== "pass-despite-mishear";
    const base = { a: { outcome: "misheard" }, b: { outcome: "pass" }, c: { outcome: "misheard" }, d: { outcome: "pass" } };
    const other = { a: { outcome: "pass-despite-mishear" }, b: { outcome: "misparsed" }, c: { outcome: "misheard" }, d: { outcome: "unparsed" } };
    const f = flips(base, other, fail, new Set(["d"]));
    expect(f.recovered.map((x) => x.caseId)).toEqual(["a"]);
    expect(f.broke.map((x) => x.caseId)).toEqual(["b"]);
  });

  it("'possibly clipped' means the voice began as the microphone woke — not a short lead-in", () => {
    // Every real clip starts with ~51 ms of exact zeros while the device wakes,
    // so a raw lead-in near 0 never happens. The signature of a lost first sound
    // is the voice starting the moment those zeros end.
    expect(possiblyClipped({ leadIn: 60, deadAir: 51 })).toBe(true);
    expect(possiblyClipped({ leadIn: 150, deadAir: 51 })).toBe(false);
    expect(possiblyClipped({ leadIn: null, deadAir: 51 })).toBe(false);
    const stats = leadStats([
      { leadIn: 60, deadAir: 51 }, { leadIn: 150, deadAir: 51 }, { leadIn: 740, deadAir: 51 },
      { leadIn: 900, deadAir: 51 }, { leadIn: 55, deadAir: 50 }, { leadIn: null, deadAir: 0 },
    ]);
    expect(stats).toEqual({ n: 5, median: 150, clipped: 2, short: 3 });
    expect(leadStats([])).toEqual({ n: 0, median: null, clipped: 0, short: 0 });
    expect(CLIPPED_MS).toBeLessThan(SHORT_MS);
  });
});

describe("T4780 — punctuation on its own, and a run that records what was actually sent", () => {
  it("punctuate turns full stops and commas on without the rest of prose formatting", () => {
    const p = batchParams({ commandBias: true, punctuate: true });
    expect(p.get("punctuate")).toBe("true");
    expect(p.get("smart_format")).toBe("false");
    expect(asrFingerprint(p)).not.toBe(asrFingerprint(batchParams({ commandBias: true })));
  });

  it("unset, it follows prose — so the meeting route and a plain replay are unchanged", () => {
    expect(batchParams({ commandBias: true }).get("punctuate")).toBe("false");
    expect(batchParams({ prose: true }).get("punctuate")).toBe("true");
    expect(batchParams({ prose: true }).get("smart_format")).toBe("true");
  });

  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
  const route = read("app", "api", "admin", "voice-assist-test", "transcribe-clip", "route.ts");
  const replay = read("app", "lib", "dictation", "replayClip.ts");
  const panel = read("app", "(dashboard)", "dashboard", "admin", "voice-assist-test", "ReplayPanel.tsx");
  const asr = read("app", "lib", "dictation", "asrParams.ts");

  it("the batch route turns punctuation on only when asked, and live voice is untouched", () => {
    expect(route).toContain('url.searchParams.get("punctuate") === "1"');
    const live = asr.slice(asr.indexOf("export function liveStreamParams"), asr.indexOf("export function batchParams"));
    expect(live).toContain('punctuate: "false"');
  });

  it("the fingerprint comes from what was sent — the route and the socket report it; the panel never rebuilds one", () => {
    // It used to be rebuilt in the browser from the live socket's settings for
    // EVERY run, so a batch run or a run under another boost list was filed
    // under a configuration it never used.
    expect(route).toContain("fingerprint: asrFingerprint(params)");
    expect(replay).toContain("fingerprint: asrFingerprint(params)");
    expect(panel).toContain("asrFingerprint: fingerprints[v.key] ?? null");
    expect(panel).not.toMatch(/asrFingerprint\(/);
  });

  it("a replay that never reached the recogniser is not a mishear — it is left out and named", () => {
    expect(panel).toContain("if (replayError) (failedReplays[v.key] ??= []).push(clip.caseId);");
    expect(panel, "one replay failing must not take the clip's other replays with it").toContain("await replayOnce(wav, v).catch(");
  });

  it("the batch caveat follows the leg of the RESULTS on screen, not the controls set up for the next run", () => {
    expect(panel).toContain("const captionLeg: Leg = summary ? shown.leg : leg;");
    expect(panel).toContain('{captionLeg === "stream" ? (');
  });

  it("the lead-in is measured on the clip as recorded; only the replay is padded", () => {
    expect(panel).toContain("leadIn: leadInMs(wav)");
    expect(panel).toContain("const sent = v.padMs ? padWavStart(wav, v.padMs) : wav");
  });
});

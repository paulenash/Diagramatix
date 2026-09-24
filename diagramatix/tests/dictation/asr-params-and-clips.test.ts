/**
 * T4730–T4733 — the recogniser's settings in one place, and the recorded corpus.
 *
 * Phase 4 of the debug plan, and the phase with the ordering rule that cannot
 * be bent: `asrParams.ts` must exist and the capture must be raw linear16
 * BEFORE the first clip is recorded. Recording against the wrong settings, or
 * through a lossy codec, poisons the corpus — and the only repair is another
 * twenty minutes of somebody's voice, against a corpus the first one can no
 * longer be compared with.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import {
  liveStreamParams, batchParams, asrFingerprint,
  ASR_LANGUAGE, ASR_MODEL, ASR_ENDPOINTING_MS, COMMAND_KEYWORDS,
} from "@/app/lib/dictation/asrParams";
import {
  encodeWav, decodeWav, floatToInt16, peakLevel, WAV_HEADER_BYTES, SILENT_TAKE_PEAK,
} from "@/app/lib/dictation/wav";
import { BOOST_PROFILES, boostProfile } from "@/app/lib/dictation/boostProfiles";

const read = (p: string) => readFileSync(p, "utf8");

describe("T4730 — live and batch cannot drift apart", () => {
  it("they agree on the model, the language and the formatting", () => {
    const live = liveStreamParams({ sampleRate: 48000 });
    const batch = batchParams({ diarize: true, utterances: true });
    for (const k of ["model", "language", "smart_format", "punctuate"]) {
      expect(batch.get(k), `${k} must match the live socket`).toBe(live.get(k));
    }
    expect(live.get("model")).toBe(ASR_MODEL);
    expect(live.get("language"), "Australian English — the default leans US").toBe(ASR_LANGUAGE);
  });

  it("the live socket keeps everything that only streaming has", () => {
    const live = liveStreamParams({ sampleRate: 44100 });
    expect(live.get("encoding")).toBe("linear16");
    expect(live.get("channels")).toBe("1");
    expect(live.get("interim_results")).toBe("true");
    expect(live.get("sample_rate"), "from the argument, not a constant").toBe("44100");
    expect(live.get("endpointing")).toBe(String(ASR_ENDPOINTING_MS));
    expect(live.getAll("keywords"), "the command boosts, in full").toEqual([...COMMAND_KEYWORDS]);
  });

  it("number words are still NOT boosted", () => {
    // They were, for one day. `lane:3` was beating "one" on a numbered pick, so
    // the numbers went in to compete — which fixed the pick and broke ordinary
    // speech: "turn on gold flashing" came back as "ten on gold flashing".
    // The elevation lives in spokenNumber.ts, scoped to while a pick is open.
    const boosted = liveStreamParams({ sampleRate: 48000 }).getAll("keywords").map((k) => k.split(":")[0].toLowerCase());
    for (const n of ["one", "two", "three", "four", "five", "ten", "turn"]) {
      expect(boosted, `"${n}" must not be boosted`).not.toContain(n);
    }
    expect(read("app/lib/dictation/asrParams.ts"), "and the reasoning travels with it")
      // The quote wraps across two comment lines in the source.
      .toMatch(/ten on\s+\*?\s*gold flashing/i);
  });

  it("a meeting and a replayed clip ask for different things, explicitly", () => {
    // A meeting wants speakers and NO command bias — biasing a discussion about
    // invoicing toward the word "lane" would be actively harmful.
    const meeting = batchParams({ diarize: true, utterances: true });
    expect(meeting.get("diarize")).toBe("true");
    expect(meeting.getAll("keywords"), "no command bias on a discussion").toEqual([]);
    // A replayed command clip wants the bias and no diarisation.
    const clip = batchParams({ commandBias: true, keyterms: ["Pick Items"] });
    expect(clip.get("diarize")).toBeNull();
    expect(clip.getAll("keywords")).toContain("lane:3");
    expect(clip.getAll("keywords"), "the diagram's own names, unboosted, after the command words")
      .toContain("Pick Items");
  });

  it("the fingerprint identifies a configuration, not a laptop", () => {
    // Stamped on every clip and run so "this got worse" is answerable by
    // looking. Sample rate is a property of the sound card, and including it
    // would make two machines look like a settings change.
    const a = asrFingerprint(liveStreamParams({ sampleRate: 48000 }));
    const b = asrFingerprint(liveStreamParams({ sampleRate: 16000 }));
    expect(a).toBe(b);
    expect(a).toContain(`language=${ASR_LANGUAGE}`);
    expect(a).not.toContain("sample_rate");
    // A real settings change DOES move it.
    expect(asrFingerprint(batchParams({ commandBias: true }))).not.toBe(a);
  });
});

describe("T4731 — nobody builds Deepgram params anywhere else", () => {
  it("the live socket and the transcribe route both call the shared builder", () => {
    const live = read("app/lib/dictation/index.ts");
    expect(live).toContain("liveStreamParams({ sampleRate: ctx.sampleRate");
    expect(live, "no hand-rolled params survive").not.toMatch(/model:\s*"nova-2"/);

    const route = read("app/api/ai/audio/transcribe/route.ts");
    expect(route).toContain("batchParams({ diarize: true, utterances: true })");
    expect(route).not.toMatch(/model:\s*"nova-2"/);
  });

  it("and no other file names the model or the language directly", () => {
    // One rule, one place — the whole reason this module exists.
    for (const f of ["app/lib/dictation/index.ts", "app/api/ai/audio/transcribe/route.ts"]) {
      expect(read(f), `${f} must not pin the language itself`).not.toContain('"en-AU"');
    }
  });

  it("the en-AU addition to the meeting path is named, not smuggled", () => {
    // It IS a behaviour change to an existing feature: that route sent no
    // language at all before. Shipped deliberately, with the reason written
    // down where somebody bisecting would find it.
    expect(read("app/api/ai/audio/transcribe/route.ts")).toMatch(/language=en-AU.*did not before|did not before/s);
  });
});

describe("T4732 — the WAV encoder, and the capture format that must not slip", () => {
  it("writes a header a decoder agrees with, and round-trips the samples", () => {
    const samples = Int16Array.from([0, 1000, -1000, 32767, -32768, 42]);
    const buf = encodeWav(samples, 48000);
    expect(buf.byteLength).toBe(WAV_HEADER_BYTES + samples.length * 2);

    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(12)).toBe("fmt ");
    expect(v.getUint32(16, true), "PCM fmt chunk size").toBe(16);
    expect(v.getUint16(20, true), "1 = PCM").toBe(1);
    expect(v.getUint16(22, true), "mono").toBe(1);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true), "byte rate = rate x blockAlign").toBe(48000 * 2);
    expect(v.getUint16(32, true), "block align").toBe(2);
    expect(v.getUint16(34, true), "16-bit").toBe(16);
    expect(tag(36)).toBe("data");
    expect(v.getUint32(40, true)).toBe(samples.length * 2);

    const back = decodeWav(buf)!;
    expect([...back.samples]).toEqual([...samples]);
    expect(back.sampleRate).toBe(48000);
    expect(back.channels).toBe(1);
  });

  it("reports a duration from the sample count", () => {
    expect(decodeWav(encodeWav(new Int16Array(48000), 48000))!.durationMs).toBe(1000);
    expect(decodeWav(encodeWav(new Int16Array(8000), 16000))!.durationMs).toBe(500);
  });

  it("refuses what is not one of ours, rather than returning noise", () => {
    expect(decodeWav(new ArrayBuffer(10)), "too short").toBeNull();
    expect(decodeWav(new TextEncoder().encode("not a wav file at all, honestly").buffer)).toBeNull();
  });

  it("clamps floats the same way the live capture does", () => {
    const pcm = floatToInt16(Float32Array.from([0, 1, -1, 2, -2, 0.5]));
    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(32767);
    expect(pcm[2]).toBe(-32768);
    expect(pcm[3], "out of range clamps, never wraps").toBe(32767);
    expect(pcm[4]).toBe(-32768);
  });

  it("catches the silent take — the likeliest way to lose an hour", () => {
    expect(peakLevel(new Int16Array(1000))).toBe(0);
    expect(peakLevel(Int16Array.from([0, 32767]))).toBe(100);
    expect(peakLevel(new Int16Array(500)), "a muted mic").toBeLessThan(SILENT_TAKE_PEAK);
  });

  it("the recorder captures raw PCM, NOT MediaRecorder", () => {
    // The single most expensive thing to get wrong in this phase. Opus is a
    // lossy generation the live path never has, so a corpus recorded through
    // MediaRecorder measures a pipeline the product does not ship.
    const rec = read("app/lib/dictation/useClipRecorder.ts");
    // Comments stripped: the module's docblock explains why MediaRecorder is
    // the wrong choice, and would otherwise fail the module for saying so.
    const code = rec.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(rec, "the same ScriptProcessor path as the live socket").toContain("createScriptProcessor(4096, 1, 1)");
    expect(rec).toContain("floatToInt16");
    expect(rec).toContain("encodeWav");
    expect(code, "never the lossy one").not.toContain("MediaRecorder");
    // And the upload route refuses anything else, so a future caller cannot
    // quietly reintroduce it.
    expect(read("app/api/admin/voice-assist-test/clips/route.ts")).toContain("audio/wav");
  });
});

describe("T4733 — the corpus survives everything that could lose it", () => {
  beforeEach(async () => { await truncateAll(); });

  const clip = (over: Record<string, unknown> = {}) => ({
    corpusSeed: "s1", caseId: "s1#1", family: "add",
    utterance: "add a task called Approve",
    expectedOps: JSON.stringify([{ op: "add", symbolType: "task", label: "Approve" }]),
    audioBytes: Buffer.from(encodeWav(Int16Array.from([1, 2, 3]), 48000)),
    sampleRate: 48000, durationMs: 4200, byteSize: 50, peakLevel: 61,
    ...over,
  });

  it("a retake is take 2 — a good take is never destroyed", () => {
    // Which take was the good one is only knowable later, so an upsert here
    // would throw away the answer before the question was asked.
    return (async () => {
      const a = await prisma.voiceClip.create({ data: clip(), select: { takeNumber: true } });
      const b = await prisma.voiceClip.create({ data: clip({ takeNumber: 2 }), select: { takeNumber: true } });
      expect(a.takeNumber).toBe(1);
      expect(b.takeNumber).toBe(2);
      expect(await prisma.voiceClip.count({ where: { corpusSeed: "s1", caseId: "s1#1" } })).toBe(2);
      // And the same take number twice is refused by the database, not by luck.
      await expect(prisma.voiceClip.create({ data: clip({ takeNumber: 2 }) })).rejects.toThrow();
    })();
  });

  it("the sentence and the answer live ON the clip, not in a lookup", () => {
    // THE mitigation for the second-largest hazard in the plan. Case ids shift
    // whenever the generator changes; a clip that carries its own sentence and
    // its own expected ops survives that, and a clip that carries a reference
    // silently loses its answer.
    return (async () => {
      const row = await prisma.voiceClip.create({ data: clip(), select: { utterance: true, expectedOps: true } });
      expect(row.utterance).toBe("add a task called Approve");
      expect(JSON.parse(row.expectedOps)[0].op).toBe("add");
      const schema = read("prisma/schema.prisma");
      const model = schema.slice(schema.indexOf("/// One recorded utterance"));
      expect(model, "and the reason is recorded where the next person will read it")
        .toMatch(/DENORMALISED/);
    })();
  });

  it("stores the audio as bytes that decode back to a clip", async () => {
    const row = await prisma.voiceClip.create({ data: clip(), select: { audioBytes: true, mimeType: true } });
    const b = Buffer.from(row.audioBytes as Buffer);
    const back = decodeWav(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    expect(back, "what went in is still a WAV coming out").not.toBeNull();
    expect(row.mimeType).toBe("audio/wav");
  });

  it("the upload is guarded, capped, and WAV-only", () => {
    const route = read("app/api/admin/voice-assist-test/clips/route.ts");
    expect(route).toContain("isSuperuser(session)");
    expect(route).toContain("blockReadOnlyImpersonation(session)");
    expect(route, "413 on an oversized clip").toContain("{ status: 413 }");
    expect(route, "415 on anything that is not WAV").toContain("{ status: 415 }");
    expect(route, "a retake counts, it does not overwrite").toContain("takeNumber: prior + 1");
    const list = route.slice(route.indexOf("const LIST_SELECT"), route.indexOf("export async function GET"));
    expect(list, "a listing must never carry the audio").not.toContain("audioBytes");
  });

  it("one POST per accepted take, so a crash at seventy costs nothing", () => {
    const panel = read("app/(dashboard)/dashboard/admin/voice-assist-test/RecorderPanel.tsx");
    expect(panel).toContain('fetch("/api/admin/voice-assist-test/clips", { method: "POST"');
    expect(panel, "the silent take cannot be kept").toMatch(/disabled=\{busy \|\| rec\.clip\.silent\}/);
    expect(panel, "and the fingerprint rides along with every clip").toContain("asrFingerprint");
  });
});

describe("T4739 — boost profiles are measurable, and production is not one of them", () => {
  it("LIVE VOICE always gets the shipped list — a profile is harness-only", () => {
    // The whole risk of making the boost list selectable is that a measurement
    // setting leaks into the product. `commandWords` is optional and defaults
    // to COMMAND_KEYWORDS, and the live dictation path never passes it.
    const live = readFileSync("app/lib/dictation/index.ts", "utf8");
    expect(live, "the microphone path takes no profile").toContain("liveStreamParams({ sampleRate: ctx.sampleRate");
    expect(live).not.toMatch(/commandWords/);
    expect(liveStreamParams({ sampleRate: 48000 }).getAll("keywords"), "the default is what ships")
      .toEqual([...COMMAND_KEYWORDS]);
  });

  it("each profile sends exactly what it claims", () => {
    for (const p of BOOST_PROFILES) {
      const sent = batchParams({ commandBias: true, commandWords: p.keywords }).getAll("keywords");
      expect(sent, `${p.id} sends its own list`).toEqual([...p.keywords]);
    }
    expect(boostProfile("none").keywords, "the control sends nothing").toEqual([]);
    expect(boostProfile("current").keywords, "the baseline IS the shipped list").toEqual([...COMMAND_KEYWORDS]);
    expect(boostProfile("nonsense").id, "an unknown id falls back to the baseline").toBe("current");
  });

  it("the alternatives fix the two faults the corpus found", () => {
    // Fault 1: singular-only entries compete with their own plurals —
    // "add two sublanes" came back "add two lane".
    for (const id of ["plural", "tuned"] as const) {
      const kw = boostProfile(id).keywords;
      for (const w of ["lane", "lanes", "sublane", "sublanes", "pool", "pools"]) {
        expect(kw, `${id} must carry ${w}`).toContain(w);
      }
      // Fault 2: weight 3 beats words that sound nothing like the boosted one
      // — "make" → "Lane", "delete" → "Selected".
      expect(kw.filter((k) => k.includes(":")), `${id} carries no weights`).toEqual([]);
      expect(kw, `${id} drops 'selected', which was caught eating 'delete'`).not.toContain("selected");
      expect(kw, `${id} drops 'rename', which was caught eating 'Prepare'`).not.toContain("rename");
    }
  });

  it("every profile explains itself and says what to watch for", () => {
    // A dropdown of four lists nobody can choose between is not a tool.
    for (const p of BOOST_PROFILES) {
      expect(p.explain.length, `${p.id} needs a real explanation`).toBeGreaterThan(80);
      expect(p.watch.length, `${p.id} needs something to watch for`).toBeGreaterThan(40);
    }
    const panel = readFileSync("app/(dashboard)/dashboard/admin/voice-assist-test/ReplayPanel.tsx", "utf8");
    expect(panel, "and both are on the screen, not just in the code").toContain("boostProfile(profileId).explain");
    expect(panel).toContain("boostProfile(profileId).watch");
  });

  it("the run records which profile produced it", () => {
    // Two runs without this are two numbers nobody can attribute to a setting.
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/boostProfile\s+String\?/);
    expect(readFileSync("app/api/admin/voice-assist-test/runs/route.ts", "utf8"))
      .toContain("boostProfile: body.boostProfile ?? null");
  });
});

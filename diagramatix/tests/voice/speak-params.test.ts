/**
 * T4768 — the chosen voice reaches Deepgram, and only one file asks it to speak.
 *
 * On `/v1/speak` the VOICE IS THE MODEL. The first cut sent the fixed Theia model
 * with the caller's choice in a `voice` parameter Deepgram does not have, so all
 * four voices spoke as Theia — and the panel built to compare them would have
 * played the same voice four times without anybody being able to tell why.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  speakParams, TTS_VOICES, DEFAULT_TTS_VOICE, isValidTtsVoice,
  SPEECH_PURPOSES, isSpeechPurpose,
} from "@/app/lib/voice/speakParams";

describe("T4768 — the voice is the model", () => {
  it("every offered voice travels as `model`, and there is no `voice` parameter", () => {
    for (const v of TTS_VOICES) {
      const p = speakParams(v);
      expect(p.get("model"), v).toBe(v);
      expect(p.has("voice"), `${v} must not ride in a parameter Deepgram ignores`).toBe(false);
      expect(p.get("encoding")).toBe("mp3");
    }
  });

  it("so four voices are four different requests", () => {
    const qs = new Set(TTS_VOICES.map((v) => speakParams(v).toString()));
    expect(qs.size).toBe(TTS_VOICES.length);
  });

  it("the default is Theia (Paul, 2026-09-25) and is one of the offered voices", () => {
    expect(DEFAULT_TTS_VOICE).toBe("aura-2-theia-en");
    expect(isValidTtsVoice(DEFAULT_TTS_VOICE)).toBe(true);
    expect(isValidTtsVoice("aura-2-somebody-else")).toBe(false);
  });

  it("narration is a purpose the route accepts — the list lives in one place", () => {
    expect(SPEECH_PURPOSES).toContain("narration");
    for (const p of SPEECH_PURPOSES) expect(isSpeechPurpose(p)).toBe(true);
    expect(isSpeechPurpose("shouting")).toBe(false);
  });
});

describe("T4768 — only the route talks to Deepgram's speak endpoint", () => {
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === "generated" || name === "node_modules") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...sources(p));
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }

  /** Code only — the docs are allowed to NAME the endpoint, just not call it. */
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("the key stays server-side: no other file builds a /v1/speak request", () => {
    const callers = sources(join(process.cwd(), "app"))
      .filter((f) => code(readFileSync(f, "utf8")).includes("api.deepgram.com/v1/speak"))
      .map((f) => f.slice(process.cwd().length + 1).replace(/\\/g, "/"));
    expect(callers).toEqual(["app/api/ai/speak/route.ts"]);
  });

  it("and it builds the query with speakParams, not by hand", () => {
    const route = readFileSync(join(process.cwd(), "app", "api", "ai", "speak", "route.ts"), "utf8");
    expect(route).toContain("speakParams(voice)");
  });
});

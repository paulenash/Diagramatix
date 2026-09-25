/**
 * T4774 — the master switch and the default voice (`ttsSettings.ts`).
 * T4775 — what speech has cost, as the Text to Speech tile shows it (`speechUsage.ts`).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/lib/db", () => ({ prisma: {} }));
const { parseTtsSettings, TTS_ENABLED_KEY, TTS_VOICE_KEY } = await import("@/app/lib/voice/ttsSettings");
const { summariseSpeechUsage, monthStartUtc } = await import("@/app/lib/voice/speechUsage");

describe("T4774 — the master switch is a brake, not a gate", () => {
  it("with nothing stored, speech is ON and the voice is Theia", () => {
    expect(parseTtsSettings([])).toEqual({ enabled: true, defaultVoice: "aura-2-theia-en" });
  });

  it("only an explicit \"false\" switches it off", () => {
    expect(parseTtsSettings([{ key: TTS_ENABLED_KEY, value: "false" }]).enabled).toBe(false);
    expect(parseTtsSettings([{ key: TTS_ENABLED_KEY, value: "true" }]).enabled).toBe(true);
  });

  it("a stored voice is used; one Diagramatix does not offer falls back to Theia", () => {
    expect(parseTtsSettings([{ key: TTS_VOICE_KEY, value: "aura-2-draco-en" }]).defaultVoice).toBe("aura-2-draco-en");
    expect(parseTtsSettings([{ key: TTS_VOICE_KEY, value: "aura-2-retired-en" }]).defaultVoice).toBe("aura-2-theia-en");
  });
});

describe("T4775 — speech usage", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const rate = (m: string) => (m.startsWith("aura-2-") ? { inputPer1M: 30 } : undefined);
  const row = (o: Partial<{ userId: string | null; invocationPoint: string; model: string; status: string; chars: number; at: Date }>) => ({
    userId: "u1", invocationPoint: "voice.reply", model: "aura-2-theia-en", status: "success", chars: 1000, at: now, ...o,
  });

  it("this month runs from the 1st, UTC", () => {
    expect(monthStartUtc(now).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("separates this month from the last 30 days", () => {
    const u = summariseSpeechUsage(
      [row({}), row({ at: new Date("2026-08-30T00:00:00Z") })], // 26 days ago, last month
      rate, now,
    );
    expect(u.month.calls).toBe(1);
    expect(u.last30.calls).toBe(2);
    expect(u.last30.costUsd).toBeCloseTo(0.06, 9); // 2,000 chars at $30 per million
  });

  it("drops what is older than both windows", () => {
    const u = summariseSpeechUsage([row({ at: new Date("2026-07-01T00:00:00Z") })], rate, now);
    expect(u.last30.calls).toBe(0);
    expect(u.byUser).toEqual([]);
  });

  it("counts failures but never costs them — nothing was heard or billed", () => {
    const u = summariseSpeechUsage([row({ status: "failure" }), row({})], rate, now);
    expect(u.last30.failures).toBe(1);
    expect(u.last30.calls).toBe(1);
    expect(u.last30.costUsd).toBeCloseTo(0.03, 9);
  });

  it("breaks the last 30 days down by use and by person, dearest first", () => {
    const u = summariseSpeechUsage(
      [
        row({ invocationPoint: "voice.narration", chars: 3000 }),
        row({ invocationPoint: "voice.reply", chars: 1000, userId: "u2" }),
        row({ invocationPoint: "voice.compare", chars: 500, userId: null }),
      ],
      rate, now,
    );
    expect(u.byUse.map((b) => b.key)).toEqual(["voice.narration", "voice.reply", "voice.compare"]);
    expect(u.byUser.map((b) => b.key)).toEqual(["u1", "u2", ""]);
  });

  it("a voice with no rate costs 0 and is named, so nobody trusts the zero", () => {
    const u = summariseSpeechUsage([row({ model: "flux-jack" })], rate, now);
    expect(u.last30.costUsd).toBe(0);
    expect(u.unpricedModels).toEqual(["flux-jack"]);
  });
});

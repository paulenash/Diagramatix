/**
 * T5204 — on the phone, what was HEARD (the log lines and the live "listening…" words) sits in a sticky
 * header at the top of the sheet, so a long list of green numbers can never scroll it out of view.
 * (Paul, 2026-10-01: spoken commands were not showing — “it's like flying blind”.)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("app/components/mobile/MobileVoiceEditor.tsx", "utf8");

describe("T5204 phone Voice Assist shows what was heard, always", () => {
  it("the heard block is sticky and comes BEFORE the question, the chips and the badges", () => {
    const heard = src.indexOf('aria-label="What was heard"');
    expect(heard).toBeGreaterThan(0);
    expect(src.slice(heard - 200, heard)).toContain("sticky");
    for (const later of ["{question &&", 'aria-label="Numbers you can say or tap"']) expect(src.indexOf(later)).toBeGreaterThan(heard);
  });
  it("it holds both the log lines and the live interim words", () => {
    const heard = src.indexOf('aria-label="What was heard"');
    const end = src.indexOf("{question &&");
    const block = src.slice(heard, end);
    expect(block).toContain("recent.map");
    expect(block).toContain("session.voiceInterim");
  });
});

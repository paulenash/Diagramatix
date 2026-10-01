/**
 * T5206 — Voice Assist Help slice 6: the phone shows the same next-words help and uses the same repair,
 * and the User Guide text is carried by an idempotent SQL patch plus the seed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("T5206 the phone", () => {
  const src = read("app/components/mobile/MobileVoiceEditor.tsx");
  it("loads the help tree and feeds computePanel from the session's interim words and open flow", () => {
    expect(src).toContain("useVoiceAssistHelp(true)");
    expect(src).toContain("computePanel(help.tree, { interim: session.voiceInterim");
    expect(src).toContain("session.dividerMemRef.current");
  });
  it("shows it inside the sticky heard header, with a hide / show control", () => {
    const heard = src.indexOf('aria-label="What was heard"');
    const strip = src.indexOf('aria-label="What you can say next"');
    expect(strip).toBeGreaterThan(heard);
    expect(src).toContain("Show what I can say next");
  });
  it("uses the same position-aware repair as the desktop, through a ref", () => {
    expect(src).toContain("repairCommandRef,");
    expect(src).toContain("repairForRun(help.repairTree!, heard)");
  });
});

describe("T5206 the User Guide text", () => {
  const patch = read("scripts/sql/patch-voice-assist-help-and-repair.sql");
  const seed = read("scripts/sql/seed-voice-assist-content.sql");
  it("the patch is one guarded UPDATE: anchor present, new text absent, in a transaction", () => {
    expect(patch).toMatch(/BEGIN;[\s\S]*UPDATE "HelpSection"[\s\S]*COMMIT;/);
    expect(patch).toContain("NOT LIKE '%**Voice Assist Help**%'");
    expect((patch.match(/UPDATE "HelpSection"/g) ?? []).length).toBe(1);
  });
  it("the patch and the seed say the same three things", () => {
    for (const t of ["**Voice Assist Help**", "**Mis-heard words**", '"rename to Pay Claim"']) {
      expect(patch).toContain(t);
      expect(seed).toContain(t);
    }
  });
  it("the variable names are inline code, so the markdown does not swallow them as tags", () => {
    expect(patch).not.toMatch(/<(existing|new)_(element|label)_name>/);
    expect(seed).not.toMatch(/<(existing|new)_(element|label)_name>/);
  });
});

/**
 * Replay works on ONE recorded set, and a clip recorded against an older test
 * diagram is "stale" — never a pass.
 *
 * Found 2026-09-26 while designing Paul's Commands-popup set: Replay listed
 * every clip in the database and saved the run under whichever seed sorted
 * first, so a second recorded set was silently mixed into the first set's
 * numbers. And the scorer passed a MISHEARD clip whenever its expected element
 * had left the test diagram, while failing the same clip heard perfectly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreCase, summarise, isFailure, isJudged, FAILING_OUTCOMES } from "@/app/lib/assist/commandScore";
import { fixtureElements } from "@/app/lib/assist/commandFixture";
import { chooseReplaySet, type RecordedSet } from "@/app/lib/dictation/replaySets";
import { OUTCOME_STYLE, OUTCOME_MEANS } from "@/app/(dashboard)/dashboard/admin/voice-assist-test/outcomeStyle";
import type { GeneratedCase } from "@/app/lib/assist/commandGenerator";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const world = fixtureElements();
const caseOf = (utterance: string, ops: GeneratedCase["ops"]): GeneratedCase => ({ id: "t#1", family: "delete", utterance, ops, refs: {} });

describe("T4898 — a clip whose expected element is gone is stale, never a pass", () => {
  // "Ship Order" was in the test diagram the old clips were recorded against.
  const old = caseOf("delete Ship Order", [{ op: "delete", ref: "Ship Order" }]);

  it("heard perfectly: stale, not wrong-element", () => {
    const r = scoreCase(old, "delete Ship Order", world);
    expect(r.outcome).toBe("stale-clip");
    expect(r.detail).toContain("Ship Order");
  });

  it("misheard as something that DOES exist: stale, not pass-despite-mishear (the hole)", () => {
    const r = scoreCase(old, "delete Review Claim", world);
    expect(r.outcome).toBe("stale-clip");
  });

  it("a misheard SHAPE is still judged — the words are not the diagram's to go stale", () => {
    expect(scoreCase(old, "select Ship Order", world).outcome).toBe("misheard");
  });

  it("a case whose element exists is scored exactly as before", () => {
    const now = caseOf("delete Review Claim", [{ op: "delete", ref: "Review Claim" }]);
    expect(scoreCase(now, "delete Review Claim", world).outcome).toBe("pass");
    expect(scoreCase(now, "delete Pay Claim", world).outcome).toBe("wrong-element");
  });

  it("a selection word names nothing without a selection, and is NOT stale", () => {
    const sel = caseOf("delete the selected task", [{ op: "delete", ref: "the selected task" }]);
    expect(scoreCase(sel, "delete the selected task", world).outcome).not.toBe("stale-clip");
  });

  it("stale is neither passed nor failed: counted apart, out of the pass rate", () => {
    const s = summarise([
      scoreCase(old, "delete Ship Order", world),
      scoreCase(caseOf("delete Review Claim", [{ op: "delete", ref: "Review Claim" }]), "delete Review Claim", world),
      scoreCase(caseOf("delete Review Claim", [{ op: "delete", ref: "Review Claim" }]), "delete Pay Claim", world),
    ]);
    expect(s).toMatchObject({ total: 2, passed: 1, failed: 1, stale: 1 });
    expect(s.byOutcome["stale-clip"]).toBe(1);
    expect(isFailure("stale-clip")).toBe(false);
    expect(isJudged("stale-clip")).toBe(false);
    expect(FAILING_OUTCOMES).not.toContain("stale-clip");
  });

  it("the outcome has a colour and a sentence wherever cases are shown", () => {
    expect(OUTCOME_STYLE["stale-clip"]).toBeTruthy();
    expect(OUTCOME_MEANS["stale-clip"]).toMatch(/neither a pass nor a failure/);
  });
});

describe("T4899 — Replay replays one chosen set and saves the run under it", () => {
  const sets: RecordedSet[] = [
    { seed: "dgx-voice-2026-09", clips: 100, lastRecordedAt: "2026-09-20T10:00:00.000Z" },
    { seed: "dgx-voice-2026-09-realistic", clips: 100, lastRecordedAt: "2026-09-25T10:00:00.000Z" },
    { seed: "other", clips: 3, lastRecordedAt: "2026-09-26T10:00:00.000Z" },
  ];

  it("keeps the chosen set while it exists; else the current corpus; else the newest", () => {
    expect(chooseReplaySet(sets, "dgx-voice-2026-09", "dgx-voice-2026-09-realistic")).toBe("dgx-voice-2026-09");
    expect(chooseReplaySet(sets, "gone", "dgx-voice-2026-09-realistic")).toBe("dgx-voice-2026-09-realistic");
    expect(chooseReplaySet(sets, null, "not-recorded")).toBe("other");
    expect(chooseReplaySet([], null, "dgx-voice-2026-09-realistic")).toBeNull();
  });

  it("the set list is counted in the database, never taken from the capped listing", () => {
    const route = read("app/api/admin/voice-assist-test/clips/route.ts");
    const sets = route.slice(route.indexOf('params.get("sets")'), route.indexOf('params.get("seed")'));
    expect(sets).toContain("groupBy");
    expect(sets).not.toContain("take:");
  });

  it("the panel lists the sets, fetches ONE set's clips, and saves under the chosen set", () => {
    const panel = read("app/(dashboard)/dashboard/admin/voice-assist-test/ReplayPanel.tsx");
    expect(panel).toContain("/api/admin/voice-assist-test/clips?sets=1");
    expect(panel).toContain("/api/admin/voice-assist-test/clips?seed=${encodeURIComponent(chosen)}");
    expect(panel, "never every clip at once").not.toContain('fetch("/api/admin/voice-assist-test/clips", { cache');
    expect(panel, "the run is saved under the chosen set").toContain("corpusSeed: runLabel.seed");
    expect(panel, "never under whichever clip sorted first").not.toContain("todo[0]?.corpusSeed");
    expect(panel, "the run only holds clips of its set").toContain("c.corpusSeed === runLabel.seed");
  });
});

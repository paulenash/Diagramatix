/**
 * Paul, 2026-09-17: during a numbered pick, "one" kept coming back as "lane".
 *
 * That is a bias WE created. The recogniser is given `lane:3` as a keyword
 * boost — the strongest weight in the list — so on the shortest utterance a
 * user ever makes, where there is no surrounding context to recover from, it
 * prefers the boosted BPMN word to the acoustically similar number.
 *
 * Paul offered numbering the badges from 2 instead. That trades one confusion
 * for another: the first item would be labelled 2, every user would still say
 * "one" for the first thing in a list, and nothing would stop the same
 * mishearing at any other number. So the fix is in two halves, at both ends:
 *   - the number words are boosted too, so they compete (dictation/index.ts);
 *   - the pick handler corrects a known substitution on the LEADING token only,
 *     which is where a number is expected and where a name never begins.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { leadingSpokenNumber } from "@/app/lib/assist/spokenNumber";

describe("reading the number off a spoken pick", () => {
  it("T4447 — digits, number words, and a filler prefix all resolve, with the rest kept as the name", () => {
    expect(leadingSpokenNumber("3 Approve Order")).toEqual({ n: 3, rest: "Approve Order", corrected: false });
    expect(leadingSpokenNumber("three Approve Order")).toEqual({ n: 3, rest: "Approve Order", corrected: false });
    expect(leadingSpokenNumber("number 3 Approve Order")).toEqual({ n: 3, rest: "Approve Order", corrected: false });
    expect(leadingSpokenNumber("item 12")).toEqual({ n: 12, rest: "", corrected: false });
    expect(leadingSpokenNumber("7")).toEqual({ n: 7, rest: "", corrected: false });
    // Trailing punctuation from the recogniser must not defeat it.
    expect(leadingSpokenNumber("three.")).toEqual({ n: 3, rest: "", corrected: false });
  });

  it("T4448 — the mishearings are corrected, and the correction is reported", () => {
    // The one that prompted this.
    expect(leadingSpokenNumber("lane Sales")).toEqual({ n: 1, rest: "Sales", corrected: true });
    expect(leadingSpokenNumber("lane")).toEqual({ n: 1, rest: "", corrected: true });
    for (const heard of ["line", "won", "wan", "juan"]) {
      expect(leadingSpokenNumber(heard)?.n, `${heard} should read as 1`).toBe(1);
    }
    expect(leadingSpokenNumber("to Approve")?.n).toBe(2);
    expect(leadingSpokenNumber("tree")?.n).toBe(3);
    expect(leadingSpokenNumber("for")?.n).toBe(4);
  });

  it("T4449 — only the LEADING token is rewritten, so a name starting with a container word survives", () => {
    // Picking item 5 and naming it "Lane Manager" must not become item 1.
    expect(leadingSpokenNumber("five Lane Manager")).toEqual({ n: 5, rest: "Lane Manager", corrected: false });
    expect(leadingSpokenNumber("2 Line Supervisor")).toEqual({ n: 2, rest: "Line Supervisor", corrected: false });
    // And an utterance that does not start with a number is not a pick at all.
    expect(leadingSpokenNumber("Approve Order")).toBeNull();
    expect(leadingSpokenNumber("")).toBeNull();
    expect(leadingSpokenNumber("rename lane 2 to Sales"), "a full command is not a bare pick").toBeNull();
  });

  it("T4450 — both halves are wired: the pick handler uses it, and the number words are boosted", () => {
    const editor = readFileSync(join(process.cwd(), "app/(dashboard)/diagram/[id]/DiagramEditor.tsx"), "utf8");
    expect(editor, "the pick handler must go through the shared reader").toMatch(/const picked = leadingSpokenNumber\(low\);/);
    expect(editor, "and take the name from the same result").toMatch(/const trailing = picked\.rest;/);

    const dictation = readFileSync(join(process.cwd(), "app/lib/dictation/index.ts"), "utf8");
    expect(dictation, "`lane` is boosted, so the numbers must be too or they lose").toMatch(/"one:3"/);
    // The boost on "one" has to at least match the boost on "lane", or the
    // competition this exists to fix is still lost at the recogniser.
    const laneBoost = /"lane:(\d)"/.exec(dictation);
    const oneBoost = /"one:(\d)"/.exec(dictation);
    expect(Number(oneBoost![1])).toBeGreaterThanOrEqual(Number(laneBoost![1]));
  });
});

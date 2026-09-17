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
 * mishearing at any other number.
 *
 * The fix was originally in two halves — boost the number words so they compete,
 * AND correct the substitution in the pick handler. The first half was withdrawn
 * a day later (Paul, 2026-09-18: "Turn is often heard as Ten"): boosting numbers
 * globally fixed the pick and broke ordinary speech, because the recogniser then
 * reaches for a number everywhere, and "turn on gold flashing" came back as "ten
 * on gold flashing". Numbers are wanted in exactly one place — while numbered
 * badges are on screen — and Deepgram's keyword list is fixed when the socket
 * opens, long before a pick starts. So the elevation now lives ONLY in the pick
 * handler, which is consulted only during a pick and is therefore scoped to
 * precisely when the numbers are being shown.
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
    // Reads the utterance as spoken, not the lower-cased copy: the number word
    // is folded inside the reader, and lower-casing here threw away the
    // capitalisation of the name that follows it (T4478).
    expect(editor, "the pick handler must go through the shared reader").toMatch(/const picked = leadingSpokenNumber\(t\);/);
    expect(editor, "and take the name from the same result").toMatch(/const trailing = picked\.rest;/);

    const dictation = readFileSync(join(process.cwd(), "app/lib/dictation/index.ts"), "utf8");
    // The number words are deliberately NOT boosted at the recogniser any more
    // (Paul, 2026-09-18: Turn is often heard as Ten). Boosting them fixed the
    // numbered pick and broke ordinary speech everywhere else. Numbers matter
    // only while badges are on screen, and Deepgram's keyword list is fixed when
    // the socket opens, so the elevation lives in the pick handler instead —
    // which is consulted only during a pick, and is therefore scoped to exactly
    // when the numbers are being shown. See T4491.
    expect(dictation, "number words must not be boosted globally").not.toMatch(/"one:3"/);
    expect(dictation, "nor any of the others").not.toMatch(/"ten:2"/);
    expect(dictation, "but the lane boost still is — the pick handler undoes it").toMatch(/"lane:3"/);
  });
});

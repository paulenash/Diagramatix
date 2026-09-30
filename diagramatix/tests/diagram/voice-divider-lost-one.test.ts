/**
 * "Move dividers": a spoken "one" that the recogniser wrote as "the".
 *
 * Paul, 2026-09-30 (Voice-Assist-test-diagram-voice-debug-2026-09-30): "There are only
 * 2 numbers on the diagram. Surely listening for one of 3 things — 'one', 'two' and
 * 'done' — should be very reliable??" Of 12 utterances, every "one down …" came back
 * "the down …" ("the down one hundred pixels", "the down thirty pixels", "the down"),
 * while "two up ten pixels" was always heard. "the" is a filler the number reader
 * strips, so the number vanished and every one was refused.
 *
 * The repair is in the divider flow only — never a recogniser boost (a boost is a bet
 * against every other word; the day "ten" beat "turn").
 */
import { describe, it, expect } from "vitest";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { collectDividers, parseDividerAnswer, readDividerUtterance, restoreLostOne } from "@/app/lib/assist/dividerFlow";

const targets = () => collectDividers(fixtureDiagram().elements); // two dividers: 1 (L1/L2) and 2 (L2/L3)

describe("T5156 — a lost “one” is restored, in the divider flow only", () => {
  it("reads every failed utterance from the 2026-09-30 session as divider 1", () => {
    const t = targets();
    expect(t.map((d) => d.n)).toEqual([1, 2]);
    const a = parseDividerAnswer("the down one hundred pixels", t);
    expect(a && [a.target.n, a.direction, a.distance]).toEqual([1, "down", 100]);
    const b = parseDividerAnswer("the down thirty pixels", t);
    expect(b && [b.target.n, b.direction, b.distance]).toEqual([1, "down", 30]);
    const c = parseDividerAnswer("the down the hundred pixels", t);   // "one" lost in BOTH places
    expect(c && [c.target.n, c.direction, c.distance]).toEqual([1, "down", 100]);
    const d = parseDividerAnswer("the down", t);
    expect(d && [d.target.n, d.direction]).toEqual([1, "down"]);
  });

  it("goes through the whole utterance reader too, so a held number + amount still work", () => {
    const t = targets();
    const u = readDividerUtterance("the down thirty pixels", t, {});
    expect(u?.kind).toBe("move");
    expect(u && u.kind === "move" && u.answer.target.n).toBe(1);
  });

  it("leaves a real “two” alone, and a spoken “one” alone", () => {
    const t = targets();
    const two = parseDividerAnswer("two up ten pixels", t);
    expect(two && [two.target.n, two.direction, two.distance]).toEqual([2, "up", 10]);
    const one = parseDividerAnswer("one down one hundred pixels", t);
    expect(one && [one.target.n, one.direction, one.distance]).toEqual([1, "down", 100]);
  });

  it("only when “the”/“a” is straight before the way word: “the lane up”, “the task down”, a bare “the” are not answers", () => {
    const t = targets();
    expect(parseDividerAnswer("the lane up", t)).toBeNull();
    expect(parseDividerAnswer("the task down", t)).toBeNull();
    expect(parseDividerAnswer("the", t)).toBeNull();
    expect(restoreLostOne("the boundary down")).toBe("the boundary down");
    expect(restoreLostOne("the down")).toBe("1 down");
    expect(restoreLostOne("a up 20")).toBe("1 up 20");
  });
});

/**
 * T4649–T4652 — Paul's own transcript, and the 900px move at the end of it.
 *
 * The first cut of the boundary grammar was two regexes over a tidy sentence.
 * Paul's log from the same evening is what it actually has to read. Every line
 * below is his, verbatim, and only two of them worked:
 *
 *   rule  "Nudge pool boundary left."          → couldn't find "pool boundary"
 *   ✨AI  "Nudge. Left pull boundary."         → didn't understand that
 *   ✨AI  "Pool pool left boundary left."      → didn't understand that
 *   ✨AI  "Left boundary, left."               → didn't understand that
 *   ✨AI  "Merge selected pool. Left boundary left." → didn't understand that
 *   rule  "Nudge pool, left boundary, left."   → couldn't find "pool, left boundary"
 *   rule  "Nudge pull lane, left boundary left." → couldn't find "pull lane, left boundary"
 *   rule  "Move the pool left boundary"        → moved Pool 3 left
 *
 * FOUR FAULTS, and the last line is the serious one.
 *
 *  1. PUNCTUATION. The recogniser writes a hesitation as a full stop or a
 *     comma, so a contiguous-words regex sees fragments. Tokenise instead.
 *  2. "PULL". It hears pool as pull and poll — which the rest of the grammar
 *     already knew and this module did not.
 *  3. WORD ORDER, and missing words. "Left boundary, left" has no verb and no
 *     pool; "nudge pool boundary left" names no edge at all.
 *  4. "Move the pool left boundary" — no direction — fell through to the
 *     ELEMENT MOVE rule, which read it as "move the pool left" and moved it by
 *     a whole element span. A span is the element's own width, so the pool
 *     travelled about 900px. That is Paul's "the move of a pool appears to be
 *     way too large a move".
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { parsePoolBoundaryPhrase, mentionsPoolBoundary, boundaryFacing } from "@/app/lib/assist/poolBoundaryPhrase";

/** The op, if the sentence produced exactly one. */
const op1 = (text: string) => {
  const ops = parseCommand(text);
  return ops && ops.length === 1 ? ops[0] : null;
};

describe("T4649 — every line of the transcript, on the free rule path", () => {
  const LEFT_LEFT = { op: "movePoolBoundary", boundary: "left", direction: "left" };

  it("reads them all as one left-boundary-left command", () => {
    for (const line of [
      "Nudge pool boundary left.",
      "Pool pool left boundary left.",
      "Nudge. Pull left boundary, left.",
      "Left boundary, left.",
      "Nudge. Pull, left boundary, left.",
      "Nudge pool, left boundary, left.",
      "Nudge pull lane, left boundary left.",
    ]) {
      expect(op1(line), line).toEqual(LEFT_LEFT);
    }
  });

  it("does not invent a pool name out of a false start", () => {
    // "Merge" is the recogniser's "Nudge". Read whole, the words before the
    // pool word become a name — a pool called "Merge selected" that cannot
    // resolve. The command is the LAST sentence; that is the one to read.
    expect(op1("Merge selected pool. Left boundary left.")).toEqual(LEFT_LEFT);
  });

  it("still hears a tidy sentence, with its name and its distance", () => {
    expect(op1("nudge the Warehouse pool's top boundary up by 40"))
      .toEqual({ op: "movePoolBoundary", boundary: "top", direction: "up", ref: "Warehouse", distance: 40 });
    expect(op1("move the pool left boundary right"))
      .toEqual({ op: "movePoolBoundary", boundary: "left", direction: "right" });
  });
});

describe("T4650 — the edge you did not name", () => {
  it("takes the edge the movement is heading for", () => {
    expect(boundaryFacing("left")).toBe("left");
    expect(boundaryFacing("right")).toBe("right");
    expect(boundaryFacing("up")).toBe("top");
    expect(boundaryFacing("down")).toBe("bottom");
  });

  it("uses it when only a direction was said", () => {
    expect(op1("nudge pool boundary down"))
      .toEqual({ op: "movePoolBoundary", boundary: "bottom", direction: "down" });
    expect(op1("nudge pool boundary right"))
      .toEqual({ op: "movePoolBoundary", boundary: "right", direction: "right" });
  });

  it("never guesses the DIRECTION, which has two equally good answers", () => {
    expect(parsePoolBoundaryPhrase("move the pool left boundary")).toBe("needs-direction");
    expect(parsePoolBoundaryPhrase("nudge the top edge of the Customer pool")).toBe("needs-direction");
  });
});

describe("T4651 — a boundary sentence never becomes a 900px move", () => {
  it("declines rather than sliding the whole pool", () => {
    // THE bug. "move the pool left boundary" matched the element move rule —
    // the word-boundary after "left" does not care what follows — and that
    // rule moves by an element SPAN, which for a pool is its own width.
    expect(parseCommand("move the pool left boundary")).toBeNull();
    expect(op1("move the pool left boundary")?.op).not.toBe("move");
  });

  it("declines an IMPOSSIBLE pairing too, instead of moving the pool", () => {
    // The case that keeps the guard on the move rule honest. "left boundary
    // up" is refused by the parser as a plain null — not "needs-direction",
    // because a direction WAS given — so the sentence carries on down the
    // grammar and reaches `^move (.+?) (left|right|up|down)\b`, which reads it
    // as "move the pool left" and moves it by its own width. The guard is the
    // only thing standing between that sentence and a 900px jump.
    for (const line of [
      "move the pool left boundary up",
      "move the pool top boundary right",
      "move the Warehouse pool bottom boundary left",
      // Not ending in the direction word, so it slips past the NUDGE rule and
      // reaches the move rule — the 900px one. Both need the guard.
      "move the pool top boundary right now",
    ]) {
      expect(parseCommand(line), line).toBeNull();
    }
  });

  it("recognises a boundary sentence for what it is", () => {
    for (const yes of [
      "move the pool left boundary",
      "nudge pull lane, left boundary left",
      "left boundary left",
      "move the bottom border of the pool",
    ]) expect(mentionsPoolBoundary(yes), yes).toBe(true);

    for (const no of ["move the pool right", "move Task 1 right", "nudge Customer down by 40"]) {
      expect(mentionsPoolBoundary(no), no).toBe(false);
    }
  });

  it("leaves the ordinary move and nudge rules alone", () => {
    expect(op1("move the pool right")).toEqual({ op: "nudgePool", direction: "right" });
    expect(op1("move Task 1 right")).toEqual({ op: "move", ref: "Task 1", direction: "right", count: 1 });
    expect(op1("nudge Customer down by 40"))
      .toEqual({ op: "nudgePool", ref: "Customer", direction: "down", distance: 40 });
  });
});

describe("T4652 — half a sentence is still not a command", () => {
  it("declines a fragment with nothing to act on", () => {
    for (const line of ["Left.", "right.", "Nudge, pull one.", "Nudge. Left pull boundary."]) {
      expect(op1(line)?.op, line).not.toBe("movePoolBoundary");
    }
  });

  it("does not read an unrelated 'edge' as a pool boundary", () => {
    expect(parsePoolBoundaryPhrase("rename the task to Leading Edge left")).toBeNull();
    expect(parsePoolBoundaryPhrase("move the left side up")).toBeNull();
  });
});

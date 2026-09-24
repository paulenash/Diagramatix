/**
 * T4568-T4570 — B5, the over-greedy grammar rules.
 *
 * Four rules matched far more than they meant to. The damage is not the wrong
 * op — it is that A MATCH BLOCKS THE FALLBACK. A rule returning null sends the
 * sentence to the AI, which would very likely have handled it; a rule that
 * matches produces a confidently wrong op and an error, and the AI never sees
 * it. So every fix has the same shape: recognise what the rule cannot really
 * mean and decline, rather than trying to be cleverer about what it does mean.
 *
 * Two of the rules were loose for a REASON. The grammar spells pool as
 * (?:pool|poll|pull) and lane as (?:lanes?|lines?) because the recogniser
 * mishears them — which is exactly why "Assembly LINE" tripped the lane rule.
 * The guards test STRUCTURE, so the mis-hear aliases keep working where they
 * are genuinely meant.
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import {
  namesNonContainerKind, laneWordIsAttached, looksPositionalNotAName,
} from "@/app/lib/assist/greedyGuards";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { editorWithApplyLayer } from "./assistApplySource";

const opsOf = (s: string) => (parseCommand(s) ?? []).map((o) => o.op);
const firstOp = (s: string) => parseCommand(s)?.[0] as Record<string, unknown> | undefined;

describe("T4568 — the four sentences that used to fail", () => {
  it("'collapse the subprocess' is not a pool compress", () => {
    // It used to be compressPool { poolRef: "subprocess" } → "isn't a pool",
    // with the AI — which knows about EPs — never consulted.
    expect(parseCommand("collapse the subprocess")).toBeNull();
    expect(parseCommand("collapse the Quality Check subprocess")).toBeNull();
  });

  it("'swap Task A with Task B' is not a lane swap", () => {
    expect(parseCommand("swap Task A with Task B")).toBeNull();
    // BOTH sides are checked — one type noun is enough to disqualify it.
    expect(parseCommand("swap Sales with the gateway")).toBeNull();
    expect(parseCommand("swap the gateway with Sales")).toBeNull();
  });

  it("'move the Assembly Line task up' moves the TASK", () => {
    // Better than a fallback: the lane rule declines, and the general element
    // move rule — which was always there — picks it up deterministically.
    expect(opsOf("move the Assembly Line task up")).toEqual(["move"]);
    expect(firstOp("move the Assembly Line task up")).toMatchObject({
      ref: "the Assembly Line task", direction: "up",
    });
  });

  it("a positional phrase is not a name", () => {
    expect(parseCommand("insert a parallel gateway between Check Stock and Pick Items")).toBeNull();
    expect(parseCommand("add a task before Review")).toBeNull();
    expect(parseCommand("add a gateway instead of Review")).toBeNull();
    // And with no type word at all, where the whole leftover is the "name".
    expect(parseCommand("add before Review")).toBeNull();
    expect(parseCommand("add between A and B")).toBeNull();
  });
});

describe("T4569 — and the phrasings that must still work", () => {
  it("still compresses a pool named without the word", () => {
    // The walkthrough script says "compress Warehouse"; tightening must not
    // cost that.
    expect(firstOp("compress Warehouse")).toMatchObject({ op: "compressPool", poolRef: "Warehouse" });
    expect(firstOp("collapse Warehouse")).toMatchObject({ op: "compressPool" });
    expect(firstOp("compress the Customer pool")).toMatchObject({ op: "compressPool", poolRef: "Customer" });
  });

  it("still swaps two lanes named without the word", () => {
    expect(firstOp("swap Sales with Picking")).toMatchObject({ op: "swapLanes", laneA: "Sales", laneB: "Picking" });
  });

  it("still moves a lane, leading or trailing", () => {
    expect(firstOp("move Sales lane up")).toMatchObject({ op: "moveLane", ref: "Sales" });
    expect(firstOp("move lane 2 up")).toMatchObject({ op: "moveLane", ref: "lane 2" });
    expect(firstOp("move the Sales lane up by 40")).toMatchObject({ op: "moveLane", distance: 40 });
  });

  it("still honours an EXPLICIT name that looks positional", () => {
    // "called …" is the user's own words, and is the escape hatch. Only the
    // IMPLICIT leftover is second-guessed.
    expect(firstOp("add a task called Before Review")).toMatchObject({ op: "add", label: "Before Review" });
    expect(firstOp("add a task called Between Meetings")).toMatchObject({ op: "add", label: "Between Meetings" });
    expect(firstOp('add a task called "Between Meetings"')).toMatchObject({ op: "add", label: "Between Meetings" });
  });

  it("a BARE quoted name is not the escape hatch — 'called' is", () => {
    // Pre-existing, and surfaced rather than caused by B5: clean() strips a
    // trailing quote before the quoted-name branch runs, so the pair never
    // matches and the name arrives as an implicit leftover like any other. It
    // barely matters for a VOICE feature — you cannot say quote marks — and
    // "called …" always works, so this records the behaviour rather than
    // pretending the quoted form is a second escape hatch.
    expect(parseCommand('add a task "Between Meetings"')).toBeNull();
    expect(firstOp('add a task "Approve"'), "a non-positional quoted name is unaffected")
      .toMatchObject({ op: "add", label: "Approve" });
  });

  it("still adds with a real name and an after-reference", () => {
    expect(firstOp("add a task called Approve after Review"))
      .toMatchObject({ op: "add", label: "Approve", afterRef: "Review" });
    expect(firstOp("add a start event")).toMatchObject({ op: "add", symbolType: "start-event" });
  });

  it("still nudges a pool", () => {
    expect(firstOp("nudge Customer down by 40")).toMatchObject({ op: "nudgePool", distance: 40 });
  });
});

describe("T4570 — the guards themselves", () => {
  it("spots a non-container kind at either end of a reference", () => {
    expect(namesNonContainerKind("the subprocess")).toBe(true);
    expect(namesNonContainerKind("Task A")).toBe(true);
    expect(namesNonContainerKind("the gateway")).toBe(true);
    expect(namesNonContainerKind("Quality Check subprocess")).toBe(true);
  });

  it("does not mistake a container word for one", () => {
    for (const w of ["the pool", "lane 2", "Sales lane", "sub-lane", "the poll", "the line"]) {
      expect(namesNonContainerKind(w), w).toBe(false);
    }
  });

  it("leaves an ordinary name alone", () => {
    for (const w of ["Warehouse", "Sales", "Picking", "Customer"]) {
      expect(namesNonContainerKind(w), w).toBe(false);
    }
  });

  it("requires the lane word to be attached, not merely present", () => {
    expect(laneWordIsAttached("Sales", true), "trailing 'lane'").toBe(true);
    expect(laneWordIsAttached("lane 2", false), "leading 'lane'").toBe(true);
    expect(laneWordIsAttached("line 2", false), "the mis-hear still counts").toBe(true);
    expect(laneWordIsAttached("Assembly Line task", false), "the word is inside a NAME").toBe(false);
  });

  it("knows a relationship from a name", () => {
    for (const s of ["between A and B", "before Review", "instead of Review", "in place of X", "next to Y"]) {
      expect(looksPositionalNotAName(s), s).toBe(true);
    }
    for (const s of ["Before Review", "Approve", "Check Stock"]) {
      // Capitalised or not, these are only positional when they LEAD — and
      // "Before Review" as an explicit name never reaches this guard.
      expect(looksPositionalNotAName(s) === /^before/i.test(s), s).toBe(true);
    }
  });

  it("falls back to an element move when the ref is not a lane", () => {
    // The half the grammar cannot decide: "move Pick Line up" is a lane move
    // if a lane called "Pick" exists, and an element move if what exists is a
    // task called "Pick Line". Only the diagram knows.
    const editor = editorWithApplyLayer();
    const start = editor.indexOf('if (op.op === "moveLane")');
    // Comments stripped first: the branch's own docblock quotes the phrase
    // "isn't a lane" while explaining why it no longer says it, and matching
    // prose instead of code made this fail on a correct implementation.
    const branch = editor.slice(start, start + 1400)
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const notLane = branch.indexOf('if (r.type !== "lane") {');
    const moves = branch.indexOf("moveElements([r.id], 0, dy)");
    const refuses = branch.indexOf("isn't a lane");
    expect(notLane, "the wrong-type case is handled").toBeGreaterThan(-1);
    expect(moves, "by moving the element").toBeGreaterThan(notLane);
    // Matched on ORDER: a refusal sitting BEFORE the move is the behaviour
    // being replaced, and leaving the move in place below it would still look
    // right to a plain "does it mention moveElements" check.
    expect(refuses === -1 || refuses > moves, "it no longer refuses before moving").toBe(true);
  });
});

/**
 * T5222 — a slow speaker's "add an event … expanded subprocess called Handle Error" is not cut at "add an event"
 * (Paul, 2026-10-03). The usage word with the subprocess noun still to come is the middle of a phrase, so it is held.
 */
import { describe, expect, it } from "vitest";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { stitchFinals } from "@/app/lib/assist/fragmentBuffer";
import { parseCommand } from "@/app/lib/assist/commandGrammar";

describe("T5222 the front of an Event-EP phrase is held", () => {
  for (const s of ["add an event", "Add an event.", "add a call", "add a transaction", "add a normal", "add an event expanded", "add an expanded", "add the event expanded"]) {
    it(`holds “${s}”`, () => expect(isIncompleteCommand(s)).toBe(true));
  }
  for (const s of ["add an event expanded subprocess", "add an expanded subprocess", "add an event expanded subprocess called Handle Error", "add a task", "add a start event"]) {
    it(`does not hold the whole “${s}”`, () => expect(isIncompleteCommand(s)).toBe(false));
  }
});

describe("T5222 the split halves join into one command", () => {
  it("“add an event” + 2.6 s + “expanded subprocess called Handle Error” is ONE command", () => {
    const out = stitchFinals([
      { text: "add an event", atMs: 1000 },
      { text: "expanded subprocess called Handle Error", atMs: 3600 },
    ], 6500);
    expect(out).toEqual(["add an event expanded subprocess called Handle Error"]);
    const ops = parseCommand(out[0]);
    expect(ops?.[0]?.op).toBe("add");
  });
});

/**
 * T5203 — the tile's "Last command" says what the command DID, with the before and the after.
 * (Paul, 2026-10-01: “the parser makes it rename” should say what it renamed, from what, to what.)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { describeResult } from "@/app/lib/assist/describeResult";

const fx = fixtureDiagram();
const closed = fx.elements.find((e) => e.label === "Claim Closed")!;
const say = (s: string, selected: string[] = [], cursor: string | null = null) => {
  const at = cursor ? fx.elements.find((e) => e.id === cursor) : undefined;
  return describeResult(parseCommand(s)!, fx, selected, at ? { x: at.x + at.width / 2, y: at.y + at.height / 2 } : null, cursor);
};

describe("T5203 describeResult", () => {
  it("rename selected: names the element's kind, how it was found, the old name and the new one", () => {
    const r = say("rename selected to claim is now closed", [closed.id]);
    expect(r.ok).toBe(true);
    expect(r.changes).toEqual([`renamed the end event (selected) from “Claim Closed” to “Claim is now closed”`]);
  });
  it("“rename to …” with the cursor over it says so", () => {
    const r = say("rename to claim is now closed", [], closed.id);
    expect(r.changes).toEqual([`renamed the end event (under the cursor) from “Claim Closed” to “Claim is now closed”`]);
  });
  it("the diagram passed in is never changed", () => {
    say("rename selected to something else", [closed.id]);
    expect(fx.elements.find((e) => e.id === closed.id)!.label).toBe("Claim Closed");
  });
  it("a delete says what was removed", () => {
    expect(say("delete selected", [closed.id]).changes.some((c) => c.startsWith("removed the end event “Claim Closed”"))).toBe(true);
  });
  it("a command that cannot run says why instead of claiming a change", () => {
    const r = say("rename selected to x");           // nothing selected, nothing under the cursor
    expect(r.changes.length === 0 || !r.ok).toBe(true);
    expect(r.summary).toBeTruthy();
  });
  it("the tile uses it", () => {
    const tile = readFileSync("app/(dashboard)/dashboard/admin/voice-assist-help/VoiceAssistHelpClient.tsx", "utf8");
    expect(tile).toContain("describeResult(ops, fx,");
  });
});

/**
 * T5202 — “rename to <name>”: no target said means THIS one. (Paul, 2026-10-01: he said "rename",
 * pointed at a task, and went straight on to "to pay the claim" — the help said "No command fits those words".)
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { resolveAssistHelp } from "@/app/lib/assist/commandTree";

const tree = resolveAssistHelp({ patterns: null, conventions: null }).tree!;

describe("T5202 rename to <name>", () => {
  it("the parser reads it as renaming 'this' (selection, else the cursor, else the last added)", () => {
    expect(parseCommand("rename to pay the claim")).toEqual([{ op: "rename", ref: "this", label: "Pay the claim" }]);
    expect(parseCommand("relabel as approve")).toEqual([{ op: "rename", ref: "this", label: "Approve" }]);
  });
  it("the forms that already worked are unchanged", () => {
    expect(parseCommand("rename this to pay the claim")).toEqual([{ op: "rename", ref: "this", label: "Pay the claim" }]);
    expect(parseCommand("rename review claim to approve")).toEqual([{ op: "rename", ref: "review claim", label: "Approve" }]);
  });
  it("the help agrees: after “rename” it offers “to”, and the whole sentence is accepted", () => {
    expect(tree.accepts("rename to pay the claim", {})).toBe(true);
    const r = tree.next(["rename"], {});
    expect(r.ok && r.next.some((i) => i.text === "to")).toBe(true);
  });
});

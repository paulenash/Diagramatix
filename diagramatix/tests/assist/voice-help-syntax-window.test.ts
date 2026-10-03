/**
 * T5223 — clicking a next word in the Voice Assist Help panel opens a window with the full syntax of the command
 * being completed (Paul, 2026-10-03).
 */
import { describe, expect, it } from "vitest";
import { resolveAssistHelp, syntaxFor } from "@/app/lib/assist/commandTree";

const tree = resolveAssistHelp({ patterns: null, conventions: null }).tree!;
const input = (interim: string, extra: Record<string, unknown> = {}) => ({ interim, ghost: false, flow: null, ...extra });

describe("T5223 the syntax window", () => {
  it("a first word lists every command line that starts with it", () => {
    const r = syntaxFor(tree, input(""), "add");
    expect(r.heard).toBe("add");
    expect(r.lines.length).toBeGreaterThan(3);
    for (const l of r.lines) expect(l.toLowerCase()).toMatch(/add|\(|\{/);
  });
  it("a next word narrows to the lines that still fit what was heard plus that word", () => {
    const all = syntaxFor(tree, input(""), "add").lines;
    const some = syntaxFor(tree, input("add"), "an").lines;
    const none = syntaxFor(tree, input(""), "banana").lines;                      // no command begins with it
    expect(some.length).toBeGreaterThan(0);
    expect(some.length).toBeLessThanOrEqual(all.length);
    expect(none).toEqual([]);
  });
  it("the @on / @nosel tags are not shown", () => {
    for (const w of ["add", "shrink", "delete", "rename"]) for (const l of syntaxFor(tree, input(""), w).lines) expect(l).not.toMatch(/@(on|nosel)/);
  });
  it("a bracketed optional word is looked up as the word itself; a variable has no syntax", () => {
    expect(syntaxFor(tree, input("rename selected"), "[to]").heard).toBe("rename selected to");
    expect(syntaxFor(tree, input("rename"), "<new_element_name>").lines).toEqual([]);
  });
  it("only the commands that apply to the selection are listed", () => {
    const withEp = syntaxFor(tree, input("", { selectedKinds: ["subprocess-expanded"] }), "shrink").lines;
    expect(withEp).toEqual([]);
  });
  it("a guided flow has nothing to show", () => {
    expect(syntaxFor(tree, input("", { flow: { kind: "dividers" } }), "up").lines).toEqual([]);
  });
});

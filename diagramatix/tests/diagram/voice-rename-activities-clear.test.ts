/**
 * Voice Assist "rename by number" — Paul, 2026-10-01:
 *   1. "rename activities" should include every activity type: task, collapsed
 *      subprocess and expanded subprocess.
 *   2. "rename tasks" is correct (tasks only).
 *   3. "rename subprocesses" is collapsed AND expanded (it already was).
 *   4. "Is there a way to rename a connector to empty? If not invent one" — there was
 *      not: an empty name meant "cancel". "clear" / "no label" / "blank" now leave a
 *      connector or message with no label.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { collectRenameTargets, isClearLabelWord, parseRenameType } from "@/app/lib/assist/renameTargets";
import type { DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const els = [
  E({ id: "t1", type: "task", x: 100, y: 100, width: 100, height: 60, label: "Task A" }),
  E({ id: "s1", type: "subprocess", x: 300, y: 100, width: 100, height: 60, label: "Collapsed" }),
  E({ id: "s2", type: "subprocess-expanded", x: 500, y: 100, width: 300, height: 200, label: "Expanded" }),
  E({ id: "g1", type: "gateway", x: 900, y: 100, width: 40, height: 40, label: "G" }),
];

describe("T5157 — “rename activities” is every activity; “tasks” is tasks only; “subprocesses” is both subprocess kinds", () => {
  it("maps the spoken words", () => {
    expect(parseRenameType("activities")).toBe("activity");
    expect(parseRenameType("activity")).toBe("activity");
    expect(parseRenameType("tasks")).toBe("task");
    expect(parseRenameType("steps")).toBe("task");
    expect(parseRenameType("subprocesses")).toBe("subprocess");
  });

  it("numbers what each word means", () => {
    const ids = (t: Parameters<typeof collectRenameTargets>[2]) => collectRenameTargets(els, [], t).map((x) => x.id);
    expect(ids("activity")).toEqual(["t1", "s1", "s2"]);
    expect(ids("task")).toEqual(["t1"]);
    expect(ids("subprocess")).toEqual(["s1", "s2"]);
  });

  it("the command “rename activities” opens the flow for activities", () => {
    expect(parseCommand("rename activities")).toMatchObject([{ op: "renameByType", itemType: "activity" }]);
    expect(parseCommand("rename tasks")).toMatchObject([{ op: "renameByType", itemType: "task" }]);
  });
});

describe("T5158 — saying “clear” in place of a name leaves a connector or message with no label", () => {
  it("recognises the words, and only as the whole answer", () => {
    for (const said of ["clear", "Clear.", "clear it", "clear the label", "no label", "no name", "blank", "empty", "nothing", "remove the label", "delete label"]) {
      expect(isClearLabelWord(said), said).toBe(true);
    }
    for (const said of ["Clear Customer Order", "No", "Clearing House", "nothing to do", "Blank Form Received", "Approved?", ""]) {
      expect(isClearLabelWord(said), said).toBe(false);
    }
  });

  it("the rename flow clears a CONNECTOR, refuses an element, and keeps one code path", () => {
    const src = readFileSync("app/hooks/useVoiceSession.ts", "utf8").replace(/\r\n/g, "\n");
    const fn = src.slice(src.indexOf("const applyRenameName = useCallback"), src.indexOf("// Handle one utterance while the guided rename flow is active."));
    expect(fn).toContain("const clearing = isClearLabelWord(name);");
    expect(fn).toContain('if (clearing && target.kind !== "connector")');
    expect(fn).toContain("a name can’t be cleared here");
    // The same updateConnectorLabel call writes both a name and "" — no second caller to arm the debug recording.
    expect((fn.match(/updateConnectorLabel\(/g) ?? []).length).toBe(1);
    expect((fn.match(/armDebugBefore\(/g) ?? []).length).toBe(1);
    expect(fn).toContain('const clean = clearing ? "" :');
  });

  it("the connector really ends up with an empty label", () => {
    // updateConnectorLabel(id, "") is what the editor itself does when a label is cleared by hand.
    const src = readFileSync("app/hooks/useDiagram.ts", "utf8");
    expect(src).toContain("...(label !== undefined ? { label } : {})");
  });
});

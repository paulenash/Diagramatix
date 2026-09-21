/**
 * Paul's log, 2026-09-15:
 *   ✨ AI "Swap." → didn't understand that
 *   ✨ AI "Top and bottom." → didn't understand that
 *   ✨ AI "Swap, top and bottom." → "swap Lane 1 with Lane 3" → lanes must be next to each other
 * Three faults: a lone verb was flushed before the rest arrived, a comma after
 * the verb broke the grammar, and the AI fallback had not been told the
 * gateway swap exists. Plus one the same read found: the by-number "add a
 * message" was judged incomplete and held for the whole grace period.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { parseCommand } from "@/app/lib/assist/commandGrammar";

const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, "..", "..", ...p), "utf8");

describe("a command split at a pause waits for the rest", () => {
  it("T4416 — a lone verb, a dangling connective or a half rename/connect is incomplete; whole commands are not", () => {
    for (const s of ["Swap.", "rename", "Move", "nudge", "add", "label", "connect"]) expect(isIncompleteCommand(s), s).toBe(true);
    for (const s of ["swap top and", "rename Task 8 to", "add a task called", "connect Review", "add message from Review"]) expect(isIncompleteCommand(s), s).toBe(true);
    for (const s of [
      "swap top and bottom", "Swap, top and bottom.", "rename tasks", "rename the lanes", "label selected", "label selected Yes", "label connectors",
      "connect them", "connect Review to Approve", "move these right", "nudge the selected task left", "delete these", "undo that", "stop", "done",
      "add a message", "send a message", "add a message to the selected", "add a message from this", "add message from Review to Customer labelled Hi",
    ]) expect(isIncompleteCommand(s), s).toBe(false);
    // The editor uses the module, not a private copy.
    const ed = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(ed).toContain('import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";');
    expect(ed).not.toContain("function isIncompleteCommand(");
  });

  it("T4417 — a comma after the verb is a breath, not syntax; name lists keep their commas", () => {
    expect(parseCommand("Swap, top and bottom.")).toEqual([{ op: "swapGatewayPoints", a: "top", b: "bottom" }]);
    expect(parseCommand("Rename, Review to Approve")).toEqual([{ op: "rename", ref: "Review", label: "Approve" }]);
    expect(parseCommand("add 3 lanes to Warehouse called Sales, Picking and Shipping")).toEqual([{ op: "addLanes", poolRef: "Warehouse", labels: ["Sales", "Picking", "Shipping"] }]);
  });

  it("T4418 — the AI fallback is told about the swap, nudge directions, label and by-number commands", () => {
    const route = read("app", "api", "ai", "command", "route.ts");
    // The CLAIM is that the prompt teaches the gateway-point commands and
    // keeps them apart from a lane swap — not the exact sentence, which gained
    // the MOVE companion on 2026-09-21.
    expect(route).toMatch(/swap top and bottom[\s\S]{0,80}SELECTED gateways?['’]? connection points/);
    expect(route).toContain("move top to bottom");
    expect(route).toContain("NOT a lane swap unless two lane NAMES are given");
    expect(route).toContain("nudge <name> up|down|left|right");
    expect(route).toContain('{ "op":"swapGatewayPoints"');
    expect(route).toContain('{ "op":"moveGatewayPoint"');
    expect(route).toContain('{ "op":"labelSelected"');
    expect(route).toContain('{ "op":"renameByType"');
  });
});

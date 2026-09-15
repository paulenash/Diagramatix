/**
 * Paul, 2026-09-15 (third batch): nudge in every direction and only what was
 * named, group nudge and move, "label selected", "label connectors", and
 * swapping a selected gateway's connection points.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { validateOps } from "@/app/lib/assist/ops";
import { reducer } from "@/app/hooks/useDiagram";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";

const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, "..", "..", ...p), "utf8");
const editor = () => read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
const el = (id: string, type: string, label = "", extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });

describe("1 & 2 — nudge and move", () => {
  it("T4411 — nudge parses in all four directions at 20 px; the engine moves only the named element (and its boundary events)", () => {
    for (const d of ["up", "down", "left", "right"]) {
      expect(parseCommand(`nudge the selected task ${d}`)).toEqual([{ op: "nudgePool", ref: "selected task", direction: d }]);
    }
    expect(parseCommand("bump Approve to the right")).toEqual([{ op: "nudgePool", ref: "Approve", direction: "right" }]);
    expect(parseCommand("nudge these down")).toEqual([{ op: "nudgePool", ref: "these", direction: "down" }]);
    expect(parseCommand("nudge Customer down by 40")).toEqual([{ op: "nudgePool", ref: "Customer", direction: "down", distance: 40 }]);
    // A right-nudge of a task with a boundary event: both move 20; the neighbour does not.
    const t = el("t", "task", "Pick", { x: 200, y: 100 });
    const be = el("be", "intermediate-event", "Timeout", { x: 270, y: 140, width: 40, height: 40, boundaryHostId: "t" });
    const n = el("n", "task", "Neighbour", { x: 400, y: 100 });
    const state = { elements: [t, be, n], connectors: [] } as unknown as DiagramData;
    const out = reducer(state, { type: "MOVE_ELEMENTS", payload: { ids: ["t"], dx: 20, dy: 0 } } as never);
    expect(out.elements.find((e) => e.id === "t")!.x).toBe(220);
    expect(out.elements.find((e) => e.id === "be")!.x, "a boundary event rides with its host").toBe(290);
    expect(out.elements.find((e) => e.id === "n")!.x, "nothing else moves").toBe(400);
    const ed = editor();
    expect(ed).toContain('const dx = op.direction === "left" ? -dist : op.direction === "right" ? dist : 0;');
    expect(ed).toContain("moveElements([target.id], dx, dy);");
  });

  it("T4412 — a selection nudges as a group at 20 px and moves as a group at 100 px per step, then nothing stays selected", () => {
    expect(parseCommand("move these right")).toEqual([{ op: "move", ref: "these", direction: "right", count: 1 }]);
    expect(parseCommand("move the selected task two steps up")?.[0]).toMatchObject({ op: "move", direction: "up", count: 2 });
    const ed = editor();
    expect(ed).toMatch(/const selIds = op\.ref \? resolveSelectionRefs\(op\.ref, els, selectedIds\) : null;\s*if \(selIds && selIds\.length > 1\) \{\s*moveElements\(selIds, dx, dy\);/);
    expect(ed).toMatch(/const step = 100 \* \(op\.count \?\? 1\);[\s\S]{0,400}moveElements\(selIds, gdx, gdy\);\s*elementsMoveEnd\(\);\s*setSelectedElementIds\(new Set\(\)\);/);
  });
});

describe("3 & 4 — labelling connectors", () => {
  it("T4413 — 'label selected <text>' labels the selected connector; bare 'label selected' waits; 'label connectors' numbers them", () => {
    expect(parseCommand("label selected Yes")).toEqual([{ op: "labelSelected", label: "Yes" }]);
    expect(parseCommand("label the selected connector Approved")).toEqual([{ op: "labelSelected", label: "Approved" }]);
    expect(parseCommand("label selected as No")).toEqual([{ op: "labelSelected", label: "No" }]);
    expect(parseCommand("label selected")).toEqual([{ op: "labelSelected" }]);
    expect(parseCommand("label connectors")).toEqual([{ op: "renameByType", itemType: "connector" }]);
    expect(parseCommand("label messages")).toEqual([{ op: "renameByType", itemType: "message" }]);
    expect(parseCommand("label tasks"), "the same numbered flow for every type").toEqual([{ op: "renameByType", itemType: "task" }]);
    expect(validateOps([{ op: "labelSelected", label: " Yes " }])).toEqual([{ op: "labelSelected", label: "Yes" }]);

    const ed = editor();
    expect(ed).toContain('if (op.op === "labelSelected") {');
    expect(ed).toContain("const cid = selectedConnectorIdRef.current;");
    expect(ed, "with text: label and deselect").toMatch(/updateConnectorLabel\(cid, op\.label\);\s*setSelectedConnectorId\(null\);/);
    expect(ed, "without text: a single-item name phase").toContain('setRenameFlow({ phase: "name", itemType: "connector", targetId: cid, kind: "connector", single: true });');
    expect(ed, "…which ends the flow instead of numbering everything").toMatch(/if \(single\) \{\s*\/\/[^\n]*\n\s*setRenameFlow\(null\);/);
  });
});

describe("5 — swap a selected gateway's connection points", () => {
  it("T4414 — the grammar takes top / bottom / middle (centre) in either order and refuses a no-op; the lane swap is untouched", () => {
    expect(parseCommand("swap top and bottom")).toEqual([{ op: "swapGatewayPoints", a: "top", b: "bottom" }]);
    expect(parseCommand("swap bottom and middle")).toEqual([{ op: "swapGatewayPoints", a: "bottom", b: "middle" }]);
    expect(parseCommand("swap top with centre")).toEqual([{ op: "swapGatewayPoints", a: "top", b: "middle" }]);
    expect(parseCommand("swap the middle and the bottom points")).toEqual([{ op: "swapGatewayPoints", a: "middle", b: "bottom" }]);
    expect(parseCommand("swap top and top"), "a no-op is not a command").not.toEqual([{ op: "swapGatewayPoints", a: "top", b: "top" }]);
    expect(parseCommand("swap Sales with Marketing")).toEqual([{ op: "swapLanes", laneA: "Sales", laneB: "Marketing" }]);
    expect(validateOps([{ op: "swapGatewayPoints", a: "top", b: "top" }]), "validateOps drops a no-op").toEqual([]);

    // EVERY combination (Paul): five points, every ordered pair of distinct
    // points, with "and" / "with", with and without "the" and a trailing noun.
    const points = ["top", "bottom", "middle", "left", "right"] as const;
    let checked = 0;
    for (const a of points) for (const b of points) {
      if (a === b) { expect(parseCommand(`swap ${a} and ${b}`)?.[0]?.op, `${a}/${b} is a no-op`).not.toBe("swapGatewayPoints"); continue; }
      for (const phrase of [`swap ${a} and ${b}`, `swap the ${a} with the ${b}`, `swap ${a} and ${b} points`]) {
        expect(parseCommand(phrase), phrase).toEqual([{ op: "swapGatewayPoints", a, b }]);
        checked++;
      }
    }
    expect(checked).toBe(20 * 3);
    expect(parseCommand("swap centre and bottom")).toEqual([{ op: "swapGatewayPoints", a: "middle", b: "bottom" }]);
    expect(parseCommand("swap center with top")).toEqual([{ op: "swapGatewayPoints", a: "middle", b: "top" }]);
  });

  it("T4415 — the editor requires ONE selected gateway, swaps outgoing points on a decision and incoming on a merge, via updateConnectorEndpoint", () => {
    const ed = editor();
    expect(ed).toContain('if (op.op === "swapGatewayPoints") {');
    expect(ed).toContain('if (!g || g.type !== "gateway") { results.push(selectedIds.length > 1 ? "select just the one gateway" : "select a gateway first"); anyFail = true; continue; }');
    expect(ed).toContain('const endpoint: "source" | "target" = isMerge ? "target" : "source";');
    expect(ed, "middle = the side in the flow direction").toContain('const middle: Side = isMerge ? "left" : "right";');
    expect(ed).toMatch(/updateConnectorEndpoint\(ca\.id, endpoint, g\.id, sb, 0\.5\);\s*updateConnectorEndpoint\(cb\.id, endpoint, g\.id, sa, 0\.5\);/);
    // The reducer re-attaches an endpoint to the new side (and pushes history via the helper).
    const g = el("g", "gateway", "Ok?", { x: 300, y: 100, width: 40, height: 40 });
    const a = el("a", "task", "A", { x: 500, y: 0 }); const b = el("b", "task", "B", { x: 500, y: 200 });
    const conn = (id: string, targetId: string, sourceSide: string) => ({ id, sourceId: "g", targetId, type: "sequence", directionType: "directed", routingType: "rectilinear", sourceSide, targetSide: "left", sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5, waypoints: [] });
    const state = { elements: [g, a, b], connectors: [conn("c1", "a", "top"), conn("c2", "b", "bottom")] } as unknown as DiagramData;
    const s1 = reducer(state, { type: "UPDATE_CONNECTOR_ENDPOINT", payload: { connectorId: "c1", endpoint: "source", newElementId: "g", newSide: "bottom", newOffsetAlong: 0.5 } } as never);
    const s2 = reducer(s1, { type: "UPDATE_CONNECTOR_ENDPOINT", payload: { connectorId: "c2", endpoint: "source", newElementId: "g", newSide: "top", newOffsetAlong: 0.5 } } as never);
    expect(s2.connectors.find((c) => c.id === "c1")!.sourceSide).toBe("bottom");
    expect(s2.connectors.find((c) => c.id === "c2")!.sourceSide).toBe("top");
    expect(s2.connectors.find((c) => c.id === "c1")!.targetId, "targets are untouched").toBe("a");
  });
});

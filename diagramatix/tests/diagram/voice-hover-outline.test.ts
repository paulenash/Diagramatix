/**
 * T5212 — the hover highlight on the Diagram screen's Voice Assist (Paul, 2026-10-02: "add the hover highlight
 * that exists in the mobile voice assist"), and the rule that a Start or End event inside an EP is always unnamed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { targetNow } from "@/app/lib/assist/commandTree";
import { EMPTY_DIAGRAM, type DiagramElement } from "@/app/lib/diagram/types";

const editor = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
const el = (id: string, type: string, x: number, y: number, w: number, h: number, label: string, parentId?: string): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}) }) as DiagramElement;

describe("T5212 the hover outline", () => {
  it("the target is tracked whenever Voice Assist is on, not only while the help panel shows", () => {
    expect(editor).toContain("const helpTarget = useTargetNow(helpActive, () => ({");
  });
  it("with Voice Assist on, the element under the cursor is outlined even with the help panel off; with it on, the outline follows “this”", () => {
    expect(editor).toContain("if (!helpActive || !helpTarget.id) return null;");
    expect(editor).toContain('if (!helpShown && helpTarget.kind !== "cursor") return null;');
    expect(editor).toContain("voiceTargetOutline={helpOutline}");
  });
  it("“under the cursor” means: nothing selected and the pointer over an element — what targetNow reports as kind 'cursor'", () => {
    const els = [el("a", "task", 100, 100, 100, 60, "Review")];
    expect(targetNow(els, [], null, { x: 120, y: 120 }).kind).toBe("cursor");
    expect(targetNow(els, ["a"], null, { x: 120, y: 120 }).kind).toBe("selected");   // selected already has its own highlight
    expect(targetNow(els, [], null, { x: 900, y: 900 }).kind).not.toBe("cursor");
  });
});

describe("T5212 Start and End events inside an EP are always unnamed", () => {
  it("the ones made by “add a task” inside an EP carry no name", () => {
    const h = headlessDiagram({
      ...EMPTY_DIAGRAM,
      elements: [el("pool", "pool", 0, 0, 760, 300, "Claims"), el("lane", "lane", 30, 0, 730, 300, "Intake", "pool"), el("ep", "subprocess-expanded", 100, 20, 150, 170, "Review Claim", "lane")],
      connectors: [],
    });
    const r = applyAssistOps(parseCommand("add a task called Check Stock")!, h.context({ selectedIds: ["ep"] }));
    expect(r.ok, r.summary).toBe(true);
    const events = h.data.elements.filter((e) => e.parentId === "ep" && (e.type === "start-event" || e.type === "end-event"));
    expect(events).toHaveLength(2);
    for (const e of events) expect((e.label ?? "").trim(), e.type).toBe("");
  });
});

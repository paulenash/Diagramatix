/**
 * Stage 5 of mobile voice (2026-09-29) — Voice Assist on the phone: tap the mic
 * and say "add task Check invoice after Receive order"; see it; say "undo
 * that"; or type the command.
 *
 * The session itself (router, flows, mic loop) is the desktop's, moved out of
 * the editor in stage 4 and tested in tests/voice-session/. These guard what
 * is new: the pure phone rules, the shared element cap, the screen's wiring.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, createProject, createDiagram } from "../_setup/factories";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { elementLimitBlock } from "@/app/lib/diagram/elementLimit";
import { elementCountLimitFor } from "@/app/lib/diagram/elementLimitServer";
import { VOICE_EXAMPLES, currentQuestion, elementAt, lastEditedBox, phoneWording, selectionAfterTap } from "@/app/lib/mobile/voiceEdit";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const el = (id: string, x: number, y: number, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: "task", x, y, width: 100, height: 60, label: id, properties: {}, ...extra } as unknown as DiagramElement);
const data = (...elements: DiagramElement[]): DiagramData => ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as DiagramData);

describe("T5083 — the phone's Voice Assist: the pure rules", () => {
  it("the session's mouse wording becomes the phone's; a question is shown when the last line asks one", () => {
    expect(phoneWording("I don't know where “here” is — move the mouse over the canvas first"))
      .toBe("I don't know where “here” is — tap the canvas where you mean, then say it again");
    expect(phoneWording("added Receive order")).toBe("added Receive order");
    expect(currentQuestion([{ summary: "added X" }, { summary: "clear the whole diagram (4 elements)? — say “yes” to confirm" }])).toContain("say “yes”");
    expect(currentQuestion([{ summary: "pick a task by number, then say the new name — “cancel” to stop" }])).not.toBeNull();
    expect(currentQuestion([{ summary: "deleted Pay supplier" }])).toBeNull();
    expect(currentQuestion([])).toBeNull();
  });

  it("the view follows the element the last edit added or moved — not a rename or a delete", () => {
    const a = data(el("a", 0, 0), el("b", 200, 0));
    expect(lastEditedBox(null, a)).toEqual({ x: 200, y: 0, width: 100, height: 60 });
    expect(lastEditedBox(a, data(el("a", 0, 0), el("b", 200, 0), el("c", 400, 0)))).toEqual({ x: 400, y: 0, width: 100, height: 60 });
    expect(lastEditedBox(a, data(el("a", 0, 40), el("b", 200, 0)))).toEqual({ x: 0, y: 40, width: 100, height: 60 });
    expect(lastEditedBox(a, data(el("a", 0, 0, { label: "Renamed" }), el("b", 200, 0)))).toBeNull();
    expect(lastEditedBox(a, data(el("a", 0, 0)))).toBeNull();
  });

  it("a tap picks the topmost shown element under it; a second tap unselects; several can be selected; empty canvas clears", () => {
    const d = data(el("under", 0, 0, { width: 300, height: 300 }), el("over", 50, 50), el("note", 500, 0, { type: "review-comment" } as never));
    expect(elementAt(d, 60, 60)?.id).toBe("over");
    expect(elementAt(d, 250, 250)?.id).toBe("under");
    expect(elementAt(d, 900, 900)).toBeNull();
    expect(elementAt(d, 510, 10), "a review comment is not tapped here").toBeNull();
    const over = elementAt(d, 60, 60)!, under = elementAt(d, 250, 250)!;
    expect(selectionAfterTap([], over, false)).toEqual(["over"]);
    expect(selectionAfterTap(["over"], over, false)).toEqual([]);
    expect(selectionAfterTap(["over"], under, false)).toEqual(["under"]);
    expect(selectionAfterTap(["over"], under, true)).toEqual(["over", "under"]);
    expect(selectionAfterTap(["over", "under"], under, true)).toEqual(["over"]);
    expect(selectionAfterTap(["over"], null, false)).toEqual([]);
    expect(selectionAfterTap(["over"], null, true)).toEqual(["over"]);
  });

  it("the examples offered are commands the grammar understands (or the guided flows the session opens)", () => {
    for (const x of ["add task Check invoice after Receive order", "add a pool called Customer", "rename Check invoice to Verify invoice", "delete Pay supplier", "undo that", "again", "clear the diagram", "rename tasks"]) {
      expect(VOICE_EXAMPLES.some((e) => e.startsWith(x)), x).toBe(true);
      expect(parseCommand(x), x).not.toBeNull();
    }
  });
});

describe("T5084 — the element cap is one rule, for the desktop and the phone", () => {
  it("adds past the cap are refused with the message; artifacts and 'no cap' always pass", () => {
    const three = [{ type: "task" }, { type: "task" }, { type: "start-event" }];
    expect(elementLimitBlock(three, 3, "task")).toBe("Element limit reached (3/3). Upgrade your subscription to add more.");
    expect(elementLimitBlock(three, 4, "task")).toBeNull();
    expect(elementLimitBlock(three, 3, "data-object")).toBeNull();
    expect(elementLimitBlock([...three, { type: "text-annotation" }, { type: "data-store" }], 4, "task"), "artifacts do not count").toBeNull();
    expect(elementLimitBlock(three, null, "task")).toBeNull();
    expect(elementLimitBlock(three, undefined, "task")).toBeNull();
    // The desktop editor uses it — no second copy.
    const ed = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(ed).toContain("const blocked = elementLimitBlock(data.elements, elementCountLimit, symbolType);");
    expect(ed).not.toContain("const ARTIFACT_TYPES_GATED");
  });

  describe("from the subscription, on the server", () => {
    beforeEach(async () => { await truncateAll(); });
    it("the BPMN cap for a BPMN diagram, the other for the rest; none for a reviewer; the phone's GET carries it", async () => {
      await prisma.subscriptionLevel.create({ data: { id: "tiny", name: "Tiny", sortOrder: 1, maxBpmnElementsPerDiagram: 5, maxNonBpmnElementsPerDiagram: 9 } });
      const capped = await createUser();
      await prisma.user.update({ where: { id: capped.id }, data: { subscriptionLevelId: "tiny" } });
      expect(await elementCountLimitFor(capped.id, "bpmn")).toBe(5);
      expect(await elementCountLimitFor(capped.id, "state-machine")).toBe(9);
      expect(await elementCountLimitFor(capped.id, "bpmn", true), "an assigned reviewer").toBeNull();
      const free = await createUser();
      expect(await elementCountLimitFor(free.id, "bpmn"), "no subscription level: no cap").toBeNull();
      expect(read("app/api/diagrams/[id]/route.ts")).toContain("const elementCountLimit = canEdit ? await elementCountLimitFor(");
      void createUserWithOrg; void createProject; void createDiagram; void vi;
    });
  });
});

describe("T5085 — the phone screen wires the session as the desktop does", () => {
  const screen = () => read("app/m/diagram/[id]/MobileDiagramScreen.tsx");
  const editor = () => read("app/components/mobile/MobileVoiceEditor.tsx");

  it("the host is complete: every value and action the session reads is supplied", () => {
    const hook = read("app/hooks/useVoiceSession.ts");
    const iface = hook.slice(hook.indexOf("export interface VoiceSessionHost"), hook.indexOf("export function useVoiceSession"));
    const actions = [...(iface.match(/Pick<AssistDiagramActions, ([^>]+)>/)?.[1].matchAll(/"([A-Za-z]+)"/g) ?? [])].map((m) => m[1]);
    const values = [...iface.matchAll(/^  ([A-Za-z]+): /gm)].map((m) => m[1]);
    expect(actions.length + values.length, "58 host fields").toBe(58);
    const ed = editor();
    for (const n of values) expect(new RegExp(`\\b${n}\\b`).test(ed), `host value ${n}`).toBe(true);
    const supplied = ed.slice(ed.indexOf("const SESSION_ACTIONS"), ed.indexOf("] as const;"));
    for (const n of actions) if (n !== "addElementGated") expect(supplied, `action ${n}`).toContain(`"${n}"`);
    expect(ed).toContain("addElementGated,");
  });

  it("it is the desktop's session and autosave — one add gate, no review-comment collapsing", () => {
    const ed = editor();
    expect(ed).toContain('import { useVoiceSession } from "@/app/hooks/useVoiceSession";');
    expect(ed).toContain('import { useAutoSave } from "@/app/hooks/useAutoSave";');
    expect(ed).toContain("elementLimitBlock(data.elements, elementCountLimit, symbolType)");
    expect(ed).not.toMatch(/collapseAllReviewComments|reviewCollapse/);
    expect(ed).toContain("useAutoSave(diagramId, data, 1500, false, version)");
    expect(ed, "a conflict is merged, as on the desktop").toContain("d.setData(conflict.merged);");
    expect(ed, "the sheet's box is 16px so iOS does not zoom").toContain("text-base border border-gray-300 rounded-lg px-3 h-11");
    expect(ed).not.toMatch(/\b(alert|confirm|prompt)\(/);
  });

  it("the screen offers it to owners and editors of a BPMN diagram whose plan has Voice Assist, loaded only on demand", () => {
    const s = screen();
    expect(s).toContain('const canVoice = !!d && d.canEdit && d.type === "bpmn" && voiceFeature === "available";');
    expect(s).toContain('useFeatureState("voice-assist")');
    expect(s).toContain('import("@/app/components/mobile/MobileVoiceEditor")');
    expect(s).toContain("{ ssr: false,");
    expect(s).toContain("elementCountLimit={d.elementCountLimit}");
    expect(s, "Done reloads the diagram").toMatch(/onClose=\{\(\) => \{ setVoiceOn\(false\);[^}]*void load\(\);/);
  });

  it("the viewer keeps the person's view while editing and never re-fits on a resize", () => {
    const v = read("app/components/mobile/MobileDiagramView.tsx");
    expect(v).toContain("keepView = false,");
    expect(v).toContain("if (keepView) return;");
    expect(v).toContain("if (!keepView || wasEmptyRef.current) fittedRef.current = false;");
    // The read-only viewer is unchanged: it is not given keepView.
    expect(screen()).not.toMatch(/<MobileDiagramView[^>]*keepView/);
  });
});

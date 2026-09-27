/**
 * "Move dividers" (Paul, 2026-09-27): "introduce a new command: 1. say "move
 * dividers" 2. Numbers appear on the lane dividers themselves. 3. <n> up 100
 * pixels, or 4. <n> down 2 tasks — subject to the current constraints. This
 * should be very reliable!!"
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { collectDividers, parseDividerAnswer, dividerOp, dividerReply, explainDividerMiss, buildDividerFlow } from "@/app/lib/assist/dividerFlow";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { NOT_GENERATED } from "@/app/lib/assist/commandGenerator";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const paul = (): DiagramData => JSON.parse(readFileSync("tests/fixtures/voice-debug/boundary-session-4.json", "utf8")).diagram;
const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

describe("T4966 — “move dividers” numbers every divider, ON its line", () => {
  it("is heard every way it is said, and is never held as half a move", () => {
    for (const said of ["move dividers", "move the dividers", "move lane dividers", "move the lane dividers", "number the dividers", "show dividers", "Move dividers."]) {
      expect(parseCommand(said), said).toEqual([{ op: "numberDividers" }]);
      expect(isIncompleteCommand(said), said).toBe(false);
    }
  });

  it("finds each divider as the boundary command does — lanes in a pool, sub-lanes in a lane — numbered top to bottom", () => {
    const d = fixtureDiagram().elements;
    const ds = collectDividers(d);
    expect(ds.map((t) => [t.n, t.aboveId, t.belowId])).toEqual([[1, "L1", "L2"], [2, "L2", "L3"]]);
    for (const t of ds) {
      const below = d.find((e) => e.id === t.belowId)!;
      expect(t.y, "the badge sits ON the line").toBe(below.y);
      expect(t.kind).toBe("divider");
    }
    // Sub-lanes add their own dividers, further right than the lane's.
    const L2 = d.find((e) => e.id === "L2")!;
    const withSubs = [...d,
      E({ id: "S1", type: "lane", label: "Sub A", x: L2.x + 36, y: L2.y, width: L2.width - 36, height: L2.height / 2, parentId: "L2", properties: {} }),
      E({ id: "S2", type: "lane", label: "Sub B", x: L2.x + 36, y: L2.y + L2.height / 2, width: L2.width - 36, height: L2.height / 2, parentId: "L2", properties: {} })];
    const all = collectDividers(withSubs);
    expect(all.map((t) => `${t.aboveId}|${t.belowId}`)).toEqual(["L1|L2", "S1|S2", "L2|L3"]);
    const sub = all.find((t) => t.aboveId === "S1")!;
    expect(sub.x).toBeGreaterThan(all.find((t) => t.aboveId === "L1")!.x);
  });

  it("opens the numbers on the canvas (the apply layer asks the editor), or says there is nothing to number", () => {
    const h = headlessDiagram(fixtureDiagram());
    const r = applyAssistOps(parseCommand("move dividers")!, h.context());
    expect(r).toEqual({ ok: true, summary: "2 dividers numbered — say “<n> up 100 pixels”, “<n> down 2 tasks”… then “done”" });
    expect(h.screen).toEqual(["dividers"]);
    const lone = { elements: [E({ id: "P", type: "pool", label: "Solo", x: 0, y: 0, width: 600, height: 200, properties: { poolType: "white-box" } })], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as DiagramData;
    expect(buildDividerFlow(lone.elements)).toEqual({ error: "there are no lane dividers here — a pool needs two lanes (or a lane two sub-lanes)" });
  });
});

describe("T4967 — the answer: “<n> up 100 pixels”, “<n> down 2 tasks”, under the current constraints", () => {
  const ts = collectDividers(fixtureDiagram().elements);

  it("reads the number, the way and how far — every way the distance can be said", () => {
    const a = (s: string) => { const x = parseDividerAnswer(s, ts); return x ? [x.target.n, x.direction, x.distance ?? "step"] : null; };
    expect(a("1 up 100 pixels")).toEqual([1, "up", 100]);
    expect(a("2 down 2 tasks")).toEqual([2, "down", 128]);
    expect(a("two up forty")).toEqual([2, "up", 40]);
    expect(a("number 1 down a bit")).toEqual([1, "down", 10]);
    expect(a("divider 2 up by one hundred")).toEqual([2, "up", 100]);
    expect(a("move 2 up")).toEqual([2, "up", "step"]);
    expect(a("1 down half a task")).toEqual([1, "down", 32]);
    expect(a("3 up 10"), "no divider 3").toBeNull();
    expect(a("up 10"), "no number").toBeNull();
    expect(explainDividerMiss("3 up 10", ts)).toBe("there’s no divider 3 — say 1–2, then up or down");
    expect(explainDividerMiss("2 please", ts)).toBe("say “2 up …” or “2 down …” — and how far, if not 20 pixels");
  });

  it("each answer is the boundary command on the band below — it moves that divider, and nothing changes lane", () => {
    const h = headlessDiagram(fixtureDiagram());
    const y0 = h.data.elements.find((e) => e.id === "L2")!.y;
    const r = applyAssistOps([dividerOp(parseDividerAnswer("1 up 20", ts)!)], h.context());
    expect(r).toEqual({ ok: true, summary: "moved Underwriters's top boundary up 20px" });
    expect(h.data.elements.find((e) => e.id === "L2")!.y).toBeCloseTo(y0 - 20, 6);
    // …and again: the numbers follow the moved divider.
    const again = parseDividerAnswer("1 up 20", collectDividers(h.data.elements))!;
    expect(applyAssistOps([dividerOp(again)], h.context()).ok).toBe(true);
    expect(h.data.elements.find((e) => e.id === "L2")!.y).toBeCloseTo(y0 - 40, 6);
  });

  it("the constraints hold, on Paul's own diagram — and the reply says the room in this flow's words", () => {
    const d = paul();
    const h = headlessDiagram(d);
    const answer = parseDividerAnswer("1 up 100 pixels", collectDividers(d.elements))!;
    const r = applyAssistOps([dividerOp(answer)], h.context());
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/it can move up at most \d+px: say “up by \d+”$/);
    expect(dividerReply(r.summary, 1)).toMatch(/it can move up at most (\d+)px: say “1 up \1”$/);
    expect(h.data).toEqual(d);
  });
});

describe("T4968 — wired into the editor, the card, the AI and the generator", () => {
  const ed = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");

  it("the editor shows its numbers, reads its answers first, and closes it on done / Escape / stop / a new command", () => {
    expect(ed).toContain("const dividerTargets = useMemo(() => (dividerFlow ? collectDividers(data.elements) : null), [dividerFlow, data.elements]);");
    expect(ed).toContain("badgesOnScreen(renameFlow, messageFlow, pickFlow, dividerTargets)");
    expect(ed).toContain("if (!answer && !isFlowEndWord(heard) && parseCommand(heard)) setDividerFlow(null);");
    expect(ed).toContain("else { handleDividerUtteranceRef.current(heard); return; }");
    expect(ed).toContain('if (isFlowEndWord(t)) { setDividerFlow(null); log("dividers closed", true); return; }');
    expect(ed).toContain('if (dividerFlow) { setDividerFlow(null); appendLog({ heard: "", summary: "dividers closed", ok: true }); }');
    expect(ed).toMatch(/setMessageFlow\(null\);\n\s+setDividerFlow\(null\);/);   // "stop"
    expect(ed).toContain("renameFlowRef.current || messageFlowRef.current || dividerFlowRef.current\n");
    expect(ed).toContain("setMessageFlow, setDividerFlow, setGoldFlash }");
  });

  it("the Commands card, the AI prompt and the generator know it", () => {
    expect(COMMAND_CATALOG.flatMap((f) => f.items.flatMap((i) => i.say))).toContain("move dividers");
    expect(readFileSync("app/api/ai/command/route.ts", "utf8")).toContain('{ "op":"numberDividers" }');
    expect(NOT_GENERATED.numberDividers).toMatch(/second utterance/);
  });
});

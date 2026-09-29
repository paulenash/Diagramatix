/**
 * Android feedback on Voice Assist on the phone (Paul, 2026-09-29):
 *   1. "Anything requiring numbers is broken as the green numbers never appear."
 *   2. "Add Auto-connect to mobile."
 *   3. "Add message from <pool-name> to <event-name> does not appear to work."
 *   4. "When it tries to resolve an issue by asking a question, it never
 *       understands 'yes' even though it shows that it heard it."
 * (mobile voice stage 6 — the numbers — and the auto-connect toggle.)
 *
 * Pure rules here; the screen under real React is tests/voice-session/phone-editor.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { badgePosition } from "@/app/lib/mobile/badgePlace";
import { askedYesNo, chipAction, lastEditedBox } from "@/app/lib/mobile/voiceEdit";
import { applyAssistOps, type AssistApplyContext } from "@/app/lib/assist/applyAssistOps";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const el = (o: Record<string, unknown>) => ({ properties: {}, ...o }) as unknown as DiagramElement;

describe("T5087 — the green numbers on the phone: where they sit, and the chips that answer them", () => {
  const data = {
    elements: [
      el({ id: "p", type: "pool", x: 0, y: 0, width: 900, height: 200, label: "Company" }),
      el({ id: "t", type: "task", x: 200, y: 60, width: 100, height: 60, label: "Check" }),
      el({ id: "e", type: "start-event", x: 60, y: 80, width: 36, height: 36, label: "Start" }),
    ],
  } as unknown as DiagramData;

  it("activities below, events above, pools in the header before the name; sizes in screen pixels (divided by zoom)", () => {
    const base = { id: "t", n: 1, x: 250, y: 90, height: 60, kind: "element" as const };
    expect(badgePosition({ ...base, place: "below" }, data, 1)).toEqual({ x: 250, y: 90 + 30 + 16 });
    expect(badgePosition({ ...base, place: "below" }, data, 2)).toEqual({ x: 250, y: 90 + 30 + 8 });
    expect(badgePosition({ ...base, id: "e", place: "above", x: 78, y: 98, height: 36 }, data, 1)).toEqual({ x: 78, y: 98 - 18 - 16 });
    const pool = badgePosition({ id: "p", n: 2, x: 450, y: 100, height: 200, kind: "element", place: "header" }, data, 1);
    expect(pool.x, "in the header strip, left of the diagram's body").toBeLessThan(40);
    expect(badgePosition({ id: "c", n: 3, x: 300, y: 150, height: 0, kind: "connector" }, data, 1)).toEqual({ x: 300, y: 150 });
    expect(badgePosition({ id: "d", n: 4, x: 120, y: 400, height: 0, kind: "divider" }, data, 1)).toEqual({ x: 120, y: 400 });
  });

  it("a tapped chip says its number — except in a message between two things, where two taps build “n to m”", () => {
    expect(chipAction("rename", 3, "")).toEqual({ run: "3" });
    expect(chipAction("pick", 2, "")).toEqual({ run: "2" });
    expect(chipAction("divider", 1, "")).toEqual({ run: "1" });
    expect(chipAction("message-pair", 3, "")).toEqual({ text: "3 to " });
    expect(chipAction("message-pair", 5, "3 to ")).toEqual({ text: "3 to 5" });
    expect(chipAction("message-pair", 2, "3 to 5")).toEqual({ text: "2 to " });
    expect(chipAction("message-one", 4, "")).toEqual({ run: "4" });
  });

  it("a yes/no question is recognised, so the sheet offers Yes and No", () => {
    expect(askedYesNo([{ summary: "clear the whole diagram (4 elements)? — say “yes” to confirm" }])).toBe(true);
    expect(askedYesNo([{ summary: "which “task”? say a number (1–3), or “cancel”" }])).toBe(false);
    expect(askedYesNo([])).toBe(false);
  });

  it("a NEW CONNECTOR (a message, a flow) is followed by the view — the box around what it joins", () => {
    const prev = { elements: [el({ id: "a", x: 0, y: 0, width: 100, height: 50 }), el({ id: "b", x: 400, y: 300, width: 100, height: 50 })], connectors: [] } as unknown as DiagramData;
    const next = { ...prev, connectors: [{ id: "c1", type: "messageBPMN", sourceId: "a", targetId: "b" }] } as unknown as DiagramData;
    expect(lastEditedBox(prev, next)).toEqual({ x: 0, y: 0, width: 500, height: 350 });
  });

  it("the phone draws the numbers, the ruler ticks and the gold flash, and the sheet lists the chips", () => {
    const ed = read("app/components/mobile/MobileVoiceEditor.tsx");
    expect(ed).toContain("session.onScreenBadges");
    expect(ed).toContain("session.onScreenRulers");
    expect(ed).toContain("<GoldFlashOverlay");
    expect(ed).toContain('aria-label="Numbers you can say or tap"');
    expect(ed).toContain("askedYesNo(lines)");
    expect(read("app/components/mobile/MobileDiagramView.tsx")).toContain("typeof overlay === \"function\" ? overlay(t.s) : overlay");
  });
});

describe("T5088 — Auto-connect on the phone: an add with no “after X” joins the element it follows", () => {
  const start = () => headlessDiagram({ elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as never);

  it("the setting lives in the shared apply layer; off unless asked for, on in the phone's sheet (remembered on the phone)", () => {
    expect(read("app/lib/assist/applyAssistOps.ts")).toContain("const implicitJoin = !op.afterRef && !!ctx.autoConnect && op.at !== \"pointer\";");
    const ed = read("app/components/mobile/MobileVoiceEditor.tsx");
    expect(ed).toContain("autoConnect,");
    expect(ed).toContain('localStorage.getItem("diagramatix.autoConnect")');
    expect(read("app/hooks/useVoiceSession.ts")).toContain("const autoConnect = host.autoConnect === true;");
  });

  const pool = () => ({ elements: [
    el({ id: "p", type: "pool", x: 0, y: 0, width: 1200, height: 240, label: "Company", properties: { poolType: "white-box" } }),
    el({ id: "l", type: "lane", x: 30, y: 0, width: 1170, height: 240, label: "Clerk", parentId: "p" }),
  ], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } }) as unknown as DiagramData;
  // the phone's session keeps "the last element added" between commands; a fresh context per call would forget it
  const lasts = new WeakMap<object, { current: string | null }>();
  const say = (h: ReturnType<typeof headlessDiagram>, text: string, autoConnect: boolean) => {
    const base = h.context();
    if (!lasts.has(h)) lasts.set(h, { current: null });
    const ctx = { ...base, refs: { ...base.refs, voiceLastId: lasts.get(h)! } };
    const ops = parseCommand(text);
    if (!ops) throw new Error("not a command: " + text);
    return applyAssistOps(ops, { ...ctx, autoConnect });
  };
  const flows = (h: ReturnType<typeof headlessDiagram>) => h.data.connectors.filter((c) => c.type === "sequence");

  it("with it on, the second add is joined to the first and says so; with it off (the desktop's voice) it is not", () => {
    const on = headlessDiagram(pool());
    say(on, "add a task called Receive order", true);
    const r = say(on, "add a task called Check invoice", true);
    expect(r.summary).toBe("added Check invoice after Receive order");
    expect(flows(on)).toHaveLength(1);
    const off = headlessDiagram(pool());
    say(off, "add a task called Receive order", false);
    const r2 = say(off, "add a task called Check invoice", false);
    expect(r2.summary).toBe("added Check invoice");
    expect(flows(off)).toHaveLength(0);
  });

  it("an explicit 'after X' is joined either way; an illegal automatic join (after an end event) is silently left out — no complaint", () => {
    const h = headlessDiagram(pool());
    say(h, "add a task called A", false);
    say(h, "add a task called B after A", false);
    expect(flows(h)).toHaveLength(1);
    const e = headlessDiagram(pool());
    say(e, "add an end event called Done", true);
    const r = say(e, "add a task called Late", true);
    expect(r.summary, "no 'left it unconnected' complaint for an automatic join").toBe("added Late");
    expect(flows(e)).toHaveLength(0);
  });
});

/**
 * T5219 — “make the selected event non-interrupting” (Paul, 2026-10-02: the command did not exist), and the Start event
 * inside an added Event expanded subprocess is NON-interrupting (his second thought; it was Interrupting first).
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = "", parentId?: string, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}), ...extra }) as DiagramElement;

const world = (): DiagramData => ({
  ...EMPTY_DIAGRAM,
  elements: [
    el("P", "pool", 0, 0, 900, 300, "Claims"), el("L", "lane", 36, 0, 864, 300, "Intake", "P"),
    el("start", "start-event", 80, 100, 36, 36, "Claim received", "L"),
    el("task", "task", 200, 90, 102, 65, "Review", "L"),
    el("host", "task", 400, 90, 102, 65, "Pay", "L"),
    el("bnd", "intermediate-event", 460, 140, 36, 36, "Late", "L", { boundaryHostId: "host", eventType: "timer" }),
    el("end", "end-event", 600, 100, 36, 36, "Done", "L"),
  ],
  connectors: [],
});
const run = (sentence: string, opts: { selected?: string[]; pointer?: { x: number; y: number } | null } = {}) => {
  const h = headlessDiagram(world());
  const ops = parseCommand(sentence);
  expect(ops, `the grammar must parse “${sentence}”`).toBeTruthy();
  const r = applyAssistOps(ops!, h.context({ selectedIds: opts.selected ?? [], pointer: opts.pointer ?? null }));
  const kind = (id: string) => (h.data.elements.find((e) => e.id === id)!.properties as { interruptionType?: string }).interruptionType ?? "interrupting";
  return { r, kind };
};

describe("T5219 the grammar", () => {
  it.each([
    ["make the selected event non-interrupting", "selected event", false],
    ["make selected event non interrupting", "selected event", false],
    ["make this non-interrupting", "this", false],
    ["make it non interrupting", "it", false],
    ["make this interrupting", "this", true],
    ["make the selected event interrupting", "selected event", true],
    ["make this a non-interrupting event", "this", false],
    ["set the interruption to non-interrupting", "this", false],
    ["set the interruption of Late to interrupting", "Late", true],
    ["make the boundary event non-interrupting", "this", false],
    ["make the start event interrupting", "this", true],
    ["change this to non interrupting", "this", false],
  ])("%s", (s, ref, interrupting) => {
    expect(parseCommand(s)).toEqual([{ op: "setInterruption", ref, interrupting }]);
  });
  it("other “make …” sentences are untouched", () => {
    expect(parseCommand("make this a user task")).toEqual([{ op: "convert", ref: "this", subtype: "user task" }]);
    expect(parseCommand("turn the selected gateway into a parallel gateway")).toBeTruthy();
    expect(parseCommand("make the selected event a timer event")).toBeTruthy();
  });
});

describe("T5219 the command", () => {
  it("a selected START event becomes non-interrupting, and back", () => {
    const a = run("make the selected event non-interrupting", { selected: ["start"] });
    expect(a.r.ok, a.r.summary).toBe(true);
    expect(a.kind("start")).toBe("non-interrupting");
    expect(a.r.summary).toContain("non-interrupting");
  });
  it("a selected boundary (intermediate) event too", () => {
    const a = run("make this non-interrupting", { selected: ["bnd"] });
    expect(a.r.ok, a.r.summary).toBe(true);
    expect(a.kind("bnd")).toBe("non-interrupting");
  });
  it("interrupting sets it back", () => {
    const h = headlessDiagram(world());
    applyAssistOps(parseCommand("make this non-interrupting")!, h.context({ selectedIds: ["start"] }));
    const r = applyAssistOps(parseCommand("make this interrupting")!, h.context({ selectedIds: ["start"] }));
    expect(r.ok, r.summary).toBe(true);
    expect((h.data.elements.find((e) => e.id === "start")!.properties as { interruptionType?: string }).interruptionType).toBe("interrupting");
  });
  it("works on the event under the cursor when nothing is selected", () => {
    const a = run("make this non-interrupting", { pointer: { x: 98, y: 118 } });
    expect(a.r.ok, a.r.summary).toBe(true);
    expect(a.kind("start")).toBe("non-interrupting");
  });
  it("named", () => {
    const a = run("set the interruption of Late to non-interrupting");
    expect(a.r.ok, a.r.summary).toBe(true);
    expect(a.kind("bnd")).toBe("non-interrupting");
  });
  it("already so: says so, no error", () => {
    const a = run("make this interrupting", { selected: ["start"] });
    expect(a.r.ok).toBe(true);
    expect(a.r.summary).toContain("already interrupting");
  });
  it("not an event: says why and changes nothing", () => {
    const a = run("make this non-interrupting", { selected: ["task"] });
    expect(a.r.ok).toBe(false);
    expect(a.r.summary).toContain("only a start or intermediate event");
  });
  it("an END event can't be either — refused", () => {
    expect(run("make this non-interrupting", { selected: ["end"] }).r.ok).toBe(false);
  });
});

describe("T5219 the Start inside an added Event EP is non-interrupting", () => {
  it("and still triggers on a Message", () => {
    const h = headlessDiagram({
      ...EMPTY_DIAGRAM,
      elements: [el("P", "pool", 0, 0, 900, 400, "Claims"), el("L", "lane", 36, 0, 864, 400, "Intake", "P"), el("ep", "subprocess-expanded", 100, 40, 300, 150, "Settle Claim", "L")],
      connectors: [],
    });
    const r = applyAssistOps(parseCommand("add an event expanded subprocess")!, h.context({ selectedIds: ["ep"] }));
    expect(r.ok, r.summary).toBe(true);
    const ev = h.data.elements.find((e) => e.type === "subprocess-expanded" && e.id !== "ep")!;
    const start = h.data.elements.find((e) => e.parentId === ev.id && e.type === "start-event")! as DiagramElement & { eventType?: string };
    expect(start.eventType).toBe("message");
    expect((start.properties as { interruptionType?: string }).interruptionType).toBe("non-interrupting");
  });
});

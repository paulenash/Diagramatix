/**
 * T5220 — the Start event of an EVENT expanded subprocess is NAMED (Paul, 2026-10-03: "I was wrong about Start Events never
 * being named. If the start event is inside an event expanded subprocess, it must be able to be named and should be named,
 * 'Event occurs' by default … if an existing expanded subprocess is made into an event expanded subprocess, its start event
 * can be named." — "This only applies to Start Events."). End events, and the Start of an ordinary EP, stay unnamed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { EVENT_EP_START_LABEL, isEventEp } from "@/app/lib/diagram/eventSubprocess";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = "", parentId?: string, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}), ...extra }) as DiagramElement;

const world = (usage?: string): DiagramData => ({
  ...EMPTY_DIAGRAM,
  elements: [
    el("P", "pool", 0, 0, 900, 400, "Claims"), el("L", "lane", 36, 0, 864, 400, "Intake", "P"),
    el("ep", "subprocess-expanded", 100, 40, 400, 200, "Settle Claim", "L", usage ? { properties: { subprocessType: usage } } : {}),
    el("s", "start-event", 124, 120, 36, 36, "", "ep"), el("k", "task", 190, 106, 102, 64, "Do", "ep"), el("x", "end-event", 322, 120, 36, 36, "", "ep"),
  ],
  connectors: [],
});
const add = (d: DiagramData, symbolType: string, parentId: string, label?: string) => {
  const next = reducer(d, { type: "ADD_ELEMENT", payload: { symbolType, position: { x: 300, y: 200 }, id: "new", initial: { parentId, ...(label !== undefined ? { label } : {}) } } } as never);
  return next.elements.find((e) => e.id === "new")!;
};
const props = (d: DiagramData, id: string, properties: Record<string, unknown>) => reducer(d, { type: "UPDATE_PROPERTIES", payload: { id, properties } } as never);
const get = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

describe("T5220 a Start dropped inside an EP", () => {
  it("inside an EVENT subprocess: named “Event occurs”", () => {
    expect(add(world("event"), "start-event", "ep").label).toBe(EVENT_EP_START_LABEL);
    expect(EVENT_EP_START_LABEL).toBe("Event occurs");
  });
  it("inside an ordinary EP: unnamed, as before (Normal, Call, Transaction too)", () => {
    for (const u of [undefined, "normal", "call", "transaction"]) expect(add(world(u), "start-event", "ep").label, String(u)).toBe("");
  });
  it("an END inside an Event subprocess stays unnamed — the exception is for Start events only", () => {
    expect(add(world("event"), "end-event", "ep").label).toBe("");
  });
  it("a name the caller gives is respected", () => {
    expect(add(world("event"), "start-event", "ep", "Customer cancels").label).toBe("Customer cancels");
  });
});

describe("T5220 an existing EP made into an Event EP", () => {
  it("its unnamed Start is named “Event occurs”", () => {
    const next = props(world(), "ep", { subprocessType: "event" });
    expect(get(next, "s").label).toBe("Event occurs");
    expect(isEventEp(get(next, "ep"))).toBe(true);
  });
  it("its End is not", () => {
    expect(get(props(world(), "ep", { subprocessType: "event" }), "x").label).toBe("");
  });
  it("a Start that already has a name keeps it", () => {
    const d = world();
    get(d, "s").label = "Order cancelled";
    expect(get(props(d, "ep", { subprocessType: "event" }), "s").label).toBe("Order cancelled");
  });
  it("only when it BECOMES an Event EP: setting it again, or to another Usage, names nothing", () => {
    const once = props(world(), "ep", { subprocessType: "event" });
    get(once, "s").label = "";                                   // the person cleared it
    expect(get(props(once, "ep", { subprocessType: "event" }), "s").label, "already an Event EP").toBe("");
    expect(get(props(world(), "ep", { subprocessType: "call" }), "s").label).toBe("");
  });
  it("another EP's Start, and a Start outside any EP, are left alone", () => {
    const d = world();
    d.elements.push(el("ep2", "subprocess-expanded", 520, 40, 300, 200, "Other", "L"), el("s2", "start-event", 540, 120, 36, 36, "", "ep2"), el("s3", "start-event", 60, 300, 36, 36, "", "L"));
    const next = props(d, "ep", { subprocessType: "event" });
    expect(get(next, "s2").label).toBe("");
    expect(get(next, "s3").label).toBe("");
  });
  it("and the name can be changed — it is an ordinary label", () => {
    const next = reducer(props(world(), "ep", { subprocessType: "event" }), { type: "UPDATE_LABEL", payload: { id: "s", label: "Claim withdrawn" } } as never);
    expect(get(next, "s").label).toBe("Claim withdrawn");
  });
});

describe("T5220 by voice", () => {
  const run = (h: ReturnType<typeof headlessDiagram>, s: string, selected: string[] = []) => {
    const ops = parseCommand(s);
    expect(ops, s).toBeTruthy();
    return applyAssistOps(ops!, h.context({ selectedIds: selected }));
  };
  it("“set the usage to event” on an existing EP names its Start; “rename” then works", () => {
    const h = headlessDiagram(world());
    expect(run(h, "set the usage to event", ["ep"]).ok).toBe(true);
    expect(get(h.data, "s").label).toBe("Event occurs");
    const r = run(h, "rename Event occurs to Claim withdrawn");
    expect(r.ok, r.summary).toBe(true);
    expect(get(h.data, "s").label).toBe("Claim withdrawn");
  });
  it("“make this an event subprocess” does the same", () => {
    const h = headlessDiagram(world());
    expect(run(h, "make this an event subprocess", ["ep"]).ok).toBe(true);
    expect(get(h.data, "s").label).toBe("Event occurs");
  });
  it("an Event EP ADDED by voice gets its named Start; its End is unnamed", () => {
    const h = headlessDiagram(world());
    const r = run(h, "add an event expanded subprocess called Cancel", ["ep"]);
    expect(r.ok, r.summary).toBe(true);
    const ev = h.data.elements.find((e) => e.label === "Cancel")!;
    const kids = h.data.elements.filter((e) => e.parentId === ev.id);
    expect(kids.find((k) => k.type === "start-event")!.label).toBe("Event occurs");
    expect(kids.find((k) => k.type === "end-event")!.label).toBe("");
  });
});

describe("T5220 the AI layout", () => {
  it("fabricates a NAMED Start for an event subprocess that lacks one", () => {
    const src = readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8");
    expect(src).toContain("label: EVENT_EP_START_LABEL,");
    expect(src).toContain('import { EVENT_EP_START_LABEL } from "./eventSubprocess";');
  });
});

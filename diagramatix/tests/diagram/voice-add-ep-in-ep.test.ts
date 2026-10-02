/**
 * T5218 — EPs inside EPs, an EP's Usage, and the Event-EP construction (Paul, 2026-10-02):
 *   2  an EP can be added inside another EP
 *   3  the EP Usage (Normal / Call / Event / Transaction) can be set — in the sentence and afterwards
 *   4  select / hover / NAME an existing EP and “add an expanded subprocess called X”: the first element goes between a new
 *      Start and End, the second after the existing one; the default name is Subprocess <n>
 *   5  an EVENT EP added to an EP that already has a flow: the parent grows, the existing flow goes to its top, the new
 *      Event EP (Start Message / interrupting, Task, End) sits in the middle under it, a further one underneath; everything
 *      below moves down and everything to the right moves right, pool and lane edges and the pools below included
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { sizeOf } from "@/app/lib/diagram/assistPlacement";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

type Els = DiagramElement & { subprocessType?: string };
const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = "", parentId?: string, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}), ...extra }) as DiagramElement;
const flow = (id: string, s: string, t: string): Connector =>
  ({ id, sourceId: s, targetId: t, sourceSide: "right", targetSide: "left", type: "sequence", directionType: "directed", routingType: "rectilinear",
    sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [], sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5 }) as Connector;

const TASK = sizeOf("task");
const EV = sizeOf("start-event").w;

/** A white-box pool with two lanes and a black-box pool below it. Lane 1 holds the EP "Settle Claim" (Start → Task → End inside), a task to its right; lane 2 holds a task below. */
function world(): DiagramData {
  const row = 118;                                   // the flow's centre line, inside the EP (y 40 … 190)
  return {
    ...EMPTY_DIAGRAM,
    elements: [
      el("P", "pool", 0, 0, 900, 460, "Claims"),
      el("L1", "lane", 36, 0, 864, 230, "Intake", "P"),
      el("L2", "lane", 36, 230, 864, 230, "Payments", "P"),
      el("ep", "subprocess-expanded", 100, 40, 300, 150, "Settle Claim", "L1"),
      el("s", "start-event", 124, row - EV / 2, EV, EV, "", "ep"),
      el("k", "task", 190, row - TASK.h / 2, TASK.w, TASK.h, "Check", "ep"),
      el("x", "end-event", 322, row - EV / 2, EV, EV, "", "ep"),
      el("right", "task", 600, 80, TASK.w, TASK.h, "After", "L1"),
      el("below", "task", 150, 300, TASK.w, TASK.h, "Below", "L2"),
      el("cust", "pool", 0, 500, 900, 100, "Customer", undefined, { properties: { poolType: "black-box" } }),
    ],
    connectors: [flow("f1", "s", "k"), flow("f2", "k", "x")],
  };
}
const run = (sentence: string, h: ReturnType<typeof headlessDiagram>, opts: { selected?: string[]; pointer?: { x: number; y: number } | null } = {}) => {
  const ops = parseCommand(sentence);
  expect(ops, `the grammar must parse “${sentence}”`).toBeTruthy();
  return applyAssistOps(ops!, h.context({ selectedIds: opts.selected ?? [], pointer: opts.pointer ?? null }));
};
const get = (h: ReturnType<typeof headlessDiagram>, id: string) => h.data.elements.find((e) => e.id === id)!;
const kidsOf = (h: ReturnType<typeof headlessDiagram>, id: string) => h.data.elements.filter((e) => e.parentId === id);
const usageOf = (e: DiagramElement) => (e.properties as { subprocessType?: string }).subprocessType ?? "normal";
const eventEps = (h: ReturnType<typeof headlessDiagram>) => kidsOf(h, "ep").filter((e) => e.type === "subprocess-expanded").sort((a, b) => a.y - b.y);

describe("T5218 the grammar", () => {
  it("a usage word before “subprocess”: normal / call / event / transaction", () => {
    expect(parseCommand("add an event expanded subprocess called Cancel")).toEqual([{ op: "add", symbolType: "subprocess-expanded", label: "Cancel", usage: "event" }]);
    expect(parseCommand("add a call expanded subprocess")).toEqual([{ op: "add", symbolType: "subprocess-expanded", usage: "call" }]);
    expect(parseCommand("add a transaction subprocess called Pay")).toEqual([{ op: "add", symbolType: "subprocess", label: "Pay", usage: "transaction" }]);
  });
  it("naming the subprocess it goes in: inside / in / into / within", () => {
    expect(parseCommand("add an expanded subprocess called Check Stock inside Settle Claim")).toEqual([
      { op: "add", symbolType: "subprocess-expanded", label: "Check Stock", insideRef: "Settle Claim", insideWord: "inside" }]);
  });
  it("set the usage: of this, or of a named one", () => {
    expect(parseCommand("set the usage to event")).toEqual([{ op: "convert", ref: "this", subtype: "subprocess event" }]);
    expect(parseCommand("change the usage of this to call")).toEqual([{ op: "convert", ref: "this", subtype: "subprocess call" }]);
    expect(parseCommand("set usage of Settle Claim to transaction")).toEqual([{ op: "convert", ref: "Settle Claim", subtype: "subprocess transaction" }]);
  });
});

describe("T5218 3  the Usage", () => {
  it("“set the usage to …” sets all four values on the selected EP", () => {
    for (const u of ["normal", "call", "event", "transaction"]) {
      const h = headlessDiagram(world());
      const r = run(`set the usage to ${u}`, h, { selected: ["ep"] });
      expect(r.ok, `${u}: ${r.summary}`).toBe(true);
      expect(usageOf(get(h, "ep")), u).toBe(u);
    }
  });
  it("…or on the one under the cursor", () => {
    const h = headlessDiagram(world());
    const r = run("set the usage to call", h, { pointer: { x: 390, y: 180 } });   // the EP's empty corner
    expect(r.ok, r.summary).toBe(true);
    expect(usageOf(get(h, "ep"))).toBe("call");
  });
  it("“add a call expanded subprocess” makes a Call one (no EP selected: an ordinary add)", () => {
    const h = headlessDiagram(world());
    const r = run("add a call expanded subprocess called Billing", h, { pointer: { x: 800, y: 400 } });
    expect(r.ok, r.summary).toBe(true);
    const e = h.data.elements.find((x) => x.label === "Billing")!;
    expect(e.type).toBe("subprocess-expanded");
    expect(usageOf(e)).toBe("call");
  });
});

describe("T5218 2 / 4  an EP inside an EP", () => {
  const emptyEp = (): DiagramData => ({
    ...EMPTY_DIAGRAM,
    elements: [el("P", "pool", 0, 0, 900, 400, "Claims"), el("L1", "lane", 36, 0, 864, 400, "Intake", "P"), el("ep", "subprocess-expanded", 100, 40, 200, 110, "Settle Claim", "L1"),
      el("below", "task", 150, 300, TASK.w, TASK.h, "Below", "L1")],
    connectors: [],
  });
  it("the FIRST element: between a new Start and End, with the default name “Subprocess <n>”", () => {
    const h = headlessDiagram(emptyEp());
    const r = run("add an expanded subprocess", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    const kids = kidsOf(h, "ep");
    expect(kids.map((k) => k.type).sort()).toEqual(["end-event", "start-event", "subprocess-expanded"]);
    const inner = kids.find((k) => k.type === "subprocess-expanded")!;
    expect(inner.label).toMatch(/^Subprocess \d+$/);
    const f = h.data.connectors.filter((c) => c.type === "sequence");
    expect(f.some((c) => get(h, c.sourceId).type === "start-event" && c.targetId === inner.id)).toBe(true);
    expect(f.some((c) => c.sourceId === inner.id && get(h, c.targetId).type === "end-event")).toBe(true);
  });
  it("the parent GROWS to hold it (an EP is taller than a task) and everything below moves down", () => {
    const h = headlessDiagram(emptyEp());
    run("add an expanded subprocess called Inner", h, { selected: ["ep"] });
    const ep = get(h, "ep"), inner = get(h, h.data.elements.find((e) => e.label === "Inner")!.id);
    expect(inner.y).toBeGreaterThanOrEqual(ep.y);
    expect(inner.y + inner.height).toBeLessThanOrEqual(ep.y + ep.height);
    expect(inner.x + inner.width).toBeLessThanOrEqual(ep.x + ep.width);
    expect(get(h, "below").y, "what was below moved down by what the EP grew").toBe(300 + (ep.height - 110));
  });
  it("the SECOND element goes after the existing one, before the End (with the PARENT selected again)", () => {
    const h = headlessDiagram(emptyEp());
    run("add an expanded subprocess called Inner", h, { selected: ["ep"] });
    const inner = h.data.elements.find((e) => e.label === "Inner")!;
    const r = run("add a task called Next", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    expect(get(h, h.data.elements.find((e) => e.label === "Next")!.id).x).toBeGreaterThan(inner.x + inner.width - 1);
  });
  it("selecting the INNER EP means “into that one” — a task added then goes inside it, not after it", () => {
    const h = headlessDiagram(emptyEp());
    run("add an expanded subprocess called Inner", h, { selected: ["ep"] });
    const inner = h.data.elements.find((e) => e.label === "Inner")!;
    const r = run("add a task called Deep", h, { selected: [inner.id] });
    expect(r.ok, r.summary).toBe(true);
    expect(h.data.elements.find((e) => e.label === "Deep")!.parentId).toBe(inner.id);
  });
  it("NAMING the EP: no selection needed", () => {
    const h = headlessDiagram(emptyEp());
    const r = run("add a task called Pay inside Settle Claim", h, { pointer: { x: 800, y: 380 } });
    expect(r.ok, r.summary).toBe(true);
    expect(h.data.elements.find((e) => e.label === "Pay")!.parentId).toBe("ep");
  });
  it("…and a name that merely contains “in” stays a name (nothing by that name is an EP)", () => {
    const h = headlessDiagram(emptyEp());
    const r = run("add a task called Pay in advance", h, { pointer: { x: 800, y: 380 } });
    expect(r.ok, r.summary).toBe(true);
    const t = h.data.elements.find((e) => e.label === "Pay in advance")!;
    expect(t).toBeTruthy();
    expect(t.parentId).not.toBe("ep");
  });
  it("naming something that is not an EP and giving no name: it says so and adds nothing", () => {
    const h = headlessDiagram(emptyEp());
    const before = h.data.elements.length;
    const r = run("add a task inside Below", h, {});
    expect(r.ok).toBe(false);
    expect(h.data.elements.length).toBe(before);
  });
});

describe("T5218 5  an EVENT EP in an EP that already has a flow", () => {
  const FINAL_W = 330;                                // the new Event EP's 282 + a 24 px margin each side, wider than the parent's 300
  const childW = 24 + EV + 30 + TASK.w + 30 + EV + 24;
  const childH = 36 + Math.max(TASK.h, EV) + 24;

  it("the parent grows; the existing flow goes to its top; the new Event EP sits in the middle under it", () => {
    const h = headlessDiagram(world());
    const r = run("add an event expanded subprocess called Cancel Order", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    const ep = get(h, "ep");
    const ev = eventEps(h)[0];
    expect(ev, "the Event EP").toBeTruthy();
    expect(ev.label).toBe("Cancel Order");
    expect(usageOf(ev)).toBe("event");
    expect(ev.parentId).toBe("ep");
    // the existing flow is at the TOP (just under the label band); it only moved up
    expect(get(h, "k").y).toBeLessThan(world().elements.find((e) => e.id === "k")!.y);
    expect(get(h, "k").y).toBeLessThanOrEqual(ep.y + 36 + (TASK.h - TASK.h) + 1);
    // the Event EP is UNDER the flow, in the MIDDLE, and inside the parent
    expect(ev.y).toBeGreaterThan(get(h, "k").y + TASK.h);
    expect(ev.x + ev.width / 2).toBeCloseTo(ep.x + ep.width / 2, 0);
    expect(ev.x).toBeGreaterThanOrEqual(ep.x);
    expect(ev.x + ev.width).toBeLessThanOrEqual(ep.x + ep.width);
    expect(ev.y + ev.height).toBeLessThanOrEqual(ep.y + ep.height);
    expect(ev.width).toBeCloseTo(childW, 0);
    expect(ev.height).toBeCloseTo(childH, 0);
    // the parent grew in both directions
    expect(ep.width).toBe(FINAL_W);
    expect(ep.height).toBeGreaterThan(150);
  });

  it("inside it: a Start (trigger Message, Interruption → NON-interrupting), a Task and an End, joined", () => {
    const h = headlessDiagram(world());
    run("add an event expanded subprocess", h, { selected: ["ep"] });
    const ev = eventEps(h)[0];
    expect(ev.label).toMatch(/^Subprocess \d+$/);                 // the default name, as usual
    const kids = kidsOf(h, ev.id);
    expect(kids.map((k) => k.type).sort()).toEqual(["end-event", "start-event", "task"]);
    const start = kids.find((k) => k.type === "start-event")! as Els & { eventType?: string };
    expect(start.eventType).toBe("message");
    expect((start.properties as { interruptionType?: string }).interruptionType).toBe("non-interrupting");
    expect(start.label, "the Start of an EVENT subprocess is NAMED, “Event occurs” by default (Paul, 2026-10-03)").toBe("Event occurs");
    expect((kids.find((k) => k.type === "end-event")!.label ?? "").trim(), "…but its End stays unnamed").toBe("");
    const task = kids.find((k) => k.type === "task")!, end = kids.find((k) => k.type === "end-event")!;
    expect(start.x).toBeLessThan(task.x);
    expect(task.x).toBeLessThan(end.x);
    const f = h.data.connectors.filter((c) => c.type === "sequence");
    expect(f.some((c) => c.sourceId === start.id && c.targetId === task.id)).toBe(true);
    expect(f.some((c) => c.sourceId === task.id && c.targetId === end.id)).toBe(true);
    // all of it inside the Event EP
    for (const k of kids) {
      expect(k.x).toBeGreaterThanOrEqual(ev.x);
      expect(k.x + k.width).toBeLessThanOrEqual(ev.x + ev.width);
      expect(k.y).toBeGreaterThanOrEqual(ev.y);
      expect(k.y + k.height).toBeLessThanOrEqual(ev.y + ev.height);
    }
  });

  it("everything BELOW moves down by what the parent grew, everything to the RIGHT moves right — pool and lane edges and the pool below included", () => {
    const before = world();
    const h = headlessDiagram(before);
    run("add an event expanded subprocess", h, { selected: ["ep"] });
    const ep = get(h, "ep");
    const dy = ep.height - 150, dx = ep.width - 300;
    expect(dy).toBeGreaterThan(0);
    expect(dx).toBe(30);
    expect(get(h, "below").y).toBe(300 + dy);                                    // a task in the lane below
    expect(get(h, "right").x).toBe(600 + dx);                                    // a task to the right, same lane
    expect(get(h, "L1").height).toBe(230 + dy);                                  // the EP's lane grew
    expect(get(h, "L2").y).toBe(230 + dy);                                       // the lane below moved
    expect(get(h, "P").height).toBe(460 + dy);                                   // the white-box pool grew
    expect(get(h, "cust").y).toBe(500 + dy);                                     // the pool BELOW it moved down
    expect(get(h, "P").width).toBe(900 + dx);                                    // pool edge pushed right…
    expect(get(h, "cust").width).toBe(900 + dx);                                 // …and the other pool with it (they stay one width)
    expect(get(h, "L1").width).toBe(864 + dx);                                   // lane edges too
  });

  it("a FURTHER Event EP goes underneath the existing one — same construction, same width", () => {
    const h = headlessDiagram(world());
    run("add an event expanded subprocess called First", h, { selected: ["ep"] });
    const r = run("add an event expanded subprocess called Second", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    const [a, b] = eventEps(h);
    expect(a.label).toBe("First");
    expect(b.label).toBe("Second");
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);                          // underneath
    expect(b.x).toBeCloseTo(a.x, 0);                                             // same column
    expect(b.width).toBeCloseTo(a.width, 0);
    const ep = get(h, "ep");
    expect(b.y + b.height).toBeLessThanOrEqual(ep.y + ep.height);                // the parent grew again to hold it
    expect(kidsOf(h, b.id).map((k) => k.type).sort()).toEqual(["end-event", "start-event", "task"]);
  });

  it("an ordinary add AFTER an Event EP exists still goes into the main flow, not after the Event EP", () => {
    const h = headlessDiagram(world());
    run("add an event expanded subprocess", h, { selected: ["ep"] });
    const r = run("add a task called Late", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    const late = h.data.elements.find((e) => e.label === "Late")!;
    expect(late.parentId).toBe("ep");
    expect(late.y).toBeLessThan(eventEps(h)[0].y);                               // on the flow row, above the Event EP
  });

  it("works with the EP under the cursor, and names it in the sentence too", () => {
    const hover = headlessDiagram(world());
    expect(run("add an event expanded subprocess", hover, { pointer: { x: 390, y: 180 } }).ok).toBe(true);
    expect(eventEps(hover)).toHaveLength(1);
    const named = headlessDiagram(world());
    expect(run("add an event expanded subprocess called Cancel inside Settle Claim", named, { pointer: { x: 800, y: 400 } }).ok).toBe(true);
    expect(eventEps(named)).toHaveLength(1);
  });

  it("the log says what was built and what moved", () => {
    const h = headlessDiagram(world());
    const r = run("add an event expanded subprocess called Cancel Order", h, { selected: ["ep"] });
    expect(r.summary).toContain("Event subprocess");
    expect(r.summary).toContain("Start (Message, non-interrupting)");
    expect(r.summary).toContain("moved the existing flow up");
    expect(r.summary).toContain("taller");
    expect(r.summary).toContain("widened");
  });
});

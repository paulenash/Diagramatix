/**
 * T5208 — "add a task called X" with an expanded subprocess selected or under the cursor goes INSIDE it
 * (Paul, 2026-10-02). First one between a new Start and End; later ones after the last step or the
 * selected / hovered step; the EP widens and the rest of ITS LANE moves right; the pool extends if it must.
 * Insert is left out at this stage; nothing changes when no EP is in play.
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label: string, parentId?: string): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}) }) as DiagramElement;

/** One pool, two lanes. Lane A holds an EP (150 wide — too narrow for a task) and a task to its right; lane B holds a task far right. */
function world(): DiagramData {
  return {
    ...EMPTY_DIAGRAM,
    elements: [
      el("pool", "pool", 0, 0, 760, 420, "Claims"),
      el("laneA", "lane", 30, 0, 730, 210, "Intake", "pool"),
      el("laneB", "lane", 30, 210, 730, 210, "Payments", "pool"),
      el("ep", "subprocess-expanded", 100, 20, 150, 170, "Review Claim", "laneA"),
      el("afterEp", "task", 400, 70, 102, 64, "Pay Claim", "laneA"),
      el("otherLane", "task", 400, 270, 102, 64, "Send Letter", "laneB"),
    ],
    connectors: [],
  };
}

function run(sentence: string, h: ReturnType<typeof headlessDiagram>, opts: { selected?: string[]; pointer?: { x: number; y: number } } = {}) {
  const ops = parseCommand(sentence);
  expect(ops, `the grammar must parse “${sentence}”`).toBeTruthy();
  const r = applyAssistOps(ops!, h.context({ selectedIds: opts.selected ?? [], pointer: opts.pointer ?? null }));
  return r;
}
const byLabel = (h: ReturnType<typeof headlessDiagram>, label: string) => h.data.elements.find((e) => e.label === label)!;
const inside = (h: ReturnType<typeof headlessDiagram>, id = "ep") => h.data.elements.filter((e) => e.parentId === id);
const flows = (h: ReturnType<typeof headlessDiagram>) => h.data.connectors.filter((c) => c.type === "sequence");

describe("T5208 the first element: Start → X → End, inside the EP", () => {
  it("with the EP selected", () => {
    const h = headlessDiagram(world());
    const r = run("add a task called Check Stock", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    const kids = inside(h);
    expect(kids.map((k) => k.type).sort()).toEqual(["end-event", "start-event", "task"]);
    const task = byLabel(h, "Check Stock");
    expect(task.parentId).toBe("ep");
    const start = kids.find((k) => k.type === "start-event")!, end = kids.find((k) => k.type === "end-event")!;
    expect(start.x).toBeLessThan(task.x);
    expect(task.x + task.width).toBeLessThan(end.x);
    const f = flows(h);
    expect(f.some((c) => c.sourceId === start.id && c.targetId === task.id)).toBe(true);
    expect(f.some((c) => c.sourceId === task.id && c.targetId === end.id)).toBe(true);
  });

  it("the EP widens to hold it, and its own lane's contents move right by that amount — the other lane is not touched", () => {
    const h = headlessDiagram(world());
    run("add a task called Check Stock", h, { selected: ["ep"] });
    const ep = h.data.elements.find((e) => e.id === "ep")!;
    const end = inside(h).find((k) => k.type === "end-event")!;
    expect(ep.width).toBeGreaterThan(150);
    expect(end.x + end.width).toBeLessThanOrEqual(ep.x + ep.width);
    const grew = ep.width - 150;
    expect(byLabel(h, "Pay Claim").x).toBe(400 + grew);            // same lane, right of the EP: moved
    expect(byLabel(h, "Send Letter").x).toBe(400);                  // another lane: not moved
  });

  it("with the EP under the cursor and nothing selected", () => {
    const h = headlessDiagram(world());
    const r = run("add a task called Check Stock", h, { pointer: { x: 175, y: 120 } });
    expect(r.ok, r.summary).toBe(true);
    expect(byLabel(h, "Check Stock").parentId).toBe("ep");
  });
});

describe("T5208 later additions", () => {
  it("the next add goes after the last element before the End, and the End moves along", () => {
    const h = headlessDiagram(world());
    run("add a task called Check Stock", h, { selected: ["ep"] });
    // The new task is now selected, as after any add.
    const first = byLabel(h, "Check Stock");
    const r = run("add a task called Pack Order", h, { selected: [first.id] });
    expect(r.ok, r.summary).toBe(true);
    const second = byLabel(h, "Pack Order");
    const end = inside(h).find((k) => k.type === "end-event")!;
    expect(second.parentId).toBe("ep");
    expect(second.x).toBeGreaterThan(first.x + first.width);
    expect(second.x + second.width).toBeLessThan(end.x);
    const f = flows(h);
    expect(f.some((c) => c.sourceId === first.id && c.targetId === second.id)).toBe(true);
    expect(f.some((c) => c.sourceId === second.id && c.targetId === end.id)).toBe(true);
    expect(f.some((c) => c.sourceId === first.id && c.targetId === end.id), "the flow it went into is replaced").toBe(false);
  });

  it("with the EP selected again, it still goes before the End", () => {
    const h = headlessDiagram(world());
    run("add a task called Check Stock", h, { selected: ["ep"] });
    const r = run("add a gateway called Enough", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    const gw = h.data.elements.find((e) => e.type === "gateway")!;
    expect(gw.parentId).toBe("ep");
    expect(gw.x).toBeGreaterThan(byLabel(h, "Check Stock").x);
  });

  it("a selected End event means “before it”", () => {
    const h = headlessDiagram(world());
    run("add a task called Check Stock", h, { selected: ["ep"] });
    const end = inside(h).find((k) => k.type === "end-event")!;
    const r = run("add a task called Pack Order", h, { selected: [end.id] });
    expect(r.ok, r.summary).toBe(true);
    expect(byLabel(h, "Pack Order").x).toBeLessThan(inside(h).find((k) => k.type === "end-event")!.x);
  });

  it("a collapsed subprocess can be added too", () => {
    const h = headlessDiagram(world());
    const r = run("add a subprocess called Inspect", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    expect(inside(h).some((k) => k.type === "subprocess")).toBe(true);
  });
});

describe("T5208 the pool is extended when the room is not there", () => {
  it("an EP at the pool's right edge pushes the pool out", () => {
    const d = world();
    d.elements = d.elements.filter((e) => e.id !== "afterEp" && e.id !== "otherLane");
    d.elements.find((e) => e.id === "ep")!.x = 520;                // 520 + 150 = 670; the pool ends at 760
    const h = headlessDiagram(d);
    const before = h.data.elements.find((e) => e.id === "pool")!.width;
    const r = run("add a task called Check Stock", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    const ep = h.data.elements.find((e) => e.id === "ep")!;
    const pool = h.data.elements.find((e) => e.id === "pool")!;
    expect(pool.x + pool.width).toBeGreaterThanOrEqual(ep.x + ep.width);
    expect(pool.width).toBeGreaterThan(before);
  });
});

describe("T5208 nothing else changes", () => {
  it("with no EP selected or under the cursor, an add is an ordinary add (not inside the EP)", () => {
    const h = headlessDiagram(world());
    const r = run("add a task called Elsewhere", h, { pointer: { x: 600, y: 300 } });
    expect(r.ok, r.summary).toBe(true);
    expect(byLabel(h, "Elsewhere").parentId).not.toBe("ep");
    expect(inside(h)).toHaveLength(0);
  });

  it("“add … after X” is untouched even with the EP selected", () => {
    const h = headlessDiagram(world());
    run("add a task called Later after Pay Claim", h, { selected: ["ep"] });
    expect(inside(h)).toHaveLength(0);
  });

  it("a Start or End event can't be added inside — it says so and changes nothing", () => {
    const h = headlessDiagram(world());
    const before = h.data.elements.length;
    const r = run("add an end event", h, { selected: ["ep"] });
    expect(r.ok).toBe(false);
    expect(h.data.elements.length).toBe(before);
  });
});

describe("T5208 a real element id that looks like a role (Paul's debug capture, 2026-10-02)", () => {
  // His test diagram has elements whose ids are literally "start" and "end" (Claim Received, Claim Closed). The first
  // version named the Start/End it was about to add "start" / "end" too, so the legality check looked up HIS
  // elements and refused: “a sequence flow from Claim Received to New task isn't legal”.
  it("an empty EP still takes its first task when the diagram has elements with ids 'start' and 'end'", () => {
    const d = world();
    d.elements.push(el("start", "start-event", 60, 60, 36, 36, "Claim Received", "laneA"), el("end", "end-event", 640, 60, 36, 36, "Claim Closed", "laneA"));
    const h = headlessDiagram(d);
    const r = run("add a task called New Task", h, { selected: ["ep"] });
    expect(r.ok, r.summary).toBe(true);
    expect(inside(h).map((k) => k.type).sort()).toEqual(["end-event", "start-event", "task"]);
    // and the flows joined the NEW Start / End, not the ids that merely share their names
    const newStart = inside(h).find((k) => k.type === "start-event")!, newEnd = inside(h).find((k) => k.type === "end-event")!;
    expect(newStart.id).not.toBe("start");
    expect(newEnd.id).not.toBe("end");
    expect(flows(h).some((c) => c.sourceId === newStart.id && c.targetId === byLabel(h, "New Task").id)).toBe(true);
    expect(flows(h).some((c) => c.sourceId === "start" || c.targetId === "end")).toBe(false);
  });

  it("the plan's roles can never be mistaken for an element id", async () => {
    const { planAddInsideEp } = await import("@/app/lib/diagram/epAdd");
    const d = world();
    const plan = planAddInsideEp(d.elements, d.connectors, d.elements.find((e) => e.id === "ep")!, null, { w: 102, h: 64 });
    expect("error" in plan).toBe(false);
    if (!("error" in plan)) for (const j of plan.joins) for (const end of [j.from, j.to]) expect(end.startsWith("@")).toBe(true);
  });
});

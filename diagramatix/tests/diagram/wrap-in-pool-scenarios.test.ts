/**
 * T4760–T4763, T4765–T4766 — "put a pool around everything called Northwind Freight".
 *
 * Paul, 2026-09-25, on the harness row "no pool is called “Northwind Freight”":
 * "I am not sure this is correct behaviour." Four cases, and "the message
 * should never be 'no pool called …'":
 *
 *   1. A white-box pool already round every process element → say so, do nothing.
 *   2. Only black-box pools, the loose elements together between them → a new
 *      pool, named, as wide as the black-box pools.
 *   3. Only black-box pools, the loose elements split above and below one → no
 *      pool can be drawn; say so.
 *   4. No pools → a new named pool, as before.
 *
 * Each is driven the way a user drives it — the sentence, through the grammar
 * and the apply layer, into the real reducer — and then scored by L4, which is
 * written from these four cases rather than from the planner.
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { scoreApply } from "@/app/lib/assist/applyScore";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => ({ properties: {}, ...o }) as unknown as DiagramElement;
const diagram = (elements: DiagramElement[]): DiagramData => ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } });
const SAY = "put a pool around everything called Northwind Freight";

function run(d: DiagramData) {
  const h = headlessDiagram(structuredClone(d));
  const r = applyAssistOps(parseCommand(SAY)!, h.context());
  return { ...r, after: h.data, l4: scoreApply(parseCommand(SAY)!, d) };
}

const customer = E({ id: "cust", type: "pool", label: "Customer", x: 0, y: 0, width: 900, height: 120, properties: { poolType: "black-box" } });
const salesforce = E({ id: "sys", type: "pool", label: "Salesforce", x: 0, y: 600, width: 900, height: 120, properties: { poolType: "black-box" } });
const task = (id: string, x: number, y: number) => E({ id, type: "task", label: `Do ${id}`, x, y, width: 100, height: 60 });

describe("T4760 — 1: everything is already in a white-box pool", () => {
  it("says so, by name, and changes nothing", () => {
    const d = diagram([
      E({ id: "p", type: "pool", label: "Claims Processing", x: 0, y: 0, width: 900, height: 300, properties: { poolType: "white-box" } }),
      E({ ...task("a", 200, 100), parentId: "p" }),
    ]);
    const r = run(d);
    expect(r.ok).toBe(false);
    expect(r.summary).toBe("everything is already in Claims Processing — nothing to put in a new pool");
    expect(r.after.elements).toEqual(d.elements);
  });
});

describe("T4761 — 2: between black-box pools, a new pool as wide as they are", () => {
  const d = diagram([customer, salesforce, task("a", 200, 280), task("b", 400, 280)]);

  it("draws ONE new pool, named, the black-box pools' width, in the gap", () => {
    const r = run(d);
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toBe("put 2 elements in a new pool “Northwind Freight”, as wide as Customer");
    const made = r.after.elements.filter((e) => e.type === "pool" && !["cust", "sys"].includes(e.id));
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ label: "Northwind Freight", x: 0, width: 900 });
    expect(made[0].y).toBeGreaterThanOrEqual(120);
    expect(made[0].y + made[0].height).toBeLessThanOrEqual(600);
    for (const id of ["a", "b"]) expect(r.after.elements.find((e) => e.id === id)!.parentId).toBe(made[0].id);
  });

  it("leaves both participants exactly as they were", () => {
    const r = run(d);
    for (const bb of [customer, salesforce]) expect(r.after.elements.find((e) => e.id === bb.id)).toEqual(bb);
  });

  it("and L4 agrees", () => {
    expect(run(d).l4).toMatchObject({ ok: true });
  });
});

describe("T4762 — 3: split above and below a black-box pool, no pool can be drawn", () => {
  it("refuses, naming the pool in the way, and changes nothing", () => {
    const d = diagram([
      E({ ...salesforce, y: 300 }),
      task("a", 200, 100),
      task("b", 200, 600),
    ]);
    const r = run(d);
    expect(r.ok).toBe(false);
    expect(r.summary).toBe("can't put one pool around them — they are split above and below Salesforce; move them to one side of it first");
    expect(r.after.elements).toEqual(d.elements);
  });

  it("also refuses when an element sits ACROSS a black-box pool", () => {
    const d = diagram([customer, task("a", 200, 60)]);
    expect(run(d).summary).toBe("can't put a pool around them — Do a overlaps Customer; move it clear first");
  });
});

describe("T4763 — 4: no pools, a new named pool as before; and the message is never a shrug", () => {
  it("creates the pool round the loose elements, with the name said", () => {
    const d = diagram([task("a", 200, 100), task("b", 400, 100)]);
    const r = run(d);
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toBe("put 2 elements in a new pool “Northwind Freight”");
    expect(r.after.elements.find((e) => e.type === "pool")?.label).toBe("Northwind Freight");
    expect(r.l4.ok).toBe(true);
  });

  it("no case produces “no pool is called …”", () => {
    const cases = [
      diagram([task("a", 200, 100)]),
      diagram([customer, salesforce, task("a", 200, 280)]),
      diagram([E({ ...salesforce, y: 300 }), task("a", 200, 100), task("b", 200, 600)]),
    ];
    for (const d of cases) expect(run(d).l4.detail).not.toMatch(/no pool is called/);
  });
});

describe("T4765 — a white-box pool takes outside elements only by WIDENING", () => {
  // Paul, 2026-09-25: grow it and keep its name "as long as the elements can
  // be enclosed by widening the existing pool".
  const wb = () => [
    E({ id: "p", type: "pool", label: "Claims Processing", x: 0, y: 0, width: 900, height: 400, properties: { poolType: "white-box" } }),
    E({ id: "L1", type: "lane", label: "Claims Team", x: 36, y: 0, width: 864, height: 200, parentId: "p" }),
    E({ id: "L2", type: "lane", label: "Underwriters", x: 36, y: 200, width: 864, height: 200, parentId: "p" }),
    E({ id: "S1", type: "lane", label: "Sub 1", x: 72, y: 200, width: 828, height: 100, parentId: "L2" }),
    E({ id: "S2", type: "lane", label: "Sub 2", x: 72, y: 300, width: 828, height: 100, parentId: "L2" }),
    E({ ...task("in", 200, 50), parentId: "L1" }),
  ];

  it("widens to take in an element level with it, keeping its top, bottom and name", () => {
    const d = diagram([...wb(), task("x", 1000, 320)]);
    const r = run(d);
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toBe("grew Claims Processing to take in 1 loose element — “Northwind Freight” was not used; the pool keeps its name");
    const p = r.after.elements.find((e) => e.id === "p")!;
    expect({ y: p.y, height: p.height, label: p.label }).toEqual({ y: 0, height: 400, label: "Claims Processing" });
    expect(p.x + p.width).toBeGreaterThanOrEqual(1100);
    expect(r.l4.ok, r.l4.detail).toBe(true);
  });

  it("puts it in the lane it sits level with — the deepest, a sublane beats its lane", () => {
    const r = run(diagram([...wb(), task("x", 1000, 320)]));
    expect(r.after.elements.find((e) => e.id === "x")!.parentId).toBe("S2");
  });

  it("and the lanes and sublanes widen with the pool", () => {
    const r = run(diagram([...wb(), task("x", 1000, 320)]));
    const p = r.after.elements.find((e) => e.id === "p")!;
    for (const id of ["L1", "L2", "S1", "S2"]) {
      const l = r.after.elements.find((e) => e.id === id)!;
      expect(l.x + l.width, id).toBe(p.x + p.width);
    }
  });

  it("refuses an element ABOVE or BELOW the pool, by name, and changes nothing", () => {
    for (const [y, where] of [[-200, "above"], [600, "below"], [370, "across the edge of"]] as const) {
      const d = diagram([...wb(), task("x", 200, y)]);
      const r = run(d);
      expect(r.ok).toBe(false);
      expect(r.summary).toBe(`can't take Do x into Claims Processing by widening it — it sits ${where} it; move it level with the pool first`);
      expect(r.after.elements).toEqual(d.elements);
    }
  });
});

describe("T4766 — a pool is drawn round the PROCESS, and only the process", () => {
  // Paul, 2026-09-25: "no process-related diagrammatic elements on the screen,
  // e.g. a couple of annotations and a group with a review comment. Then no
  // pool should be created."
  const notes = () => [
    E({ id: "n1", type: "text-annotation", label: "Check with legal", x: 100, y: 100, width: 120, height: 40 }),
    E({ id: "n2", type: "text-annotation", label: "Draft", x: 300, y: 100, width: 120, height: 40 }),
    E({ id: "grp", type: "group", label: "Phase 1", x: 80, y: 200, width: 400, height: 200 }),
    E({ id: "rc", type: "review-comment", label: "Is this right?", x: 120, y: 240, width: 120, height: 60 }),
  ];

  it("with no events, activities, gateways, data objects or data stores, no pool — and says why", () => {
    const d = diagram(notes());
    const r = run(d);
    expect(r.ok).toBe(false);
    expect(r.summary).toBe("there are no events, activities, gateways, data objects or data stores to put in a pool");
    expect(r.after.elements).toEqual(d.elements);
  });

  it("beside real process elements, the annotations, group and comment are left where they are", () => {
    const d = diagram([...notes(), task("a", 600, 100), task("b", 800, 100)]);
    const r = run(d);
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toBe("put 2 elements in a new pool “Northwind Freight”");
    for (const id of ["n1", "n2", "grp", "rc"]) expect(r.after.elements.find((e) => e.id === id)!.parentId, id).toBeUndefined();
    expect(r.l4.ok, r.l4.detail).toBe(true);
  });

  it("a data store IS process — it goes in the pool with the rest (Paul: “include data stores”)", () => {
    const d = diagram([...notes(), task("a", 600, 100), E({ id: "ds", type: "data-store", label: "Claims DB", x: 800, y: 100, width: 50, height: 50 })]);
    const r = run(d);
    expect(r.summary).toBe("put 2 elements in a new pool “Northwind Freight”");
    const pool = r.after.elements.find((e) => e.type === "pool")!;
    expect(r.after.elements.find((e) => e.id === "ds")!.parentId).toBe(pool.id);
  });

  it("and a data store alone is enough for a pool", () => {
    const r = run(diagram([E({ id: "ds", type: "data-store", label: "Claims DB", x: 300, y: 100, width: 50, height: 50 })]));
    expect(r.ok, r.summary).toBe(true);
  });
});

/**
 * T4760–T4763 — "put a pool around everything called Northwind Freight".
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

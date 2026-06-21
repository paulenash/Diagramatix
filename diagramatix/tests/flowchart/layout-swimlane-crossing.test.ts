/**
 * Flowchart generate-layout rules:
 *  - F4.01 — when elements carry a `lane`, the flow is laid out as vertical
 *    swimlane columns left-to-right in first-appearance order, each flow element
 *    parented to and positioned within its lane column.
 *  - F4.03 — a crossing-minimisation (barycenter) pass orders within-rank nodes
 *    so a re-converging node sits between its parents instead of staying where
 *    DFS first placed it.
 */
import { describe, it, expect } from "vitest";
import { layoutFlowchartDiagram } from "@/app/lib/diagram/layoutFlowchart";

describe("flowchart layout — F4.01 swimlanes", () => {
  const out = layoutFlowchartDiagram({
    elements: [
      { id: "s", type: "terminator", label: "Start", lane: "Customer" },
      { id: "t1", type: "process", label: "Take order", lane: "Sales" },
      { id: "t2", type: "process", label: "Invoice", lane: "Billing" },
      { id: "e", type: "terminator", label: "End", lane: "Customer" },
    ],
    connections: [
      { sourceId: "s", targetId: "t1" },
      { sourceId: "t1", targetId: "t2" },
      { sourceId: "t2", targetId: "e" },
    ],
  });
  const cols = out.elements.filter((e) => e.type === "flowchart-vswimlane");
  const byId = new Map(out.elements.map((e) => [e.id, e]));

  it("creates one column per lane, left-to-right in first-appearance order", () => {
    const ordered = [...cols].sort((a, b) => a.x - b.x).map((c) => c.label);
    expect(ordered).toEqual(["Customer", "Sales", "Billing"]);
  });

  it("parents each flow element to its lane column", () => {
    const colByLabel = new Map(cols.map((c) => [c.label, c.id]));
    expect(byId.get("s")!.parentId).toBe(colByLabel.get("Customer"));
    expect(byId.get("t1")!.parentId).toBe(colByLabel.get("Sales"));
    expect(byId.get("t2")!.parentId).toBe(colByLabel.get("Billing"));
    expect(byId.get("e")!.parentId).toBe(colByLabel.get("Customer"));
  });

  it("positions each element within its lane column's x-range", () => {
    const colByLabel = new Map(cols.map((c) => [c.label, c]));
    const t1 = byId.get("t1")!;
    const sales = colByLabel.get("Sales")!;
    const cx = t1.x + t1.width / 2;
    expect(cx).toBeGreaterThanOrEqual(sales.x);
    expect(cx).toBeLessThanOrEqual(sales.x + sales.width);
  });

  it("columns share the same top and height (one rigid band)", () => {
    const ys = new Set(cols.map((c) => c.y));
    const hs = new Set(cols.map((c) => c.height));
    expect(ys.size).toBe(1);
    expect(hs.size).toBe(1);
  });
});

describe("flowchart layout — F4.03 crossing minimisation", () => {
  // Four sources a,b,c,d. m re-converges from the OUTER two (a,d); p,q hang off
  // the middle two (b,c). DFS would place m first in its rank; the barycenter
  // pass must pull m to the middle, between p and q.
  const out = layoutFlowchartDiagram({
    elements: [
      { id: "a", type: "process", label: "a" },
      { id: "b", type: "process", label: "b" },
      { id: "c", type: "process", label: "c" },
      { id: "d", type: "process", label: "d" },
      { id: "m", type: "process", label: "m" },
      { id: "p", type: "process", label: "p" },
      { id: "q", type: "process", label: "q" },
    ],
    connections: [
      { sourceId: "a", targetId: "m" },
      { sourceId: "d", targetId: "m" },
      { sourceId: "b", targetId: "p" },
      { sourceId: "c", targetId: "q" },
    ],
  });
  const byId = new Map(out.elements.map((e) => [e.id, e]));

  it("places the re-converging node between its peers (not left-most as DFS would)", () => {
    const p = byId.get("p")!, m = byId.get("m")!, q = byId.get("q")!;
    expect(p.x).toBeLessThan(m.x);
    expect(m.x).toBeLessThan(q.x);
  });
});

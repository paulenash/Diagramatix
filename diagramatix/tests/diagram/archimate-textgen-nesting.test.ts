/**
 * ArchiMate text-gen nesting (no image bounds).
 *
 * When a text-prompt ArchiMate plan carries `parent` links (composition expressed
 * as nesting) but NO bounds, layoutArchimateDiagram must still nest: set parentId,
 * size each container to enclose its children, and drop the nested composition
 * lines. A plan with NO nesting (serving/flow) must be completely unchanged.
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";

const at = (d: { elements: Array<{ id: string }> }, id: string) => d.elements.find((e) => e.id === id)! as never as { id: string; x: number; y: number; width: number; height: number; parentId?: string; properties: Record<string, unknown> };
const encloses = (p: { x: number; y: number; width: number; height: number }, c: { x: number; y: number; width: number; height: number }) =>
  c.x >= p.x - 1 && c.y >= p.y - 1 && c.x + c.width <= p.x + p.width + 1 && c.y + c.height <= p.y + p.height + 1;

describe("ArchiMate text-gen nesting", () => {
  it("T1074 — `parent` nesting (no bounds) → parentId chain, enclosing containers, no composition lines", () => {
    const els = [
      { id: "a1", type: "business-actor", label: "ArchiSurance" },
      { id: "a2", type: "business-actor", label: "Front Office", parent: "a1" },
      { id: "a3", type: "business-actor", label: "Customer Relations", parent: "a2" },
      { id: "a4", type: "business-actor", label: "Intermediary Relations", parent: "a2" },
      { id: "a5", type: "business-actor", label: "Back Office", parent: "a1" },
      { id: "a6", type: "business-actor", label: "Home & Away", parent: "a5" },
      { id: "a7", type: "business-actor", label: "Car", parent: "a5" },
      { id: "a8", type: "business-actor", label: "Legal Aid", parent: "a5" },
    ];
    const comps = [["a1", "a2"], ["a1", "a5"], ["a2", "a3"], ["a2", "a4"], ["a5", "a6"], ["a5", "a7"], ["a5", "a8"]];
    const conns = comps.map(([s, t]) => ({ sourceId: s, targetId: t, type: "composition" }));
    const d = layoutGenericDiagram({ elements: els, connections: conns } as never, "archimate");

    // parentId chain
    expect(at(d, "a3").parentId).toBe("a2");
    expect(at(d, "a2").parentId).toBe("a1");
    expect(at(d, "a1").parentId).toBeUndefined();
    // containers enclose children + flagged
    for (const [p, c] of comps) expect(encloses(at(d, p), at(d, c)), `${p} must enclose ${c}`).toBe(true);
    expect(at(d, "a1").properties.archimateIsContainer).toBe(true);
    expect(at(d, "a5").properties.archimateIsContainer).toBe(true);
    // nesting replaces the composition lines
    expect(d.connectors.some((c) => c.type === "archi-composition")).toBe(false);
  });

  it("T1075 — a non-composition ArchiMate plan is unchanged (no nesting introduced)", () => {
    const els = [
      { id: "a1", type: "business-actor", label: "Customer" },
      { id: "s1", type: "business-service", label: "Ordering Service" },
      { id: "p1", type: "business-process", label: "Receive Order" },
    ];
    const conns = [
      { sourceId: "a1", targetId: "s1", type: "serving" },
      { sourceId: "p1", targetId: "s1", type: "realisation" },
    ];
    const d = layoutGenericDiagram({ elements: els, connections: conns } as never, "archimate");
    expect(d.elements).toHaveLength(3);
    expect(d.elements.every((e) => (e as { parentId?: string }).parentId === undefined)).toBe(true);
    expect(d.connectors).toHaveLength(2);
    expect(d.connectors.some((c) => c.type === "archi-serving")).toBe(true);
    expect(d.connectors.some((c) => c.type === "archi-realisation")).toBe(true);
  });
});

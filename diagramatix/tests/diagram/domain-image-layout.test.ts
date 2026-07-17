/**
 * Domain (UML class) image reproduction — when the AI (reading an uploaded class
 * diagram) emits per-element `bounds` + package `parent` + connector faces, the
 * generated DiagramData should honour that geometry instead of grid-flowing.
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import type { UmlAttribute } from "@/app/lib/diagram/types";

const parsed = {
  elements: [
    { id: "p1", type: "uml-package", label: "Sales", bounds: { x: 0.05, y: 0.05, w: 0.5, h: 0.8 } },
    { id: "c1", type: "uml-class", label: "Customer", parent: "p1",
      bounds: { x: 0.08, y: 0.15, w: 0.2, h: 0.25 },
      attributes: [{ name: "id", type: "Integer", visibility: "+" }],
      operations: [{ name: "rename", visibility: "+" }] },
    { id: "c2", type: "uml-class", label: "Order", parent: "p1",
      bounds: { x: 0.34, y: 0.15, w: 0.2, h: 0.2 }, attributes: [{ name: "no", type: "Integer" }] },
    { id: "e1", type: "uml-enumeration", label: "Status",
      bounds: { x: 0.7, y: 0.15, w: 0.22, h: 0.18 }, values: ["New", "Done"] },
  ],
  connections: [
    { sourceId: "c1", targetId: "c2", type: "uml-association", sourceMultiplicity: "1", targetMultiplicity: "*", sourceSide: "right", targetSide: "left" },
    { sourceId: "c2", targetId: "e1", type: "uml-association", targetMultiplicity: "1" },
  ],
};

describe("domain image reproduction (layout preserved from bounds)", () => {
  it("positions elements from bounds, nests classes in the package, builds typed connectors", () => {
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 700 } });

    const c1 = data.elements.find(e => e.id === "c1")!;
    const c2 = data.elements.find(e => e.id === "c2")!;
    // Not the grid: c1 left of c2, both offset from origin per bounds.
    expect(c1.x).toBeLessThan(c2.x);
    expect(c1.x).toBeGreaterThan(50);
    // Package nesting.
    expect(c1.parentId).toBe("p1");
    expect(c2.parentId).toBe("p1");
    // Package encloses its members.
    const p1 = data.elements.find(e => e.id === "p1")!;
    expect(p1.x).toBeLessThanOrEqual(c1.x);
    expect(p1.x + p1.width).toBeGreaterThanOrEqual(c2.x + c2.width);
    // Attributes + operations reconstructed.
    expect((c1.properties.attributes as UmlAttribute[])[0].name).toBe("id");
    expect((c1.properties.operations as Array<{ name: string }>)[0].name).toBe("rename");
    // Enum values.
    expect(data.elements.find(e => e.id === "e1")!.properties.values).toEqual(["New", "Done"]);
    // Connectors typed + multiplicities preserved.
    const assoc = data.connectors.find(c => c.sourceId === "c1")!;
    expect(assoc.type).toBe("uml-association");
    expect(assoc.sourceMultiplicity).toBe("1");
    expect(assoc.targetMultiplicity).toBe("*");
  });

  it("compacts the exaggerated gaps left by content-sizing, without overlaps", () => {
    // Mimic the AI's near-uniform image bounds: wide boxes spread across the
    // canvas. Content-sizing shrinks them (short names), so without compaction
    // the gaps balloon. Compaction should pull them together but never collide.
    const spread = {
      elements: [
        { id: "a", type: "uml-class", label: "A", bounds: { x: 0.02, y: 0.4, w: 0.18, h: 0.2 } },
        { id: "b", type: "uml-class", label: "B", bounds: { x: 0.30, y: 0.4, w: 0.18, h: 0.2 } },
        { id: "c", type: "uml-class", label: "C", bounds: { x: 0.58, y: 0.4, w: 0.18, h: 0.2 } },
        { id: "d", type: "uml-class", label: "D", bounds: { x: 0.86, y: 0.4, w: 0.12, h: 0.2 } },
      ],
      connections: [],
    };
    const data = layoutGenericDiagram(spread as never, "domain", { imageAspect: { w: 1000, h: 600 } });
    const bx = (id: string) => data.elements.find(e => e.id === id)!;
    // Left-to-right ordering preserved (affine scale keeps collinearity).
    expect(bx("a").x).toBeLessThan(bx("b").x);
    expect(bx("b").x).toBeLessThan(bx("c").x);
    expect(bx("c").x).toBeLessThan(bx("d").x);
    // No two boxes overlap.
    for (let i = 0; i < data.elements.length; i++)
      for (let j = i + 1; j < data.elements.length; j++) {
        const p = data.elements[i], q = data.elements[j];
        const hit = p.x < q.x + q.width && p.x + p.width > q.x &&
                    p.y < q.y + q.height && p.y + p.height > q.y;
        expect(hit).toBe(false);
      }
    // Compacted: the a→b gap is modest, not the ~285px the raw 0.28-fraction
    // centre spacing (392px) minus the shrunk width would otherwise leave.
    const gapAB = bx("b").x - (bx("a").x + bx("a").width);
    expect(gapAB).toBeLessThan(160);
  });

  it("D4.06 — separates classes the image drew overlapping, favouring a horizontal gap", () => {
    // The AI reports two classes whose image bounds OVERLAP (same region).
    const overlapping = {
      elements: [
        { id: "a", type: "uml-class", label: "AccountHolder",
          bounds: { x: 0.20, y: 0.30, w: 0.30, h: 0.25 } },
        { id: "b", type: "uml-class", label: "SavingsAccount",
          bounds: { x: 0.28, y: 0.34, w: 0.30, h: 0.25 } },
      ],
      connections: [],
    };
    const data = layoutGenericDiagram(overlapping as never, "domain", { imageAspect: { w: 1000, h: 700 } });
    const a = data.elements.find(e => e.id === "a")!;
    const b = data.elements.find(e => e.id === "b")!;
    // No overlap.
    const hit = a.x < b.x + b.width && a.x + a.width > b.x &&
                a.y < b.y + b.height && a.y + a.height > b.y;
    expect(hit).toBe(false);
    // Resolved sideways (horizontal preference) with a real gap between edges.
    const left = a.x <= b.x ? a : b, right = a.x <= b.x ? b : a;
    expect(right.x - (left.x + left.width)).toBeGreaterThanOrEqual(30);
  });

  it("honours the image class DIMENSIONS (keeps a large drawn box large, not shrunk to content)", () => {
    const parsed = {
      elements: [
        { id: "big",   type: "uml-class", label: "X", bounds: { x: 0.10, y: 0.10, w: 0.35, h: 0.50 } },
        { id: "small", type: "uml-class", label: "Y", bounds: { x: 0.70, y: 0.10, w: 0.12, h: 0.10 } },
      ],
      connections: [],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 800 } });
    const big = data.elements.find(e => e.id === "big")!;
    const small = data.elements.find(e => e.id === "small")!;
    // Image proportions preserved — the big drawn box stays much larger than the
    // tiny one (previously both were content-sized to ~the same box).
    expect(big.width).toBeGreaterThan(small.width * 1.7);
    expect(big.height).toBeGreaterThan(small.height * 2);
  });

  it("preserves the image connector attachment FACES (not the optimal-face re-pick)", () => {
    const parsed = {
      elements: [
        { id: "a", type: "uml-class", label: "A", bounds: { x: 0.10, y: 0.10, w: 0.2, h: 0.2 } },
        { id: "b", type: "uml-class", label: "B", bounds: { x: 0.10, y: 0.60, w: 0.2, h: 0.2 } },
      ],
      // A is drawn ABOVE B, but the line leaves/enters the RIGHT face of both.
      connections: [{ sourceId: "a", targetId: "b", type: "uml-association", sourceSide: "right", targetSide: "right" }],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 1000 } });
    const c = data.connectors[0];
    // Optimal routing would pick bottom→top; the image said right→right → keep it.
    expect(c.sourceSide).toBe("right");
    expect(c.targetSide).toBe("right");
  });

  it("maps image open arrowheads to navigability (directionType / arrowAtSource)", () => {
    const parsed = {
      elements: [
        { id: "a", type: "uml-class", label: "A", bounds: { x: 0.10, y: 0.10, w: 0.2, h: 0.2 } },
        { id: "b", type: "uml-class", label: "B", bounds: { x: 0.60, y: 0.10, w: 0.2, h: 0.2 } },
        { id: "c", type: "uml-class", label: "C", bounds: { x: 0.10, y: 0.60, w: 0.2, h: 0.2 } },
      ],
      connections: [
        { sourceId: "a", targetId: "b", type: "uml-association", targetArrow: true },  // arrow at target
        { sourceId: "a", targetId: "c", type: "uml-association", sourceArrow: true },  // arrow at source
      ],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 700 } });
    const ab = data.connectors.find(c => c.targetId === "b")!;
    const ac = data.connectors.find(c => c.targetId === "c")!;
    expect(ab.directionType).toBe("open-directed");
    expect(ab.arrowAtSource).toBeFalsy();          // arrow points at target
    expect(ac.directionType).toBe("open-directed");
    expect(ac.arrowAtSource).toBe(true);           // arrow points at source
  });

  it("uses the image self-loop attachment offsets and extension depth", () => {
    const parsed = {
      elements: [{ id: "s", type: "uml-class", label: "S", bounds: { x: 0.3, y: 0.3, w: 0.3, h: 0.2 } }],
      connections: [{ sourceId: "s", targetId: "s", type: "uml-association", sourceSide: "bottom",
        sourceOffsetAlong: 0.2, targetOffsetAlong: 0.5, selfLoopDepthFrac: 0.05 }],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 700 } });
    const c = data.connectors[0];
    expect(c.sourceSide).toBe("bottom");
    expect(c.sourceOffsetAlong).toBeCloseTo(0.2, 5);
    expect(c.targetOffsetAlong).toBeCloseTo(0.5, 5);
    expect(c.selfLoopBulge).toBeCloseTo(0.05 * 1400, 0);   // depthFrac × TARGET_W
  });

  it("nudges a constraint box OUTWARD to clear its own multiplicity", () => {
    const parsed = {
      elements: [
        { id: "a", type: "uml-class", label: "A", bounds: { x: 0.30, y: 0.55, w: 0.2, h: 0.2 } },
        { id: "b", type: "uml-class", label: "B", bounds: { x: 0.30, y: 0.10, w: 0.2, h: 0.2 } },
      ],
      // Source end on A's TOP with a multiplicity AND a constraint — they would
      // stack; the constraint must move further up (roles/mults stay put).
      connections: [{ sourceId: "a", targetId: "b", type: "uml-association", sourceSide: "top", targetSide: "bottom",
        sourceMultiplicity: "1", sourceConstraint: "{ordered}" }],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 800 } });
    const c = data.connectors[0];
    expect(c.sourceConstraintOffset).toBeTruthy();
    expect(c.sourceConstraintOffset!.y).toBeLessThan(0);   // pushed up (outward from a top side)
  });

  it("wraps an imported note to several lines instead of one wide line", () => {
    const withNote = {
      elements: [
        { id: "c1", type: "uml-class", label: "Toy", bounds: { x: 0.1, y: 0.2, w: 0.2, h: 0.2 } },
        { id: "n1", type: "uml-note", label: "Sometimes we run out of Toys!!",
          bounds: { x: 0.5, y: 0.2, w: 0.3, h: 0.25 } },
      ],
      connections: [{ sourceId: "n1", targetId: "c1", type: "uml-note-anchor" }],
    };
    const data = layoutGenericDiagram(withNote as never, "domain", { imageAspect: { w: 1000, h: 700 } });
    const note = data.elements.find(e => e.id === "n1")!;
    // Snug sticky: narrower than the ~30-char text on one line (~195px), tall
    // enough for multiple wrapped lines (≥ 2 lines * ~16px + padding).
    expect(note.width).toBeLessThan(180);
    expect(note.height).toBeGreaterThanOrEqual(48);
  });

  it("falls back to auto-layout when bounds are absent", () => {
    const noBounds = {
      elements: [
        { id: "a", type: "uml-class", label: "A" },
        { id: "b", type: "uml-class", label: "B" },
      ],
      connections: [{ sourceId: "a", targetId: "b", type: "uml-association" }],
    };
    const data = layoutGenericDiagram(noBounds as never, "domain");
    expect(data.elements).toHaveLength(2);
    expect(data.connectors).toHaveLength(1);
  });
});

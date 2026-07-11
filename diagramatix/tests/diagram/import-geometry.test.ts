/**
 * snapImportedBounds (T0710) — the clean/snap pass over image-imported BPMN
 * geometry. Vision boxes are jittery; this pass clamps them, orders pools
 * top→bottom, tiles lanes across their pool, snaps near-aligned nodes into
 * shared columns, and repairs each node's pool/lane membership by containment.
 */
import { describe, it, expect } from "vitest";
import { snapImportedBounds, type ImportedShape } from "@/app/lib/diagram/importGeometry";

describe("snapImportedBounds (T0710)", () => {
  it("returns not-ok when no pool carries bounds (caller falls back to auto-stack)", () => {
    const r = snapImportedBounds([
      { id: "t", type: "task", bounds: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
    ]);
    expect(r.ok).toBe(false);
  });

  it("orders pools top→bottom by their box y", () => {
    const shapes: ImportedShape[] = [
      { id: "pB", type: "pool", bounds: { x: 0, y: 0.5, w: 1, h: 0.4 } },
      { id: "pA", type: "pool", bounds: { x: 0, y: 0.05, w: 1, h: 0.4 } },
      { id: "n", type: "task", pool: "pA", bounds: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
    ];
    const r = snapImportedBounds(shapes);
    expect(r.ok).toBe(true);
    expect(r.poolOrder).toEqual(["pA", "pB"]);
  });

  it("snaps a lane to its parent pool's x/width", () => {
    const shapes: ImportedShape[] = [
      { id: "p", type: "pool", bounds: { x: 0.1, y: 0.1, w: 0.8, h: 0.6 } },
      { id: "l", type: "lane", parentPool: "p", bounds: { x: 0.15, y: 0.12, w: 0.7, h: 0.55 } },
      { id: "n", type: "task", pool: "p", lane: "l", bounds: { x: 0.2, y: 0.2, w: 0.1, h: 0.1 } },
    ];
    const r = snapImportedBounds(shapes);
    const lane = r.shapes.find((s) => s.id === "l")!;
    const pool = r.shapes.find((s) => s.id === "p")!;
    expect(lane.box.x).toBeCloseTo(pool.box.x, 5);
    expect(lane.box.w).toBeCloseTo(pool.box.w, 5);
    expect(lane.parentPoolId).toBe("p");
  });

  it("snaps two near-aligned nodes into one column", () => {
    const shapes: ImportedShape[] = [
      { id: "p", type: "pool", bounds: { x: 0, y: 0, w: 1, h: 1 } },
      // centre-x 0.305 and 0.31 — within the 0.03 column tolerance.
      { id: "a", type: "task", pool: "p", bounds: { x: 0.28, y: 0.20, w: 0.05, h: 0.05 } },
      { id: "b", type: "task", pool: "p", bounds: { x: 0.285, y: 0.60, w: 0.05, h: 0.05 } },
    ];
    const r = snapImportedBounds(shapes);
    const a = r.shapes.find((s) => s.id === "a")!;
    const b = r.shapes.find((s) => s.id === "b")!;
    const cx = (box: { x: number; w: number }) => box.x + box.w / 2;
    expect(cx(a.box)).toBeCloseTo(cx(b.box), 5);
  });

  it("repairs a node's pool membership by containment (geometry beats the declared field)", () => {
    const shapes: ImportedShape[] = [
      { id: "p1", type: "pool", bounds: { x: 0, y: 0, w: 1, h: 0.5 } },
      { id: "p2", type: "pool", bounds: { x: 0, y: 0.5, w: 1, h: 0.5 } },
      // Declared in p1 but its centre (0.7) sits inside p2's band.
      { id: "n", type: "task", pool: "p1", bounds: { x: 0.4, y: 0.68, w: 0.1, h: 0.06 } },
    ];
    const r = snapImportedBounds(shapes);
    const n = r.shapes.find((s) => s.id === "n")!;
    expect(n.poolId).toBe("p2");
  });
});

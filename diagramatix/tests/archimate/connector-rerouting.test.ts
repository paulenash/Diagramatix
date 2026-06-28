/**
 * ArchiMate connector re-routing on element move (#bug: connectors travelling
 * THROUGH the element they're attached to).
 *
 * ArchiMate connectors are straight lines. When an element is dragged to the far
 * side of its partner, a stored attachment side can end up facing AWAY from the
 * other element — so the straight line cuts back through the element's own body.
 * recomputeAllConnectors must re-attach that end to the side facing the other
 * element. An end that still faces the other element keeps its exact click-time
 * offset.
 *
 * Core invariant: for a straight connector, if BOTH ends attach on sides facing
 * the other element, the line cannot pass through either body. So we assert each
 * recomputed side faces the other element (and that a facing end is left alone).
 */
import { describe, it, expect } from "vitest";
import { recomputeAllConnectors } from "@/app/lib/diagram/routing";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import type { DiagramElement, Connector, Side } from "@/app/lib/diagram/types";

const shape = (id: string, x: number, y: number, w = 120, h = 70): DiagramElement =>
  ({ id, type: "archimate-shape", x, y, width: w, height: h, label: id, properties: {} });

const conn = (over: Partial<Connector>): Connector =>
  ({
    id: "c1", type: "archi-serving", sourceId: "s", targetId: "t",
    sourceSide: "right", targetSide: "left",
    sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
    routingType: "direct", directionType: "open-directed", waypoints: [],
    ...over,
  } as Connector);

const SIDE_NORMAL: Record<Side, { x: number; y: number }> = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 },
};
const centre = (e: DiagramElement) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });
/** Does this side's outward normal point toward the other element's centre? */
function faces(el: DiagramElement, side: Side, other: DiagramElement): boolean {
  const n = SIDE_NORMAL[side], a = centre(el), b = centre(other);
  return n.x * (b.x - a.x) + n.y * (b.y - a.y) >= 0;
}

describe("ArchiMate connector re-routing on move", () => {
  it("re-attaches an end whose stored side now faces AWAY (the through-the-body bug)", () => {
    // Source dragged to the RIGHT of the target, but its stored side is still
    // "right" (now facing away) and the target's is still "left" (facing away).
    const s = shape("s", 400, 100);
    const t = shape("t", 100, 100);
    const c = conn({ sourceId: "s", targetId: "t", sourceSide: "right", targetSide: "left" });

    const [out] = recomputeAllConnectors([c], [s, t]);

    // Both ends re-picked to face the other element → straight line can't cross a body.
    expect(faces(s, out.sourceSide, t)).toBe(true);
    expect(faces(t, out.targetSide, s)).toBe(true);
    // Concretely, the natural re-pick here is left↔right swapped.
    expect(out.sourceSide).toBe("left");
    expect(out.targetSide).toBe("right");
  });

  it("leaves a facing attachment untouched — keeps the user's exact click offset", () => {
    // Source LEFT of target; "right"/"left" already face each other.
    const s = shape("s", 100, 100);
    const t = shape("t", 400, 100);
    const c = conn({ sourceSide: "right", targetSide: "left", sourceOffsetAlong: 0.25, targetOffsetAlong: 0.75 });

    const [out] = recomputeAllConnectors([c], [s, t]);

    expect(out.sourceSide).toBe("right");
    expect(out.targetSide).toBe("left");
    expect(out.sourceOffsetAlong).toBeCloseTo(0.25);
    expect(out.targetOffsetAlong).toBeCloseTo(0.75);
  });

  it("re-attaches only the offending end (the facing end keeps its offset)", () => {
    // Target is to the right of source: source "right" faces it (keep), but the
    // target's stored "right" faces away (re-pick).
    const s = shape("s", 100, 100);
    const t = shape("t", 400, 100);
    const c = conn({ sourceSide: "right", targetSide: "right", sourceOffsetAlong: 0.3, targetOffsetAlong: 0.6 });

    const [out] = recomputeAllConnectors([c], [s, t]);

    expect(out.sourceSide).toBe("right");                 // still faces target → kept
    expect(out.sourceOffsetAlong).toBeCloseTo(0.3);       // offset preserved
    expect(faces(t, out.targetSide, s)).toBe(true);       // re-picked to face source
    expect(out.targetSide).toBe("left");
  });

  it("never leaves a side facing away across a spread of relative placements", () => {
    const places: Array<[number, number]> = [
      [400, 100], [100, 100],          // E / W
      [100, 400], [100, -200],         // S / N
      [400, 400], [-200, -200], [400, -200], [-200, 400], // diagonals
    ];
    // Every (wrong) stored side combination, for each placement.
    const sides: Side[] = ["left", "right", "top", "bottom"];
    for (const [tx, ty] of places) {
      const s = shape("s", 100, 100);
      const t = shape("t", tx, ty);
      for (const ss of sides) for (const ts of sides) {
        const c = conn({ sourceSide: ss, targetSide: ts });
        const [out] = recomputeAllConnectors([c], [s, t]);
        expect(faces(s, out.sourceSide, t), `src ${ss}→${out.sourceSide} @ (${tx},${ty})`).toBe(true);
        expect(faces(t, out.targetSide, s), `tgt ${ts}→${out.targetSide} @ (${tx},${ty})`).toBe(true);
      }
    }
  });

  it("AI-generated archimate connectors (real layoutGenericDiagram path) also re-attach after a move", () => {
    // Build a plan the way AI generation feeds it, then run the REAL archimate
    // layout — the exact path AI generation uses. Its connectors are archi-* with
    // layout-assigned sides, so the fix (keyed on connector type) applies the same.
    const plan = {
      elements: [
        { id: "a", type: "business-actor", label: "Customer" },
        { id: "p", type: "business-process", label: "Handle Order" },
        { id: "s", type: "business-service", label: "Order Service" },
        { id: "c", type: "application-component", label: "Order App" },
      ],
      connections: [
        { sourceId: "a", targetId: "p", type: "assignment" },
        { sourceId: "p", targetId: "s", type: "serving" },
        { sourceId: "s", targetId: "c", type: "realisation" },
      ],
    };
    const data = layoutGenericDiagram(plan as never, "archimate");
    expect(data.connectors.length).toBeGreaterThan(0);
    expect(data.connectors.every((c) => c.type.startsWith("archi-"))).toBe(true);

    // Drag everything to mirrored Y positions — many stored sides now face away.
    const moved = data.elements.map((e) => ({ ...e, y: 800 - e.y - e.height }));
    const byId = new Map(moved.map((e) => [e.id, e]));

    for (const c of recomputeAllConnectors(data.connectors, moved)) {
      const src = byId.get(c.sourceId), tgt = byId.get(c.targetId);
      if (!src || !tgt) continue;
      expect(faces(src, c.sourceSide, tgt), `${c.id} src ${c.sourceSide}`).toBe(true);
      expect(faces(tgt, c.targetSide, src), `${c.id} tgt ${c.targetSide}`).toBe(true);
    }
  });
});

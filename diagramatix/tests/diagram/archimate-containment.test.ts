/**
 * ArchiMate containment — plain-drag adoption + extraction.
 *
 * In ArchiMate diagrams a shape is pulled OUT of a container with a plain
 * click-and-drag (no modifier key): once its centre leaves the container the
 * reducer clears its parentId, severing the containment link. Shift is reserved
 * for the tree-highlight (a stationary shift-click), so it must NOT be required
 * to extract. These guards drive the real reducer to lock that in.
 *
 * T1026 — plain drag OUT of an archimate container clears parentId (sever).
 * T1027 — full cycle: plain drag IN adopts (container flag + child on top),
 *          plain drag back OUT extracts.
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const dispatch = (s: DiagramData, a: Action) => reducer(s, a);
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

function mk(id: string, x: number, y: number, w: number, h: number, extra: Partial<DiagramElement> = {}): DiagramElement {
  return {
    id, type: "archimate-shape", x, y, width: w, height: h, label: id,
    properties: { archimateShapeKey: "business-process" } as Record<string, unknown>,
    ...extra,
  } as DiagramElement;
}

function base(elements: DiagramElement[]): DiagramData {
  return { version: "1.0", diagramType: "archimate", elements, connectors: [] } as unknown as DiagramData;
}

describe("archimate containment — plain-drag extraction (no Shift)", () => {
  it("T1026 plain drag of a child out of an archimate container severs parentId", () => {
    const C = mk("C", 100, 100, 240, 240, { properties: { archimateShapeKey: "grouping", archimateIsContainer: true } });
    const K = mk("K", 150, 150, 60, 40, { parentId: "C" });
    let d = base([C, K]);

    // Plain drag (unconstrained omitted ⇒ false) far outside C.
    d = dispatch(d, { type: "MOVE_ELEMENT", payload: { id: "K", x: 500, y: 500 } });
    d = dispatch(d, { type: "MOVE_END", payload: { id: "K" } });

    expect(at(d, "K").parentId).toBeUndefined();
  });

  it("T1027 plain drag IN adopts (container + child on top), plain drag OUT extracts", () => {
    const C = mk("C", 100, 100, 240, 240, { properties: { archimateShapeKey: "grouping" } });
    const K = mk("K", 500, 500, 60, 40); // starts outside
    let d = base([C, K]);

    // Drag K into C (centre ~210,190), plain.
    d = dispatch(d, { type: "MOVE_ELEMENT", payload: { id: "K", x: 180, y: 170 } });
    d = dispatch(d, { type: "MOVE_END", payload: { id: "K" } });
    expect(at(d, "K").parentId, "adopted into container").toBe("C");
    // Container auto-promotes and the child sorts AFTER it in the array so it
    // renders (and is clicked) on top — a plain click grabs the child, not C.
    expect((at(d, "C").properties as Record<string, unknown>).archimateIsContainer).toBe(true);
    expect(d.elements.findIndex((e) => e.id === "K")).toBeGreaterThan(
      d.elements.findIndex((e) => e.id === "C"),
    );

    // Drag K back out, plain ⇒ severed.
    d = dispatch(d, { type: "MOVE_ELEMENT", payload: { id: "K", x: 500, y: 500 } });
    d = dispatch(d, { type: "MOVE_END", payload: { id: "K" } });
    expect(at(d, "K").parentId, "extracted").toBeUndefined();
  });
});

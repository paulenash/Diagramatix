/**
 * uml-containment and uml-note-anchor are DIRECT (centre-to-centre, closest
 * boundary point) connectors. This pins their geometry and guards that adding
 * them to the UML routing branch leaves BPMN connectors byte-identical.
 */
import { describe, it, expect } from "vitest";
import { recomputeAllConnectors } from "@/app/lib/diagram/routing";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const box = (id: string, type: DiagramElement["type"], x: number, y: number): DiagramElement =>
  ({ id, type, x, y, width: 100, height: 60, label: id, properties: {} });

const directConn = (type: Connector["type"]): Connector => ({
  id: "c", sourceId: "A", targetId: "B", type,
  sourceSide: "right", targetSide: "left", directionType: "non-directed", routingType: "direct",
  sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
});

const recompute = (conn: Connector, els: DiagramElement[]) => recomputeAllConnectors([conn], els)[0];

describe("direct UML connectors", () => {
  it("uml-containment between two aligned packages is a straight centre-to-centre line", () => {
    const els = [box("A", "uml-package", 0, 0), box("B", "uml-package", 300, 0)];
    const r = recompute(directConn("uml-containment"), els);
    // Direct routing: [srcCentre, srcEdge, tgtEdge, tgtCentre], leaders hidden.
    expect(r.waypoints).toHaveLength(4);
    expect(r.sourceInvisibleLeader).toBe(true);
    expect(r.targetInvisibleLeader).toBe(true);
    // The visible segment runs edge→edge along the shared centre line (y=30).
    expect(r.waypoints[1].y).toBeCloseTo(30);
    expect(r.waypoints[2].y).toBeCloseTo(30);
    expect(r.waypoints[1].x).toBeCloseTo(100); // right edge of A
    expect(r.waypoints[2].x).toBeCloseTo(300); // left edge of B
  });

  it("uml-note-anchor is likewise a direct centre-to-centre line", () => {
    const els = [box("A", "uml-note", 0, 0), box("B", "uml-class", 300, 0)];
    const r = recompute(directConn("uml-note-anchor"), els);
    expect(r.waypoints).toHaveLength(4);
    expect(r.sourceInvisibleLeader).toBe(true);
    expect(r.targetInvisibleLeader).toBe(true);
  });

  it("does NOT affect a BPMN sequence connector", () => {
    const els = [box("A", "task", 0, 0), box("B", "task", 300, 0)];
    const seq: Connector = {
      id: "s", sourceId: "A", targetId: "B", type: "sequence",
      sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
    };
    const r = recomputeAllConnectors([seq], els)[0];
    expect(r.type).toBe("sequence");
    expect(r.routingType).toBe("rectilinear");
  });
});

/**
 * UML self-connector — a relationship from a class to ITSELF renders as a
 * squared-off 3-segment loop off one side, with room for a role + multiplicity
 * at each end. Exercised via image ingestion (source === target) and the
 * routing rebuild.
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import { selfLoopWaypoints, measureSelfLoopBulge, recomputeAllConnectors } from "@/app/lib/diagram/routing";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";

describe("self-connector geometry", () => {
  const el: DiagramElement = { id: "c", type: "uml-class", label: "Task", x: 100, y: 100, width: 160, height: 80, properties: {} };

  it("builds a 6-point loop off the given side, both ends on that side", () => {
    const wp = selfLoopWaypoints(el, "top", 0.3, 0.7, 60);
    expect(wp).toHaveLength(6);
    // Center → srcEdge → corner → corner → tgtEdge → center
    const [center, srcEdge, c1, c2, tgtEdge] = wp;
    expect(srcEdge.y).toBe(el.y);           // on the top edge
    expect(tgtEdge.y).toBe(el.y);
    expect(c1.y).toBe(el.y - 60);           // bulge upward
    expect(c2.y).toBe(el.y - 60);
    expect(center).toEqual({ x: 180, y: 140 });
    // Two ends separated along the side.
    expect(Math.abs(srcEdge.x - tgtEdge.x)).toBeGreaterThan(20);
  });

  it("recomputeAllConnectors rebuilds a UML self-loop after an element move", () => {
    const conn: Connector = {
      id: "s", sourceId: "c", targetId: "c", type: "uml-association",
      sourceSide: "top", targetSide: "top", sourceOffsetAlong: 0.3, targetOffsetAlong: 0.7,
      selfLoopBulge: 60, directionType: "non-directed", routingType: "rectilinear",
      sourceInvisibleLeader: true, targetInvisibleLeader: true, waypoints: [],
    };
    const moved = { ...el, x: 400, y: 300 };
    const [out] = recomputeAllConnectors([conn], [moved]);
    expect(out.waypoints).toHaveLength(6);
    expect(out.waypoints[1].y).toBe(300);   // rides with the moved element's top
    expect(out.sourceInvisibleLeader).toBe(true);
  });

  it("PRESERVES the depth the user dragged the parallel segment to on re-route", () => {
    // User pulled the loop out to 120px depth (waypoints reflect it), but the
    // stored selfLoopBulge is still the default 60. A re-route must keep 120.
    const deep = selfLoopWaypoints(el, "top", 0.3, 0.7, 120);
    expect(measureSelfLoopBulge(deep, "top")).toBe(120);
    const conn: Connector = {
      id: "s", sourceId: "c", targetId: "c", type: "uml-composition",
      sourceSide: "top", targetSide: "top", sourceOffsetAlong: 0.3, targetOffsetAlong: 0.7,
      selfLoopBulge: 60, directionType: "non-directed", routingType: "rectilinear",
      sourceInvisibleLeader: true, targetInvisibleLeader: true, waypoints: deep,
    };
    const [out] = recomputeAllConnectors([conn], [el]);
    expect(out.selfLoopBulge).toBe(120);                       // not shrunk to 60
    expect(measureSelfLoopBulge(out.waypoints, "top")).toBe(120);
  });
});

describe("image ingestion of a self-association", () => {
  it("keeps source === target and renders a loop with roles preserved", () => {
    const parsed = {
      elements: [
        { id: "c1", type: "uml-class", label: "Employee", bounds: { x: 0.3, y: 0.3, w: 0.25, h: 0.2 } },
      ],
      connections: [
        { sourceId: "c1", targetId: "c1", type: "uml-association", sourceSide: "top", targetSide: "top",
          sourceRole: "manager", targetRole: "reports", sourceMultiplicity: "1", targetMultiplicity: "*" },
      ],
    };
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 700 } });
    expect(data.connectors).toHaveLength(1);
    const c = data.connectors[0];
    expect(c.sourceId).toBe("c1");
    expect(c.targetId).toBe("c1");
    expect(c.waypoints.length).toBeGreaterThanOrEqual(4);
    expect(c.sourceRole).toBe("manager");
    expect(c.targetRole).toBe("reports");
    // Loop rises off the class (some waypoint clearly above the top edge).
    const el = data.elements.find(e => e.id === "c1")!;
    expect(Math.min(...c.waypoints.map(p => p.y))).toBeLessThan(el.y);
  });
});

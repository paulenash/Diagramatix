/**
 * Free-form / imported layout — the diagram-level `relaxedLayout` flag (T0708,
 * T0709). It lets a competitor BPMN diagram be shown exactly as drawn: pools
 * any size/placement, message flows rectilinear between non-aligned elements.
 *
 * T0708 — checkDiagram suppresses the pure-geometry rules (containment,
 *         hanging-message, element-overlap, lane-tiling …) when relaxedLayout is
 *         set, and still emits them when it isn't (regression net).
 * T0709 — recomputeAllConnectors routes a messageBPMN rectilinearly (honouring
 *         the attachment sides) when relaxedLayout is passed, instead of forcing
 *         the shared-x vertical dogleg.
 */
import { describe, it, expect } from "vitest";
import { checkDiagram, type DiagramLike } from "@/app/lib/diagram/checks/diagramChecks";
import { recomputeAllConnectors } from "@/app/lib/diagram/routing";
import type { DiagramData, Connector, DiagramElement } from "@/app/lib/diagram/types";

// Two tasks with NO x-overlap (t1 x:100-180, t2 x:400-480), joined by a message
// flow — exactly the "hanging message" / non-aligned case foreign diagrams hit.
const diagram = (): DiagramLike => ({
  elements: [
    { id: "t1", type: "task", x: 100, y: 100, width: 80, height: 50, label: "T1", properties: {} },
    { id: "t2", type: "task", x: 400, y: 300, width: 80, height: 50, label: "T2", properties: {} },
  ] as DiagramElement[],
  connectors: [
    { id: "m", type: "messageBPMN", sourceId: "t1", targetId: "t2",
      sourceSide: "bottom", targetSide: "top", directionType: "directed",
      routingType: "rectilinear", waypoints: [] } as unknown as Connector,
  ],
});

describe("relaxedLayout suppresses geometry validation (T0708)", () => {
  it("flags the non-aligned message flow normally", () => {
    const v = checkDiagram(diagram());
    expect(v.some((x) => x.rule === "hanging-message")).toBe(true);
  });

  it("does NOT flag it when relaxedLayout is set", () => {
    const v = checkDiagram({ ...diagram(), relaxedLayout: true });
    expect(v.some((x) => x.rule === "hanging-message")).toBe(false);
    // The suppressed set is geometry-only — none of the pool/message geometry
    // rules should survive.
    for (const r of ["containment", "lane-tiling", "element-overlap", "hanging-message"]) {
      expect(v.some((x) => x.rule === r)).toBe(false);
    }
  });
});

describe("relaxedLayout routes messages rectilinearly (T0709)", () => {
  const els = diagram().elements as DiagramElement[];
  const msg = diagram().connectors[0];

  it("forces a shared-x vertical dogleg when NOT relaxed", () => {
    const [c] = recomputeAllConnectors([msg], els, false);
    // messageBpmn vertical form: [startCentre, srcEdge, tgtEdge, endCentre] with
    // srcEdge.x === tgtEdge.x (the shared vertical x).
    expect(c.waypoints[1].x).toBe(c.waypoints[2].x);
  });

  it("routes rectilinearly between the two sides when relaxed", () => {
    const [c] = recomputeAllConnectors([msg], els, true);
    const srcEdge = c.waypoints[1];
    const tgtEdge = c.waypoints[c.waypoints.length - 2];
    // Attachment points are at each element's own side — NOT clamped to a
    // single shared x, so a message can connect non-aligned elements.
    expect(srcEdge.x).not.toBe(tgtEdge.x);
  });
});

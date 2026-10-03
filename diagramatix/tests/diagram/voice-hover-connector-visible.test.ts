/**
 * T5227 — hovering a connector highlights only what can be SEEN (Paul, 2026-10-04): from one attachment point to the
 * other, not the invisible leaders that run on to the centres of the two elements behind them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { connectorVisibleSegments } from "@/app/lib/mobile/voiceEdit";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: "", properties: {} }) as DiagramElement;

describe("T5227 the hover highlight stops at the attachment points", () => {
  // Task A (0–102) → Task B (300–402); the stored route: centre, edge, edge, centre (the first and last are invisible leaders).
  const data: DiagramData = {
    ...EMPTY_DIAGRAM,
    elements: [el("a", "task", 0, 0, 102, 65), el("b", "task", 300, 0, 102, 65)],
    connectors: [{
      id: "c", sourceId: "a", targetId: "b", type: "sequence", directionType: "directed", routingType: "rectilinear",
      sourceSide: "right", targetSide: "left",
      waypoints: [{ x: 51, y: 32 }, { x: 102, y: 32 }, { x: 300, y: 32 }, { x: 351, y: 32 }],
    } as unknown as Connector],
  };
  it("the visible line runs from the source's edge to the target's edge only", () => {
    const segs = connectorVisibleSegments(data.connectors[0], data);
    const xs = segs.flatMap(([p, q]) => [p.x, q.x]);
    expect(Math.min(...xs)).toBeCloseTo(102, 5);
    expect(Math.max(...xs)).toBeCloseTo(300, 5);
  });
  it("the editor hands the canvas those segments, not the whole stored route", () => {
    const editor = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
    expect(editor).toContain("connectorVisibleSegments(c, data)");
    expect(editor).not.toMatch(/c\.waypoints\.length > 1 \? c\.waypoints : null/);
    expect(readFileSync("app/components/canvas/Canvas.tsx", "utf8")).toContain("voiceTargetPath.map((line, i)");
  });
});

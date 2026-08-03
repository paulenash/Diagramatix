/**
 * A compensation Association must stay RECTILINEAR on every re-route — it must
 * never revert to the straight diagonal the generic association path rebuilds
 * (app/lib/diagram/routing.ts recomputeAllConnectors, T2221).
 */
import { describe, it, expect } from "vitest";
import { recomputeAllConnectors } from "@/app/lib/diagram/routing";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x, y, width: 120, height: 80, properties: {}, ...extra });

describe("compensation association routing", () => {
  const elements = [
    el("host", "subprocess-expanded", 100, 100, { width: 200, height: 140 }),
    el("comp", "intermediate-event", 280, 200, { width: 36, height: 36, eventType: "compensation", boundaryHostId: "host" }),
    el("handler", "task", 420, 320), // offset so a diagonal would be non-orthogonal
  ];
  // Deliberately hand it a stale "direct" routingType to prove it is corrected.
  const conn: Connector = {
    id: "c1", sourceId: "comp", targetId: "handler", type: "associationBPMN",
    directionType: "open-directed", routingType: "direct",
    sourceSide: "bottom", targetSide: "left",
    waypoints: [],
  } as unknown as Connector;

  it("forces routingType rectilinear and produces an orthogonal path", () => {
    const [out] = recomputeAllConnectors([conn], elements);
    expect(out.routingType).toBe("rectilinear");
    const wp = out.waypoints;
    expect(wp.length).toBeGreaterThanOrEqual(2);
    // Every segment must be axis-aligned (horizontal or vertical).
    for (let i = 1; i < wp.length; i++) {
      const dx = Math.abs(wp[i].x - wp[i - 1].x);
      const dy = Math.abs(wp[i].y - wp[i - 1].y);
      expect(dx < 0.5 || dy < 0.5).toBe(true);
    }
  });

  it("leaves a data-object association routing 'direct'", () => {
    const dataEls = [
      el("t", "task", 100, 100),
      el("do", "data-object", 300, 260, { width: 40, height: 50 }),
    ];
    const dataConn: Connector = {
      id: "c2", sourceId: "t", targetId: "do", type: "associationBPMN",
      directionType: "open-directed", routingType: "direct",
      sourceSide: "bottom", targetSide: "top", waypoints: [],
    } as unknown as Connector;
    const [out] = recomputeAllConnectors([dataConn], dataEls);
    // data associations keep the straight diagonal (4-point center-to-center)
    expect(out.waypoints.length).toBe(4);
  });
});

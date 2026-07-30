/**
 * ArchiMate Service ICON (stadium) — connectors attach to the REDUCED visual boundary.
 *
 * The service icon is drawn 15% shorter than the element (a flatter pill, centred), so a
 * connector must meet the stadium edge, not the full element bounds (which would leave a
 * gap above/below the pill). routing.ts snaps the attach point onto the reduced stadium.
 */
import { describe, it, expect } from "vitest";
import { computeWaypoints } from "@/app/lib/diagram/routing";
import type { DiagramElement } from "@/app/lib/diagram/types";

const el = (over: Partial<DiagramElement>): DiagramElement =>
  ({ id: "x", type: "archimate-shape", x: 0, y: 0, width: 120, height: 80, label: "", properties: {}, ...over } as DiagramElement);

describe("ArchiMate service icon attach boundary", () => {
  it("T1087 — a connector attaches to the 15%-shorter stadium, not the full bounds", () => {
    const svc = el({ id: "s", properties: { shapeKey: "business-business-service-icon", archimateIconOnly: true } });
    const other = el({ id: "o", y: 200, properties: { shapeKey: "business-business-process-box" } });
    const r = computeWaypoints(other, svc, [svc, other], "top", "bottom", "rectilinear", 0.5, 0.5);
    // Reduced stadium bottom = 0.925 * 80 = 74 (not the full-bounds bottom, 80).
    expect(r.waypoints.some((p) => Math.abs(p.y - 74) < 2), "attaches at the stadium bottom (74)").toBe(true);
    expect(r.waypoints.some((p) => Math.abs(p.y - 80) < 0.5), "does NOT attach at the full bounds bottom (80)").toBe(false);
  });
});

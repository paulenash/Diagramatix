/**
 * pickBoundaryEventSide — corner disambiguation (issue 2, 2026-07-29). When an
 * edge-mounted event sits near a host CORNER it is close to two outer edges; the
 * connector must exit the side that FACES its target, not the deterministic
 * nearest-edge, so it doesn't double back around the host.
 */
import { describe, it, expect } from "vitest";
import { pickBoundaryEventSide } from "@/app/lib/diagram/routing";
import type { DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, x: number, y: number, w = 36, h = 36, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: "intermediate-event", x, y, width: w, height: h, label: "", properties: {}, ...extra } as DiagramElement);

// Host EP occupies [x 100..500, y 100..300]. The event sits on the BOTTOM-RIGHT
// corner (centre at 500,300).
const host = el("ep", 100, 100, 400, 200, { type: "subprocess-expanded" });
const evt = el("timer", 482, 282, 36, 36, { boundaryHostId: "ep" }); // centre (500,300)

describe("pickBoundaryEventSide — corner disambiguation", () => {
  it("T1060 — a corner event whose target is to the RIGHT exits right (not bottom)", () => {
    const target = el("lapse", 700, 250, 36, 36); // to the right
    expect(pickBoundaryEventSide(evt, target, [host, evt, target])).toBe("right");
  });

  it("T1061 — a corner event whose target is BELOW exits bottom (not right)", () => {
    const target = el("lapse", 480, 600, 36, 36); // below
    expect(pickBoundaryEventSide(evt, target, [host, evt, target])).toBe("bottom");
  });

  it("T1062 — a NON-corner event (mid top edge) keeps its plain outer side", () => {
    const midTop = el("e2", 282, 82, 36, 36, { boundaryHostId: "ep" }); // centre (300,100) — mid top edge
    const target = el("t", 300, 500, 36, 36); // below, far
    // Not a corner (far from left/right edges) → outer side = top.
    expect(pickBoundaryEventSide(midTop, target, [host, midTop, target])).toBe("top");
  });
});

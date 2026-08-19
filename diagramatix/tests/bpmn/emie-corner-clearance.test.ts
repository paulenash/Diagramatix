/**
 * R7.04 / R7.05 — an edge-mounted intermediate event (EMIE) on an Expanded
 * Subprocess is kept at least ONE EVENT WIDTH clear of the EP's corners, keeps
 * its stored side (a top-mounted event never flips onto an adjacent edge at a
 * corner), and its outgoing sequence connector leaves the event's OUTWARD edge
 * cleanly — never attaching on / crossing the EP boundary (Paul 2026-08-19).
 * Its label defaults to the NORTH-WEST so the north-bound connector exit is clear.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// A wide EP with a top-mounted timer that fires OUT to an external task.
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box" },
  { id: "s", type: "start-event", label: "Start", pool: "p" },
  { id: "ep", type: "subprocess-expanded", label: "Resolve invoice query", pool: "p" },
  { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
  { id: "a", type: "task", label: "Investigate", parentSubprocess: "ep" },
  { id: "b", type: "task", label: "Contact supplier", parentSubprocess: "ep" },
  { id: "c", type: "task", label: "Confirm resolution", parentSubprocess: "ep" },
  { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
  { id: "tb", type: "intermediate-event", label: "Not cleared in 3 business days", eventType: "timer", boundaryHost: "c", boundarySide: "top" },
  { id: "esc", type: "task", label: "Escalate to Finance Controller", pool: "p" },
  { id: "e", type: "end-event", label: "Done", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" },
  { sourceId: "es", targetId: "a" }, { sourceId: "a", targetId: "b" }, { sourceId: "b", targetId: "c" }, { sourceId: "c", targetId: "ee" },
  { sourceId: "tb", targetId: "esc" },
];
const at = (out: ReturnType<typeof layoutBpmnDiagram>, id: string) => out.elements.find((e) => e.id === id)!;

describe("EMIE corner clearance + outward exit (R7.04/R7.05)", () => {
  it("T2828 — a top-mounted EMIE stays one event-width from the EP corners, labels NW, and exits its top clear of the EP", () => {
    const out = layoutBpmnDiagram(els, conns);
    const ep = at(out, "tb").boundaryHostId ? at(out, at(out, "tb").boundaryHostId!) : at(out, "ep");
    const tb = at(out, "tb");
    const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2;

    // Stayed on the TOP edge (no corner side-flip).
    expect((tb.properties as { boundarySide?: string }).boundarySide).toBe("top");
    // Centre on the top rim.
    expect(Math.abs(cy - ep.y)).toBeLessThan(2);
    // ≥ one event-width clear of BOTH corners along the edge.
    expect(cx - ep.x, "clear of left corner").toBeGreaterThanOrEqual(tb.width);
    expect(ep.x + ep.width - cx, "clear of right corner").toBeGreaterThanOrEqual(tb.width);

    // Label defaults to the NORTH-WEST (up + left) so the northbound exit is clear.
    const ox = (tb.properties as { labelOffsetX?: number }).labelOffsetX ?? 0;
    const oy = (tb.properties as { labelOffsetY?: number }).labelOffsetY ?? 7;
    expect(ox, "label west").toBeLessThan(0);
    expect(oy, "label north").toBeLessThan(0);

    // Outgoing connector exits the event's TOP, and no waypoint lands inside or
    // on the EP boundary.
    const conn = out.connectors.find((c) => c.sourceId === "tb" && c.targetId === "esc")!;
    expect(conn.sourceSide).toBe("top");
    const insideOrOnEp = (p: { x: number; y: number }) =>
      p.x >= ep.x - 1 && p.x <= ep.x + ep.width + 1 && p.y >= ep.y - 1 && p.y <= ep.y + ep.height + 1
      && p.y > ep.y + 1; // above the top rim is fine; on/below the rim inside the box is not
    expect(conn.waypoints.some(insideOrOnEp), "no waypoint inside/on the EP").toBe(false);
  });
});

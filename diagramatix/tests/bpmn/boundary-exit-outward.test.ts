/**
 * A connector from an edge-mounted (boundary) event must NEVER enter the
 * activity it is mounted on — it exits outward and routes AROUND the host, even
 * when re-routed (Paul, 2026-07-29). The host stays an obstacle for its own
 * boundary event's connector (routing.ts), so no waypoint lands strictly inside
 * the host box.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// An EP-hosted timer that lapses the loop (exits the EP) — plus a plain-task
// boundary error event that escalates elsewhere. Both connectors must stay
// outside their respective host boxes.
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box" },
  { id: "s", type: "start-event", label: "Start", pool: "p" },
  { id: "ep", type: "subprocess-expanded", label: "Do Until Done", pool: "p", repeatType: "loop" },
  { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
  { id: "w1", type: "task", label: "Await Response", parentSubprocess: "ep" },
  { id: "w2", type: "task", label: "Re-check", parentSubprocess: "ep" },
  { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
  { id: "timer", type: "intermediate-event", label: "10 days elapsed", eventType: "timer", boundaryHost: "w1", boundarySide: "top" },
  { id: "lapse", type: "end-event", label: "Lapse", pool: "p" },
  { id: "task2", type: "task", label: "Finalise", pool: "p" },
  { id: "err", type: "intermediate-event", label: "Error", eventType: "error", boundaryHost: "task2", boundarySide: "bottom" },
  { id: "handle", type: "task", label: "Handle Error", pool: "p" },
  { id: "e", type: "end-event", label: "End", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "task2" }, { sourceId: "task2", targetId: "e" },
  { sourceId: "es", targetId: "w1" }, { sourceId: "w1", targetId: "w2" }, { sourceId: "w2", targetId: "ee" },
  { sourceId: "timer", targetId: "lapse" },
  { sourceId: "err", targetId: "handle" },
];

const at = (out: ReturnType<typeof layoutBpmnDiagram>, id: string) => out.elements.find((e) => e.id === id)!;

describe("Boundary-event connectors exit outward (never into the host)", () => {
  it("T1059 — no boundary-event connector waypoint lies strictly inside its host activity", () => {
    const out = layoutBpmnDiagram(els, conns);
    const byId = new Map(out.elements.map((e) => [e.id, e]));
    const inside = (p: { x: number; y: number }, h: any) =>
      p.x > h.x + 1 && p.x < h.x + h.width - 1 && p.y > h.y + 1 && p.y < h.y + h.height - 1;
    let checked = 0;
    for (const c of out.connectors) {
      const src = byId.get(c.sourceId) as any;
      if (!src?.boundaryHostId) continue;         // only connectors leaving a boundary event
      const host = byId.get(src.boundaryHostId) as any;
      if (!host) continue;
      checked++;
      for (const wp of c.waypoints) {
        expect(inside(wp, host), `connector from "${src.label}" enters host "${host.label}" at (${Math.round(wp.x)},${Math.round(wp.y)})`).toBe(false);
      }
    }
    expect(checked, "should have checked ≥2 boundary-event connectors").toBeGreaterThanOrEqual(2);
  });
});

/**
 * EP-boundary interrupt (R8.19) + EP re-tighten (R8.20).
 *
 * A time-limit / interrupt whose host is INSIDE an Expanded Subprocess and whose
 * flow LEAVES the EP (a loop-terminating timeout) must be mounted on the EP's
 * OUTER boundary, and its End event must sit fully OUTSIDE the EP so the
 * connector between them runs entirely outside the EP (Paul, 2026-07-29). And an
 * EP must hug its rightmost real child after Start/End tightening (no dead gap).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// start → [EP: es → work → ee] → end, with a timer boundary on the INTERNAL
// task "work" that fires OUT of the EP to a process-level end event "Lapse".
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box" },
  { id: "s", type: "start-event", label: "Start", pool: "p" },
  { id: "ep", type: "subprocess-expanded", label: "Do Until Done", pool: "p", repeatType: "loop" },
  { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
  { id: "work", type: "task", label: "Await Response", parentSubprocess: "ep" },
  { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
  { id: "tb", type: "intermediate-event", label: "10 working days elapsed", eventType: "timer", boundaryHost: "work", boundarySide: "top" },
  { id: "lapse", type: "end-event", label: "Lapse Application", pool: "p" },
  { id: "e", type: "end-event", label: "Done", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" },
  { sourceId: "es", targetId: "work" }, { sourceId: "work", targetId: "ee" },
  { sourceId: "tb", targetId: "lapse" },
];

const at = (out: ReturnType<typeof layoutBpmnDiagram>, id: string) => out.elements.find((e) => e.id === id)!;

describe("EP-boundary interrupt (R8.19) + re-tighten (R8.20)", () => {
  it("T1052 — a loop-terminating timer on an internal task mounts on the EP rim; its End event is fully outside the EP", () => {
    const out = layoutBpmnDiagram(els, conns);
    const ep = at(out, "ep"), tb = at(out, "tb"), lapse = at(out, "lapse");

    // The timer re-homed onto the EP (boundaryHostId === ep.id) …
    expect(tb.boundaryHostId, "timer re-homed to the EP").toBe("ep");
    // … and its centre sits on one of the EP's four edges (on the rim, not inside).
    const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2, T = 4;
    const onRim =
      Math.abs(cy - ep.y) < T || Math.abs(cy - (ep.y + ep.height)) < T ||
      Math.abs(cx - ep.x) < T || Math.abs(cx - (ep.x + ep.width)) < T;
    expect(onRim, `timer centre (${Math.round(cx)},${Math.round(cy)}) must lie on the EP rim [x ${Math.round(ep.x)}..${Math.round(ep.x + ep.width)}, y ${Math.round(ep.y)}..${Math.round(ep.y + ep.height)}]`).toBe(true);

    // The exit End event is fully to the right of the EP (outside it).
    expect(lapse.x, `Lapse (x=${Math.round(lapse.x)}) must be right of the EP (right edge ${Math.round(ep.x + ep.width)})`).toBeGreaterThanOrEqual(ep.x + ep.width);

    // The event→End connector runs fully outside the EP (no waypoint inside).
    const conn = out.connectors.find((c) => c.sourceId === "tb" && c.targetId === "lapse")!;
    const insideEp = (p: { x: number; y: number }) =>
      p.x > ep.x + 1 && p.x < ep.x + ep.width - 1 && p.y > ep.y + 1 && p.y < ep.y + ep.height - 1;
    expect(conn.waypoints.some(insideEp), "no event→End waypoint inside the EP").toBe(false);

    // Issue 3: the terminal exit End event is placed NEAR the timer (a short
    // straight connector), not stranded far away by the column engine.
    const near = Math.hypot((lapse.x + lapse.width / 2) - cx, (lapse.y + lapse.height / 2) - cy);
    expect(near, `Lapse should sit adjacent to the timer (dist ${Math.round(near)}px)`).toBeLessThanOrEqual(120);
  });

  it("T1053 — the EP hugs its rightmost real child (no dead gap on the right)", () => {
    const out = layoutBpmnDiagram(els, conns);
    const ep = at(out, "ep");
    const kids = out.elements.filter((e) => e.parentId === "ep" && !["data-object", "data-store", "text-annotation"].includes(e.type) && !e.boundaryHostId);
    const rightmost = Math.max(...kids.map((k) => k.x + k.width));
    const gap = (ep.x + ep.width) - rightmost;
    expect(gap, `EP right gap ${Math.round(gap)}px should be ≤ ~1 pad (SIDE_PAD 30)`).toBeLessThanOrEqual(40);
    expect(gap, "EP must still enclose its rightmost child").toBeGreaterThanOrEqual(0);
  });
});

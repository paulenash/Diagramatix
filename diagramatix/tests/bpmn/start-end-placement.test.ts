/**
 * Start & End event placement + connector length — R8.14 / R8.15 / R8.18.
 *
 *   R8.14 — the process-level Start Event clears its container's INNER boundary
 *           (past the lane/pool header strip) by ≥ 1 event width.
 *   R8.15 — the first connector (Start → first element) is ≤ 70% of a task width.
 *   R8.18 — the End event hugs its last element within the same ≤ 70% gap.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const MAX = 70; // 0.7 × TASK_W(100)
const TOL = 0.5;

const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [{ id: "l", name: "L" }] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "l" },
  { id: "t1", type: "task", label: "First", pool: "p", lane: "l" },
  { id: "t2", type: "task", label: "Second", pool: "p", lane: "l" },
  { id: "e", type: "end-event", label: "E", pool: "p", lane: "l" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" },
  { sourceId: "t1", targetId: "t2" },
  { sourceId: "t2", targetId: "e" },
];
const run = () => layoutBpmnDiagram(els, conns);
const byId = (out: ReturnType<typeof run>, id: string) => out.elements.find((x) => x.id === id)!;

describe("Start/End placement + connector length", () => {
  it("T0521 — process start clears its lane inner boundary by ≥1 event width (R8.14)", () => {
    const out = run();
    const lane = byId(out, "l");
    const s = byId(out, "s");
    const headerW = (lane.properties?.laneHeaderWidth as number) || 36;
    expect(s.x, "start must clear the lane inner boundary by ≥1 event width")
      .toBeGreaterThanOrEqual(lane.x + headerW + s.width - TOL);
  });

  it("T0522 — first connector (start → first element) ≤ 70% of a task width (R8.15)", () => {
    const out = run();
    const s = byId(out, "s");
    const t1 = byId(out, "t1");
    expect(t1.x - (s.x + s.width), "start→first gap should be ≤ 70px").toBeLessThanOrEqual(MAX + TOL);
  });

  it("T0523 — End event hugs its last element ≤ 70% of a task width (R8.18)", () => {
    const out = run();
    const t2 = byId(out, "t2");
    const e = byId(out, "e");
    expect(e.x - (t2.x + t2.width), "last→end gap should be ≤ 70px").toBeLessThanOrEqual(MAX + TOL);
  });
});

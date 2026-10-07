/**
 * T5279 — Paul, 2026-10-07: "When an EP is deleted from a diagram, if it was surrounding flows that contained end events these are
 * deleted inappropriately. The contents inside the EP should be retained except for the one start event and the one end event that
 * ends the main flow and is placed to the right of all other elements."
 */
import { describe, expect, it } from "vitest";
import { planUnwrapSubprocess } from "@/app/lib/diagram/subprocessWrap";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: {}, ...extra }) as DiagramElement;
const seq = (id: string, s: string, t: string): Connector =>
  ({ id, type: "sequence", sourceId: s, targetId: t, sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "rectilinear", waypoints: [] }) as Connector;

/** EP{ start → a → gw → b → endMain  ;  gw → rej → endReject (a side flow, ends LEFT of the main end) }. */
function shape(): DiagramData {
  const els = [
    el("ep", "subprocess-expanded", 200, 40, 700, 260),
    el("s", "start-event", 220, 110, 36, 36, { parentId: "ep" }),
    el("a", "task", 290, 100, 100, 60, { parentId: "ep" }),
    el("gw", "gateway", 420, 110, 40, 40, { parentId: "ep" }),
    el("b", "task", 500, 100, 100, 60, { parentId: "ep" }),
    el("endMain", "end-event", 830, 110, 36, 36, { parentId: "ep" }),
    el("rej", "task", 500, 200, 100, 60, { parentId: "ep" }),
    el("endReject", "end-event", 640, 212, 36, 36, { parentId: "ep" }),
  ];
  const cs = [seq("c1", "s", "a"), seq("c2", "a", "gw"), seq("c3", "gw", "b"), seq("c4", "b", "endMain"), seq("c5", "gw", "rej"), seq("c6", "rej", "endReject")];
  return { ...EMPTY_DIAGRAM, elements: els, connectors: cs } as DiagramData;
}

describe("T5279 deleting an EP keeps the End Events of its side flows", () => {
  it("only the Start and the rightmost (main-flow) End go; the rejection End, its task and its flows stay", () => {
    const plan = planUnwrapSubprocess(shape(), "ep");
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(plan.elements.map((e) => e.id).sort()).toEqual(["a", "b", "endReject", "gw", "rej"]);
    const flows = plan.connectors.map((c) => c.id).sort();
    expect(flows).toEqual(["c2", "c3", "c5", "c6"]);
    expect(plan.elements.every((e) => !e.parentId)).toBe(true);
  });
  it("a diagram with several Starts keeps all but the leftmost", () => {
    const d = shape();
    d.elements.push(el("s2", "start-event", 220, 220, 36, 36, { parentId: "ep" }));
    d.connectors.push(seq("c7", "s2", "rej"));
    const plan = planUnwrapSubprocess(d, "ep");
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.elements.map((e) => e.id)).toContain("s2");
    expect(plan.elements.map((e) => e.id)).not.toContain("s");
  });
});

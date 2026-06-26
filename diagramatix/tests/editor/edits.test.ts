/**
 * Editor edits — Alignment / Insert Space / Pool-Lane characterisation.
 *
 * Each drives the real reducer and checks (a) the action's own correctness and
 * (b) findRoutingViolations stays clean — so we get a picture of which edit
 * surfaces routing breakage.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData } from "@/app/lib/diagram/types";
import { findRoutingViolations } from "./_helpers/routing";

const build = (e: AiElement[], c: AiConnection[]) => layoutBpmnDiagram(e, c);
const dispatch = (s: DiagramData, a: Action) => reducer(s, a);
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

const LINEAR = {
  elements: [
    { id: "s", type: "start-event", label: "S" },
    { id: "a", type: "task", label: "A" },
    { id: "b", type: "task", label: "B" },
    { id: "c", type: "task", label: "C" },
    { id: "e", type: "end-event", label: "E" },
  ] as AiElement[],
  connections: [
    { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "b" },
    { sourceId: "b", targetId: "c" }, { sourceId: "c", targetId: "e" },
  ] as AiConnection[],
};

const POOL = {
  elements: [
    { id: "p", type: "pool", label: "Order", poolType: "white-box", lanes: [{ id: "l1", name: "Sales" }, { id: "l2", name: "Ops" }] },
    { id: "s", type: "start-event", label: "S", pool: "p", lane: "l1" },
    { id: "t1", type: "task", label: "Take order", pool: "p", lane: "l1" },
    { id: "t2", type: "task", label: "Fulfil", pool: "p", lane: "l2" },
    { id: "e", type: "end-event", label: "E", pool: "p", lane: "l2" },
  ] as AiElement[],
  connections: [
    { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" }, { sourceId: "t2", targetId: "e" },
  ] as AiConnection[],
};

describe("editor edits — alignment", () => {
  it("align top makes the selection share a top edge and keeps routing clean", () => {
    let d = build(LINEAR.elements, LINEAR.connections);
    d = dispatch(d, { type: "MOVE_ELEMENT", payload: { id: "b", x: at(d, "b").x, y: 40 } });
    d = dispatch(d, { type: "MOVE_ELEMENT", payload: { id: "c", x: at(d, "c").x, y: 300 } });
    d = dispatch(d, { type: "ALIGN_ELEMENTS", payload: { ids: ["a", "b", "c"], mode: "top" } });
    expect(new Set(["a", "b", "c"].map((id) => Math.round(at(d, id).y))).size, "aligned tops differ").toBe(1);
    const v = findRoutingViolations(d);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });

  it("smart align keeps routing clean", () => {
    let d = build(LINEAR.elements, LINEAR.connections);
    d = dispatch(d, { type: "MOVE_ELEMENT", payload: { id: "b", x: at(d, "b").x + 10, y: 60 } });
    d = dispatch(d, { type: "ALIGN_ELEMENTS", payload: { ids: ["a", "b", "c"], mode: "smart" } });
    const v = findRoutingViolations(d);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });
});

describe("editor edits — insert space", () => {
  it("inserting horizontal space shifts only the elements past the marker, routing clean", () => {
    const d0 = build(LINEAR.elements, LINEAR.connections);
    const markerX = (at(d0, "b").x + at(d0, "c").x) / 2;
    const dx = 160;
    const beforeX = Object.fromEntries(d0.elements.map((e) => [e.id, e.x]));
    const d = dispatch(d0, { type: "INSERT_SPACE", payload: { markerX, markerY: 0, dx, dy: 0 } });
    // elements left of the marker stay; right of it shift by ~dx
    expect(Math.round(at(d, "a").x), "left-of-marker element moved").toBe(Math.round(beforeX["a"]));
    expect(at(d, "c").x, "right-of-marker element should shift right").toBeGreaterThan(beforeX["c"] + dx - 1);
    const v = findRoutingViolations(d);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });
});

describe("editor edits — pool / lane", () => {
  it("adding a lane grows the pool's lane set, routing clean", () => {
    const d0 = build(POOL.elements, POOL.connections);
    const lanes0 = d0.elements.filter((e) => e.type === "lane").length;
    const d = dispatch(d0, { type: "ADD_LANE", payload: { poolId: "p" } });
    expect(d.elements.filter((e) => e.type === "lane").length, "lane count should grow").toBe(lanes0 + 1);
    const v = findRoutingViolations(d);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });

  it("swapping two lanes keeps children with their lane and routing clean", () => {
    const d0 = build(POOL.elements, POOL.connections);
    const l1y0 = at(d0, "l1").y, l2y0 = at(d0, "l2").y;
    const d = dispatch(d0, { type: "SWAP_LANES_VERTICAL", payload: { laneId: "l2", direction: "up" } });
    // lanes swapped Y
    expect(at(d, "l1").y, "lane Y should swap").toBeGreaterThan(l1y0 - 1);
    expect(at(d, "l2").y, "lane Y should swap").toBeLessThan(l2y0 + 1);
    const v = findRoutingViolations(d);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });
});

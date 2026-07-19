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

  it("T0914 — two adjacent SUB-LANES (nested divisions) can be swapped", () => {
    // Sub-lanes are nested `lane` elements (parent is a lane). Create two under
    // l1, then swap them — the generalised reducer must handle any level.
    let d = build(POOL.elements, POOL.connections);
    d = dispatch(d, { type: "ADD_SUBLANE", payload: { laneId: "l1" } });
    d = dispatch(d, { type: "ADD_SUBLANE", payload: { laneId: "l1" } });
    const subs = d.elements.filter((e) => e.type === "lane" && e.parentId === "l1").sort((a, b) => a.y - b.y);
    expect(subs.length, "should have created sub-lanes under l1").toBeGreaterThanOrEqual(2);

    const [top, bottom] = subs;
    const topY0 = top.y, bottomY0 = bottom.y;
    d = dispatch(d, { type: "SWAP_LANES_VERTICAL", payload: { laneId: bottom.id, direction: "up" } });

    // The two sub-lanes exchanged vertical position.
    expect(at(d, bottom.id).y, "lower sub-lane moved up").toBeLessThan(bottomY0);
    expect(at(d, top.id).y, "upper sub-lane moved down").toBeGreaterThan(topY0 - 1);
    // Routing stays clean.
    const v = findRoutingViolations(d);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });

  it("T0915 — a gateway's top/bottom branches flip when the lanes they point into are swapped", () => {
    // Decision gateway G (a pool child) branches TOP into the upper lane and
    // BOTTOM into the lower lane. Swapping the lanes must re-anchor the branches
    // (top↔bottom) — the "gateway top/middle/bottom" rule, driven by the swap
    // sets (so it fires the same for lanes and sub-lanes).
    const d0: DiagramData = {
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [
        { id: "P", type: "pool", x: 0, y: 0, width: 520, height: 200, label: "P", properties: {} },
        { id: "U", type: "lane", parentId: "P", x: 40, y: 0, width: 480, height: 100, label: "Upper", properties: {} },
        { id: "L", type: "lane", parentId: "P", x: 40, y: 100, width: 480, height: 100, label: "Lower", properties: {} },
        { id: "eU", type: "task", parentId: "U", x: 320, y: 25, width: 90, height: 50, label: "Up", properties: {} },
        { id: "eL", type: "task", parentId: "L", x: 320, y: 125, width: 90, height: 50, label: "Low", properties: {} },
        { id: "G", type: "gateway", parentId: "P", x: 160, y: 90, width: 40, height: 40, label: "?", properties: {} },
      ],
      connectors: [
        { id: "cUp", sourceId: "G", targetId: "eU", sourceSide: "top", targetSide: "left", type: "sequence", directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [{ x: 180, y: 90 }, { x: 365, y: 50 }] },
        { id: "cDn", sourceId: "G", targetId: "eL", sourceSide: "bottom", targetSide: "left", type: "sequence", directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [{ x: 180, y: 130 }, { x: 365, y: 150 }] },
      ],
    };
    const d = dispatch(d0, { type: "SWAP_LANES_VERTICAL", payload: { laneId: "L", direction: "up" } });
    const cUp = d.connectors.find((c) => c.id === "cUp")!;
    const cDn = d.connectors.find((c) => c.id === "cDn")!;
    // The branch that pointed UP now leaves the gateway's BOTTOM (its target lane
    // is now below), and vice-versa.
    expect(cUp.sourceSide, "up-branch re-anchors to bottom").toBe("bottom");
    expect(cDn.sourceSide, "down-branch re-anchors to top").toBe("top");
  });
});

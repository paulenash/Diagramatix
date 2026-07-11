/**
 * Single-lane BPMN pools (T0704) — a pool with exactly one lane is now a
 * first-class, stable state. This pins the reducer behaviour:
 *   • dropping the Pool/Lane palette item on an EMPTY pool adds ONE lane;
 *   • on a single-lane pool the drop is a clean 3-zone — top → lane above,
 *     middle → split into two sublanes, bottom → lane below;
 *   • deleting one of two lanes keeps the last lane in the pool (no dissolve);
 *     a further delete removes it (empty pool);
 *   • a lone SUBLANE still dissolves into its lane (unchanged).
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const dispatch = (s: DiagramData, a: Action) => reducer(s, a);
const lanesOf = (d: DiagramData, parentId: string) =>
  d.elements.filter((e) => e.type === "lane" && e.parentId === parentId);
const el = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

const pool = (id: string, x: number, y: number, w: number, h: number): DiagramElement =>
  ({ id, type: "pool", x, y, width: w, height: h, label: "Pool", properties: { poolType: "white-box" } } as DiagramElement);
const lane = (id: string, parentId: string, x: number, y: number, w: number, h: number): DiagramElement =>
  ({ id, type: "lane", x, y, width: w, height: h, label: id, properties: {}, parentId } as DiagramElement);

const wrap = (elements: DiagramElement[]): DiagramData =>
  ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as DiagramData);

// Pool at (100,100) 800×300; a single lane fills its body (x offset = header 36).
const singleLane = () => wrap([pool("p", 100, 100, 800, 300), lane("l", "p", 136, 100, 764, 300)]);
const drop = (y: number): Action => ({ type: "ADD_ELEMENT", payload: { symbolType: "pool", position: { x: 500, y } } });

describe("single-lane pool — creation + insertion (T0704)", () => {
  it("dropping Pool/Lane on an EMPTY pool adds exactly ONE lane filling the body", () => {
    const d = dispatch(wrap([pool("p", 100, 100, 800, 300)]), drop(250));
    const lanes = lanesOf(d, "p");
    expect(lanes).toHaveLength(1);
    expect(Math.round(lanes[0].height)).toBe(300); // fills the pool body
  });

  it("single-lane pool: top third → new lane ABOVE (original shifts down)", () => {
    const d = dispatch(singleLane(), drop(150)); // top third of 100..400
    expect(lanesOf(d, "p")).toHaveLength(2);
    expect(el(d, "l").y, "original lane should be pushed down by the lane inserted above").toBeGreaterThan(100);
  });

  it("single-lane pool: bottom third → new lane BELOW (original stays at top)", () => {
    const d = dispatch(singleLane(), drop(350)); // bottom third
    const lanes = lanesOf(d, "p");
    expect(lanes).toHaveLength(2);
    expect(el(d, "l").y, "original lane should stay at the pool top").toBe(100);
    expect(Math.max(...lanes.map((l) => l.y)), "the new lane sits below the original").toBeGreaterThan(100);
  });

  it("single-lane pool: middle third → SPLIT the lane into two sublanes", () => {
    const d = dispatch(singleLane(), drop(250)); // middle third
    expect(lanesOf(d, "p"), "still one top-level lane").toHaveLength(1);
    expect(lanesOf(d, "l"), "the lane now has two sublanes").toHaveLength(2);
  });
});

describe("single-lane pool — deletion keeps the last lane (T0704)", () => {
  const twoLanes = () =>
    wrap([pool("p", 100, 100, 800, 300), lane("l1", "p", 136, 100, 764, 150), lane("l2", "p", 136, 250, 764, 150)]);

  it("deleting one of two lanes leaves a SINGLE lane in the pool; a further delete empties it", () => {
    let d = dispatch(twoLanes(), { type: "DELETE_ELEMENT", payload: { id: "l1" } });
    const after1 = lanesOf(d, "p");
    expect(after1, "the pool keeps its last lane — not dissolved").toHaveLength(1);

    d = dispatch(d, { type: "DELETE_ELEMENT", payload: { id: after1[0].id } });
    expect(lanesOf(d, "p"), "a further delete removes the last lane → empty pool").toHaveLength(0);
    expect(el(d, "p"), "the pool itself remains").toBeTruthy();
  });

  it("a lone SUBLANE still dissolves into its lane (unchanged behaviour)", () => {
    const withSubs = wrap([
      pool("p", 100, 100, 800, 300), lane("l", "p", 136, 100, 764, 300),
      lane("s1", "l", 172, 100, 728, 150), lane("s2", "l", 172, 250, 728, 150),
    ]);
    const d = dispatch(withSubs, { type: "DELETE_ELEMENT", payload: { id: "s1" } });
    expect(lanesOf(d, "l"), "the lone remaining sublane dissolves into its lane").toHaveLength(0);
    expect(el(d, "l"), "the lane itself remains").toBeTruthy();
  });
});

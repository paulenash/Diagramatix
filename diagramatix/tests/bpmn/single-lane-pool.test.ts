/**
 * Single-lane BPMN pools (T0704) — a pool with exactly one lane is now a
 * first-class, stable state. This pins the reducer behaviour:
 *   • dropping the Pool/Lane palette item on an EMPTY pool adds ONE lane;
 *   • on a single-lane pool the drop ALWAYS just adds a second lane, within
 *     the pool — revised 2026-09-22 (Paul: "Dragging the Pool/Lane symbol
 *     onto a Pool with one single Lane should always just add a second Lane
 *     to the Pool" … "Never grow the Pool with these Lane and Sublane
 *     additions"). It was a 3-zone drop: top → lane above, middle → split
 *     into two sublanes, bottom → lane below, each growing the pool.
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

  // Wherever it lands — top, middle or bottom third — the drop adds a second
  // lane below the first, carved out of it; the pool keeps its size.
  for (const [where, y] of [["top third", 150], ["middle third", 250], ["bottom third", 350]] as const) {
    it(`single-lane pool: ${where} → a second lane, within the pool`, () => {
      const d = dispatch(singleLane(), drop(y));
      const lanes = lanesOf(d, "p");
      expect(lanes).toHaveLength(2);
      expect(lanesOf(d, "l"), "no sublanes").toHaveLength(0);
      expect(el(d, "l").y, "the original lane stays at the pool top").toBe(100);
      expect(el(d, "p").y).toBe(100);
      expect(el(d, "p").height, "the pool does not grow").toBe(300);
      const bottom = Math.max(...lanes.map((l) => l.y + l.height));
      expect(bottom, "the lanes fill the pool exactly").toBe(400);
    });
  }
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

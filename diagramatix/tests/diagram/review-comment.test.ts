/**
 * Review Comment overhaul (items 11/14/15): collapse-to-icon (1/3 size, stashing
 * the expanded size) and bring-to-front z-ordering. A review-comment-link tether
 * must survive a collapse.
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData } from "@/app/lib/diagram/types";

const base = (): DiagramData => ({ elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } });
const addRc = (id: string, x = 100): Action => ({
  type: "ADD_ELEMENT",
  payload: { symbolType: "review-comment", position: { x, y: 100 }, id, initial: { width: 227, height: 144 } },
});
const addTask = (id: string): Action => ({
  type: "ADD_ELEMENT",
  payload: { symbolType: "task", position: { x: 500, y: 100 }, id },
});
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id);

describe("review comment", () => {
  it("collapses to a 1/3 icon (stashing the expanded size) and expands back", () => {
    let d = base();
    d = reducer(d, addRc("r1"));
    expect(at(d, "r1")?.width).toBe(227);
    expect(at(d, "r1")?.height).toBe(144);

    d = reducer(d, { type: "TOGGLE_REVIEW_COLLAPSE", payload: "r1" });
    const c = at(d, "r1")!;
    expect(c.properties.collapsed).toBe(true);
    expect(c.width).toBe(38);
    expect(c.height).toBe(32);
    expect(c.properties.expandedWidth).toBe(227);
    expect(c.properties.expandedHeight).toBe(144);

    d = reducer(d, { type: "TOGGLE_REVIEW_COLLAPSE", payload: "r1" });
    const e = at(d, "r1")!;
    expect(e.properties.collapsed).toBeUndefined();
    expect(e.width).toBe(227);
    expect(e.height).toBe(144);
  });

  it("remembers expanded + collapsed positions across toggles (item E)", () => {
    const move = (id: string, x: number, y: number): Action => ({ type: "MOVE_ELEMENT", payload: { id, x, y, unconstrained: true } });
    const pos = (d: DiagramData) => { const e = at(d, "r1")!; return { x: e.x, y: e.y }; };
    let d = base();
    d = reducer(d, addRc("r1"));
    const exp0 = pos(d); // expanded position

    d = reducer(d, { type: "TOGGLE_REVIEW_COLLAPSE", payload: "r1" }); // collapse (stays at exp0)
    d = reducer(d, move("r1", 400, 420));
    const colA = pos(d); // where the collapsed icon was left

    d = reducer(d, { type: "TOGGLE_REVIEW_COLLAPSE", payload: "r1" }); // expand → back to exp0
    expect(pos(d)).toEqual(exp0);
    expect(at(d, "r1")).toMatchObject({ width: 227, height: 144 });

    d = reducer(d, move("r1", 250, 260));
    const expB = pos(d); // new expanded position

    d = reducer(d, { type: "TOGGLE_REVIEW_COLLAPSE", payload: "r1" }); // collapse → back to colA
    expect(pos(d)).toEqual(colA);
    expect(at(d, "r1")).toMatchObject({ width: 38, height: 32 });

    d = reducer(d, { type: "TOGGLE_REVIEW_COLLAPSE", payload: "r1" }); // expand → back to expB
    expect(pos(d)).toEqual(expB);
  });

  it("brings a review comment to the front (end of the elements array)", () => {
    let d = base();
    d = reducer(d, addRc("r1"));
    d = reducer(d, addRc("r2", 200));
    d = reducer(d, addRc("r3", 300));
    expect(d.elements.map((e) => e.id)).toEqual(["r1", "r2", "r3"]);
    d = reducer(d, { type: "BRING_REVIEW_TO_FRONT", payload: "r1" });
    expect(d.elements.map((e) => e.id)).toEqual(["r2", "r3", "r1"]);
    // A no-op when already last.
    d = reducer(d, { type: "BRING_REVIEW_TO_FRONT", payload: "r1" });
    expect(d.elements.map((e) => e.id)).toEqual(["r2", "r3", "r1"]);
  });

  it("keeps the review-comment-link tether after a collapse", () => {
    let d = base();
    d = reducer(d, addRc("r1"));
    d = reducer(d, addTask("t1"));
    d = reducer(d, {
      type: "ADD_CONNECTOR",
      payload: { sourceId: "r1", targetId: "t1", type: "review-comment-link", directionType: "non-directed", routingType: "direct", sourceSide: "right", targetSide: "left" },
    });
    const link = d.connectors.find((c) => c.type === "review-comment-link");
    expect(link).toBeTruthy();
    d = reducer(d, { type: "TOGGLE_REVIEW_COLLAPSE", payload: "r1" });
    // The tether still exists and still points at the (now smaller) note.
    const link2 = d.connectors.find((c) => c.type === "review-comment-link");
    expect(link2).toBeTruthy();
    expect(link2!.sourceId === "r1" || link2!.targetId === "r1").toBe(true);
  });
});

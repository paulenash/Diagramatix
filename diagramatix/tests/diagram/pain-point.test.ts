/**
 * Pain Point auto-numbering, first-add display flag, and renumber-on-delete.
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData } from "@/app/lib/diagram/types";

const base = (): DiagramData => ({ elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } });

const addPain = (id: string): Action => ({
  type: "ADD_ELEMENT",
  payload: { symbolType: "uml-pain-point", position: { x: 100, y: 100 }, id },
});
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id);

describe("pain point numbering", () => {
  it("auto-numbers pain points 1, 2, 3 on creation", () => {
    let d = base();
    d = reducer(d, addPain("p1"));
    d = reducer(d, addPain("p2"));
    d = reducer(d, addPain("p3"));
    expect(at(d, "p1")?.label).toBe("1");
    expect(at(d, "p2")?.label).toBe("2");
    expect(at(d, "p3")?.label).toBe("3");
  });

  it("auto-enables description display when the FIRST pain point is added", () => {
    let d = base();
    expect(d.showPainPointDescriptions).toBeFalsy();
    d = reducer(d, addPain("p1"));
    expect(d.showPainPointDescriptions).toBe(true);
  });

  it("renumbers the rest when a pain point is deleted (closes the gap)", () => {
    let d = base();
    d = reducer(d, addPain("p1"));
    d = reducer(d, addPain("p2"));
    d = reducer(d, addPain("p3"));
    d = reducer(d, { type: "DELETE_ELEMENT", payload: { id: "p2" } });
    expect(at(d, "p1")?.label).toBe("1");
    expect(at(d, "p3")?.label).toBe("2"); // was 3, now 2
    expect(d.elements.filter((e) => e.type === "uml-pain-point")).toHaveLength(2);
  });

  it("preserves each pain point's description across a renumber", () => {
    let d = base();
    d = reducer(d, addPain("p1"));
    d = reducer(d, addPain("p2"));
    d = reducer(d, { type: "UPDATE_PROPERTIES", payload: { id: "p2", properties: { description: "slow step" } } });
    d = reducer(d, { type: "DELETE_ELEMENT", payload: { id: "p1" } });
    const p2 = at(d, "p2");
    expect(p2?.label).toBe("1"); // renumbered
    expect(p2?.properties.description).toBe("slow step"); // description intact
  });
});

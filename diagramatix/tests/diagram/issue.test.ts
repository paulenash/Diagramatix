/**
 * Issue (dark-green Pain Point twin) auto-numbering, first-add display flag,
 * renumber-on-delete, and INDEPENDENCE from Pain Point numbering.
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData } from "@/app/lib/diagram/types";

const base = (): DiagramData => ({ elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } });

const addIssue = (id: string): Action => ({
  type: "ADD_ELEMENT",
  payload: { symbolType: "uml-issue", position: { x: 100, y: 100 }, id },
});
const addPain = (id: string): Action => ({
  type: "ADD_ELEMENT",
  payload: { symbolType: "uml-pain-point", position: { x: 200, y: 200 }, id },
});
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id);

describe("issue numbering", () => {
  it("auto-numbers issues 1, 2, 3 on creation", () => {
    let d = base();
    d = reducer(d, addIssue("i1"));
    d = reducer(d, addIssue("i2"));
    d = reducer(d, addIssue("i3"));
    expect(at(d, "i1")?.label).toBe("1");
    expect(at(d, "i2")?.label).toBe("2");
    expect(at(d, "i3")?.label).toBe("3");
  });

  it("auto-enables description display when the FIRST issue is added", () => {
    let d = base();
    expect(d.showIssueDescriptions).toBeFalsy();
    d = reducer(d, addIssue("i1"));
    expect(d.showIssueDescriptions).toBe(true);
  });

  it("renumbers the rest when an issue is deleted (closes the gap)", () => {
    let d = base();
    d = reducer(d, addIssue("i1"));
    d = reducer(d, addIssue("i2"));
    d = reducer(d, addIssue("i3"));
    d = reducer(d, { type: "DELETE_ELEMENT", payload: { id: "i2" } });
    expect(at(d, "i1")?.label).toBe("1");
    expect(at(d, "i3")?.label).toBe("2"); // was 3, now 2
    expect(d.elements.filter((e) => e.type === "uml-issue")).toHaveLength(2);
  });

  it("a dropped marker sticks to the shape it's over and follows it when it moves", () => {
    let d = base();
    d = reducer(d, { type: "ADD_ELEMENT", payload: { symbolType: "uml-class", position: { x: 300, y: 300 }, id: "c1" } });
    const c1 = at(d, "c1")!;
    // Drop an issue centred on the class → overlaps → sticks on DROP.
    d = reducer(d, { type: "ADD_ELEMENT", payload: { symbolType: "uml-issue", position: { x: c1.x + c1.width / 2, y: c1.y + c1.height / 2 }, id: "i1" } });
    expect(at(d, "i1")?.parentId).toBe("c1");

    // Moving the class carries the marker by the same delta.
    const cBefore = at(d, "c1")!, iBefore = at(d, "i1")!;
    d = reducer(d, { type: "MOVE_ELEMENT", payload: { id: "c1", x: cBefore.x + 120, y: cBefore.y + 70, unconstrained: true } });
    const cAfter = at(d, "c1")!, iAfter = at(d, "i1")!;
    expect(iAfter.x).toBe(iBefore.x + (cAfter.x - cBefore.x));
    expect(iAfter.y).toBe(iBefore.y + (cAfter.y - cBefore.y));
  });

  it("numbers issues and pain points INDEPENDENTLY (each its own 1..N)", () => {
    let d = base();
    d = reducer(d, addIssue("i1"));
    d = reducer(d, addPain("p1"));
    d = reducer(d, addIssue("i2"));
    d = reducer(d, addPain("p2"));
    expect(at(d, "i1")?.label).toBe("1");
    expect(at(d, "i2")?.label).toBe("2");
    expect(at(d, "p1")?.label).toBe("1");
    expect(at(d, "p2")?.label).toBe("2");
    // deleting an issue renumbers only issues, not pain points
    d = reducer(d, { type: "DELETE_ELEMENT", payload: { id: "i1" } });
    expect(at(d, "i2")?.label).toBe("1");
    expect(at(d, "p1")?.label).toBe("1");
    expect(at(d, "p2")?.label).toBe("2");
  });
});

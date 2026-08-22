import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import { checkParentage } from "@/app/lib/diagram/checks/diagramChecks";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * T2853 — container ownership is re-derived from geometry on every structural
 * change (lane add / split / divider drag / delete, and the commit point of a
 * resize or move), across the full nesting chain: expanded sub-process (nested
 * innermost-first) → lane → pool.
 *
 * T2854 — the "parentage" scan rule (B47) reports an element whose declared
 * owner is not the container it actually sits in. `containment` asks whether the
 * declared parent encloses the child; this asks whether that parent is the RIGHT
 * one, which is what stale ownership looks like.
 */
const el = (id: string, type: string, parentId: string | undefined, x: number, y: number, w: number, h: number) =>
  ({ id, type, parentId, x, y, width: w, height: h, label: id, properties: {} } as never);

const data = (elements: unknown[]): DiagramData =>
  ({ viewport: { x: 0, y: 0, zoom: 1 }, elements, connectors: [] } as unknown as DiagramData);

const parentOf = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!.parentId;
/** Any action in the reconcile set re-derives ownership; RESIZE_END is the
 *  commit point of a drag and changes no state of its own. */
const commit = (d: DiagramData, id: string) => reducer(d, { type: "RESIZE_END", payload: { id } } as Action);

// pool > lane > OUTER ep > INNER ep
const nested = (taskParent: string, tx: number, ty: number) => data([
  el("P", "pool", undefined, 0, 0, 1000, 500),
  el("L", "lane", "P", 40, 0, 960, 500),
  el("OUT", "subprocess-expanded", "L", 100, 50, 700, 400),
  el("IN", "subprocess-expanded", "OUT", 200, 100, 300, 200),
  el("t", "task", taskParent, tx, ty, 60, 40),
]);

describe("container ownership is re-derived from geometry", () => {
  it("keeps a child of the INNER nested EP where it is", () => {
    expect(parentOf(commit(nested("IN", 250, 150), "L"), "t")).toBe("IN");
  });

  it("releases a child that no longer sits in its EP to the enclosing OUTER EP", () => {
    // Nested EPs: the released child belongs to the outer sub-process it is
    // still inside — not the lane behind them both.
    expect(parentOf(commit(nested("IN", 600, 350), "L"), "t")).toBe("OUT");
  });

  it("releases to the lane when it is outside every EP", () => {
    expect(parentOf(commit(nested("IN", 850, 460), "L"), "t")).toBe("L");
  });

  it("falls back to the pool when no lane contains it", () => {
    const d = nested("IN", 850, 460);
    const shrunk = data(d.elements.map((e) => (e.id === "L" ? { ...e, height: 100 } : e)));
    expect(parentOf(commit(shrunk, "L"), "t")).toBe("P");
  });

  it("adopts ORPHANS — what a lane/pool cascade delete leaves behind", () => {
    // Deleting the only lane of a pool orphans its contents (parentId cleared).
    // Adding a lane must take them back, or they are stranded permanently.
    const orphaned = data([
      el("P", "pool", undefined, 0, 0, 800, 200),
      el("task", "task", undefined, 200, 20, 90, 50),
      el("end", "end-event", undefined, 600, 30, 40, 40),
    ]);
    const withLane = reducer(orphaned, { type: "ADD_LANE", payload: { poolId: "P" } } as Action);
    const lane = withLane.elements.find((e) => e.type === "lane")!;
    expect(parentOf(withLane, "task"), "task adopted").toBe(lane.id);
    expect(parentOf(withLane, "end"), "END EVENT adopted (not only activities)").toBe(lane.id);
  });

  it("an EP whose lane was deleted falls back to the pool, not to no owner", () => {
    const d = data([
      el("P", "pool", undefined, 0, 0, 800, 400),
      el("L", "lane", "P", 40, 0, 760, 400),
      el("ep", "subprocess-expanded", "L", 100, 100, 300, 150),
      el("kid", "task", "ep", 150, 130, 60, 40),
    ]);
    const after = reducer(d, { type: "DELETE_ELEMENT", payload: { id: "L" } } as Action);
    expect(parentOf(after, "ep"), "EP re-homed to the pool").toBe("P");
    expect(parentOf(after, "kid"), "its child stays with the EP").toBe("ep");
  });
});

describe("B47 parentage scan rule", () => {
  it("reports an element owned by the pool while sitting inside a lane", () => {
    const d = data([
      el("P", "pool", undefined, 0, 0, 800, 200),
      el("L", "lane", "P", 40, 0, 760, 200),
      el("end", "end-event", "P", 600, 80, 40, 40), // inside L, owned by P
    ]);
    const v = checkParentage(d as never);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("parentage");
    expect(v[0].message).toContain('sits inside lane "L"');
    expect(v[0].message).toContain('owned by pool "P"');
  });

  it("reports a child left on the OUTER EP when an inner one encloses it", () => {
    const v = checkParentage(nested("OUT", 250, 150) as never);
    expect(v.map((x) => x.message)).toContain('"t" sits inside subprocess-expanded "IN" but is owned by subprocess-expanded "OUT"');
  });

  it("leaves elements owned by a container it does not model (group / system-boundary / package)", () => {
    // Found by scanning the real example catalogues: chevrons owned by a group
    // and use-cases owned by a system boundary were being reported as "should
    // have no owner", which would have stripped a real relationship.
    for (const holder of ["group", "system-boundary", "uml-package", "composite-state", "subprocess"]) {
      const d = data([
        el("P", "pool", undefined, 0, 0, 800, 300),
        el("L", "lane", "P", 40, 0, 760, 300),
        el("g1", holder, "L", 100, 50, 400, 200),
        el("kid", "use-case", "g1", 150, 100, 80, 50), // inside g1, which is inside L
      ]);
      expect(checkParentage(d as never), `${holder}-owned child must be left alone`).toEqual([]);
    }
  });

  it("leaves free-floating annotations unowned", () => {
    const d = data([
      el("P", "pool", undefined, 0, 0, 800, 200),
      el("L", "lane", "P", 40, 0, 760, 200),
      el("note", "text-annotation", undefined, 300, 80, 120, 40), // sits over the lane, deliberately unowned
    ]);
    expect(checkParentage(d as never)).toEqual([]);
  });

  it("passes a correctly-owned diagram, and ignores boundary events", () => {
    const clean = data([
      el("P", "pool", undefined, 0, 0, 600, 200),
      el("L", "lane", "P", 40, 0, 560, 200),
      el("t", "task", "L", 200, 60, 90, 50),
      // A boundary event is owned by its host, wherever it is drawn.
      { ...(el("b", "intermediate-event", "L", 260, 100, 30, 30) as Record<string, unknown>), boundaryHostId: "t" },
    ]);
    expect(checkParentage(clean as never)).toEqual([]);
  });
});

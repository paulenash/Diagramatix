/**
 * Paul, 2026-09-17: "Finish the Wrap command for pools and lanes."
 *
 * M2 shipped only its expanded-subprocess half. The pool and lane variants are
 * a much smaller job — neither is a flow element, so nothing is re-pointed and
 * there is no Start or End — but each carries a rule the subprocess does not:
 *
 *   POOL  A sequence flow may not cross a pool boundary. A selection with a
 *         flow to anything outside it therefore cannot become a pool without
 *         changing what those flows mean, so it is refused and the offending
 *         elements are named rather than silently converted to message flows.
 *         Nested pools are refused for the same reason: they are not legal.
 *
 *   LANE  A lane is a full-width band inside a pool, not a box drawn around the
 *         selection. So the selection must already live in one pool, and
 *         anything unselected that merely shares its vertical extent would be
 *         swept in — which is refused by name, the same guard the subprocess
 *         wrap uses for its own area.
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { validateOps } from "@/app/lib/assist/ops";
import { planWrapInContainer, type Shape } from "@/app/lib/diagram/subprocessWrap";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (id: string, type: string, label: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x, y, width: w, height: h, properties: {}, ...extra });
const flow = (id: string, sourceId: string, targetId: string): Connector =>
  ({ id, sourceId, targetId, sourceSide: "right", targetSide: "left", type: "sequence", directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [], sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5 } as Connector);
const ids = { containerId: "new1" };
const ok = (p: ReturnType<typeof planWrapInContainer>) => { if ("error" in p) throw new Error(p.error); return p; };

/** Loose elements, no pool: A → B → C, plus an unrelated D. */
const loose = (): Shape => ({
  elements: [
    el("A", "task", "Alpha", 100, 100, 102, 65),
    el("B", "task", "Beta", 250, 100, 102, 65),
    el("C", "task", "Gamma", 400, 100, 102, 65),
    el("D", "task", "Delta", 100, 300, 102, 65),
  ],
  connectors: [flow("c1", "A", "B"), flow("c2", "B", "C")],
});

/** A pool with one lane holding X and Y, and Z lower down in the same pool. */
const pooled = (): Shape => ({
  elements: [
    el("P", "pool", "Warehouse", 0, 0, 900, 400, { properties: { poolType: "white-box" } }),
    el("L1", "lane", "Picking", 36, 0, 864, 400, { parentId: "P" }),
    el("X", "task", "Pick", 120, 40, 102, 65, { parentId: "L1" }),
    el("Y", "task", "Pack", 280, 40, 102, 65, { parentId: "L1" }),
    el("Z", "task", "Ship", 120, 260, 102, 65, { parentId: "L1" }),
  ],
  connectors: [flow("c1", "X", "Y")],
});

describe("wrap the selection in a pool or a lane", () => {
  it("T4443 — the grammar takes both container words, their homophones, and a name", () => {
    expect(parseCommand("wrap these in a pool called Finance")).toEqual([{ op: "wrapInContainer", container: "pool", label: "Finance" }]);
    expect(parseCommand("surround selected with a lane called Picking")).toEqual([{ op: "wrapInContainer", container: "lane", label: "Picking" }]);
    expect(parseCommand("put a pool around the selected elements called Sales")).toEqual([{ op: "wrapInContainer", container: "pool", label: "Sales" }]);
    expect(parseCommand("wrap these in a lane")).toEqual([{ op: "wrapInContainer", container: "lane" }]);
    // The recogniser's usual substitutions for these two words.
    expect(parseCommand("wrap these in a poll called Finance")).toEqual([{ op: "wrapInContainer", container: "pool", label: "Finance" }]);
    expect(parseCommand("wrap these in a line called Picking")).toEqual([{ op: "wrapInContainer", container: "lane", label: "Picking" }]);

    // The neighbours must keep their meaning.
    expect(parseCommand("put a pool around everything"), "wrap-everything is a different command").toEqual([{ op: "wrapInPool" }]);
    expect(parseCommand("wrap these in a subprocess")).toEqual([{ op: "wrapInSubprocess" }]);
    expect(validateOps([{ op: "wrapInContainer", container: "lane", label: " P " }])).toEqual([{ op: "wrapInContainer", container: "lane", label: "P" }]);
    expect(validateOps([{ op: "wrapInContainer", container: "sublane" }]), "only pool and lane").toEqual([]);
  });

  it("T4444 — a pool wraps loose elements, and refuses a flow that would cross its boundary", () => {
    // A → B → C selected whole: no flow crosses, so it wraps.
    const whole = ok(planWrapInContainer(loose(), ["A", "B", "C"], "pool", "Finance", ids));
    const pool = whole.elements.find((e) => e.id === "new1")!;
    expect(pool.type).toBe("pool");
    expect(pool.label).toBe("Finance");
    expect(pool.properties?.poolType).toBe("white-box");
    // Sized around the selection, with room for the rotated header on the left.
    expect(pool.x).toBeLessThan(100);
    expect(pool.x + pool.width).toBeGreaterThan(502);
    for (const id of ["A", "B", "C"]) {
      expect(whole.elements.find((e) => e.id === id)!.parentId, `${id} joins the pool`).toBe("new1");
    }
    expect(whole.elements.find((e) => e.id === "D")!.parentId, "an unselected element is left alone").toBeUndefined();
    expect(whole.connectors, "connectors are untouched").toEqual(loose().connectors);
    expect(whole.summary).toBe("put 3 elements in the pool Finance");
    // Drawn beneath its children.
    const order = whole.elements.map((e) => e.id);
    expect(order.indexOf("new1")).toBeLessThan(order.indexOf("A"));

    // Selecting only part of the chain would leave a sequence flow crossing the
    // new pool boundary, which BPMN does not allow.
    const partial = planWrapInContainer(loose(), ["A", "B"], "pool", "Finance", ids);
    expect(partial).toMatchObject({ error: expect.stringContaining("can't cross a pool boundary") });
    expect((partial as { error: string }).error, "name what is on the other side").toContain("Gamma");

    // Nested pools are not legal.
    expect(planWrapInContainer(pooled(), ["X", "Y"], "pool", "Inner", ids))
      .toMatchObject({ error: expect.stringContaining("already in a pool") });
  });

  it("T4445 — a lane is a band in the selection's pool, and refuses to sweep in a neighbour", () => {
    const wrapped = ok(planWrapInContainer(pooled(), ["X", "Y"], "lane", "Prep", ids));
    const lane = wrapped.elements.find((e) => e.id === "new1")!;
    expect(lane.type).toBe("lane");
    expect(lane.parentId, "a lane belongs to its pool").toBe("P");
    // Full width of the pool past the header, and only as tall as the selection.
    expect(lane.x).toBe(36);
    expect(lane.width).toBe(864);
    expect(lane.height).toBeLessThan(120);
    expect(wrapped.elements.find((e) => e.id === "X")!.parentId).toBe("new1");
    expect(wrapped.elements.find((e) => e.id === "Y")!.parentId).toBe("new1");
    expect(wrapped.elements.find((e) => e.id === "Z")!.parentId, "the element further down stays put").toBe("L1");
    expect(wrapped.summary).toBe("put 2 elements in the lane Prep");

    // A lane spans the pool, so anything level with the selection would be
    // adopted silently. Selecting X and Z brackets Y.
    const sweeps = planWrapInContainer(pooled(), ["X", "Z"], "lane", "Prep", ids);
    expect(sweeps).toMatchObject({ error: expect.stringContaining("sits level with the selection") });
    expect((sweeps as { error: string }).error).toContain("Pack");

    // A lane needs a pool to live in.
    expect(planWrapInContainer(loose(), ["A", "B"], "lane", "Prep", ids))
      .toMatchObject({ error: expect.stringContaining("a lane lives inside a pool") });
  });

  it("T4446 — both refuse a selection that is empty, contains a container, or spans two parents", () => {
    for (const container of ["pool", "lane"] as const) {
      expect(planWrapInContainer(loose(), [], container, "X", ids)).toMatchObject({ error: expect.stringContaining("select the elements") });
      // A swimlane is still refused. Subprocesses are not — see T4479.
      expect(planWrapInContainer(pooled(), ["L1", "X"], container, "X", ids)).toMatchObject({ error: expect.stringContaining("can't include a pool or a lane") });
    }
    const mixed: Shape = {
      elements: [...pooled().elements, el("Q", "task", "Loose", 600, 600, 102, 65)],
      connectors: [],
    };
    expect(planWrapInContainer(mixed, ["X", "Q"], "lane", "Prep", ids))
      .toMatchObject({ error: expect.stringContaining("more than one container") });
  });
});

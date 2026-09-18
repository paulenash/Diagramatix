/**
 * Reordering the pool stack (Paul, 2026-09-18).
 *
 * "Move Pool 1 above Pool 2" did not exist, so it reached the AI, which offered
 * its nearest guess — "nudge Pool 1 up" — and moved it twenty pixels. Paul:
 * "Obviously not yet!"
 *
 * Pools are a vertical stack, so this is a matter of recomputing where each one
 * starts. Making room is not a separate step: the stack is laid out again from
 * the top, so a pool dropped between two others pushes the rest down by exactly
 * its own height. And the gaps stay at their SLOTS rather than travelling with
 * the pools, so the stack keeps its overall height and nothing drifts after
 * several moves.
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { validateOps } from "@/app/lib/assist/ops";
import {
  planMovePool,
  planSwapPools,
  poolsInOrder,
  selectedPools,
} from "@/app/lib/diagram/poolOrder";
import type { DiagramElement } from "@/app/lib/diagram/types";

const CONTAINERS = new Set(["pool", "lane", "sublane", "subprocess-expanded", "group"]);
const isContainer = (t: string) => CONTAINERS.has(t);
const descendantsOf = (elements: DiagramElement[], id: string): string[] => {
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of elements) {
      if (out.has(e.id)) continue;
      if (e.parentId === id || (e.parentId && out.has(e.parentId))) { out.add(e.id); grew = true; }
    }
  }
  return [...out];
};

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 100, y: 0, width: 800, height: 100, properties: {}, ...extra } as DiagramElement);

/** Three pools, 100 tall, 20 apart: P1 at 0, P2 at 120, P3 at 240. */
const stack = (): DiagramElement[] => [
  el("P1", "pool", { label: "Pool 1", y: 0 }),
  el("P2", "pool", { label: "Pool 2", y: 120 }),
  el("P3", "pool", { label: "Pool 3", y: 240 }),
  el("t1", "task", { parentId: "P1", x: 200, y: 20, width: 102, height: 60 }),
  el("t2", "task", { parentId: "P2", x: 200, y: 140, width: 102, height: 60 }),
];


/** The planners always act on a whole diagram; these fixtures have no connectors. */
const planMovePool2 = (els: DiagramElement[], ...rest: [string, "above" | "below", string, typeof isContainer, typeof descendantsOf]) =>
  planMovePool(els, [], ...rest);
const planSwapPools2 = (els: DiagramElement[], ...rest: [string, string, typeof isContainer, typeof descendantsOf]) =>
  planSwapPools(els, [], ...rest);
const ok = (r: ReturnType<typeof planMovePool>) => { if ("error" in r) throw new Error(r.error); return r; };
const tops = (els: DiagramElement[]) =>
  Object.fromEntries(poolsInOrder(els).map((p) => [p.id, p.y]));
const orderOf = (els: DiagramElement[]) => poolsInOrder(els).map((p) => p.id);

describe("T4508 — the command exists now", () => {
  it("takes move above and below, in the phrasings people use", () => {
    expect(parseCommand("Move Pool 1 above Pool 2"))
      .toEqual([{ op: "movePoolTo", ref: "Pool 1", position: "above", relativeTo: "Pool 2" }]);
    expect(parseCommand("move Pool 1 below Pool 3"))
      .toEqual([{ op: "movePoolTo", ref: "Pool 1", position: "below", relativeTo: "Pool 3" }]);
    expect(parseCommand("put Pool 3 under Pool 1"))
      .toEqual([{ op: "movePoolTo", ref: "Pool 3", position: "below", relativeTo: "Pool 1" }]);
    expect(parseCommand("place the Sales pool above the Finance pool"))
      .toEqual([{ op: "movePoolTo", ref: "Sales pool", position: "above", relativeTo: "Finance pool" }]);
  });

  it("takes both swap forms", () => {
    expect(parseCommand("swap Pool 1 with Pool 2"))
      .toEqual([{ op: "swapPools", a: "Pool 1", b: "Pool 2" }]);
    expect(parseCommand("Swap selected pools")).toEqual([{ op: "swapPools" }]);
    expect(parseCommand("swap the selected pools")).toEqual([{ op: "swapPools" }]);
  });

  it("does not steal the commands that already answered to those verbs", () => {
    // A lane move and a lane swap say "lane", and a gateway swap says a side.
    expect(parseCommand("move the Sales lane up")).toEqual([{ op: "moveLane", ref: "Sales", direction: "up" }]);
    expect(parseCommand("swap Sales with Picking")?.[0].op).toBe("swapLanes");
    expect(parseCommand("swap top and bottom")?.[0].op).toBe("swapGatewayPoints");
    expect(parseCommand("nudge Pool 1 up")?.[0].op).toBe("nudgePool");
    // And it only claims the sentence when BOTH sides are pools — otherwise
    // "move Approve above Review" would be read as a pool reorder.
    expect(parseCommand("move Approve above Review")?.[0].op).not.toBe("movePoolTo");
    expect(parseCommand("move Pool 1 above Review")?.[0].op).not.toBe("movePoolTo");
    expect(parseCommand("swap Approve with Review")?.[0].op).not.toBe("swapPools");
  });

  it("survives validation, and refuses a half-named swap", () => {
    expect(validateOps([{ op: "movePoolTo", ref: "Pool 1", position: "above", relativeTo: "Pool 2" }]))
      .toEqual([{ op: "movePoolTo", ref: "Pool 1", position: "above", relativeTo: "Pool 2" }]);
    expect(validateOps([{ op: "movePoolTo", ref: "Pool 1", position: "sideways", relativeTo: "Pool 2" }])).toEqual([]);
    expect(validateOps([{ op: "swapPools" }])).toEqual([{ op: "swapPools" }]);
    expect(validateOps([{ op: "swapPools", a: "Pool 1" }]), "one name has nothing to swap with").toEqual([]);
  });
});

describe("T4509 — moving a pool in the stack", () => {
  it("puts it above the one named, and pushes that one down", () => {
    const out = ok(planMovePool2(stack(), "P3", "above", "P2", isContainer, descendantsOf)).elements;
    expect(orderOf(out)).toEqual(["P1", "P3", "P2"]);
    expect(tops(out)).toEqual({ P1: 0, P3: 120, P2: 240 });
  });

  it("puts it below the one named", () => {
    const out = ok(planMovePool2(stack(), "P1", "below", "P2", isContainer, descendantsOf)).elements;
    expect(orderOf(out)).toEqual(["P2", "P1", "P3"]);
  });

  it("makes room without a separate step", () => {
    // The stack is laid out again from the top, so the pool below starts lower
    // by exactly the inserted pool's height plus the gap at that slot.
    const out = ok(planMovePool2(stack(), "P3", "above", "P2", isContainer, descendantsOf)).elements;
    const p = Object.fromEntries(poolsInOrder(out).map((x) => [x.id, x]));
    expect(p.P2.y).toBe(p.P3.y + p.P3.height + 20);
  });

  it("leaves the stack where it was on the page", () => {
    // A fixture that does NOT start at y=0, or "start the stack at the top of
    // the page" passes by coincidence.
    const lower = stack().map((e) => (e.type === "pool" ? { ...e, y: e.y + 200 } : e));
    const out = ok(planMovePool2(lower, "P3", "above", "P2", isContainer, descendantsOf)).elements;
    expect(poolsInOrder(out)[0].y, "the top pool stays where the top pool was").toBe(200);
  });

  it("keeps the stack the same overall height", () => {
    const before = poolsInOrder(stack());
    const out = ok(planMovePool2(stack(), "P3", "above", "P1", isContainer, descendantsOf)).elements;
    const after = poolsInOrder(out);
    const span = (ps: DiagramElement[]) => (ps[ps.length - 1].y + ps[ps.length - 1].height) - ps[0].y;
    expect(span(after)).toBe(span(before));
  });

  it("takes each pool's contents with it", () => {
    const out = ok(planMovePool2(stack(), "P1", "below", "P2", isContainer, descendantsOf)).elements;
    const by = Object.fromEntries(out.map((e) => [e.id, e]));
    expect(by.t1.y - by.P1.y, "the task keeps its place inside Pool 1").toBe(20);
    expect(by.t2.y - by.P2.y, "and so does the one in Pool 2").toBe(20);
  });

  it("says so rather than acting when there is nothing to do", () => {
    expect(planMovePool2(stack(), "P1", "above", "P1", isContainer, descendantsOf))
      .toMatchObject({ error: expect.stringContaining("already") });
    expect(planMovePool2(stack(), "P1", "above", "P2", isContainer, descendantsOf))
      .toMatchObject({ error: expect.stringContaining("already above") });
    expect(planMovePool2(stack(), "t1", "above", "P2", isContainer, descendantsOf))
      .toMatchObject({ error: expect.stringContaining("isn't a pool") });
  });
});

describe("T4510 — swapping two pools", () => {
  it("exchanges their places", () => {
    const out = ok(planSwapPools2(stack(), "P1", "P3", isContainer, descendantsOf)).elements;
    expect(orderOf(out)).toEqual(["P3", "P2", "P1"]);
    expect(tops(out)).toEqual({ P3: 0, P2: 120, P1: 240 });
  });

  it("works on neighbours as well as distant pools", () => {
    const out = ok(planSwapPools2(stack(), "P1", "P2", isContainer, descendantsOf)).elements;
    expect(orderOf(out)).toEqual(["P2", "P1", "P3"]);
  });

  it("carries the contents", () => {
    const out = ok(planSwapPools2(stack(), "P1", "P3", isContainer, descendantsOf)).elements;
    const by = Object.fromEntries(out.map((e) => [e.id, e]));
    expect(by.t1.y - by.P1.y).toBe(20);
  });

  it("refuses what cannot be swapped", () => {
    expect(planSwapPools2(stack(), "P1", "P1", isContainer, descendantsOf))
      .toMatchObject({ error: expect.stringContaining("same pool") });
    expect(planSwapPools2(stack(), "P1", "t1", isContainer, descendantsOf))
      .toMatchObject({ error: expect.stringContaining("need to be pools") });
  });

  it("reads 'the selected pools' off the mouse selection", () => {
    expect(selectedPools(stack(), ["P1", "P3"])?.map((p) => p.id)).toEqual(["P1", "P3"]);
    expect(selectedPools(stack(), ["P1"]), "one is not a pair").toBeNull();
    expect(selectedPools(stack(), ["P1", "P2", "P3"]), "nor is three").toBeNull();
    expect(selectedPools(stack(), ["P1", "t1"]), "a task is not a pool").toBeNull();
  });
});

describe("T4515 — a message flow follows the pool it is attached to", () => {
  /**
   * Paul, 2026-09-18: "Swapping Pool 1 and Pool 3 causes issues with message
   * attachments to those pool. They become disconnected."
   *
   * A messageBPMN between a pool and something outside it carries waypoints in
   * world coordinates. Moving the pool and leaving them alone leaves the message
   * hanging in mid-air, pointing at where the pool used to be.
   */
  const withMessage = () => {
    const els = stack();
    const conns = [{
      id: "m1", sourceId: "t2", targetId: "P3",
      sourceSide: "bottom", targetSide: "top",
      type: "messageBPMN", directionType: "directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false,
      sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
      waypoints: [{ x: 250, y: 200 }, { x: 250, y: 240 }],
    }] as unknown as Parameters<typeof planSwapPools>[1];
    return { els, conns };
  };

  it("re-routes a message whose pool moved", () => {
    const { els, conns } = withMessage();
    const plan = planSwapPools(els, conns, "P1", "P3", isContainer, descendantsOf);
    if ("error" in plan) throw new Error(plan.error);
    const m = plan.connectors.find((c) => c.id === "m1")!;
    const p3 = plan.elements.find((e) => e.id === "P3")!;
    const last = m.waypoints[m.waypoints.length - 1];
    // It has to end ON the pool, wherever the pool ended up.
    expect(last.y).toBeGreaterThanOrEqual(p3.y - 2);
    expect(last.y).toBeLessThanOrEqual(p3.y + p3.height + 2);
  });

  it("returns connectors even when nothing needed re-routing", () => {
    const { els, conns } = withMessage();
    const plan = planSwapPools(els, conns, "P1", "P2", isContainer, descendantsOf);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.connectors).toHaveLength(1);
  });

  it("slides a connector whose two ends moved together, keeping its shape", () => {
    // Both ends inside Pool 1: the whole thing just moved down the page, and
    // re-routing it would throw away waypoints the user had placed.
    const els = stack();
    const inside = [{
      id: "s1", sourceId: "t1", targetId: "t1b",
      sourceSide: "right", targetSide: "left",
      type: "sequence", directionType: "directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false,
      sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
      waypoints: [{ x: 300, y: 50 }, { x: 360, y: 50 }],
    }] as unknown as Parameters<typeof planSwapPools>[1];
    els.push(el("t1b", "task", { parentId: "P1", x: 400, y: 20, width: 102, height: 60 }));
    const plan = planSwapPools(els, inside, "P1", "P3", isContainer, descendantsOf);
    if ("error" in plan) throw new Error(plan.error);
    const s = plan.connectors.find((c) => c.id === "s1")!;
    const dy = plan.elements.find((e) => e.id === "P1")!.y - 0;
    expect(s.waypoints.map((w) => w.y)).toEqual([50 + dy, 50 + dy]);
    expect(s.waypoints.map((w) => w.x), "and its shape is untouched").toEqual([300, 360]);
  });
});

describe("T4511 — the reducer applies both", () => {
  const drive = async (action: unknown) => {
    const { reducer } = await import("@/app/hooks/useDiagram");
    const before = { elements: stack(), connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as Parameters<typeof reducer>[0];
    return reducer(before, action as never);
  };

  it("moves a pool", async () => {
    const after = await drive({ type: "MOVE_POOL_TO", payload: { poolId: "P3", position: "above", relativeToId: "P2" } });
    expect(orderOf(after.elements as DiagramElement[])).toEqual(["P1", "P3", "P2"]);
  });

  it("swaps two pools", async () => {
    const after = await drive({ type: "SWAP_POOLS", payload: { aId: "P1", bId: "P3" } });
    expect(orderOf(after.elements as DiagramElement[])).toEqual(["P3", "P2", "P1"]);
  });

  it("hands back the re-routed connectors, not the old ones", async () => {
    // The plan computes them; the reducer has to actually keep them, or the
    // message flows stay pointing at where the pool used to be.
    const { reducer } = await import("@/app/hooks/useDiagram");
    const connectors = [{
      id: "m1", sourceId: "t2", targetId: "P3",
      sourceSide: "bottom", targetSide: "top",
      type: "messageBPMN", directionType: "directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false,
      sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
      waypoints: [{ x: 250, y: 200 }, { x: 250, y: 240 }],
    }];
    const before = { elements: stack(), connectors, viewport: { x: 0, y: 0, zoom: 1 } } as unknown as Parameters<typeof reducer>[0];
    const after = reducer(before, { type: "SWAP_POOLS", payload: { aId: "P1", bId: "P3" } } as never);
    const m = after.connectors.find((c) => c.id === "m1")!;
    const p3 = (after.elements as DiagramElement[]).find((e) => e.id === "P3")!;
    const last = m.waypoints[m.waypoints.length - 1];
    expect(last.y).toBeGreaterThanOrEqual(p3.y - 2);
    expect(last.y).toBeLessThanOrEqual(p3.y + p3.height + 2);
  });

  it("leaves the diagram alone when the plan refuses", async () => {
    const { reducer } = await import("@/app/hooks/useDiagram");
    const before = { elements: stack(), connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as Parameters<typeof reducer>[0];
    const after = reducer(before, { type: "SWAP_POOLS", payload: { aId: "P1", bId: "t1" } } as never);
    // The SAME state object, not merely one that sorts the same way — a refused
    // plan must touch nothing at all.
    expect(after).toBe(before);
    expect(orderOf(after.elements as DiagramElement[])).toEqual(["P1", "P2", "P3"]);
  });

  it("leaves the diagram alone when a move refuses", async () => {
    const { reducer } = await import("@/app/hooks/useDiagram");
    const before = { elements: stack(), connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as Parameters<typeof reducer>[0];
    const after = reducer(before, { type: "MOVE_POOL_TO", payload: { poolId: "P1", position: "above", relativeToId: "P2" } } as never);
    expect(after, "P1 is already above P2").toBe(before);
  });
});

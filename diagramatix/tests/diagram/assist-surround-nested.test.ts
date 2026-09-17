/**
 * Surrounding a selection that already contains a subprocess.
 *
 * Paul, 2026-09-17: he selected an event and a connected expanded subprocess,
 * said "surround selected with an expanded subprocess called outer subprocess",
 * and was told "the selection can't include a pool, lane or subprocess — select
 * the tasks, gateways and events to surround". Nesting a subprocess inside a
 * subprocess is ordinary BPMN, and it is exactly what you want when a stretch
 * of flow that already has one step grouped needs to become a step itself.
 *
 * A pool or a lane is still refused, and that distinction is the point: a
 * swimlane says WHO does the work, so it cannot be moved inside a step OF the
 * work. A subprocess is a step, and steps nest.
 *
 * The refusal was hiding a second bug. Every element in the wrapped group was
 * reparented onto the new shell, so had the selection been allowed through, the
 * inner subprocess's own children would have been reparented to the OUTER one —
 * flattening the nesting and leaving the inner subprocess drawn empty with its
 * contents beside it.
 */
import { describe, it, expect } from "vitest";
import {
  planWrapInSubprocess,
  planWrapInContainer,
  planUnwrapSubprocess,
  type Shape,
} from "@/app/lib/diagram/subprocessWrap";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (
  id: string, type: string, label: string,
  x: number, y: number, w: number, h: number,
  extra: Record<string, unknown> = {},
): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x, y, width: w, height: h, properties: {}, ...extra });

const flow = (id: string, sourceId: string, targetId: string): Connector =>
  ({
    id, sourceId, targetId, sourceSide: "right", targetSide: "left",
    type: "sequence", directionType: "directed", routingType: "rectilinear",
    sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
    sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
  } as Connector);

const ids = (n: string) => ({ epId: `ep${n}`, startId: `st${n}`, endId: `en${n}`, startConnId: `cs${n}`, endConnId: `ce${n}` });

/**
 * Paul's shape: a lane holding Start → Trigger(event) → [inner EP: sA → sB] → End.
 * The inner EP already has its own Start and its own contents.
 */
function withInnerEp(): Shape {
  const elements = [
    el("P", "pool", "Warehouse", 0, 0, 1400, 300, { properties: { poolType: "white-box" } }),
    el("L1", "lane", "Picking", 36, 0, 1364, 300, { parentId: "P" }),
    el("S", "start-event", "", 80, 130, 36, 36, { parentId: "L1" }),
    el("T", "intermediate-event", "Trigger", 170, 130, 36, 36, { parentId: "L1" }),
    el("IEP", "subprocess-expanded", "Inner", 260, 80, 420, 140, { parentId: "L1" }),
    el("iS", "start-event", "", 284, 130, 36, 36, { parentId: "IEP" }),
    el("sA", "task", "Weigh", 360, 115, 102, 65, { parentId: "IEP" }),
    el("iE", "end-event", "", 620, 130, 36, 36, { parentId: "IEP" }),
    el("E", "end-event", "", 740, 130, 36, 36, { parentId: "L1" }),
  ];
  const connectors = [
    flow("c0", "S", "T"),
    flow("c1", "T", "IEP"),
    flow("c2", "IEP", "E"),
    flow("ci0", "iS", "sA"),
    flow("ci1", "sA", "iE"),
  ];
  return { elements, connectors };
}

const ok = (p: ReturnType<typeof planWrapInSubprocess>) => {
  if ("error" in p) throw new Error(p.error);
  return p;
};

describe("T4479 — a subprocess may be inside the selection being surrounded", () => {
  it("accepts Paul's selection: an event and the expanded subprocess it flows into", () => {
    const plan = planWrapInSubprocess(withInnerEp(), ["T", "IEP"], "Outer Subprocess", ids("o"));
    expect("error" in plan ? plan.error : null).toBeNull();
  });

  it("still refuses a pool or a lane, which is a different kind of thing entirely", () => {
    for (const swimlane of ["P", "L1"]) {
      const plan = planWrapInSubprocess(withInnerEp(), [swimlane, "T"], "X", ids("o"));
      expect("error" in plan && plan.error).toContain("can't include a pool or a lane");
    }
  });

  it("puts the inner subprocess inside the new one", () => {
    const plan = ok(planWrapInSubprocess(withInnerEp(), ["T", "IEP"], "Outer Subprocess", ids("o")));
    const byId = new Map(plan.elements.map((e) => [e.id, e] as const));
    expect(byId.get("IEP")!.parentId).toBe("epo");
    expect(byId.get("T")!.parentId).toBe("epo");
  });

  it("does NOT flatten the inner subprocess's own contents into the new one", () => {
    // The bug the refusal was hiding: everything in the wrapped group used to be
    // reparented onto the new shell, so the inner subprocess would have been
    // drawn empty with its own children sitting beside it.
    const plan = ok(planWrapInSubprocess(withInnerEp(), ["T", "IEP"], "Outer Subprocess", ids("o")));
    const byId = new Map(plan.elements.map((e) => [e.id, e] as const));
    for (const child of ["iS", "sA", "iE"]) {
      expect(byId.get(child)!.parentId, `${child} was lifted out of the inner subprocess`).toBe("IEP");
    }
  });

  it("carries the inner subprocess's contents along when it moves", () => {
    const before = withInnerEp();
    const plan = ok(planWrapInSubprocess(before, ["T", "IEP"], "Outer Subprocess", ids("o")));
    const was = new Map(before.elements.map((e) => [e.id, e] as const));
    const now = new Map(plan.elements.map((e) => [e.id, e] as const));
    // The whole group shifts right by the same amount to make room for the Start.
    const shift = now.get("IEP")!.x - was.get("IEP")!.x;
    expect(shift).toBeGreaterThan(0);
    for (const child of ["iS", "sA", "iE"]) {
      expect(now.get(child)!.x - was.get(child)!.x, `${child} did not move with its parent`).toBe(shift);
    }
  });

  it("wraps the whole nest, not just its outline", () => {
    const plan = ok(planWrapInSubprocess(withInnerEp(), ["T", "IEP"], "Outer Subprocess", ids("o")));
    const byId = new Map(plan.elements.map((e) => [e.id, e] as const));
    const outer = byId.get("epo")!;
    const inner = byId.get("IEP")!;
    expect(outer.x).toBeLessThanOrEqual(inner.x);
    expect(outer.x + outer.width).toBeGreaterThanOrEqual(inner.x + inner.width);
    expect(outer.y).toBeLessThanOrEqual(inner.y);
    expect(outer.y + outer.height).toBeGreaterThanOrEqual(inner.y + inner.height);
  });

  it("re-points the one flow in and the one flow out at the new shell", () => {
    const plan = ok(planWrapInSubprocess(withInnerEp(), ["T", "IEP"], "Outer Subprocess", ids("o")));
    const c = new Map(plan.connectors.map((x) => [x.id, x] as const));
    expect(c.get("c0")!.targetId).toBe("epo");
    expect(c.get("c2")!.sourceId).toBe("epo");
    // The inner subprocess's own flows are untouched.
    expect(c.get("ci0")!.sourceId).toBe("iS");
    expect(c.get("ci1")!.targetId).toBe("iE");
  });

  it("unwrapping the new shell gives the nest back intact", () => {
    const plan = ok(planWrapInSubprocess(withInnerEp(), ["T", "IEP"], "Outer Subprocess", ids("o")));
    const back = planUnwrapSubprocess({ elements: plan.elements, connectors: plan.connectors }, "epo");
    expect("error" in back ? back.error : null).toBeNull();
    const byId = new Map((back as Shape).elements.map((e) => [e.id, e] as const));
    expect(byId.get("epo"), "the outer shell is gone").toBeUndefined();
    expect(byId.get("IEP"), "the inner subprocess survives").toBeDefined();
    for (const child of ["iS", "sA", "iE"]) {
      expect(byId.get(child)!.parentId, `${child} still belongs to the inner subprocess`).toBe("IEP");
    }
  });
});

describe("T4480 — the pool and lane wrap agree on what may be selected", () => {
  it("lets a subprocess into a new lane", () => {
    // The whole row, so the separate (and correct) guard about sweeping level
    // neighbours into the new lane has nothing to complain about.
    const plan = planWrapInContainer(withInnerEp(), ["S", "T", "IEP", "E"], "lane", "Prep", { containerId: "ln1" });
    expect("error" in plan ? plan.error : null).toBeNull();
  });

  it("still refuses a swimlane", () => {
    const plan = planWrapInContainer(withInnerEp(), ["L1", "T"], "lane", "Prep", { containerId: "ln1" });
    expect("error" in plan && plan.error).toContain("can't include a pool or a lane");
  });
});

describe("T4481 — selecting a subprocess and something inside it is not an error", () => {
  it("ignores the pick that is already coming along with its parent", () => {
    // A rubber band over a subprocess catches its contents too. Left in, the
    // child failed the "must all sit in one lane" check, because its parent is
    // the subprocess and not the lane — a refusal the user cannot act on.
    const plan = planWrapInSubprocess(withInnerEp(), ["T", "IEP", "sA"], "Outer", ids("o"));
    expect("error" in plan ? plan.error : null).toBeNull();
  });

  it("gives the same result as selecting the parent alone", () => {
    const withChild = ok(planWrapInSubprocess(withInnerEp(), ["T", "IEP", "sA"], "Outer", ids("o")));
    const withoutChild = ok(planWrapInSubprocess(withInnerEp(), ["T", "IEP"], "Outer", ids("o")));
    expect(withChild.elements).toEqual(withoutChild.elements);
  });
});

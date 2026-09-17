/**
 * What a refused wrap actually says.
 *
 * Paul, 2026-09-18: "'Surround Selected items with a pool' refuses to surround
 * any selection with containers in it. The containers are EPs. and this should
 * be ok." Expanded subprocesses in a selection HAVE been allowed since
 * `fe1da549`, and that is deployed — so what he hit was a different rule whose
 * wording made it sound like a complaint about the containers he had selected.
 *
 * Two of them could do that. "Spread across more than one container" reads as
 * being about a container INSIDE the selection whenever there is one. And "these
 * elements are already in a pool" is correct but offers no way forward, when the
 * thing he almost certainly wanted was a lane.
 *
 * Both now name the specific elements, so the next report is unambiguous.
 */
import { describe, it, expect } from "vitest";
import { planWrapInContainer, planWrapInSubprocess, type Shape } from "@/app/lib/diagram/subprocessWrap";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (
  id: string, type: string, label: string,
  x: number, y: number, w: number, h: number,
  extra: Record<string, unknown> = {},
): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x, y, width: w, height: h, properties: {}, ...extra });

const flow = (id: string, s: string, t: string): Connector =>
  ({
    id, sourceId: s, targetId: t, sourceSide: "right", targetSide: "left",
    type: "sequence", directionType: "directed", routingType: "rectilinear",
    sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
    sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
  } as Connector);

/** A pool with two lanes; an expanded subprocess sits in the upper one. */
const twoLanes = (): Shape => ({
  elements: [
    el("P", "pool", "Warehouse", 0, 0, 1200, 400, { properties: { poolType: "white-box" } }),
    el("L1", "lane", "Picking", 36, 0, 1164, 200, { parentId: "P" }),
    el("L2", "lane", "Packing", 36, 200, 1164, 200, { parentId: "P" }),
    el("T", "task", "Pick", 120, 60, 102, 65, { parentId: "L1" }),
    el("EP", "subprocess-expanded", "Check Stock", 300, 30, 400, 140, { parentId: "L1" }),
    el("in", "task", "Weigh", 360, 70, 102, 65, { parentId: "EP" }),
    el("D", "task", "Dispatch", 120, 260, 102, 65, { parentId: "L2" }),
  ],
  connectors: [flow("c1", "T", "EP")],
});

const err = (p: ReturnType<typeof planWrapInContainer>) => ("error" in p ? p.error : "");
const ids = { containerId: "new1" };

describe("T4495 — an expanded subprocess in the selection is not the problem", () => {
  it("is accepted by the subprocess wrap", () => {
    const p = planWrapInSubprocess(twoLanes(), ["T", "EP"], "Outer", {
      epId: "e1", startId: "s1", endId: "n1", startConnId: "cs", endConnId: "ce",
    });
    expect(err(p)).not.toContain("subprocess");
  });

  it("is accepted by the lane wrap", () => {
    const p = planWrapInContainer(twoLanes(), ["T", "EP"], "lane", "Prep", ids);
    expect(err(p)).not.toContain("subprocess");
  });

  it("is still refused when the selection has a pool or a lane in it", () => {
    // The distinction Paul drew himself: a swimlane says WHO does the work, so
    // it cannot go inside a step OF the work.
    for (const swimlane of ["P", "L1"]) {
      expect(err(planWrapInContainer(twoLanes(), [swimlane, "T"], "lane", "Prep", ids)))
        .toContain("can't include a pool or a lane");
    }
  });
});

describe("T4496 — a refused wrap names what is actually in the way", () => {
  it("names both homes when the selection is spread across two", () => {
    // "spread across more than one container" was the old wording, and it read
    // as a complaint about the container in the selection.
    const message = err(planWrapInContainer(twoLanes(), ["T", "D"], "lane", "Prep", ids));
    expect(message).toContain("Dispatch");
    expect(message).toContain("Picking");
    expect(message).toContain("Packing");
    expect(message, "and no longer sounds like it is about the selection's own containers")
      .not.toContain("more than one container");
  });

  it("names the pool, and says what to do instead, when a pool would nest", () => {
    const message = err(planWrapInContainer(twoLanes(), ["T", "EP"], "pool", "Inner", ids));
    expect(message).toContain("Warehouse");
    expect(message).toContain("a pool cannot contain another pool");
    expect(message, "the way forward is a lane").toContain("lane");
  });

  it("does not claim a pool the selection is drawn nowhere near", () => {
    // Paul, 2026-09-18: "The selected elements are above Pool 1 not in it!!".
    // After an accidental wrap the elements claimed Pool 1 as an ancestor while
    // sitting well above it, and the nesting rule refused on that basis.
    // `parentId` is bookkeeping; if the pool is not drawn round them, it is not
    // their pool.
    const strayParentage: Shape = {
      elements: [
        el("P", "pool", "Pool 1", 187, 788, 1112, 78, { properties: { poolType: "white-box" } }),
        el("A", "task", "Alpha", 300, 200, 102, 65, { parentId: "P" }),
        el("B", "task", "Beta", 460, 200, 102, 65, { parentId: "P" }),
      ],
      connectors: [],
    };
    const p = planWrapInContainer(strayParentage, ["A", "B"], "pool", "Finance", ids);
    expect(err(p), "a pool it is not inside must not block the wrap")
      .not.toContain("cannot contain another pool");
  });

  it("still refuses when the selection really is inside the pool", () => {
    const genuinely: Shape = {
      elements: [
        el("P", "pool", "Pool 1", 0, 0, 900, 400, { properties: { poolType: "white-box" } }),
        el("A", "task", "Alpha", 120, 100, 102, 65, { parentId: "P" }),
        el("B", "task", "Beta", 280, 100, 102, 65, { parentId: "P" }),
      ],
      connectors: [],
    };
    expect(err(planWrapInContainer(genuinely, ["A", "B"], "pool", "Finance", ids)))
      .toContain("cannot contain another pool");
  });

  it("says 'the canvas' rather than nothing when an element has no home", () => {
    const loose: Shape = {
      elements: [
        el("A", "task", "Alpha", 100, 100, 102, 65),
        el("P", "pool", "Warehouse", 0, 400, 900, 200, { properties: { poolType: "white-box" } }),
        el("B", "task", "Beta", 100, 450, 102, 65, { parentId: "P" }),
      ],
      connectors: [],
    };
    const message = err(planWrapInContainer(loose, ["A", "B"], "lane", "Prep", ids));
    expect(message).toContain("the canvas");
  });
});

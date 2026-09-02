/**
 * An edge-mounted event's sub-path gets a row of its own (R55.3).
 *
 * Paul, 2026-09-01: "Note EMIEs often further divide a path and then are
 * reunited, or not at the gateway Merge!" His "Gateway Paths Illustrated -
 * with Lanes" drawing shows it: Event 2 hangs off Task 9 in the Marketing
 * lane, and its exception path — Task 16 → "Error Occurred End" — runs on its
 * own line BELOW Path 3.
 *
 * R55.2 could never do this. It moves only elements sharing the first
 * decision's container, so an exception path in another lane is out of scope,
 * and that lane's centring then put it on the very same row as the path it
 * branches off. The generator reported it exactly: "SHARE A ROW: Path 3 (Mkt)
 * and EMIE sub-path at 719".
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

function build(side: "top" | "bottom", rejoin: boolean) {
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Company", poolType: "white-box",
      lanes: [{ id: "sales", name: "Sales" }, { id: "mkt", name: "Marketing" }] },
    { id: "s", type: "start-event", label: "Start", pool: "p", lane: "sales" },
    { id: "d", type: "gateway", label: "Type?", gatewayType: "exclusive", pool: "p", lane: "sales" },
    { id: "a1", type: "task", label: "Sales step", pool: "p", lane: "sales" },
    { id: "b1", type: "task", label: "Task 8", pool: "p", lane: "mkt" },
    { id: "b2", type: "task", label: "Task 9", pool: "p", lane: "mkt" },
    { id: "b3", type: "task", label: "Task 10", pool: "p", lane: "mkt" },
    { id: "ev", type: "intermediate-event", label: "Event 2", eventType: "error",
      boundaryHost: "b2", boundarySide: side },
    { id: "x1", type: "task", label: "Task 16", pool: "p", lane: "mkt" },
    ...(rejoin ? [] : [{ id: "xe", type: "end-event", label: "Error Occurred End", pool: "p", lane: "mkt" } as AiElement]),
    { id: "m", type: "gateway", label: "Type?", pool: "p", lane: "sales" },
    { id: "e", type: "end-event", label: "Send & End", pool: "p", lane: "sales" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "d" },
    { sourceId: "d", targetId: "a1" }, { sourceId: "d", targetId: "b1" },
    { sourceId: "a1", targetId: "m" },
    { sourceId: "b1", targetId: "b2" }, { sourceId: "b2", targetId: "b3" }, { sourceId: "b3", targetId: "m" },
    { sourceId: "ev", targetId: "x1" },
    ...(rejoin ? [{ sourceId: "x1", targetId: "b3" }] : [{ sourceId: "x1", targetId: "xe" }]),
    { sourceId: "m", targetId: "e" },
  ];
  const out = layoutBpmnDiagram(els, conns);
  const at = (id: string) => out.elements.find((el) => el.id === id)!;
  const cy = (id: string) => { const el = at(id); return el.y + el.height / 2; };
  return { out, at, cy };
}

describe("an edge-mounted event's sub-path takes its own row (R55.3)", () => {
  it("T3121 — a bottom-mounted event's path runs BELOW the path it branches off", () => {
    const { cy } = build("bottom", false);
    const main = cy("b2");
    expect(cy("b1")).toBeCloseTo(main, 0);
    expect(cy("b3")).toBeCloseTo(main, 0);
    // The whole exception path leaves the main line, and stays together.
    expect(cy("x1"), "Task 16 is still on the main path's row").toBeGreaterThan(main + 20);
    expect(cy("xe")).toBeCloseTo(cy("x1"), 0);
  });

  it("T3122 — a top-mounted event's path runs ABOVE it instead", () => {
    // The side is not a fixed direction: the path leaves the event the way the
    // event faces, or it would cross back over its own host.
    const { cy } = build("top", false);
    expect(cy("x1")).toBeLessThan(cy("b2") - 20);
  });

  it("T3123 — the sub-path clears its host, it is not merely offset", () => {
    const { at, cy } = build("bottom", false);
    const host = at("b2"), sub = at("x1");
    expect(sub.y, "Task 16 overlaps Task 9 vertically").toBeGreaterThan(host.y + host.height);
    expect(cy("x1") - cy("b2")).toBeGreaterThan(60);
  });

  it("T3124 — an exception that REJOINS does not drag the shared tail down with it", () => {
    // Paul: "reunited, or not at the gateway Merge". Task 10 is fed by both the
    // main line and the exception, so it belongs to the main line and must stay
    // on its row — only the exception's own steps move.
    const { cy } = build("bottom", true);
    const main = cy("b2");
    expect(cy("b3"), "the rejoin target was pulled onto the exception row").toBeCloseTo(main, 0);
    expect(cy("x1")).toBeGreaterThan(main + 20);
  });

  it("T3125 — the lane grows to hold the extra row", () => {
    const { out, at } = build("bottom", false);
    const lane = out.elements.find((e) => e.type === "lane" && e.label === "Marketing")!;
    for (const id of ["b1", "b2", "b3", "x1", "xe"]) {
      const el = at(id);
      expect(el.y, `${el.label} sits above its lane`).toBeGreaterThanOrEqual(lane.y - 0.5);
      expect(el.y + el.height, `${el.label} hangs below its lane`).toBeLessThanOrEqual(lane.y + lane.height + 0.5);
    }
  });
});

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

describe("an exception path does not land on another path (R55.3 via the path stack)", () => {
  /**
   * Paul, 2026-09-02, "Gateway EIME Test 2": "EMIE sub-path conflicts with
   * another Path." The exception off Task 9 was placed one row below its host
   * without asking what already occupied that row — Path 2.2 did, at the same
   * x, so Task 16 was drawn straight over Task 6.
   *
   * Placing it relative to the host can only ever work when the neighbouring
   * row happens to be free. It is a path, so it takes a row in the stack and
   * everything below it moves down.
   */
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Co", poolType: "white-box" },
    { id: "s", type: "start-event", label: "Start", pool: "p" },
    { id: "d1", type: "gateway", label: "Decision 1?", gatewayType: "exclusive", pool: "p" },
    // Path 3 — carries the edge-mounted event.
    { id: "t8", type: "task", label: "Task 8", pool: "p" },
    { id: "t9", type: "task", label: "Task 9", pool: "p" },
    { id: "ev", type: "intermediate-event", label: "Event 2", eventType: "error", boundaryHost: "t9", boundarySide: "bottom" },
    { id: "x1", type: "task", label: "Task 16", pool: "p" },
    { id: "xe", type: "end-event", label: "End Additional Error Path", pool: "p" },
    { id: "t10", type: "task", label: "Task 10", pool: "p" },
    // Path 2, with a nested fork whose branches sit either side of the trunk.
    { id: "t5", type: "task", label: "Task 5", pool: "p" },
    { id: "d2", type: "gateway", label: "Decision 2?", gatewayType: "exclusive", pool: "p" },
    { id: "t6", type: "task", label: "Task 6", pool: "p" },
    { id: "t7", type: "task", label: "Task 7", pool: "p" },
    { id: "t11", type: "task", label: "Task 11", pool: "p" },
    { id: "t12", type: "task", label: "Task 12", pool: "p" },
    { id: "m2", type: "gateway", label: "Decision 2 merge", pool: "p" },
    { id: "m1", type: "gateway", label: "Decision 1 merge", pool: "p" },
    { id: "e", type: "end-event", label: "End", pool: "p" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "d1" },
    { sourceId: "d1", targetId: "t8", label: "Path 3" },
    { sourceId: "d1", targetId: "t5", label: "Path 2" },
    { sourceId: "t8", targetId: "t9" }, { sourceId: "t9", targetId: "t10" }, { sourceId: "t10", targetId: "m1" },
    { sourceId: "ev", targetId: "x1" }, { sourceId: "x1", targetId: "xe" },
    { sourceId: "t5", targetId: "d2" },
    { sourceId: "d2", targetId: "t6", label: "Path 2.2" }, { sourceId: "t6", targetId: "t7" }, { sourceId: "t7", targetId: "m2" },
    { sourceId: "d2", targetId: "t11", label: "Path 2.1" }, { sourceId: "t11", targetId: "t12" }, { sourceId: "t12", targetId: "m2" },
    { sourceId: "m2", targetId: "m1" }, { sourceId: "m1", targetId: "e" },
  ];
  const o = layoutBpmnDiagram(els, conns);
  const g = (id: string) => o.elements.find((e) => e.id === id)!;
  const mid = (id: string) => { const e = g(id); return e.y + e.height / 2; };

  it("T3142 — the exception path is on a row of its own, clear of every other PATH", () => {
    // Measured against the paths, not against every element: a gateway is
    // deliberately centred BETWEEN paths and may land on any row, and the
    // post-merge tail sits far to the right. Paul reported a conflict with
    // another PATH, and that is what this pins.
    const pathRows = {
      "Path 3": mid("t9"),
      "Path 2.1": mid("t11"),
      "Path 2.2": mid("t6"),
      "trunk": mid("t5"),
    };
    const exc = mid("x1");
    for (const [name, row] of Object.entries(pathRows)) {
      expect(Math.abs(exc - row), `the exception path sits on ${name}`).toBeGreaterThan(20);
    }
    // …and its two steps stay together on that row.
    expect(mid("xe")).toBeCloseTo(exc, 0);
  });
  it("T3143 — no element of the exception path OVERLAPS another element", () => {
    // The row check alone would pass if two rows were merely close; this is the
    // fault as it was actually seen — Task 16 drawn over Task 6.
    const others = o.elements.filter((e) =>
      !["pool", "lane"].includes(e.type) && !["x1", "xe", "ev"].includes(e.id));
    for (const id of ["x1", "xe"]) {
      const a = g(id);
      for (const b of others) {
        const hit = a.x < b.x + b.width && b.x < a.x + a.width
          && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(hit, `"${a.label}" overlaps "${b.label}"`).toBe(false);
      }
    }
  });

  it("T3144 — it sits between its host's path and the next one down", () => {
    expect(mid("x1")).toBeGreaterThan(mid("t9"));
    expect(mid("x1")).toBeLessThan(mid("t6"));
  });
});

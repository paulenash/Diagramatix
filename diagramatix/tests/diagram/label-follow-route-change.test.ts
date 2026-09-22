/**
 * T4678–T4680 — a label goes with its segment however the route changed.
 *
 * Paul, 22 September 2026, after the segment-drag version (T4670) shipped:
 *
 *   "1. L-shaped connector enters a Task and attaches to the left boundary.
 *       Move the Task upwards, then the horizontal segment of that connector
 *       moves up but the label does not.
 *    2. Re-routing a connector does not move the label with the horizontal
 *       segment."
 *
 * One gap behind both: the rule ran on ONE action — a segment dragged by hand
 * — and a route changes through a dozen. Moving an element recomputes its
 * connectors; re-routing recomputes them; an endpoint drag recomputes them.
 * The rule now runs in the reducer wrapper after every one of those, and the
 * label is PLACED — kept the same distance from its segment — rather than
 * nudged, because the anchor sometimes moves too and by a different amount.
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import { connectorLabelBox, baseLabelAnchor } from "@/app/lib/diagram/checks/layoutViolations";
import { horizontalSegments, labelFollowOnRouteChange } from "@/app/lib/diagram/labelFollow";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const conn = (d: DiagramData) => d.connectors[0];
/** The route as the canvas draws it — no invisible leaders inside the shapes. */
const drawn = (c: Connector) => {
  let w = c.waypoints;
  if (c.sourceInvisibleLeader && w.length > 2) w = w.slice(1);
  if (c.targetInvisibleLeader && w.length > 2) w = w.slice(0, -1);
  return w;
};

/** The horizontal segment the label sits over, and the gap between them. */
function labelOverSegment(d: DiagramData) {
  const c = conn(d);
  const box = connectorLabelBox(c)!;
  const segs = horizontalSegments(drawn(c)).filter((s) => box.x < s.x2 && box.x + box.w > s.x1);
  const nearest = segs.sort((a, b) => Math.abs(a.y - (box.y + box.h)) - Math.abs(b.y - (box.y + box.h)))[0];
  return { box, seg: nearest, gap: nearest.y - (box.y + box.h) };
}

/**
 * Put the label 6px above the connector's LAST horizontal segment — the one
 * entering the target — centred on it. Offsets are measured from the label's
 * anchor, exactly as the canvas draws it.
 */
function labelJustAboveEntry(d: DiagramData, label = "Yes"): DiagramData {
  const c = conn(d);
  const segs = horizontalSegments(drawn(c));
  const entry = segs[segs.length - 1];
  const anchor = baseLabelAnchor({ ...c, label } as Connector)!;
  const h = 14;
  const labelled = {
    ...c, label,
    labelOffsetX: (entry.x1 + entry.x2) / 2 - anchor.x,
    labelOffsetY: entry.y - 6 - h - anchor.y,
  };
  return { ...d, connectors: [labelled] };
}

/** A connector made the way the canvas makes it. */
function connected(elements: DiagramElement[], sourceSide: string, targetSide: string, source = "a", target = "b"): DiagramData {
  const d = { elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as DiagramData;
  return reducer(d, { type: "ADD_CONNECTOR", payload: {
    sourceId: source, targetId: target, connectorType: "sequence", directionType: "directed",
    routingType: "rectilinear", sourceSide, targetSide, sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
  } } as never) as DiagramData;
}

const moveTo = (d: DiagramData, id: string, x: number, y: number) =>
  reducer(d, { type: "MOVE_ELEMENT", payload: { id, x, y } } as never) as DiagramData;

describe("T4678 — Paul's case 1: move the task, the label goes with the line into it", () => {
  // A gateway's TOP branch, L-shaped: up from the vertex, then right into the
  // task's left side. The label is source-anchored at the gateway vertex, so
  // moving the TASK moves its line and not its anchor.
  const gatewayToTask = () => labelJustAboveEntry({
    ...connected([
      E({ id: "a", type: "gateway", label: "OK?", x: 200, y: 300, width: 40, height: 40, properties: {} }),
      E({ id: "b", type: "task", label: "Approve", x: 400, y: 150, width: 100, height: 60, properties: {} }),
    ], "top", "left"),
  });

  it("keeps the label 6px above the segment as the task goes up", () => {
    let d = gatewayToTask();
    d = { ...d, connectors: [{ ...conn(d), labelAnchor: "source" }] };
    expect(labelOverSegment(d).gap).toBeCloseTo(6, 5);
    const moved = moveTo(d, "b", 400, 110);
    const after = labelOverSegment(moved);
    expect(after.seg.y, "the segment did go up").toBeLessThan(labelOverSegment(d).seg.y - 30);
    expect(after.gap, "and the label went with it").toBeCloseTo(6, 5);
  });

  it("and back down again", () => {
    let d = gatewayToTask();
    d = { ...d, connectors: [{ ...conn(d), labelAnchor: "source" }] };
    const down = moveTo(d, "b", 400, 190);
    expect(labelOverSegment(down).gap).toBeCloseTo(6, 5);
  });

  it("works for a task-to-task flow, whose anchor moves only HALF as far", () => {
    // A midpoint-anchored label is carried half the distance by the anchor;
    // placing it by its segment, not nudging it, is what makes this right.
    const d = labelJustAboveEntry(connected([
      E({ id: "a", type: "task", label: "Draft", x: 50, y: 300, width: 100, height: 60, properties: {} }),
      E({ id: "b", type: "task", label: "Review", x: 400, y: 150, width: 100, height: 60, properties: {} }),
    ], "top", "left"));
    expect(labelOverSegment(d).gap).toBeCloseTo(6, 5);
    const moved = moveTo(d, "b", 400, 100);
    expect(labelOverSegment(moved).gap).toBeCloseTo(6, 5);
  });
});

describe("T4679 — Paul's case 2: re-route, and the label goes with its segment", () => {
  const zRoute = () => labelJustAboveEntry(connected([
    E({ id: "a", type: "task", label: "Draft", x: 50, y: 100, width: 100, height: 60, properties: {} }),
    E({ id: "b", type: "task", label: "Review", x: 450, y: 300, width: 100, height: 60, properties: {} }),
  ], "right", "left"));

  it("follows a re-route that moves its segment back to where the route belongs", () => {
    // The entry segment has been pushed 40px down, off its natural height, and
    // the label sits 6px above it there. Re-route all recomputes the route and
    // the segment goes back up — so must the label.
    const d = zRoute();
    const c = conn(d);
    const natural = labelOverSegment(d).seg.y;
    const displaced = c.waypoints.map((p, i) =>
      i > 0 && Math.abs(p.y - natural) < 0.5 ? { ...p, y: p.y + 40 } : p);
    const pushed = labelJustAboveEntry({ ...d, connectors: [{ ...c, waypoints: displaced }] });
    expect(labelOverSegment(pushed).seg.y).toBeCloseTo(natural + 40, 5);
    const rerouted = reducer(pushed, { type: "REROUTE_ALL" } as never) as DiagramData;
    const after = labelOverSegment(rerouted);
    expect(after.seg.y, "the re-route did put the segment back").toBeCloseTo(natural, 5);
    expect(after.gap, "and the label came back with it").toBeCloseTo(6, 5);
  });

  it("follows an endpoint moved to another side of the task", () => {
    // Re-attaching the end re-routes the connector: the segment into the
    // task moves, and the label goes with it.
    const d = zRoute();
    const moved = reducer(d, { type: "UPDATE_CONNECTOR_ENDPOINT", payload: {
      connectorId: conn(d).id, endpoint: "target", newElementId: "b", newSide: "left", newOffsetAlong: 0.2,
    } } as never) as DiagramData;
    const before = labelOverSegment(d), after = labelOverSegment(moved);
    expect(after.seg.y, "the entry segment moved").not.toBeCloseTo(before.seg.y, 1);
    expect(after.gap).toBeCloseTo(6, 5);
  });
});

describe("T4680 — only where a route changed, and only sequence flows", () => {
  it("leaves a label alone when its route did not change", () => {
    const d = labelJustAboveEntry(connected([
      E({ id: "a", type: "task", label: "Draft", x: 50, y: 300, width: 100, height: 60, properties: {} }),
      E({ id: "b", type: "task", label: "Review", x: 400, y: 150, width: 100, height: 60, properties: {} }),
      E({ id: "c", type: "task", label: "Elsewhere", x: 800, y: 600, width: 100, height: 60, properties: {} }),
    ], "top", "left"));
    const unrelated = moveTo(d, "c", 800, 500);
    expect(conn(unrelated)).toBe(conn(d));
  });

  it("does not touch a message flow", () => {
    const d = labelJustAboveEntry(connected([
      E({ id: "a", type: "task", label: "Draft", x: 50, y: 300, width: 100, height: 60, properties: {} }),
      E({ id: "b", type: "task", label: "Review", x: 400, y: 150, width: 100, height: 60, properties: {} }),
    ], "top", "left"));
    const asAssoc = { ...d, connectors: [{ ...conn(d), type: "association" } as Connector] };
    const before = connectorLabelBox(conn(asAssoc))!;
    const moved = moveTo(asAssoc, "b", 400, 110);
    // An association is not a sequence flow: whatever its anchor does, this
    // rule does not place it.
    expect(conn(moved).labelOffsetY).toBe(conn(asAssoc).labelOffsetY);
    void before;
  });

  it("runs after every action that can change a route", () => {
    const src = require("node:fs").readFileSync(require("node:path").join(process.cwd(), "app", "hooks", "useDiagram.ts"), "utf8");
    const set = src.slice(src.indexOf("const ROUTE_CHANGING_ACTIONS"), src.indexOf("]);", src.indexOf("const ROUTE_CHANGING_ACTIONS")));
    for (const a of ["MOVE_ELEMENT", "MOVE_ELEMENTS", "RESIZE_ELEMENT", "UPDATE_CONNECTOR_WAYPOINTS",
      "UPDATE_CONNECTOR_ENDPOINT", "REROUTE_ALL", "CORRECT_ALL_CONNECTORS"]) {
      expect(set, `${a} does not run the label-follow pass`).toContain(`"${a}"`);
    }
    expect(set, "a whole-diagram replacement places its own labels").not.toContain('"SET_DATA"');
  });
});

describe("T4681 — which segment a label belongs to, after the route changes", () => {
  const C = (o: Record<string, unknown>) => o as unknown as Connector;

  it("follows the half beside it when its segment SPLITS in two", () => {
    // A gateway's straight middle branch, label source-anchored just above it
    // and wide enough to span where the line will split.
    const before = C({
      type: "sequence", label: "Normal", labelAnchor: "source", labelOffsetX: 40, labelOffsetY: -20,
      waypoints: [{ x: 240, y: 220 }, { x: 350, y: 220 }],
    });
    // The gateway moved up 30: the branch is now a Z, split at x = 280, and
    // the label travelled up with the gateway (its anchor).
    const after = C({ ...before, waypoints: [{ x: 240, y: 190 }, { x: 280, y: 190 }, { x: 280, y: 220 }, { x: 350, y: 220 }] });
    // Both halves share the old span; the far one shares MORE of it. The label
    // belongs with the half beside the gateway, where it already is — so the
    // rule must leave it, not pull it back down to the longer half.
    expect(labelFollowOnRouteChange(before, after)).toBeNull();
  });

  it("never belongs to an invisible leader inside a shape", () => {
    // The only horizontal the label sits over is the hidden leader from the
    // task's edge to its centre. When that leader moves, the label must not:
    // nobody can see the line it would be following.
    const before = C({
      type: "sequence", label: "Yes", targetInvisibleLeader: true, labelOffsetX: 0, labelOffsetY: 0,
      waypoints: [{ x: 100, y: 100 }, { x: 100, y: 300 }, { x: 440, y: 300 }, { x: 440, y: 330 }, { x: 500, y: 330 }],
    });
    const box = connectorLabelBox(before)!;
    // Place the label just above the leader (x 440..500 at y 330).
    const onLeader = C({ ...before, labelOffsetX: 470 - (box.x + box.w / 2) + (before.labelOffsetX as number), labelOffsetY: (330 - 6 - 14) - box.y });
    const moved = C({ ...onLeader, waypoints: [{ x: 100, y: 100 }, { x: 100, y: 300 }, { x: 440, y: 300 }, { x: 440, y: 290 }, { x: 500, y: 290 }] });
    expect(labelFollowOnRouteChange(onLeader, moved)).toBeNull();
  });
});

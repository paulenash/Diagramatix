/**
 * B48–B52 — the red rules added after the V25.05 review (Paul, 2026-08-31).
 *
 * Each guards one fault Paul found in a generated diagram, and each is measured
 * with the RENDERER's metrics, so a violation is something visible rather than
 * an artefact of a nominal label column. The pairs below are deliberate: a rule
 * that only ever fires is as useless as one that never does, so every case that
 * asserts a violation has a sibling asserting silence on the corrected geometry.
 */
import { describe, it, expect } from "vitest";
import {
  checkDataLabelOverlap, checkGatewayBranchVertices, checkConnectorLaneClearance,
  checkLabelEscapesSubprocess, checkMessageLabelOverlap, checkPoolAlignment, checkGatewayInOutVertexClash,
  checkLongDataAssociation,
} from "@/app/lib/diagram/checks/diagramChecks";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (o: Partial<DiagramElement> & { id: string; type: string }): DiagramElement =>
  ({ x: 0, y: 0, width: 100, height: 60, label: "", properties: {}, ...o } as DiagramElement);
const cn = (o: Partial<Connector> & { id: string; sourceId: string; targetId: string }): Connector =>
  ({ type: "sequence", label: "", waypoints: [], ...o } as Connector);

describe("B48 — a data artifact's label must clear what is below it", () => {
  // A 36×46 object at y=0 with a four-line name: the label runs y 53..109.
  const obj = el({ id: "do", type: "data-object", x: 100, y: 0, width: 36, height: 46,
    label: "Transformation Logic and Model Definition" });

  it("T3040 — fires when the wrapped name lands on the task underneath", () => {
    const task = el({ id: "t", type: "task", x: 90, y: 80, width: 107, height: 68, label: "Trigger Job" });
    const v = checkDataLabelOverlap({ elements: [obj, task], connectors: [] });
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("error");
    expect(v[0].ids).toContain("do");
  });

  it("T3041 — silent once the artifact is lifted clear", () => {
    const task = el({ id: "t", type: "task", x: 90, y: 130, width: 107, height: 68, label: "Trigger Job" });
    expect(checkDataLabelOverlap({ elements: [obj, task], connectors: [] })).toHaveLength(0);
  });

  it("T3042 — a SHORT name does not reach the same task", () => {
    // Guards against measuring the 80px column instead of the text: a one-line
    // name is 14px deep, and flagging it would move artifacts that are fine.
    const short = el({ ...obj, id: "do2", label: "Log" } as any);
    const task = el({ id: "t", type: "task", x: 90, y: 80, width: 107, height: 68, label: "Trigger Job" });
    expect(checkDataLabelOverlap({ elements: [short, task], connectors: [] })).toHaveLength(0);
  });
});

describe("B49 — a decision gateway's branches leave from separate points", () => {
  const gw = el({ id: "g", type: "gateway", x: 0, y: 0, width: 40, height: 40, label: "OK?" });
  const mk = (a: string, b: string) => [
    cn({ id: "c1", sourceId: "g", targetId: "x", sourceSide: a as any }),
    cn({ id: "c2", sourceId: "g", targetId: "y", sourceSide: b as any }),
  ];

  it("T3043 — fires when both branches use the same vertex", () => {
    const v = checkGatewayBranchVertices({ elements: [gw], connectors: mk("bottom", "bottom") });
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("same bottom point");
  });

  it("T3044 — silent on top + bottom", () => {
    expect(checkGatewayBranchVertices({ elements: [gw], connectors: mk("top", "bottom") })).toHaveLength(0);
  });

  it("T3045 — four or more branches may double up", () => {
    const conns = ["top", "right", "bottom", "bottom"].map((s, i) =>
      cn({ id: "c" + i, sourceId: "g", targetId: "t" + i, sourceSide: s as any }));
    expect(checkGatewayBranchVertices({ elements: [gw], connectors: conns })).toHaveLength(0);
  });
});

describe("B50 — a horizontal run keeps clear of the lane edge", () => {
  const lane = el({ id: "ln", type: "lane", x: 0, y: 0, width: 1000, height: 300, label: "Ops" });
  const run = (y: number) => [cn({ id: "c", sourceId: "a", targetId: "b",
    waypoints: [{ x: 100, y }, { x: 800, y }] })];

  it("T3046 — fires at 4px from the boundary", () => {
    const v = checkConnectorLaneClearance({ elements: [lane], connectors: run(296) });
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("4px");
  });

  it("T3047 — silent at a comfortable margin", () => {
    expect(checkConnectorLaneClearance({ elements: [lane], connectors: run(260) })).toHaveLength(0);
  });

  it("T3048 — a short stub is not a run", () => {
    const stub = [cn({ id: "c", sourceId: "a", targetId: "b", waypoints: [{ x: 100, y: 296 }, { x: 120, y: 296 }] })];
    expect(checkConnectorLaneClearance({ elements: [lane], connectors: stub })).toHaveLength(0);
  });
});

describe("B51 — a label must not cross its subprocess wall", () => {
  const ep = el({ id: "ep", type: "subprocess-expanded", x: 0, y: 0, width: 400, height: 200, label: "Loop" });
  const child = (y: number, extra: Partial<DiagramElement> = {}) =>
    el({ id: "ie", type: "intermediate-event", x: 100, y, width: 36, height: 36,
      label: "Transformation job result received", parentId: "ep", ...extra });

  it("T3049 — fires when a wrapped name hangs through the floor", () => {
    const v = checkLabelEscapesSubprocess({ elements: [ep, child(150)], connectors: [] });
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("bottom edge");
  });

  it("T3050 — silent when the box is sized around the label", () => {
    expect(checkLabelEscapesSubprocess({ elements: [ep, child(90)], connectors: [] })).toHaveLength(0);
  });

  it("T3051 — an edge-mounted event's outward label is not a violation", () => {
    // R7.05 places a boundary event's label OUTSIDE the host on purpose.
    const mounted = child(150, { boundaryHostId: "ep" });
    expect(checkLabelEscapesSubprocess({ elements: [ep, mounted], connectors: [] })).toHaveLength(0);
  });
});

describe("B52 — message labels must not be drawn on top of each other", () => {
  const mk = (offY: number) => cn({
    id: "m" + offY, sourceId: "s", targetId: "t", type: "messageBPMN",
    label: "Job completion status and run log", labelOffsetX: 0, labelOffsetY: offY,
    waypoints: [{ x: 0, y: 0 }, { x: 0, y: 100 }],
  });

  it("T3052 — fires when two labels land at the same height", () => {
    const v = checkMessageLabelOverlap({ elements: [], connectors: [mk(10), mk(10)] });
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("error");
  });

  it("T3053 — silent once they are staggered by a full line", () => {
    expect(checkMessageLabelOverlap({ elements: [], connectors: [mk(0), mk(20)] })).toHaveLength(0);
  });
});

describe("B53 — pools in one diagram share a left edge", () => {
  const pool = (id: string, x: number) =>
    el({ id, type: "pool", x, y: 0, width: 4149, height: 120, label: id });

  it("T3054 — fires on the pool that has been nudged sideways", () => {
    // The exact geometry Paul exported: two pools at 50, one at -1.43.
    const v = checkPoolAlignment({
      elements: [pool("Organisation", 50), pool("Transformation Tooling", -1.4285714285715585), pool("Data Warehouse", 50)],
      connectors: [],
    });
    expect(v).toHaveLength(1);
    expect(v[0].ids).toEqual(["Transformation Tooling"]);
    expect(v[0].message).toContain("x=50");
  });

  it("T3055 — silent when every pool starts at the same x", () => {
    expect(checkPoolAlignment({
      elements: [pool("a", 50), pool("b", 50), pool("c", 50)],
      connectors: [],
    })).toHaveLength(0);
  });
});

describe("B54 — a gateway's outgoing must not share a vertex with an incoming", () => {
  const gw = el({ id: "g", type: "gateway", x: 0, y: 0, width: 40, height: 40, label: "OK?" });
  const io = (outSide: string) => [
    cn({ id: "i1", sourceId: "a", targetId: "g", targetSide: "top" as any }),
    cn({ id: "i2", sourceId: "b", targetId: "g", targetSide: "bottom" as any }),
    cn({ id: "o1", sourceId: "g", targetId: "c", sourceSide: outSide as any }),
  ];

  it("T3057 — fires when the outgoing leaves by a vertex an incoming arrives on", () => {
    // The exact fault Paul found: both incomings on top/bottom, and the
    // outgoing stapled to bottom by the loop-back rule.
    const v = checkGatewayInOutVertexClash({ elements: [gw], connectors: io("bottom") });
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("error");
    expect(v[0].message).toContain("bottom vertex");
  });

  it("T3058 — silent when the outgoing takes the free right vertex", () => {
    expect(checkGatewayInOutVertexClash({ elements: [gw], connectors: io("right") })).toHaveLength(0);
  });

  it("T3059 — not reported once a diamond's four points cannot go round", () => {
    const busy = [
      ...io("right"),
      cn({ id: "i3", sourceId: "d", targetId: "g", targetSide: "left" as any }),
      cn({ id: "i4", sourceId: "e", targetId: "g", targetSide: "right" as any }),
    ];
    expect(checkGatewayInOutVertexClash({ elements: [gw], connectors: busy })).toHaveLength(0);
  });
});

describe("B48 — a data artifact must clear the flow lines under its label too", () => {
  const obj = el({ id: "do", type: "data-object", x: 100, y: 0, width: 36, height: 46,
    label: "Transformation Logic and Model Definition" });

  it("T3065 — fires when the wrapped name lands on a sequence connector", () => {
    // The exact shape Paul found: the first data object's name across the flow
    // out of the start event.
    const flow = cn({ id: "f", sourceId: "s", targetId: "t",
      waypoints: [{ x: 40, y: 90 }, { x: 400, y: 90 }] });
    const v = checkDataLabelOverlap({ elements: [obj], connectors: [flow] });
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("drawn across the connector");
  });

  it("T3066 — silent when the flow runs clear below the name", () => {
    const flow = cn({ id: "f", sourceId: "s", targetId: "t",
      waypoints: [{ x: 40, y: 200 }, { x: 400, y: 200 }] });
    expect(checkDataLabelOverlap({ elements: [obj], connectors: [flow] })).toHaveLength(0);
  });

  it("T3067 — the artifact's OWN association is never a violation", () => {
    // It leaves the shape and runs to its element, so it passes the label by
    // construction; treating that as a fault would chase the object up the page.
    const own = cn({ id: "a", sourceId: "do", targetId: "t", type: "associationBPMN",
      waypoints: [{ x: 118, y: 90 }, { x: 400, y: 90 }] });
    expect(checkDataLabelOverlap({ elements: [obj], connectors: [own] })).toHaveLength(0);
  });
});

describe("B55 — a data association must not run across the diagram", () => {
  // A wide diagram: two tasks far apart, so the fraction test has room to differ
  // from the absolute one.
  const wide = (gap: number) => [
    el({ id: "t1", type: "task", x: 0, y: 100, width: 100, height: 60, label: "Write It" }),
    el({ id: "t2", type: "task", x: gap, y: 100, width: 100, height: 60, label: "Read It Later" }),
    el({ id: "do", type: "data-object", x: 20, y: 0, width: 36, height: 46, label: "Model Definition" }),
  ];
  const link = (type: string) => cn({ id: "a", sourceId: "do", targetId: "t2", type });

  it("T3068 — fires on an association crossing most of the diagram", () => {
    const v = checkLongDataAssociation({ elements: wide(3000), connectors: [link("associationBPMN")] });
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("Repeat");
    expect(v[0].message).toContain("Model Definition");
  });

  it("T3069 — silent on a short hop", () => {
    expect(checkLongDataAssociation({ elements: wide(300), connectors: [link("associationBPMN")] })).toHaveLength(0);
  });

  it("T3070 — a long hop that is a SMALL part of a wide diagram is left alone", () => {
    // 700px is over the absolute threshold but only ~7% of a 10,000px diagram —
    // the reason both tests must pass, not either.
    const els2 = [
      el({ id: "t1", type: "task", x: 0, y: 100, width: 100, height: 60, label: "A" }),
      el({ id: "t2", type: "task", x: 700, y: 100, width: 100, height: 60, label: "B" }),
      el({ id: "far", type: "task", x: 10000, y: 100, width: 100, height: 60, label: "Far" }),
      el({ id: "do", type: "data-object", x: 20, y: 0, width: 36, height: 46, label: "Doc" }),
    ];
    expect(checkLongDataAssociation({ elements: els2, connectors: [link("associationBPMN")] })).toHaveLength(0);
  });

  it("T3071 — a big FRACTION that is only a short distance is left alone too", () => {
    // 90% of a 400px diagram is still only 360px: nothing to fix.
    expect(checkLongDataAssociation({ elements: wide(360), connectors: [link("associationBPMN")] })).toHaveLength(0);
  });

  it("T3072 — matched by ENDPOINT, so a plan-typed 'sequence' data link still counts", () => {
    // The AI plan can only emit sequence/message; data links are re-typed later.
    // Matching on connector type alone would miss them.
    const v = checkLongDataAssociation({ elements: wide(3000), connectors: [link("sequence")] });
    expect(v).toHaveLength(1);
  });
});

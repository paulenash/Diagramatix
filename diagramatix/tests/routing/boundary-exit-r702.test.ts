/**
 * T4791-T4796, T4800, T4801, T4803 — a flow leaves a boundary event from the
 * point furthest from its host edge, everywhere (Block 2 Test 3, 25 September
 * 2026) — and the diagram checks expect the same side the reducer draws.
 *
 * Paul's R7.02, verbatim from the User Guide:
 *
 *   "A connector from a boundary-mounted intermediate event exits from the
 *    event's connection point furthest from the host edge the event is mounted
 *    upon."
 *
 * "connect event four to assess work completed" drew the flow out of Event 4's
 * EAST point, which sits on the subprocess's bottom boundary line, so the flow
 * ran along that line to the corner. Paul: "connector must leave event on the
 * southmost point not on the point on the Expanded Subprocess boundary".
 *
 * Two causes, both covered here: nothing applied the rule when a connector was
 * created (addConnector's "right"/"left" defaults went straight in), and the
 * shared rule itself treated anything within 36px of a corner as a corner —
 * exactly where the assist mounts its first boundary event.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import {
  pickBoundaryEventSide, getBoundaryEventOuterSide, boundaryEndpointSides, withBoundaryEndpointSides,
  isAxisAligned, rectifyWaypoints, oppositeSide, boundaryEndSide, outerSideOfBox,
} from "@/app/lib/diagram/routing";
import {
  checkBoundaryIntermediateOutgoingOuter, checkEdgeMountEventOuterRouting, checkBoundaryStartOutgoingInner,
  checkBoundaryStartIncomingOuter, checkBoundaryEndIncomingInner,
} from "@/app/lib/diagram/checks/diagramChecks";
import { placeBoundaryEvent, HALF_EVENT_W } from "@/app/lib/diagram/assistPlacement";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import type { Connector, DiagramData, DiagramElement, Point, Side, SymbolType } from "@/app/lib/diagram/types";
import { paulsDiagram } from "./_helpers/block2Test3";

type Extra = Partial<DiagramElement>;
const el = (id: string, type: SymbolType, x: number, y: number, w: number, h: number, extra: Extra = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: {}, ...extra } as DiagramElement);
const data = (elements: DiagramElement[], connectors: Connector[] = []): DiagramData =>
  ({ elements, connectors, viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData);
const run = (d: DiagramData, ...actions: Action[]) => actions.reduce((s, a) => reducer(s, a), d);
/** The payload addConnector sends when the caller chose nothing — "right" / "left". */
const addConn = (sourceId: string, targetId: string, extra: Record<string, unknown> = {}): Action => ({
  type: "ADD_CONNECTOR",
  payload: {
    sourceId, targetId, connectorType: "sequence", directionType: "directed", routingType: "rectilinear",
    sourceSide: "right", targetSide: "left", ...extra,
  },
} as Action);

/** An event of `size` centred on (cx, cy), mounted on `hostId`. */
const mounted = (id: string, cx: number, cy: number, hostId: string, extra: Extra = {}) =>
  el(id, "intermediate-event", cx - HALF_EVENT_W, cy - HALF_EVENT_W, 36, 36, { boundaryHostId: hostId, ...extra });

// A host EP [x 100..500, y 100..300].
const HOST = el("ep", "subprocess-expanded", 100, 100, 400, 200);
const L = HOST.x, R = HOST.x + HOST.width, T = HOST.y, B = HOST.y + HOST.height;

/** Targets well outside the host in all eight directions. */
const OUTSIDE: Array<[string, DiagramElement]> = [
  ["N", el("tN", "task", 250, -200, 102, 65)], ["NE", el("tNE", "task", 800, -200, 102, 65)],
  ["E", el("tE", "task", 800, 170, 102, 65)], ["SE", el("tSE", "task", 800, 600, 102, 65)],
  ["S", el("tS", "task", 250, 600, 102, 65)], ["SW", el("tSW", "task", -400, 600, 102, 65)],
  ["W", el("tW", "task", -400, 170, 102, 65)], ["NW", el("tNW", "task", -400, -200, 102, 65)],
];

/** Events on each edge: mid-edge, 36px from each corner (the assist's first slot), and overhanging a corner by 8px. */
const ON_EDGE: Array<{ name: string; side: Side; at: Point }> = [
  { name: "mid top", side: "top", at: { x: 300, y: T } },
  { name: "mid right", side: "right", at: { x: R, y: 200 } },
  { name: "mid bottom", side: "bottom", at: { x: 300, y: B } },
  { name: "mid left", side: "left", at: { x: L, y: 200 } },
  { name: "bottom, 36px from bottom-right", side: "bottom", at: { x: R - 36, y: B } },
  { name: "bottom, 36px from bottom-left", side: "bottom", at: { x: L + 36, y: B } },
  { name: "top, 36px from top-right", side: "top", at: { x: R - 36, y: T } },
  { name: "top, 36px from top-left", side: "top", at: { x: L + 36, y: T } },
  { name: "right, 36px from bottom-right", side: "right", at: { x: R, y: B - 36 } },
  { name: "left, 36px from top-left", side: "left", at: { x: L, y: T + 36 } },
  { name: "bottom, overhanging bottom-right by 8px", side: "bottom", at: { x: R - 10, y: B } },
  { name: "top, overhanging top-left by 8px", side: "top", at: { x: L + 10, y: T } },
];

describe("T4791 — pickBoundaryEventSide is R7.02, with no near-corner exception", () => {
  for (const c of ON_EDGE) {
    it(`${c.name}: every outside target → the ${c.side} point`, () => {
      const ev = mounted("ev", c.at.x, c.at.y, "ep");
      for (const [dir, tgt] of OUTSIDE) {
        expect(pickBoundaryEventSide(ev, tgt, [HOST, ev, tgt]), `target ${dir}`).toBe(c.side);
      }
    });
  }

  it("a target INSIDE the host takes the inner point (a boundary start's flow into its EP)", () => {
    const inner = el("in", "task", 250, 150, 102, 65);
    for (const c of ON_EDGE) {
      const ev = mounted("ev", c.at.x, c.at.y, "ep");
      expect(pickBoundaryEventSide(ev, inner, [HOST, ev, inner]), c.name).toBe(oppositeSide(c.side));
    }
  });

  it("an event whose centre is ON a corner still faces its target (T1060-T1062 keep their answers)", () => {
    const ev = mounted("ev", R, B, "ep");
    expect(pickBoundaryEventSide(ev, el("t", "task", 800, 250, 36, 36), [HOST, ev])).toBe("right");
    expect(pickBoundaryEventSide(ev, el("t", "task", 480, 600, 36, 36), [HOST, ev])).toBe("bottom");
  });

  it("one rule, one place: the assist's first boundary slot is never read as a corner", () => {
    // placeBoundaryEvent (rule 3) mounts the first event 18px in from the
    // bottom-right corner — its centre 36px away. The old corner test swallowed
    // exactly that spot. If the two drift apart again, this fails.
    for (const host of [HOST, el("task", "task", 600, 400, 102, 65)]) {
      const spot = placeBoundaryEvent(host, [])!;
      const ev = mounted("first", spot.x, spot.y, host.id);
      expect(getBoundaryEventOuterSide(ev, [host, ev])).toBe("bottom");
      for (const [dir, tgt] of OUTSIDE) {
        const far = { ...tgt, x: tgt.x + host.x, y: tgt.y + host.y };
        expect(pickBoundaryEventSide(ev, far, [host, ev]), `${host.id} target ${dir}`).toBe("bottom");
      }
    }
  });
});

describe("T4792 — ADD_CONNECTOR applies R7.02 whatever side the caller sent", () => {
  for (const c of ON_EDGE) {
    it(`${c.name}: a flow to an outside task leaves the ${c.side} point, centred`, () => {
      const ev = mounted("ev", c.at.x, c.at.y, "ep");
      for (const [dir, tgt] of OUTSIDE) {
        const out = run(data([HOST, ev, tgt]), addConn("ev", tgt.id));
        const conn = out.connectors.find((x) => x.sourceId === "ev");
        expect(conn, `target ${dir}`).toBeDefined();
        expect(conn!.sourceSide, `target ${dir}`).toBe(c.side);
        expect(conn!.sourceOffsetAlong, `target ${dir}`).toBe(0.5);
      }
    });
  }

  it("holds under force too — force overrides legality, not geometry", () => {
    const ev = mounted("ev", R - 36, B, "ep");
    const tgt = el("t", "task", 800, 0, 102, 65);
    const out = run(data([HOST, ev, tgt]), addConn("ev", "t", { force: true }));
    expect(out.connectors[0].sourceSide).toBe("bottom");
  });

  it("the flow's first visible point is the event's outer point, and nothing runs on the host's edge line", () => {
    const ev = mounted("ev", R - 36, B, "ep");
    const tgt = el("t", "task", 700, 120, 102, 65);                   // up and to the right, like Event 4's target
    const out = run(data([HOST, ev, tgt]), addConn("ev", "t"));
    const w = out.connectors[0].waypoints;
    expect(w[1]).toEqual({ x: R - 36, y: B + 18 });                   // the south point
    for (const p of w.slice(1)) {
      const onBottomLine = Math.abs(p.y - B) < 0.5 && p.x >= L && p.x <= R;
      const inside = p.x > L && p.x < R && p.y > T && p.y < B;
      expect(onBottomLine || inside, `waypoint (${p.x},${p.y})`).toBe(false);
    }
  });

  it("a connector between two plain tasks keeps the sides it was given", () => {
    const a = el("a", "task", 0, 0, 102, 65), b = el("b", "task", 300, 0, 102, 65);
    const out = run(data([a, b]), addConn("a", "b"));
    expect([out.connectors[0].sourceSide, out.connectors[0].targetSide]).toEqual(["right", "left"]);
  });
});

describe("T4793 — the same rule for the other boundary roles", () => {
  const inner = el("inner", "task", 250, 150, 102, 65, { parentId: "ep" });
  const outer = el("outer", "task", -300, 170, 102, 65);

  it("a boundary START's flow into its EP leaves the inner point", () => {
    const st = el("st", "start-event", L - 18, 182, 36, 36, { boundaryHostId: "ep" });
    const out = run(data([HOST, st, inner]), addConn("st", "inner"));
    expect(out.connectors[0].sourceSide).toBe("right");                // mounted left → inner = right
  });

  it("a flow INTO a boundary START arrives at its outer point", () => {
    const st = el("st", "start-event", L - 18, 182, 36, 36, { boundaryHostId: "ep" });
    const out = run(data([HOST, st, outer]), addConn("outer", "st"));
    expect(out.connectors[0].targetSide).toBe("left");
  });

  it("a flow INTO a boundary END arrives at its inner point", () => {
    const en = el("en", "end-event", R - 18, 182, 36, 36, { boundaryHostId: "ep" });
    const out = run(data([HOST, en, inner]), addConn("inner", "en"));
    expect(out.connectors[0].targetSide).toBe("left");                 // mounted right → inner = left
  });

  it("a compensation association leaves a compensation boundary event from its outer point", () => {
    const task = el("act", "task", 100, 100, 102, 65);
    const comp = mounted("comp", 184, 165, "act", { eventType: "compensation" });
    const handler = el("undo", "task", 300, 260, 102, 65);
    const out = run(data([task, comp, handler]), addConn("comp", "undo"));
    const c = out.connectors.find((x) => x.sourceId === "comp")!;
    expect(c.type).toBe("associationBPMN");
    expect(c.sourceSide).toBe("bottom");
  });

  it("boundaryEndpointSides governs sequence flows and compensation links only", () => {
    const ev = mounted("ev", 300, B, "ep");
    const t = el("t", "task", 250, 600, 102, 65);
    expect(boundaryEndpointSides("sequence", ev, t, [HOST, ev, t])).toEqual({ sourceSide: "bottom" });
    expect(boundaryEndpointSides("messageBPMN", ev, t, [HOST, ev, t])).toEqual({});
    expect(boundaryEndpointSides("associationBPMN", ev, t, [HOST, ev, t])).toEqual({});
  });
});

describe("T4795 — mounting an event, or sliding it to another edge, re-picks its flows' side", () => {
  const task = el("host", "task", 300, 300, 102, 65);                 // x 300..402, y 300..365
  const next = el("next", "task", 600, 150, 102, 65);

  it("connect first, then mount with SET_EVENT_BOUNDARY → the flow moves to the outer point", () => {
    const free = el("ev", "intermediate-event", 332, 350, 36, 36, { eventType: "timer" });
    const s1 = run(data([task, free, next]), addConn("ev", "next"));
    expect(s1.connectors[0].sourceSide).toBe("right");                  // a free event keeps what it was given
    const s2 = run(s1, { type: "SET_EVENT_BOUNDARY", payload: { id: "ev", hostId: "host" } });
    expect(s2.elements.find((e) => e.id === "ev")!.boundaryHostId).toBe("host");
    expect(s2.connectors[0].sourceSide).toBe("bottom");
    expect(s2.connectors[0].waypoints[1].y).toBeCloseTo(365 + 18, 5);
  });

  it("connect first, then drop onto the edge (MOVE_END snap) → the outer point", () => {
    const free = el("ev", "intermediate-event", 500, 500, 36, 36, { eventType: "timer" });
    const s1 = run(data([task, free, next]), addConn("ev", "next"));
    const s2 = run(s1,
      { type: "MOVE_ELEMENT", payload: { id: "ev", x: 332, y: 350 } } as Action,
      { type: "MOVE_END", payload: { id: "ev" } } as Action);
    expect(s2.elements.find((e) => e.id === "ev")!.boundaryHostId).toBe("host");
    expect(s2.connectors[0].sourceSide).toBe("bottom");
  });

  // Slide an event round each corner onto the next edge.
  const slides: Array<{ from: string; to: Side; start: Point; drag: Point }> = [
    { from: "bottom", to: "right", start: { x: 380, y: 365 }, drag: { x: 402, y: 330 } },
    { from: "right", to: "top", start: { x: 402, y: 330 }, drag: { x: 380, y: 300 } },
    { from: "top", to: "left", start: { x: 330, y: 300 }, drag: { x: 300, y: 330 } },
    { from: "left", to: "bottom", start: { x: 300, y: 330 }, drag: { x: 330, y: 365 } },
  ];
  for (const s of slides) {
    it(`slid from the ${s.from} edge onto the ${s.to} edge → the ${s.to} point`, () => {
      const ev = mounted("ev", s.start.x, s.start.y, "host");
      const far = el("far", "task", 900, 900, 102, 65);
      const s1 = run(data([task, ev, far]), addConn("ev", "far"));
      expect(s1.connectors[0].sourceSide).toBe(s.from);
      const s2 = run(s1, { type: "MOVE_ELEMENT", payload: { id: "ev", x: s.drag.x - 18, y: s.drag.y - 18 } } as Action);
      const moved = s2.elements.find((e) => e.id === "ev")!;
      expect(getBoundaryEventOuterSide(moved, s2.elements)).toBe(s.to);
      expect(s2.connectors[0].sourceSide).toBe(s.to);
      expect(s2.connectors[0].sourceOffsetAlong).toBe(0.5);
    });
  }

  it("a deliberately placed end survives a slide ALONG the same edge, and is re-picked round a corner", () => {
    const ev = mounted("ev", 330, 365, "host");
    const far = el("far", "task", 900, 900, 102, 65);
    const s1 = run(data([task, ev, far]), addConn("ev", "far"));
    const id = s1.connectors[0].id;
    const s2 = run(s1, { type: "UPDATE_CONNECTOR_ENDPOINT", payload: { connectorId: id, endpoint: "source", newElementId: "ev", newSide: "bottom", newOffsetAlong: 0.3 } } as Action);
    expect([s2.connectors[0].sourceSide, s2.connectors[0].sourceOffsetAlong]).toEqual(["bottom", 0.3]);
    const s3 = run(s2, { type: "MOVE_ELEMENT", payload: { id: "ev", x: 360 - 18, y: 365 - 18 } } as Action);
    expect([s3.connectors[0].sourceSide, s3.connectors[0].sourceOffsetAlong], "same edge — the user's placement stays")
      .toEqual(["bottom", 0.3]);
    const s4 = run(s3, { type: "MOVE_ELEMENT", payload: { id: "ev", x: 402 - 18, y: 330 - 18 } } as Action);
    expect([s4.connectors[0].sourceSide, s4.connectors[0].sourceOffsetAlong], "another edge — R7.02 decides again")
      .toEqual(["right", 0.5]);
  });

  it("withBoundaryEndpointSides only touches the moved event's own end", () => {
    const ev = mounted("ev", 330, 365, "host");
    const conn = { id: "c", type: "sequence", sourceId: "ev", targetId: "far", sourceSide: "right", targetSide: "top", targetOffsetAlong: 0.2 } as Connector;
    const far = el("far", "task", 900, 900, 102, 65);
    const out = withBoundaryEndpointSides(conn, "ev", [task, ev, far]);
    expect([out.sourceSide, out.sourceOffsetAlong, out.targetSide, out.targetOffsetAlong]).toEqual(["bottom", 0.5, "top", 0.2]);
    expect(withBoundaryEndpointSides(conn, "someone-else", [task, ev, far])).toBe(conn);
  });
});

describe("T4796 — CORRECT_ALL_CONNECTORS leaves an already right-angled route alone", () => {
  const correctAll = (d: DiagramData) => reducer(d, { type: "CORRECT_ALL_CONNECTORS" });

  it("a bottom exit whose target lies back up and to the right is not doubled back", () => {
    const a = el("a", "task", 100, 300, 102, 65);
    const b = el("b", "task", 400, 150, 102, 65);
    const s = run(data([a, b]), addConn("a", "b", { sourceSide: "bottom" }));
    const before = s.connectors[0].waypoints;
    expect(before.length).toBeGreaterThanOrEqual(7);
    expect(isAxisAligned(before)).toBe(true);
    // Not vacuous: the old pass WOULD have rewritten this one.
    expect(rectifyWaypoints(before, "bottom")).not.toEqual(before);
    expect(correctAll(s).connectors[0].waypoints).toEqual(before);
  });

  it("Event 4's south exit survives the pass that runs after every move", () => {
    const ev = mounted("ev", R - 36, B, "ep");
    const tgt = el("t", "task", 700, 120, 102, 65);
    const s = run(data([HOST, ev, tgt]), addConn("ev", "t"));
    const before = s.connectors[0].waypoints;
    expect(correctAll(s).connectors[0].waypoints).toEqual(before);
  });

  it("a route with a diagonal segment is still rectified", () => {
    const a = el("a", "task", 0, 18, 100, 64), b = el("b", "task", 300, 88, 100, 64);
    const diag: Connector = {
      id: "d", sourceId: "a", targetId: "b", sourceSide: "right", targetSide: "left", type: "sequence",
      directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: true, targetInvisibleLeader: true,
      waypoints: [{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 170, y: 50 }, { x: 200, y: 80 }, { x: 230, y: 120 }, { x: 300, y: 120 }, { x: 350, y: 120 }],
    };
    expect(isAxisAligned(diag.waypoints)).toBe(false);
    const out = correctAll(data([a, b], [diag])).connectors[0].waypoints;
    expect(out).not.toEqual(diag.waypoints);
    expect(isAxisAligned(out)).toBe(true);
  });

  it("across the layout corpus, no right-angled route is changed", () => {
    const DIR = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");
    let checked = 0, changed = 0;
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".plan.json"))) {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
      const r = layoutBpmnDiagram(plan.elements, plan.connections);
      const after = correctAll(data(r.elements, r.connectors));
      for (const c of r.connectors) {
        if (c.routingType !== "rectilinear" || c.waypoints.length < 7 || !isAxisAligned(c.waypoints)) continue;
        checked++;
        if (JSON.stringify(after.connectors.find((x) => x.id === c.id)!.waypoints) !== JSON.stringify(c.waypoints)) changed++;
      }
    }
    expect(checked, "the corpus must exercise the pass").toBeGreaterThan(100);
    expect(changed).toBe(0);
  });
});


describe("T4794 — voice “connect event four to assess work completed” (L4, headless)", () => {
  const host = paulsDiagram().elements.find((e) => e.id === "rework")!;
  const hostBottom = host.y + host.height;
  const offHost = (w: Point[]) => w.slice(1).every((p) => {
    const inside = p.x > host.x && p.x < host.x + host.width && p.y > host.y && p.y < hostBottom;
    const onBottomLine = Math.abs(p.y - hostBottom) < 0.5 && p.x >= host.x && p.x <= host.x + host.width;
    return !inside && !onBottomLine;
  });

  it("leaves Event 4's south point, and no point sits on or inside the subprocess", () => {
    const h = headlessDiagram(paulsDiagram());
    const r = applyAssistOps(parseCommand("connect event four to assess work completed")!, h.context());
    expect(r.ok, r.summary).toBe(true);
    const c = h.data.connectors.find((x) => x.sourceId === "ev4")!;
    expect(c.sourceSide).toBe("bottom");
    expect(c.sourceOffsetAlong).toBe(0.5);
    const ev = h.data.elements.find((e) => e.id === "ev4")!;
    expect(c.waypoints[1].x).toBeCloseTo(ev.x + ev.width / 2, 5);
    expect(c.waypoints[1].y).toBeCloseTo(ev.y + ev.height, 5);
    expect(offHost(c.waypoints)).toBe(true);
  });

  it("stays that way after the target is moved (the move ends with CORRECT_ALL)", () => {
    const h = headlessDiagram(paulsDiagram());
    applyAssistOps(parseCommand("connect event four to assess work completed")!, h.context());
    h.actions.moveElements(["assess"], 40, 0);
    h.actions.elementsMoveEnd();
    const c = h.data.connectors.find((x) => x.sourceId === "ev4")!;
    expect(c.sourceSide).toBe("bottom");
    expect(offHost(c.waypoints)).toBe(true);
  });
});

describe("T4800 — the generated corpus: V16.06's rejected-submission exit leaves by its mounted edge", () => {
  it("“GRC submission rejected” (24px from the corner) exits bottom, clear of its host", () => {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "V16.06.plan.json"), "utf8"));
    const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
    const r = layoutBpmnDiagram(plan.elements, plan.connections);
    const ev = r.elements.find((e) => e.label === "GRC submission rejected" && e.boundaryHostId)!;
    expect(ev).toBeDefined();
    const host = r.elements.find((e) => e.id === ev.boundaryHostId)!;
    expect(getBoundaryEventOuterSide(ev, r.elements)).toBe("bottom");
    const c = r.connectors.find((x) => x.sourceId === ev.id && x.type === "sequence")!;
    expect(c.sourceSide).toBe("bottom");
    for (const p of c.waypoints.slice(1)) {
      const onOrInside = p.x >= host.x && p.x <= host.x + host.width && p.y >= host.y && p.y <= host.y + host.height;
      expect(onOrInside, `waypoint (${Math.round(p.x)},${Math.round(p.y)})`).toBe(false);
    }
  });
});

describe("T4801 — the diagram checks expect the side the reducer draws, corner included", () => {
  /** Every check that judges a boundary event's attachment side. */
  const sideChecks = (d: DiagramData) => [
    ...checkBoundaryIntermediateOutgoingOuter(d), ...checkEdgeMountEventOuterRouting(d),
    ...checkBoundaryStartOutgoingInner(d), ...checkBoundaryStartIncomingOuter(d), ...checkBoundaryEndIncomingInner(d),
  ];
  const corners: Point[] = [{ x: L, y: T }, { x: R, y: T }, { x: R, y: B }, { x: L, y: B }];

  it("an error event slid onto the host's corner and connected east: the reducer gives right, and B27 agrees", () => {
    const ev = mounted("ev", 300, B, "ep", { eventType: "error" });
    const east = el("east", "task", 800, 218, 102, 65);
    const s = run(data([HOST, ev, east]),
      { type: "MOVE_ELEMENT", payload: { id: "ev", x: 520 - 18, y: 330 - 18 } } as Action,
      addConn("ev", "east"));
    const moved = s.elements.find((e) => e.id === "ev")!;
    expect([moved.x + 18, moved.y + 18], "snapped ON the corner").toEqual([R, B]);
    expect(s.connectors[0].sourceSide).toBe("right");
    // Not vacuous: the plain "which edge" answer for that spot is the other one.
    expect(outerSideOfBox(moved, HOST)).toBe("bottom");
    expect(checkBoundaryIntermediateOutgoingOuter(s)).toEqual([]);
  });

  it("every flow the reducer draws from an edge-mounted intermediate event passes every side check", () => {
    const spots = [...ON_EDGE.map((c) => ({ name: c.name, at: c.at })), ...corners.map((at) => ({ name: `corner ${at.x},${at.y}`, at }))];
    for (const spot of spots) {
      for (const [dir, tgt] of OUTSIDE) {
        const ev = mounted("ev", spot.at.x, spot.at.y, "ep");
        const s = run(data([HOST, ev, tgt]), addConn("ev", tgt.id));
        expect(s.connectors, `${spot.name} → ${dir}`).toHaveLength(1);
        expect(sideChecks(s), `${spot.name} → ${dir}`).toEqual([]);
      }
    }
  });

  it("…and the other roles on a corner: into a Start, out of a Start, into an End, into an event (forced)", () => {
    const east = el("east", "task", 800, 218, 102, 65);
    const inner = el("inner", "task", 250, 150, 102, 65, { parentId: "ep" });
    for (const at of corners) {
      const pos = { x: at.x - 18, y: at.y - 18 };
      const st = el("st", "start-event", pos.x, pos.y, 36, 36, { boundaryHostId: "ep" });
      const en = el("en", "end-event", pos.x, pos.y, 36, 36, { boundaryHostId: "ep" });
      const ev = mounted("ev", at.x, at.y, "ep");
      const made = [
        run(data([HOST, st, east]), addConn("east", "st")),
        run(data([HOST, st, inner]), addConn("st", "inner")),
        run(data([HOST, en, inner]), addConn("inner", "en")),
        run(data([HOST, ev, east]), addConn("east", "ev", { force: true })),
      ];
      for (const s of made) {
        expect(s.connectors, `corner ${at.x},${at.y}`).toHaveLength(1);
        expect(sideChecks(s), `corner ${at.x},${at.y}`).toEqual([]);
      }
    }
  });

  it("a flow stored on the event's perpendicular point is still flagged, naming the outer point", () => {
    const ev = mounted("ev", 300, B, "ep");
    const tgt = el("t", "task", 800, 170, 102, 65);
    const bad: Connector = {
      id: "c", sourceId: "ev", targetId: "t", sourceSide: "right", targetSide: "left", type: "sequence",
      directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: true, targetInvisibleLeader: true,
      waypoints: [],
    };
    const v = checkBoundaryIntermediateOutgoingOuter(data([HOST, ev, tgt], [bad]));
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/must emit from the OUTER side \("bottom"\)/);
  });
});

describe("T4803 — a connector end on a boundary event takes its side by ROLE: a Start's outgoing and an End's incoming flow use the inner point", () => {
  const st = el("st", "start-event", L - 18, 182, 36, 36, { boundaryHostId: "ep", label: "Kickoff" });
  const en = el("en", "end-event", R - 18, 182, 36, 36, { boundaryHostId: "ep", label: "Finish" });

  it("Start → End on one subprocess: the rule gives both ends their INNER point (geometry alone read each as outside the other)", () => {
    const all = [HOST, st, en];
    expect(boundaryEndpointSides("sequence", st, en, all)).toEqual({ sourceSide: "right", targetSide: "left" });
    // What the role-blind geometry says — the outer points, a route round the outside of the host.
    expect([pickBoundaryEventSide(st, en, all), pickBoundaryEventSide(en, st, all)]).toEqual(["left", "right"]);
  });

  it("the reducer: a Start's flow to its own child leaves the inner point even when the child's centre lies past the host's edge", () => {
    const hanging = el("hang", "task", 450, 150, 102, 65, { parentId: "ep" });   // centre x 501, the host ends at 500
    expect(pickBoundaryEventSide(st, hanging, [HOST, st, hanging])).toBe("left");
    const s = run(data([HOST, st, hanging]), addConn("st", "hang"));
    expect(s.connectors[0].sourceSide).toBe("right");
    expect(checkBoundaryStartOutgoingInner(s)).toEqual([]);
  });

  it("boundaryEndSide: a Start's outgoing and an End's incoming end are inner wherever the other end is; the rest is pickBoundaryEventSide", () => {
    const far = el("far", "task", -400, 170, 102, 65);                       // outside, west
    const inner = el("inner", "task", 250, 150, 102, 65, { parentId: "ep" });
    const ev = mounted("ev", 300, B, "ep");
    const all = [HOST, st, en, ev, far, inner];
    expect(boundaryEndSide(st, "source", far, all)).toBe("right");          // inner, though `far` is outside
    expect(boundaryEndSide(st, "source", en, all)).toBe("right");
    expect(boundaryEndSide(st, "target", far, all)).toBe("left");           // an outside trigger: outer
    expect(boundaryEndSide(en, "target", st, all)).toBe("left");
    expect(boundaryEndSide(en, "target", far, all)).toBe("left");
    for (const other of [far, inner, en]) {
      expect(boundaryEndSide(ev, "source", other, all), other.id).toBe(pickBoundaryEventSide(ev, other, all));
    }
    expect(boundaryEndSide(far, "source", ev, all)).toBeNull();
  });
});

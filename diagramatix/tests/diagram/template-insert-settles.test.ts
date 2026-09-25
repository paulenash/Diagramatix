/**
 * T4863–T4875 — a template insert SETTLES (issue 6a): all the geometry first,
 * then the connectors once.
 *
 * Paul, 2026-09-25: "manually placing a template with an EP in it on or over
 * existing diagram elements also does the same thing. Particularly if the EP
 * does not fit into the lane it is initially placed in. All ok if the lane it
 * goes into has been manually prepared for the template. We need a generic fix
 * for this issue independent of voice assist."
 *
 * His drop tore the template three ways, left 22 connectors off their shapes
 * and grew Company over Pool 1. The fix: the template is ONE piece with one
 * host (templateAdoption.ts), that one band makes room, the pools below are
 * pushed by ONE top-down cascade computed from the original geometry
 * (`cascadePoolsBelow`), and every connector follows ONCE (`connectorsFollow`)
 * with ONE message-label rule (messageLabel.ts `followMessageLabel`) — for the
 * template and for every other path that grows a lane.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reducer, cascadePoolsBelow, connectorsFollow, settleGrowth } from "@/app/hooks/useDiagram";
import { instantiateTemplate } from "@/app/lib/diagram/templates";
import { planTemplateAdoption, templateHostByOverlap, ADOPT_RIGHT_REACH } from "@/app/lib/diagram/templateAdoption";
import { planTemplateAttach, checkTemplateAttach } from "@/app/lib/diagram/templateAttach";
import { connectorLabelBox, baseLabelAnchor } from "@/app/lib/diagram/checks/layoutViolations";
import { recomputeAllConnectors } from "@/app/lib/diagram/routing";
import { placeMessageLabel } from "@/app/lib/diagram/messageLabel";
import { isBlackBoxPool } from "@/app/lib/diagram/blackBoxPoolMenu";
import { diagramHasWhiteBoxPool } from "@/app/lib/assist/templatePick";
import { POOL_GAP, MIN_LEFT_GAP } from "@/app/lib/diagram/poolLaneBounds";
import { builtinTemplates, builtinTemplate } from "./_helpers/builtinTemplates";
import {
  auditInsert, endsOff, newlyDetached, rigidNotTranslated, poolOverlaps, outsideParent,
  unownedOverPool, pieceOffsets, crossings, boundaryOutsideBand,
} from "./_helpers/settleAudit";
import type { Action } from "@/app/hooks/useDiagram";
import type { Connector, DiagramData, DiagramElement, TemplateData } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => ({ properties: {}, label: "", ...o }) as unknown as DiagramElement;
const src = (p: string) => readFileSync(p, "utf8");
const at = (d: { elements: DiagramElement[] }, id: string) => d.elements.find((e) => e.id === id)!;
const run = (d: DiagramData, a: Action) => reducer(d, a);
type Payload = { elements: DiagramElement[]; connectors: Connector[] };
const applyT = (d: DiagramData, p: Payload, join?: { sourceId: string; targetId: string }) =>
  run(d, { type: "APPLY_TEMPLATE", payload: { elements: p.elements, connectors: p.connectors, ...(join ? { join } : {}) } });
const bottom = (e: DiagramElement) => e.y + e.height;
const seq = (id: string, s: string, t: string, waypoints: { x: number; y: number }[], extra: Partial<Connector> = {}) => ({
  id, type: "sequence", sourceId: s, targetId: t, sourceSide: "right", targetSide: "left",
  directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false,
  waypoints, ...extra,
}) as unknown as Connector;

/** Paul's Block 2 Test 3 diagram, and the template exactly as the window handed it over. */
const paulsDiagram = () => JSON.parse(src("tests/fixtures/block2-test3-template.json")) as DiagramData;
const paulsPayload = () => (JSON.parse(src("tests/fixtures/voice-debug/block2-test3-template-insert.json")) as { payload: Payload }).payload;
const COMPANY = "ks53ue64", POOL1 = "i8njghjz", CUSTOMER = "qkxmpmf3";
const FRONT = "ovnxgjg6", WAREHOUSE = "i3c0s3q2", MARKETING = "vuw5apbd", SLACK = "2e8cdvcc", GOOD = "ap120lg0";
const MERGE = "5njpff19", DO_NOTHING = "zy52tg5f";

/** A template, its box centred on (cx, cy) — the plain window's drop. */
function centred(t: TemplateData, cx: number, cy: number): Payload {
  const inst = instantiateTemplate(t, cx, cy);
  const minX = Math.min(...inst.elements.map((e) => e.x)), maxX = Math.max(...inst.elements.map((e) => e.x + e.width));
  const minY = Math.min(...inst.elements.map((e) => e.y)), maxY = Math.max(...inst.elements.map((e) => e.y + e.height));
  const dx = cx - (minX + maxX) / 2, dy = cy - (minY + maxY) / 2;
  return {
    elements: inst.elements.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy })),
    connectors: inst.connectors.map((c) => ({ ...c, waypoints: c.waypoints.map((q) => ({ x: q.x + dx, y: q.y + dy })) })),
  };
}
/** …its left edge at `left`, its box centred vertically on `cy` ("on the end"). */
function leftAt(t: TemplateData, left: number, cy: number): Payload {
  const p = centred(t, 0, cy);
  const dx = left - Math.min(...p.elements.map((e) => e.x));
  return {
    elements: p.elements.map((e) => ({ ...e, x: e.x + dx })),
    connectors: p.connectors.map((c) => ({ ...c, waypoints: c.waypoints.map((q) => ({ x: q.x + dx, y: q.y })) })),
  };
}

/**
 * A white-box pool "Us" (lanes A, B — tasks in both), and black-box pools
 * stacked below it 60px apart, listed in the order they were created.
 */
function stacked(order: "top-down" | "bottom-up" = "top-down", laneH = 150): DiagramData {
  const us = [
    E({ id: "U", type: "pool", label: "Us", x: 0, y: 0, width: 1000, height: laneH * 2, properties: { poolType: "white-box" } }),
    E({ id: "A", type: "lane", label: "Lane A", x: 36, y: 0, width: 964, height: laneH, parentId: "U" }),
    E({ id: "B", type: "lane", label: "Lane B", x: 36, y: laneH, width: 964, height: laneH, parentId: "U" }),
    E({ id: "a1", type: "task", label: "First", x: 100, y: 20, width: 100, height: 60, parentId: "A" }),
    E({ id: "b1", type: "task", label: "Second", x: 300, y: laneH + 20, width: 100, height: 60, parentId: "B" }),
  ];
  const y1 = laneH * 2 + 60;
  const below = [
    E({ id: "P1", type: "pool", label: "Them", x: 0, y: y1, width: 1000, height: 80, properties: { poolType: "black-box" } }),
    E({ id: "P2", type: "pool", label: "Others", x: 0, y: y1 + 140, width: 1000, height: 80, properties: { poolType: "black-box" } }),
    E({ id: "P3", type: "pool", label: "Third", x: 0, y: y1 + 280, width: 1000, height: 80, properties: { poolType: "black-box" } }),
  ];
  const elements = order === "top-down" ? [...us, ...below] : [...below.reverse(), ...us];
  return { elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as DiagramData;
}

/** The pools below "Us" were pushed exactly once, by Us's growth, gaps and order kept. */
function expectStackKept(before: DiagramData, after: DiagramData, why: string) {
  const g = at(after, "U").height - at(before, "U").height;
  expect(g, `${why}: Us grew`).toBeGreaterThan(0.5);
  for (const id of ["P1", "P2", "P3"]) {
    expect(at(after, id).y - at(before, id).y, `${why}: ${id} pushed by the growth, once`).toBeCloseTo(g, 6);
  }
  expect(at(after, "P1").y - bottom(at(after, "U")), `${why}: Us→P1 gap kept`).toBeCloseTo(60, 6);
  expect(at(after, "P2").y - bottom(at(after, "P1")), `${why}: P1→P2 gap kept`).toBeCloseTo(60, 6);
  expect(at(after, "P3").y - bottom(at(after, "P2")), `${why}: P2→P3 gap kept`).toBeCloseTo(60, 6);
  expect(poolOverlaps(after), why).toEqual([]);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("T4863 — Paul's drop (his template at the viewport centre, on his process): settled, not torn", () => {
  const base = paulsDiagram();
  const payload = paulsPayload();
  const after = applyT(base, payload);
  const ids = new Set(payload.elements.map((e) => e.id));

  it("the whole verification set holds: ends on, rigid flows translated, no new crossings, no overlap, inside parents", () => {
    // Before the fix: 22 connectors off their shapes, Company 19.4px over
    // Pool 1, the template torn three ways (0 / 19.97 / 80.67).
    expect(auditInsert(base, payload, after)).toEqual([]);
    expect(endsOff(after)).toEqual([]);
  });

  it("ONE piece in ONE lane: Warehouse, the lane it overlaps most; boundary events with their host", () => {
    expect(pieceOffsets(payload.elements, after)).toHaveLength(1);
    const byId = new Map(after.elements.map((e) => [e.id, e] as const));
    for (const e of payload.elements) {
      const now = byId.get(e.id)!;
      if (e.parentId) expect(now.parentId, now.label).toBe(e.parentId);           // kept inside the template
      else if (now.boundaryHostId) expect(now.parentId, now.label).toBe(byId.get(now.boundaryHostId)!.parentId);
      else expect(now.parentId, now.label).toBe(WAREHOUSE);
    }
    const rework = after.elements.find((e) => ids.has(e.id) && e.label === "Re-work\ncompleted")!;
    expect(rework.parentId, "not Front office, as the band pass had it").toBe(WAREHOUSE);
  });

  it("Warehouse grows DOWN round it; Marketing, its sub-lanes and Do nothing move by that; Pool 1 is pushed, its gap kept", () => {
    const wh0 = at(base, WAREHOUSE), wh = at(after, WAREHOUSE);
    const g = wh.height - wh0.height;
    expect(wh.y).toBe(wh0.y);
    expect(g).toBeGreaterThan(100);
    for (const id of [MARKETING, SLACK, GOOD, DO_NOTHING, POOL1]) expect(at(after, id).y - at(base, id).y, id).toBeCloseTo(g, 6);
    expect(at(after, COMPANY).height - at(base, COMPANY).height).toBeCloseTo(g, 6);
    expect(at(after, POOL1).y - bottom(at(after, COMPANY))).toBeCloseTo(at(base, POOL1).y - bottom(at(base, COMPANY)), 6);
    expect(at(after, CUSTOMER)).toEqual(at(base, CUSTOMER));
    // The fragment itself: lowered only to clear the lane's top, never moved
    // with the lane's existing content (no join here).
    for (const id of ["471plcmc", "opimkfkp", "qdzrmzy2", "xjh97pr0", MERGE]) expect(at(after, id), id).toEqual(at(base, id));
  });

  it("Company widens to the template's right edge + 40; the other pools keep their width", () => {
    const right = Math.max(...after.elements.filter((e) => ids.has(e.id)).map((e) => e.x + e.width));
    const company = at(after, COMPANY);
    expect(company.x + company.width).toBeCloseTo(right + 40, 6);
    expect(at(after, POOL1).width).toBe(at(base, POOL1).width);
  });

  it("the template's own flows keep the routes they were saved with, translated with it", () => {
    const e0 = payload.elements[0];
    const off = [at(after, e0.id).x - e0.x, at(after, e0.id).y - e0.y];
    for (const c of payload.connectors) {
      const now = after.connectors.find((x) => x.id === c.id)!;
      expect(now.waypoints.map((p) => [+(p.x - off[0]).toFixed(6), +(p.y - off[1]).toFixed(6)]), c.id)
        .toEqual(c.waypoints.map((p) => [+p.x.toFixed(6), +p.y.toFixed(6)]));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4864 — the ONE pools-below cascade: top-down, from the original geometry", () => {
  const grow = (d: DiagramData, by: number) => d.elements.map((e) => (e.id === "U" ? { ...e, height: e.height + by } : e));

  it("two and three pools stacked below, in either creation order: each pushed ONCE, by the growth", () => {
    for (const order of ["top-down", "bottom-up"] as const) {
      const d = stacked(order);
      const after = { ...d, elements: cascadePoolsBelow(d.elements, grow(d, 50)) };
      expectStackKept(d, after, order);
    }
  });

  it("the 100-px rule on the ORIGINAL gap: far below and still clear, nothing moves; brought within 100px, everything below moves", () => {
    const far = stacked();
    far.elements = far.elements.map((e) => (e.type === "pool" && e.id !== "U" ? { ...e, y: e.y + 200 } : e));   // gap 260
    expect(cascadePoolsBelow(far.elements, grow(far, 50))).toEqual(grow(far, 50));
    const after = cascadePoolsBelow(far.elements, grow(far, 200));                      // 260 − 200 < 100
    for (const id of ["P1", "P2", "P3"]) expect(at({ elements: after }, id).y - at(far, id).y).toBe(200);
  });

  it("a pool that MOVED is not a pool that grew; a pool that grew at its TOP pushes nothing below", () => {
    const d = stacked();
    const moved = d.elements.map((e) => (e.id === "P1" ? { ...e, y: e.y + 30 } : e));
    expect(cascadePoolsBelow(d.elements, moved)).toBe(moved);
    const upward = d.elements.map((e) => (e.id === "U" ? { ...e, y: e.y - 40, height: e.height + 40 } : e));
    expect(cascadePoolsBelow(d.elements, upward)).toBe(upward);
  });

  it("two pools that grow: everything under both moves by the sum, the pool between by the first", () => {
    const d = stacked();
    const both = d.elements.map((e) => (e.id === "U" ? { ...e, height: e.height + 50 } : e.id === "P1" ? { ...e, height: e.height + 20 } : e));
    const after = { elements: cascadePoolsBelow(d.elements, both) };
    expect(at(after, "P1").y - at(d, "P1").y).toBe(50);
    expect(at(after, "P2").y - at(d, "P2").y).toBe(70);
    expect(at(after, "P3").y - at(d, "P3").y).toBe(70);
  });

  it("each pool takes everything it holds", () => {
    const d = stacked();
    d.elements.push(
      E({ id: "L1", type: "lane", label: "Inside", x: 36, y: at(d, "P2").y, width: 964, height: 80, parentId: "P2" }),
      E({ id: "t1", type: "task", label: "Deep", x: 100, y: at(d, "P2").y + 10, width: 100, height: 60, parentId: "L1" }),
      E({ id: "ev", type: "intermediate-event", label: "", x: 130, y: at(d, "P2").y + 52, width: 36, height: 36, boundaryHostId: "t1", parentId: "L1" }),
    );
    const after = { elements: cascadePoolsBelow(d.elements, grow(d, 50)) };
    for (const id of ["L1", "t1", "ev"]) expect(at(after, id).y - at(d, id).y, id).toBe(50);
  });

  it("relaxed layout: only the pools the grown pool would COVER are pushed; one beside it stays", () => {
    const d = stacked();
    d.elements = d.elements.map((e) => (e.id === "P2" ? { ...e, x: 1200 } : e));       // beside, not under
    const after = { elements: cascadePoolsBelow(d.elements, grow(d, 50), true) };
    expect(at(after, "P1").y - at(d, "P1").y, "under it: pushed, never swallowed").toBe(50);
    expect(at(after, "P2").y, "beside it: stays").toBe(at(d, "P2").y);
    expect(at(after, "P3").y - at(d, "P3").y).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4865 — every path that grows a lane pushes the stacked pools below exactly once", () => {
  const orders = ["top-down", "bottom-up"] as const;

  it("APPLY_TEMPLATE — a template hanging below lane B", () => {
    for (const order of orders) {
      const d = stacked(order);
      const t = { elements: [E({ id: "n1", type: "task", label: "New", x: 500, y: 250, width: 100, height: 120 })], connectors: [] };
      const after = applyT(d, t);
      expect(at(after, "n1").parentId).toBe("B");
      expectStackKept(d, after, `APPLY_TEMPLATE ${order}`);
    }
  });

  it("UPDATE_LABEL — lane B renamed to a name longer than it is tall", () => {
    for (const order of orders) {
      const d = stacked(order);
      expectStackKept(d, run(d, { type: "UPDATE_LABEL", payload: { id: "B", label: "A much longer warehouse lane name" } }), `UPDATE_LABEL ${order}`);
    }
  });

  it("SET_LANE_FONT_SIZE — both lanes grow; the pools below move once, by the total", () => {
    for (const order of orders) {
      const d = stacked(order, 100);
      d.elements = d.elements.map((e) => (e.id === "A" || e.id === "B" ? { ...e, label: "Warehouse" } : e));
      const after = run(d, { type: "SET_LANE_FONT_SIZE", payload: 30 });
      expect(at(after, "U").height - at(d, "U").height).toBeGreaterThan(100);
      expectStackKept(d, after, `SET_LANE_FONT_SIZE ${order}`);
    }
  });

  it("ADD_SUBLANE — the first split, whose halves are too short for their names", () => {
    for (const order of orders) {
      const d = stacked(order, 100);
      expectStackKept(d, run(d, { type: "ADD_SUBLANE", payload: { laneId: "B" } }), `ADD_SUBLANE ${order}`);
    }
  });

  it("ADD_LANE and the palette's Pool/Lane drop — a first lane taller than the pool", () => {
    for (const order of orders) {
      const d = stacked(order);
      // "Us" without lanes, 50px tall: the first lane's name needs more.
      d.elements = d.elements.filter((e) => e.id !== "A" && e.id !== "B" && e.id !== "a1" && e.id !== "b1")
        .map((e) => (e.id === "U" ? { ...e, height: 50 } : e.type === "pool" ? { ...e, y: e.y - 250 } : e));
      expectStackKept(d, run(d, { type: "ADD_LANE", payload: { poolId: "U" } }), `ADD_LANE ${order}`);
      expectStackKept(d, run(d, { type: "ADD_ELEMENT", payload: { symbolType: "pool", position: { x: 500, y: 25 } } }), `pool drop ${order}`);
    }
  });

  it("the palette's split of a lane changes no pool, and pushes nothing", () => {
    const d = stacked();
    const after = run(d, { type: "ADD_ELEMENT", payload: { symbolType: "pool", position: { x: 500, y: 225 } } });
    expect(after.elements.filter((e) => e.type === "lane" && e.parentId === "B")).toHaveLength(2);
    for (const id of ["U", "P1", "P2", "P3"]) expect(at(after, id).y, id).toBe(at(d, id).y);
  });

  it("a step kept in its lane (issue 1's makeRoomInLane) — the lane grows down, the pools below move once", () => {
    for (const order of orders) {
      const d = stacked(order);
      const after = run(d, { type: "ADD_ELEMENT", payload: { symbolType: "task", position: { x: 600, y: 290 }, id: "k", initial: { parentId: "B", keepInLane: true } } });
      expect(bottom(at(after, "k")) + 8).toBeLessThanOrEqual(bottom(at(after, "B")) + 1e-6);
      expectStackKept(d, after, `keepInLane ${order}`);
    }
  });

  it("relaxed layout: the pools the grown pool would cover are pushed; one standing beside it stays", () => {
    const d = { ...stacked(), relaxedLayout: true } as DiagramData;
    d.elements = d.elements.map((e) => (e.id === "P2" ? { ...e, x: 1200 } : e));
    const t = { elements: [E({ id: "n1", type: "task", label: "New", x: 500, y: 250, width: 100, height: 120 })], connectors: [] };
    const after = applyT(d, t);
    const g = at(after, "U").height - at(d, "U").height;
    expect(g).toBeGreaterThan(0.5);
    expect(at(after, "P1").y - at(d, "P1").y).toBeCloseTo(g, 6);
    expect(at(after, "P3").y - at(d, "P3").y).toBeCloseTo(g, 6);
    expect(at(after, "P2").y, "beside it").toBe(at(d, "P2").y);
    expect(poolOverlaps(after)).toEqual([]);
  });

  it("a lane-less white-box pool that grows round a template (issue 5) pushes the pools below it too", () => {
    for (const order of orders) {
      const d = stacked(order);
      d.elements = d.elements.filter((e) => e.type !== "lane").map((e) => (e.parentId === "A" || e.parentId === "B" ? { ...e, parentId: "U" } : e));
      const t = { elements: [E({ id: "n1", type: "task", label: "New", x: 500, y: 250, width: 100, height: 120, parentId: "U" })], connectors: [] };
      const after = applyT(d, t);
      expect(bottom(at(after, "U"))).toBeCloseTo(250 + 120 + 8, 6);
      expectStackKept(d, after, `lane-less ${order}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4866 — connectors follow the geometry ONCE: rigid moves translated, the rest re-routed", () => {
  /** Us with a third lane C holding a hand-shaped flow, and a white-box pool W below with another. */
  const world = (): DiagramData => {
    const d = stacked();
    d.elements = d.elements.filter((e) => e.id !== "P2" && e.id !== "P3").map((e) =>
      e.id === "U" ? { ...e, height: 450 } : e.id === "P1" ? { ...e, y: 510, height: 200, properties: { poolType: "white-box" } } : e);
    d.elements.push(
      E({ id: "C", type: "lane", label: "Lane C", x: 36, y: 300, width: 964, height: 150, parentId: "U" }),
      E({ id: "c1", type: "task", label: "C one", x: 100, y: 330, width: 100, height: 60, parentId: "C" }),
      E({ id: "c2", type: "task", label: "C two", x: 600, y: 330, width: 100, height: 60, parentId: "C" }),
      E({ id: "WL", type: "lane", label: "W lane", x: 36, y: 510, width: 964, height: 200, parentId: "P1" }),
      E({ id: "w1", type: "task", label: "W one", x: 100, y: 560, width: 100, height: 60, parentId: "WL" }),
      E({ id: "w2", type: "task", label: "W two", x: 600, y: 560, width: 100, height: 60, parentId: "WL" }),
    );
    // Hand-shaped: eleven points, a detour down and back up.
    const hand = (id: string, s: string, t: string, y: number) => seq(id, s, t, [
      { x: 200, y }, { x: 240, y }, { x: 240, y: y + 40 }, { x: 300, y: y + 40 }, { x: 300, y: y + 10 }, { x: 380, y: y + 10 },
      { x: 380, y: y + 45 }, { x: 460, y: y + 45 }, { x: 460, y }, { x: 530, y }, { x: 600, y },
    ]);
    d.connectors = [
      hand("inC", "c1", "c2", 360),
      hand("inW", "w1", "w2", 590),
      // "Yes" drawn 6px above its horizontal segment (anchor: the ends' midpoint, (525, 265)).
      seq("cross", "b1", "c2", [{ x: 400, y: 200 }, { x: 650, y: 200 }, { x: 650, y: 330 }], { sourceSide: "right", targetSide: "top", label: "Yes", labelOffsetX: 0, labelOffsetY: -85 }),
    ];
    return d;
  };
  // 230..330: 70px in lane B, 30 in lane C — lane B's.
  const template = { elements: [E({ id: "n1", type: "task", label: "New", x: 800, y: 230, width: 100, height: 100 })], connectors: [] };

  it("a hand-shaped flow in a lane BELOW the grown lane, and one in a PUSHED pool, keep their exact shape", () => {
    const d = world();
    const after = applyT(d, template);
    const g = at(after, "B").height - at(d, "B").height;
    expect(g).toBeGreaterThan(0);
    for (const id of ["inC", "inW"]) {
      const was = d.connectors.find((c) => c.id === id)!, now = after.connectors.find((c) => c.id === id)!;
      // Re-routed, the router kept a route of nine or more points by its
      // interior and left it behind in the lane above (verdict-6).
      expect(now.waypoints, id).toEqual(was.waypoints.map((p) => ({ x: p.x, y: p.y + g })));
    }
    expect(rigidNotTranslated(d, after)).toEqual([]);
  });

  it("a flow from the grown lane into the lane below is re-routed, both ends on, its label beside its segment", () => {
    const d = world();
    const after = applyT(d, template);
    expect(newlyDetached(d, after)).toEqual([]);
    const cross = after.connectors.find((c) => c.id === "cross")!;
    expect(cross.waypoints).not.toEqual(d.connectors.find((c) => c.id === "cross")!.waypoints);
    // "Yes" sat above the horizontal segment at y 200; it sits the same
    // distance above a horizontal segment of the new route (labelFollow.ts).
    const wasBox = connectorLabelBox(d.connectors.find((c) => c.id === "cross")!)!;
    const box = connectorLabelBox(cross)!;
    const gapWas = 200 - (wasBox.y + wasBox.h);
    const horizontals = cross.waypoints.slice(1)
      .filter((q, i) => Math.abs(q.y - cross.waypoints[i].y) < 0.5 && Math.abs(q.x - cross.waypoints[i].x) > 0.5);
    expect(horizontals.some((q) => Math.abs((q.y - (box.y + box.h)) - gapWas) < 0.5), JSON.stringify(cross.waypoints)).toBe(true);
  });

  it("connectorsFollow on its own: untouched when nothing moved; one end moved → re-routed, attached", () => {
    const d = world();
    expect(connectorsFollow(d.elements, d.elements, d.connectors)).toBe(d.connectors);
    const moved = d.elements.map((e) => (e.id === "c2" ? { ...e, y: e.y + 30 } : e));
    const out = connectorsFollow(d.elements, moved, d.connectors);
    expect(out.find((c) => c.id === "inW")).toBe(d.connectors.find((c) => c.id === "inW"));
    expect(endsOff({ ...d, elements: moved, connectors: out })).toEqual([]);
  });

  it("a sub-lane that grows for its name takes the flows in the lanes below its PARENT lane with them", () => {
    // resizeLaneForLabel re-routed only inside the parent lane: the lower
    // lane's task moved 605px and its flow stayed where it was (verdict-6).
    const d = world();
    d.elements.push(
      E({ id: "B1", type: "lane", label: "Sub 1", x: 72, y: 150, width: 928, height: 75, parentId: "B" }),
      E({ id: "B2", type: "lane", label: "Sub 2", x: 72, y: 225, width: 928, height: 75, parentId: "B" }),
    );
    d.elements = d.elements.map((e) => (e.id === "b1" ? { ...e, parentId: "B1", y: 155 } : e));
    const after = run(d, { type: "UPDATE_LABEL", payload: { id: "B1", label: "A sub-lane name that is far longer than the lane" } });
    const g = at(after, "C").y - at(d, "C").y;
    expect(g).toBeGreaterThan(100);
    const inC = after.connectors.find((c) => c.id === "inC")!;
    expect(inC.waypoints).toEqual(d.connectors.find((c) => c.id === "inC")!.waypoints.map((p) => ({ x: p.x, y: p.y + g })));
    expect(newlyDetached(d, after)).toEqual([]);
    expect(poolOverlaps(after)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4867 — ONE message-label rule: a label stays in its air gap, attached at its pool end", () => {
  /** Two WHITE-box pools 80px apart, a message from Us (lane B) down to W, its label placed by the rule. */
  const world = (): DiagramData => {
    const d = stacked();
    d.elements = d.elements.filter((e) => e.id !== "P2" && e.id !== "P3").map((e) =>
      e.id === "P1" ? { ...e, y: 380, height: 160, properties: { poolType: "white-box" } } : e);
    d.elements.push(
      E({ id: "WL", type: "lane", label: "W lane", x: 36, y: 380, width: 964, height: 160, parentId: "P1" }),
      E({ id: "w1", type: "task", label: "Receive", x: 300, y: 430, width: 100, height: 60, parentId: "WL" }),
    );
    return run(d, { type: "ADD_CONNECTOR", payload: {
      sourceId: "b1", targetId: "w1", connectorType: "messageBPMN", directionType: "directed", routingType: "rectilinear",
      sourceSide: "bottom", targetSide: "top", initialLabel: "Order",
    } });
  };
  const msgOf = (d: DiagramData) => d.connectors.find((c) => c.type === "messageBPMN")!;
  /** The label box against Us's bottom edge and the line. */
  const place = (d: DiagramData) => {
    const box = connectorLabelBox(msgOf(d), d.elements, d.connectorFontSize ?? 10)!;
    const lineX = msgOf(d).waypoints[1].x;
    return { dy: box.y - bottom(at(d, "U")), dx: box.x - lineX, inGap: box.y >= bottom(at(d, "U")) - 0.5 && box.y + box.h <= at(d, "P1").y + 0.5 };
  };

  it("the placed label is in the gap, 10px off Us's edge", () => {
    const d = world();
    expect(place(d).inGap).toBe(true);
    expect(place(d).dy).toBeCloseTo(10, 6);
  });

  it("Us grows 60px through APPLY_TEMPLATE: the label stays in the gap, attached at the same end", () => {
    const d = world();
    const b = at(d, "B");
    const t = { elements: [E({ id: "n1", type: "task", label: "New", x: 700, y: bottom(b) + 60 - 8 - 100, width: 100, height: 100 })], connectors: [] };
    const after = applyT(d, t);
    expect(at(after, "U").height - at(d, "U").height).toBeCloseTo(60, 6);
    expect(place(after)).toEqual(place(d));
  });

  it("…and through makeRoomInLane (a step kept in its lane)", () => {
    const d = world();
    const b = at(d, "B");
    const after = run(d, { type: "ADD_ELEMENT", payload: {
      symbolType: "task", position: { x: 750, y: bottom(b) + 60 - 8 - 32.5 }, id: "k", initial: { parentId: "B", keepInLane: true, height: 65 },
    } });
    expect(at(after, "U").height - at(d, "U").height).toBeCloseTo(60, 1);
    expect(place(after).inGap).toBe(true);
    expect(place(after).dy).toBeCloseTo(place(d).dy, 6);
    expect(place(after).dx).toBeCloseTo(place(d).dx, 6);
  });

  it("a pool-to-pool message and an element-to-black-box message, Paul's diagram: both labels stay in the Company / Pool 1 gap", () => {
    const d0 = paulsDiagram();
    // A message from a WHITE-box pool is no longer drawn (issue 4), but older
    // diagrams hold them; built as saved, its label placed by the rule.
    const like = d0.connectors.find((c) => c.label === "message 1")!;
    const raw = recomputeAllConnectors([{ ...like, id: "p2p", sourceId: COMPANY, targetId: POOL1, sourceSide: "bottom", targetSide: "top",
      sourceOffsetAlong: 0.8, targetOffsetAlong: 0.8, label: "Pool to pool" }], d0.elements)[0];
    const placed = placeMessageLabel(raw, d0.elements, d0.connectors)!;
    const d: DiagramData = { ...d0, connectors: [...d0.connectors, { ...raw, labelOffsetX: placed.labelOffsetX, labelOffsetY: placed.labelOffsetY }] };
    const after = applyT(d, leftAt(builtinTemplate("Single Approval"), 646, 136.9));
    const gapOf = (x: DiagramData) => [bottom(at(x, COMPANY)), at(x, POOL1).y];
    for (const label of ["Pool to pool", "message 1", "message 2"]) {
      const was = connectorLabelBox(d.connectors.find((c) => c.label === label)!, d.elements)!;
      const now = connectorLabelBox(after.connectors.find((c) => c.label === label)!, after.elements)!;
      const [lo0, hi0] = gapOf(d), [lo, hi] = gapOf(after);
      const inside = (b: typeof now, l: number, h: number) => b.y >= l - 0.5 && b.y + b.h <= h + 0.5;
      if (inside(was, lo0, hi0)) expect(inside(now, lo, hi), label).toBe(true);
    }
    // The pool-to-pool label rode with Pool 1 (its black-box end): verdict-6
    // measured it 159.6px below its line with two label rules chained.
    const p2p = (x: DiagramData) => connectorLabelBox(x.connectors.find((c) => c.label === "Pool to pool")!, x.elements)!;
    expect(p2p(after).y - at(after, POOL1).y).toBeCloseTo(p2p(d).y - at(d, POOL1).y, 6);
  });

  it("no air gap (pools side by side, a relaxed layout): the label keeps its place on its line when a rename moves the sender", () => {
    // Measured against its old ABSOLUTE box, the label stayed where it was
    // and was left 164px above its re-routed line (review of 6a).
    const d0 = {
      elements: [
        E({ id: "U", type: "pool", label: "Us", x: 0, y: 0, width: 600, height: 300, properties: { poolType: "white-box" } }),
        E({ id: "A", type: "lane", label: "Lane A", x: 36, y: 0, width: 564, height: 150, parentId: "U" }),
        E({ id: "B", type: "lane", label: "Lane B", x: 36, y: 150, width: 564, height: 150, parentId: "U" }),
        E({ id: "b1", type: "task", label: "Send", x: 300, y: 200, width: 100, height: 60, parentId: "B" }),
        E({ id: "V", type: "pool", label: "Them", x: 800, y: 0, width: 400, height: 300, properties: { poolType: "white-box" } }),
        E({ id: "VL", type: "lane", label: "V lane", x: 836, y: 0, width: 364, height: 300, parentId: "V" }),
        E({ id: "v1", type: "task", label: "Get", x: 1000, y: 200, width: 100, height: 60, parentId: "VL" }),
      ],
      connectors: [], viewport: { x: 0, y: 0, zoom: 1 }, relaxedLayout: true,
    } as unknown as DiagramData;
    const d = run(d0, { type: "ADD_CONNECTOR", payload: {
      sourceId: "b1", targetId: "v1", connectorType: "messageBPMN", directionType: "directed", routingType: "rectilinear",
      sourceSide: "right", targetSide: "left", initialLabel: "Order",
    } });
    const after = run(d, { type: "UPDATE_LABEL", payload: { id: "A", label: "A far longer lane name than will fit in the lane at all" } });
    expect(at(after, "b1").y - at(d, "b1").y, "the sender moved down with lane B").toBeGreaterThan(100);
    const rel = (x: DiagramData) => {
      const m = x.connectors.find((c) => c.type === "messageBPMN")!;
      const box = connectorLabelBox(m, x.elements, x.connectorFontSize ?? 10)!, a = baseLabelAnchor(m)!;
      return [+(box.x + box.w / 2 - a.x).toFixed(6), +(box.y - a.y).toFixed(6)];
    };
    expect(after.connectors[0].waypoints).not.toEqual(d.connectors[0].waypoints);
    expect(rel(after)).toEqual(rel(d));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4868 — one host, by OVERLAP; never a black-box pool", () => {
  const two = (a: Record<string, number>, b: Record<string, number>) => ({
    elements: [
      E({ id: "n1", type: "task", label: "One", width: 100, height: 60, ...a }),
      E({ id: "n2", type: "task", label: "Two", width: 100, height: 60, ...b }),
    ],
    connectors: [],
  });

  it("straddling two lanes, the piece goes WHOLLY into the lane it overlaps most, which grows round all of it", () => {
    const d = stacked();
    const after = applyT(d, two({ x: 500, y: 100 }, { x: 650, y: 140 }));           // 100..200: 50 in A, 50 in B → the lower
    expect([at(after, "n1").parentId, at(after, "n2").parentId]).toEqual(["B", "B"]);
    const after2 = applyT(d, two({ x: 500, y: 60 }, { x: 650, y: 100 }));           // 60..160: A 90, B 10
    expect([at(after2, "n1").parentId, at(after2, "n2").parentId]).toEqual(["A", "A"]);
    expect(bottom(at(after2, "A"))).toBeCloseTo(160 + 8, 6);
    expect(at(after2, "B").y - at(d, "B").y, "the lane below moves by A's growth").toBeCloseTo(18, 6);
    expect(pieceOffsets(two({ x: 500, y: 60 }, { x: 650, y: 100 }).elements, after2)).toHaveLength(1);
  });

  it("centred just below the last lane: taken in by that lane, which grows — never left lying over the pool below", () => {
    // verdict-6: with the vertical-centre rule 33 of 35 built-ins dropped here
    // were left unowned over Good team and Pool 1.
    const d = stacked();
    const p = two({ x: 500, y: 250 }, { x: 650, y: 340 });                          // 250..400: B 50, P1 (360..440) 40
    const after = applyT(d, p);
    expect([at(after, "n1").parentId, at(after, "n2").parentId]).toEqual(["B", "B"]);
    expect(unownedOverPool(after, new Set(["n1", "n2"]))).toEqual([]);
    expectStackKept(d, after, "just below");
  });

  it("the deepest band: a template over a sub-lane is the sub-lane's, not its lane's", () => {
    const d = stacked();
    d.elements.push(
      E({ id: "B1", type: "lane", label: "Sub 1", x: 72, y: 150, width: 928, height: 75, parentId: "B" }),
      E({ id: "B2", type: "lane", label: "Sub 2", x: 72, y: 225, width: 928, height: 75, parentId: "B" }),
    );
    const after = applyT(d, two({ x: 500, y: 230 }, { x: 650, y: 260 }));
    expect([at(after, "n1").parentId, at(after, "n2").parentId]).toEqual(["B2", "B2"]);
  });

  it("to the right: taken in when it reaches into the pool or starts within 120px of its edge; not from further away", () => {
    const d = stacked();
    const near = applyT(d, two({ x: 1000 + ADOPT_RIGHT_REACH - 10, y: 40 }, { x: 1300, y: 40 }));
    expect(at(near, "n1").parentId).toBe("A");
    expect(at(near, "U").x + at(near, "U").width).toBeCloseTo(1400 + 40, 6);
    const far = applyT(d, two({ x: 1300, y: 40 }, { x: 1450, y: 40 }));
    expect([at(far, "n1").parentId, at(far, "n2").parentId]).toEqual([undefined, undefined]);
    expect(at(far, "U").width, "a pool a screen away does not grow to fetch it").toBe(1000);
  });

  it("a BLACK-BOX pool never adopts, and a template left over one is moved clear of it — and it stays black-box", () => {
    const d = stacked();
    const p = two({ x: 300, y: 500 }, { x: 450, y: 510 });                          // 500..570, on P2 (500..580) only
    const after = applyT(d, p);
    expect([at(after, "n1").parentId, at(after, "n2").parentId]).toEqual([undefined, undefined]);
    expect(unownedOverPool(after, new Set(["n1", "n2"]))).toEqual([]);
    expect(pieceOffsets(p.elements, after)).toHaveLength(1);
    // An unowned element over a black-box pool flipped it to white-box on the
    // next unrelated action (updatePoolTypes).
    const next = run(after, { type: "MOVE_ELEMENTS", payload: { ids: ["a1"], dx: 5, dy: 0 } });
    expect(isBlackBoxPool(at(next, "P2"))).toBe(true);
  });

  it("hanging into a white-box pool from its LEFT (centred left of it): not taken in, and moved left, clear of it", () => {
    // "Something placed to the LEFT … was put there deliberately" (T4742) —
    // but never left lying over the pool it stops short of.
    const d = paulsDiagram();
    let movedLeft = 0;
    for (const t of builtinTemplates().filter((x) => !x.data.elements.some((e) => e.type === "pool"))) {
      const p = leftAt(t.data, -700, 136.9);
      const after = applyT(d, p);
      const ids = new Set(p.elements.map((e) => e.id));
      if (after.elements.some((e) => ids.has(e.id) && e.parentId && !ids.has(e.parentId))) continue;   // wide enough to be centred in Company
      expect(unownedOverPool(after, ids), t.name).toEqual([]);
      const measured = planTemplateAdoption(d.elements, p.elements).boxIds;
      const rightOf = (els: DiagramElement[]) => Math.max(...els.filter((e) => measured.has(e.id)).map((e) => e.x + e.width));
      expect(pieceOffsets(p.elements, after), t.name).toHaveLength(1);
      if (rightOf(p.elements) <= at(d, COMPANY).x) expect(pieceOffsets(p.elements, after), `${t.name}: clear already`).toEqual(["0.00,0.00"]);
      else {
        movedLeft++;
        expect(rightOf(after.elements), t.name).toBeLessThanOrEqual(at(d, COMPANY).x - POOL_GAP + 1e-6);
      }
    }
    expect(movedLeft, "some reached into Company and were moved").toBeGreaterThan(5);
  });

  it("ONE black-box predicate: explicit black-box never adopts; an absent poolType is white-box — for the drop, the lane pass and the window", () => {
    const d = stacked();
    d.elements = d.elements.map((e) => (e.id === "U" ? { ...e, properties: {} } : e));
    expect(isBlackBoxPool(at(d, "U"))).toBe(false);
    expect(templateHostByOverlap(d.elements, { x: 500, y: 40, right: 600, bottom: 100 })).toEqual({ poolId: "U", hostId: "A" });
    expect(diagramHasWhiteBoxPool(d.elements)).toBe(true);
    expect(diagramHasWhiteBoxPool(d.elements.filter((e) => e.id !== "U"))).toBe(false);
    const blackOnly = d.elements.map((e) => (e.id === "U" ? { ...e, properties: { poolType: "black-box" } } : e));
    expect(templateHostByOverlap(blackOnly, { x: 500, y: 40, right: 600, bottom: 100 })).toBeNull();
    for (const [file, call] of [
      ["app/lib/diagram/templateAdoption.ts", "!isBlackBoxPool(p)"],
      ["app/lib/assist/templatePick.ts", "!isBlackBoxPool(e)"],
    ] as const) expect(src(file), file).toContain(call);
    const hook = src("app/hooks/useDiagram.ts");
    const recon = hook.slice(hook.indexOf("function reconcileLaneMembership("), hook.indexOf("\n}\n", hook.indexOf("function reconcileLaneMembership(")));
    expect(recon).toContain(".filter((p) => !isBlackBoxPool(p))");
    expect(recon).not.toContain(`!== "black-box"`);
    // …and the other place a parent is chosen, ADD_ELEMENT's container filter.
    expect(hook).toContain("if (isBlackBoxPool(b)) return false;");
    expect(hook).not.toMatch(/b\.type === "pool" && \(b\.properties\?\.poolType as string \| undefined\) === "black-box"/);
    expect(src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx")).toContain("diagramHasWhiteBoxPool(elementsRef.current)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4869 — notes and markers ride with what they belong to; boundary events with their host", () => {
  it("a template's own note moves with the template, and no lane adopts it", () => {
    const d = stacked();
    // Pokes 20px above lane A: lowered, and moved right off the header.
    const p = { elements: [
      E({ id: "n1", type: "task", label: "New", x: 20, y: -20, width: 100, height: 60 }),
      E({ id: "note", type: "text-annotation", label: "Why", x: 140, y: -40, width: 80, height: 30 }),
    ], connectors: [] };
    const after = applyT(d, p);
    const off = pieceOffsets(p.elements, after);
    expect(off).toHaveLength(1);
    expect(off[0]).not.toBe("0.00,0.00");
    expect(at(after, "note").parentId).toBeUndefined();
    expect(at(after, "n1").parentId).toBe("A");
    // Off the header by the half-event gap (leftGapShortfall), and down to the
    // lane's top pad — the note by exactly the same.
    const a = at(d, "A");
    expect(at(after, "n1").x).toBeCloseTo(a.x + 36 + MIN_LEFT_GAP, 6);
    expect(at(after, "n1").y).toBeCloseTo(a.y + 8, 6);
    expect(off[0]).toBe(`${(a.x + 36 + MIN_LEFT_GAP - 20).toFixed(2)},${(a.y + 8 + 20).toFixed(2)}`);
  });

  it("an existing note: with the element it is associated to, else with the band it lies in; one in the grown lane stays", () => {
    const d = stacked();
    d.elements = d.elements.map((e) => (e.id === "U" ? { ...e, height: 450 } : e));
    d.elements.push(
      E({ id: "C", type: "lane", label: "Lane C", x: 36, y: 300, width: 964, height: 150, parentId: "U" }),
      E({ id: "c1", type: "task", label: "C one", x: 100, y: 330, width: 100, height: 60, parentId: "C" }),
      E({ id: "tied", type: "text-annotation", label: "About C one", x: 250, y: 400, width: 100, height: 30 }),
      E({ id: "loose", type: "text-annotation", label: "In lane C", x: 600, y: 330, width: 100, height: 30 }),
      E({ id: "inB", type: "text-annotation", label: "In lane B", x: 600, y: 170, width: 100, height: 30 }),
    );
    d.connectors = [{ id: "as", type: "associationBPMN", sourceId: "tied", targetId: "c1", sourceSide: "left", targetSide: "right",
      directionType: "non-directed", routingType: "direct", waypoints: [{ x: 250, y: 415 }, { x: 200, y: 360 }] } as unknown as Connector];
    d.elements = d.elements.map((e) => (e.type === "pool" && e.id !== "U" ? { ...e, y: e.y + 150 } : e));
    const after = applyT(d, { elements: [E({ id: "n1", type: "task", label: "New", x: 800, y: 230, width: 100, height: 100 })], connectors: [] });
    const g = at(after, "C").y - at(d, "C").y;
    expect(g).toBeGreaterThan(0);
    expect(at(after, "tied").y - at(d, "tied").y, "with C one").toBeCloseTo(g, 6);
    expect(at(after, "loose").y - at(d, "loose").y, "with lane C").toBeCloseTo(g, 6);
    expect(at(after, "inB"), "lane B grew; nothing in it moved").toEqual(at(d, "inB"));
  });

  it("boundary events: parented as their host is; a sub-process's own rim start/end keep it; they choose no host, but the lane holds them whole", () => {
    const d = paulsDiagram();
    for (const name of ["Happy Path + Exception", "Non-Interruptible Process Pattern", "Expanded Subprocess Loop", "Expanded Subprocess Template", "Error Boundary + Handler"]) {
      const p = leftAt(builtinTemplate(name), 646, 136.9);
      const after = applyT(d, p);
      for (const e of p.elements.filter((x) => x.boundaryHostId)) {
        const now = at(after, e.id), host = at(after, e.boundaryHostId!);
        const want = e.parentId && p.elements.some((x) => x.id === e.parentId) ? e.parentId : host.parentId;
        expect(now.parentId, `${name}: ${e.type} ${e.label}`).toBe(want);
      }
      const plan = planTemplateAdoption(d.elements, p.elements);
      for (const e of p.elements.filter((x) => x.boundaryHostId)) {
        expect(plan.boxIds.has(e.id), `${name}: ${e.label} does not choose the host`).toBe(false);
        expect(plan.fragmentIds.has(e.id), `${name}: ${e.label} is made room for`).toBe(true);
      }
      // "End of Day" and "An Error" on Expanded Subprocess Loop's bottom rim
      // hung 10px below Warehouse when they made no room (review of 6a).
      expect(boundaryOutsideBand(after, new Set(p.elements.map((e) => e.id))), name).toEqual([]);
    }
  });

  it("an event on an EP's TOP edge, the EP reaching above its lane: lowered until the event, not only the EP, clears the lane's top", () => {
    const d = paulsDiagram();
    const wh = at(d, WAREHOUSE);
    for (const topY of [wh.y - 30, wh.y + 2]) {
      const p = { elements: [
        E({ id: "ep", type: "subprocess-expanded", label: "EP", x: 700, y: topY, width: 300, height: 90 }),
        E({ id: "in", type: "task", label: "Inner", x: 780, y: topY + 15, width: 100, height: 60, parentId: "ep" }),
        E({ id: "bt", type: "intermediate-event", label: "Timer", x: 900, y: topY - 18, width: 36, height: 36, boundaryHostId: "ep" }),
      ], connectors: [] };
      const after = applyT(d, p);
      expect(at(after, "bt").parentId).toBe(WAREHOUSE);
      expect(at(after, "bt").y, `from ${topY}`).toBeCloseTo(wh.y + 8, 6);
      expect(boundaryOutsideBand(after, new Set(["bt"]))).toEqual([]);
      expect(auditInsert(d, p, after)).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4870 — stale lane parents on the EXISTING elements are repaired before the lane grows", () => {
  it("Do nothing, owned by Company but sitting in Slack team, goes down with Slack team", () => {
    // verdict-6: without the repair it stayed Company-owned at its old height,
    // inside the grown Warehouse.
    const d = paulsDiagram();
    d.elements = d.elements.map((e) => (e.id === DO_NOTHING ? { ...e, parentId: COMPANY } : e));
    const after = applyT(d, leftAt(builtinTemplate("Single Approval"), 646, 136.9));
    expect(at(after, DO_NOTHING).parentId).toBe(SLACK);
    expect(at(after, DO_NOTHING).y - at(d, DO_NOTHING).y).toBeCloseTo(at(after, SLACK).y - at(d, SLACK).y, 6);
    expect(at(after, SLACK).y).toBeGreaterThan(at(d, SLACK).y);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4871 — a template that brings its own pools is stacked below the diagram's, and adopted by nothing", () => {
  it("every built-in with pools, dropped anywhere on Paul's diagram: under Pool 1, POOL_GAP apart, whole, overlapping nothing", () => {
    const d = paulsDiagram();
    const withPools = builtinTemplates().filter((t) => t.data.elements.some((e) => e.type === "pool"));
    expect(withPools.length).toBeGreaterThanOrEqual(4);
    let labelled = 0;
    for (const t of withPools) {
      for (const [cx, cy] of [[495.41, 167.57], [300, 480], [1400, 0]]) {
        const p = centred(t.data, cx, cy);
        const after = applyT(d, p);
        const why = `${t.name} @ ${cx},${cy}`;
        expect(poolOverlaps(after), why).toEqual([]);
        expect(pieceOffsets(p.elements, after), why).toHaveLength(1);
        for (const e of p.elements) expect(at(after, e.id).parentId, why).toBe(e.parentId);
        const top = Math.min(...p.elements.filter((e) => e.type === "pool").map((e) => at(after, e.id).y));
        expect(top - bottom(at(d, POOL1)), why).toBeCloseTo(POOL_GAP, 6);
        for (const id of [COMPANY, POOL1, CUSTOMER]) expect(at(after, id), why).toEqual(at(d, id));
        // Its message labels go with it: measured against where they were
        // dropped, 23 of 72 stayed behind over Company, up to 966px from their
        // lines (review of 6a).
        const e0 = p.elements[0];
        const dx = at(after, e0.id).x - e0.x, dy = at(after, e0.id).y - e0.y;
        const naive = [...d.elements, ...p.elements];
        for (const c of p.connectors.filter((x) => (x.label ?? "").trim())) {
          labelled++;
          const was = connectorLabelBox(c, naive)!, now = connectorLabelBox(after.connectors.find((x) => x.id === c.id)!, after.elements)!;
          expect(Math.hypot(now.x - was.x - dx, now.y - was.y - dy), `${why}: ${c.label} left behind`).toBeLessThan(1e-6);
        }
      }
    }
    expect(labelled, "labelled flows were checked").toBeGreaterThan(20);
  });

  it("a template that brings a LANE but no pool (a lane saved without its pool) is stacked the same way — never a sub-lane of the lane it lands on", () => {
    const d = paulsDiagram();
    const p = { elements: [
      E({ id: "tl", type: "lane", label: "Their lane", x: 700, y: 100, width: 400, height: 100 }),
      E({ id: "tt", type: "task", label: "Their task", x: 800, y: 120, width: 100, height: 60, parentId: "tl" }),
    ], connectors: [] };
    const after = applyT(d, p);
    expect(at(after, "tl").parentId, "not taken in by Warehouse").toBeUndefined();
    expect(at(after, "tt").parentId).toBe("tl");
    expect(at(after, WAREHOUSE)).toEqual(at(d, WAREHOUSE));
    expect(at(after, "tl").y - bottom(at(d, POOL1))).toBeCloseTo(POOL_GAP, 6);
    expect(at(after, "tl").x).toBeCloseTo(at(d, POOL1).x, 6);
    expect(pieceOffsets(p.elements, after)).toHaveLength(1);
    for (const id of [COMPANY, POOL1, CUSTOMER]) expect(at(after, id)).toEqual(at(d, id));
    // One rule for what a template "brings": the attach refuses the same ones.
    expect(src("app/lib/diagram/templateAttach.ts")).toContain("templateData.elements.some(isTemplateContainer)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4872 — sticking out ABOVE its lane: lowered alone, or — joined — carried with the lane", () => {
  it("no join: only the template is lowered; the lane's own content stays put", () => {
    const d = paulsDiagram();
    const p = leftAt(builtinTemplate("Expanded Subprocess Template"), 646, 100);   // reaches above Warehouse
    const after = applyT(d, p);
    const wh = at(after, WAREHOUSE);
    for (const e of p.elements) {
      const now = at(after, e.id);
      if (now.boundaryHostId) continue;
      if (now.parentId === WAREHOUSE) expect(now.y, now.label).toBeGreaterThanOrEqual(wh.y + 8 - 1e-6);
    }
    for (const id of ["471plcmc", "opimkfkp", "qdzrmzy2", "xjh97pr0", MERGE]) expect(at(after, id), id).toEqual(at(d, id));
    expect(auditInsert(d, p, after)).toEqual([]);
    expect(boundaryOutsideBand(after, new Set(p.elements.map((e) => e.id)))).toEqual([]);
  });

  it("joined after Paul's merge gateway (issue 5): Warehouse grows at the top, its content and the template move down together, the join stays level", () => {
    const d = paulsDiagram();
    // A free note lying in Warehouse, tied to nothing: part of the lane's
    // content, so it is carried down with it.
    d.elements.push(E({ id: "wnote", type: "text-annotation", label: "Warehouse note", x: -85, y: 82, width: 30, height: 20 }));
    const plan = planTemplateAttach(builtinTemplate("Expanded Subprocess Template"), MERGE, d);
    if ("error" in plan) throw new Error(plan.error);
    const checked = checkTemplateAttach(d, plan);
    expect("error" in checked ? checked.error : null, "no longer refused for sticking out above").toBeNull();
    const after = (checked as { after: DiagramData }).after;
    const dy = at(after, MERGE).y - at(d, MERGE).y;
    expect(dy, "the lane's content carried down").toBeGreaterThan(0);
    for (const id of ["471plcmc", "opimkfkp", "qdzrmzy2", "xjh97pr0"]) expect(at(after, id).y - at(d, id).y, id).toBeCloseTo(dy, 6);
    expect(at(after, WAREHOUSE).y, "the lane's top does not move").toBe(at(d, WAREHOUSE).y);
    const entry = at(after, plan.entryId), gw = at(after, MERGE);
    expect(entry.y + entry.height / 2).toBeCloseTo(gw.y + gw.height / 2, 6);
    const join = after.connectors.find((c) => c.sourceId === MERGE && c.targetId === plan.entryId)!;
    const vis = join.waypoints.slice(join.sourceInvisibleLeader ? 1 : 0, join.targetInvisibleLeader ? -1 : undefined);
    expect(new Set(vis.map((p) => Math.round(p.y * 1000))).size, "one straight, level line").toBe(1);
    const payload = { elements: plan.elements, connectors: plan.connectors };
    const naive = { ...d, elements: [...d.elements, ...payload.elements], connectors: [...d.connectors, ...payload.connectors] };
    expect(newlyDetached(naive, after)).toEqual([]);
    expect(rigidNotTranslated(naive, after), "joined, the template's flows are still translated").toEqual([]);
    expect(poolOverlaps(after)).toEqual([]);
    expect(outsideParent(after, plan.newIds)).toEqual([]);
    expect(boundaryOutsideBand(after, plan.newIds)).toEqual([]);
    expect(at(after, "wnote").y - at(d, "wnote").y, "the note went down with the lane's content").toBeCloseTo(dy, 6);
    expect(at(after, "wnote").parentId).toBeUndefined();
  });

  it("joined, the template's flows keep the routes they were saved with — the join alone is checked against obstacles", () => {
    // Paul's own template, attached after his merge gateway. Its stored
    // "Re-work completed → Assess" runs back through the event (the template's
    // data); ADD_CONNECTOR's obstacle pass over EVERY connector re-routed it
    // when the template was joined, and translated it when it was not.
    const d = paulsDiagram();
    const tpl = paulsPayload() as TemplateData;
    const plan = planTemplateAttach(tpl, MERGE, d);
    if ("error" in plan) throw new Error(plan.error);
    const after = applyT(d, { elements: plan.elements, connectors: plan.connectors }, plan.join);
    const naive = { ...d, elements: [...d.elements, ...plan.elements], connectors: [...d.connectors, ...plan.connectors] };
    expect(after.connectors.some((c) => c.sourceId === MERGE && c.targetId === plan.entryId), "joined").toBe(true);
    expect(rigidNotTranslated(naive, after)).toEqual([]);
    const rework = plan.elements.find((e) => e.label === "Re-work\ncompleted")!;
    const assess = plan.elements.find((e) => e.label === "Assess")!;
    const stored = plan.connectors.find((c) => c.sourceId === rework.id && c.targetId === assess.id)!;
    const now = after.connectors.find((c) => c.id === stored.id)!;
    const dx = at(after, rework.id).x - rework.x, dy = at(after, rework.id).y - rework.y;
    expect(now.waypoints).toEqual(stored.waypoints.map((q) => ({ x: q.x + dx, y: q.y + dy })));
    // And the user's own flows are not re-routed by the join either.
    for (const c of d.connectors) {
      const s0 = at(d, c.sourceId), s1 = at(after, c.sourceId), t0 = at(d, c.targetId), t1 = at(after, c.targetId);
      if ([s0, t0].every((e, i) => { const n = [s1, t1][i]; return e.x === n.x && e.y === n.y && e.width === n.width && e.height === n.height; })) {
        expect(after.connectors.find((x) => x.id === c.id)!.waypoints, c.id).toEqual(c.waypoints);
      }
    }
  });

  it("after the merge gateway every built-in with a step to join is now placed; only those with nothing inline to join are refused", () => {
    // Before: six were refused as "would stick out above “Warehouse”".
    const d = paulsDiagram();
    const refused: string[] = [];
    for (const t of builtinTemplates()) {
      const plan = planTemplateAttach(t.data, MERGE, d);
      if ("error" in plan) { refused.push(`${t.name}: ${plan.error}`); continue; }
      const c = checkTemplateAttach(d, plan);
      if ("error" in c) refused.push(`${t.name}: ${c.error}`);
    }
    for (const r of refused) expect(r).toMatch(/no step a sequence flow can enter|brings a pool or lane/);
    expect(refused.filter((r) => /stick out/.test(r))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4873 — every built-in, dropped three ways, passes the whole verification set", () => {
  const d = paulsDiagram();
  const gw = at(d, MERGE);
  const inline = builtinTemplates().filter((t) => !t.data.elements.some((e) => e.type === "pool"));

  it("(a) into an empty lane (Good team, on the end of the process)", () => {
    for (const t of inline) {
      const p = leftAt(t.data, gw.x + gw.width + 51, 341);
      expect(auditInsert(d, p, applyT(d, p)), t.name).toEqual([]);
    }
  });

  it("(c) into a lane too small for it (Front office, 120px, on the end) — the EP that does not fit its lane", () => {
    for (const t of inline) {
      const p = leftAt(t.data, gw.x + gw.width + 51, 18.9);
      expect(auditInsert(d, p, applyT(d, p)), t.name).toEqual([]);
    }
  });

  it("(b) centred ON Paul's process: everything but the crossings the drop itself makes", () => {
    // Dropped on top of his tasks, the template overlaps them BEFORE anything
    // settles, and it is lowered to clear its lane's top; flows between the
    // two then cross wherever the drop put them, and the router re-routes a
    // flow round a sub-process lying over its path as best it can. Keeping a
    // template off the process is the placement's job (issue 6b). What the
    // settle itself guarantees still holds: no flow crosses anything that
    // moved WITH it (the template's flows its own elements, a translated flow
    // what travelled with it).
    for (const t of inline) {
      const p = centred(t.data, 495.41, 167.57);
      const after = applyT(d, p);
      const naive: DiagramData = { ...d, elements: [...d.elements, ...p.elements], connectors: [...d.connectors, ...p.connectors] };
      const ids = new Set(p.elements.map((e) => e.id));
      expect(newlyDetached(naive, after), t.name).toEqual([]);
      expect(rigidNotTranslated(naive, after), t.name).toEqual([]);
      expect(poolOverlaps(after, d), t.name).toEqual([]);
      expect(outsideParent(after, ids), t.name).toEqual([]);
      expect(boundaryOutsideBand(after, ids), t.name).toEqual([]);
      expect(unownedOverPool(after, ids), t.name).toEqual([]);
      expect(pieceOffsets(p.elements, after), t.name).toHaveLength(1);
      // The template's own flows cross nothing of the template's they did not.
      const tplConn = new Set(p.connectors.map((c) => c.id));
      const was = crossings(naive);
      const own = [...crossings(after)].filter((k) => !was.has(k) && tplConn.has(k.split("|")[0]) && ids.has(k.split("|")[1]));
      expect(own, t.name).toEqual([]);
    }
  });

  /** Did this existing flow keep its route (translated or untouched)? */
  function rigidOrStill(before: DiagramData, after: DiagramData, c: Connector): boolean {
    const was = before.connectors.find((x) => x.id === c.id);
    if (!was) return false;
    const s0 = at(before, c.sourceId), s1 = at(after, c.sourceId);
    const dx = s1.x - s0.x, dy = s1.y - s0.y;
    return was.waypoints.length === c.waypoints.length
      && was.waypoints.every((p, i) => Math.abs(p.x + dx - c.waypoints[i].x) < 0.01 && Math.abs(p.y + dy - c.waypoints[i].y) < 0.01);
  }

  it("and the existing flows that were only translated or left alone cross nothing new, whatever the drop", () => {
    for (const t of inline) {
      for (const p of [centred(t.data, 495.41, 167.57), leftAt(t.data, gw.x + gw.width + 51, 18.9)]) {
        const after = applyT(d, p);
        const naive: DiagramData = { ...d, elements: [...d.elements, ...p.elements], connectors: [...d.connectors, ...p.connectors] };
        const ids = new Set(p.elements.map((e) => e.id));
        const was = crossings(naive);
        const bad = [...crossings(after)].filter((k) => {
          const [cid, eid] = k.split("|");
          if (was.has(k) || ids.has(eid) || p.connectors.some((x) => x.id === cid)) return false;
          return rigidOrStill(naive, after, after.connectors.find((x) => x.id === cid)!);
        });
        expect(bad, t.name).toEqual([]);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4874 — wiring: one cascade, one settle, geometry first", () => {
  const hook = src("app/hooks/useDiagram.ts");
  const caseOf = (name: string) => {
    const start = hook.indexOf(`    case "${name}": {`);
    expect(start, name).toBeGreaterThan(-1);
    const next = hook.indexOf("\n    case \"", start + 10);
    return hook.slice(start, next);
  };

  it("applyPoolBelowShift / applyPoolAboveShift are gone; MOVE_ELEMENT pushes pools with the one cascade", () => {
    expect(hook).not.toMatch(/function applyPoolBelowShift|function applyPoolAboveShift|applyPoolBelowShift\(|applyPoolAboveShift\(/);
    // …and so is its unused sideways copy, a second 100-px rule.
    expect(hook).not.toContain("applyPoolRightShift");
    expect(caseOf("MOVE_ELEMENT")).toContain("elements = cascadePoolsBelow(elementsBefore, elements, state.relaxedLayout);");
    expect(hook.match(/cascadePoolsBelow\(/g)!.length, "defined once, called by settleGrowth and MOVE_ELEMENT").toBe(3);
  });

  it("every case that grows a lane settles ONCE, after its geometry", () => {
    for (const name of ["APPLY_TEMPLATE", "UPDATE_LABEL", "SET_LANE_FONT_SIZE", "ADD_LANE", "ADD_SUBLANE", "ADD_ELEMENT", "DELETE_ELEMENT"]) {
      const body = caseOf(name);
      const grows = [...body.matchAll(/\b(resizeLaneForLabel|makeRoomInLane|growLaneToHeight|growLaneAtTop)\(/g)];
      expect(grows.length, name).toBeGreaterThan(0);
      for (const g of grows) {
        const after = body.slice(g.index!);
        expect(after, `${name}: ${g[1]} is followed by settleGrowth`).toMatch(/settleGrowth\(/);
      }
    }
    // The helpers themselves are geometry only.
    for (const fn of ["function resizeLaneForLabel(", "function makeRoomInLane(", "function growLaneAtTop(", "function growLaneToHeight("]) {
      const start = hook.indexOf(fn);
      expect(start, fn).toBeGreaterThan(-1);
      const body = hook.slice(start, hook.indexOf("\n}\n", start));
      expect(body, fn).not.toMatch(/recomputeAllConnectors|shiftElementsPastLineWithinSpan|Connector\[\]/);
    }
  });

  it("settleGrowth is the cascade, the notes, then connectorsFollow; connectorsFollow uses the one message-label rule", () => {
    const start = hook.indexOf("export function settleGrowth(");
    const body = hook.slice(start, hook.indexOf("\n}\n", start));
    expect(body.indexOf("cascadePoolsBelow(")).toBeLessThan(body.indexOf("unownedNotesFollow("));
    expect(body.indexOf("unownedNotesFollow(")).toBeLessThan(body.indexOf("connectorsFollow("));
    const cf = hook.slice(hook.indexOf("export function connectorsFollow("), hook.indexOf("export function settleGrowth("));
    expect(cf).toContain("followMessageLabel(");
    expect(cf).toContain("pinPoolMessageEnds(");
    expect(cf).toContain("labelFollowOnRouteChange(");
    expect(cf).not.toContain("adjustMsgLabelOffset(");
  });

  it("APPLY_TEMPLATE: no per-element band pass, reconcile on the existing elements only, the plan from templateAdoption.ts, the join after the settle", () => {
    const body = caseOf("APPLY_TEMPLATE");
    expect(body).toContain("const existing = reconcileLaneMembership(state.elements);");
    expect(body).not.toMatch(/reconcileLaneMembership\(\[\.\.\.state\.elements, \.\.\.action\.payload\.elements\]\)/);
    expect(body).not.toContain("bandOf");
    expect(body).toContain("planTemplateAdoption(existing, payload.elements)");
    expect(body.indexOf("settleGrowth(")).toBeLessThan(body.indexOf(`type: "ADD_CONNECTOR"`));
    expect(body).toContain("notesPlaced: payloadIds");
    expect(body, "the join alone is checked against obstacles").toContain("keepOtherRoutes: true");
    expect(body, "the room is made for the whole piece, edge events included").toContain("plan.fragmentIds.has(e.id)");
  });

  it("POOL_GAP is one constant, shared by generation and the template stacking", () => {
    expect(src("app/lib/diagram/bpmnLayout.ts")).not.toMatch(/const POOL_GAP\s*=/);
    expect(src("app/lib/diagram/bpmnLayout.ts")).toContain(`import { POOL_GAP } from "./poolLaneBounds";`);
    expect(POOL_GAP).toBe(98);
  });
});

describe("T4875 — settleGrowth on its own: pure, and a no-op when nothing grew", () => {
  it("returns the same connectors when the geometry did not change", () => {
    const d = paulsDiagram();
    const s = settleGrowth(d.elements, d.elements, d.connectors);
    expect(s.elements).toBe(d.elements);
    expect(s.connectors).toBe(d.connectors);
  });

  it("SET_DATA(base) then APPLY_TEMPLATE equals APPLY_TEMPLATE on base — the swap's composition (issue 5) still holds", () => {
    const d = paulsDiagram();
    const p = paulsPayload();
    const direct = applyT(d, p);
    const viaSet = applyT(run({ ...d, elements: [], connectors: [] }, { type: "SET_DATA", payload: d }), p);
    expect(viaSet).toEqual(direct);
  });
});

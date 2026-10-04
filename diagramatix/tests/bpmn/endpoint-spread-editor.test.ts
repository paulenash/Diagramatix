/**
 * T5237 — the editor applies the endpoint rule after every action (slice 3 of new features/connector-endpoints-plan-2026-10-03.md).
 *
 * Through the REAL reducer: a connector drawn, an end dragged, a voice command. Only the connectors an action TOUCHED
 * may move; every other connector is frozen and simply counts as occupied — an old diagram's legacy collision is not
 * silently rearranged by an unrelated edit (the load-time repair is slice 5). Undo / redo / load (SET_DATA) are exact.
 */
import { describe, expect, it } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import { spreadAfter } from "@/app/lib/diagram/spreadPass";
import { eventSpineX } from "@/app/lib/diagram/routing";
import { SPREAD } from "@/app/lib/diagram/endpointSpread";
import { findLayoutViolations } from "@/app/lib/diagram/checks/layoutViolations";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement, type Side } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: type === "pool" ? { poolType: "white-box" } : {}, ...extra }) as DiagramElement;
const TASK = (id: string, x: number, y: number) => el(id, "task", x, y, 102, 65);
const EVT = (id: string, x: number, y: number) => el(id, "intermediate-event", x, y, 36, 36);
const world = (elements: DiagramElement[], connectors: Connector[] = []): DiagramData => ({ ...EMPTY_DIAGRAM, elements, connectors } as DiagramData);

const add = (d: DiagramData, s: string, t: string, ss: Side, ts: Side, type: "sequence" | "messageBPMN" = "sequence"): DiagramData =>
  reducer(d, { type: "ADD_CONNECTOR", payload: { sourceId: s, targetId: t, connectorType: type, directionType: "directed", routingType: "rectilinear", sourceSide: ss, targetSide: ts } } as Action);
const get = (d: DiagramData, id: string) => d.connectors.find((c) => c.id === id)!;
const off = (c: Connector, role: "source" | "target") => (role === "source" ? c.sourceOffsetAlong : c.targetOffsetAlong) ?? 0.5;
const ids = (d: DiagramData) => d.connectors.map((c) => c.id);

describe("T5237 a connector drawn", () => {
  it("a second flow leaving the same face separates itself; the first stays exactly where it was", () => {
    let d = world([TASK("a", 0, 100), TASK("b", 300, 0), TASK("c", 300, 200)]);
    d = add(d, "a", "b", "right", "left");
    const first = { ...get(d, ids(d)[0]) };
    d = add(d, "a", "c", "right", "left");
    const [c1, c2] = ids(d).map((id) => get(d, id));
    expect(off(c1, "source")).toBe(off(first, "source"));                             // frozen: not touched, not moved
    expect(Math.abs(off(c1, "source") - off(c2, "source")) * 65).toBeGreaterThanOrEqual(SPREAD.activity.gap - 0.1);
    expect(findLayoutViolations(d).filter((v) => v.startsWith("shared attachment point"))).toEqual([]);
  });

  it("the new connector's route is drawn from where it now attaches (orthogonal, attached)", () => {
    let d = world([TASK("a", 0, 100), TASK("b", 300, 0), TASK("c", 300, 200)]);
    d = add(d, "a", "b", "right", "left");
    d = add(d, "a", "c", "right", "left");
    for (const c of d.connectors) {
      const vis = c.waypoints.slice(c.sourceInvisibleLeader ? 1 : 0, c.targetInvisibleLeader ? -1 : undefined);
      for (let i = 1; i < vis.length; i++) expect(Math.abs(vis[i].x - vis[i - 1].x) < 1 || Math.abs(vis[i].y - vis[i - 1].y) < 1, `${c.id} segment ${i}`).toBe(true);
    }
  });

  it("three flows into one Event: separated 3 px at its face, never off the face", () => {
    let d = world([TASK("a", 0, 0), TASK("b", 0, 100), TASK("c", 0, 200), EVT("e", 300, 120)]);
    for (const s of ["a", "b", "c"]) d = add(d, s, "e", "right", "left");
    const p = d.connectors.map((c) => off(c, "target") * 36).sort((x, y) => x - y);
    for (let i = 1; i < p.length; i++) expect(p[i] - p[i - 1]).toBeGreaterThanOrEqual(SPREAD.event.gap - 0.1);
    expect(p[0]).toBeGreaterThanOrEqual(SPREAD.event.margin - 0.1);
    expect(p[p.length - 1]).toBeLessThanOrEqual(36 - SPREAD.event.margin + 0.1);
  });

  it("a gateway's branches are NOT touched — four on one vertex stay on it (gateways out of scope)", () => {
    let d = world([el("g", "gateway", 100, 100, 40, 40), TASK("a", 300, 0), TASK("b", 300, 100), TASK("c", 300, 200), TASK("x", 300, 300)]);
    for (const t of ["a", "b", "c", "x"]) d = add(d, "g", t, "right", "left");
    for (const c of d.connectors) expect(off(c, "source")).toBe(0.5);
  });
});

describe("T5237 messages", () => {
  const pools = () => [el("P", "pool", 0, 0, 1000, 300), el("C", "pool", 0, 500, 1000, 100, { properties: { poolType: "black-box" } })];

  it("two messages from one Task to a pool: spines 24 px apart, the pool end following", () => {
    let d = world([...pools(), TASK("t", 300, 100)]);
    d = add(d, "t", "C", "bottom", "top", "messageBPMN");
    d = add(d, "t", "C", "bottom", "top", "messageBPMN");
    const xs = d.connectors.map((c) => c.waypoints[1].x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(SPREAD.messageActivity - 0.5);
    for (const c of d.connectors) expect(c.waypoints[1].x).toBeCloseTo(c.waypoints[2].x, 3);    // still one vertical line
  });

  it("two messages on one Event: drawn 3 px apart — the router honours the fan", () => {
    let d = world([...pools(), EVT("e", 300, 100)]);
    d = add(d, "e", "C", "bottom", "top", "messageBPMN");
    d = add(d, "e", "C", "bottom", "top", "messageBPMN");
    const xs = d.connectors.map((c) => c.waypoints[1].x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(SPREAD.messageEvent - 0.1);
    expect(xs[1] - xs[0]).toBeLessThanOrEqual(SPREAD.messageEvent + 1);
  });

  it("an old diagram's arbitrary offset on an Event still means the centre (the fan has a limit)", () => {
    const e = EVT("e", 300, 100);
    expect(eventSpineX(e, undefined)).toBe(318);
    expect(eventSpineX(e, 0.5)).toBe(318);
    expect(eventSpineX(e, 0.5 + 3 / 36)).toBeCloseTo(321, 3);     // inside the fan: honoured
    expect(eventSpineX(e, 0.2)).toBe(318);                          // an old arbitrary offset: the centre, as it always was
    expect(eventSpineX(e, 0.9)).toBe(318);
  });
});

describe("T5237 only what an action touched may move", () => {
  const legacy = (): DiagramData => {
    // Two flows already sharing a point on A's face — an old diagram.
    const els = [TASK("a", 0, 100), TASK("b", 300, 0), TASK("c", 300, 200), TASK("z", 600, 100)];
    let d = world(els);
    d = add(d, "a", "b", "right", "left");
    d = add(d, "a", "c", "right", "left");
    d = { ...d, connectors: d.connectors.map((c) => ({ ...c, sourceOffsetAlong: 0.5 })) };      // put them back on one point
    return d;
  };
  const snap = (d: DiagramData) => JSON.stringify(d.connectors.map((c) => [c.id, c.sourceOffsetAlong, c.targetOffsetAlong]));

  it("a label edit, a rename and a move of an UNRELATED element leave the legacy collision exactly as it was", () => {
    const d = legacy();
    const before = snap(d);
    expect(snap(reducer(d, { type: "UPDATE_LABEL", payload: { id: "z", label: "Renamed" } } as Action))).toBe(before);
    expect(snap(reducer(d, { type: "MOVE_ELEMENT", payload: { id: "z", x: 650, y: 120 } } as Action))).toBe(before);
    expect(snap(reducer(d, { type: "UPDATE_CONNECTOR_LABEL", payload: { id: d.connectors[0].id, label: "Yes" } } as Action))).toBe(before);
  });

  it("undo / redo / load (SET_DATA) restore a state exactly — nothing is re-spread", () => {
    const d = legacy();
    expect(snap(reducer(world([]), { type: "SET_DATA", payload: d } as Action))).toBe(snap(d));
  });

  it("moving one of the colliding connectors' elements moves THAT connector, round the one that stays", () => {
    const d = legacy();
    const b = reducer(d, { type: "MOVE_ELEMENT", payload: { id: "b", x: 300, y: 20 } } as Action);
    const [c1, c2] = [get(b, d.connectors[0].id), get(b, d.connectors[1].id)];
    expect(off(c2, "source")).toBe(0.5);                                                       // untouched: stays
    expect(Math.abs(off(c1, "source") - off(c2, "source")) * 65).toBeGreaterThanOrEqual(SPREAD.activity.gap - 0.1);   // the moved one separates
  });

  it("a route the person shaped by hand (nine or more points) is never moved", () => {
    const d = legacy();
    const shaped = { ...d.connectors[0], waypoints: Array.from({ length: 9 }, (_, i) => ({ x: 100 + i * 10, y: i % 2 ? 130 : 140 })) } as Connector;
    const prev = world(d.elements, [shaped, d.connectors[1]]);
    const next = { ...prev, connectors: [{ ...shaped, targetSide: "top" as Side }, d.connectors[1]] };   // re-attached: touched, but shaped
    const out = spreadAfter(prev, next);
    expect(off(out.connectors[0], "source")).toBe(0.5);
  });
});

describe("T5237 NL Assist", () => {
  it("“add a task … after A” twice: the two flows leaving A do not share a point", () => {
    const h = headlessDiagram(world([TASK("a", 0, 100)]));
    for (const name of ["First", "Second"]) {
      const r = applyAssistOps(parseCommand(`add a task called ${name} after a`)!, h.context({ selectedIds: [] }));
      expect(r.ok, r.summary).toBe(true);
    }
    expect(h.data.connectors.length).toBeGreaterThanOrEqual(2);
    expect(findLayoutViolations(h.data).filter((v) => v.startsWith("shared attachment point"))).toEqual([]);
  });
});

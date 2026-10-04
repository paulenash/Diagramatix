/**
 * T5234 — the endpoint allocator (slice 1 of new features/connector-endpoints-plan-2026-10-03.md).
 * One connector per attachment point on Activities and Events; gateways out of scope; lone and user-placed ends untouched;
 * fewest crossings; messages 24 px on an Activity, 3 px on an Event; idempotent.
 */
import { describe, expect, it } from "vitest";
import { spreadEndpoints, SPREAD } from "@/app/lib/diagram/endpointSpread";
import { recomputeAllConnectors } from "@/app/lib/diagram/routing";
import type { Connector, DiagramElement, Side } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: type === "pool" ? { poolType: "white-box" } : {}, ...extra }) as DiagramElement;
const TASK = (id: string, x: number, y: number) => el(id, "task", x, y, 102, 65);
const EVT = (id: string, x: number, y: number) => el(id, "intermediate-event", x, y, 36, 36);
const conn = (id: string, s: string, t: string, ss: Side, ts: Side, extra: Partial<Connector> = {}): Connector =>
  ({ id, type: "sequence", sourceId: s, targetId: t, sourceSide: ss, targetSide: ts, directionType: "directed", routingType: "rectilinear", waypoints: [], ...extra }) as Connector;
const msg = (id: string, s: string, t: string, ss: Side, ts: Side, extra: Partial<Connector> = {}): Connector =>
  ({ ...conn(id, s, t, ss, ts, extra), type: "messageBPMN" }) as Connector;
const get = (cs: Connector[], id: string) => cs.find((c) => c.id === id)!;
const off = (c: Connector, role: "source" | "target") => (role === "source" ? c.sourceOffsetAlong : c.targetOffsetAlong) ?? 0.5;

describe("T5234 lone ends and user-placed ends are never touched", () => {
  it("a lone connector stays exactly as it is, at 0.5 or anywhere the user put it", () => {
    const els = [TASK("a", 0, 0), TASK("b", 300, 0)];
    for (const o of [0.5, 0.2, 0.9]) {
      const r = spreadEndpoints(els, [conn("c", "a", "b", "right", "left", { sourceOffsetAlong: o })]);
      expect(r.changedIds).toEqual([]);
      expect(off(get(r.connectors, "c"), "source")).toBe(o);
    }
  });
  it("two ends the user placed far apart on one face do not collide, so neither moves", () => {
    const els = [TASK("a", 0, 0), TASK("b", 300, -100), TASK("c", 300, 100)];
    const cs = [conn("c1", "a", "b", "right", "left", { sourceOffsetAlong: 0.2 }), conn("c2", "a", "c", "right", "left", { sourceOffsetAlong: 0.8 })];
    const r = spreadEndpoints(els, cs);
    expect(r.changedIds).toEqual([]);
  });
});

describe("T5234 Activities: ends on one face are spread ~8 px, symmetric about where they were", () => {
  const els = [TASK("a", 0, 100), TASK("b", 300, 0), TASK("c", 300, 100), TASK("d", 300, 200)];
  const cs = [conn("c1", "a", "b", "right", "left"), conn("c2", "a", "c", "right", "left"), conn("c3", "a", "d", "right", "left")];
  const r = spreadEndpoints(els, cs);
  const px = (id: string) => off(get(r.connectors, id), "source") * 65;      // the right face is 65 px tall

  it("three outgoing flows: three distinct points 8 px apart, centred on 0.5", () => {
    const p = ["c1", "c2", "c3"].map(px).sort((x, y) => x - y);
    expect(p[1] - p[0]).toBeCloseTo(SPREAD.activity.step, 1);
    expect(p[2] - p[1]).toBeCloseTo(SPREAD.activity.step, 1);
    expect((p[0] + p[2]) / 2).toBeCloseTo(32.5, 1);
    expect(r.unresolved).toEqual([]);
  });
  it("in the order of where they go: the flow to the upper task takes the upper point", () => {
    expect(px("c1")).toBeLessThan(px("c2"));
    expect(px("c2")).toBeLessThan(px("c3"));
  });
  it("only what had to move is reported as changed: the middle one was already at the centre slot, the arrivals are alone", () => {
    expect(r.changedIds.sort()).toEqual(["c1", "c3"]);
    expect(off(get(r.connectors, "c2"), "source")).toBe(0.5);
    for (const c of r.connectors) expect(off(c, "target")).toBe(0.5);
  });
  it("two, four and five ends fit inside the face", () => {
    for (const n of [2, 4, 5]) {
      const targets = Array.from({ length: n }, (_, i) => TASK(`t${i}`, 300, i * 90));
      const cc = targets.map((t, i) => conn(`k${i}`, "a", t.id, "right", "left"));
      const rr = spreadEndpoints([TASK("a", 0, 100), ...targets], cc);
      const p = cc.map((c) => off(get(rr.connectors, c.id), "source") * 65).sort((x, y) => x - y);
      for (let i = 1; i < p.length; i++) expect(p[i] - p[i - 1]).toBeGreaterThanOrEqual(SPREAD.activity.gap - 0.1);
      expect(p[0]).toBeGreaterThanOrEqual(SPREAD.activity.margin - 0.1);
      expect(p[p.length - 1]).toBeLessThanOrEqual(65 - SPREAD.activity.margin + 0.1);
    }
  });
  it("a leaving end and an arriving end on the same face do not share a point either", () => {
    const e2 = [TASK("a", 0, 0), TASK("b", 300, 0), TASK("z", -300, 0)];
    const c2 = [conn("out", "a", "b", "right", "left"), conn("in", "z", "a", "right", "right")];
    const rr = spreadEndpoints(e2, c2);
    expect(Math.abs(off(get(rr.connectors, "out"), "source") - off(get(rr.connectors, "in"), "target")) * 65).toBeGreaterThanOrEqual(SPREAD.activity.gap - 0.1);
  });
});

describe("T5234 Events: ~3 px", () => {
  it("two flows into one Event are 3 px apart, inside its 36 px face", () => {
    const els = [TASK("a", 0, 0), TASK("b", 0, 120), EVT("e", 300, 60)];
    const r = spreadEndpoints(els, [conn("c1", "a", "e", "right", "left"), conn("c2", "b", "e", "right", "left")]);
    const p = ["c1", "c2"].map((id) => off(get(r.connectors, id), "target") * 36).sort((x, y) => x - y);
    expect(p[1] - p[0]).toBeCloseTo(SPREAD.event.step, 1);
    expect(p[0]).toBeGreaterThanOrEqual(SPREAD.event.margin - 0.1);
    expect(r.unresolved).toEqual([]);
  });
  it("a boundary event with two flows fans them too", () => {
    const els = [TASK("host", 0, 100), el("be", "intermediate-event", 66, 82, 36, 36, { boundaryHostId: "host" }), TASK("x", 300, 0), TASK("y", 300, 200)];
    const r = spreadEndpoints(els, [conn("c1", "be", "x", "top", "left"), conn("c2", "be", "y", "top", "left")]);
    const p = ["c1", "c2"].map((id) => off(get(r.connectors, id), "source") * 36);
    expect(Math.abs(p[0] - p[1])).toBeGreaterThanOrEqual(SPREAD.event.gap - 0.1);
  });
});

describe("T5234 crossings: fewest wins; ties keep the order by target position", () => {
  it("a bottom face with a target lower-left and one lower-right: the left target takes the left point", () => {
    const els = [TASK("a", 200, 0), TASK("l", 0, 200), TASK("r", 400, 200)];
    const r = spreadEndpoints(els, [conn("toR", "a", "r", "bottom", "top"), conn("toL", "a", "l", "bottom", "top")]);
    expect(off(get(r.connectors, "toL"), "source")).toBeLessThan(off(get(r.connectors, "toR"), "source"));
  });
  it("the spread routes do not cross each other", () => {
    const els = [TASK("a", 200, 0), TASK("l", 0, 200), TASK("m", 200, 260), TASK("r", 400, 200)];
    const r = spreadEndpoints(els, [conn("c1", "a", "r", "bottom", "top"), conn("c2", "a", "l", "bottom", "top"), conn("c3", "a", "m", "bottom", "top")]);
    const routed = recomputeAllConnectors(r.connectors, els);
    const segs = routed.flatMap((c) => c.waypoints.slice(1, -1).slice(0, -1).map((p, i, a) => [c.id, p, c.waypoints.slice(1, -1)[i + 1]] as const)).filter((s) => s[2]);
    let crossings = 0;
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (segs[i][0] === segs[j][0]) continue;
      const [, p1, p2] = segs[i], [, p3, p4] = segs[j];
      const d = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
      if (d1 * d2 < 0 && d3 * d4 < 0) crossings++;
    }
    expect(crossings).toBe(0);
  });
});

describe("T5234 messages", () => {
  it("two messages on one Activity face are 24 px apart (the spine moves, at both ends)", () => {
    const els = [el("P", "pool", 0, 0, 1000, 300), TASK("t", 300, 100), el("C", "pool", 0, 500, 1000, 100, { properties: { poolType: "black-box" } })];
    const r = spreadEndpoints(els, [msg("m1", "t", "C", "bottom", "top"), msg("m2", "t", "C", "bottom", "top")]);
    const x = (id: string) => 300 + off(get(r.connectors, id), "source") * 102;
    expect(Math.abs(x("m1") - x("m2"))).toBeGreaterThanOrEqual(SPREAD.messageActivity - 0.1);
    expect((x("m1") + x("m2")) / 2).toBeCloseTo(351, 0);                       // symmetric about the centre of the Task
    expect(r.changedIds.sort()).toEqual(["m1", "m2"]);
    for (const id of ["m1", "m2"]) {                                          // the pool end follows the same world x
      const c = get(r.connectors, id);
      expect(0 + off(c, "target") * 1000).toBeCloseTo(x(id), 0);
    }
  });
  it("two messages on one Event are 3 px apart", () => {
    const els = [el("P", "pool", 0, 0, 1000, 300), EVT("e", 300, 100), el("C", "pool", 0, 500, 1000, 100, { properties: { poolType: "black-box" } })];
    const r = spreadEndpoints(els, [msg("m1", "e", "C", "bottom", "top"), msg("m2", "e", "C", "bottom", "top")]);
    const x = (id: string) => 300 + off(get(r.connectors, id), "source") * 36;
    expect(Math.abs(x("m1") - x("m2"))).toBeGreaterThanOrEqual(SPREAD.messageEvent - 0.1);
  });
  it("two tasks in one column messaging one pool: they were on the same x of the pool face, now 24 px apart", () => {
    const els = [el("P", "pool", 0, 0, 1000, 600), TASK("t1", 300, 100), TASK("t2", 300, 300), el("C", "pool", 0, 800, 1000, 100, { properties: { poolType: "black-box" } })];
    const r = spreadEndpoints(els, [msg("m1", "t1", "C", "bottom", "top"), msg("m2", "t2", "C", "bottom", "top")]);
    const w = (id: string) => off(get(r.connectors, id), "target") * 1000;
    expect(Math.abs(w("m1") - w("m2"))).toBeGreaterThanOrEqual(SPREAD.pool.gap - 0.1);
  });
  it("relaxed (free-form / imported) layout: messages are left alone", () => {
    const els = [el("P", "pool", 0, 0, 1000, 300), TASK("t", 300, 100), el("C", "pool", 0, 500, 1000, 100, { properties: { poolType: "black-box" } })];
    const r = spreadEndpoints(els, [msg("m1", "t", "C", "bottom", "top"), msg("m2", "t", "C", "bottom", "top")], { relaxed: true });
    expect(r.changedIds).toEqual([]);
  });
});

describe("T5234 out of scope", () => {
  it("gateway ends are neither moved nor counted", () => {
    const els = [el("g", "gateway", 100, 100, 40, 40), TASK("a", 300, 0), TASK("b", 300, 100), TASK("c", 300, 200), TASK("d", 300, 300)];
    const cs = [conn("c1", "g", "a", "right", "left"), conn("c2", "g", "b", "right", "left"), conn("c3", "g", "c", "right", "left"), conn("c4", "g", "d", "right", "left")];
    const r = spreadEndpoints(els, cs);
    expect(r.changedIds).toEqual([]);
    for (const c of r.connectors) expect(off(c, "source")).toBe(0.5);
  });
  it("associations (data, annotation) are left alone", () => {
    const els = [TASK("a", 0, 0), el("d1", "data-object", 300, 0, 36, 46), el("d2", "data-object", 300, 100, 36, 46)];
    const cs = [conn("x1", "a", "d1", "right", "left", { type: "associationBPMN" as never }), conn("x2", "a", "d2", "right", "left", { type: "associationBPMN" as never })];
    expect(spreadEndpoints(els, cs).changedIds).toEqual([]);
  });
});

describe("T5234 idempotent", () => {
  it("running it on its own output changes nothing — for every case above", () => {
    const worlds: Array<[DiagramElement[], Connector[]]> = [
      [[TASK("a", 0, 100), TASK("b", 300, 0), TASK("c", 300, 100), TASK("d", 300, 200)],
        [conn("c1", "a", "b", "right", "left"), conn("c2", "a", "c", "right", "left"), conn("c3", "a", "d", "right", "left")]],
      [[TASK("a", 0, 0), TASK("b", 0, 120), EVT("e", 300, 60)], [conn("c1", "a", "e", "right", "left"), conn("c2", "b", "e", "right", "left")]],
      [[TASK("a", 200, 0), TASK("l", 0, 200), TASK("r", 400, 200)], [conn("toR", "a", "r", "bottom", "top"), conn("toL", "a", "l", "bottom", "top")]],
      [[el("P", "pool", 0, 0, 1000, 600), TASK("t1", 300, 100), TASK("t2", 300, 300), el("C", "pool", 0, 800, 1000, 100, { properties: { poolType: "black-box" } })],
        [msg("m1", "t1", "C", "bottom", "top"), msg("m2", "t2", "C", "bottom", "top")]],
      [[el("P", "pool", 0, 0, 1000, 300), EVT("e", 300, 100), el("C", "pool", 0, 500, 1000, 100, { properties: { poolType: "black-box" } })],
        [msg("m1", "e", "C", "bottom", "top"), msg("m2", "e", "C", "bottom", "top")]],
    ];
    for (const [els, cs] of worlds) {
      const once = spreadEndpoints(els, cs);
      const twice = spreadEndpoints(els, once.connectors);
      expect(twice.changedIds).toEqual([]);
      expect(twice.connectors).toEqual(once.connectors);
    }
  });
  it("and it does not mutate its input", () => {
    const els = [TASK("a", 0, 100), TASK("b", 300, 0), TASK("c", 300, 100)];
    const cs = [conn("c1", "a", "b", "right", "left"), conn("c2", "a", "c", "right", "left")];
    const before = JSON.stringify(cs);
    spreadEndpoints(els, cs);
    expect(JSON.stringify(cs)).toBe(before);
  });
});

/**
 * T5239 — heal on load (slice 5 of new features/connector-endpoints-plan-2026-10-03.md).
 *
 * The pure repair: `healEndpoints` separates connectors that share an attachment point in a SAVED diagram, once, on open.
 * Left alone by Paul's rulings: image-generated diagrams (`relaxedLayout`) and imports (`exactAsDrawn`), gateways, hand-shaped
 * routes. A diagram with nothing to heal comes back as the SAME object (so nothing is dirtied, no history entry made).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { healEndpoints } from "@/app/lib/diagram/spreadPass";
import { reducer } from "@/app/hooks/useDiagram";
import { buildBpmnXml } from "@/app/lib/diagram/bpmn/exportBpmnXml";
import { importBpmnXml } from "@/app/lib/diagram/bpmn/importBpmnXml";
import { findLayoutViolations } from "@/app/lib/diagram/checks/layoutViolations";
import { SPREAD } from "@/app/lib/diagram/endpointSpread";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement, type Side } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: type === "pool" ? { poolType: "white-box" } : {}, ...extra }) as DiagramElement;
const TASK = (id: string, x: number, y: number) => el(id, "task", x, y, 102, 65);
const conn = (id: string, s: string, t: string, ss: Side, ts: Side, extra: Partial<Connector> = {}): Connector =>
  ({ id, type: "sequence", sourceId: s, targetId: t, sourceSide: ss, targetSide: ts, directionType: "directed", routingType: "rectilinear",
    sourceInvisibleLeader: true, targetInvisibleLeader: true, waypoints: [], ...extra }) as Connector;

/** An OLD diagram: three flows leave A's right face, all at the centre (one point). */
const legacy = (extra: Partial<DiagramData> = {}): DiagramData => ({
  ...EMPTY_DIAGRAM,
  elements: [TASK("a", 0, 100), TASK("b", 300, 0), TASK("c", 300, 100), TASK("d", 300, 200)],
  connectors: [conn("c1", "a", "b", "right", "left"), conn("c2", "a", "c", "right", "left"), conn("c3", "a", "d", "right", "left")],
  ...extra,
} as DiagramData);
const shared = (d: DiagramData) => findLayoutViolations(d).filter((v) => v.startsWith("shared attachment point"));

describe("T5239 the repair", () => {
  it("separates the connectors that share a point, and says which it changed", () => {
    const d = legacy();
    expect(shared(d).length).toBeGreaterThan(0);
    const r = healEndpoints(d);
    expect(r.changedIds.sort()).toEqual(["c1", "c3"]);                        // the middle one was already at the centre slot
    expect(shared(r.data)).toEqual([]);
    const p = r.data.connectors.map((c) => (c.sourceOffsetAlong ?? 0.5) * 65).sort((x, y) => x - y);
    expect(p[1] - p[0]).toBeGreaterThanOrEqual(SPREAD.activity.gap - 0.1);
    expect(p[2] - p[1]).toBeGreaterThanOrEqual(SPREAD.activity.gap - 0.1);
  });
  it("re-routes what it changed: each healed connector is drawn from where it now attaches", () => {
    const r = healEndpoints(legacy());
    for (const id of r.changedIds) {
      const c = r.data.connectors.find((x) => x.id === id)!;
      expect(c.waypoints.length).toBeGreaterThanOrEqual(2);
      const vis = c.waypoints.slice(1, -1);
      for (let i = 1; i < vis.length; i++) expect(Math.abs(vis[i].x - vis[i - 1].x) < 1 || Math.abs(vis[i].y - vis[i - 1].y) < 1).toBe(true);
    }
  });
  it("nothing else is touched: a connector not involved keeps its object", () => {
    const d = legacy();
    d.elements.push(TASK("z", 700, 100), TASK("y", 1000, 100));
    d.connectors.push(conn("far", "z", "y", "right", "left"));
    const r = healEndpoints(d);
    expect(r.data.connectors.find((c) => c.id === "far")).toBe(d.connectors.find((c) => c.id === "far"));
  });
  it("idempotent: healing a healed diagram changes nothing, and a clean diagram comes back as the SAME object", () => {
    const once = healEndpoints(legacy());
    const twice = healEndpoints(once.data);
    expect(twice.changedIds).toEqual([]);
    expect(twice.data).toBe(once.data);
    const clean = { ...legacy(), connectors: [conn("only", "a", "b", "right", "left")] } as DiagramData;
    const r = healEndpoints(clean);
    expect(r.changedIds).toEqual([]);
    expect(r.data).toBe(clean);
  });
});

describe("T5239 left exactly as drawn", () => {
  it("a diagram generated from an IMAGE (relaxedLayout) is untouched", () => {
    const d = legacy({ relaxedLayout: true });
    const r = healEndpoints(d);
    expect(r.changedIds).toEqual([]);
    expect(r.data).toBe(d);
  });
  it("an imported diagram (exactAsDrawn) is untouched", () => {
    const d = legacy({ exactAsDrawn: true });
    const r = healEndpoints(d);
    expect(r.changedIds).toEqual([]);
    expect(r.data).toBe(d);
  });
  it("gateways are out of scope: four branches on one vertex stay", () => {
    const d: DiagramData = {
      ...EMPTY_DIAGRAM,
      elements: [el("g", "gateway", 100, 100, 40, 40), TASK("a", 300, 0), TASK("b", 300, 100), TASK("c", 300, 200), TASK("x", 300, 300)],
      connectors: ["a", "b", "c", "x"].map((t) => conn(`k${t}`, "g", t, "right", "left")),
    } as DiagramData;
    expect(healEndpoints(d).changedIds).toEqual([]);
  });
  it("a route shaped by hand (nine or more points) is never moved", () => {
    const d = legacy();
    d.connectors[0] = { ...d.connectors[0], waypoints: Array.from({ length: 9 }, (_, i) => ({ x: 100 + i * 10, y: i % 2 ? 130 : 140 })) } as Connector;
    expect(healEndpoints(d).changedIds).not.toContain("c1");
  });
  it("a diagram with no sequence or message connectors comes back untouched", () => {
    const d = { ...EMPTY_DIAGRAM, elements: [TASK("a", 0, 0)], connectors: [] } as DiagramData;
    expect(healEndpoints(d).data).toBe(d);
  });
});

describe("T5239 the reducer action", () => {
  it("HEAL_ENDPOINTS applies the repair; applying it again changes nothing", () => {
    const d = legacy();
    const once = reducer(d, { type: "HEAL_ENDPOINTS" });
    expect(shared(once)).toEqual([]);
    const twice = reducer(once, { type: "HEAL_ENDPOINTS" });
    expect(JSON.stringify(twice.connectors)).toBe(JSON.stringify(once.connectors));
  });
});

describe("T5239 what marks a diagram exact-as-drawn", () => {
  it("a BPMN XML import carries `exactAsDrawn`", async () => {
    const d = { ...legacy(), connectors: [conn("c1", "a", "b", "right", "left")] } as DiagramData;
    const back = await importBpmnXml(buildBpmnXml(d, "x"), "x");
    expect(back.data.exactAsDrawn).toBe(true);
    expect(healEndpoints({ ...back.data, connectors: back.data.connectors }).changedIds).toEqual([]);
  });
  it("the Visio importer and the schema know the flag; image generation already carries `relaxedLayout`", () => {
    expect(readFileSync("app/lib/diagram/v3/importVisioV3.ts", "utf8")).toContain("exactAsDrawn: true");
    expect(readFileSync("app/lib/diagram/diagramSchema.ts", "utf8")).toContain("exactAsDrawn: z.boolean().optional()");
    expect(readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8")).toMatch(/relaxedLayout: true,/);
  });
});

describe("T5239 the editor wiring", () => {
  const editor = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
  const hook = readFileSync("app/hooks/useDiagram.ts", "utf8");
  it("the heal takes its history snapshot FIRST, so one Undo restores the saved drawing", () => {
    const at = hook.indexOf("healEndpointsNow: useCallback");
    const body = hook.slice(at, at + 700);
    expect(body.indexOf("pushHistory(snapshotData())")).toBeGreaterThan(-1);
    expect(body.indexOf("pushHistory(snapshotData())")).toBeLessThan(body.indexOf('dispatch({ type: "HEAL_ENDPOINTS" })'));
  });
  it("it runs once per opened diagram, in the editor only, for BPMN, not read-only, not while editing a template", () => {
    expect(editor).toContain("healDoneFor.current === diagramId");
    expect(editor).toContain('diagramType !== "bpmn" || readOnly || templateEditState !== null || historyPreviewActive');
    expect(editor).toContain("healEndpointsNow()");
  });
  it("it flashes green and says so; the phone viewer never calls it", () => {
    expect(editor).toContain("healFlash={healFlash ?? undefined}");
    expect(editor).toContain("data-heal-notice");
    expect(readFileSync("app/components/canvas/Canvas.tsx", "utf8")).toContain("<HealFlashOverlay runId={healFlash.runId} lines={healFlash.lines} />");
    expect(readFileSync("app/components/canvas/HealFlashOverlay.tsx", "utf8")).toContain("#4ade80");
    expect(readFileSync("app/m/diagram/[id]/MobileDiagramScreen.tsx", "utf8")).not.toContain("healEndpoints");
  });
});

describe("T5239 the heal waits for the reload on entry (Paul, 2026-10-05: “it flashes the connectors but does not repair them or allow undo”)", () => {
  it("with co-authoring live the heal waits for the reload; without it, or read-only, it runs at once", async () => {
    const { healMayRun } = await import("@/app/lib/diagram/healTiming");
    expect(healMayRun({ collabLive: true, freshLoadDone: false })).toBe(false);
    expect(healMayRun({ collabLive: true, freshLoadDone: true })).toBe(true);
    expect(healMayRun({ collabLive: false, freshLoadDone: false })).toBe(true);
  });
  it("the editor's reload-on-entry reports when it is done — even if the fetch failed — and the heal is gated on it", () => {
    const editor = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
    expect(editor).toMatch(/try \{ const s = await revertToSaved\(\); if \(s\) setData\(s\); \}\s+finally \{ setFreshLoadDone\(true\);/);
    expect(editor).toContain("healMayRun({ collabLive: collabEnabled && !readOnly, freshLoadDone })");
    // …and the heal block sits AFTER the reload effect, so the order of effects is the order of events.
    expect(editor.indexOf("healMayRun({ collabLive")).toBeGreaterThan(editor.indexOf("Reload-fresh on entry"));
  });
  it("the replacement is exactly what throws a heal away: setData replaces the state and clears the undo history", () => {
    const hook = readFileSync("app/hooks/useDiagram.ts", "utf8");
    const at = hook.indexOf("const setData = useCallback");
    expect(hook.slice(at, at + 400)).toContain("pastRef.current = [];");
  });
  it("on the file Paul sent (new diagram from phone image 1): the heal separates the message and the sequence flow on the event's top face", () => {
    const j = JSON.parse(readFileSync("tests/fixtures/endpoint-heal/phone-image-1.json", "utf8"));
    const d = j.diagrams[0].data as DiagramData;
    expect(shared(d).length).toBe(1);
    const r = healEndpoints(d);
    expect(r.changedIds.sort()).toEqual(["conn-pC-ie1-15", "conn-t4-pC-11", "conn-t5-ie1-14"]);   // …and the message that started under the timer (R8.42)
    expect(findLayoutViolations(r.data).filter((v) => v.startsWith("message attaches inside an edge-mounted event"))).toEqual([]);
    expect(shared(r.data)).toEqual([]);
  });
});

describe("T5244 repair places a flow on the side its other end lies on (Paul, 2026-10-05: MCMO ECOM-57 — the repair made a crossover)", () => {
  // “Enter Mobile Service# you want to recontract”: a flow from the gateway on the LEFT and a hand-shaped (frozen) flow from the
  // gateway on the RIGHT both arrive on the Task's bottom face. The repair put the left one to the RIGHT of the frozen one, and
  // the two routes crossed. Put on the left, they do not touch.
  const j = JSON.parse(readFileSync("tests/fixtures/endpoint-heal/mcmo-ecom-57.json", "utf8"));
  const saved = j.diagrams[0].data as DiagramData;
  // the file as Paul saved it is already repaired; put the left-hand flow back where an old diagram had it — the middle
  const old: DiagramData = { ...saved, connectors: saved.connectors.map((c) => c.id === "zr76vifg" ? { ...c, targetOffsetAlong: 0.5 } : c) };
  const cross = (a: { x: number; y: number }[], b: { x: number; y: number }[]) => {
    for (let i = 1; i < a.length; i++) for (let k = 1; k < b.length; k++) {
      const p1 = a[i - 1], p2 = a[i], p3 = b[k - 1], p4 = b[k];
      const rx = p2.x - p1.x, ry = p2.y - p1.y, sx = p4.x - p3.x, sy = p4.y - p3.y, den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((p3.x - p1.x) * sy - (p3.y - p1.y) * sx) / den, u = ((p3.x - p1.x) * ry - (p3.y - p1.y) * rx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    return false;
  };
  it("the left-hand flow goes to the LEFT of the frozen right-hand one, and the two routes do not cross", () => {
    const r = healEndpoints(old);
    const left = r.data.connectors.find((c) => c.id === "zr76vifg")!, right = r.data.connectors.find((c) => c.id === "waiskl3d")!;
    expect(r.changedIds).toContain("zr76vifg");
    expect(left.targetOffsetAlong).toBeLessThan(right.targetOffsetAlong ?? 0.5);
    expect(cross(left.waypoints.slice(1, -1), right.waypoints.slice(1, -1))).toBe(false);
  });
  it("the same, mirrored: the flow from the right of a frozen flow from the left goes to the right", () => {
    const els = [TASK("t", 300, 300), el("l", "gateway", 100, 500, 40, 40), el("r", "gateway", 700, 500, 40, 40)];
    const mk = (id: string, s: string, o: number, extra: Partial<Connector> = {}) => conn(id, s, "t", "top", "bottom", { targetOffsetAlong: o, ...extra });
    const frozenShape = Array.from({ length: 9 }, (_, i) => ({ x: 120 + i * 40, y: i % 2 ? 480 : 470 }));
    const d = { ...EMPTY_DIAGRAM, elements: els, connectors: [mk("keep", "l", 0.5, { waypoints: frozenShape }), mk("new", "r", 0.5)] } as DiagramData;
    const r = healEndpoints(d);
    const mover = r.data.connectors.find((c) => c.id === "new")!;
    expect(mover.targetOffsetAlong).toBeGreaterThan(0.5);
  });
});

/**
 * T4797-T4799, T4802, T4804 — a step added AFTER a boundary event (Block 2
 * Test 3, 25 September 2026).
 *
 * "add a task called fix it after event four" on Paul's diagram:
 *   - Event 4 carried its host as its parent, so the task was made a child of
 *     the subprocess, which grew to swallow it, and the flow was then refused
 *     as out of scope. The log said both "left it unconnected" and "added Fix
 *     it after Event 4".
 *   - With the parent put right, the task still landed below the Sales lane
 *     and the lane reconcile handed it to Marketing — against the generator's
 *     R7.07: "Keep it fully inside the EMIE's own lane".
 *
 * The follow-on joins the HOST's container (canConnect's scope rule), is placed
 * for the side R7.02 will give its flow, and stays in the host's lane — the
 * lane grows when it has no room.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import {
  planBoundaryFollowOn, followOnParentId, clampExitTargetToBand, boundaryOuterSide, boxFromCenter,
  placeBoundaryEvent, LANE_CHILD_PAD,
} from "@/app/lib/diagram/assistPlacement";
import { pickBoundaryEventSide, outerSideOfBox } from "@/app/lib/diagram/routing";
import { boundarySideOf } from "@/app/lib/diagram/emieLabel";
import { canConnect, flowScopeOf, containerScopeOf } from "@/app/lib/diagram/canConnect";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import type { DiagramData, DiagramElement, Point, SymbolType } from "@/app/lib/diagram/types";
import { paulsDiagram } from "../routing/_helpers/block2Test3";

const el = (id: string, type: SymbolType, x: number, y: number, w: number, h: number, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: {}, ...extra } as DiagramElement);
const data = (elements: DiagramElement[]): DiagramData =>
  ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData);
const mounted = (id: string, cx: number, cy: number, hostId: string, extra: Partial<DiagramElement> = {}) =>
  el(id, "intermediate-event", cx - 18, cy - 18, 36, 36, { boundaryHostId: hostId, ...extra });
const byId = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;
const inBand = (e: DiagramElement, lane: DiagramElement) =>
  e.y >= lane.y && e.y + e.height <= lane.y + lane.height;
/** The obstacle list voice add-after and the ghost accept pass the planner. */
const obstaclesOf = (els: DiagramElement[]) =>
  els.filter((e) => e.type !== "pool" && e.type !== "lane" && e.type !== "sublane")
    .map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
const within = (e: { x: number; y: number; width: number; height: number }, box: { x: number; y: number; width: number; height: number }) =>
  e.x >= box.x && e.x + e.width <= box.x + box.width && e.y >= box.y && e.y + e.height <= box.y + box.height;

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
/** Source with comments removed — the wiring is in the code, not the prose about it. */
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
/** One `case "X": {` block of the reducer, up to the next case. */
const caseBody = (src: string, name: string) => {
  const start = src.indexOf(`case "${name}": {`);
  expect(start, `case ${name}`).toBeGreaterThan(-1);
  const next = src.indexOf("\n    case \"", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
};
/** The body of `const name = useCallback(` … up to the next top-level const in the component. */
const callbackBody = (src: string, name: string) => {
  const start = src.indexOf(`const ${name} = useCallback(`);
  expect(start, name).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf("\n  }, [", start));
};

describe("T4797 — voice “add a task called fix it after event four” on Paul's diagram (L4)", () => {
  function sayAfter() {
    const h = headlessDiagram(paulsDiagram());
    const before = paulsDiagram();
    const r = applyAssistOps(parseCommand("add a task called fix it after event four")!, h.context());
    const task = h.data.elements.find((e) => e.type === "task" && /^fix it$/i.test(e.label))!;
    return { h, before, r, task };
  }

  it("says one thing, once", () => {
    const { r } = sayAfter();
    expect(r.ok).toBe(true);
    expect(r.summary).toBe("added fix it after Event 4");
  });

  it("the task joins the host's container — the Sales lane — and stays IN it", () => {
    const { h, task } = sayAfter();
    expect(task.parentId).toBe("sales");
    expect(inBand(task, byId(h.data, "sales")), "the task's box lies inside the Sales lane").toBe(true);
  });

  it("the subprocess keeps its size; the lane grew and everything below moved down with it", () => {
    const { h, before } = sayAfter();
    const host0 = byId(before, "rework"), host1 = byId(h.data, "rework");
    expect([host1.x, host1.y, host1.width, host1.height]).toEqual([host0.x, host0.y, host0.width, host0.height]);
    const sales = byId(h.data, "sales"), marketing = byId(h.data, "marketing");
    expect(sales.height).toBeGreaterThan(byId(before, "sales").height);
    expect(marketing.y).toBeCloseTo(sales.y + sales.height, 5);
    const dy = marketing.y - byId(before, "marketing").y;
    expect(byId(h.data, "nothing").y - byId(before, "nothing").y, "Marketing's contents moved with it").toBeCloseTo(dy, 5);
    expect(byId(h.data, "nothing").parentId).toBe("marketing");
    const pool = byId(h.data, "pool"), sf = byId(h.data, "sf");
    expect(pool.y + pool.height).toBeCloseTo(marketing.y + marketing.height, 5);
    expect(sf.y - (pool.y + pool.height), "the pool below keeps its gap").toBeCloseTo(434.18 - (-118.71 + 485.08), 5);
  });

  it("the flow leaves Event 4's south point and enters the task's left, clear of the subprocess", () => {
    const { h, task } = sayAfter();
    const c = h.data.connectors.find((x) => x.sourceId === "ev4" && x.targetId === task.id)!;
    expect(c).toBeDefined();
    expect([c.sourceSide, c.targetSide]).toEqual(["bottom", "left"]);
    const host = byId(h.data, "rework");
    for (const p of c.waypoints.slice(1)) {
      const onOrInside = p.x >= host.x && p.x <= host.x + host.width && p.y >= host.y && p.y <= host.y + host.height;
      expect(onOrInside, `waypoint (${Math.round(p.x)},${Math.round(p.y)})`).toBe(false);
    }
  });

  // A lane with some room below the host: the step is clamped in, no growth.
  function roomyLane() {
    const host = el("host", "task", 200, 100, 102, 65, { label: "Check", parentId: "l1" });
    const spot = placeBoundaryEvent(host, [])!;
    return data([
      el("p", "pool", 0, 0, 1200, 500, { label: "P", properties: { poolType: "white-box" } }),
      el("l1", "lane", 36, 0, 1164, 300, { label: "One", parentId: "p" }),
      el("l2", "lane", 36, 300, 1164, 200, { label: "Two", parentId: "p" }),
      host,
      mounted("dl", spot.x, spot.y, "host", { label: "Deadline", eventType: "timer" }),
    ]);
  }

  it("a lane with room: the step is clamped inside it and nothing grows", () => {
    const h = headlessDiagram(roomyLane());
    const r = applyAssistOps(parseCommand("add a task called chase after deadline")!, h.context());
    expect(r.ok, r.summary).toBe(true);
    const task = h.data.elements.find((e) => /^chase$/i.test(e.label))!;
    const l1 = byId(h.data, "l1"), ev = byId(h.data, "dl");
    expect(l1.height).toBe(300);
    expect(task.parentId).toBe("l1");
    expect(task.y + task.height).toBeLessThanOrEqual(l1.y + l1.height - LANE_CHILD_PAD);
    expect(task.y, "still an L below the event").toBeGreaterThanOrEqual(ev.y + ev.height + 8);
    expect(h.data.connectors.find((x) => x.sourceId === "dl")!.sourceSide).toBe("bottom");
  });

  it("a top-mounted event with no room above: the lane opens at the top by sliding its contents down", () => {
    const host = el("host", "task", 300, 215, 102, 65, { label: "Check", parentId: "l2" });
    const d = data([
      el("p", "pool", 0, 0, 1200, 400, { label: "P", properties: { poolType: "white-box" } }),
      el("l1", "lane", 36, 0, 1164, 200, { label: "One", parentId: "p" }),
      el("l2", "lane", 36, 200, 1164, 200, { label: "Two", parentId: "p" }),
      el("above", "task", 300, 60, 102, 65, { label: "Above", parentId: "l1" }),
      host,
      mounted("dl", 384, 215, "host", { label: "Deadline", eventType: "timer" }),
    ]);
    const h = headlessDiagram(d);
    const r = applyAssistOps(parseCommand("add a task called chase after deadline")!, h.context());
    expect(r.ok, r.summary).toBe(true);
    const task = h.data.elements.find((e) => /^chase$/i.test(e.label))!;
    const l1 = byId(h.data, "l1"), l2 = byId(h.data, "l2"), ev = byId(h.data, "dl");
    expect([l1.y, l1.height], "the lane above is untouched").toEqual([0, 200]);
    expect(byId(h.data, "above").y).toBe(60);
    expect(task.parentId).toBe("l2");
    expect(inBand(task, l2)).toBe(true);
    expect(task.y + task.height, "above the event, still an L").toBeLessThanOrEqual(ev.y - 8);
    expect(byId(h.data, "host").y, "the lane's contents slid down").toBeGreaterThan(215);
    expect(h.data.connectors.find((x) => x.sourceId === "dl")!.sourceSide).toBe("top");
  });

  it("an ordinary add after a task is unchanged — no lane growth is asked for", () => {
    const h = headlessDiagram(roomyLane());
    const before = byId(h.data, "l1").height;
    applyAssistOps(parseCommand("add a task called review after check")!, h.context());
    expect(byId(h.data, "l1").height).toBe(before);
  });

  it("a refused auto-connect is reported once, without a contradicting “after”", () => {
    const d = data([
      el("t", "task", 100, 100, 102, 65, { label: "Work" }),
      el("done", "end-event", 300, 114, 36, 36, { label: "Done" }),
    ]);
    const h = headlessDiagram(d);
    const r = applyAssistOps(parseCommand("add a task called wrap up after done")!, h.context());
    expect(r.summary).toMatch(/but left it unconnected — a sequence flow from Done isn’t legal$/);
    expect(r.summary).not.toMatch(/;/);
    expect(r.summary).not.toMatch(/after Done/);
  });
});

describe("T4798 — the follow-on plan asks the same rules the reducer and canConnect ask", () => {
  const HOST = el("ep", "subprocess-expanded", 100, 100, 400, 200, { parentId: "lane" });
  const LANE = el("lane", "lane", 36, -400, 2000, 1200, { parentId: "pool" });
  const POOL = el("pool", "pool", 0, -400, 2036, 1200, { properties: { poolType: "white-box" } });
  const edges: Array<{ side: string; at: Point }> = [
    { side: "top", at: { x: 300, y: 100 } }, { side: "right", at: { x: 500, y: 200 } },
    { side: "bottom", at: { x: 300, y: 300 } }, { side: "left", at: { x: 100, y: 200 } },
    { side: "bottom", at: { x: 464, y: 300 } },            // the assist's first slot, 36px from the corner
    { side: "bottom", at: { x: 500, y: 300 } },            // ON the corner — the side is re-derived for the spot
  ];

  for (const e of edges) {
    it(`an event at (${e.at.x},${e.at.y}): the planned side IS the side the reducer draws`, () => {
      const ev = mounted("ev", e.at.x, e.at.y, "ep", { parentId: "ep" });
      const els = [POOL, LANE, HOST, ev];
      const plan = planBoundaryFollowOn(ev, els, 102, 65, []);
      const placed = boxFromCenter(plan.center, 102, 65);
      expect(pickBoundaryEventSide(ev, placed, els)).toBe(plan.side);
      const d = reducer(reducer(data(els), {
        type: "ADD_ELEMENT", payload: { symbolType: "task", position: plan.center, id: "next", initial: { parentId: plan.parentId, keepInLane: true } },
      } as Action), {
        type: "ADD_CONNECTOR", payload: { sourceId: "ev", targetId: "next", connectorType: "sequence", directionType: "directed", routingType: "rectilinear", sourceSide: "right", targetSide: "left" },
      } as Action);
      expect(d.connectors[0]?.sourceSide).toBe(plan.side);
      expect(plan.parentId).toBe("lane");
      expect(plan.laneId).toBe("lane");
    });
  }

  it("followOnParentId: the host's container, never the host", () => {
    const evOwnedByHost = mounted("a", 300, 300, "ep", { parentId: "ep" });
    const evOwnedByLane = mounted("b", 300, 300, "ep", { parentId: "lane" });
    const task = el("t", "task", 700, 100, 102, 65, { parentId: "lane" });
    expect(followOnParentId(evOwnedByHost, [LANE, HOST, evOwnedByHost])).toBe("lane");
    expect(followOnParentId(evOwnedByLane, [LANE, HOST, evOwnedByLane])).toBe("lane");
    expect(followOnParentId(task, [LANE, task])).toBe("lane");
  });

  it("…which is canConnect's scope for the event's outgoing flow, at every depth", () => {
    // A task inside an outer EP inside a lane; the event on the task.
    const outerEp = el("outer", "subprocess-expanded", 0, 0, 800, 400, { parentId: "lane" });
    const task = el("host", "task", 100, 100, 102, 65, { parentId: "outer" });
    const cases: DiagramElement[][] = [
      [LANE, HOST, mounted("e1", 300, 300, "ep", { parentId: "ep" })],
      [LANE, outerEp, task, mounted("e2", 184, 165, "host", { parentId: "host" })],
      [LANE, outerEp, task, mounted("e3", 184, 165, "host", { parentId: "outer" })],
    ];
    for (const els of cases) {
      const ev = els[els.length - 1];
      const parentId = followOnParentId(ev, els);
      const next = el("next", "task", 900, 900, 102, 65, { parentId });
      const all = [...els, next];
      expect(containerScopeOf(next, all), ev.id).toBe(flowScopeOf(ev, "source", all));
      expect(canConnect(ev, next, "sequence", all), ev.id).toBe(true);
    }
  });

  it("a Start on a subprocess's edge flows INTO it, so its step goes inside", () => {
    const st = el("st", "start-event", 82, 182, 36, 36, { boundaryHostId: "ep", parentId: "lane" });
    const els = [LANE, HOST, st];
    expect(followOnParentId(st, els)).toBe("ep");
    // The obstacles the callers build: every element that is not a pool or lane.
    const plan = planBoundaryFollowOn(st, els, 102, 65, obstaclesOf(els));
    expect(plan.side).toBe("right");
    const c = plan.center;
    expect(c.x > HOST.x && c.x < HOST.x + HOST.width && c.y > HOST.y && c.y < HOST.y + HOST.height).toBe(true);
  });

  it("R7.07's clamp: in the band when there is room, the wanted spot plus a growth when there is not", () => {
    const ev = { x: 100, y: 182, width: 36, height: 36 };           // bottom at 218
    expect(clampExitTargetToBand(ev, "bottom", 65, 268, { y: 0, height: 330 }, 8)).toEqual({ top: 257 });
    expect(clampExitTargetToBand(ev, "bottom", 65, 268, { y: 0, height: 250 }, 8))
      .toEqual({ top: 268, grow: { top: 260, bottom: 341 } });
    expect(clampExitTargetToBand(ev, "top", 65, 67, { y: 150, height: 300 }, 8))
      .toEqual({ top: 67, grow: { top: 59, bottom: 140 } });
  });

  it("boundaryOuterSide is routing's geometry", () => {
    const host = { x: 100, y: 100, width: 300, height: 120 };
    for (let i = 0; i < 200; i++) {
      const box = { x: 80 + ((i * 37) % 340), y: 80 + ((i * 53) % 160), width: 36, height: 36 };
      expect(boundaryOuterSide(box, host)).toBe(outerSideOfBox(box, host));
    }
  });
});

describe("T4799 — wiring: one rule, asked from every place that decides it", () => {
  it("Canvas keeps no private copy, and asks the reducer's per-end call at drag start, drop and re-attach", () => {
    const src = code("app", "components", "canvas", "Canvas.tsx");
    expect(src).not.toMatch(/function getBoundaryEventOuterSide\s*\(/);
    expect(src).not.toMatch(/function oppositeSide\s*\(/);
    expect(src).toMatch(/import \{[^}]*\bboundaryEndSide\b[^}]*\} from "@\/app\/lib\/diagram\/routing"/);
    const start = src.slice(src.indexOf("function handleConnectionPointDragStart"), src.indexOf("function onMouseUp"));
    expect(start).toMatch(/boundaryEndSide\(sourceEl, "source", \{ x: p\.x, y: p\.y, width: 0, height: 0 \}/);
    expect(start, "the preview follows the pointer").toMatch(/const from = boundaryStart\(pos\)/);
    // the drop, by role
    expect(src).toMatch(/boundaryEndSide\(sourceEl, "source", targetEl, data\.elements\)/);
    expect(src).toMatch(/boundaryEndSide\(targetEl, "target", sourceEl \?\? targetEl, data\.elements\)/);
    // both re-attach branches, by the dragged end's role
    expect(src).toMatch(/boundaryEndSide\(innerTarget, endpoint, fixedInner \?\? innerTarget, data\.elements\)/);
    expect(src).toMatch(/boundaryEndSide\(targetEl, endpoint, fixedEl \?\? targetEl, data\.elements\)/);
    // the auto-connect ranking's boundary-Start override (twice) asks it too
    expect((src.match(/boundaryEndSide\((src|el), "source", \{ x: newX, y: newY, width: newW, height: newH \}/g) ?? []).length).toBe(2);
    expect(src).not.toMatch(/pickBoundaryEventSide\(/);
  });

  it("the editor's ghost accept and template attach use the follow-on rules", () => {
    const src = code("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    const accept = callbackBody(src, "acceptNextStep");
    expect(accept).toMatch(/planBoundaryFollowOn\(src, data\.elements/);
    expect(accept).toMatch(/followOnParentId\(src, data\.elements\)/);
    expect(accept).toMatch(/keepInLane: true/);
    expect(accept).not.toMatch(/src\.parentId/);
    const attach = callbackBody(src, "attachTemplate");
    expect(attach).toMatch(/followOnParentId\(src, data\.elements\)/);
    expect(attach).not.toMatch(/src\.parentId/);
  });

  it("voice add-after uses the same plan and parent", () => {
    const src = code("app", "lib", "assist", "applyAssistOps.ts");
    expect(src).toMatch(/planBoundaryFollowOn\(anchor, els, w, h, others\)/);
    expect(src).toMatch(/followOnParentId\(anchor, els\)/);
    expect(src).not.toMatch(/anchor\?\.parentId/);
    expect(src).not.toMatch(/boundaryOuterSide\(/);
  });

  it("the reducer applies R7.02 on create and on every mount or edge change, and asks canConnect's scope rule", () => {
    const src = code("app", "hooks", "useDiagram.ts");
    expect(caseBody(src, "ADD_CONNECTOR")).toMatch(/boundaryEndpointSides\(connectorType, source, target, state\.elements\)/);
    expect(caseBody(src, "ADD_CONNECTOR")).toMatch(/flowScopeOf\(source, "source", state\.elements\)/);
    for (const c of ["MOVE_ELEMENT", "MOVE_END", "SET_EVENT_BOUNDARY"]) {
      expect(caseBody(src, c), c).toMatch(/withBoundaryEndpointSides\(/);
    }
    expect(caseBody(src, "CORRECT_ALL_CONNECTORS")).toMatch(/if \(isAxisAligned\(conn\.waypoints\)\) return conn;/);
    expect(caseBody(src, "ADD_ELEMENT")).toMatch(/initial\?\.keepInLane/);
    for (const f of [src, code("app", "lib", "diagram", "canConnect.ts")]) {
      expect(f).not.toMatch(/const flowScope = /);
      expect(f).not.toMatch(/const containerScope = /);
    }
  });

  it("the generated layout and the editor share R7.07's clamp; placement shares routing's edge geometry", () => {
    const layout = code("app", "lib", "diagram", "bpmnLayout.ts");
    expect(layout).toMatch(/clampExitTargetToBand\(ev, side, tgt\.height, tgt\.y, band, LANE_EDGE_PAD\)/);
    expect(layout).not.toMatch(/const overshootsDown/);
    const placement = code("app", "lib", "diagram", "assistPlacement.ts");
    expect(placement).toMatch(/return outerSideOfBox\(event, host\);/);
    expect(placement).toMatch(/flowScopeOf\(anchor, "source", els\)/);
  });
});

describe("T4802 — one geometry for “which edge”, and the checks expect the reducer's side", () => {
  it("emieLabel's boundarySideOf IS routing's outerSideOfBox, corners included (1px grid)", () => {
    const host = el("h", "subprocess-expanded", 100, 100, 300, 120);
    let checked = 0, differ = 0;
    for (let cx = 60; cx <= 440; cx++) {
      for (let cy = 60; cy <= 260; cy++) {
        const ev = el("e", "intermediate-event", cx - 18, cy - 18, 36, 36);
        checked++;
        if (boundarySideOf(host, ev) !== outerSideOfBox(ev, host)) differ++;
      }
    }
    expect(checked).toBeGreaterThan(70000);
    expect(differ).toBe(0);
  });

  it("the checks and the label keep no copy of the edge geometry; the outward checks ask boundaryOutwardSide", () => {
    const checks = code("app", "lib", "diagram", "checks", "diagramChecks.ts");
    expect(checks).toMatch(/import \{[^}]*\bboundaryOutwardSide\b[^}]*\} from "\.\.\/routing"/);
    expect(checks).not.toMatch(/const distTop/);
    expect(checks).not.toMatch(/function oppositeSide\s*\(/);
    expect(checks).toMatch(/return outerSideOfBox\(e, host\);/);
    expect(checks).toMatch(/boundaryOutwardSide\(evt, other, elements\)/);
    for (const fn of ["checkBoundaryIntermediateOutgoingOuter", "checkBoundaryStartIncomingOuter", "checkEdgeMountEventOuterRouting"]) {
      const at = checks.indexOf(`export function ${fn}(`);
      expect(at, fn).toBeGreaterThan(-1);
      const next = checks.indexOf("\nexport function", at + 10);
      expect(checks.slice(at, next < 0 ? undefined : next), fn).toMatch(/expectedOutwardSide\(/);
    }
    const label = code("app", "lib", "diagram", "emieLabel.ts");
    expect(label).toMatch(/return outerSideOfBox\(ev, host\);/);
    expect(label).not.toMatch(/const toTop/);
  });

  it("the reducer's helper asks the per-end rule, and the per-end rule asks canConnect's scope", () => {
    const routing = code("app", "lib", "diagram", "routing.ts");
    expect(routing).toMatch(/boundaryEndSide\(source, "source", target, allElements\)/);
    expect(routing).toMatch(/boundaryEndSide\(target, "target", source, allElements\)/);
    expect(routing).toMatch(/flowScopeOf\(evt, role, allElements\) === evt\.boundaryHostId/);
    expect(routing).toMatch(/return boundaryOutwardSide\(evt, other, allElements\);/);
  });
});

describe("T4804 — a step after a boundary START goes inside its subprocess, with the obstacles the callers really pass", () => {
  const claim = (ep: { x: number; y: number; w: number; h: number }, extra: DiagramElement[] = []) => data([
    el("p", "pool", 0, 0, 1400, 700, { label: "P", properties: { poolType: "white-box" } }),
    el("l", "lane", 36, 0, 1364, 700, { label: "Claims", parentId: "p" }),
    el("ep", "subprocess-expanded", ep.x, ep.y, ep.w, ep.h, { label: "Handle claim", parentId: "l" }),
    el("st", "start-event", ep.x - 18, ep.y + ep.h / 2 - 18, 36, 36, { label: "Kickoff", boundaryHostId: "ep", parentId: "l" }),
    ...extra,
  ]);
  const sayAfterKickoff = (d: DiagramData) => {
    const h = headlessDiagram(d);
    const r = applyAssistOps(parseCommand("add a task called prep after kickoff")!, h.context());
    const task = h.data.elements.find((e) => e.type === "task" && /^prep$/i.test(e.label))!;
    return { h, r, task };
  };
  const strictlyInside = (p: Point, b: DiagramElement) => p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height;

  it("room inside: voice puts the step in the subprocess, which keeps its size, and the flow leaves the inner point", () => {
    const before = claim({ x: 200, y: 100, w: 500, h: 300 });
    const { h, r, task } = sayAfterKickoff(before);
    expect(r.ok, r.summary).toBe(true);
    expect(task.parentId).toBe("ep");
    const ep0 = byId(before, "ep"), ep1 = byId(h.data, "ep");
    expect(within(task, ep0), "inside the subprocess as it was").toBe(true);
    expect([ep1.x, ep1.y, ep1.width, ep1.height]).toEqual([ep0.x, ep0.y, ep0.width, ep0.height]);
    const c = h.data.connectors.find((x) => x.sourceId === "st" && x.targetId === task.id)!;
    expect(c.sourceSide).toBe("right");
    for (const p of c.waypoints.slice(1)) expect(strictlyInside(p, ep1), `(${p.x},${p.y})`).toBe(true);
  });

  it("a crowded subprocess: the step is placed IN it, not below it, and the flow stays inside", () => {
    const before = claim({ x: 200, y: 100, w: 400, h: 200 },
      [el("inner", "task", 400, 150, 102, 65, { label: "Inner", parentId: "ep" })]);
    const { h, r, task } = sayAfterKickoff(before);
    expect(r.ok, r.summary).toBe(true);
    expect(task.parentId).toBe("ep");
    const ep0 = byId(before, "ep"), ep1 = byId(h.data, "ep");
    expect(task.y, "it starts inside the subprocess's box — it was not planned below it").toBeLessThan(ep0.y + ep0.height);
    expect(within(task, ep1)).toBe(true);
    const c = h.data.connectors.find((x) => x.sourceId === "st" && x.targetId === task.id)!;
    expect(c.sourceSide).toBe("right");
    for (const p of c.waypoints.slice(1)) expect(strictlyInside(p, ep1), `(${p.x},${p.y})`).toBe(true);
  });

  it("the ghost accept's plan (its obstacle list leaves the anchor out) is inside too", () => {
    const d = claim({ x: 200, y: 100, w: 500, h: 300 });
    const st = byId(d, "st");
    const plan = planBoundaryFollowOn(st, d.elements, 102, 65, obstaclesOf(d.elements.filter((e) => e.id !== st.id)));
    expect([plan.parentId, plan.side]).toEqual(["ep", "right"]);
    expect(within(boxFromCenter(plan.center, 102, 65), byId(d, "ep"))).toBe(true);
  });

  it("a Start on a TASK's edge: a task has no inside, so the step is never made the task's child", () => {
    const task = el("host", "task", 400, 300, 102, 65, { label: "Check", parentId: "l" });
    const st = el("st2", "start-event", 382, 314.5, 36, 36, { label: "Go", boundaryHostId: "host", parentId: "l" });
    const d = claim({ x: 800, y: 100, w: 300, h: 150 }, [task, st]);
    expect(followOnParentId(st, d.elements)).toBe("l");
    const plan = planBoundaryFollowOn(st, d.elements, 102, 65, obstaclesOf(d.elements));
    expect(plan.parentId).toBe("l");
    const b = boxFromCenter(plan.center, 102, 65);
    const overlapsHost = b.x < task.x + task.width && b.x + b.width > task.x && b.y < task.y + task.height && b.y + b.height > task.y;
    expect(overlapsHost).toBe(false);
  });
});

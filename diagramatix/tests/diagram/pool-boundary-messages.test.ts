/**
 * T4673–T4675 — moving a pool's left boundary moves nothing but boundaries.
 *
 * Paul, 22 September 2026:
 *
 *   "Moving the Pool left boundary has an effect on the position of elements in
 *    the pool and on the position of other pools. Moving the Pool left boundary
 *    left causes message connectors FROM other pools TO elements in the pool
 *    whose boundary is being moved to move with the pool's left boundary.
 *    De-selecting the Pool and choosing to move the boundary again then starts
 *    to cause lots of weird effects. Elements move left and sometimes
 *    downwards. Investigate and fix or perhaps insert debug code for Dev Tools?"
 *
 * THE MESSAGES — reproduced exactly, and caused by this week's lockstep fix.
 * When the white-box lockstep stopped moving other pools' CONTENTS it began
 * recomputing every connector attached to a shifted pool. A message ending on a
 * POOL stores that end as a fraction of the pool's width, so as the lockstep
 * widened the other pool the fraction put the end somewhere new: the Customer →
 * Receive message's line walked 422 → 390 → 365 → 409 over three drags while
 * nothing it connects had moved. The resized pool already kept its message
 * ends in place; the lockstep-shifted pools did not. `pinPoolMessageEnds` now
 * does it for every pool whose geometry changed, at either end.
 *
 * THE ELEMENTS — not reproducible in the reducer. Three left-boundary drags in
 * a row, over lanes, sub-lanes, an expanded subprocess with a boundary event, a
 * data object and messages in every direction, moved no element at all. So the
 * fault is in which handler takes the press — and the header strip, which
 * moves the whole pool, sits right beside the left-edge resize zone. The Dev
 * Tools gesture trace (T4675) shows it on the live canvas.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reducer, pinPoolMessageEnds } from "@/app/hooks/useDiagram";
import { movedElements, traceGesture, gestureTraceOn } from "@/app/lib/debug/gestureTrace";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

/** Customer (black-box) on top; Warehouse (white-box, lanes + sub-lanes) in the
 *  middle; Bank (white-box) below — with messages built the way the canvas
 *  builds them. */
const world = (): DiagramData => {
  let d = {
    elements: [
      E({ id: "P1", type: "pool", label: "Customer", x: 100, y: 0, width: 900, height: 80, properties: { poolType: "black-box" } }),
      E({ id: "P2", type: "pool", label: "Warehouse", x: 100, y: 140, width: 900, height: 360, properties: { poolType: "white-box" } }),
      E({ id: "L1", type: "lane", label: "Sales", x: 136, y: 140, width: 864, height: 200, parentId: "P2", properties: {} }),
      E({ id: "L2", type: "lane", label: "Ship", x: 136, y: 340, width: 864, height: 160, parentId: "P2", properties: {} }),
      E({ id: "S1", type: "lane", label: "Air", x: 172, y: 340, width: 828, height: 80, parentId: "L2", properties: {} }),
      E({ id: "S2", type: "lane", label: "Sea", x: 172, y: 420, width: 828, height: 80, parentId: "L2", properties: {} }),
      E({ id: "st", type: "start-event", label: "Start", x: 240, y: 200, width: 36, height: 36, parentId: "L1", properties: {} }),
      E({ id: "t1", type: "task", label: "Receive", x: 320, y: 185, width: 102, height: 65, parentId: "L1", properties: {} }),
      E({ id: "ep", type: "subprocess-expanded", label: "Pack", x: 480, y: 160, width: 260, height: 150, parentId: "L1", properties: {} }),
      E({ id: "t2", type: "task", label: "Box", x: 520, y: 200, width: 102, height: 65, parentId: "ep", properties: {} }),
      E({ id: "be", type: "intermediate-event", label: "Late", x: 722, y: 280, width: 36, height: 36, boundaryHostId: "ep", parentId: "L1", properties: {} }),
      E({ id: "t3", type: "task", label: "Ship", x: 320, y: 355, width: 102, height: 50, parentId: "S1", properties: {} }),
      E({ id: "do", type: "data-object", label: "Order", x: 450, y: 440, width: 36, height: 46, parentId: "S2", properties: {} }),
      E({ id: "P0", type: "pool", label: "Bank", x: 100, y: 560, width: 900, height: 120, properties: { poolType: "white-box" } }),
      E({ id: "t9", type: "task", label: "Pay", x: 600, y: 590, width: 102, height: 60, parentId: "P0", properties: {} }),
    ],
    connectors: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as unknown as DiagramData;
  const msg = (id: string, sourceId: string, targetId: string, sourceSide: string, targetSide: string) => {
    d = reducer(d, { type: "ADD_CONNECTOR", payload: {
      sourceId, targetId, connectorType: "messageBPMN", directionType: "directed", routingType: "rectilinear",
      sourceSide, targetSide, sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
    } } as never) as DiagramData;
    const made = d.connectors[d.connectors.length - 1];
    d = { ...d, connectors: d.connectors.map((c) => (c === made ? { ...c, id } : c)) };
  };
  msg("poolToTask", "P1", "t1", "bottom", "top");
  msg("taskToPool", "t3", "P1", "top", "bottom");
  msg("taskToTask", "t9", "t2", "top", "bottom");
  return d;
};

/** Drag Warehouse's LEFT edge the way the canvas does: absolute rects off the
 *  geometry at the start of the drag, then a RESIZE_END. */
function dragLeftEdge(d: DiagramData, total: number, ticks: number): DiagramData {
  const p = d.elements.find((e) => e.id === "P2")!;
  const s = { x: p.x, y: p.y, width: p.width, height: p.height };
  let cur = d;
  for (let k = 1; k <= ticks; k++) {
    const dx = (total * k) / ticks;
    cur = reducer(cur, { type: "RESIZE_ELEMENT", payload: {
      id: "P2", x: s.x + dx, y: s.y, width: s.width - dx, height: s.height, wasWhiteBoxAtResizeStart: true,
    } } as never) as DiagramData;
  }
  return reducer(cur, { type: "RESIZE_END", payload: { id: "P2" } } as never) as DiagramData;
}

/** A message's VISIBLE run — the drawn line, without the hidden leaders. */
const visibleRun = (c: Connector) => {
  let w = c.waypoints;
  if (c.sourceInvisibleLeader && w.length > 2) w = w.slice(1);
  if (c.targetInvisibleLeader && w.length > 2) w = w.slice(0, -1);
  return w.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ");
};
const conn = (d: DiagramData, id: string) => d.connectors.find((c) => c.id === id)!;
const CONTENT = ["st", "t1", "ep", "t2", "be", "t3", "do", "t9"];

describe("T4673 — the left boundary moves; message flows and elements do not", () => {
  it("keeps every message's drawn line exactly where it was, drag after drag", () => {
    const w0 = world();
    const w1 = dragLeftEdge(w0, -60, 6);
    const w2 = dragLeftEdge(w1, -40, 4);            // a second drag, from fresh start bounds
    const w3 = dragLeftEdge(w2, 70, 7);             // and back
    for (const id of ["poolToTask", "taskToPool", "taskToTask"]) {
      const line = visibleRun(conn(w0, id));
      for (const [tag, w] of [["after one drag", w1], ["after two", w2], ["after three", w3]] as const) {
        expect(visibleRun(conn(w, id)), `${id} ${tag}`).toBe(line);
      }
    }
  });

  it("moves no element in any pool, however many times the edge is dragged", () => {
    const w0 = world();
    let cur = w0;
    for (const [total, ticks] of [[-60, 6], [-40, 4], [70, 7], [-25, 3]] as const) cur = dragLeftEdge(cur, total, ticks);
    const moved = movedElements(w0.elements, cur.elements).filter((m) => CONTENT.includes(m.id));
    expect(moved, "content moved during boundary drags").toEqual([]);
  });

  it("still moves the boundaries — of this pool and, in lockstep, the others", () => {
    const w1 = dragLeftEdge(world(), -60, 6);
    for (const id of ["P1", "P2", "P0"]) {
      expect(w1.elements.find((e) => e.id === id)!.x, `${id}`).toBe(40);
    }
  });
});

describe("T4674 — a message end on a pool is pinned while the pool changes shape", () => {
  const pool = (x: number, width: number) => E({ id: "P", type: "pool", x, y: 0, width, height: 80, properties: {} });
  const message = {
    id: "m", type: "messageBPMN", sourceId: "P", targetId: "t", sourceOffsetAlong: 0.5,
    waypoints: [{ x: 550, y: 40 }, { x: 422, y: 80 }, { x: 422, y: 185 }, { x: 371, y: 218 }],
  } as unknown as Connector;

  it("re-derives the fraction so the end lands where it was", () => {
    const wider = pool(40, 960);
    const pinned = pinPoolMessageEnds(message, message, new Map([["P", pool(100, 900)]]), [wider], new Set(["P"]));
    // The pool-side end was at x = 422; 422 − 40 over 960.
    expect(pinned.sourceOffsetAlong).toBeCloseTo((422 - 40) / 960, 6);
  });

  it("leaves a message alone when its pool did not change", () => {
    expect(pinPoolMessageEnds(message, message, new Map(), [pool(100, 900)], new Set())).toBe(message);
  });

  it("leaves anything that is not a message flow alone", () => {
    const seq = { ...message, type: "sequence" } as Connector;
    expect(pinPoolMessageEnds(seq, seq, new Map(), [pool(40, 960)], new Set(["P"]))).toBe(seq);
  });

  it("is applied wherever a pool is reshaped under a message", () => {
    // Both the pool-resize branch and the white-box lockstep — the lockstep
    // also runs when an element pushes a pool wider, a path a resize test does
    // not reach, so its wiring is pinned here.
    const src = readFileSync(join(process.cwd(), "app", "hooks", "useDiagram.ts"), "utf8");
    expect(src).toMatch(/const working = orig0 \? pinPoolMessageEnds\(conn, orig0, oldById, elements, changedIds\) : conn;/);
    const lockstep = src.slice(src.indexOf("function applyPoolBoundaryShift("), src.indexOf("function applyPoolBoundaryShift(") + 3500);
    expect(lockstep).toMatch(/pinPoolMessageEnds\(conn, conn, oldById, newElements, structuralIds\)/);
  });
});

describe("T4675 — the Dev Tools gesture trace", () => {
  afterEach(() => { vi.restoreAllMocks(); delete (globalThis as { window?: unknown }).window; });

  it("is silent unless switched on", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    (globalThis as { window?: unknown }).window = { localStorage: { getItem: () => null } };
    expect(gestureTraceOn()).toBe(false);
    traceGesture("anything", { a: 1 });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs when window.__DGX_TRACE_GESTURES is set", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    (globalThis as { window?: unknown }).window = { __DGX_TRACE_GESTURES: true, localStorage: { getItem: () => null } };
    traceGesture("press", { id: "P2" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain("[gesture] press");
  });

  it("reports exactly what moved, and by how much", () => {
    const a = [{ id: "t", type: "task", x: 0, y: 0, width: 100, height: 60 }, { id: "u", type: "task", x: 5, y: 5, width: 10, height: 10 }];
    const b = [{ id: "t", type: "task", x: -20, y: 7.04, width: 100, height: 60 }, { id: "u", type: "task", x: 5, y: 5, width: 10, height: 10 }];
    expect(movedElements(a, b)).toEqual([{ id: "t", type: "task", label: undefined, dx: -20, dy: 7, dw: 0, dh: 0 }]);
  });

  it("is wired where the answer lives: the press handlers and the reducer", () => {
    const sym = readFileSync(join(process.cwd(), "app", "components", "canvas", "SymbolRenderer.tsx"), "utf8");
    expect(sym).toMatch(/traceGesture\("press on a container"/);
    expect(sym).toMatch(/traceGesture\("MOVE drag starts"/);
    expect(sym).toMatch(/traceGesture\("edge-zone decided"/);
    const canvas = readFileSync(join(process.cwd(), "app", "components", "canvas", "Canvas.tsx"), "utf8");
    expect(canvas).toMatch(/traceGesture\("RESIZE drag starts"/);
    const reducerSrc = readFileSync(join(process.cwd(), "app", "hooks", "useDiagram.ts"), "utf8");
    expect(reducerSrc).toMatch(/TRACED_MOVES\.has\(action\.type\) && gestureTraceOn\(\)/);
  });
});

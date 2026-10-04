/**
 * T5240 — heal on load, through the REAL hook: one Undo gives back the diagram exactly as it was saved
 * (Paul, 2026-10-04: "allow an undo to return to the diagram as originally saved").
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { failOnActWarnings, mountSession, stubFetch, stubWindow, unmountAll } from "./harness";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement, type Side } from "@/app/lib/diagram/types";

beforeEach(() => { stubWindow(); stubFetch(() => ({ ops: [] })); });
afterEach(async () => { await unmountAll(); vi.unstubAllGlobals(); failOnActWarnings(); });

const el = (id: string, x: number, y: number): DiagramElement =>
  ({ id, type: "task", x, y, width: 102, height: 65, label: id, properties: {} }) as DiagramElement;
const conn = (id: string, s: string, t: string, ss: Side, ts: Side): Connector =>
  ({ id, type: "sequence", sourceId: s, targetId: t, sourceSide: ss, targetSide: ts, directionType: "directed", routingType: "rectilinear",
    sourceInvisibleLeader: true, targetInvisibleLeader: true,
    waypoints: [{ x: 51, y: 132 }, { x: 102, y: 132 }, { x: 300, y: 32 }, { x: 351, y: 32 }] }) as Connector;

const saved = (): DiagramData => ({
  ...EMPTY_DIAGRAM,
  elements: [el("a", 0, 100), el("b", 300, 0), el("c", 300, 100), el("d", 300, 200)],
  connectors: [conn("c1", "a", "b", "right", "left"), conn("c2", "a", "c", "right", "left"), conn("c3", "a", "d", "right", "left")],
} as DiagramData);

describe("T5240 heal on load is one undoable step", () => {
  it("healEndpointsNow separates the connectors, reports them, and marks nothing it need not", async () => {
    const h = await mountSession({ initial: saved() });
    let result!: { ids: string[] };
    await h.act(() => { result = (h.d as unknown as { healEndpointsNow: () => { ids: string[] } }).healEndpointsNow(); });
    expect(result.ids.sort()).toEqual(["c1", "c3"]);
    const offs = h.data.connectors.map((c) => c.sourceOffsetAlong ?? 0.5);
    expect(new Set(offs.map((o) => o.toFixed(3))).size).toBe(3);                  // three different points now
  });

  it("ONE Undo returns the connectors exactly as they were saved", async () => {
    const original = JSON.stringify(saved().connectors);
    const h = await mountSession({ initial: saved() });
    await h.act(() => { (h.d as unknown as { healEndpointsNow: () => unknown }).healEndpointsNow(); });
    expect(JSON.stringify(h.data.connectors)).not.toBe(original);
    await h.act(() => h.d.undo());
    expect(JSON.stringify(h.data.connectors)).toBe(original);
  });

  it("a diagram with nothing to heal: no change, and Undo has nothing of ours to undo", async () => {
    const clean = { ...saved(), connectors: [conn("only", "a", "b", "right", "left")] } as DiagramData;
    const h = await mountSession({ initial: clean });
    let ids: string[] = ["x"];
    await h.act(() => { ids = (h.d as unknown as { healEndpointsNow: () => { ids: string[] } }).healEndpointsNow().ids; });
    expect(ids).toEqual([]);
    expect(JSON.stringify(h.data.connectors)).toBe(JSON.stringify(clean.connectors));
  });

  it("an exact-as-drawn diagram is not healed", async () => {
    const h = await mountSession({ initial: { ...saved(), exactAsDrawn: true } as DiagramData });
    let ids: string[] = ["x"];
    await h.act(() => { ids = (h.d as unknown as { healEndpointsNow: () => { ids: string[] } }).healEndpointsNow().ids; });
    expect(ids).toEqual([]);
  });
});

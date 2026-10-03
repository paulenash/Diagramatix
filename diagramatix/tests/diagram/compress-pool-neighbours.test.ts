/**
 * T5226 — compress a pool: the pools ABOVE follow its top boundary and the pools BELOW follow its bottom boundary
 * (Paul, 2026-10-03), with everything in them; the gaps between pools are kept.
 */
import { describe, expect, it } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = "", parentId?: string, props: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: props, ...(parentId ? { parentId } : {}) }) as DiagramElement;

/** Customer (black box, top) · gap 40 · Middle (white box, lots of spare room above and below its one task) · gap 40 · Bottom (white box with a task). */
function world(): DiagramData {
  return {
    ...EMPTY_DIAGRAM,
    elements: [
      el("cust", "pool", 0, 0, 1000, 100, "Customer", undefined, { poolType: "black-box" }),
      el("custNote", "text-annotation", 100, 20, 100, 60, "note", "cust"),
      el("mid", "pool", 0, 140, 1000, 600, "Middle", undefined, { poolType: "white-box" }),
      el("midLane", "lane", 36, 140, 964, 600, "Lane", "mid"),
      el("task", "task", 300, 400, 102, 65, "Only task", "midLane"),
      el("bot", "pool", 0, 780, 1000, 300, "Bottom", undefined, { poolType: "white-box" }),
      el("botLane", "lane", 36, 780, 964, 300, "Lane B", "bot"),
      el("botTask", "task", 300, 880, 102, 65, "Bottom task", "botLane"),
      el("botEv", "intermediate-event", 330, 862, 36, 36, "Err", "botLane", { boundaryHostId: "botTask" }),
    ],
    connectors: [],
  };
}
const get = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

describe("T5226 compress a pool moves its neighbours with the edges that moved", () => {
  const before = world();
  const after = reducer(before, { type: "COMPRESS_POOL", payload: { poolId: "mid" } } as never);
  const mid0 = get(before, "mid"), mid1 = get(after, "mid");
  const dTop = mid1.y - mid0.y;
  const dBottom = (mid1.y + mid1.height) - (mid0.y + mid0.height);

  it("the pool was compressed at BOTH ends", () => {
    expect(dTop).toBeGreaterThan(0);
    expect(dBottom).toBeLessThan(0);
  });
  it("the pool above moves with the TOP boundary, with what is in it; the gap above is kept", () => {
    expect(get(after, "cust").y).toBe(0 + dTop);
    expect(get(after, "custNote").y).toBe(20 + dTop);
    expect(mid1.y - (get(after, "cust").y + get(after, "cust").height)).toBe(40);
  });
  it("the pool below moves with the BOTTOM boundary, with its lane, task and edge event; the gap below is kept", () => {
    expect(get(after, "bot").y).toBe(780 + dBottom);
    expect(get(after, "botLane").y).toBe(780 + dBottom);
    expect(get(after, "botTask").y).toBe(880 + dBottom);
    expect(get(after, "botEv").y).toBe(862 + dBottom);
    expect(get(after, "bot").y - (mid1.y + mid1.height)).toBe(40);
  });
  it("sizes of the neighbours do not change", () => {
    expect(get(after, "cust").height).toBe(100);
    expect(get(after, "bot").height).toBe(300);
  });
  it("only the TOP moved: the pool above follows, the pool below stays (and the other way round)", () => {
    const w = world();
    // Spare room only at the top: the task sits at the bottom of the pool.
    w.elements = w.elements.map((e) => (e.id === "task" ? { ...e, y: 740 - 32 - 65 } : e));
    const r = reducer(w, { type: "COMPRESS_POOL", payload: { poolId: "mid" } } as never);
    const m = get(r, "mid");
    expect(m.y).toBeGreaterThan(140);
    expect(get(r, "cust").y).toBe(m.y - 140);
    expect(m.y + m.height).toBe(740);                       // bottom did not move …
    expect(get(r, "bot").y).toBe(780);                      // … so the pool below did not either
  });
});

/**
 * R8.39 — the Start event sits in the lane of the element it leads to, and never
 * on a pool or lane boundary.
 *
 * Paul, 2026-09-30, on "AI Generation - Event Gateway Test - GPT 6 Luna": the Start
 * was drawn on the pool boundary. The fixture is the plan that generation stored.
 * The plan puts the Start and the event-based gateway in "Front Office"; the gateway
 * is then centred on its branches (R8.01) and lands in the Sales band, and the Start
 * used to be left 19px above the Company pool, straddling the gap between two pools.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const plan = JSON.parse(readFileSync("tests/bpmn/fixtures/r8-39-event-gateway-plan.json", "utf8")) as {
  elements: AiElement[]; connections: AiConnection[];
};
const run = (els: AiElement[], conns: AiConnection[]) => layoutBpmnDiagram(els, conns);
const get = (out: ReturnType<typeof run>, id: string) => out.elements.find((e) => e.id === id)!;

/** A symbol is ON a boundary when a container's horizontal edge passes through it. */
const edgesThrough = (out: ReturnType<typeof run>, id: string) => {
  const e = get(out, id);
  return out.elements
    .filter((c) => (c.type === "pool" || c.type === "lane") && c.x < e.x + e.width && c.x + c.width > e.x)
    .flatMap((c) => [c.y, c.y + c.height])
    .filter((edge) => edge > e.y + 0.5 && edge < e.y + e.height - 0.5);
};

describe("R8.39 — Start event in the lane of its next element", () => {
  const out = run(plan.elements, plan.connections);

  it("T5148 — the stored Luna plan: the Start is not on any pool or lane boundary", () => {
    expect(edgesThrough(out, "e_start")).toEqual([]);
    const s = get(out, "e_start");
    const pool = get(out, "p_company");
    expect(s.y, "inside the pool, not above it").toBeGreaterThanOrEqual(pool.y);
    expect(s.y + s.height, "inside the pool, not below it").toBeLessThanOrEqual(pool.y + pool.height);
  });

  it("T5149 — the Start is parented to, and inside, the lane its next element is drawn in, and level with it", () => {
    const s = get(out, "e_start");
    const next = get(out, "g_await");
    const ncy = next.y + next.height / 2;
    const lane = out.elements.find((l) => l.type === "lane" && l.y <= ncy && ncy < l.y + l.height)!;
    expect(s.parentId).toBe(lane.id);
    expect(s.y).toBeGreaterThanOrEqual(lane.y);
    expect(s.y + s.height).toBeLessThanOrEqual(lane.y + lane.height);
    expect(s.y + s.height / 2).toBeCloseTo(ncy, 0);
  });

  it("T5150 — a Start already inside its lane is left alone (R3.08 keeps a process Start in the topmost lane), and is never on a boundary", () => {
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [{ id: "l1", name: "Top" }, { id: "l2", name: "Bottom" }] },
      { id: "s", type: "start-event", label: "S", pool: "p", lane: "l2" },
      { id: "t", type: "task", label: "T", pool: "p", lane: "l2" },
      { id: "e", type: "end-event", label: "E", pool: "p", lane: "l2" },
    ];
    const o = run(els, [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }]);
    expect(edgesThrough(o, "s")).toEqual([]);
    const s = get(o, "s");
    const top = o.elements.filter((e) => e.type === "lane").reduce((m, l) => (l.y < m.y ? l : m));
    expect(s.y).toBeGreaterThanOrEqual(top.y);
    expect(s.y + s.height).toBeLessThanOrEqual(top.y + top.height);
  });

  it("T5152 — a pool with no lanes: the Start is inside the pool and not on its edge", () => {
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "P", poolType: "white-box" },
      { id: "s", type: "start-event", label: "S", pool: "p" },
      { id: "t", type: "task", label: "First", pool: "p" },
      { id: "e", type: "end-event", label: "E", pool: "p" },
    ];
    const o = run(els, [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }]);
    const s = get(o, "s"), t = get(o, "t"), p = get(o, "p");
    expect(s.y).toBeGreaterThanOrEqual(p.y);
    expect(s.y + s.height).toBeLessThanOrEqual(p.y + p.height);
    expect(edgesThrough(o, "s")).toEqual([]);
    void t;
  });

  it("T5151 — the rule is code-backed: it is stated in the layout pass and the seed's Auto-Layout group", () => {
    const layout = readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8");
    expect(layout).toContain("R8.39: the Start event is never on a pool or lane boundary");
    const seed = readFileSync("scripts/seed-diagram-rules.cjs", "utf8");
    expect(seed).toContain("R8.39:");
    expect(readFileSync("scripts/sql/patch-rule-r8-39-start-in-next-lane.sql", "utf8")).toContain("R8.39:");
  });
});

describe("R8.40 — a gateway is a child of the lane it is drawn in", () => {
  const out = run(plan.elements, plan.connections);
  const laneAt = (id: string) => {
    const g = get(out, id);
    const cy = g.y + g.height / 2;
    return out.elements.filter((l) => l.type === "lane" && l.y <= cy && cy < l.y + l.height).sort((a, b) => a.height - b.height)[0];
  };

  it("T5153 — the Luna event-based gateway, drawn in Sales, is parented to Sales (the plan said Front Office)", () => {
    const plannedLane = plan.elements.find((e) => e.id === "g_await")!.lane;
    expect(plannedLane).toBe("l_front");
    const drawnIn = laneAt("g_await");
    expect(drawnIn.id).toBe("l_sales");
    expect(get(out, "g_await").parentId).toBe("l_sales");
  });

  it("T5154 — every gateway in the plan is a child of the lane its centre is in", () => {
    for (const e of out.elements.filter((x) => x.type === "gateway" && x.parentId && out.elements.find((p) => p.id === x.parentId)?.type === "lane")) {
      expect(e.parentId, e.label ?? e.id).toBe(laneAt(e.id).id);
    }
  });

  it("T5155 — the rule is stated in the layout pass", () => {
    expect(readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8")).toContain("R8.40: a gateway is a child of the lane it is DRAWN in");
  });
});

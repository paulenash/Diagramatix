/**
 * T5299 — "navigate between the rocks" (Paul, 2026-10-10, V01.07): a connector blocked on its straight way threads through the gap
 * between obstacles instead of going round the whole cluster. V01.07's "otherwise" branch ran 10,630px for a 437px job.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { routeBetweenRocks } from "@/app/lib/diagram/routeBetweenRocks";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { checkDiagram } from "@/app/lib/diagram/checks/diagramChecks";

const len = (w: { x: number; y: number }[]) => w.slice(1).reduce((t, p, i) => t + Math.abs(p.x - w[i].x) + Math.abs(p.y - w[i].y), 0);
const orthogonal = (w: { x: number; y: number }[]) => w.slice(1).every((p, i) => Math.abs(p.x - w[i].x) < 0.01 || Math.abs(p.y - w[i].y) < 0.01);
const hits = (w: { x: number; y: number }[], r: { x: number; y: number; width: number; height: number }) =>
  w.slice(1).some((p, i) => {
    const a = w[i], x0 = Math.min(a.x, p.x), x1 = Math.max(a.x, p.x), y0 = Math.min(a.y, p.y), y1 = Math.max(a.y, p.y);
    return x1 > r.x && x0 < r.x + r.width && y1 > r.y && y0 < r.y + r.height;
  });

describe("T5299 routeBetweenRocks", () => {
  // A source above, a target below, one wide rock straight between them and a 60px channel to its left.
  const rock = { x: 100, y: 100, width: 100, height: 60 };
  const left = { x: 0, y: 0, width: 80, height: 300 };        // a wall to the left of the channel (channel x 80..100)
  it("threads the gap between two rocks and keeps clear of both", () => {
    const wall = { x: -400, y: 90, width: 470, height: 80 };   // wall leaving a 30px gap before the rock at x=100
    const route = routeBetweenRocks({ x: 150, y: 20 }, "bottom", { x: 150, y: 260 }, "top", [rock, wall], { clearance: 8 })!;
    expect(route).not.toBeNull();
    expect(orthogonal(route)).toBe(true);
    expect(hits(route, rock)).toBe(false);
    expect(hits(route, wall)).toBe(false);
    expect(len(route)).toBeLessThan(600);
    void left;
  });
  it("leaves and arrives along the face normals", () => {
    const route = routeBetweenRocks({ x: 0, y: 0 }, "right", { x: 300, y: 200 }, "left", [{ x: 120, y: -50, width: 60, height: 300 }])!;
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[1].y).toBe(0);                      // first leg runs right
    expect(route[route.length - 1]).toEqual({ x: 300, y: 200 });
    expect(route[route.length - 2].y).toBe(200);     // last leg runs into the left face
  });
  it("takes the route with the fewest bends when lengths tie", () => {
    const route = routeBetweenRocks({ x: 0, y: 0 }, "right", { x: 400, y: 200 }, "left", [])!;
    expect(route.length).toBeLessThanOrEqual(4);     // a Z: right, down, right
  });
  it("gives up cleanly when the face is walled in", () => {
    const route = routeBetweenRocks({ x: 0, y: 0 }, "right", { x: 300, y: 0 }, "left", [{ x: 5, y: -40, width: 60, height: 80 }]);
    expect(route).toBeNull();
  });
});

describe("T5299 V01.07 Issue Invoice", () => {
  const plan = JSON.parse(readFileSync("tests/fixtures/containment-2026-10-09/paul-V01.07.plan.json", "utf8"));
  const data = layoutBpmnDiagram(plan.elements, plan.connections);
  const c = data.connectors.find((k) => k.id === "conn-g11-t30-60")!;

  it("the 'otherwise' flow is short: well under a thousand pixels, not ten thousand", () => {
    const first = c.sourceInvisibleLeader ? 1 : 0, last = c.targetInvisibleLeader ? c.waypoints.length - 2 : c.waypoints.length - 1;
    expect(len(c.waypoints.slice(first, last + 1))).toBeLessThan(1000);
  });
  it("and it runs through nothing it is not connected to", () => {
    expect(checkDiagram(data as never).filter((v) => v.rule === "sequence-clips-foreign-node")).toEqual([]);
  });
});

describe("T5299 no fixture diagram has an absurdly long sequence connector", () => {
  it("every sequence connector is under 2.5x its straight distance + 400px", () => {
    const dir = "tests/fixtures/containment-2026-10-09";
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".plan.json"))) {
      const p = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      const d = layoutBpmnDiagram(p.elements, p.connections);
      const by = new Map(d.elements.map((e) => [e.id, e]));
      for (const k of d.connectors) {
        if (k.type !== "sequence") continue;
        const a = by.get(k.sourceId), b = by.get(k.targetId);
        if (!a || !b) continue;
        const man = Math.abs(a.x + a.width / 2 - b.x - b.width / 2) + Math.abs(a.y + a.height / 2 - b.y - b.height / 2);
        if (len(k.waypoints) > 2.5 * man + 400) bad.push(`${f}: ${k.id} ${Math.round(len(k.waypoints))} vs ${Math.round(man)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * Portfolio assembly: many diagrams → one engine network sharing team pools.
 * Two independent processes drawing on the same team must contend for ONE
 * pool (cross-process capacity planning), and ids must be namespaced so the
 * two diagrams' nodes never collide.
 */
import { describe, it, expect } from "vitest";
import { assemblePortfolio, portfolioClosure } from "@/app/lib/simulation/network";
import { Engine } from "@/app/lib/simulation/engine";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";
import type { SimRunConfig } from "@/app/lib/simulation/types";

const el = (id: string, type: string, props?: object, extra?: Partial<DiagramElement>): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 80, height: 40, label: id, properties: props ?? {}, ...extra }) as DiagramElement;
const conn = (id: string, s: string, t: string): Connector =>
  ({ id, sourceId: s, targetId: t }) as unknown as Connector;

// A minimal process: arrivals → one task on team "ops" → end. Both diagrams
// reuse the SAME element ids on purpose, to prove namespacing prevents
// collisions.
const process = (arrivalEvery: number): DiagramData => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    el("start", "start-event", { sim: { arrival: { kind: "fixed", value: arrivalEvery } } }),
    el("task", "task", { sim: { cycleTime: { kind: "fixed", value: 8 }, teamId: "ops" } }),
    el("end", "end-event"),
  ],
  connectors: [conn("c1", "start", "task"), conn("c2", "task", "end")],
});

describe("assemblePortfolio", () => {
  it("merges per-teamId into a single shared pool and namespaces ids", () => {
    const net = assemblePortfolio(
      [{ id: "A", data: process(10) }, { id: "B", data: process(10) }],
      { teamCapacities: { ops: 1 } },
    );
    // One pool, not one-per-diagram.
    expect(net.teams).toHaveLength(1);
    expect(net.teams[0]).toEqual({ id: "ops", capacity: 1 });
    // Same element ids in both diagrams stay distinct after namespacing.
    expect(net.nodes.filter((n) => n.id === "A::task")).toHaveLength(1);
    expect(net.nodes.filter((n) => n.id === "B::task")).toHaveLength(1);
    // Team id is NOT namespaced — that shared key couples the processes.
    expect(net.nodes.find((n) => n.id === "A::task")!.teamId).toBe("ops");
    expect(net.nodes.find((n) => n.id === "B::task")!.teamId).toBe("ops");
    // Edges reference namespaced endpoints.
    const e = net.edges.find((x) => x.id === "A::c1")!;
    expect(e.source).toBe("A::start");
    expect(e.target).toBe("A::task");
  });

  it("two processes saturate one shared capacity-1 pool (contention)", () => {
    const net = assemblePortfolio(
      [{ id: "A", data: process(10) }, { id: "B", data: process(10) }],
      { teamCapacities: { ops: 1 } },
    );
    const cfg: SimRunConfig = { clockUnit: "minute", horizon: 2000, warmUp: 0, replications: 1, seed: 1, collectQueues: true };
    const r = new Engine(net, cfg).run();
    // Offered load = 2 streams × (8 / 10) = 1.6 > 1 → pool is the bottleneck:
    // near-100% utilisation and a visible standing queue.
    expect(r.perTeam.ops.utilization).toBeGreaterThan(0.95);
    expect(r.perTeam.ops.avgQueue).toBeGreaterThan(1);
  });

  it("a bigger shared pool relieves the same offered load", () => {
    const net = assemblePortfolio(
      [{ id: "A", data: process(10) }, { id: "B", data: process(10) }],
      { teamCapacities: { ops: 3 } },
    );
    const cfg: SimRunConfig = { clockUnit: "minute", horizon: 2000, warmUp: 0, replications: 1, seed: 1, collectQueues: true };
    const r = new Engine(net, cfg).run();
    // load 1.6 over capacity 3 → comfortably under-utilised, no standing queue.
    expect(r.perTeam.ops.utilization).toBeLessThan(0.7);
    expect(r.perTeam.ops.avgQueue).toBeLessThan(0.5);
  });
});

describe("portfolioClosure", () => {
  const linker = (id: string, target: string): DiagramData => ({
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [el("sp", "subprocess", { linkedDiagramId: target })],
    connectors: [],
  });

  it("follows in-set forward links from the roots, cycle-safe", () => {
    const diagrams = [
      { id: "root", data: linker("root", "child") },
      { id: "child", data: linker("child", "grandchild") },
      { id: "grandchild", data: process(10) },
      { id: "orphan", data: process(10) },          // not reachable
    ];
    const reached = portfolioClosure(diagrams, ["root"]).sort();
    expect(reached).toEqual(["child", "grandchild", "root"]);
  });

  it("ignores links that point outside the supplied set", () => {
    const diagrams = [{ id: "root", data: linker("root", "external") }];
    expect(portfolioClosure(diagrams, ["root"])).toEqual(["root"]);
  });
});

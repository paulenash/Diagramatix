/**
 * Phase 2a: trace recording (drives the green-token replay), Operator
 * intervention forks (deterministic), and the diagram→network assembler.
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { makeRng } from "@/app/lib/simulation/rng";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 2000, warmUp: 0, replications: 1, seed: 99, collectQueues: true, ...over,
});

describe("trace recording", () => {
  it("emits a coherent, time-ordered token-movement log", () => {
    const net: SimNetwork = {
      teams: [{ id: "T", capacity: 1 }],
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 }, maxArrivals: 2 },
        { id: "task", kind: "task", teamId: "T", cycleTime: { kind: "fixed", value: 5 } },
        { id: "end", kind: "sink" },
      ],
      edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "end" }],
    };
    const e = new Engine(net, cfg({ horizon: 100 }), makeRng(1), { trace: true });
    e.run();
    const trace = e.getTrace();
    expect(trace.length).toBeGreaterThan(0);
    // time-ordered
    for (let i = 1; i < trace.length; i++) expect(trace[i].t).toBeGreaterThanOrEqual(trace[i - 1].t);
    // each token: spawn precedes exit
    const kindsByToken = new Map<string, string[]>();
    for (const ev of trace) (kindsByToken.get(ev.tokenId) ?? kindsByToken.set(ev.tokenId, []).get(ev.tokenId)!).push(ev.kind);
    for (const kinds of kindsByToken.values()) {
      expect(kinds[0]).toBe("spawn");
      expect(kinds).toContain("service");
      expect(kinds[kinds.length - 1]).toBe("exit");
    }
  });
});

describe("Operator intervention fork", () => {
  // Overloaded queue: λ≈1, μ=0.5 (cycle mean 2), capacity 1 ⇒ unstable backlog.
  const net: SimNetwork = {
    teams: [{ id: "T", capacity: 1 }],
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "exponential", mean: 1 } },
      { id: "task", kind: "task", teamId: "T", cycleTime: { kind: "exponential", mean: 2 } },
      { id: "end", kind: "sink" },
    ],
    edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "end" }],
  };

  it("is deterministic — same intervention + seed ⇒ identical fork", () => {
    const c = cfg();
    const base = new Engine(net, c, makeRng(c.seed));
    base.reset();
    base.runUntil(500);
    const snap = base.snapshot();

    const forkA = Engine.resume(net, c, snap);
    forkA.applyIntervention({ kind: "capacity", teamId: "T", capacity: 5 });
    forkA.runUntil(c.horizon);

    const forkB = Engine.resume(net, c, snap);
    forkB.applyIntervention({ kind: "capacity", teamId: "T", capacity: 5 });
    forkB.runUntil(c.horizon);

    expect(forkB.finalize(c.horizon)).toEqual(forkA.finalize(c.horizon));
  });

  it("intervening (more capacity) clears more work than leaving it alone", () => {
    const c = cfg();
    const snap = (() => { const e = new Engine(net, c, makeRng(c.seed)); e.reset(); e.runUntil(500); return e.snapshot(); })();

    const noOp = Engine.resume(net, c, snap); noOp.runUntil(c.horizon);
    const boosted = Engine.resume(net, c, snap); boosted.applyIntervention({ kind: "capacity", teamId: "T", capacity: 6 }); boosted.runUntil(c.horizon);

    expect(boosted.finalize(c.horizon).completed).toBeGreaterThan(noOp.finalize(c.horizon).completed);
  });
});

describe("diagram → network assembler", () => {
  const el = (id: string, type: string, sim?: object, extra?: object): DiagramElement =>
    ({ id, type, x: 0, y: 0, width: 80, height: 40, label: id, properties: sim ? { sim } : {}, ...extra }) as DiagramElement;
  const conn = (id: string, s: string, t: string, extra?: object): Connector =>
    ({ id, sourceId: s, targetId: t, ...extra }) as unknown as Connector;

  it("maps BPMN types to engine nodes, teams and branch routing", () => {
    const data: DiagramData = {
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [
        el("s", "start-event", { arrival: { kind: "fixed", value: 5 } }),
        el("g", "gateway"),
        el("a", "task", { cycleTime: { kind: "fixed", value: 3 }, teamId: "ops", resourceUnits: 2 }),
        el("e", "end-event"),
      ],
      connectors: [
        conn("c1", "s", "g"),
        conn("c2", "g", "a", { branchProbability: 70 }),
        conn("c3", "g", "e", { branchProbability: 30, isDefaultFlow: true }),
        conn("c4", "a", "e"),
      ],
    };
    const net = assembleFromDiagram(data, { teamCapacities: { ops: 4 } });
    expect(net.nodes.find((n) => n.id === "s")?.kind).toBe("source");
    expect(net.nodes.find((n) => n.id === "a")?.kind).toBe("task");
    expect(net.nodes.find((n) => n.id === "a")?.units).toBe(2);
    expect(net.nodes.find((n) => n.id === "g")?.gateway).toBe("decision");
    expect(net.teams).toEqual([{ id: "ops", capacity: 4 }]);
    expect(net.edges.find((e) => e.id === "c2")?.probability).toBeCloseTo(0.7, 6);
    expect(net.edges.find((e) => e.id === "c3")?.isDefault).toBe(true);
    // It actually runs.
    const r = new Engine(net, cfg({ horizon: 100 })).run();
    expect(r.completed).toBeGreaterThan(0);
  });
});

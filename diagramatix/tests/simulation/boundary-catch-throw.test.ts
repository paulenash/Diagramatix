/**
 * Boundary events on activities (race the host's cycle time) and throw→catch
 * synchronisation on named signal/message channels.
 *
 *  • Interrupting boundary event that WINS the race cancels the host (releasing
 *    its resource) and diverts to the boundary flow; if it loses (host finishes
 *    first) it's disarmed and never fires. Non-interrupting spawns a parallel
 *    token and the host runs on. `fireProb` gates whether it fires at all.
 *  • A signal throw broadcasts (releases ALL waiting catches); a message throw
 *    releases exactly one (FIFO) and buffers when no catch is waiting; a catch
 *    with a `catchTimeout` releases on timeout when no throw ever comes.
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import type { SimNetwork, SimNode } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 100000, warmUp: 0, replications: 1, seed: 7, collectQueues: true, ...over,
});

// ── Boundary events ────────────────────────────────────────────────────────
// src → T1(host) → N(normal successor) → end ; T1 has a boundary event → B → end.
function boundaryNet(opts: { trigger: number; fireProb?: number; interrupting: boolean; cap?: number; arrivals?: number }): SimNetwork {
  const T1: SimNode = {
    id: "T1", kind: "task", cycleTime: { kind: "fixed", value: 100 },
    ...(opts.cap ? { teamId: "R" } : {}),
    boundaryEvents: [{ id: "be", bodyStart: "B", trigger: { kind: "fixed", value: opts.trigger }, fireProb: opts.fireProb ?? 1, interrupting: opts.interrupting }],
  };
  return {
    teams: opts.cap ? [{ id: "R", capacity: opts.cap }] : [],
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 }, maxArrivals: opts.arrivals ?? 1 },
      T1,
      { id: "N", kind: "task", cycleTime: { kind: "fixed", value: 5 } },
      { id: "B", kind: "task", cycleTime: { kind: "fixed", value: 5 } },
      { id: "end", kind: "sink" },
    ],
    edges: [
      { id: "e1", source: "src", target: "T1" },
      { id: "e2", source: "T1", target: "N" },
      { id: "e3", source: "N", target: "end" },
      { id: "e4", source: "B", target: "end" },
    ],
  };
}

describe("boundary events on activities (T2832)", () => {
  it("interrupting boundary event that fires first cancels the host and diverts", () => {
    const r = new Engine(boundaryNet({ trigger: 20, interrupting: true }), cfg()).run(); // fires at t=30 < host end t=110
    expect(r.perNode.B?.count).toBe(1);       // boundary flow ran
    expect(r.perNode.N).toBeUndefined();      // normal successor never ran (host interrupted)
    expect(r.completed).toBe(1);              // the diverted case still completes
  });

  it("interrupting boundary event that loses the race never fires (host finishes first)", () => {
    const r = new Engine(boundaryNet({ trigger: 500, interrupting: true }), cfg()).run(); // fires at t=510 > host end t=110
    expect(r.perNode.N?.count).toBe(1);       // normal successor ran
    expect(r.perNode.B).toBeUndefined();      // boundary never fired (disarmed at service end)
    expect(r.completed).toBe(1);
  });

  it("non-interrupting boundary event runs a parallel flow AND the host completes", () => {
    const r = new Engine(boundaryNet({ trigger: 20, interrupting: false }), cfg()).run();
    expect(r.perNode.B?.count).toBe(1);       // parallel boundary flow ran
    expect(r.perNode.N?.count).toBe(1);       // host still completed its normal path
    expect(r.completed).toBe(1);
  });

  it("fireProb 0 → the boundary event never fires", () => {
    const r = new Engine(boundaryNet({ trigger: 20, interrupting: true, fireProb: 0 }), cfg()).run();
    expect(r.perNode.B).toBeUndefined();
    expect(r.perNode.N?.count).toBe(1);
    expect(r.completed).toBe(1);
  });

  it("an interrupt releases the host's held resource so a queued case proceeds", () => {
    // cap 1, two arrivals: the first is interrupted mid-service; releasing R must
    // let the second start. Both cases complete (no deadlock on the resource).
    const r = new Engine(boundaryNet({ trigger: 20, interrupting: true, cap: 1, arrivals: 2 }), cfg()).run();
    expect(r.completed).toBe(2);
    expect(r.perNode.B?.count).toBe(2);
  });
});

// ── Throw → catch ───────────────────────────────────────────────────────────
// Catch flow: src → C(catch) → afterC(task) → end. Throw flow: srcT → TH(throw) → endT.
function syncNet(opts: {
  correlation: "signal" | "message";
  catches: number;      // arrivals into the catch
  throws: number;       // arrivals into the throw
  throwAt: number;      // first throw arrival time (> catch arrivals so they block first)
  timeout?: number;     // catchTimeout
  channel?: string;
}): SimNetwork {
  const chan = `x:${opts.channel ?? "k"}`;
  const C: SimNode = { id: "C", kind: "delay", catch: { channel: chan, correlation: opts.correlation }, ...(opts.timeout ? { catchTimeout: { kind: "fixed", value: opts.timeout } } : {}) };
  const nodes: SimNode[] = [
    { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 }, maxArrivals: opts.catches },
    C,
    { id: "afterC", kind: "task", cycleTime: { kind: "fixed", value: 1 } },
    { id: "end", kind: "sink" },
  ];
  const edges = [
    { id: "e1", source: "src", target: "C" },
    { id: "e2", source: "C", target: "afterC" },
    { id: "e3", source: "afterC", target: "end" },
  ];
  if (opts.throws > 0) {
    nodes.push(
      { id: "srcT", kind: "source", arrival: { kind: "fixed", value: opts.throwAt }, maxArrivals: opts.throws },
      { id: "TH", kind: "delay", throw: { channel: chan, correlation: opts.correlation } },
      { id: "endT", kind: "sink" },
    );
    edges.push({ id: "t1", source: "srcT", target: "TH" }, { id: "t2", source: "TH", target: "endT" });
  }
  return { teams: [], nodes, edges };
}

describe("throw → catch synchronisation (T2833)", () => {
  it("a signal throw broadcasts — one throw releases ALL waiting catches", () => {
    // 2 catches block at t=10,20; one throw at t=50 releases both.
    const r = new Engine(syncNet({ correlation: "signal", catches: 2, throws: 1, throwAt: 50 }), cfg()).run();
    expect(r.perNode.afterC?.count).toBe(2);  // both catches released
    expect(r.perNode.TH).toBeUndefined();     // TH is a delay node (not counted), but its flow completed
    expect(r.completed).toBe(3);              // 2 catch cases + 1 throw case
  });

  it("a message throw releases exactly one waiting catch (1:1), leaving the rest blocked", () => {
    // 2 catches block; a single message throw releases only one.
    const r = new Engine(syncNet({ correlation: "message", catches: 2, throws: 1, throwAt: 50 }), cfg()).run();
    expect(r.perNode.afterC?.count).toBe(1);  // only one catch released
    expect(r.completed).toBe(2);              // 1 released catch + 1 throw
  });

  it("two message throws release both catches in turn", () => {
    const r = new Engine(syncNet({ correlation: "message", catches: 2, throws: 2, throwAt: 50 }), cfg()).run();
    expect(r.perNode.afterC?.count).toBe(2);
    expect(r.completed).toBe(4);
  });

  it("a message thrown before any catch is buffered and consumed by a later catch", () => {
    // throw at t=5 (before the catch at t=10) → buffered → catch consumes it, no block.
    const r = new Engine(syncNet({ correlation: "message", catches: 1, throws: 1, throwAt: 5 }), cfg()).run();
    expect(r.perNode.afterC?.count).toBe(1);
    expect(r.completed).toBe(2);
  });

  it("a catch with a timeout and no throw releases via the timeout (external arrival)", () => {
    const r = new Engine(syncNet({ correlation: "signal", catches: 1, throws: 0, throwAt: 0, timeout: 30 }), cfg()).run();
    expect(r.perNode.afterC?.count).toBe(1);  // released by timeout
    expect(r.completed).toBe(1);
  });

  it("without a throw or a timeout a catch blocks forever (nothing completes)", () => {
    const r = new Engine(syncNet({ correlation: "signal", catches: 1, throws: 0, throwAt: 0 }), cfg()).run();
    expect(r.perNode.afterC).toBeUndefined();
    expect(r.completed).toBe(0);              // raw engine: a blocking catch with no release blocks (assemble never emits one — it stays a pass-through delay)
  });
});

// ── Assembly: diagram fields → engine network ────────────────────────────────
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (id: string, type: string, props?: object, extra?: Partial<DiagramElement>): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 80, height: 40, label: id, properties: props ?? {}, ...extra }) as DiagramElement;
const conn = (id: string, s: string, t: string, type?: string): Connector =>
  ({ id, sourceId: s, targetId: t, ...(type ? { type } : {}) }) as unknown as Connector;

describe("assembly of boundary + catch/throw events (T2834)", () => {
  const data: DiagramData = {
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      el("S0", "start-event"),
      el("HOST", "task"),
      el("BE", "intermediate-event", { sim: { boundary: { trigger: { kind: "fixed", value: 15 }, fireProb: 0.2 } } },
        { eventType: "timer", boundaryHostId: "HOST", flowType: "catching", properties: { interruptionType: "interrupting", sim: { boundary: { trigger: { kind: "fixed", value: 15 }, fireProb: 0.2 } } } } as Partial<DiagramElement>),
      el("BFLOW", "task"),
      el("THROW", "intermediate-event", { sim: { channel: "m" } }, { eventType: "message", flowType: "throwing" }),
      el("CATCH", "intermediate-event", { sim: { channel: "s", catchTimeout: { kind: "fixed", value: 40 } } }, { eventType: "signal", flowType: "catching" }),
      el("END", "end-event"),
    ],
    connectors: [
      conn("c0", "S0", "HOST"),
      conn("c1", "HOST", "THROW"),
      conn("c2", "THROW", "CATCH"),
      conn("c3", "CATCH", "END"),
      conn("cb", "BE", "BFLOW", "sequence"), // boundary event's diverted flow
      conn("cbe", "BFLOW", "END"),
    ],
  };
  const net = assembleFromDiagram(data);
  const byId = new Map(net.nodes.map((n) => [n.id, n]));

  it("attaches boundary events to the host node and drops the event as a flow node", () => {
    const host = byId.get("HOST")!;
    expect(host.boundaryEvents).toHaveLength(1);
    expect(host.boundaryEvents![0]).toMatchObject({ id: "BE", bodyStart: "BFLOW", fireProb: 0.2, interrupting: true });
    expect(byId.has("BE")).toBe(false); // boundary event isn't a flow node
  });

  it("maps a throwing message event to a throw channel and a catching signal to a catch channel", () => {
    expect(byId.get("THROW")!.throw).toEqual({ channel: "message:m", correlation: "message" });
    const c = byId.get("CATCH")!;
    expect(c.catch).toEqual({ channel: "signal:s", correlation: "signal" });
    expect(c.catchTimeout).toEqual({ kind: "fixed", value: 40 });
  });
});

// ── Boundary events on an Expanded Subprocess (race the whole inline body) ────
// src → EP → N(after) → end.  EP body: b1(task,100) → bend.  Boundary → B → end.
function epBoundaryNet(opts: { trigger: number; fireProb?: number; interrupting: boolean; cap?: number; arrivals?: number }): SimNetwork {
  const EP: SimNode = {
    id: "EP", kind: "subprocess", bodyStart: "b1",
    boundaryEvents: [{ id: "be", bodyStart: "B", trigger: { kind: "fixed", value: opts.trigger }, fireProb: opts.fireProb ?? 1, interrupting: opts.interrupting }],
  };
  return {
    teams: opts.cap ? [{ id: "R", capacity: opts.cap }] : [],
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "fixed", value: 10 }, maxArrivals: opts.arrivals ?? 1 },
      EP,
      { id: "b1", kind: "task", scope: "EP", cycleTime: { kind: "fixed", value: 100 }, ...(opts.cap ? { teamId: "R" } : {}) },
      { id: "bend", kind: "sink", scope: "EP" },
      { id: "N", kind: "task", cycleTime: { kind: "fixed", value: 5 } },
      { id: "B", kind: "task", cycleTime: { kind: "fixed", value: 5 } },
      { id: "end", kind: "sink" },
    ],
    edges: [
      { id: "e1", source: "src", target: "EP" },
      { id: "e2", source: "EP", target: "N" },
      { id: "e3", source: "N", target: "end" },
      { id: "e4", source: "b1", target: "bend" },
      { id: "e5", source: "B", target: "end" },
    ],
  };
}

describe("boundary events on an expanded subprocess (T2835)", () => {
  it("interrupting boundary fires mid-subprocess: cancels the body and diverts out of the EP", () => {
    const r = new Engine(epBoundaryNet({ trigger: 20, interrupting: true }), cfg()).run(); // fires while b1 (100) runs
    expect(r.perNode.B?.count).toBe(1);       // boundary flow ran
    expect(r.perNode.N).toBeUndefined();      // the EP's normal continuation never ran
    expect(r.completed).toBe(1);              // the diverted case still completes
  });

  it("interrupting boundary that loses the race never fires (the subprocess finishes first)", () => {
    const r = new Engine(epBoundaryNet({ trigger: 500, interrupting: true }), cfg()).run();
    expect(r.perNode.N?.count).toBe(1);       // EP completed → normal continuation ran
    expect(r.perNode.B).toBeUndefined();      // boundary disarmed when the scope completed
    expect(r.completed).toBe(1);
  });

  it("non-interrupting boundary runs a parallel flow AND the subprocess completes", () => {
    const r = new Engine(epBoundaryNet({ trigger: 20, interrupting: false }), cfg()).run();
    expect(r.perNode.B?.count).toBe(1);
    expect(r.perNode.N?.count).toBe(1);       // EP still completed normally
    expect(r.completed).toBe(1);              // side flow is internal — not double-counted
  });

  it("an interrupt releases a resource held INSIDE the subprocess so a queued case proceeds", () => {
    const r = new Engine(epBoundaryNet({ trigger: 20, interrupting: true, cap: 1, arrivals: 2 }), cfg()).run();
    expect(r.completed).toBe(2);
    expect(r.perNode.B?.count).toBe(2);
  });
});

describe("assembly attaches a boundary event to an EP host (T2835)", () => {
  it("a boundary event on an expanded subprocess lands on the EP's subprocess node", () => {
    const data: DiagramData = {
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [
        el("S0", "start-event"),
        el("EP", "subprocess-expanded"),
        el("bs", "start-event", {}, { parentId: "EP" }),
        el("bt", "task", { sim: { cycleTime: { kind: "fixed", value: 10 } } }, { parentId: "EP" }),
        el("beEnd", "end-event", {}, { parentId: "EP" }),
        el("BE", "intermediate-event", {}, { eventType: "timer", boundaryHostId: "EP", flowType: "catching", properties: { interruptionType: "interrupting", sim: { boundary: { trigger: { kind: "fixed", value: 5 } } } } } as Partial<DiagramElement>),
        el("HANDLER", "task"),
        el("END", "end-event"),
      ],
      connectors: [
        conn("c0", "S0", "EP"), conn("c1", "EP", "END"),
        conn("b1", "bs", "bt"), conn("b2", "bt", "beEnd"),
        conn("cbe", "BE", "HANDLER", "sequence"), conn("ch", "HANDLER", "END"),
      ],
    };
    const net = assembleFromDiagram(data);
    const ep = net.nodes.find((n) => n.id === "EP")!;
    expect(ep.kind).toBe("subprocess");
    expect(ep.boundaryEvents).toHaveLength(1);
    expect(ep.boundaryEvents![0]).toMatchObject({ id: "BE", bodyStart: "HANDLER", interrupting: true });
    expect(net.nodes.some((n) => n.id === "BE")).toBe(false);
  });
});

// ── Replay flash trace events (boundary fired = red, catch triggered = green) ──
describe("activation flash trace events (T2836)", () => {
  it("emits a boundary 'fire' event when a boundary event activates", () => {
    const e = new Engine(boundaryNet({ trigger: 20, interrupting: true }), cfg(), undefined, { trace: true });
    e.run();
    const fires = e.getTrace().filter((t) => t.kind === "fire");
    expect(fires.some((t) => t.variant === "boundary" && t.nodeId === "be")).toBe(true);
  });

  it("emits a catch 'fire' event when a throw triggers a waiting catch", () => {
    const e = new Engine(syncNet({ correlation: "signal", catches: 2, throws: 1, throwAt: 50 }), cfg(), undefined, { trace: true });
    e.run();
    const fires = e.getTrace().filter((t) => t.kind === "fire");
    expect(fires.filter((t) => t.variant === "catch" && t.nodeId === "C")).toHaveLength(2); // both catches triggered
  });

  it("does not emit a catch 'fire' when a catch releases via timeout (not a real trigger)", () => {
    const e = new Engine(syncNet({ correlation: "signal", catches: 1, throws: 0, throwAt: 0, timeout: 30 }), cfg(), undefined, { trace: true });
    e.run();
    expect(e.getTrace().some((t) => t.kind === "fire")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { autofillSimulation } from "@/app/lib/simulation/autofill";
import { getSimParams } from "@/app/lib/diagram/simParams";
import { isExternalWait } from "@/app/lib/simulation/externalWait";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig } from "@/app/lib/simulation/types";
import type { DiagramData } from "@/app/lib/diagram/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 100_000, warmUp: 0, replications: 1, seed: 7, collectQueues: true, ...over,
});

/**
 * T2870 — waiting on an outside party is not work, and is not shaped like work.
 *
 * The flat task default is triangular(3,5,8): never under 3, never over 8. That
 * is right for work and wrong for an external reply, which is memoryless and
 * long-tailed. Modelling it as triangular removes the tail that makes timeouts,
 * chasing and escalation paths worth drawing — usually the reason the process
 * was drawn at all.
 */
describe("external waits are filled as exponential, not triangular", () => {
  const diagram = (el: Record<string, unknown>): DiagramData => ({
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      { id: "P", type: "pool", x: 0, y: 0, width: 900, height: 200, label: "Co", properties: {} },
      { id: "L", type: "lane", parentId: "P", x: 40, y: 0, width: 800, height: 200, label: "Sales", properties: {} },
      { id: "s", type: "start-event", parentId: "L", x: 60, y: 60, width: 36, height: 36, label: "Start", properties: {} },
      { ...el, parentId: "L", x: 200, y: 60, width: 100, height: 60, properties: (el.properties ?? {}) },
    ],
    connectors: [],
  } as unknown as DiagramData);

  const cycleOf = (d: DiagramData, id: string) => getSimParams(d.elements.find((e) => e.id === id)!).cycleTime;
  const delayOf = (d: DiagramData, id: string) => getSimParams(d.elements.find((e) => e.id === id)!).delay;

  it("a RECEIVE task waits on someone else — exponential", () => {
    const { data } = autofillSimulation(diagram({ id: "t", type: "task", label: "Await reply", taskType: "receive" }));
    expect(cycleOf(data, "t")).toMatchObject({ kind: "exponential" });
  });

  it("an ordinary task is real work — triangular, unchanged", () => {
    const { data } = autofillSimulation(diagram({ id: "t", type: "task", label: "Check email" }));
    expect(cycleOf(data, "t")).toMatchObject({ kind: "triangular", min: 3, mode: 5, max: 8 });
  });

  it("a SEND task is our own work, not a wait", () => {
    const { data } = autofillSimulation(diagram({ id: "t", type: "task", label: "Send reply", taskType: "send" }));
    expect(cycleOf(data, "t")).toMatchObject({ kind: "triangular" });
  });

  it("a MESSAGE catch event is a wait; a TIMER keeps its parsed duration", () => {
    const msg = autofillSimulation(diagram({ id: "e", type: "intermediate-event", label: "Reply received", eventType: "message" })).data;
    expect(delayOf(msg, "e")).toMatchObject({ kind: "exponential" });
    const timer = autofillSimulation(diagram({ id: "e", type: "intermediate-event", label: "Wait 3 hours", eventType: "timer" })).data;
    expect(delayOf(timer, "e"), "a stated duration still wins over any default").toMatchObject({ kind: "fixed", value: 180 });
  });

  it("a boundary message event is excluded — it races its host and has its own trigger", () => {
    const el = { id: "b", type: "intermediate-event", label: "Cancelled", eventType: "message", boundaryHostId: "t" };
    expect(isExternalWait(el as never)).toBe(false);
  });
});

/**
 * T2871 — WaitTime is a NON-SEIZING delay, and is actually simulated.
 *
 * The field existed in the model, the panel, the overrides and BPSim
 * import/export — and the engine never read it, so every wait entered there
 * silently changed nothing. The distinction from cycleTime is the whole point:
 * cycleTime holds a person for its duration, WaitTime holds only the case.
 */
describe("WaitTime", () => {
  /** One arrival; a 10-minute task with a `wait` minute non-seizing tail. */
  function net(wait?: number): SimNetwork {
    return {
      teams: [{ id: "T", capacity: 1 }],
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 5 }, maxArrivals: 3 },
        {
          id: "task", kind: "task", teamId: "T", units: 1,
          cycleTime: { kind: "fixed", value: 10 },
          ...(wait !== undefined ? { waitTime: { kind: "fixed", value: wait } } : {}),
        },
        { id: "sink", kind: "sink" },
      ],
      edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "sink" }],
    } as unknown as SimNetwork;
  }

  it("delays the case", () => {
    const without = new Engine(net(), cfg()).run();
    const withWait = new Engine(net(30), cfg()).run();
    expect(withWait.avgFlowTime - without.avgFlowTime, "each case carries the extra 30 minutes").toBeCloseTo(30, 0);
  });

  it("does NOT hold the resource — utilisation is unchanged by it", () => {
    const a = new Engine(net(), cfg()).run();
    const b = new Engine(net(30), cfg()).run();
    const u = (r: typeof a) => r.perTeam?.["T"]?.utilization ?? 0;
    expect(u(b)).toBeCloseTo(u(a), 5);
  });

  it("all three cases still complete — the wait delays, it does not strand", () => {
    expect(new Engine(net(30), cfg()).run().completed).toBe(3);
  });
});

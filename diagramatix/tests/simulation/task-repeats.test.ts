import { describe, it, expect } from "vitest";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { autofillSimulation } from "@/app/lib/simulation/autofill";
import { getSimParams } from "@/app/lib/diagram/simParams";
import { Engine } from "@/app/lib/simulation/engine";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { SimRunConfig } from "@/app/lib/simulation/types";

/**
 * T2858 — a repeat / multi-instance marker on a TASK is simulated.
 *
 * The marker was read only for sub-processes, so on a task it was drawn,
 * exported to BPMN, and silently ignored: the task ran exactly once however it
 * was marked, understating its load and every queue behind it. And the count
 * itself was an invisible hardcoded 2 / 3, because nothing could set sim.loop.
 */
const el = (id: string, type: string, x: number, extra: Record<string, unknown> = {}) =>
  ({ id, type, x, y: 0, width: 90, height: 50, label: id, properties: {}, ...extra } as never);

const diagram = (repeatType?: string, loop?: unknown): DiagramData => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    el("s", "start-event", 0, { properties: { sim: { arrival: { kind: "fixed", value: 10 }, maxArrivals: 1 } } }),
    el("t", "task", 100, { repeatType, properties: { sim: { cycleTime: { kind: "fixed", value: 5 }, teamId: "T", ...(loop ? { loop } : {}) } } }),
    el("e", "end-event", 300),
  ],
  connectors: [
    { id: "c1", sourceId: "s", targetId: "t", type: "sequence" },
    { id: "c2", sourceId: "t", targetId: "e", type: "sequence" },
  ],
} as unknown as DiagramData);

const cfg: SimRunConfig = { clockUnit: "minute", horizon: 500, warmUp: 0, replications: 1, seed: 1, collectQueues: true };
/** Service time at the task. Sequential passes are ONE held block, so the number
 *  of passes shows up as DURATION, not as extra service events. */
function serviceTime(d: DiagramData, capacity = 1): number {
  const e = new Engine(assembleFromDiagram(d, { teamCapacities: { T: capacity } }), cfg, undefined, { trace: true });
  e.run();
  const svc = e.getTrace().find((x) => x.kind === "service" && x.nodeId === "t")!;
  return e.getTrace().find((x) => x.kind === "exit")!.t - svc.t;
}

describe("repeat markers on a task", () => {
  it("an unmarked task runs once", () => {
    expect(serviceTime(diagram())).toBe(5);
  });

  it("mi-sequential runs the marker's default number of passes", () => {
    expect(serviceTime(diagram("mi-sequential"))).toBe(15); // 3 × 5
  });

  it("a loop marker runs its default passes", () => {
    expect(serviceTime(diagram("loop"))).toBe(10); // 2 × 5
  });

  it("an explicit count overrides the marker default", () => {
    expect(serviceTime(diagram("mi-sequential", { kind: "multi", instances: { kind: "fixed", value: 5 }, ordering: "sequential" }))).toBe(25);
  });

  it("sequential passes are ONE uninterrupted block — the team is held throughout", () => {
    // 3 passes × 5 min, seized once (arrival at t=10) — not one 5-min pass, and
    // not three separately-queued ones.
    const e = new Engine(assembleFromDiagram(diagram("mi-sequential"), { teamCapacities: { T: 1 } }), cfg, undefined, { trace: true });
    e.run();
    expect(e.getTrace().filter((x) => x.kind === "service" && x.nodeId === "t")).toHaveLength(1);
    expect(e.getTrace().find((x) => x.kind === "exit")?.t).toBe(25);
  });
});

describe("parallel multi-instance is as concurrent as the team allows", () => {
  const parallel = (instances: number) => diagram("mi-parallel", { kind: "multi", instances: { kind: "fixed", value: instances }, ordering: "parallel" });
  const finishedAt = (d: DiagramData, capacity: number) => {
    const e = new Engine(assembleFromDiagram(d, { teamCapacities: { T: capacity } }), cfg, undefined, { trace: true });
    e.run();
    return e.getTrace().find((x) => x.kind === "exit")!.t;
  };

  it("with enough units every instance overlaps — the slowest one sets the duration", () => {
    // 4 instances × 5 min, team of 4 → all at once → 5 min (arrives at 10).
    expect(finishedAt(parallel(4), 4)).toBe(15);
  });

  it("with too few units it runs in WAVES, not all-at-once and not one-at-a-time", () => {
    // 4 instances, team of 2 → 2 waves × 5 min = 10 min.
    expect(finishedAt(parallel(4), 2)).toBe(20);
    // A team of 1 cannot overlap at all → 4 × 5 = 20 min.
    expect(finishedAt(parallel(4), 1)).toBe(30);
  });

  it("is never slower than sequential, nor faster than a single pass", () => {
    const oneCapacity = finishedAt(parallel(4), 1);
    const fullCapacity = finishedAt(parallel(4), 4);
    expect(fullCapacity).toBeLessThan(oneCapacity);
    expect(fullCapacity).toBeGreaterThanOrEqual(15); // can't beat one 5-min pass
  });
});

describe("Fill missing writes the repeat count", () => {
  it("makes the previously-invisible default explicit and editable", () => {
    const { data } = autofillSimulation(diagram("mi-sequential"));
    const sim = getSimParams(data.elements.find((e) => e.id === "t")!);
    expect(sim.loop).toEqual({ kind: "multi", instances: { kind: "fixed", value: 3 }, ordering: "sequential" });
    expect(sim.autofilled, "tagged so Unfill reverses it").toContain("loop");
  });

  it("never overwrites a count the user set", () => {
    const mine = { kind: "multi", instances: { kind: "triangular", min: 2, mode: 3, max: 8 }, ordering: "sequential" };
    const { data } = autofillSimulation(diagram("mi-sequential", mine));
    expect(getSimParams(data.elements.find((e) => e.id === "t")!).loop).toEqual(mine);
  });

  it("leaves an unmarked task alone", () => {
    const { data } = autofillSimulation(diagram());
    expect(getSimParams(data.elements.find((e) => e.id === "t")!).loop).toBeUndefined();
  });
});

/**
 * T2862 — resource accounting must balance.
 *
 * A parallel multi-instance activity seizes units × concurrency but the release
 * path returned node.units, so every execution leaked the difference. The pool
 * drained to zero, every token queued forever, and the run reported "Running"
 * while nothing moved. A token must release exactly what it held.
 */
describe("parallel multi-instance does not leak capacity", () => {
  const many = (instances: number, arrivals: number): DiagramData => ({
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      el("s", "start-event", 0, { properties: { sim: { arrival: { kind: "fixed", value: 10 }, maxArrivals: arrivals } } }),
      el("t", "task", 100, {
        repeatType: "mi-parallel",
        properties: { sim: { cycleTime: { kind: "fixed", value: 5 }, teamId: "T", loop: { kind: "multi", instances: { kind: "fixed", value: instances }, ordering: "parallel" } } },
      }),
      el("e", "end-event", 300),
    ],
    connectors: [
      { id: "c1", sourceId: "s", targetId: "t", type: "sequence" },
      { id: "c2", sourceId: "t", targetId: "e", type: "sequence" },
    ],
  } as unknown as DiagramData);

  it("every arrival still completes — the pool is not drained", () => {
    // 3 instances against a team of 3: the whole seizure must come back each
    // time, or later arrivals starve.
    const e = new Engine(assembleFromDiagram(many(3, 20), { teamCapacities: { T: 3 } }), cfg, undefined, { trace: true });
    e.run();
    const exits = e.getTrace().filter((x) => x.kind === "exit").length;
    expect(exits, "all 20 cases should finish").toBe(20);
  });

  it("throughput does not decay as the run proceeds", () => {
    // The leak showed up as later cases taking ever longer until nothing moved.
    const e = new Engine(assembleFromDiagram(many(3, 12), { teamCapacities: { T: 3 } }), cfg, undefined, { trace: true });
    e.run();
    const exits = e.getTrace().filter((x) => x.kind === "exit").map((x) => x.t);
    const firstGap = exits[1] - exits[0];
    const lastGap = exits[exits.length - 1] - exits[exits.length - 2];
    expect(lastGap, "the last case should not be slower than the first").toBeCloseTo(firstGap, 5);
  });
});

/**
 * T2864 — a repeat count is a DISTRIBUTION, so an unlucky sample or a mistyped
 * mean can ask for an enormous number of passes. Each pass is materialised to
 * sample its own duration, so unbounded that is an arbitrarily large allocation
 * inside the event loop — and this runs SERVER-SIDE for the authoritative run,
 * where it could take the whole app down rather than one browser tab. Clamped,
 * a data error stays a wrong number instead of becoming an outage.
 */
describe("a runaway repeat count cannot exhaust memory", () => {
  it("completes promptly instead of allocating without limit", () => {
    const insane: DiagramData = {
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [
        el("s", "start-event", 0, { properties: { sim: { arrival: { kind: "fixed", value: 10 }, maxArrivals: 1 } } }),
        el("t", "task", 100, {
          properties: { sim: {
            cycleTime: { kind: "fixed", value: 1 }, teamId: "T",
            loop: { kind: "multi", instances: { kind: "fixed", value: 5_000_000_000 }, ordering: "sequential" },
          } },
        }),
        el("e", "end-event", 300),
      ],
      connectors: [
        { id: "c1", sourceId: "s", targetId: "t", type: "sequence" },
        { id: "c2", sourceId: "t", targetId: "e", type: "sequence" },
      ],
    } as unknown as DiagramData;

    const started = Date.now();
    const e = new Engine(assembleFromDiagram(insane, { teamCapacities: { T: 1 } }), cfg, undefined, { trace: true });
    e.run();
    // The point is that it RETURNS. Without the clamp this allocates billions of
    // entries and never gets here.
    expect(Date.now() - started, "must not hang or thrash").toBeLessThan(5000);
    const svc = e.getTrace().filter((x) => x.kind === "service" && x.nodeId === "t");
    expect(svc.length, "the activity still ran").toBe(1);
  });
});

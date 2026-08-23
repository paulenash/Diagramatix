import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { autofillSimulation } from "@/app/lib/simulation/autofill";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig, WorkCalendar } from "@/app/lib/simulation/types";
import type { DiagramData } from "@/app/lib/diagram/types";

/** Mon–Fri 09:00–17:00. */
const NINE_TO_FIVE: WorkCalendar = { intervals: [0, 1, 2, 3, 4].map((day) => ({ day, start: "09:00", end: "17:00" })) };
const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 60 * 24 * 30, warmUp: 0, replications: 1, seed: 5, collectQueues: true, ...over,
});

/**
 * T2872 — a boundary timer says what it means, and an unqualified one is elapsed.
 *
 * "2 days" and "2 working days" are different deadlines, and a reminder timer
 * that ignores nights and weekends fires while nobody could have acted on it.
 * The wording is the user's statement of intent — never inferred — so anything
 * without the working/business qualifier stays elapsed, which is the ordinary
 * reading of "2 days".
 *
 * Boundary timers previously took a flat exponential default and ignored the
 * label entirely, so a timer that said "7 working days" on the drawing was
 * simulated as a random hour.
 */
describe("boundary timer wording", () => {
  const withLabel = (label: string): DiagramData => ({
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      { id: "P", type: "pool", x: 0, y: 0, width: 900, height: 200, label: "Co", properties: {} },
      { id: "L", type: "lane", parentId: "P", x: 40, y: 0, width: 800, height: 200, label: "Sales", properties: {} },
      { id: "t", type: "task", parentId: "L", x: 200, y: 60, width: 100, height: 60, label: "Await reply", properties: {} },
      { id: "b", type: "intermediate-event", boundaryHostId: "t", eventType: "timer", x: 240, y: 100, width: 36, height: 36, label, properties: {} },
      { id: "h", type: "task", parentId: "L", x: 400, y: 160, width: 100, height: 60, label: "Chase", properties: {} },
    ],
    connectors: [{ id: "c1", source: "b", target: "h" }],
  } as unknown as DiagramData);

  const boundaryOf = (label: string) =>
    getSimParams(autofillSimulation(withLabel(label)).data.elements.find((e) => e.id === "b")!).boundary;

  it("reads a plain duration off the label as ELAPSED", () => {
    expect(boundaryOf("2 days")).toMatchObject({ trigger: { kind: "fixed", value: 2880 } });
    expect(boundaryOf("2 days")?.triggerMode, "unqualified means elapsed").toBeUndefined();
  });

  it("reads working DAYS as a day count, not as N x 8 hours", () => {
    // Seven 24-hour periods skipping the closed days — the shift length is
    // irrelevant, so a 7.5-hour or 12-hour calendar gives the same deadline.
    expect(boundaryOf("7 working days")).toMatchObject({ trigger: { kind: "fixed", value: 7 }, triggerMode: "working-days" });
    expect(boundaryOf("1 working week")).toMatchObject({ trigger: { kind: "fixed", value: 5 }, triggerMode: "working-days" });
  });

  it("distinguishes '2 hours' from '2 working hours' — same number, different clock", () => {
    expect(boundaryOf("2 hours")).toMatchObject({ trigger: { kind: "fixed", value: 120 } });
    expect(boundaryOf("2 hours")?.triggerMode).toBeUndefined();
    expect(boundaryOf("2 working hours")).toMatchObject({ trigger: { kind: "fixed", value: 120 }, triggerMode: "working" });
  });

  it("falls back to the flat default when the label says nothing", () => {
    expect(boundaryOf("Too slow")).toMatchObject({ trigger: { kind: "exponential" } });
  });
});

/**
 * T2873 — a working boundary timer does not burn through closed hours.
 *
 * The behavioural half: with a Mon–Fri 9–5 calendar, "2 working hours" armed
 * near the end of a day must land the NEXT morning, not at 6pm.
 */
describe("working boundary timer — engine", () => {
  /** Host task long enough that the boundary always wins the race. */
  function net(working: boolean): SimNetwork {
    return {
      teams: [{ id: "T", capacity: 1, calendar: NINE_TO_FIVE }],
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 16 * 60 }, maxArrivals: 1, calendar: NINE_TO_FIVE },
        {
          id: "task", kind: "task", teamId: "T", units: 1, cycleTime: { kind: "fixed", value: 100_000 },
          boundaryEvents: [{
            id: "b", bodyStart: "sink", trigger: { kind: "fixed", value: 120 }, fireProb: 1, interrupting: true,
            ...(working ? { triggerMode: "working", calendar: NINE_TO_FIVE } : {}),
          }],
        },
        { id: "sink", kind: "sink" },
      ],
      edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "sink" }],
    } as unknown as SimNetwork;
  }

  const firedAt = (working: boolean): number => {
    const e = new Engine(net(working), cfg(), undefined, { trace: true });
    e.run();
    const fire = e.getTrace().find((t) => t.nodeId === "sink" || t.kind === "fire");
    return fire?.t ?? -1;
  };

  it("elapsed and working timers fire at different times", () => {
    const elapsed = firedAt(false);
    const working = firedAt(true);
    expect(elapsed).toBeGreaterThan(0);
    expect(working).toBeGreaterThan(elapsed);
  });

  it("the working timer lands inside open hours, the elapsed one need not", () => {
    const working = firedAt(true);
    const timeOfDay = working % (24 * 60);
    expect(timeOfDay, "9:00–17:00 in minutes").toBeGreaterThanOrEqual(9 * 60);
    expect(timeOfDay).toBeLessThanOrEqual(17 * 60);
  });
});

import { describe, it, expect } from "vitest";
import { advanceWorkingClock, nextTimeOfDayClock } from "@/app/lib/simulation/calendar";
import { Engine } from "@/app/lib/simulation/engine";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { autofillSimulation } from "@/app/lib/simulation/autofill";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig, WorkCalendar } from "@/app/lib/simulation/types";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * T2848 — working-time and absolute ("until") timer delays in the engine.
 * A working delay counts only during open hours (spanning nights/weekends); an
 * "until" delay resumes at the next wall-clock occurrence of a time-of-day.
 */
const NINE_TO_FIVE: WorkCalendar = { intervals: [0, 1, 2, 3, 4].map((day) => ({ day, start: "09:00", end: "17:00" })) };
const DAY = 24 * 60; // minutes/day
const MON_9 = 9 * 60;   // 540
const MON_5 = 17 * 60;  // 1020

describe("calendar — advanceWorkingClock", () => {
  it("consumes only open time, jumping over the overnight closure", () => {
    // Mon 09:00 + 60 working-min stays in-window.
    expect(advanceWorkingClock(MON_9, 60, NINE_TO_FIVE, "minute")).toBe(MON_9 + 60);
    // Mon 16:40 (=1000) + 60 working-min: 20 min to 17:00, then 40 into Tue → Tue 09:40.
    expect(advanceWorkingClock(1000, 60, NINE_TO_FIVE, "minute")).toBe(DAY + MON_9 + 40);
    // A full working week (5×8h) from Mon 09:00 lands on Fri 17:00.
    expect(advanceWorkingClock(MON_9, 5 * 8 * 60, NINE_TO_FIVE, "minute")).toBe(4 * DAY + MON_5);
  });
  it("degrades to elapsed time for an always-open calendar", () => {
    expect(advanceWorkingClock(100, 250, { intervals: [] }, "minute")).toBe(350);
  });
});

describe("calendar — nextTimeOfDayClock", () => {
  it("returns today's time when before it, tomorrow's when after", () => {
    expect(nextTimeOfDayClock(MON_9, "15:00", "minute")).toBe(15 * 60);           // same day
    expect(nextTimeOfDayClock(1000, "15:00", "minute")).toBe(DAY + 15 * 60);      // rolled to next day
    expect(nextTimeOfDayClock(15 * 60, "15:00", "minute"), "exactly now = 0 wait").toBe(15 * 60);
  });
});

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 5 * DAY, warmUp: 0, replications: 1, seed: 7, collectQueues: true, ...over,
});

/** source(arrive once at `arriveAt`) → delay → sink. */
function net(arriveAt: number, delayNode: Partial<SimNetwork["nodes"][number]>): SimNetwork {
  return {
    teams: [],
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "fixed", value: arriveAt }, maxArrivals: 1 },
      { id: "d", kind: "delay", ...delayNode } as SimNetwork["nodes"][number],
      { id: "sink", kind: "sink" },
    ],
    edges: [{ id: "e1", source: "src", target: "d" }, { id: "e2", source: "d", target: "sink" }],
  };
}
const exitT = (e: Engine) => e.getTrace().find((t) => t.kind === "exit")?.t;

describe("engine — timer delay modes", () => {
  it("a working delay spans the overnight closure (600 working-min from Mon 09:00 → Tue 10:00)", () => {
    const e = new Engine(net(MON_9, { delay: { kind: "fixed", value: 600 }, delayMode: "working", calendar: NINE_TO_FIVE }), cfg(), undefined, { trace: true });
    e.run();
    // 480 min Mon 09:00→17:00, remaining 120 min into Tue 09:00 → Tue 10:00.
    expect(exitT(e)).toBe(DAY + MON_9 + 120);
  });

  it("the same magnitude as a plain elapsed delay does NOT span the closure", () => {
    const e = new Engine(net(MON_9, { delay: { kind: "fixed", value: 600 } }), cfg(), undefined, { trace: true });
    e.run();
    expect(exitT(e)).toBe(MON_9 + 600); // continuous elapsed time
  });

  it("an 'until' delay resumes at the next wall-clock occurrence of the time", () => {
    const before = new Engine(net(MON_9, { delayMode: "until", delayUntil: "15:00" }), cfg(), undefined, { trace: true });
    before.run();
    expect(exitT(before)).toBe(15 * 60); // same day 15:00

    const after = new Engine(net(1000, { delayMode: "until", delayUntil: "15:00" }), cfg(), undefined, { trace: true });
    after.run();
    expect(exitT(after)).toBe(DAY + 15 * 60); // arrived 16:40 → next day 15:00
  });
});

describe("autofill → assemble — working delay inherits the lane team's calendar", () => {
  it("a '10 working days' timer in the Sales lane assembles a working delay on Sales' calendar", () => {
    const diagram: DiagramData = {
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [
        { id: "P", type: "pool", x: 0, y: 0, width: 800, height: 200, label: "Order", properties: {} },
        { id: "sales", type: "lane", parentId: "P", x: 40, y: 0, width: 760, height: 200, label: "Sales", properties: {} },
        { id: "s", type: "start-event", parentId: "sales", x: 80, y: 80, width: 40, height: 40, label: "", properties: {} },
        { id: "wait", type: "intermediate-event", parentId: "sales", x: 300, y: 80, width: 40, height: 40, label: "10 working days", properties: {} },
        { id: "end", type: "end-event", parentId: "sales", x: 600, y: 80, width: 40, height: 40, label: "", properties: {} },
      ],
      connectors: [
        { id: "c1", sourceId: "s", targetId: "wait", type: "sequence" } as any,
        { id: "c2", sourceId: "wait", targetId: "end", type: "sequence" } as any,
      ],
    } as unknown as DiagramData;

    const { data } = autofillSimulation(diagram); // parses the label → working delay
    const net = assembleFromDiagram(data, { teamCalendars: { Sales: NINE_TO_FIVE } });
    const wait = net.nodes.find((n) => n.id === "wait")!;
    expect(wait.delayMode).toBe("working");
    expect(wait.delay).toEqual({ kind: "fixed", value: 10 * 8 * 60 }); // 4800 working-min
    expect(wait.calendar, "inherited the Sales lane calendar").toEqual(NINE_TO_FIVE);
  });
});

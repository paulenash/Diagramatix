import { describe, it, expect } from "vitest";
import { replayHorizonFor, defaultReplayConfig } from "@/app/lib/simulation/replaySource";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import type { WorkCalendar } from "@/app/lib/simulation/types";
import type { DiagramData } from "@/app/lib/diagram/types";

/** Mon–Fri 09:00–17:00. */
const BH: WorkCalendar = { intervals: [0, 1, 2, 3, 4].map((day) => ({ day, start: "09:00", end: "17:00" })) };

/**
 * T2875 — the cold-start replay window must contain some working hours.
 *
 * The simulation clock starts at t=0 ≙ MONDAY 00:00 and the short replay default
 * is four hours, so a model whose teams work 09:00–17:00 got a window of
 * Mon 00:00–04:00 in which nothing could happen at all. The clock ticked, tokens
 * arrived and queued, and no work ever started — the replay looked stuck, while
 * running the same model was fine because a scenario run brings its own
 * multi-day horizon. The window was chosen with no reference to the calendar.
 */
describe("replay window", () => {
  it("the four-hour default cannot reach 09:00 — this is the bug", () => {
    expect(defaultReplayConfig().horizon).toBeLessThan(9 * 60);
  });

  it("stretches past the first open moment when a team has working hours", () => {
    const h = replayHorizonFor(240, { "Sales Team": BH }, "minute");
    expect(h, "must reach at least Monday 09:00").toBeGreaterThan(9 * 60);
    expect(h, "and cover a full shift beyond it").toBeGreaterThanOrEqual(9 * 60 + 8 * 60);
  });

  it("leaves a 24/7 model alone — the short window already shows work", () => {
    expect(replayHorizonFor(240, {}, "minute")).toBe(240);
    expect(replayHorizonFor(240, { T: { intervals: [] } }, "minute")).toBe(240);
    expect(replayHorizonFor(240, undefined, "minute")).toBe(240);
  });

  it("never shortens a window that is already long enough", () => {
    expect(replayHorizonFor(60 * 24 * 7, { "Sales Team": BH }, "minute")).toBe(60 * 24 * 7);
  });

  it("takes the EARLIEST open moment across several calendars", () => {
    const early: WorkCalendar = { intervals: [{ day: 0, start: "06:00", end: "14:00" }] };
    expect(replayHorizonFor(240, { A: BH, B: early }, "minute")).toBe(6 * 60 + 8 * 60);
  });
});

/**
 * T2876 — an edge-mounted trigger that is not a timer only runs during work.
 *
 * An error, escalation, conditional, signal or message boundary event represents
 * something arising DURING the work. None of them can happen while nobody is
 * working, so the clock accrues only through the host team's open hours — an
 * error boundary firing at 2am cancels a case nobody had touched.
 *
 * A TIMER is a deadline and keeps the label rule set earlier: unqualified means
 * elapsed, because a customer's "2 days" includes the nights.
 */
describe("EMIE triggers outside working hours", () => {
  const diagram = (eventType: string, label = "Something"): DiagramData => ({
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      { id: "P", type: "pool", x: 0, y: 0, width: 900, height: 200, label: "Co", properties: {} },
      { id: "L", type: "lane", parentId: "P", x: 40, y: 0, width: 800, height: 200, label: "Sales Team", properties: {} },
      { id: "s", type: "start-event", parentId: "L", x: 60, y: 60, width: 36, height: 36, label: "Start", properties: {} },
      { id: "t", type: "task", parentId: "L", x: 200, y: 60, width: 100, height: 60, label: "Work", properties: { sim: { teamId: "Sales Team", cycleTime: { kind: "fixed", value: 30 } } } },
      { id: "b", type: "intermediate-event", boundaryHostId: "t", eventType, x: 240, y: 100, width: 36, height: 36, label, properties: { sim: { boundary: { trigger: { kind: "fixed", value: 60 } } } } },
      { id: "h", type: "task", parentId: "L", x: 400, y: 160, width: 100, height: 60, label: "Handle", properties: {} },
    ],
    connectors: [{ id: "c1", sourceId: "b", targetId: "h" }],
  } as unknown as DiagramData);

  const boundaryOf = (eventType: string, label?: string) => {
    const net = assembleFromDiagram(diagram(eventType, label), { teamCalendars: { "Sales Team": BH }, teamCapacities: { "Sales Team": 1 } });
    return net.nodes.find((n) => n.id === "t")?.boundaryEvents?.[0];
  };

  it("an ERROR trigger is gated to the host team's hours", () => {
    const be = boundaryOf("error", "Error");
    expect(be?.triggerMode).toBe("working");
    expect(be?.calendar, "gated by the HOST's team calendar").toEqual(BH);
  });

  it.each(["escalation", "conditional", "signal", "message"])("a %s trigger is gated too", (t) => {
    expect(boundaryOf(t)?.triggerMode).toBe("working");
  });

  it("a TIMER keeps the label rule — unqualified stays elapsed", () => {
    const be = boundaryOf("timer", "When 1 hour has elapsed");
    expect(be?.triggerMode, "a deadline runs on the wall clock").toBeUndefined();
    expect(be?.calendar).toBeUndefined();
  });
});

/**
 * Working-hours behaviour in the engine. These assert the *simulation* effect
 * of a WorkCalendar (not just the pure maths in calendar.test.ts): a team only
 * services work during its shift, in-service tasks finish at close, queued work
 * resumes at the next open, utilisation is measured against staffed time, and a
 * source only arrives during open windows with per-window rate multipliers.
 * A no-calendar / always-open model must be behaviourally unchanged (regression).
 */
import { describe, it, expect } from "vitest";
import { Engine } from "@/app/lib/simulation/engine";
import { isOpenAt } from "@/app/lib/simulation/calendar";
import type { SimNetwork } from "@/app/lib/simulation/model";
import type { SimRunConfig, WorkCalendar } from "@/app/lib/simulation/types";

const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig => ({
  clockUnit: "minute", horizon: 3 * 24 * 60, warmUp: 0, replications: 1, seed: 7, collectQueues: true, ...over,
});

// Mon–Fri 09:00–17:00.
const NINE_TO_FIVE: WorkCalendar = { intervals: [0, 1, 2, 3, 4].map((day) => ({ day, start: "09:00", end: "17:00" })) };
const DAY = 24 * 60;

/** source → task(team T) → sink; optional team/source calendars. */
function net(opts: { teamCal?: WorkCalendar; srcCal?: WorkCalendar; arrival: number; cycle: number; maxArrivals?: number }): SimNetwork {
  return {
    teams: [{ id: "T", capacity: 1, ...(opts.teamCal ? { calendar: opts.teamCal } : {}) }],
    nodes: [
      { id: "src", kind: "source", arrival: { kind: "fixed", value: opts.arrival }, maxArrivals: opts.maxArrivals, ...(opts.srcCal ? { calendar: opts.srcCal } : {}) },
      { id: "task", kind: "task", teamId: "T", units: 1, cycleTime: { kind: "fixed", value: opts.cycle } },
      { id: "sink", kind: "sink" },
    ],
    edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "sink" }],
  };
}

describe("engine — working calendars", () => {
  it("T0564 — a team on a 9–5 calendar only starts service during open hours", () => {
    // 24/7 arrivals, but the team is 9–5: every service must start in-hours.
    const e = new Engine(net({ teamCal: NINE_TO_FIVE, arrival: 37, cycle: 20 }), cfg(), undefined, { trace: true });
    e.run();
    const services = e.getTrace().filter((t) => t.kind === "service" && t.nodeId === "task");
    expect(services.length).toBeGreaterThan(5);
    for (const s of services) {
      expect(isOpenAt(s.t, NINE_TO_FIVE, "minute"), `service at t=${s.t} (tow=${s.t % DAY})`).toBe(true);
    }
  });

  it("T0565 — a token that arrives overnight queues and starts at 09:00", () => {
    // First (only) arrival at t=120 (Mon 02:00), team closed → queued until open.
    const e = new Engine(net({ teamCal: NINE_TO_FIVE, arrival: 120, cycle: 30, maxArrivals: 1 }), cfg(), undefined, { trace: true });
    e.run();
    const services = e.getTrace().filter((t) => t.kind === "service" && t.nodeId === "task");
    expect(services.length).toBe(1);
    expect(services[0].t).toBe(9 * 60); // Monday 09:00
  });

  it("T0566 — a calendar throttles throughput vs the same model run 24/7", () => {
    const c = cfg({ horizon: 7 * DAY });
    const open247 = new Engine(net({ arrival: 20, cycle: 15 }), c).run();
    const nineFive = new Engine(net({ teamCal: NINE_TO_FIVE, arrival: 20, cycle: 15 }), c).run();
    expect(nineFive.completed).toBeGreaterThan(0);
    // 40 staffed hours/week vs 168 → materially fewer completions.
    expect(nineFive.completed).toBeLessThan(open247.completed * 0.6);
  });

  it("T0567 — utilisation is measured against staffed time, not wall-clock", () => {
    // Heavy load saturates the server whenever it's open → util ≈ 1, NOT ~8/24.
    const r = new Engine(net({ teamCal: NINE_TO_FIVE, arrival: 5, cycle: 5 }), cfg({ horizon: 5 * DAY })).run();
    expect(r.perTeam.T.utilization).toBeGreaterThan(0.9);
  });

  it("T0568 — a per-window rate multiplier makes arrivals time-varying", () => {
    // Always open, but afternoons (12:00–24:00) run at 2× the morning rate.
    const peak: WorkCalendar = {
      intervals: [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
        { day, start: "00:00", end: "12:00", rate: 1 },
        { day, start: "12:00", end: "24:00", rate: 2 },
      ]),
    };
    const n: SimNetwork = {
      teams: [],
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "exponential", mean: 5 }, calendar: peak },
        { id: "sink", kind: "sink" },
      ],
      edges: [{ id: "e1", source: "src", target: "sink" }],
    };
    const e = new Engine(n, cfg({ horizon: 12 * DAY }), undefined, { trace: true });
    e.run();
    const spawns = e.getTrace().filter((t) => t.kind === "spawn").map((t) => ((t.t % DAY) + DAY) % DAY);
    const morning = spawns.filter((tow) => tow < 12 * 60).length;
    const afternoon = spawns.filter((tow) => tow >= 12 * 60).length;
    expect(morning).toBeGreaterThan(50);
    expect(afternoon / morning).toBeGreaterThan(1.6); // ≈ 2×, allow sampling slack
    expect(afternoon / morning).toBeLessThan(2.4);
  });

  it("T0569 — an empty calendar is a no-op (always-open regression guard)", () => {
    // A source with an empty calendar must behave identically to no calendar at all.
    const base: SimNetwork = {
      teams: [{ id: "T", capacity: 1 }],
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "exponential", mean: 10 } },
        { id: "task", kind: "task", teamId: "T", units: 1, cycleTime: { kind: "exponential", mean: 8 } },
        { id: "sink", kind: "sink" },
      ],
      edges: [{ id: "e1", source: "src", target: "task" }, { id: "e2", source: "task", target: "sink" }],
    };
    const withEmpty: SimNetwork = {
      ...base,
      teams: [{ id: "T", capacity: 1, calendar: { intervals: [] } }],
      nodes: base.nodes.map((n) => (n.id === "src" ? { ...n, calendar: { intervals: [] } } : n)),
    };
    const a = new Engine(base, cfg()).run();
    const b = new Engine(withEmpty, cfg()).run();
    expect(b.arrived).toBe(a.arrived);
    expect(b.completed).toBe(a.completed);
    expect(b.perTeam.T.utilization).toBeCloseTo(a.perTeam.T.utilization, 10);
  });
});

/**
 * The digital twin: mine timing/resource performance from traces, fit
 * distributions, derive a working calendar, and calibrate a runnable simulation
 * onto the discovered BPMN (cycle times, arrival, gateway branch probabilities,
 * teams). The mine→simulate bridge.
 */
import { describe, it, expect } from "vitest";
import { computePerformance } from "@/app/lib/mining/performance";
import { fitDuration, fitArrival, activeHoursToCalendar, calibrateSimulation } from "@/app/lib/mining/calibrateSimulation";
import { discoverProcess } from "@/app/lib/mining/discoverProcess";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { getSimParams } from "@/app/lib/diagram/simParams";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import type { CaseTrace, Variant, LogMapping } from "@/app/lib/mining/types";

const H = 3_600_000;
const ev = (activity: string, state: string, timestamp: number, resource: string) => ({ caseId: "x", activity, state, timestamp, resource });
// Two cases that overlap at t=0 (so alice's peak concurrency is 2).
const TRACES: CaseTrace[] = [
  { caseId: "1", events: [ev("Create", "Draft", 0, "alice"), ev("Do", "Doing", H, "alice"), ev("End", "Done", 3 * H, "alice")] },
  { caseId: "2", events: [ev("Create", "Draft", 0, "alice"), ev("Do", "Doing", 2 * H, "alice")] },
];

describe("performance mining", () => {
  it("T0600 — sojourn durations, resource concurrency, clock unit + active hours", () => {
    const p = computePerformance(TRACES);
    expect(p.clockUnit).toBe("hour");
    expect(p.activityDurations.Create).toEqual([1, 2]);   // Create took 1h (case1) + 2h (case2)
    expect(p.activityDurations.Do).toEqual([2]);          // case2's Do is last → no sojourn
    expect(p.resourceConcurrency.alice).toBe(2);          // both cases active at t=0
    expect(p.activityResource.Create).toBe("alice");
    expect(p.activeHours).toHaveLength(168);
    expect(p.activeHours.reduce((a, b) => a + b, 0)).toBe(5); // all 5 events bucketed
  });
});

describe("distribution fitting + calendar", () => {
  it("T0601 — fitDuration/fitArrival pick sensible SimDists; active hours → a calendar", () => {
    expect(fitDuration([])).toEqual({ kind: "fixed", value: 1 });
    expect(fitDuration([5, 5, 5])).toEqual({ kind: "fixed", value: 5 });   // constant → fixed
    expect(fitDuration([1, 2, 3, 4])).toEqual({ kind: "triangular", min: 1, mode: 2.5, max: 4 });
    expect(fitArrival([10, 20, 30])).toEqual({ kind: "exponential", mean: 20 });
    // Mon 09:00–11:00 active → a single open window.
    const hours = new Array(168).fill(0); hours[9] = 10; hours[10] = 10;
    expect(activeHoursToCalendar(hours).intervals).toEqual([{ day: 0, start: "09:00", end: "11:00" }]);
  });
});

describe("calibrate the twin", () => {
  it("T0602 — writes cycle time, arrival, gateway branch probabilities + a team library", () => {
    const variants: Variant[] = [
      { events: ["Create", "Submit", "Approve"], states: ["Draft", "Pending", "Approved"], count: 5 },
      { events: ["Create", "Submit", "Reject"], states: ["Draft", "Pending", "Rejected"], count: 2 },
    ];
    const { plan } = discoverProcess(variants);
    const data = layoutBpmnDiagram(plan.elements, plan.connections);
    const perf = {
      clockUnit: "hour" as const,
      activityDurations: { Create: [2], Submit: [1, 1], Approve: [3], Reject: [1] },
      interArrival: [10, 12, 8],
      activityResource: { Create: "alice", Submit: "alice", Approve: "bob", Reject: "bob" },
      resourceConcurrency: { alice: 2, bob: 1 },
      activeHours: new Array(168).fill(1),
    };
    const cal = calibrateSimulation(data, perf);

    const task = (label: string) => cal.data.elements.find((e) => e.type === "task" && e.label === label)!;
    expect(getSimParams(task("Create")).cycleTime).toEqual({ kind: "fixed", value: 2 });
    expect(getSimParams(task("Create")).teamId).toBe("alice");
    const start = cal.data.elements.find((e) => e.type === "start-event")!;
    expect(getSimParams(start).arrival?.kind).toBe("exponential");
    // The split after Submit → branch probabilities from the 5/2 frequencies (~71/29).
    const gwOut = cal.data.connectors.filter((c) => { const s = cal.data.elements.find((e) => e.id === c.sourceId); return s?.type === "gateway"; });
    const probs = gwOut.map((c) => c.branchProbability).filter((p): p is number => p !== undefined).sort((a, b) => a - b);
    expect(probs).toEqual([29, 71]);
    // Mined team library.
    expect(cal.teams).toEqual(expect.arrayContaining([{ name: "alice", capacity: 2 }, { name: "bob", capacity: 1 }]));
    expect(cal.clockUnit).toBe("hour");
  });

  it("T0685 — tasks with no mined resource fall back to their pool team, which is in the library", () => {
    const variants: Variant[] = [
      { events: ["Create", "Submit", "Approve"], states: ["Draft", "Pending", "Approved"], count: 5 },
    ];
    const { plan } = discoverProcess(variants);
    const data = layoutBpmnDiagram(plan.elements, plan.connections);
    // Only "Create" has a mined resource; Submit/Approve have none → pool fallback.
    const perf = {
      clockUnit: "hour" as const,
      activityDurations: { Create: [2], Submit: [1], Approve: [3] },
      interArrival: [10],
      activityResource: { Create: "alice" },
      resourceConcurrency: { alice: 1 },
      activeHours: new Array(168).fill(1),
    };
    const cal = calibrateSimulation(data, perf);
    const poolLabel = (cal.data.elements.find((e) => e.type === "pool")?.label ?? "").trim();
    expect(poolLabel).toBeTruthy();

    const task = (label: string) => cal.data.elements.find((e) => e.type === "task" && e.label === label)!;
    expect(getSimParams(task("Create")).teamId).toBe("alice");        // resource wins
    expect(getSimParams(task("Submit")).teamId).toBe(poolLabel);      // no resource → pool team
    expect(getSimParams(task("Approve")).teamId).toBe(poolLabel);
    // Every task is team-assigned, and every referenced team is in the library.
    const taskTeams = cal.data.elements.filter((e) => e.type === "task").map((e) => getSimParams(e).teamId);
    expect(taskTeams.every((t) => typeof t === "string" && t)).toBe(true);
    const libNames = new Set(cal.teams.map((t) => t.name));
    for (const t of taskTeams) expect(libNames.has(t!)).toBe(true);   // no orphan team → run needs no fix-up
    expect(libNames.has(poolLabel)).toBe(true);
  });

  it("T0603 — the whole pipeline yields a twin that actually simulates (completes work)", () => {
    const HEADERS = ["case", "activity", "ts", "state", "user"];
    const MAP: LogMapping = { caseId: "case", activity: "activity", timestamp: "ts", state: "state", resource: "user" };
    const ROWS = [
      ["1", "Create", "2026-01-01T09:00:00Z", "Draft", "alice"], ["1", "Submit", "2026-01-01T09:30:00Z", "Pending", "alice"], ["1", "Approve", "2026-01-01T10:00:00Z", "Approved", "bob"],
      ["2", "Create", "2026-01-01T11:00:00Z", "Draft", "alice"], ["2", "Submit", "2026-01-01T11:30:00Z", "Pending", "alice"], ["2", "Approve", "2026-01-01T12:00:00Z", "Approved", "bob"],
      ["3", "Create", "2026-01-01T13:00:00Z", "Draft", "alice"], ["3", "Submit", "2026-01-01T13:30:00Z", "Pending", "alice"], ["3", "Reject", "2026-01-01T14:00:00Z", "Rejected", "bob"],
    ];
    const log = buildEventLog(HEADERS, ROWS, MAP);
    const perf = computePerformance(log.traces);
    const { plan } = discoverProcess(log.variants);
    const data = layoutBpmnDiagram(plan.elements, plan.connections);
    const cal = calibrateSimulation(data, perf);

    const net = assembleFromDiagram(cal.data, { teamCapacities: Object.fromEntries(cal.teams.map((t) => [t.name, t.capacity])) });
    const { stats } = runMonteCarlo(net, { clockUnit: cal.clockUnit, horizon: 5000, warmUp: 0, replications: 2, seed: 1, collectQueues: true });
    expect(stats.completed.mean).toBeGreaterThan(0);   // the mined twin runs + cases flow through
  });
});

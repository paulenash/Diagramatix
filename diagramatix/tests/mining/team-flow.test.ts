/**
 * Phase 7 — who hands work to whom, and who does the same thing three times.
 *
 * Two of these tests exist because the review was wrong, and both errors would
 * have shipped a confident wrong number rather than a missing one:
 *
 *  - a handover map built from each activity's DOMINANT team is wrong exactly
 *    where it matters — on activities more than one team performs — so it is
 *    computed from per-event teams when they exist, and labelled when they do
 *    not (T3847, T3848);
 *  - `pingPongFromVariants` reads app names out of activity labels and returns
 *    0 on any business log (T3850), so team ping-pong is a different function
 *    over different data (T3845).
 */
import { describe, it, expect } from "vitest";
import { computeTeamFlow, reworkFrom } from "@/app/lib/mining/teamFlow";
import { pingPongFromVariants, detectReworkActivities } from "@/app/lib/mining/taskMining/insights";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { LogMapping } from "@/app/lib/mining/types";

const HOUR = 3_600_000, DAY = 86_400_000;
const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", resource: "who" };
const HEADERS = ["case", "act", "ts", "who"];

/**
 * Five cases that bounce: Ops raises it, Finance checks, Ops fixes, Finance
 * approves. Two teams, one case bouncing back — the shape this phase is for.
 * The Finance → Ops hand-off deliberately costs a day; the others cost an hour.
 */
function bouncing() {
  const rows: string[][] = [];
  const at = (d: number, h: number) => new Date(Date.parse("2026-08-01T00:00:00Z") + d * DAY + h * HOUR).toISOString();
  for (let i = 0; i < 5; i++) {
    rows.push([`c${i}`, "Raise", at(i, 0), "Ops"]);
    rows.push([`c${i}`, "Check", at(i, 1), "Finance"]);        // Ops → Finance, 1h
    rows.push([`c${i}`, "Fix", at(i, 25), "Ops"]);             // Finance → Ops, 24h
    rows.push([`c${i}`, "Approve", at(i, 26), "Finance"]);     // Ops → Finance, 1h
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { analytics: computeAnalytics(log), variants: log.variants };
}

describe("Phase 7 — the handover map", () => {
  it("T3842 - hand-offs are counted between teams, in both directions", () => {
    const { analytics, variants } = bouncing();
    const f = computeTeamFlow(analytics, variants);
    expect(f.basis).toBe("exact");
    const opsToFin = f.handovers.find((h) => h.from === "Ops" && h.to === "Finance")!;
    const finToOps = f.handovers.find((h) => h.from === "Finance" && h.to === "Ops")!;
    expect(opsToFin.count).toBe(10);            // twice per case, five cases
    expect(finToOps.count).toBe(5);
  });

  it("T3843 - ranked by what the hand-off COSTS, not how often it happens", () => {
    // Finance → Ops happens half as often and costs a day each time. That is the
    // finding; ranking by frequency would bury it.
    const f = computeTeamFlow(...Object.values(bouncing()) as [RunAnalytics, ReturnType<typeof bouncing>["variants"]]);
    expect(f.handovers[0].from).toBe("Finance");
    expect(f.handovers[0].to).toBe("Ops");
    expect(f.handovers[0].medianGapMs).toBe(24 * HOUR);
    expect(f.handovers[0].totalGapMs).toBe(5 * 24 * HOUR);
  });

  it("T3844 - work staying inside one team is not a hand-off", () => {
    const rows = [
      ["c1", "A", "2026-08-01T00:00:00Z", "Ops"],
      ["c1", "B", "2026-08-01T01:00:00Z", "Ops"],
      ["c1", "C", "2026-08-01T02:00:00Z", "Finance"],
    ];
    const log = buildEventLog(HEADERS, rows, MAPPING);
    const f = computeTeamFlow(computeAnalytics(log), log.variants);
    expect(f.handovers).toHaveLength(1);
    expect(f.handovers[0]).toMatchObject({ from: "Ops", to: "Finance" });
  });

  it("T3845 - TEAM ping-pong is measured: the case came back to a team it had left", () => {
    const { analytics, variants } = bouncing();
    const f = computeTeamFlow(analytics, variants);
    expect(f.pingPong).toHaveLength(1);
    expect([f.pingPong[0].a, f.pingPong[0].b].sort()).toEqual(["Finance", "Ops"]);
    expect(f.pingPong[0].cases).toBe(5);
    expect(f.pingPong[0].bounces).toBe(10);     // Ops-Fin-Ops and Fin-Ops-Fin, per case
  });

  it("T3846 - a process that never doubles back reports no ping-pong", () => {
    const rows = [
      ["c1", "A", "2026-08-01T00:00:00Z", "Ops"],
      ["c1", "B", "2026-08-01T01:00:00Z", "Finance"],
      ["c1", "C", "2026-08-01T02:00:00Z", "Legal"],
    ];
    const log = buildEventLog(HEADERS, rows, MAPPING);
    expect(computeTeamFlow(computeAnalytics(log), log.variants).pingPong).toEqual([]);
  });
});

describe("Phase 7 — what the fallback map is allowed to claim", () => {
  it("T3847 - without per-event teams the map is APPROXIMATE and says so", () => {
    const { analytics, variants } = bouncing();
    const countsOnly: RunAnalytics = { ...analytics, detail: "counts" };
    const f = computeTeamFlow(countsOnly, variants);
    expect(f.basis).toBe("approximate");
    expect(f.note).toMatch(/Approximate/);
    expect(f.note).toMatch(/most often/);
    // And it does not invent a median for a join it cannot measure.
    expect(f.handovers.every((h) => h.medianGapMs === null)).toBe(true);
  });

  it("T3848 - the fallback names the multi-team activities that make it a guess", () => {
    // The precise correction to the review: attributing every step to its most
    // frequent team invents hand-offs on exactly the activities the Activities
    // tab already flags amber, so the size of the doubt is reported.
    const rows = [
      ["c1", "Shared", "2026-08-01T00:00:00Z", "Ops"],
      ["c1", "End", "2026-08-01T01:00:00Z", "Ops"],
      ["c2", "Shared", "2026-08-02T00:00:00Z", "Finance"],   // same activity, other team
      ["c2", "End", "2026-08-02T01:00:00Z", "Ops"],
    ];
    const log = buildEventLog(HEADERS, rows, MAPPING);
    const f = computeTeamFlow({ ...computeAnalytics(log), detail: "counts" }, log.variants);
    expect(f.multiTeamActivities).toBe(1);
    expect(f.note).toMatch(/1 activity is performed by more than one team/);
    expect(f.note).toMatch(/exactly where this is wrong/);
  });

  it("T3849 - ping-pong is OMITTED in fallback mode, never reported as zero", () => {
    // A zero would be a claim that the process does not bounce. The truth is
    // that it cannot be measured, and those are different sentences.
    const { analytics, variants } = bouncing();
    const f = computeTeamFlow({ ...analytics, detail: "counts" }, variants);
    expect(f.pingPong).toEqual([]);
    expect(f.note).toMatch(/not shown rather than shown as zero/);
  });

  it("T3850 - a log with no teams at all says so, and does not draw an empty map", () => {
    const log = buildEventLog(["case", "act", "ts"], [
      ["c1", "A", "2026-08-01T00:00:00Z"],
      ["c1", "B", "2026-08-01T01:00:00Z"],
    ], { caseId: "case", activity: "act", timestamp: "ts" } as LogMapping);
    const f = computeTeamFlow(computeAnalytics(log), log.variants);
    expect(f.basis).toBe("none");
    expect(f.handovers).toEqual([]);
    expect(f.note).toMatch(/Map a resource column/);
  });

  it("T3851 - no analytics is an honest empty rather than a throw", () => {
    expect(computeTeamFlow(null, []).basis).toBe("none");
  });
});

describe("Phase 7 — the review's ping-pong function really does return 0 here", () => {
  it("T3852 - the app-based ping-pong reports nothing on a business log", () => {
    // Not a criticism of that function — it is for task logs and works there.
    // Pinned because widening its TRIGGER to business logs, as the review
    // proposed, would have shipped a confident zero on every one of them.
    const { variants } = bouncing();
    expect(pingPongFromVariants(variants)).toBe(0);
    expect(computeTeamFlow(bouncing().analytics, variants).pingPong[0].bounces).toBeGreaterThan(0);
  });
});

describe("Phase 7 — rework, which needed no correction", () => {
  it("T3853 - an activity repeating within a case is rework, on any log", () => {
    const rows = [
      ["c1", "Raise", "2026-08-01T00:00:00Z", "Ops"],
      ["c1", "Credit check", "2026-08-01T01:00:00Z", "Finance"],
      ["c1", "Credit check", "2026-08-01T02:00:00Z", "Finance"],
      ["c1", "Credit check", "2026-08-01T03:00:00Z", "Finance"],
      ["c1", "Close", "2026-08-01T04:00:00Z", "Ops"],
    ];
    const log = buildEventLog(HEADERS, rows, MAPPING);
    const r = reworkFrom(log.variants);
    expect(r).toHaveLength(1);
    expect(r[0].activity).toBe("Credit check");
    expect(r[0].cases).toBe(1);
    expect(r[0].perCase).toBe(3);           // "runs 3× per case"
    // The existing label-agnostic function agrees about WHICH activity.
    expect(detectReworkActivities(log.variants).map((x) => x.activity)).toEqual(["Credit check"]);
  });

  it("T3854 - an activity that happens once per case is not rework", () => {
    const { variants } = bouncing();
    expect(reworkFrom(variants)).toEqual([]);
  });

  it("T3855 - the per-case rate is over the cases that HAVE the step", () => {
    // Two cases: one checks twice, one checks once. The rate is 1.5, not 0.75 —
    // averaging over cases that never do it understates every rework figure.
    const rows = [
      ["c1", "Check", "2026-08-01T00:00:00Z", "Ops"],
      ["c1", "Check", "2026-08-01T01:00:00Z", "Ops"],
      ["c1", "Close", "2026-08-01T02:00:00Z", "Ops"],
      ["c2", "Check", "2026-08-02T00:00:00Z", "Ops"],
      ["c2", "Close", "2026-08-02T01:00:00Z", "Ops"],
    ];
    const log = buildEventLog(HEADERS, rows, MAPPING);
    const r = reworkFrom(log.variants).find((x) => x.activity === "Check")!;
    expect(r.cases).toBe(1);
    expect(r.perCase).toBe(1.5);
  });
});

describe("Phase 7 — workload", () => {
  it("T3856 - each team's share is of the time actually recorded against it", () => {
    const { analytics, variants } = bouncing();
    const f = computeTeamFlow(analytics, variants);
    const total = f.loads.reduce((s, l) => s + l.share, 0);
    expect(total).toBeCloseTo(1, 5);
    // Finance holds the case for the 24h before Ops fixes it — the bigger share.
    expect(f.loads[0].team).toBe("Finance");
    expect(f.loads[0].cases).toBe(5);
  });
});

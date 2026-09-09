/**
 * Phase 0.4 — a test floor under `performance.ts`.
 *
 * This module had no unit coverage at all, and it is the one that turns a log
 * into the simulation twin: activity durations, arrival rate, team capacity and
 * the working calendar. Every number the Simulator shows for a mined process
 * starts here, so a quiet change to it is a quiet change to a business case.
 */
import { describe, it, expect } from "vitest";
import { computePerformance } from "@/app/lib/mining/performance";
import type { CaseTrace, LogEvent } from "@/app/lib/mining/types";

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

/** A case whose events are (activity, offset-from-t0-in-ms, resource?). */
function trace(caseId: string, t0: number, steps: [string, number, string?][]): CaseTrace {
  return {
    caseId,
    events: steps.map(([activity, off, resource]): LogEvent => ({
      caseId, activity, timestamp: t0 + off, state: activity, ...(resource ? { resource } : {}),
    })),
  };
}

const T0 = Date.parse("2026-01-05T09:00:00Z");   // a Monday, 09:00 UTC

describe("Phase 0.4 — an activity's duration is its sojourn time", () => {
  it("T3692 - a step lasts until the NEXT event, not until its own end", () => {
    // There is no end timestamp in an event log. "Review" occupies the two hours
    // between itself and "Approve", and the LAST event of a case has no duration
    // at all — counting it as zero would drag every median down.
    const p = computePerformance([trace("c1", T0, [["Review", 0], ["Approve", 2 * HOUR], ["Close", 3 * HOUR]])]);
    expect(p.clockUnit).toBe("hour");
    expect(p.activityDurations.Review).toEqual([2]);
    expect(p.activityDurations.Approve).toEqual([1]);
    expect(p.activityDurations.Close).toBeUndefined();
  });

  it("T3693 - an out-of-order pair is discarded, not counted as negative time", () => {
    // Two systems with clocks a few seconds apart really do produce these.
    const p = computePerformance([trace("c1", T0, [["A", 0], ["B", -HOUR], ["C", 2 * HOUR]])]);
    expect(p.activityDurations.A).toBeUndefined();          // A→B was negative
    expect(p.activityDurations.B).toEqual([3]);             // B→C is 3 hours
  });

  it("T3694 - the clock unit follows the DATA, so durations stay human-scaled", () => {
    const seconds = computePerformance([trace("c1", T0, [["A", 0], ["B", 30_000]])]);
    expect(seconds.clockUnit).toBe("second");
    expect(seconds.activityDurations.A).toEqual([30]);

    const days = computePerformance([trace("c1", T0, [["A", 0], ["B", 4 * DAY]])]);
    expect(days.clockUnit).toBe("day");
    expect(days.activityDurations.A).toEqual([4]);
  });

  it("T3695 - an empty log produces a usable shape, not a crash", () => {
    const p = computePerformance([]);
    expect(p.activityDurations).toEqual({});
    expect(p.interArrival).toEqual([]);
    expect(p.activeHours).toHaveLength(168);
  });
});

describe("Phase 0.4 — arrivals", () => {
  it("T3696 - inter-arrival is between case STARTS, in arrival order", () => {
    // Cases are handed in whatever order the log had them; the gaps are between
    // first events sorted by time, or the arrival rate is nonsense.
    const p = computePerformance([
      trace("c3", T0 + 5 * HOUR, [["A", 0], ["B", HOUR]]),
      trace("c1", T0, [["A", 0], ["B", HOUR]]),
      trace("c2", T0 + 2 * HOUR, [["A", 0], ["B", HOUR]]),
    ]);
    expect(p.interArrival).toEqual([2, 3]);      // 09:00 → 11:00 → 14:00
  });

  it("T3697 - one case has no inter-arrival, rather than a zero", () => {
    // A zero here would tell the Simulator cases arrive instantaneously.
    expect(computePerformance([trace("c1", T0, [["A", 0], ["B", HOUR]])]).interArrival).toEqual([]);
  });
});

describe("Phase 0.4 — resources become teams", () => {
  it("T3698 - team capacity is the MAXIMUM simultaneous cases, not the count", () => {
    // Three cases held by Finance, overlapping two at a time. Capacity 3 would
    // over-resource the twin and hide the queue the log actually contains.
    const p = computePerformance([
      trace("c1", T0, [["Check", 0, "Finance"], ["Done", 2 * HOUR]]),
      trace("c2", T0 + HOUR, [["Check", 0, "Finance"], ["Done", 2 * HOUR]]),
      trace("c3", T0 + 6 * HOUR, [["Check", 0, "Finance"], ["Done", 2 * HOUR]]),
    ]);
    expect(p.resourceConcurrency.Finance).toBe(2);
  });

  it("T3699 - back-to-back work needs one person, not two", () => {
    // An interval ending exactly as the next begins must not count as overlap.
    const p = computePerformance([
      trace("c1", T0, [["Check", 0, "Finance"], ["Done", HOUR]]),
      trace("c2", T0 + HOUR, [["Check", 0, "Finance"], ["Done", HOUR]]),
    ]);
    expect(p.resourceConcurrency.Finance).toBe(1);
  });

  it("T3700 - capacity is never zero, even for a single instant of work", () => {
    const p = computePerformance([trace("c1", T0, [["Check", 0, "Finance"]])]);
    expect(p.resourceConcurrency.Finance).toBe(1);
  });

  it("T3701 - an activity is attributed to the team that does it MOST", () => {
    const p = computePerformance([
      trace("c1", T0, [["Check", 0, "Finance"], ["End", HOUR]]),
      trace("c2", T0, [["Check", 0, "Finance"], ["End", HOUR]]),
      trace("c3", T0, [["Check", 0, "Ops"], ["End", HOUR]]),
    ]);
    expect(p.activityResource.Check).toBe("Finance");
  });

  it("T3702 - an unattributed event contributes no team at all", () => {
    // Inventing a team here is how a simulation acquires resources nobody drew.
    const p = computePerformance([trace("c1", T0, [["Check", 0], ["End", HOUR]])]);
    expect(p.activityResource).toEqual({});
    expect(p.resourceConcurrency).toEqual({});
  });
});

describe("Phase 0.4 — the working calendar", () => {
  it("T3703 - the hour histogram is Monday-first and counts every event", () => {
    // JS puts Sunday at 0; a calendar built on that is shifted by a day, and the
    // twin then works weekends.
    const p = computePerformance([trace("c1", T0, [["A", 0], ["B", HOUR], ["C", 2 * HOUR]])]);
    expect(p.activeHours[0 * 24 + 9]).toBe(1);     // Monday 09:00
    expect(p.activeHours[0 * 24 + 10]).toBe(1);
    expect(p.activeHours[0 * 24 + 11]).toBe(1);
    expect(p.activeHours.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("T3704 - a Sunday event lands in the last day of the week, not the first", () => {
    const sunday = Date.parse("2026-01-04T14:00:00Z");
    const p = computePerformance([trace("c1", sunday, [["A", 0], ["B", MIN]])]);
    expect(p.activeHours[6 * 24 + 14]).toBe(2);
  });
});

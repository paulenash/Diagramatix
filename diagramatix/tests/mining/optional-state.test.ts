/**
 * Change A — a log with NO state column still mines: buildEventLog derives each
 * event's state from the Activity→State table (defaulting to the activity name),
 * so classic 3-column logs and the State Machine both work.
 */
import { describe, it, expect } from "vitest";
import { buildEventLog, distinctActivities } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

const HEADERS = ["case", "activity", "ts"];
const ROWS = [
  ["1", "Log Ticket", "2026-01-01T09:00:00Z"],
  ["1", "Resolve", "2026-01-01T10:00:00Z"],
  ["2", "Log Ticket", "2026-01-02T09:00:00Z"],
  ["2", "Resolve", "2026-01-02T10:00:00Z"],
];

describe("optional state (Change A)", () => {
  it("T0639 — no state column → state defaults to the activity name", () => {
    const mapping: LogMapping = { caseId: "case", activity: "activity", timestamp: "ts" };
    const log = buildEventLog(HEADERS, ROWS, mapping);
    expect(log.stats.cases).toBe(2);
    // each event's state mirrors its activity
    expect(log.traces[0].events.map((e) => e.state)).toEqual(["Log Ticket", "Resolve"]);
    expect(log.stats.states).toEqual(["Log Ticket", "Resolve"]);
    // one variant (both cases identical), states in lockstep with events
    expect(log.variants).toHaveLength(1);
    expect(log.variants[0].states).toEqual(["Log Ticket", "Resolve"]);
  });

  it("T0640 — Activity→State table supplies the lifecycle + distinctActivities seeds it", () => {
    const mapping: LogMapping = {
      caseId: "case", activity: "activity", timestamp: "ts",
      activityState: { "Log Ticket": "Logged", "Resolve": "Resolved" },
    };
    const log = buildEventLog(HEADERS, ROWS, mapping);
    expect(log.stats.states).toEqual(["Logged", "Resolved"]);
    expect(log.variants[0].states).toEqual(["Logged", "Resolved"]);
    // the table seed = distinct activities in first-seen order
    expect(distinctActivities(HEADERS, ROWS, "activity")).toEqual(["Log Ticket", "Resolve"]);
  });
});

/**
 * Event-log ingestion guards: the dependency-free CSV parser, column-role
 * guessing, timestamp parsing, and normalisation into per-entity traces +
 * compressed variants. This is the front door of Process Mining — everything
 * downstream (discovery, conformance, simulator calibration) trusts its output.
 */
import { describe, it, expect } from "vitest";
import { parseCsv, guessMapping, parseTimestamp, excelSerialToMs, buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

describe("event-log parsing", () => {
  it("T0584 — parseCsv handles quotes, embedded delimiters, CRLF, BOM + delimiter detection", () => {
    const csv = '﻿case,activity,note\r\n1,"Submit, final","he said ""ok"""\r\n2,Approve,plain\r\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["case", "activity", "note"]);
    expect(rows).toEqual([["1", "Submit, final", 'he said "ok"'], ["2", "Approve", "plain"]]);
    // semicolon-delimited export
    const semi = parseCsv("a;b;c\n1;2;3");
    expect(semi.headers).toEqual(["a", "b", "c"]);
    expect(semi.rows).toEqual([["1", "2", "3"]]);
  });

  it("T0585 — guessMapping picks sensible columns from header names", () => {
    const g = guessMapping(["Invoice ID", "Event", "Timestamp", "Status", "Performed By"]);
    expect(g.caseId).toBe("Invoice ID");
    expect(g.activity).toBe("Event");
    expect(g.timestamp).toBe("Timestamp");
    expect(g.state).toBe("Status");
    expect(g.resource).toBe("Performed By");
  });

  it("T0586 — parseTimestamp accepts ISO + epoch seconds/millis, rejects junk", () => {
    expect(parseTimestamp("2026-01-01T09:00:00Z")).toBe(Date.parse("2026-01-01T09:00:00Z"));
    expect(parseTimestamp("1700000000")).toBe(1700000000 * 1000);   // epoch seconds
    expect(parseTimestamp("1700000000000")).toBe(1700000000000);     // epoch millis
    expect(parseTimestamp("not a date")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
  });

  it("T0617 — Excel serial dates convert; the range guard rejects id-like numbers", () => {
    expect(parseTimestamp("45658")).toBe(Date.UTC(2025, 0, 1));          // serial 45658 = 2025-01-01
    expect(parseTimestamp("45658.375")).toBe(Date.UTC(2025, 0, 1, 9));   // .375 day = 09:00
    expect(excelSerialToMs(32874)).toBe(Date.UTC(1990, 0, 1));           // lower bound of the accepted range
    expect(excelSerialToMs(5)).toBeNull();                               // below range → not a date (avoids id false-positives)
    expect(excelSerialToMs(100000)).toBeNull();                          // above range (~year 2143)
  });

  const MAP: LogMapping = { caseId: "case", activity: "activity", timestamp: "ts", state: "state", resource: "user" };
  const HEADERS = ["case", "activity", "ts", "state", "user"];
  // Case 1 + 2 share a variant; case 3 differs. Case 1 rows are out of time order
  // on input to prove sorting.
  const ROWS = [
    ["1", "Approve", "2026-01-01T11:00:00Z", "Approved", "bob"],
    ["1", "Create", "2026-01-01T09:00:00Z", "Draft", "alice"],
    ["1", "Submit", "2026-01-01T10:00:00Z", "Pending", "alice"],
    ["2", "Create", "2026-01-02T09:00:00Z", "Draft", "alice"],
    ["2", "Submit", "2026-01-02T09:30:00Z", "Pending", "alice"],
    ["2", "Approve", "2026-01-02T10:00:00Z", "Approved", "carol"],
    ["3", "Create", "2026-01-03T09:00:00Z", "Draft", "alice"],
    ["3", "Reject", "2026-01-03T09:30:00Z", "Rejected", "bob"],
    ["", "Orphan", "2026-01-03T09:30:00Z", "X", "z"],       // dropped: no case id
    ["4", "Bad", "not-a-date", "Y", "z"],                    // dropped: bad timestamp
  ];

  it("T0587 — buildEventLog groups by case, sorts by time, drops unmapped rows", () => {
    const log = buildEventLog(HEADERS, ROWS, MAP);
    expect(log.stats.cases).toBe(3);
    expect(log.stats.events).toBe(8);
    expect(log.stats.unmappedRows).toBe(2);
    const c1 = log.traces.find((t) => t.caseId === "1")!;
    expect(c1.events.map((e) => e.activity)).toEqual(["Create", "Submit", "Approve"]); // sorted by time
    expect(log.stats.activities).toEqual(["Approve", "Create", "Reject", "Submit"]);
    expect(log.stats.states).toEqual(["Approved", "Draft", "Pending", "Rejected"]);
  });

  it("T0588 — identical traces compress to one variant with a frequency count", () => {
    const log = buildEventLog(HEADERS, ROWS, MAP);
    expect(log.stats.variants).toBe(2);            // {Create/Submit/Approve}×2 and {Create/Reject}×1
    expect(log.variants[0].count).toBe(2);         // most frequent first
    expect(log.variants[0].events).toEqual(["Create", "Submit", "Approve"]);
    expect(log.variants[0].states).toEqual(["Draft", "Pending", "Approved"]);
    expect(log.variants[1].count).toBe(1);
    expect(log.variants[1].states).toEqual(["Draft", "Rejected"]);
  });
});

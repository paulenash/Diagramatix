/**
 * Phase 2 — wide exports, the shape most status reports actually come in.
 *
 * The parser assumes one row is one event. A wide row — the whole lifecycle
 * spread across `state1, state1 timestamp, state2, state2 timestamp, …` —
 * produced ONE event and the rest of the row was silently dropped. The import
 * succeeded, every case appeared to have had a single step, and nothing said
 * otherwise.
 *
 * That is what makes this worth a phase of its own: it is not a crash, it is a
 * confident wrong answer, and its wrongness is invisible in every downstream
 * view. So these tests care as much about what is REFUSED as what is expanded.
 */
import { describe, it, expect } from "vitest";
import { detectWideSpec, unpivotWide, describeWideSpec } from "@/app/lib/mining/wideFormat";
import { buildEventLog, guessMapping } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

// Paul's shape, verbatim.
const WIDE = ["Row ID", "Case Name", "Case ID", "state1", "state1 timestamp", "state2", "state2 timestamp", "state3", "state3 timestamp"];
const WIDE_ROWS = [
  ["1", "Acme order", "C-1", "Received", "2026-02-01T09:00:00Z", "Approved", "2026-02-02T09:00:00Z", "Shipped", "2026-02-04T09:00:00Z"],
  ["2", "Beta order", "C-2", "Received", "2026-02-01T10:00:00Z", "Approved", "2026-02-03T10:00:00Z", "", ""],
  ["3", "Gamma order", "C-3", "Received", "2026-02-02T11:00:00Z", "", "", "", ""],
];

// The other common shape: the header names the step, the cell is just the date.
const MILE = ["Order", "Submitted On", "Approved On", "Shipped On"];
const MILE_ROWS = [
  ["O-1", "2026-03-01T09:00:00Z", "2026-03-02T09:00:00Z", "2026-03-05T09:00:00Z"],
  ["O-2", "2026-03-01T10:00:00Z", "", ""],
];

describe("Phase 2 — recognising a wide export", () => {
  it("T3631 - a state/date paired export is recognised, and keyed on the case id", () => {
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    expect(spec).toBeTruthy();
    expect(spec.pairs).toEqual([
      { state: "state1", timestamp: "state1 timestamp" },
      { state: "state2", timestamp: "state2 timestamp" },
      { state: "state3", timestamp: "state3 timestamp" },
    ]);
    // "Case ID" over "Row ID" — both match the id pattern, the case one wins.
    expect(spec.caseId).toBe("Case ID");
    // Everything unclaimed rides along on every event of the case.
    expect(spec.carry).toContain("Case Name");
  });

  it("T3632 - milestone columns are recognised, and the header becomes the step", () => {
    const spec = detectWideSpec(MILE, MILE_ROWS)!;
    expect(spec.pairs).toEqual([]);
    expect(spec.milestones).toEqual(["Submitted On", "Approved On", "Shipped On"]);
    expect(spec.caseId).toBe("Order");
  });

  it("T3633 - an ordinary LONG log is not mistaken for a wide one", () => {
    // The expensive false positive: silently restructuring a log that was
    // already correct. One date column is a long log, whatever else is present.
    const long = ["Case", "Activity", "Timestamp", "Resource"];
    const rows = [
      ["c1", "Receive", "2026-01-01T09:00:00Z", "Ann"],
      ["c1", "Approve", "2026-01-02T09:00:00Z", "Bob"],
      ["c2", "Receive", "2026-01-01T10:00:00Z", "Ann"],
    ];
    expect(detectWideSpec(long, rows)).toBeNull();
  });

  it("T3634 - detection reads the DATA, not the header names", () => {
    // A column called "Stage 2 Date" holding "in progress" is not a date column,
    // and a header can be called anything.
    const headers = ["Ref", "Stage 1", "Stage 1 Date", "Stage 2", "Stage 2 Date"];
    const rows = [["r1", "Open", "not recorded", "Closed", "also not a date"]];
    expect(detectWideSpec(headers, rows)).toBeNull();
  });
});

describe("Phase 2 — expanding it", () => {
  it("T3635 - every state on the row becomes its own event", () => {
    // The bug, stated as an assertion: this row used to yield ONE event.
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    const out = unpivotWide(WIDE, WIDE_ROWS, spec);
    expect(out.cases).toBe(3);
    expect(out.events).toBe(6);              // 3 + 2 + 1
    expect(out.rows.filter((r) => r[0] === "C-1").map((r) => r[1]))
      .toEqual(["Received", "Approved", "Shipped"]);
  });

  it("T3636 - a step the case never reached is simply absent, not an empty event", () => {
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    const out = unpivotWide(WIDE, WIDE_ROWS, spec);
    expect(out.rows.filter((r) => r[0] === "C-3")).toHaveLength(1);
    expect(out.warnings).toEqual([]);        // blank pairs are normal, not a problem
  });

  it("T3637 - events are ordered by TIME, not by column order", () => {
    // A spreadsheet's column order is a layout decision, not a claim about
    // sequence. A lifecycle laid out backwards is still a lifecycle.
    const rows = [["9", "Odd", "C-9", "Shipped", "2026-02-09T09:00:00Z", "Received", "2026-02-01T09:00:00Z", "", ""]];
    const spec = detectWideSpec(WIDE, [...WIDE_ROWS, ...rows])!;
    const out = unpivotWide(WIDE, rows, spec);
    expect(out.rows.map((r) => r[1])).toEqual(["Received", "Shipped"]);
  });

  it("T3638 - carried columns ride on every event of the case", () => {
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    const out = unpivotWide(WIDE, WIDE_ROWS, spec);
    const nameAt = out.headers.indexOf("Case Name");
    expect(out.rows.filter((r) => r[0] === "C-1").map((r) => r[nameAt]))
      .toEqual(["Acme order", "Acme order", "Acme order"]);
  });

  it("T3639 - milestone headers lose their date suffix, so the step reads as a step", () => {
    const spec = detectWideSpec(MILE, MILE_ROWS)!;
    const out = unpivotWide(MILE, MILE_ROWS, spec);
    expect(out.rows.map((r) => r[1])).toEqual(["Submitted", "Approved", "Shipped", "Submitted"]);
  });
});

describe("Phase 2 — what it refuses to guess", () => {
  it("T3640 - a state with no date is REPORTED, not placed at the epoch", () => {
    // Inventing a position in the sequence would corrupt every duration
    // downstream, and nothing later could detect it.
    const rows = [["1", "n", "C-1", "Received", "", "Approved", "2026-02-02T09:00:00Z", "", ""]];
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    const out = unpivotWide(WIDE, rows, spec);
    expect(out.events).toBe(1);
    expect(out.warnings.join(" ")).toMatch(/no date/);
  });

  it("T3641 - a date with no state names nothing, and says so", () => {
    const rows = [["1", "n", "C-1", "", "2026-02-01T09:00:00Z", "Approved", "2026-02-02T09:00:00Z", "", ""]];
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    const out = unpivotWide(WIDE, rows, spec);
    expect(out.events).toBe(1);
    expect(out.warnings.join(" ")).toMatch(/no state/);
  });

  it("T3642 - an unreadable date is skipped and counted", () => {
    const rows = [["1", "n", "C-1", "Received", "not a date", "Approved", "2026-02-02T09:00:00Z", "", ""]];
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    const out = unpivotWide(WIDE, rows, spec);
    expect(out.events).toBe(1);
    expect(out.warnings.join(" ")).toMatch(/could not be read/);
  });

  it("T3643 - a row with no case id cannot be attributed, and is counted", () => {
    const rows = [["1", "n", "", "Received", "2026-02-01T09:00:00Z", "", "", "", ""]];
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    const out = unpivotWide(WIDE, rows, spec);
    expect(out.events).toBe(0);
    expect(out.warnings.join(" ")).toMatch(/no case id/);
  });
});

describe("Phase 2 — the expanded log feeds the ordinary pipeline unchanged", () => {
  it("T3644 - guessMapping finds the columns without the user intervening", () => {
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    const out = unpivotWide(WIDE, WIDE_ROWS, spec);
    const guess = guessMapping(out.headers);
    expect(guess.caseId).toBe("Case ID");
    expect(guess.activity).toBe("Activity");
    expect(guess.timestamp).toBe("Timestamp");
    expect(guess.state).toBe("State");
  });

  it("T3645 - and buildEventLog mines it into the lifecycle the row described", () => {
    // The whole point: three states on one row become a three-step case with
    // real durations, which is what every view downstream needs.
    const spec = detectWideSpec(WIDE, WIDE_ROWS)!;
    const out = unpivotWide(WIDE, WIDE_ROWS, spec);
    const log = buildEventLog(out.headers, out.rows, guessMapping(out.headers) as LogMapping);
    expect(log.stats.cases).toBe(3);
    expect(log.stats.events).toBe(6);
    const c1 = log.traces.find((t) => t.caseId === "C-1")!;
    expect(c1.events.map((e) => e.activity)).toEqual(["Received", "Approved", "Shipped"]);
    // Three days from Received to Shipped, not zero.
    expect(c1.events[2].timestamp - c1.events[0].timestamp).toBe(3 * 86_400_000);
    // Two distinct paths: the full one, and the two shorter ones.
    expect(log.variants).toHaveLength(3);
  });

  it("T3646 - the description says what will happen before it happens", () => {
    expect(describeWideSpec(detectWideSpec(WIDE, WIDE_ROWS)!)).toMatch(/3 state\/date pairs.*Case ID/);
    expect(describeWideSpec(detectWideSpec(MILE, MILE_ROWS)!)).toMatch(/3 milestone columns.*Order/);
  });
});

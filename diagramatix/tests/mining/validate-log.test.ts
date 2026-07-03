/**
 * Pre-import event-log validation — the advisory panel that confirms the column
 * mapping and shows what would be discarded before ingestion. Pure; unit-tested.
 */
import { describe, it, expect } from "vitest";
import { validateEventLogMapping } from "@/app/lib/mining/validateLog";
import type { LogMapping } from "@/app/lib/mining/types";

const H = ["case", "act", "ts", "st"];
const MAP: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", state: "st" };

describe("event-log mapping validation", () => {
  it("T0613 — a clean log: all usable, format + counts, no warnings, samples", () => {
    const rows = [
      ["1", "Open", "2026-01-01T09:00:00Z", "New"],
      ["1", "Work", "2026-01-01T10:00:00Z", "Doing"],
      ["1", "Close", "2026-01-01T11:00:00Z", "Done"],
      ["2", "Open", "2026-01-02T09:00:00Z", "New"],
      ["2", "Close", "2026-01-02T10:00:00Z", "Done"],
    ];
    const v = validateEventLogMapping(H, rows, MAP);
    expect(v.total).toBe(5);
    expect(v.usable).toBe(5);
    expect(v.dropped).toBe(0);
    expect(v.timestampFormat).toBe("ISO / date");
    expect(v.distinctCases).toBe(2);
    expect(v.distinctActivities).toBe(3);   // Open, Work, Close
    expect(v.distinctStates).toBe(3);       // New, Doing, Done
    expect(v.singleEventCases).toBe(0);
    expect(v.warnings).toEqual([]);
    expect(v.samples.caseId).toEqual(["1", "2"]);
    expect(v.samples.state).toEqual(["New", "Doing", "Done"]);
  });

  it("T0614 — unparseable timestamps → dropped + format warnings", () => {
    const rows = [
      ["1", "Open", "not-a-date", "New"],
      ["1", "Close", "also bad", "Done"],
    ];
    const v = validateEventLogMapping(H, rows, MAP);
    expect(v.usable).toBe(0);
    expect(v.dropped).toBe(2);
    expect(v.timestampFormat).toBe("unrecognised");
    expect(v.warnings.some((w) => /discarded/i.test(w.message))).toBe(true);
    expect(v.warnings.some((w) => /timestamp column doesn't look/i.test(w.message))).toBe(true);
  });

  it("T0615 — a single-value case id and all single-event cases both warn", () => {
    const oneCase = [
      ["X", "Open", "2026-01-01T09:00:00Z", "New"],
      ["X", "Close", "2026-01-01T10:00:00Z", "Done"],
    ];
    expect(validateEventLogMapping(H, oneCase, MAP).warnings.some((w) => /only one distinct value/i.test(w.message))).toBe(true);

    const singletons = [
      ["1", "Open", "2026-01-01T09:00:00Z", "New"],
      ["2", "Open", "2026-01-02T09:00:00Z", "New"],
      ["3", "Open", "2026-01-03T09:00:00Z", "New"],
    ];
    const v = validateEventLogMapping(H, singletons, MAP);
    expect(v.singleEventCases).toBe(3);
    expect(v.warnings.some((w) => /only one event/i.test(w.message))).toBe(true);
  });

  it("T0616 — epoch timestamps are recognised", () => {
    const secs = validateEventLogMapping(H, [["1", "Open", "1704102000", "New"]], MAP);
    expect(secs.timestampFormat).toBe("epoch seconds");
    const ms = validateEventLogMapping(H, [["1", "Open", "1704102000000", "New"]], MAP);
    expect(ms.timestampFormat).toBe("epoch milliseconds");
  });

  it("T0618 — Excel serial dates are recognised + usable (not dropped)", () => {
    const rows = [
      ["1", "Open", "45658", "New"], ["1", "Close", "45658.5", "Done"],
      ["2", "Open", "45659", "New"], ["2", "Close", "45659.5", "Done"],
    ];
    const v = validateEventLogMapping(H, rows, MAP);
    expect(v.timestampFormat).toBe("Excel serial date");
    expect(v.usable).toBe(4);
    expect(v.dropped).toBe(0);
    expect(v.warnings).toEqual([]);   // parses cleanly → no discarded / unrecognised warnings
  });
});

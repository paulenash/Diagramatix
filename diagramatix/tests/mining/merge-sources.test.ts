/**
 * Phase 2.3 — several systems, one lifecycle.
 *
 * The failure this guards against is not a crash. Merging two exports on a case
 * id the two systems do not share produces twice as many half-length cases, and
 * a run full of fragments looks exactly like a successful import: it has cases,
 * it has variants, it discovers a process. Most of what is pinned here is the
 * difference between merging and appearing to.
 */
import { describe, it, expect } from "vitest";
import { mergeSources, parseCrosswalk, SOURCE_COLUMN, type MergeSource } from "@/app/lib/mining/mergeSources";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

/** The CRM's half: its own column names, its own ids. */
const crm = (rows: string[][], extra: Partial<MergeSource> = {}): MergeSource => ({
  id: "crm", name: "CRM",
  headers: ["opp", "step", "when"],
  rows,
  mapping: { caseId: "opp", activity: "step", timestamp: "when" },
  ...extra,
});

/** The ERP's half: different names for the same three roles. */
const erp = (rows: string[][], extra: Partial<MergeSource> = {}): MergeSource => ({
  id: "erp", name: "ERP",
  headers: ["order_no", "event", "ts"],
  rows,
  mapping: { caseId: "order_no", activity: "event", timestamp: "ts" },
  ...extra,
});

const col = (headers: string[], rows: string[][], name: string) => {
  const i = headers.indexOf(name);
  return rows.map((r) => r[i]);
};

describe("Phase 2.3 — merging two systems on a shared case id", () => {
  it("T3657 - the same id in two files is one case, not two", () => {
    const m = mergeSources([
      crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"]]),
      erp([["C-1", "Ship", "2026-01-05T09:00:00Z"]]),
    ]);
    expect(m.assessment.totalCases).toBe(1);
    expect(m.assessment.sharedCases).toBe(1);
    expect(m.rows).toHaveLength(2);
    expect(m.assessment.verdict).toBe("ok");
  });

  it("T3658 - a case's events interleave by time, not by which file they came from", () => {
    // The whole point of the union: the ERP's early event belongs BETWEEN the
    // CRM's two, and appending files would have put it after both.
    const m = mergeSources([
      crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"], ["C-1", "Quote sent", "2026-01-09T09:00:00Z"]]),
      erp([["C-1", "Order raised", "2026-01-05T09:00:00Z"]]),
    ]);
    expect(col(m.headers, m.rows, "Activity")).toEqual(["Enquiry", "Order raised", "Quote sent"]);
  });

  it("T3659 - each file keeps its own column names; the merged table has one set", () => {
    const m = mergeSources([
      crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"]]),
      erp([["C-1", "Ship", "2026-01-05T09:00:00Z"]]),
    ]);
    expect(m.headers.slice(0, 3)).toEqual(["Case", "Activity", "Timestamp"]);
    expect(m.mapping.caseId).toBe("Case");
    expect(m.mapping.activity).toBe("Activity");
    expect(m.mapping.timestamp).toBe("Timestamp");
    // Neither file's own names survive into the merged table.
    expect(m.headers).not.toContain("opp");
    expect(m.headers).not.toContain("order_no");
  });

  it("T3660 - every row says which system reported it, and that column is kept", () => {
    const m = mergeSources([
      crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"]]),
      erp([["C-1", "Ship", "2026-01-05T09:00:00Z"]]),
    ]);
    expect(col(m.headers, m.rows, SOURCE_COLUMN)).toEqual(["CRM", "ERP"]);
    // Kept, not dropped — otherwise the merge is unrecoverable after import.
    expect(m.mapping.attributeMode?.[SOURCE_COLUMN]).toBe("keep");
  });

  it("T3661 - an optional role appears only when some source maps it", () => {
    const withState = crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z", "Open"]], {
      headers: ["opp", "step", "when", "status"],
      mapping: { caseId: "opp", activity: "step", timestamp: "when", state: "status" },
    });
    expect(mergeSources([withState, erp([["C-1", "Ship", "2026-01-05T09:00:00Z"]])]).headers).toContain("State");
    expect(mergeSources([crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"]])]).headers).not.toContain("State");
  });
});

describe("Phase 2.3 — when the two systems use different ids", () => {
  const crmKeyed = crm(
    [["OPP-1", "Enquiry", "2026-01-01T09:00:00Z"], ["OPP-2", "Enquiry", "2026-01-02T09:00:00Z"]],
    { headers: ["opp", "step", "when", "ref"], linkColumn: "ref",
      mapping: { caseId: "opp", activity: "step", timestamp: "when" } },
  );
  const erpKeyed = erp(
    [["SO-9", "Ship", "2026-01-08T09:00:00Z"], ["SO-8", "Ship", "2026-01-09T09:00:00Z"]],
    { headers: ["order_no", "event", "ts", "ref"], linkColumn: "ref",
      mapping: { caseId: "order_no", activity: "event", timestamp: "ts" } },
  );

  it("T3662 - a shared business key links OPP-1 and SO-9 into one case", () => {
    const a = { ...crmKeyed, rows: [["OPP-1", "Enquiry", "2026-01-01T09:00:00Z", "REF-A"], ["OPP-2", "Enquiry", "2026-01-02T09:00:00Z", "REF-B"]] };
    const b = { ...erpKeyed, rows: [["SO-9", "Ship", "2026-01-08T09:00:00Z", "REF-A"], ["SO-8", "Ship", "2026-01-09T09:00:00Z", "REF-B"]] };
    const m = mergeSources([a, b]);
    expect(m.assessment.totalCases).toBe(2);          // not 4
    expect(m.assessment.sharedCases).toBe(2);
    expect(m.assessment.linkedBy).toBe("shared key");
  });

  it("T3663 - an explicit crosswalk links ids the files have nothing in common on", () => {
    const m = mergeSources(
      [crm([["OPP-1", "Enquiry", "2026-01-01T09:00:00Z"]]), erp([["SO-9", "Ship", "2026-01-08T09:00:00Z"]])],
      { pairs: [["OPP-1", "SO-9"]] },
    );
    expect(m.assessment.totalCases).toBe(1);
    expect(m.assessment.linkedBy).toBe("crosswalk");
  });

  it("T3664 - a crosswalk CHAIN resolves to one case, not two", () => {
    // A→B and B→C must land in the same class. A pairwise map that forgets
    // transitivity splits a three-system case in half and never says so.
    const mid: MergeSource = {
      id: "wms", name: "WMS", headers: ["id", "act", "t"],
      rows: [["MID-1", "Pick", "2026-01-06T09:00:00Z"]],
      mapping: { caseId: "id", activity: "act", timestamp: "t" },
    };
    const m = mergeSources(
      [crm([["OPP-1", "Enquiry", "2026-01-01T09:00:00Z"]]), mid, erp([["SO-9", "Ship", "2026-01-08T09:00:00Z"]])],
      { pairs: [["OPP-1", "MID-1"], ["MID-1", "SO-9"]] },
    );
    expect(m.assessment.totalCases).toBe(1);
    expect(m.rows).toHaveLength(3);
  });

  it("T3665 - the merged case id follows the FIRST source, not an arbitrary winner", () => {
    // "SO-9" sorts after "OPP-1" but that is not why it loses; reversing the
    // source order flips the answer, which is what makes it the user's choice.
    const a = crm([["OPP-1", "Enquiry", "2026-01-01T09:00:00Z"]]);
    const b = erp([["SO-9", "Ship", "2026-01-08T09:00:00Z"]]);
    const pairs: [string, string][] = [["OPP-1", "SO-9"]];
    expect(col(mergeSources([a, b], { pairs }).headers, mergeSources([a, b], { pairs }).rows, "Case")).toEqual(["OPP-1", "OPP-1"]);
    const flipped = mergeSources([b, a], { pairs });
    expect(col(flipped.headers, flipped.rows, "Case")).toEqual(["SO-9", "SO-9"]);
  });

  it("T3666 - ids containing spaces still link", () => {
    // The first implementation joined a case id and its key with a separator and
    // split them apart again, which broke the moment either contained one.
    const a = crm([["ORDER 1 A", "Enquiry", "2026-01-01T09:00:00Z", "REF A 1"]], {
      headers: ["opp", "step", "when", "ref"], linkColumn: "ref",
      mapping: { caseId: "opp", activity: "step", timestamp: "when" },
    });
    const b = erp([["SO 9 B", "Ship", "2026-01-08T09:00:00Z", "REF A 1"]], {
      headers: ["order_no", "event", "ts", "ref"], linkColumn: "ref",
      mapping: { caseId: "order_no", activity: "event", timestamp: "ts" },
    });
    const m = mergeSources([a, b]);
    expect(m.assessment.totalCases).toBe(1);
    expect(m.assessment.sharedCases).toBe(1);
  });
});

describe("Phase 2.3 — refusing rather than flattering", () => {
  it("T3667 - two files with nothing in common are refused, and told what to do", () => {
    const m = mergeSources([
      crm([["OPP-1", "Enquiry", "2026-01-01T09:00:00Z"]]),
      erp([["SO-9", "Ship", "2026-01-08T09:00:00Z"]]),
    ]);
    expect(m.assessment.verdict).toBe("no-overlap");
    expect(m.assessment.sharedCases).toBe(0);
    expect(m.assessment.linkedBy).toBe("none");
    expect(m.assessment.message).toMatch(/shared key|crosswalk/i);
  });

  it("T3668 - a thin overlap is flagged, not quietly merged", () => {
    // 1 of 41 cases spans both files — technically a merge, almost certainly a
    // crosswalk that only half works.
    const crmRows = Array.from({ length: 20 }, (_, i) => [`A-${i}`, "Enquiry", "2026-01-01T09:00:00Z"]);
    const erpRows = Array.from({ length: 20 }, (_, i) => [`B-${i}`, "Ship", "2026-01-08T09:00:00Z"]);
    const m = mergeSources([crm([...crmRows, ["X-1", "Enquiry", "2026-01-01T09:00:00Z"]]), erp([...erpRows, ["X-1", "Ship", "2026-01-08T09:00:00Z"]])]);
    expect(m.assessment.sharedCases).toBe(1);
    expect(m.assessment.totalCases).toBe(41);
    expect(m.assessment.verdict).toBe("thin-overlap");
  });

  it("T3669 - rows with no case id are left out and counted, per source", () => {
    const m = mergeSources([
      crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"], ["", "Orphan", "2026-01-02T09:00:00Z"], ["  ", "Orphan", "2026-01-03T09:00:00Z"]]),
      erp([["C-1", "Ship", "2026-01-05T09:00:00Z"]]),
    ]);
    expect(m.assessment.sources[0].droppedRows).toBe(2);
    expect(m.assessment.sources[1].droppedRows).toBe(0);
    expect(m.assessment.warnings.some((w) => /CRM.*2 rows/.test(w))).toBe(true);
    expect(m.rows).toHaveLength(2);
  });

  it("T3670 - the same event reported by both systems is counted, never silently dropped", () => {
    const m = mergeSources([
      crm([["C-1", "Order raised", "2026-01-05T09:00:00Z"]]),
      erp([["C-1", "Order raised", "2026-01-05T09:00:00Z"]]),
    ]);
    expect(m.assessment.duplicateEvents).toBe(1);
    expect(m.rows).toHaveLength(2);                     // both kept
    expect(m.assessment.warnings.join(" ")).toMatch(/reported identically/i);
  });
});

describe("Phase 2.3 — the gap between the systems", () => {
  it("T3671 - cross-system handover is measured: how often, and how long", () => {
    // The days a case spends after the CRM finishes and before the ERP starts
    // are invisible in either export alone.
    const day = 86_400_000;
    const m = mergeSources([
      crm([
        ["C-1", "Quote sent", "2026-01-01T00:00:00Z"],
        ["C-2", "Quote sent", "2026-01-01T00:00:00Z"],
        ["C-3", "Quote sent", "2026-01-01T00:00:00Z"],
      ]),
      erp([
        ["C-1", "Order raised", "2026-01-03T00:00:00Z"],   // 2 days
        ["C-2", "Order raised", "2026-01-05T00:00:00Z"],   // 4 days
        ["C-3", "Order raised", "2026-01-09T00:00:00Z"],   // 8 days
      ]),
    ]);
    expect(m.assessment.handovers).toHaveLength(1);
    const h = m.assessment.handovers[0];
    expect([h.from, h.to]).toEqual(["CRM", "ERP"]);
    expect(h.count).toBe(3);
    expect(h.medianGapMs).toBe(4 * day);
  });

  it("T3672 - a duplicate event is not a handover", () => {
    const m = mergeSources([
      crm([["C-1", "Order raised", "2026-01-05T00:00:00Z"]]),
      erp([["C-1", "Order raised", "2026-01-05T00:00:00Z"], ["C-1", "Ship", "2026-01-07T00:00:00Z"]]),
    ]);
    // The two "Order raised" rows are the same event, so the CRM→ERP handover is
    // 0 hours and meaningless; it must not be reported as one.
    expect(m.assessment.duplicateEvents).toBe(1);
    expect(m.assessment.handovers).toHaveLength(0);
  });
});

describe("Phase 2.3 — what survives into the import", () => {
  it("T3673 - the merged table produces exactly the cases the assessment promised", () => {
    // The banner a user reads and the rows that get imported come from ONE call,
    // so they cannot disagree — this pins that they actually agree.
    const m = mergeSources([
      crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"], ["C-2", "Enquiry", "2026-01-02T09:00:00Z"]]),
      erp([["C-1", "Ship", "2026-01-05T09:00:00Z"], ["C-2", "Ship", "2026-01-06T09:00:00Z"]]),
    ]);
    const log = buildEventLog(m.headers, m.rows, m.mapping as LogMapping);
    expect(log.stats.cases).toBe(m.assessment.totalCases);
    expect(log.stats.events).toBe(m.rows.length);
    expect(log.traces[0].events.map((e) => e.activity)).toEqual(["Enquiry", "Ship"]);
  });

  it("T3674 - the originating system survives as a case attribute", () => {
    const m = mergeSources([
      crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"]]),
      erp([["C-1", "Ship", "2026-01-05T09:00:00Z"]]),
    ]);
    const log = buildEventLog(m.headers, m.rows, m.mapping as LogMapping);
    expect(log.traces[0].events[0].attrs?.[SOURCE_COLUMN]).toBe("CRM");
  });

  it("T3675 - \"hash the case id\" survives the rename to Case", () => {
    // The CRM's case id is really a customer number. The instruction is attached
    // to the column name `opp`, which no longer exists after the merge.
    const m = mergeSources([
      crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"]], {
        mapping: { caseId: "opp", activity: "step", timestamp: "when", attributeMode: { opp: "hash" } },
      }),
      erp([["C-1", "Ship", "2026-01-05T09:00:00Z"]]),
    ]);
    expect(m.mapping.attributeMode?.Case).toBe("hash");
    const log = buildEventLog(m.headers, m.rows, m.mapping as LogMapping);
    expect(log.traces[0].caseId).not.toBe("C-1");        // masked
    expect(log.traces).toHaveLength(1);                  // and still ONE case
  });

  it("T3676 - the strictest mode wins when two systems disagree about a column", () => {
    const a = crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z", "Alice"]], {
      headers: ["opp", "step", "when", "owner"],
      mapping: { caseId: "opp", activity: "step", timestamp: "when", attributeMode: { owner: "keep" } },
    });
    const b = erp([["C-1", "Ship", "2026-01-05T09:00:00Z", "Bob"]], {
      headers: ["order_no", "event", "ts", "owner"],
      mapping: { caseId: "order_no", activity: "event", timestamp: "ts", attributeMode: { owner: "hash" } },
    });
    // If one system says a column identifies a person, it does.
    expect(mergeSources([a, b]).mapping.attributeMode?.owner).toBe("hash");
    expect(mergeSources([b, a]).mapping.attributeMode?.owner).toBe("hash");
  });

  it("T3677 - activity→state tables merge; a disagreement keeps the first and says so", () => {
    const a = crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"]], {
      mapping: { caseId: "opp", activity: "step", timestamp: "when", activityState: { Enquiry: "Open", Ship: "Sent" } },
    });
    const b = erp([["C-1", "Ship", "2026-01-05T09:00:00Z"]], {
      mapping: { caseId: "order_no", activity: "event", timestamp: "ts", activityState: { Ship: "Despatched" } },
    });
    const m = mergeSources([a, b]);
    expect(m.mapping.activityState).toEqual({ Enquiry: "Open", Ship: "Sent" });
    expect(m.assessment.warnings.join(" ")).toMatch(/"Ship".*Sent.*Despatched/);
  });

  it("T3678 - an unparseable timestamp is kept and sorts last, so one place counts dropped rows", () => {
    // Discarding it here would mean two different authorities on "rows dropped".
    const m = mergeSources([
      crm([["C-1", "Enquiry", "2026-01-01T09:00:00Z"], ["C-1", "Broken", "not a date"]]),
      erp([["C-1", "Ship", "2026-01-05T09:00:00Z"]]),
    ]);
    expect(col(m.headers, m.rows, "Activity")).toEqual(["Enquiry", "Ship", "Broken"]);
    const log = buildEventLog(m.headers, m.rows, m.mapping as LogMapping);
    expect(log.stats.events).toBe(2);
    expect(log.stats.unmappedRows).toBe(1);
  });
});

describe("Phase 2.3 — the crosswalk file", () => {
  it("T3679 - a two-column file becomes pairs; a row missing either id is not a pair", () => {
    expect(parseCrosswalk([["OPP-1", "SO-9"], ["OPP-2", ""], ["", "SO-8"], ["OPP-3", "SO-7"]]).pairs)
      .toEqual([["OPP-1", "SO-9"], ["OPP-3", "SO-7"]]);
  });

  it("T3680 - a file of the wrong shape yields no pairs rather than nonsense", () => {
    expect(parseCrosswalk([["just one column"], []]).pairs).toEqual([]);
  });
});

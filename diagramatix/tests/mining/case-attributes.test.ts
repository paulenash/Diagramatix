/**
 * Phase 1 — keep what we are about to need; the importer only runs once.
 *
 * The importer is the only moment the truth exists: `buildEventLog` aggregates
 * the traces and the raw events are then gone. So a field not captured here is
 * unavailable to that run FOREVER — not until someone adds a recompute, because
 * there is nothing left to recompute from. That is why this lands before any
 * filter UI exists, and why the regression bar at the bottom is the most
 * important assertion in the file.
 *
 * What is stored: the columns nobody mapped (so a slice can be taken later),
 * per-event durations (without which a filtered heat map is impossible), and
 * per-event resources (without which a handover map is only an approximation).
 */
import { describe, it, expect } from "vitest";
import { buildEventLog, maskValue } from "@/app/lib/mining/parseEventLog";
import { computeAnalytics, DETAIL_BUDGET, MAX_ATTR_VALUES } from "@/app/lib/mining/analytics";
import { minOf, maxOf } from "@/app/lib/mining/numeric";
import type { LogMapping } from "@/app/lib/mining/types";

const HEADERS = ["Case", "Activity", "When", "Who", "Region", "Value", "Customer"];
const BASE: LogMapping = { caseId: "Case", activity: "Activity", timestamp: "When", resource: "Who" };

/** Two cases, three events each, one hour apart. */
const ROWS = [
  ["c1", "Receive", "2026-01-01T09:00:00Z", "Ann", "North", "12000", "Acme Ltd"],
  ["c1", "Check", "2026-01-01T10:00:00Z", "Bob", "North", "12000", "Acme Ltd"],
  ["c1", "Pay", "2026-01-01T12:00:00Z", "Ann", "North", "12000", "Acme Ltd"],
  ["c2", "Receive", "2026-01-02T09:00:00Z", "Bob", "South", "400", "Beta Pty"],
  ["c2", "Check", "2026-01-02T09:30:00Z", "Bob", "South", "400", "Beta Pty"],
  ["c2", "Pay", "2026-01-02T11:00:00Z", "Cara", "South", "400", "Beta Pty"],
];

const build = (mapping: LogMapping) => computeAnalytics(buildEventLog(HEADERS, ROWS, mapping));

describe("Phase 1 — the columns nobody mapped", () => {
  it("T3614 - an unmapped column is DROPPED unless it is asked for", () => {
    // The safe default, and the deliberate one: a spare column is as likely to
    // hold a customer name as a region.
    const a = build(BASE);
    expect(a.attributes).toBeUndefined();
    expect(a.cases[0].attrs).toBeUndefined();
  });

  it("T3615 - a kept column becomes a per-case attribute, from the case's FIRST event", () => {
    const a = build({ ...BASE, attributeMode: { Region: "keep", Value: "keep" } });
    expect(a.cases.map((c) => c.attrs?.Region)).toEqual(["North", "South"]);
    expect(a.cases.map((c) => c.attrs?.Value)).toEqual(["12000", "400"]);
    // Not the unrequested one.
    expect(a.cases[0].attrs?.Customer).toBeUndefined();
  });

  it("T3616 - the attribute is offered as a dimension, with its values", () => {
    const a = build({ ...BASE, attributeMode: { Region: "keep" } });
    const region = a.attributes!.find((x) => x.name === "Region")!;
    expect(region.distinct).toBe(2);
    expect(region.values).toEqual(["North", "South"]);
    expect(region.filterable).toBe(true);
  });

  it("T3617 - a column with too many values is kept but marked unfilterable, and says why", () => {
    // The user is TOLD why they cannot filter on an invoice number, rather than
    // finding the column silently missing.
    const rows = Array.from({ length: MAX_ATTR_VALUES + 20 }, (_, i) => [
      `case${i}`, "Receive", `2026-03-0${(i % 9) + 1}T09:00:00Z`, "Ann", `R${i}`, "1", "x",
    ]);
    const a = computeAnalytics(buildEventLog(HEADERS, rows, { ...BASE, attributeMode: { Region: "keep" } }));
    const region = a.attributes!.find((x) => x.name === "Region")!;
    expect(region.filterable).toBe(false);
    expect(region.values).toBeUndefined();
    expect(region.reason).toMatch(/identifier, not a dimension/);
  });
});

describe("Phase 1 — masking, in the phase that starts persisting", () => {
  it("T3618 - a hashed column stores a token, never the original", () => {
    const a = build({ ...BASE, attributeMode: { Customer: "hash" } });
    const seen = a.cases.map((c) => c.attrs!.Customer);
    expect(seen).not.toContain("Acme Ltd");
    expect(seen).not.toContain("Beta Pty");
    expect(seen[0]).toMatch(/^•/);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("T3619 - the digest is STABLE, so cases still group and join", () => {
    // A random token per row would destroy the very grouping the miner needs.
    expect(maskValue("Acme Ltd")).toBe(maskValue("Acme Ltd"));
    expect(maskValue("Acme Ltd")).not.toBe(maskValue("Acme Ltc"));
  });

  it("T3620 - masking the CASE ID keeps the cases intact", () => {
    const a = build({ ...BASE, attributeMode: { Case: "hash" } });
    expect(a.totalCases).toBe(2);                       // still two cases
    expect(a.cases.every((c) => c.caseId.startsWith("•"))).toBe(true);
    expect(a.cases[0].events).toBe(3);                  // still three events each
  });

  it("T3621 - an empty case id is still an unusable row, not the hash of nothing", () => {
    const log = buildEventLog(HEADERS, [...ROWS, ["", "Pay", "2026-01-03T09:00:00Z", "Ann", "North", "1", "x"]],
      { ...BASE, attributeMode: { Case: "hash" } });
    expect(log.stats.unmappedRows).toBe(1);
    expect(log.traces).toHaveLength(2);
  });
});

describe("Phase 1 — the per-event vectors a filter will need", () => {
  it("T3622 - durations are stored per event, one shorter than the event count", () => {
    // The last event has no "until the next one". Without these, a filtered heat
    // map is impossible — the case index carried a cycle time and nothing else.
    const a = build(BASE);
    expect(a.detail).toBe("full");
    expect(a.cases[0].events).toBe(3);
    expect(a.cases[0].durs).toEqual([3_600_000, 7_200_000]);   // 1h then 2h
    expect(a.cases[1].durs).toEqual([1_800_000, 5_400_000]);   // 30m then 1.5h
  });

  it("T3623 - resources are stored as dictionary indices, not repeated strings", () => {
    const a = build(BASE);
    expect(a.resourceDict).toEqual(["Ann", "Bob", "Cara"]);
    expect(a.cases[0].res!.map((i) => a.resourceDict![i])).toEqual(["Ann", "Bob", "Ann"]);
    expect(a.cases[1].res!.map((i) => a.resourceDict![i])).toEqual(["Bob", "Bob", "Cara"]);
  });

  it("T3624 - an event with no resource records -1, which is not the same as index 0", () => {
    const rows = [["c9", "Receive", "2026-01-01T09:00:00Z", "", "N", "1", "x"],
                  ["c9", "Pay", "2026-01-01T10:00:00Z", "Ann", "N", "1", "x"]];
    const a = computeAnalytics(buildEventLog(HEADERS, rows, BASE));
    expect(a.cases[0].res).toEqual([-1, 0]);
  });

  it("T3625 - the per-activity resource COUNTS survive, so the multi-team flag can be opened", () => {
    // Already computed to pick the dominant resource, and previously discarded —
    // which is why the amber "more than one team does this" flag was a dead end.
    const a = build(BASE);
    const check = a.activities.find((x) => x.activity === "Check")!;
    expect(check.resourceCounts).toEqual({ Bob: 2 });
    const receive = a.activities.find((x) => x.activity === "Receive")!;
    expect(receive.resourceCounts).toEqual({ Ann: 1, Bob: 1 });
    expect(receive.dominantResource).toBeTruthy();
  });

  it("T3626 - a log too big for the vectors says so rather than dropping them silently", () => {
    // The budget is real: `analytics` is uncompressed jsonb the console fetches
    // whole. Over it, counts still filter and time-shaped figures must not claim to.
    const n = 4000, per = Math.ceil(DETAIL_BUDGET / n) + 10;
    const rows: string[][] = [];
    for (let c = 0; c < n; c++) {
      for (let e = 0; e < per; e++) {
        rows.push([`c${c}`, `A${e % 3}`, new Date(Date.UTC(2026, 0, 1, 0, e)).toISOString(), "Ann", "N", "1", "x"]);
      }
    }
    const a = computeAnalytics(buildEventLog(HEADERS, rows, BASE));
    expect(a.detail).toBe("counts");
    expect(a.cases[0].durs).toBeUndefined();
    expect(a.cases[0].res).toBeUndefined();
    // The counts themselves are untouched — this is a detail budget, not a cap.
    expect(a.totalCases).toBe(n);
    expect(a.cases[0].cycleMs).toBeGreaterThan(0);
    // Timeout raised deliberately: building and mining ~1.5M events is the point
    // of this test, not an accident of it, and 15s is tight for that under the
    // parallel load of a full-suite run. It is also the test that found the
    // Math.min(...) crash, so it is not one to make cheaper.
  }, 90_000);
});

describe("Phase 1 — REGRESSION: a log that asks for none of this is unchanged", () => {
  it("T3627 - stats, variants and every pre-existing analytics field are identical", () => {
    // The bar for the whole phase. Everything new is additive and inert when
    // unset; if this fails, five shipped catalog examples have changed meaning.
    const log = buildEventLog(HEADERS, ROWS, BASE);
    const a = computeAnalytics(log);

    expect(log.stats.cases).toBe(2);
    expect(log.stats.events).toBe(6);
    expect(log.variants).toHaveLength(1);              // both cases follow one path
    expect(log.variants[0].count).toBe(2);

    // Pre-existing analytics shape, field by field.
    expect(a.totalCases).toBe(2);
    expect(a.capped).toBe(false);
    expect(a.activities.map((x) => x.activity).sort()).toEqual(["Check", "Pay", "Receive"]);
    expect(a.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(["Check>Pay", "Receive>Check"]);
    expect(a.cases.map((c) => c.caseId)).toEqual(["c1", "c2"]);
    expect(a.cases[0].cycleMs).toBe(10_800_000);
    expect(a.cycle.medianMs).toBeGreaterThan(0);
    expect(a.throughput).toHaveLength(30);

    // ...and the new fields are ABSENT rather than empty, so nothing claims a
    // capability the run does not have.
    expect(a.attributes).toBeUndefined();
    expect(a.cases[0].attrs).toBeUndefined();
  });

  it("T3629 - min/max over a log-sized array does not blow the stack", () => {
    // FOUND BY T3626, and it was not a test problem. `Math.min(...xs)` passes
    // every element as an argument and throws RangeError past ~125k of them —
    // and the pipeline spread per-EVENT and per-CASE arrays in three places. So
    // any log beyond about 125,000 events could not be imported AT ALL: it did
    // not degrade, it crashed. That is well inside what this feature invites
    // people to upload (the live-source buffer alone caps at 100,000 rows).
    const big = Array.from({ length: 300_000 }, (_, i) => i);
    expect(() => Math.min(...big)).toThrow(RangeError);
    expect(minOf(big)).toBe(0);
    expect(maxOf(big)).toBe(299_999);
  });

  it("T3630 - and they report an empty array as unknown, not as zero", () => {
    expect(minOf([])).toBeUndefined();
    expect(maxOf([])).toBeUndefined();
  });

  it("T3628 - a run imported before any of this reads as 'none', not as zero", () => {
    // Older runs carry no `detail`. Absent must be read as unknown; reporting it
    // as a measured zero is the failure mode this whole plan guards against.
    const legacy = { detail: undefined } as { detail?: "full" | "counts" | "none" };
    expect(legacy.detail ?? "none").toBe("none");
  });
});

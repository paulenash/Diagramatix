/**
 * Phase 4 — where the elapsed time actually goes.
 *
 * The important test in this file is T3777, and it is a test about what the
 * feature must NOT claim. An event log records one timestamp per event, so the
 * interval between two events is a single number and nothing in the data says
 * how much of it was work and how much was waiting. `computeAnalytics` pushes
 * that same interval into the from-activity's `totalTimeMs` AND the edge's
 * samples — the same milliseconds under two names — so these rows decompose the
 * bottleneck table rather than adding to it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { transitionRows, transitionMedians, annotateTransitions, edgePairKey, MIN_EDGE_OBS } from "@/app/lib/mining/handover";
import type { DiagramData } from "@/app/lib/diagram/types";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { EdgeMetric } from "@/app/lib/mining/analytics";
import type { LogMapping } from "@/app/lib/mining/types";

const HOUR = 3_600_000;
const edge = (from: string, to: string, freq: number, medianMs: number, totalMs?: number): EdgeMetric =>
  ({ from, to, freq, medianMs, ...(totalMs === undefined ? {} : { totalMs }) });

describe("Phase 4 — ranking the transitions", () => {
  it("T3773 - ranked by TOTAL elapsed, not by median", () => {
    // A two-day wait that happens twice matters less than a two-hour wait that
    // happens four hundred times. Ranking on median puts the rare one on top.
    const view = transitionRows([
      edge("A", "Rare", 2, 48 * HOUR, 96 * HOUR),
      edge("A", "Common", 400, 2 * HOUR, 800 * HOUR),
    ]);
    expect(view.rows[0].to).toBe("Common");
    expect(view.rows[1].to).toBe("Rare");
  });

  it("T3774 - the measured total is used when the run recorded one", () => {
    // freq × median would say 300h; the real samples summed to 250h. The point
    // of storing the total is that a skewed wait is not median × count.
    const view = transitionRows([edge("A", "B", 100, 3 * HOUR, 250 * HOUR)]);
    expect(view.rows[0].totalMs).toBe(250 * HOUR);
    expect(view.rows[0].estimated).toBe(false);
    expect(view.anyEstimated).toBe(false);
  });

  it("T3775 - a run imported before totals existed falls back, and SAYS it estimated", () => {
    // Not silently: the fallback understates a skewed spread, which is the usual
    // shape of a waiting time, so a reader is owed the caveat.
    const view = transitionRows([edge("A", "B", 100, 3 * HOUR)]);
    expect(view.rows[0].totalMs).toBe(300 * HOUR);
    expect(view.rows[0].estimated).toBe(true);
    expect(view.anyEstimated).toBe(true);
  });

  it("T3776 - each row carries its share of everything leaving that step", () => {
    // The finding this table exists to produce: "Check" takes eight hours, and
    // three quarters of that is the wait before Approve, not before Reject.
    const view = transitionRows([
      edge("Check", "Approve", 30, 2 * HOUR, 75 * HOUR),
      edge("Check", "Reject", 10, 2 * HOUR, 25 * HOUR),
    ]);
    const approve = view.rows.find((r) => r.to === "Approve")!;
    const reject = view.rows.find((r) => r.to === "Reject")!;
    expect(approve.shareOfFrom).toBeCloseTo(0.75, 5);
    expect(reject.shareOfFrom).toBeCloseTo(0.25, 5);
  });
});

describe("Phase 4 — what the log cannot say", () => {
  it("T3777 - a transition's time IS the from-activity's time, not a second helping", () => {
    // THE correctness bar for this phase. One timestamp per event means one
    // interval, counted once in the activity table and once here. If a reader
    // sums both they double the elapsed time of the process, so the UI has to
    // present this as a decomposition — and this test is what makes that claim
    // checkable rather than a comment.
    const rows: string[][] = [];
    for (const c of ["c1", "c2", "c3"]) {
      rows.push([c, "Check", "2026-04-01T09:00:00Z"]);
      rows.push([c, "Approve", "2026-04-01T13:00:00Z"]);   // 4h after Check
      rows.push([c, "Close", "2026-04-01T14:00:00Z"]);     // 1h after Approve
    }
    const a = computeAnalytics(buildEventLog(["case", "act", "ts"], rows,
      { caseId: "case", activity: "act", timestamp: "ts" } as LogMapping));

    const check = a.activities.find((x) => x.activity === "Check")!;
    const leavingCheck = transitionRows(a.edges).rows
      .filter((r) => r.from === "Check")
      .reduce((s, r) => s + r.totalMs, 0);

    expect(leavingCheck).toBe(check.totalTimeMs);          // the SAME milliseconds
    expect(check.totalTimeMs).toBe(3 * 4 * HOUR);
  });

  it("T3778 - the final event of a case contributes no transition", () => {
    // There is nothing after it, so there is no interval. Counting it as zero
    // would drag every median down and invent a step that always takes no time.
    const rows = [
      ["c1", "Open", "2026-04-01T09:00:00Z"],
      ["c1", "Close", "2026-04-01T10:00:00Z"],
    ];
    const a = computeAnalytics(buildEventLog(["case", "act", "ts"], rows,
      { caseId: "case", activity: "act", timestamp: "ts" } as LogMapping));
    expect(transitionRows(a.edges).rows.map((r) => `${r.from}->${r.to}`)).toEqual(["Open->Close"]);
  });
});

describe("Phase 4 — honest floors", () => {
  it("T3779 - an edge with too few observations shows a frequency and no median", () => {
    const view = transitionRows([edge("A", "B", MIN_EDGE_OBS - 1, 5 * HOUR, 10 * HOUR)]);
    expect(view.rows[0].freq).toBe(MIN_EDGE_OBS - 1);
    expect(view.rows[0].medianMs).toBeNull();
    expect(view.rows[0].totalMs).toBe(10 * HOUR);          // the total is still real
  });

  it("T3780 - at the threshold the median appears", () => {
    expect(transitionRows([edge("A", "B", MIN_EDGE_OBS, HOUR, HOUR)]).rows[0].medianMs).toBe(HOUR);
  });

  it("T3781 - no edges is an empty view, not a crash or a zero-filled table", () => {
    for (const input of [undefined, []]) {
      const view = transitionRows(input);
      expect(view.rows).toEqual([]);
      expect(view.totalMs).toBe(0);
      expect(view.anyEstimated).toBe(false);
    }
  });
});

describe("Phase 4 — labelling the discovered model", () => {
  it("T3782 - only edges with enough observations get a median label", () => {
    const m = transitionMedians([edge("A", "B", 10, 2 * HOUR), edge("A", "C", 1, 9 * HOUR)]);
    expect(m.get(edgePairKey("A", "B"))).toBe(2 * HOUR);
    expect(m.has(edgePairKey("A", "C"))).toBe(false);
  });

  it("T3783 - the key cannot confuse two different edges", () => {
    // Concatenating labels would make "AB"->"C" and "A"->"BC" the same edge, and
    // one activity's waiting time would appear on another's arrow.
    expect(edgePairKey("AB", "C")).not.toBe(edgePairKey("A", "BC"));
    const m = transitionMedians([edge("AB", "C", 5, HOUR), edge("A", "BC", 5, 9 * HOUR)]);
    expect(m.get(edgePairKey("AB", "C"))).toBe(HOUR);
    expect(m.get(edgePairKey("A", "BC"))).toBe(9 * HOUR);
  });
});

describe("Phase 4 — putting the timings on the discovered model", () => {
  const diagram = (): DiagramData => ({
    elements: [
      { id: "e1", type: "task", label: "Check", x: 0, y: 0, width: 100, height: 60 },
      { id: "e2", type: "task", label: "Approve", x: 0, y: 0, width: 100, height: 60 },
      { id: "e3", type: "task", label: "Reject", x: 0, y: 0, width: 100, height: 60 },
    ],
    connectors: [
      { id: "c1", sourceId: "e1", targetId: "e2", type: "sequence", transitionCount: 30 },
      { id: "c2", sourceId: "e1", targetId: "e3", type: "sequence", transitionCount: 10 },
      { id: "c3", sourceId: "e2", targetId: "e3", type: "sequence" },   // no mined edge
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as DiagramData;

  const fmt = (ms: number) => `${Math.round(ms / HOUR)}h`;
  const conn = (d: DiagramData, id: string) => d.connectors.find((c) => c.id === id)!;

  it("T3784 - the median gap is labelled, and the frequency badge is left alone", () => {
    // The two say different things — how OFTEN and how LONG — and the arrow can
    // carry both, because badgeEdgeCounts moved the count off `label` already.
    const out = annotateTransitions(diagram(), [edge("Check", "Approve", 30, 4 * HOUR, 120 * HOUR)], fmt);
    expect(conn(out, "c1").label).toBe("4h");
    expect(conn(out, "c1").transitionCount).toBe(30);
  });

  it("T3785 - weight tracks TOTAL time, so the fattest arrow is the costliest path", () => {
    const out = annotateTransitions(diagram(), [
      edge("Check", "Approve", 30, 4 * HOUR, 120 * HOUR),
      edge("Check", "Reject", 10, 4 * HOUR, 40 * HOUR),
    ], fmt);
    expect(conn(out, "c1").weight!).toBeGreaterThan(conn(out, "c2").weight!);
    expect(conn(out, "c1").weight).toBe(5);            // the heaviest edge
  });

  it("T3786 - a connector with no mined edge behind it is not touched at all", () => {
    // Gateways the layout inserted, and the start/end events, have no counterpart
    // in the log. A weight of 1.5 would still be a change to a connector nothing
    // was measured for.
    const out = annotateTransitions(diagram(), [edge("Check", "Approve", 30, 4 * HOUR, 120 * HOUR)], fmt);
    expect(conn(out, "c3")).toEqual(conn(diagram(), "c3"));
    expect(conn(out, "c3").weight).toBeUndefined();
  });

  it("T3787 - an edge with too few observations gets a weight but NO median label", () => {
    const out = annotateTransitions(diagram(), [edge("Check", "Approve", 1, 4 * HOUR, 4 * HOUR)], fmt);
    expect(conn(out, "c1").label).toBeUndefined();
    expect(conn(out, "c1").weight).toBeTruthy();
  });

  it("T3788 - the input diagram is not mutated", () => {
    const original = diagram();
    const before = JSON.stringify(original);
    annotateTransitions(original, [edge("Check", "Approve", 30, 4 * HOUR, 120 * HOUR)], fmt);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("T3789 - no analytics means the diagram is returned exactly as it came in", () => {
    const original = diagram();
    expect(annotateTransitions(original, undefined, fmt)).toBe(original);
    expect(annotateTransitions(original, [], fmt)).toBe(original);
  });
});

/**
 * The canvas regression bar the plan asked for.
 *
 * Slice (b) widened ONE conditional in `ConnectorRenderer` — from "honour
 * `weight` on a uml-association" to "…or on a sequence flow". That is safe
 * because of a fact about the rest of the tree rather than anything about the
 * renderer: almost nothing sets `weight` at all. If a third producer appears and
 * puts a weight on a sequence flow, every arrow it touches silently changes
 * thickness in a diagram nobody was measuring — so the fact is pinned, not
 * assumed.
 */
const WEIGHT_ASSIGNMENT = new RegExp("\\bweight\\s*\\??\\s*[:=]");

describe("Phase 4 — the canvas change is safe because of who sets weight", () => {
  it("T3790 - only the two known producers assign a connector weight", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "generated" || name === "node_modules") continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts") || p.endsWith(".tsx")) files.push(p);
      }
    };
    walk("app");
    const producers = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      // CSS font-weight, in both spellings, is not a connector weight.
      const cleaned = src.replace(/fontWeight/g, "").replace(/font-weight/g, "");
      // A word boundary matters: "lightweight:" is not a connector weight.
      return WEIGHT_ASSIGNMENT.test(cleaned);
    });
    expect(producers.sort()).toEqual([
      join("app", "lib", "diagram", "diagramSchema.ts"),             // the schema, not a producer
      join("app", "lib", "diagram", "types.ts"),                     // the field declaration itself
      join("app", "lib", "diagram", "v3", "exportVisioDomainV3.ts"), // round-trips what it was given
      join("app", "lib", "diagram", "v3", "importVisioDomainV3.ts"), // UML types only, never "sequence"
      join("app", "lib", "mining", "buildDomainFromOcel.ts"),        // uml-association
      join("app", "lib", "mining", "handover.ts"),                   // this phase, on "sequence"
      join("app", "lib", "mining", "replayRunners.ts"),              // a different weight: replay dot size
    ]);
  });
});

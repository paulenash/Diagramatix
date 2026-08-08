/**
 * Insight-layer analytics (computeAnalytics) — the per-activity/edge metrics,
 * per-case index and cycle-time stats that drive the DiagramatixMINER Insights
 * views (bottleneck heat, variant Pareto, case explorer, KPI/SLA outcomes).
 * Guards the maths + that the edge key round-trips activity names faithfully.
 */
import { describe, it, expect } from "vitest";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import type { LogMapping } from "@/app/lib/mining/types";

const MAPPING: LogMapping = { caseId: "case", activity: "activity", timestamp: "timestamp" };
const BASE = 1_700_000_000_000; // epoch ms
const ts = (offsetMs: number) => String(BASE + offsetMs);

// Two cases through A -> B -> C. B is the deliberate bottleneck (largest total time).
//   case 1: A@0  B@+10s  C@+40s   (A->B = 10s, B->C = 30s, cycle = 40s)
//   case 2: A@0  B@+5s   C@+10s   (A->B = 5s,  B->C = 5s,  cycle = 10s)
const HEADERS = ["case", "activity", "timestamp"];
const ROWS: string[][] = [
  ["1", "A", ts(0)], ["1", "B", ts(10_000)], ["1", "C", ts(40_000)],
  ["2", "A", ts(0)], ["2", "B", ts(5_000)], ["2", "C", ts(10_000)],
];

describe("mining analytics", () => {
  it("T2226 — per-activity metrics rank the bottleneck first and split edges faithfully", () => {
    const log = buildEventLog(HEADERS, ROWS, MAPPING);
    const a = computeAnalytics(log);

    // Bottleneck-first ordering: B has the largest total time-in-activity.
    expect(a.activities[0].activity).toBe("B");
    const B = a.activities.find((x) => x.activity === "B")!;
    expect(B.totalTimeMs).toBe(35_000);   // 30s + 5s
    expect(B.caseFreq).toBe(2);
    expect(B.eventFreq).toBe(2);
    expect(B.medianDurMs).toBe(17_500);   // median(30000, 5000)

    const A = a.activities.find((x) => x.activity === "A")!;
    expect(A.totalTimeMs).toBe(15_000);   // 10s + 5s

    const C = a.activities.find((x) => x.activity === "C")!;
    expect(C.totalTimeMs).toBe(0);        // C is terminal — no outgoing sojourn
    expect(C.eventFreq).toBe(2);

    // Edges round-trip the activity names through the JSON key (no delimiter corruption).
    const ab = a.edges.find((e) => e.from === "A" && e.to === "B")!;
    const bc = a.edges.find((e) => e.from === "B" && e.to === "C")!;
    expect(ab.freq).toBe(2);
    expect(bc.freq).toBe(2);
    expect(bc.medianMs).toBe(17_500);
  });

  it("T2227 — per-case index carries cycle time + variant index; overall cycle stats are exact", () => {
    const log = buildEventLog(HEADERS, ROWS, MAPPING);
    const a = computeAnalytics(log);

    expect(a.totalCases).toBe(2);
    expect(a.capped).toBe(false);
    expect(a.cases).toHaveLength(2);

    const c1 = a.cases.find((c) => c.caseId === "1")!;
    const c2 = a.cases.find((c) => c.caseId === "2")!;
    expect(c1.cycleMs).toBe(40_000);
    expect(c2.cycleMs).toBe(10_000);
    expect(c1.events).toBe(3);

    // Both cases share the same activity/state sequence → the same (only) variant.
    expect(c1.variantIdx).toBe(0);
    expect(c2.variantIdx).toBe(0);

    expect(a.cycle.minMs).toBe(10_000);
    expect(a.cycle.maxMs).toBe(40_000);
    expect(a.cycle.medianMs).toBe(25_000); // median(10000, 40000)
  });

  it("T2228 — an empty/degenerate log yields safe zeros, not throws", () => {
    const log = buildEventLog(HEADERS, [["1", "A", ts(0)]], MAPPING);
    const a = computeAnalytics(log);
    expect(a.totalCases).toBe(1);
    expect(a.cases[0].cycleMs).toBe(0);      // single event → zero cycle
    expect(a.edges).toHaveLength(0);         // no transitions
    expect(a.activities.find((x) => x.activity === "A")!.totalTimeMs).toBe(0);
  });
});

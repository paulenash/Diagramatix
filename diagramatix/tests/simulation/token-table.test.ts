/**
 * Token trace table: one row per token, one column per visited element, cells =
 * time spent (with wait/service split), a total flow time, outcome + stats.
 */
import { describe, it, expect } from "vitest";
import { buildTokenTable, type NodeMeta } from "@/app/lib/simulation/tokenTable";
import type { TraceEvent } from "@/app/lib/simulation/engine";

const meta = new Map<string, NodeMeta>([
  ["src", { label: "Start", kind: "source" }],
  ["A", { label: "Task A", kind: "task", team: "Ops" }],
  ["B", { label: "Wait B", kind: "delay" }],
  ["end", { label: "Done", kind: "sink" }],
  ["endF", { label: "Failed", kind: "sink" }],
]);
const ev = (t: number, tokenId: string, kind: TraceEvent["kind"], nodeId?: string): TraceEvent => ({ t, tokenId, kind, nodeId });

describe("token trace table (T2840)", () => {
  it("splits each visit into wait/service and totals flow time", () => {
    const trace: TraceEvent[] = [
      ev(0, "t0", "spawn", "src"), ev(0, "t0", "enter", "A"), ev(2, "t0", "service", "A"),
      ev(5, "t0", "enter", "B"), ev(8, "t0", "enter", "end"), ev(8, "t0", "exit"),
    ];
    const tt = buildTokenTable(trace, meta);
    expect(tt.rows).toHaveLength(1);
    const r = tt.rows[0];
    expect(r.num).toBe(1);
    expect(r.cells.A).toMatchObject({ time: 5, wait: 2, service: 3, visits: 1 }); // enter@0, service@2, leave@5
    expect(r.cells.B).toMatchObject({ time: 3, wait: 0, service: 3 });            // delay, all dwell
    expect(r.total).toBe(8);
    expect(r.completed).toBe(true);
    expect(r.outcome).toBe("Done");
    expect(tt.cols.map((c) => c.id)).toEqual(["src", "A", "B", "end"]); // flow order by first-enter
  });

  it("marks an interrupted token (never reached a sink) and reports outcome stats", () => {
    const trace: TraceEvent[] = [
      // t0 completes; t1 is interrupted mid-A (exit without a sink).
      ev(0, "t0", "spawn", "src"), ev(0, "t0", "enter", "A"), ev(3, "t0", "enter", "endF"), ev(3, "t0", "exit"),
      ev(1, "t1", "spawn", "src"), ev(1, "t1", "enter", "A"), ev(4, "t1", "exit"),
    ];
    const tt = buildTokenTable(trace, meta);
    expect(tt.stats.tokens).toBe(2);
    expect(tt.stats.completed).toBe(1);
    expect(tt.stats.interrupted).toBe(1);
    const t1 = tt.rows.find((r) => r.id === "t1")!;
    expect(t1.completed).toBe(false);
    expect(t1.outcome).toBe("interrupted");
    expect(t1.hitBoundary).toBe(true);
    expect(tt.stats.outcomes).toEqual(expect.arrayContaining([{ label: "Failed", count: 1 }, { label: "interrupted", count: 1 }]));
    expect(tt.stats.flow).toMatchObject({ min: 3, max: 3 }); // only the completed token counts
  });
});

/**
 * T2855 — column order and column naming.
 *
 * Columns must read left-to-right in the order work happens. Ordering from the
 * trace alone can't do that: a rarely-taken error branch, and a sub-process's own
 * short-lived body tokens, both distort any ordering derived from visit times or
 * positions. The network's flow order (BFS from the start events) is authoritative.
 */
describe("buildTokenTable — column order", () => {
  const meta = new Map<string, NodeMeta>([
    ["src", { label: "Start", kind: "source" }],
    ["a", { label: "Step A", kind: "task" }],
    ["b", { label: "Step B", kind: "task" }],
    ["err", { label: "Handle Error", kind: "task" }],
    ["end", { label: "Done", kind: "sink" }],
  ]);
  // One token takes the error path FIRST (early in the run), then two take the
  // mainline. Without a flow order the early error step sorts to the left.
  const trace: TraceEvent[] = [
    { t: 0, tokenId: "t1", kind: "spawn", nodeId: "src" },
    { t: 1, tokenId: "t1", kind: "enter", nodeId: "err" },
    { t: 2, tokenId: "t1", kind: "exit", nodeId: "err" },
    { t: 10, tokenId: "t2", kind: "spawn", nodeId: "src" },
    { t: 11, tokenId: "t2", kind: "enter", nodeId: "a" },
    { t: 12, tokenId: "t2", kind: "enter", nodeId: "b" },
    { t: 13, tokenId: "t2", kind: "enter", nodeId: "end" },
    { t: 14, tokenId: "t2", kind: "exit", nodeId: "end" },
  ] as TraceEvent[];

  it("uses the network's flow order when supplied, so the error branch sorts late", () => {
    const order = ["src", "a", "b", "end", "err"];
    expect(buildTokenTable(trace, meta, order).cols.map((c) => c.id)).toEqual(["src", "a", "b", "end", "err"]);
  });

  it("still produces a usable order with no flow order (trace-derived fallback)", () => {
    const cols = buildTokenTable(trace, meta).cols.map((c) => c.id);
    expect(cols[0], "the start event still leads").toBe("src");
    expect(cols).toHaveLength(5);
  });

  it("labels an unnamed node by what it is, never a raw id", () => {
    // replaySource supplies these readable names; the table must pass them through.
    const named = new Map<string, NodeMeta>([
      ["src", { label: "Start", kind: "source" }],
      ["x9", { label: "(end in Repeat Until error)", kind: "sink" }],
    ]);
    const t: TraceEvent[] = [
      { t: 0, tokenId: "t1", kind: "spawn", nodeId: "src" },
      { t: 1, tokenId: "t1", kind: "enter", nodeId: "x9" },
      { t: 2, tokenId: "t1", kind: "exit", nodeId: "x9" },
    ] as TraceEvent[];
    const labels = buildTokenTable(t, named, ["src", "x9"]).cols.map((c) => c.label);
    expect(labels).toEqual(["Start", "(end in Repeat Until error)"]);
    expect(labels.some((l) => /^[a-z0-9]{6,}$/i.test(l)), "no raw ids").toBe(false);
  });
});

/**
 * T2857 — token accounting. Every token row is either a CASE (spawned at a start
 * event) or an INTERNAL token the engine made to run a sub-process body or a
 * boundary handler, and every row's fate is exactly one of completed /
 * interrupted / in progress. Reporting all of them as "tokens" and everything
 * unfinished as "interrupted" made a healthy but under-resourced run look broken:
 * the row count exceeded the arrivals, and a queue that simply hadn't drained by
 * the horizon was labelled an error.
 */
describe("buildTokenTable — token accounting", () => {
  const meta = new Map<string, NodeMeta>([
    ["src", { label: "Start", kind: "source" }],
    ["a", { label: "Step A", kind: "task" }],
    ["handler", { label: "Handle Error", kind: "task" }],
    ["end", { label: "Done", kind: "sink" }],
  ]);
  const trace: TraceEvent[] = [
    // case 1 — completes
    { t: 0, tokenId: "c1", kind: "spawn", nodeId: "src" },
    { t: 1, tokenId: "c1", kind: "enter", nodeId: "a" },
    { t: 2, tokenId: "c1", kind: "enter", nodeId: "end" },
    { t: 2, tokenId: "c1", kind: "exit", nodeId: "end" },
    // case 2 — cancelled by a boundary (exits without reaching a sink)
    { t: 3, tokenId: "c2", kind: "spawn", nodeId: "src" },
    { t: 4, tokenId: "c2", kind: "enter", nodeId: "a" },
    { t: 5, tokenId: "c2", kind: "exit", nodeId: "a" },
    // case 3 — still queued when the run ended (no exit)
    { t: 6, tokenId: "c3", kind: "spawn", nodeId: "src" },
    { t: 7, tokenId: "c3", kind: "enter", nodeId: "a" },
    // internal — the boundary handler token, spawned mid-flow
    { t: 5, tokenId: "i1", kind: "spawn", nodeId: "handler" },
    { t: 6, tokenId: "i1", kind: "enter", nodeId: "end" },
    { t: 6, tokenId: "i1", kind: "exit", nodeId: "end" },
  ] as TraceEvent[];

  it("separates cases from internal tokens, and the three fates add up", () => {
    const s = buildTokenTable(trace, meta, ["src", "a", "handler", "end"]).stats;
    expect(s.cases, "only tokens spawned at a start event are arrivals").toBe(3);
    expect(s.internal, "the boundary handler token is not an arrival").toBe(1);
    expect(s.cases + s.internal).toBe(s.tokens);
    expect(s.completed).toBe(2);   // c1 + i1 reached the sink
    expect(s.interrupted).toBe(1); // c2 exited early
    expect(s.inProgress).toBe(1);  // c3 never exited
    expect(s.completed + s.interrupted + s.inProgress).toBe(s.tokens);
  });

  it("labels an unfinished token 'in progress', not 'interrupted'", () => {
    const rows = buildTokenTable(trace, meta).rows;
    expect(rows.find((r) => r.id === "c3")!.outcome).toBe("in progress");
    expect(rows.find((r) => r.id === "c3")!.inProgress).toBe(true);
    expect(rows.find((r) => r.id === "c2")!.outcome).toBe("interrupted");
    expect(rows.find((r) => r.id === "i1")!.internal).toBe(true);
  });
});

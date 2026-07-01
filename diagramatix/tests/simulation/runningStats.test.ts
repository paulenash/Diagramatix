/**
 * Running (live) stats timeline for the animated replay — the numbers that climb
 * as playback advances. T0551-T0552.
 */
import { describe, it, expect } from "vitest";
import { buildStatTimeline, statsAt } from "@/app/lib/simulation/runningStats";
import type { TraceEvent } from "@/app/lib/simulation/engine";

const ev = (t: number, tokenId: string, kind: TraceEvent["kind"], nodeId?: string): TraceEvent => ({ t, tokenId, kind, nodeId });
const nodeTeam = new Map([["n1", "ops"]]);

describe("runningStats", () => {
  it("T0551 — tracks completed / in-flight / queue / busy across the trace", () => {
    const trace: TraceEvent[] = [
      ev(0, "A", "spawn"),
      ev(0, "A", "enter", "n1"),
      ev(1, "A", "queue", "n1"),
      ev(2, "A", "service", "n1"),
      ev(5, "A", "exit"),
    ];
    const tl = buildStatTimeline(trace, nodeTeam);
    expect(statsAt(tl, -1)).toBeNull(); // before the first event
    expect(statsAt(tl, 1)!.inFlight).toBe(1);
    expect(statsAt(tl, 1)!.perTeam.ops).toEqual({ queued: 1, busy: 0 });
    expect(statsAt(tl, 2)!.perTeam.ops).toEqual({ queued: 0, busy: 1 });
    const end = statsAt(tl, 5)!;
    expect(end.completed).toBe(1);
    expect(end.inFlight).toBe(0);
    expect(end.perTeam.ops).toEqual({ queued: 0, busy: 0 });
  });

  it("T0552 — two tokens contend: one in service, one queued", () => {
    const trace: TraceEvent[] = [
      ev(0, "A", "spawn"), ev(0, "A", "enter", "n1"), ev(0, "A", "service", "n1"),
      ev(1, "B", "spawn"), ev(1, "B", "enter", "n1"), ev(1, "B", "queue", "n1"),
    ];
    const s = statsAt(buildStatTimeline(trace, nodeTeam), 1)!;
    expect(s.inFlight).toBe(2);
    expect(s.perTeam.ops).toEqual({ queued: 1, busy: 1 });
  });
});

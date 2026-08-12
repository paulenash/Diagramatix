/**
 * Live-source demo ("Order Processing — real-time polling"): the 6 poll batches
 * grow the run cumulatively, and the example package adopts as a live-demo (webhook
 * source + batches), not a pre-built run.
 */
import { describe, it, expect } from "vitest";
import { buildOrderProcessingLiveDemo, liveDemoAllRows, LIVE_DEMO_HEADERS, LIVE_DEMO_MAPPING } from "@/app/lib/mining/liveDemo";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import { buildLiveOrderProcessingExample } from "@/app/lib/mining/liveDemoExample";
import { validateMiningExamplePackage } from "@/app/lib/mining/examplePackage";

describe("Mining live-source demo (Order Processing)", () => {
  const demo = buildOrderProcessingLiveDemo();

  it("T2281 — six poll batches, each with events, keyed to the mapping fields", () => {
    expect(demo.batches.length).toBe(6);
    for (const b of demo.batches) {
      expect(b.events.length).toBeGreaterThan(0);
      for (const e of b.events) expect(Object.keys(e).sort()).toEqual(["activity", "orderId", "resource", "timestamp"]);
    }
    expect(liveDemoAllRows(demo).length).toBeGreaterThan(150);
  });

  it("T2282 — the run grows cumulatively as batches are ingested (few activities → many)", () => {
    let cum: string[][] = [];
    const snapshots = demo.batches.map((b) => {
      cum = cum.concat(b.events.map((e) => [e.orderId, e.activity, e.timestamp, e.resource]));
      return buildEventLog(LIVE_DEMO_HEADERS, cum, LIVE_DEMO_MAPPING).stats;
    });
    // Cases and activities are monotonically non-decreasing across polls.
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i].cases).toBeGreaterThanOrEqual(snapshots[i - 1].cases);
      expect(snapshots[i].activities.length).toBeGreaterThanOrEqual(snapshots[i - 1].activities.length);
    }
    // Poll 1 is a sliver of the process; by poll 6 it's the whole thing.
    expect(snapshots[0].activities.length).toBeLessThan(snapshots[5].activities.length);
    expect(snapshots[5].activities.length).toBeGreaterThanOrEqual(6); // received→…→delivered + variants
    expect(snapshots[5].variants).toBeGreaterThan(1);
  });

  it("T2283 — the example package is valid and adopts as a LIVE demo (batches, not a pre-built run)", () => {
    const ex = buildLiveOrderProcessingExample();
    expect(ex.slug).toBe("live-order-processing");
    expect(validateMiningExamplePackage(ex.package)).toEqual([]);
    expect(ex.package.liveDemo?.batches.length).toBe(6);
    expect(ex.package.diagrams).toEqual([]);
    // The aggregate run is present (card/validator) but adopt uses liveDemo instead.
    expect(ex.package.run.stats.cases).toBeGreaterThan(0);
    expect(ex.package.liveDemo?.mapping.caseId).toBe("orderId");
  });
});

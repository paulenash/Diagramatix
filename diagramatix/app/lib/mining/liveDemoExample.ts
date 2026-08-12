/**
 * The flagship LIVE-SOURCE example — "Order Processing (real-time)". Built from
 * the 6 poll batches in liveDemo.ts. Adopts as a webhook MiningSource + empty run;
 * the console's Live-demo panel ingests the batches one poll at a time (the real
 * ingest endpoint) so the discovered process, variants and bottlenecks grow live.
 * The `run` here is the AGGREGATE of all batches — only for the catalog card + the
 * package validator; adopt does NOT create it (see adoptMiningPackage liveDemo branch).
 *
 * Consumed by scripts/gen-mining-examples.ts (baked into miningExampleData.json).
 */
import { buildEventLog } from "./parseEventLog";
import { computePerformance } from "./performance";
import { computeAnalytics } from "./analytics";
import { buildOrderProcessingLiveDemo, liveDemoAllRows } from "./liveDemo";
import type { MiningExamplePackage } from "./examplePackage";
import type { StarterMiningExample } from "./exampleSeeds";

const DESCRIPTION = [
  "**Real-time polling** — see a mining run grow as a live source is polled. This is",
  "an **Order Processing** feed (orders received → payment → pick → pack → ship →",
  "deliver, with backorder + cancellation paths).",
  "",
  "Adopting this sets up a real **webhook live source** and an empty run, then opens",
  "the **Live-source demo** panel. Hit **“Simulate next poll”** six times: each poll",
  "ingests the next batch of events through the real ingest endpoint and refreshes the",
  "run in place — watch it go from a single *Order Received* box to the full process,",
  "with new variants (backorders, cancellations) and bottlenecks appearing as the data",
  "streams in. Exactly how a scheduled Azure Blob / webhook source behaves in production.",
].join(" ");

export function buildLiveOrderProcessingExample(): StarterMiningExample {
  const demo = buildOrderProcessingLiveDemo();
  const log = buildEventLog(demo.headers, liveDemoAllRows(demo), demo.mapping);
  const performance = computePerformance(log.traces);
  const analytics = computeAnalytics(log);

  const pkg: MiningExamplePackage = {
    version: 1,
    diagrams: [],
    // Aggregate run — for the catalog card + validator only (adopt skips it).
    run: {
      name: "Order Processing — live run",
      mapping: demo.mapping,
      stats: log.stats,
      variants: log.variants,
      performance,
      analytics,
    },
    liveDemo: {
      name: demo.name,
      headers: demo.headers,
      mapping: demo.mapping,
      batches: demo.batches.map((b) => ({ label: b.label, note: b.note, events: b.events.map((e) => ({ ...e })) })),
    },
  };

  return {
    slug: "live-order-processing",
    title: "Live Source — Order Processing (real-time polling)",
    concept: "Watch a mining run grow in real time as a live source is polled — orders streaming through fulfilment.",
    description: DESCRIPTION,
    difficulty: "advanced",
    package: pkg,
  };
}

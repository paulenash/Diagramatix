/**
 * Live-source demo data — "Order Processing (real-time)". A streaming order
 * fulfilment process (Order Received → Payment → Pick → Pack → Ship → Deliver,
 * with backorder + cancellation variants) sliced into 6 successive POLL BATCHES.
 *
 * The example adopts as a webhook MiningSource + empty live run; a "Simulate next
 * poll" control POSTs batch 1→6 to the real ingest endpoint, and the run refreshes
 * in place — you watch the process map, variants and bottlenecks grow live.
 *
 * Deterministic (index-based, no Date.now/random) so the example bakes reproducibly.
 * Events are objects keyed by the mapping's field names (what the ingest expects).
 */
import type { LogMapping } from "./types";

export interface LiveEvent { orderId: string; activity: string; timestamp: string; resource: string }
export interface LiveBatch { label: string; note: string; events: LiveEvent[] }
export interface LiveDemo { name: string; headers: string[]; mapping: LogMapping; batches: LiveBatch[] }

export const LIVE_DEMO_MAPPING: LogMapping = { caseId: "orderId", activity: "activity", timestamp: "timestamp", resource: "resource" };
export const LIVE_DEMO_HEADERS = ["orderId", "activity", "timestamp", "resource"];

const WINDOWS = 6;
const BASE_MS = Date.parse("2026-04-06T09:00:00Z"); // Monday 09:00
const WINDOW_MS = 2 * 3600_000;                      // 2h poll windows → 09:00..21:00

// The happy-path lifecycle: one step per subsequent poll window after arrival.
const STEPS: { act: string; role: string }[] = [
  { act: "Order Received", role: "Web Store" },
  { act: "Payment Confirmed", role: "Payments" },
  { act: "Items Picked", role: "Warehouse" },
  { act: "Order Packed", role: "Warehouse" },
  { act: "Shipped", role: "Dispatch" },
  { act: "Delivered", role: "Courier" },
];
const PICKERS = ["Ravi", "Mei", "Jon", "Sara"];

/** ISO timestamp inside window `w`, offset deterministically by the order index. */
const stamp = (w: number, orderIdx: number, stepIdx: number) =>
  new Date(BASE_MS + w * WINDOW_MS + ((orderIdx * 137 + stepIdx * 611) % 6900) * 1000).toISOString();

/** Build the demo: `orders` cases whose events fall across the 6 poll windows. */
export function buildOrderProcessingLiveDemo(orders = 48): LiveDemo {
  // Each order arrives in windows 0..3 and advances one step per later window, so
  // early orders complete and late ones are still in-flight by poll 6 (realistic).
  const byWindow: LiveEvent[][] = Array.from({ length: WINDOWS }, () => []);
  for (let i = 0; i < orders; i++) {
    const id = `ORD-${4100 + i}`;
    const arrival = i % 4;                 // 0..3
    const resource = PICKERS[i % PICKERS.length];
    const cancels = i % 10 === 4;          // ~10% cancelled after Received
    const backorder = i % 7 === 3;         // ~14% backordered before Pick

    // Assemble the ordered step list for this order (with variants).
    const seq: { act: string; role: string }[] = [];
    for (const s of STEPS) {
      if (cancels && s.act === "Payment Confirmed") { seq.push({ act: "Order Cancelled", role: "Service" }); break; }
      if (backorder && s.act === "Items Picked") { seq.push({ act: "Backordered", role: "Warehouse" }, { act: "Restocked", role: "Supplier" }); }
      seq.push(s);
    }
    // One step per window from arrival; drop anything past the 6th poll (in-flight).
    seq.forEach((s, k) => {
      const w = arrival + k;
      if (w >= WINDOWS) return;
      const role = s.role === "Warehouse" ? `${s.role} · ${resource}` : s.role;
      byWindow[w].push({ orderId: id, activity: s.act, timestamp: stamp(w, i, k), resource: role });
    });
  }

  const label = (w: number) => new Date(BASE_MS + w * WINDOW_MS).toISOString().slice(11, 16); // "09:00"
  const batches: LiveBatch[] = byWindow.map((events, w) => ({
    label: `Poll ${w + 1} · ${label(w)}`,
    note: `${events.length} new events — ${new Set(events.filter((e) => e.activity === "Order Received").map((e) => e.orderId)).size} new orders, the rest advancing.`,
    events: events.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)),
  }));

  return { name: "Order Processing — live", headers: LIVE_DEMO_HEADERS, mapping: LIVE_DEMO_MAPPING, batches };
}

/** All batches flattened to CSV rows (headers order) — for the example's aggregate
 *  run + card summary, and as the .csv the example can also ship. */
export function liveDemoAllRows(demo: LiveDemo): string[][] {
  return demo.batches.flatMap((b) => b.events).map((e) => [e.orderId, e.activity, e.timestamp, e.resource]);
}

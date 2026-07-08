/**
 * Public webhook ingest for a live mining source (Phase 1 connectors).
 * `POST /api/mining/ingest/[sourceId]` — no session; authenticated by the
 * source's ingest key (X-Api-Key or Authorization: Bearer). Accepts one JSON
 * event, an array of events, or NDJSON. Appends to the source's rolling buffer
 * and (debounced) refreshes the live run. Modelled on the Stripe webhook route.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { readIngestKey, verifyIngestKey } from "@/app/lib/mining/sourceAuth";
import { appendRowsToSource } from "@/app/lib/mining/pull";
import { refreshRunFromSource } from "@/app/lib/mining/refreshRun";
import { rateLimit, clientIp } from "@/app/lib/rateLimit";

type Params = { params: Promise<{ sourceId: string }> };

const MAX_BODY = 5 * 1024 * 1024; // 5MB per push
const REFRESH_DEBOUNCE_MS = 60_000;

export async function POST(req: Request, { params }: Params) {
  const { sourceId } = await params;

  const rl = rateLimit(`ingest:${sourceId}:${clientIp(req.headers)}`, 120, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const source = await prisma.miningSource.findUnique({ where: { id: sourceId } });
  if (!source || source.kind !== "webhook") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!verifyIngestKey(readIngestKey(req.headers), source.apiKeyHash)) {
    return NextResponse.json({ error: "Invalid ingest key" }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  // Parse JSON object / array, or NDJSON (one JSON object per line).
  let events: Record<string, unknown>[] = [];
  try {
    const j = JSON.parse(raw);
    events = Array.isArray(j) ? j : [j];
  } catch {
    events = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as Record<string, unknown>[];
  }
  events = events.filter((e) => e && typeof e === "object");
  if (events.length === 0) return NextResponse.json({ error: "No events in body" }, { status: 400 });

  const fields = (source.headerFields as string[]) ?? [];
  const rows = events.map((e) => fields.map((f) => (e[f] == null ? "" : String(e[f]))));
  const accepted = await appendRowsToSource(source, fields, rows);

  // Debounced refresh — fold new events into the live run without rebuilding on every push.
  let refreshed = false;
  if (source.autoRefresh) {
    const since = source.lastRefreshAt ? Date.now() - source.lastRefreshAt.getTime() : Infinity;
    if (since > REFRESH_DEBOUNCE_MS) {
      const fresh = await prisma.miningSource.findUnique({ where: { id: sourceId } });
      if (fresh) { await refreshRunFromSource(fresh); refreshed = true; }
    }
  }
  return NextResponse.json({ accepted, refreshed });
}

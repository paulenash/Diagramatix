/**
 * Scheduled poller for live mining sources, and the thing that lets the Miner
 * speak first.
 *
 * `POST /api/mining/poll` — no session; authenticated by the CRON_SECRET env via
 * the X-Cron-Key header. Invoked by a GitHub Actions cron. Flushes debounced
 * webhook buffers, polls Azure Blob sources, refreshes each affected live run,
 * and then WATCHES every source whether or not it had anything to say.
 *
 * THAT LAST PART IS THE FIX THIS PHASE TURNS ON. The loop used to select only
 * `webhook` and `azure-blob` sources and then short-circuit on `if (hasNew)`,
 * which meant two things at once:
 *
 *  - a SharePoint source was never even fetched, so a SharePoint feed that died
 *    was invisible here; and
 *  - a source with nothing new did nothing at all — and "nothing new" is
 *    PRECISELY the condition the cheapest and most valuable alarm watches for.
 *
 * Silence was the one state the watcher could not see. Refreshing still
 * requires new data; watching no longer does.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { pollBlobSource } from "@/app/lib/mining/pull";
import { refreshRunFromSource } from "@/app/lib/mining/refreshRun";
import { evaluateAlerts, type AlertPoint } from "@/app/lib/mining/alerts";
import { dispatchAlerts } from "@/app/lib/mining/alertDispatch";
import { type ComparableRun } from "@/app/lib/mining/compareRuns";
import { alertPointsFrom, type HistoryRow } from "@/app/lib/mining/alertHistory";
import { type KpiConfig } from "@/app/lib/mining/outcomes";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";
import type { Variant } from "@/app/lib/mining/types";

/** How far back a series is walked when building the alert history. */
const MAX_SERIES = 12;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (req.headers.get("x-cron-key") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // EVERY auto-refresh source, not just the two kinds that can be polled
  // unattended. A SharePoint source cannot be refreshed here — it needs a
  // signed-in user's Graph token — but it can certainly be WATCHED, and a
  // SharePoint feed that stopped is exactly as worth knowing about.
  const sources = await prisma.miningSource.findMany({
    where: { autoRefresh: true },
    orderBy: { lastRefreshAt: "asc" },
    take: 200,
  });

  const now = new Date();
  const report: { id: string; kind: string; ingested?: number; refreshed?: boolean; alerts?: number; suppressed?: number; error?: string }[] = [];

  for (const s of sources) {
    try {
      let ingested = 0;
      // Only these two can be pulled without a user present. The rest are
      // refreshed interactively — and still watched, below.
      if (s.kind === "azure-blob") ingested = await pollBlobSource(s);

      const hasNew = s.kind === "azure-blob"
        ? ingested > 0
        : !!(s.lastIngestAt && (!s.lastRefreshAt || s.lastIngestAt > s.lastRefreshAt));
      let refreshed = false;
      if (hasNew) {
        const fresh = await prisma.miningSource.findUnique({ where: { id: s.id } });
        if (fresh) { await refreshRunFromSource(fresh); refreshed = true; }
      }

      // ── Watch, whether or not anything arrived ──────────────────────────
      const after = await prisma.miningSource.findUnique({ where: { id: s.id } });
      const history = after?.runId ? await buildHistory(after.runId, after.projectId) : [];
      const { alerts } = evaluateAlerts({
        now,
        source: {
          name: after?.name ?? s.name, kind: s.kind,
          lastIngestAt: after?.lastIngestAt ?? s.lastIngestAt,
          createdAt: after?.createdAt ?? s.createdAt,
          autoRefresh: true,
        },
        history,
      });
      const sent = await dispatchAlerts(alerts, {
        userId: after?.createdById ?? s.createdById ?? null,
        runId: after?.runId ?? undefined,
        sourceId: s.id,
        projectId: after?.projectId ?? null,
      }, now);

      report.push({ id: s.id, kind: s.kind, ingested, refreshed, alerts: sent.sent, suppressed: sent.suppressed });
    } catch (err) {
      report.push({ id: s.id, kind: s.kind, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ polled: sources.length, report });
}

/**
 * The linked run series behind a live run, oldest first, as alert points.
 *
 * Walks BACK through `parentRunId` only: the live run is always the newest
 * observation, and the automatic snapshots behind it are its history.
 */
async function buildHistory(runId: string, projectId: string | null): Promise<AlertPoint[]> {
  const rows: ComparableRun[] = [];
  const seen = new Set<string>();
  let cursor: string | null = runId;
  while (cursor && !seen.has(cursor) && rows.length < MAX_SERIES) {
    const r: Awaited<ReturnType<typeof prisma.processMiningRun.findFirst>> = await prisma.processMiningRun.findFirst({
      where: { id: cursor, ...(projectId ? { projectId } : {}) },
    });
    if (!r) break;
    seen.add(r.id);
    rows.push({
      id: r.id, name: r.name, createdAt: r.createdAt.toISOString(),
      analytics: (r.analytics ?? null) as unknown as RunAnalytics | null,
      variants: (r.variants ?? []) as unknown as Variant[],
      conformance: (r.conformance ?? null) as unknown as ConformanceResult | null,
    });
    cursor = r.parentRunId;
  }

  // `kpiConfig` lives on each run, so the late rate is per observation rather
  // than a single current SLA applied backwards over history that predates it.
  const withKpi: HistoryRow[] = [];
  for (const r of rows) {
    const full = await prisma.processMiningRun.findUnique({ where: { id: r.id }, select: { kpiConfig: true } });
    withKpi.push({ ...r, kpiConfig: (full?.kpiConfig ?? null) as unknown as KpiConfig | null });
  }

  // Oldest first by date, which is the order the alerts want. Date order and
  // parent order agree here because the walk only ever goes back through
  // parents, and a snapshot is always older than the run it came from.
  //
  // The arithmetic is shared with the Compare view (Phase 11), so the cron and
  // the screen cannot disagree about whether anything is wrong.
  return alertPointsFrom(withKpi);
}

/**
 * Scheduled poller for live mining sources (Phase 1 connectors).
 * `POST /api/mining/poll` — no session; authenticated by the CRON_SECRET env via
 * the X-Cron-Key header. Invoked by a GitHub Actions cron. Flushes debounced
 * webhook buffers (new events since last refresh) and polls Azure Blob sources,
 * then refreshes each affected live run. SharePoint sources are skipped (they
 * need a signed-in user's Graph token — refreshed interactively).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { pollBlobSource } from "@/app/lib/mining/pull";
import { refreshRunFromSource } from "@/app/lib/mining/refreshRun";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (req.headers.get("x-cron-key") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sources = await prisma.miningSource.findMany({
    where: { autoRefresh: true, kind: { in: ["webhook", "azure-blob"] } },
    orderBy: { lastRefreshAt: "asc" },
    take: 200,
  });

  const report: { id: string; kind: string; ingested?: number; refreshed?: boolean; error?: string }[] = [];
  for (const s of sources) {
    try {
      let ingested = 0;
      if (s.kind === "azure-blob") ingested = await pollBlobSource(s);
      // Only refresh when there is (new) data since the last refresh.
      const hasNew = s.kind === "azure-blob"
        ? ingested > 0
        : !!(s.lastIngestAt && (!s.lastRefreshAt || s.lastIngestAt > s.lastRefreshAt));
      let refreshed = false;
      if (hasNew) {
        const fresh = await prisma.miningSource.findUnique({ where: { id: s.id } });
        if (fresh) { await refreshRunFromSource(fresh); refreshed = true; }
      }
      report.push({ id: s.id, kind: s.kind, ingested, refreshed });
    } catch (err) {
      report.push({ id: s.id, kind: s.kind, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ polled: sources.length, report });
}

/**
 * Import an event log → a ProcessMiningRun. The client parses the CSV (for the
 * mapping preview) and posts { name, mapping, headers, rows }; the server
 * normalises + compresses to variants and persists the run. The raw rows are
 * transient — only the compressed variants + stats are stored.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import { computePerformance } from "@/app/lib/mining/performance";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { splitByTime } from "@/app/lib/simulation/validate";
import { computeGovernance, hasGovernance } from "@/app/lib/mining/governance";
import type { LogMapping } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  let orgId: string | null = null;
  try {
    const ctx = await requireProjectAccess(session, await cookies(), id, "edit");
    orgId = ctx.projectOrgId ?? null;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const fg = await gateFeature(session?.user?.id ?? "", "processMining");
  if (fg) return fg;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Event log";
  const headers: string[] = Array.isArray(body.headers) ? body.headers : [];
  const rows: string[][] = Array.isArray(body.rows) ? body.rows : [];
  const mapping = body.mapping as Partial<LogMapping> | undefined;
  // State is now OPTIONAL: when unmapped, each activity's state comes from the
  // mapping's activityState table (defaulting to the activity name).
  if (!mapping?.caseId || !mapping?.timestamp || !mapping?.activity) {
    return NextResponse.json({ error: "Map the case id, activity and timestamp columns." }, { status: 400 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "The log has no rows." }, { status: 400 });

  const log = buildEventLog(headers, rows, mapping as LogMapping);
  if (log.stats.cases === 0) {
    return NextResponse.json({ error: "No usable events — check the case id + timestamp columns." }, { status: 400 });
  }
  // Performance + analytics + governance aggregates must be computed NOW — raw events are transient.
  // HOLD-BACK (optional). A twin fitted on every case and then checked against
  // those same cases is being marked on its own homework. When a holdout is
  // asked for, performance is fitted on the EARLIER share only and the later
  // cases are kept aside to test it — chronologically, because a random split
  // would leak the future into the fit.
  //
  // Only `performance` is split: `analytics` still covers every case, because
  // the Insights views describe what happened and must not be trimmed to suit
  // a validation choice.
  const holdoutPct = typeof body.holdoutPct === "number" && body.holdoutPct > 0 && body.holdoutPct < 0.9
    ? body.holdoutPct
    : 0;
  const traceStart = (t: { events: { timestamp: number }[] }) => t.events[0]?.timestamp ?? 0;
  const split = holdoutPct > 0
    ? splitByTime(log.traces.map((t) => ({ startMs: traceStart(t), t })), holdoutPct)
    : null;
  const fitTraces = split ? split.fit.map((x) => x.t) : log.traces;
  const performance = computePerformance(fitTraces);
  const analytics = computeAnalytics(log);
  // What the twin was NOT allowed to see, recorded so a later validation can
  // prove it is out-of-sample rather than asking anyone to take it on trust.
  const holdout = split && split.holdout.length > 0
    ? { pct: holdoutPct, splitMs: split.splitMs, cases: split.holdout.length }
    : null;
  if (holdout) performance.holdout = holdout;
  const governance = computeGovernance(log.traces);
  // Optional KPI/SLA config carried through from an example adoption (Slice 7); else null.
  const kpiConfig = body.kpiConfig && typeof body.kpiConfig === "object" ? body.kpiConfig : null;

  // Scalars via Prisma; the JSON columns via raw SQL (Prisma 7 omits JSON writes).
  const run = await prisma.processMiningRun.create({
    data: { name, projectId: id, orgId, createdById: session?.user?.id ?? null },
  });
  await pgPool.query(
    'UPDATE "ProcessMiningRun" SET mapping = $1::jsonb, stats = $2::jsonb, variants = $3::jsonb, performance = $4::jsonb, analytics = $5::jsonb, "kpiConfig" = $6::jsonb, governance = $7::jsonb, "updatedAt" = NOW() WHERE id = $8',
    [JSON.stringify(mapping), JSON.stringify(log.stats), JSON.stringify(log.variants), JSON.stringify(performance), JSON.stringify(analytics), JSON.stringify(kpiConfig), JSON.stringify(hasGovernance(governance) ? governance : null), run.id],
  );

  return NextResponse.json({ run: { id: run.id, name, stats: log.stats } }, { status: 201 });
}

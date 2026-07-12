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
  // Performance + governance aggregates must be computed NOW — raw events are transient.
  const performance = computePerformance(log.traces);
  const governance = computeGovernance(log.traces);

  // Scalars via Prisma; the JSON columns via raw SQL (Prisma 7 omits JSON writes).
  const run = await prisma.processMiningRun.create({
    data: { name, projectId: id, orgId, createdById: session?.user?.id ?? null },
  });
  await pgPool.query(
    'UPDATE "ProcessMiningRun" SET mapping = $1::jsonb, stats = $2::jsonb, variants = $3::jsonb, performance = $4::jsonb, governance = $5::jsonb, "updatedAt" = NOW() WHERE id = $6',
    [JSON.stringify(mapping), JSON.stringify(log.stats), JSON.stringify(log.variants), JSON.stringify(performance), JSON.stringify(hasGovernance(governance) ? governance : null), run.id],
  );

  return NextResponse.json({ run: { id: run.id, name, stats: log.stats } }, { status: 201 });
}

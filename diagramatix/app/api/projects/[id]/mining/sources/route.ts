/**
 * Live mining sources for a project (Phase 1 connectors).
 *   GET  — list sources (never returns the key hash or secret config).
 *   POST — create a source + its empty live ProcessMiningRun. For a webhook
 *          source, mint an ingest key and return the RAW key exactly once.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import { sourceHeaderFields, safeSource } from "@/app/lib/mining/sourceShape";
import type { LogMapping } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const sources = await prisma.miningSource.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ sources: sources.map(safeSource) });
}

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
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Live source";
  const kind = ["webhook", "azure-blob", "sharepoint"].includes(body.kind) ? body.kind : "webhook";
  const mapping = (body.mapping ?? {}) as Partial<LogMapping>;
  const config = (body.config ?? {}) as Record<string, unknown>;
  if (!mapping.caseId || !mapping.activity || !mapping.timestamp) {
    return NextResponse.json({ error: "Map the case id, activity and timestamp fields." }, { status: 400 });
  }
  if (kind === "azure-blob" && !(typeof config.blobListUrl === "string" && config.blobListUrl.startsWith("http"))) {
    return NextResponse.json({ error: "Provide a container SAS URL for the Azure Blob source." }, { status: 400 });
  }

  // The empty live run this source maintains.
  const run = await prisma.processMiningRun.create({
    data: { name, projectId: id, orgId, createdById: session?.user?.id ?? null },
  });
  await pgPool.query('UPDATE "ProcessMiningRun" SET mapping = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(mapping), run.id]);

  const minted = kind === "webhook" ? mintIngestKey() : null;
  const source = await prisma.miningSource.create({
    data: {
      projectId: id, orgId, createdById: session?.user?.id ?? null,
      name, kind, runId: run.id,
      apiKeyHash: minted?.hash ?? null, apiKeyPrefix: minted?.prefix ?? null,
    },
  });
  // JSON columns via raw SQL (Prisma 7 omits JSON writes).
  await pgPool.query(
    'UPDATE "MiningSource" SET mapping = $1::jsonb, config = $2::jsonb, "headerFields" = $3::jsonb, "updatedAt" = NOW() WHERE id = $4',
    [JSON.stringify(mapping), JSON.stringify(config), JSON.stringify(sourceHeaderFields(mapping)), source.id],
  );

  const fresh = await prisma.miningSource.findUnique({ where: { id: source.id } });
  return NextResponse.json({ source: safeSource(fresh!), key: minted?.key ?? null }, { status: 201 });
}

/**
 * A single live mining source: PATCH (rename / remap / reconfigure / toggle
 * auto-refresh / rotate the ingest key) and DELETE. The live run is left intact
 * on delete (it becomes an ordinary run).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import { validateBlobUrl } from "@/app/lib/mining/blobUrl";
import { sourceHeaderFields, safeSource } from "@/app/lib/mining/sourceShape";
import type { LogMapping } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string; sourceId: string }> };

/** Returns the response to send when the caller may NOT proceed, else null.
 *  Returns the NextResponse directly (rather than a shape the callers rebuild)
 *  so the subscription gate's own body — `metric: "feature"` plus the offending
 *  key, which the UI reads to tell "not in your plan" from "over your cap" —
 *  reaches the client intact. */
async function gate(id: string): Promise<NextResponse | null> {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return gateFeature(session?.user?.id ?? "", "processMining");
}

export async function PATCH(req: Request, { params }: Params) {
  const { id, sourceId } = await params;
  const g = await gate(id); if (g) return g;

  const source = await prisma.miningSource.findFirst({ where: { id: sourceId, projectId: id } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.name === "string" && body.name.trim()) await prisma.miningSource.update({ where: { id: sourceId }, data: { name: body.name.trim() } });
  if (typeof body.autoRefresh === "boolean") await prisma.miningSource.update({ where: { id: sourceId }, data: { autoRefresh: body.autoRefresh } });

  if (body.mapping) {
    const mapping = body.mapping as Partial<LogMapping>;
    if (!mapping.caseId || !mapping.activity || !mapping.timestamp) return NextResponse.json({ error: "Map the case id, activity and timestamp fields." }, { status: 400 });
    await pgPool.query('UPDATE "MiningSource" SET mapping = $1::jsonb, "headerFields" = $2::jsonb, "updatedAt" = NOW() WHERE id = $3', [JSON.stringify(mapping), JSON.stringify(sourceHeaderFields(mapping)), sourceId]);
  }
  if (body.config && typeof body.config === "object") {
    // MINE-01: an azure-blob source's URL is fetched server-side, so validate it
    // on reconfigure too — not only on create.
    if (source.kind === "azure-blob") {
      const blobErr = validateBlobUrl((body.config as Record<string, unknown>).blobListUrl);
      if (blobErr) return NextResponse.json({ error: blobErr }, { status: 400 });
    }
    await pgPool.query('UPDATE "MiningSource" SET config = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(body.config), sourceId]);
  }

  let key: string | null = null;
  if (body.rotateKey && source.kind === "webhook") {
    const minted = mintIngestKey();
    await prisma.miningSource.update({ where: { id: sourceId }, data: { apiKeyHash: minted.hash, apiKeyPrefix: minted.prefix } });
    key = minted.key;
  }

  const fresh = await prisma.miningSource.findUnique({ where: { id: sourceId } });
  return NextResponse.json({ source: safeSource(fresh!), key });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, sourceId } = await params;
  const g = await gate(id); if (g) return g;
  const source = await prisma.miningSource.findFirst({ where: { id: sourceId, projectId: id }, select: { id: true } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.miningSource.delete({ where: { id: sourceId } });
  return NextResponse.json({ ok: true });
}

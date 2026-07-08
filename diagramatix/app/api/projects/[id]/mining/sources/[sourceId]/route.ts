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
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import { sourceHeaderFields, safeSource } from "@/app/lib/mining/sourceShape";
import type { LogMapping } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string; sourceId: string }> };

async function gate(id: string) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) return { error: "Read-only: viewing another user", status: 403 as const };
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return { error: err.message, status: err.status };
    throw err;
  }
  return null;
}

export async function PATCH(req: Request, { params }: Params) {
  const { id, sourceId } = await params;
  const g = await gate(id); if (g) return NextResponse.json({ error: g.error }, { status: g.status });

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
  const g = await gate(id); if (g) return NextResponse.json({ error: g.error }, { status: g.status });
  const source = await prisma.miningSource.findFirst({ where: { id: sourceId, projectId: id }, select: { id: true } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.miningSource.delete({ where: { id: sourceId } });
  return NextResponse.json({ ok: true });
}

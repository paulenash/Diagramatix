import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { composeBranch, type SourceNode } from "@/app/lib/pcf/compose";

type Params = { params: Promise<{ id: string; frameworkId: string }> };

/**
 * POST /api/orgs/[id]/pcf/[frameworkId]/compose
 *   { sourceFrameworkId, rootNodeId, targetParentId? }
 * Copy a branch from a reference (or another) framework into this tailored
 * framework, under an optional target parent (else top level). Every copied node
 * keeps provenance (sourceFrameworkId + sourcePcfId). SuperAdmin OR Owner/Admin.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.pcfFramework.findFirst({ where: { id: frameworkId, orgId: id, kind: "tailored" }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "Not an editable tailored framework" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sourceFrameworkId = String(body?.sourceFrameworkId ?? "");
  const rootNodeId = String(body?.rootNodeId ?? "");
  const targetParentId = typeof body?.targetParentId === "string" && body.targetParentId ? body.targetParentId : null;
  if (!sourceFrameworkId || !rootNodeId) return NextResponse.json({ error: "sourceFrameworkId and rootNodeId are required" }, { status: 400 });

  const source = await prisma.pcfFramework.findFirst({ where: { id: sourceFrameworkId, OR: [{ orgId: null }, { orgId: id }] }, select: { id: true } });
  if (!source) return NextResponse.json({ error: "Source framework not found" }, { status: 404 });

  // The target parent, if given, must live in THIS tailored framework.
  let targetParent: { id: string; level: number } | null = null;
  if (targetParentId) {
    const p = await prisma.pcfNode.findFirst({ where: { id: targetParentId, frameworkId }, select: { id: true, level: true } });
    if (!p) return NextResponse.json({ error: "Target parent not found in this framework" }, { status: 400 });
    targetParent = p;
  }

  const sourceNodes = await prisma.pcfNode.findMany({
    where: { frameworkId: sourceFrameworkId, active: true },
    select: { id: true, pcfId: true, hierarchyId: true, name: true, description: true, level: true, parentId: true, sortOrder: true, metricsAvailable: true },
  });

  const composed = composeBranch(sourceNodes as SourceNode[], rootNodeId, frameworkId, sourceFrameworkId, targetParent, randomUUID);
  if (composed.length === 0) return NextResponse.json({ error: "Root node not found in the source framework" }, { status: 400 });

  // Single createMany → one INSERT, so self-referential parentId FKs are checked
  // at statement end (BFS order keeps parents ahead of children across batches).
  await prisma.pcfNode.createMany({ data: composed });

  return NextResponse.json({ ok: true, added: composed.length });
}

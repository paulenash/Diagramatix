import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { isSuperuser } from "@/app/lib/superuser";

type Params = { params: Promise<{ id: string; frameworkId: string }> };

/**
 * GET /api/orgs/[id]/pcf/[frameworkId]
 * One framework + its full node tree (flat, ordered). The framework must be a
 * global reference or belong to this org. SuperAdmin OR Owner/Admin.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const framework = await prisma.pcfFramework.findFirst({
    where: { id: frameworkId, OR: [{ orgId: null }, { orgId: id }] },
    select: { id: true, name: true, variant: true, version: true, kind: true, division: true, attributionNote: true },
  });
  if (!framework) return NextResponse.json({ error: "Framework not found" }, { status: 404 });
  const nodes = await prisma.pcfNode.findMany({
    where: { frameworkId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, pcfId: true, hierarchyId: true, name: true, description: true, level: true, parentId: true, changeType: true, metricsAvailable: true, active: true, isCustom: true, orgCode: true, sourceFrameworkId: true, sourcePcfId: true },
  });
  return NextResponse.json({ framework, nodes });
}

/** Load a framework only if it is this org's editable TAILORED framework. */
async function requireTailored(orgId: string, frameworkId: string) {
  return prisma.pcfFramework.findFirst({ where: { id: frameworkId, orgId, kind: "tailored" }, select: { id: true } });
}

/**
 * PATCH /api/orgs/[id]/pcf/[frameworkId]  { name?, division? }
 * Rename / re-scope a framework.
 *   • Tailored (this org's) — any Owner/Admin (or SuperAdmin). name + division.
 *   • Reference (global APQC) — SuperAdmin ONLY, since it's shared across every
 *     org. name only (division is a tailored concept). Durable: the seed skips
 *     existing frameworks, so a rename survives re-seeds.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const fw = await prisma.pcfFramework.findFirst({
    where: { id: frameworkId, OR: [{ orgId: null }, { orgId: id }] },
    select: { id: true, kind: true, orgId: true },
  });
  if (!fw) return NextResponse.json({ error: "Framework not found" }, { status: 404 });
  const isTailored = fw.kind === "tailored" && fw.orgId === id;
  const isReference = fw.kind === "reference" && fw.orgId === null;
  if (isReference && !isSuperuser(session)) {
    return NextResponse.json({ error: "Only a SuperAdmin can rename a global reference framework" }, { status: 403 });
  }
  if (!isTailored && !isReference) return NextResponse.json({ error: "Not editable" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: { name?: string; variant?: string; division?: string | null } = {};
  if (typeof body?.name === "string" && body.name.trim()) { data.name = body.name.trim(); data.variant = body.name.trim(); }
  if (isTailored && body?.division !== undefined) data.division = typeof body.division === "string" && body.division.trim() ? body.division.trim() : null;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const framework = await prisma.pcfFramework.update({ where: { id: frameworkId }, data, select: { id: true, name: true, variant: true, version: true, kind: true, division: true } });
  return NextResponse.json({ framework });
}

/**
 * DELETE /api/orgs/[id]/pcf/[frameworkId]
 * Delete a tailored framework (and its nodes, via cascade). Reference frameworks
 * cannot be deleted here. SuperAdmin OR Owner/Admin.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!(await requireTailored(id, frameworkId))) return NextResponse.json({ error: "Not an editable tailored framework" }, { status: 403 });
  await prisma.pcfFramework.delete({ where: { id: frameworkId } });
  return NextResponse.json({ ok: true });
}

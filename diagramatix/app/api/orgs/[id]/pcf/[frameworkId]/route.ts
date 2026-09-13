import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { isSuperuser } from "@/app/lib/superuser";
import { frameworkPatchData } from "@/app/lib/pcf/frameworkEdit";

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
 * PATCH /api/orgs/[id]/pcf/[frameworkId]  { name?, variant?, version?, division? }
 * Edit a framework's identity.
 *   • Tailored (this org's) — any Owner/Admin (or SuperAdmin). All four.
 *   • Reference (global APQC) — SuperAdmin ONLY, since it's shared across every
 *     org. name, variant, version (division is a tailored concept). Durable: the
 *     seed skips existing frameworks, so an edit survives re-seeds.
 *
 * Paul, 2026-09-14: "Allow the whole APQC Framework Name to be edited and saved
 * not just the Name. Include the Version number as well." Until now `name` was
 * the only field, and the route silently wrote it to `variant` too — which is
 * the part every picker actually shows (`variant vversion`). The three are
 * separate fields now and each is written only when sent.
 *
 * One consequence of an editable version, stated rather than hidden: the
 * import de-duplicates on { familyKey, version, kind, orgId }. Change "8.0" to
 * "8.1" and a later re-import of the 8.0 workbook lands as a SECOND framework
 * instead of being skipped. Upgrade pairing keys on familyKey, not version, so
 * that is unaffected.
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
  // What may change and how lives in app/lib/pcf/frameworkEdit.ts (pure, tested).
  const patch = frameworkPatchData(body, { isTailored });
  if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 });
  const data = patch.data;

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

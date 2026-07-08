import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; frameworkId: string; nodeId: string }> };

/** The node must live in this org's editable tailored framework. */
async function guard(orgId: string, frameworkId: string, nodeId: string) {
  const fw = await prisma.pcfFramework.findFirst({ where: { id: frameworkId, orgId, kind: "tailored" }, select: { id: true } });
  if (!fw) return false;
  const node = await prisma.pcfNode.findFirst({ where: { id: nodeId, frameworkId }, select: { id: true } });
  return !!node;
}

/**
 * PATCH /api/orgs/[id]/pcf/[frameworkId]/nodes/[nodeId]  { name?, active?, orgCode? }
 * Curate a node in a tailored framework: rename (keeps pcfId/provenance), hide/
 * show (active), or set an org code. SuperAdmin OR Owner/Admin.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId, nodeId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!(await guard(id, frameworkId, nodeId))) return NextResponse.json({ error: "Not editable" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: { name?: string; active?: boolean; orgCode?: string | null } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.active === "boolean") data.active = body.active;
  if (body?.orgCode !== undefined) data.orgCode = typeof body.orgCode === "string" && body.orgCode.trim() ? body.orgCode.trim() : null;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const node = await prisma.pcfNode.update({
    where: { id: nodeId }, data,
    select: { id: true, name: true, active: true, orgCode: true },
  });
  return NextResponse.json({ node });
}

/**
 * DELETE /api/orgs/[id]/pcf/[frameworkId]/nodes/[nodeId]
 * Remove a node and its descendants (parentId cascade). SuperAdmin OR Owner/Admin.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId, nodeId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!(await guard(id, frameworkId, nodeId))) return NextResponse.json({ error: "Not editable" }, { status: 403 });
  await prisma.pcfNode.delete({ where: { id: nodeId } });
  return NextResponse.json({ ok: true });
}

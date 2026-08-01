/**
 * PATCH /api/sop-templates/:id  → { name?, isDefault? }
 * DELETE /api/sop-templates/:id
 * Access follows the template's scope (project-edit or OrgAdmin).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

async function guard(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const tpl = await prisma.sopTemplate.findUnique({ where: { id }, select: { orgId: true, projectId: true } });
  if (!tpl) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  try {
    if (tpl.projectId) await requireProjectAccess(session, await cookies(), tpl.projectId, "edit");
    else if (tpl.orgId) await requireOrgAdminFor(session, await cookies(), tpl.orgId);
  } catch (err) {
    if (err instanceof OrgContextError) return { error: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
  return { tpl };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const isDefault = typeof body.isDefault === "boolean" ? body.isDefault : undefined;
  await prisma.$transaction(async (tx) => {
    if (isDefault === true) {
      const scopeWhere = g.tpl!.projectId ? { projectId: g.tpl!.projectId } : { orgId: g.tpl!.orgId };
      await tx.sopTemplate.updateMany({ where: scopeWhere, data: { isDefault: false } });
    }
    await tx.sopTemplate.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}), ...(isDefault !== undefined ? { isDefault } : {}) } });
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;
  await prisma.sopTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

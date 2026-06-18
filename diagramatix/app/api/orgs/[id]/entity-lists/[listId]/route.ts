import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; listId: string }> };

async function gate(orgId: string) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    throw new OrgContextError("Read-only: viewing another user", 403);
  }
  await requireOrgAdminFor(session, await cookies(), orgId);
}

/** PUT /api/orgs/[id]/entity-lists/[listId]  { name } — rename the list. */
export async function PUT(req: Request, { params }: Params) {
  const { id, listId } = await params;
  try { await gate(id); } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const existing = await prisma.entityList.findFirst({ where: { id: listId, orgId: id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const list = await prisma.entityList.update({ where: { id: listId }, data: { name } });
  return NextResponse.json({ list });
}

/** DELETE /api/orgs/[id]/entity-lists/[listId] — delete the list (cascades nodes). */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, listId } = await params;
  try { await gate(id); } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const existing = await prisma.entityList.findFirst({ where: { id: listId, orgId: id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.entityList.delete({ where: { id: listId } });
  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; structureId: string }> };

async function guardMut(id: string) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) throw new OrgContextError("Read-only: viewing another user", 403);
  await requireOrgAdminFor(session, await cookies(), id);
}

/** PUT — rename a structure. */
export async function PUT(req: Request, { params }: Params) {
  const { id, structureId } = await params;
  try { await guardMut(id); }
  catch (err) { if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status }); throw err; }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  // Scope the update to this org so one org can't rename another's structure.
  const res = await prisma.entityStructure.updateMany({ where: { id: structureId, orgId: id }, data: { name } });
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove a structure and its lists/nodes (cascade). */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, structureId } = await params;
  try { await guardMut(id); }
  catch (err) { if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status }); throw err; }

  const res = await prisma.entityStructure.deleteMany({ where: { id: structureId, orgId: id } });
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

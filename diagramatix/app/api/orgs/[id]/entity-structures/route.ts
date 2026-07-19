import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { STRUCTURE_LIST_KINDS, ENTITY_LIST_KIND_LABELS } from "@/app/lib/entityLists/types";

type Params = { params: Promise<{ id: string }> };

async function guard(id: string) {
  const session = await auth();
  await requireOrgAdminFor(session, await cookies(), id);
  return session;
}

/** GET /api/orgs/[id]/entity-structures — the org's named Entity Structures,
 *  each with its (up to five) lists + nodes. SuperAdmin OR Owner/Admin. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try { await guard(id); }
  catch (err) { if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status }); throw err; }

  const structures = await prisma.entityStructure.findMany({
    where: { orgId: id },
    orderBy: { name: "asc" },
    include: { lists: { include: { nodes: { orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] } } } },
  });
  return NextResponse.json({ structures });
}

/** POST /api/orgs/[id]/entity-structures { name } — create a structure with its
 *  five empty lists (Organisation Hierarchy, External Participants, IT Systems,
 *  Documents, Data Stores). */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  const { id } = await params;
  try { await requireOrgAdminFor(session, await cookies(), id); }
  catch (err) { if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status }); throw err; }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New structure";

  const structure = await prisma.$transaction(async (tx) => {
    const s = await tx.entityStructure.create({ data: { name, orgId: id } });
    for (const kind of STRUCTURE_LIST_KINDS) {
      await tx.entityList.create({ data: { name: ENTITY_LIST_KIND_LABELS[kind], kind, orgId: id, structureId: s.id } });
    }
    return tx.entityStructure.findUnique({
      where: { id: s.id },
      include: { lists: { include: { nodes: true } } },
    });
  });
  return NextResponse.json({ structure }, { status: 201 });
}

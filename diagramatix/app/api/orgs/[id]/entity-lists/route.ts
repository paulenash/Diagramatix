import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { ENTITY_LIST_KINDS, type EntityListKind } from "@/app/lib/entityLists/types";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/orgs/[id]/entity-lists[?kind=OrgStructure]
 * List the org's master entity lists (with their nodes). SuperAdmin OR
 * Owner/Admin in this org (requireOrgAdminFor).
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const kind = new URL(req.url).searchParams.get("kind") as EntityListKind | null;
  const lists = await prisma.entityList.findMany({
    where: { orgId: id, ...(kind && ENTITY_LIST_KINDS.includes(kind) ? { kind } : {}) },
    orderBy: { name: "asc" },
    include: { nodes: { orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] } },
  });
  return NextResponse.json({ lists });
}

/**
 * POST /api/orgs/[id]/entity-lists  { name, kind }
 * Create a new master entity list for the org.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const kind = body.kind as EntityListKind;
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!ENTITY_LIST_KINDS.includes(kind)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  const list = await prisma.entityList.create({ data: { name, kind, orgId: id } });
  return NextResponse.json({ list: { ...list, nodes: [] } }, { status: 201 });
}

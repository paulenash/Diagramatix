import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { ENTITY_LIST_KINDS, type EntityListKind } from "@/app/lib/entityLists/types";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/entity-lists[?kind=]
 * The project's own entity lists (with nodes). Gated at "view" so any
 * editor/viewer can load naming suggestions in the diagram editor.
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const kind = new URL(req.url).searchParams.get("kind") as EntityListKind | null;
  const lists = await prisma.entityList.findMany({
    where: { projectId: id, ...(kind && ENTITY_LIST_KINDS.includes(kind) ? { kind } : {}) },
    orderBy: { name: "asc" },
    include: { nodes: { orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] } },
  });
  return NextResponse.json({ lists });
}

/** POST /api/projects/[id]/entity-lists { name, kind } — owner only. */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const kind = body.kind as EntityListKind;
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!ENTITY_LIST_KINDS.includes(kind)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  const list = await prisma.entityList.create({ data: { name, kind, projectId: id } });
  return NextResponse.json({ list: { ...list, nodes: [] } }, { status: 201 });
}

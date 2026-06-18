import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { createNode, NodeOpError } from "@/app/lib/entityLists/nodeOps";

type Params = { params: Promise<{ id: string; listId: string }> };

/** POST /api/orgs/[id]/entity-lists/[listId]/nodes  { name, level, parentId?, sortOrder? } */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, listId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const list = await prisma.entityList.findFirst({ where: { id: listId, orgId: id }, select: { id: true } });
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  try {
    const node = await createNode(listId, await req.json());
    return NextResponse.json({ node }, { status: 201 });
  } catch (err) {
    if (err instanceof NodeOpError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

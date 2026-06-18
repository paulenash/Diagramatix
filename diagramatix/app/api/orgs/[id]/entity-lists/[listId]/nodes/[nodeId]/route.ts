import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { updateNode, deleteNode, NodeOpError } from "@/app/lib/entityLists/nodeOps";

type Params = { params: Promise<{ id: string; listId: string; nodeId: string }> };

async function gate(orgId: string, listId: string) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    throw new OrgContextError("Read-only: viewing another user", 403);
  }
  await requireOrgAdminFor(session, await cookies(), orgId);
  const list = await prisma.entityList.findFirst({ where: { id: listId, orgId }, select: { id: true } });
  if (!list) throw new OrgContextError("List not found", 404);
}

/** PUT /api/orgs/[id]/entity-lists/[listId]/nodes/[nodeId] — rename/move/reorder. */
export async function PUT(req: Request, { params }: Params) {
  const { id, listId, nodeId } = await params;
  try {
    await gate(id, listId);
    const node = await updateNode(listId, nodeId, await req.json());
    return NextResponse.json({ node });
  } catch (err) {
    if (err instanceof OrgContextError || err instanceof NodeOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/** DELETE /api/orgs/[id]/entity-lists/[listId]/nodes/[nodeId] — cascades children. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, listId, nodeId } = await params;
  try {
    await gate(id, listId);
    await deleteNode(listId, nodeId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof OrgContextError || err instanceof NodeOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

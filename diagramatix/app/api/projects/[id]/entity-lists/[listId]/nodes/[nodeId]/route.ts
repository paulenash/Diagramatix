import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { updateNode, deleteNode, NodeOpError } from "@/app/lib/entityLists/nodeOps";

type Params = { params: Promise<{ id: string; listId: string; nodeId: string }> };

async function ownerGate(projectId: string, listId: string) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    throw new OrgContextError("Read-only: viewing another user", 403);
  }
  await requireProjectAccess(session, await cookies(), projectId, "owner");
  const list = await prisma.entityList.findFirst({ where: { id: listId, projectId }, select: { id: true } });
  if (!list) throw new OrgContextError("List not found", 404);
}

/** PUT — rename/move/reorder a node. Owner only. */
export async function PUT(req: Request, { params }: Params) {
  const { id, listId, nodeId } = await params;
  try {
    await ownerGate(id, listId);
    const node = await updateNode(listId, nodeId, await req.json());
    return NextResponse.json({ node });
  } catch (err) {
    if (err instanceof OrgContextError || err instanceof NodeOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/** DELETE — remove a node (cascades children). Owner only. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, listId, nodeId } = await params;
  try {
    await ownerGate(id, listId);
    await deleteNode(listId, nodeId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof OrgContextError || err instanceof NodeOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

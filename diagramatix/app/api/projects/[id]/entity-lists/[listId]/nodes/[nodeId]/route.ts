import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { updateNode, deleteNode, moveNode, MOVE_ACTIONS, NodeOpError, type MoveAction } from "@/app/lib/entityLists/nodeOps";

type Params = { params: Promise<{ id: string; listId: string; nodeId: string }> };

// Edit access — consistent with adding a node (POST /nodes uses "edit"). A
// shared editor who can add entries can also rename / move / delete them.
async function editGate(projectId: string, listId: string) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    throw new OrgContextError("Read-only: viewing another user", 403);
  }
  await requireProjectAccess(session, await cookies(), projectId, "edit");
  const list = await prisma.entityList.findFirst({ where: { id: listId, projectId }, select: { id: true } });
  if (!list) throw new OrgContextError("List not found", 404);
}

/** PUT — rename a node, OR move it between levels via `{ action }`
 *  (promote/demote/up/down). Edit access. */
export async function PUT(req: Request, { params }: Params) {
  const { id, listId, nodeId } = await params;
  try {
    await editGate(id, listId);
    const body = await req.json();
    if (body && MOVE_ACTIONS.includes(body.action)) {
      await moveNode(listId, nodeId, body.action as MoveAction);
      return NextResponse.json({ ok: true });
    }
    const node = await updateNode(listId, nodeId, body);
    return NextResponse.json({ node });
  } catch (err) {
    if (err instanceof OrgContextError || err instanceof NodeOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/** DELETE — remove a node (cascades children). Edit access. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, listId, nodeId } = await params;
  try {
    await editGate(id, listId);
    await deleteNode(listId, nodeId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof OrgContextError || err instanceof NodeOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

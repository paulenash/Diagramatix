import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { createNode, NodeOpError } from "@/app/lib/entityLists/nodeOps";

type Params = { params: Promise<{ id: string; listId: string }> };

/**
 * POST /api/projects/[id]/entity-lists/[listId]/nodes { name, level, parentId? }
 * Gated at "edit" (NOT "owner"): this is the canvas "new typed name →
 * confirm placement" call — an editor naming a pool must be able to add the
 * new name to the project structure. Structural edits (PUT/DELETE) stay owner.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, listId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const list = await prisma.entityList.findFirst({ where: { id: listId, projectId: id }, select: { id: true } });
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  try {
    const node = await createNode(listId, await req.json());
    return NextResponse.json({ node }, { status: 201 });
  } catch (err) {
    if (err instanceof NodeOpError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

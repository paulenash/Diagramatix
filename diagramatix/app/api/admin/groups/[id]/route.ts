/**
 * DELETE /api/admin/groups/[id]
 *   Superuser-only. Deletes ANY CollaborationGroup, including Org
 *   auto-groups (the non-admin endpoint at /api/groups/[id] refuses
 *   to delete those). Cascade removes members + transfers + the
 *   member-status notifications via Prisma's onDelete: Cascade chain.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const group = await prisma.collaborationGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.collaborationGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

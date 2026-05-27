/**
 * POST /api/groups/[id]/transfer   { toUserId }
 *   Owner-only. Creates a pending OwnershipTransfer + notifies the
 *   recipient (ownership-transfer). Recipient must already be an
 *   accepted member of the group. Only one transfer can be pending
 *   per group at a time — superseding any prior pending row.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { createNotification } from "@/app/lib/notifications";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = session.user.id;
  const { id: groupId } = await context.params;

  let body: { toUserId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const toUserId = (body.toUserId ?? "").trim();
  if (!toUserId) return NextResponse.json({ error: "Missing toUserId" }, { status: 400 });

  const group = await prisma.collaborationGroup.findUnique({
    where: { id: groupId },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (group.ownerId !== callerId) {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }
  if (toUserId === callerId) {
    return NextResponse.json({ error: "Cannot transfer to yourself" }, { status: 400 });
  }

  const targetMember = await prisma.collaborationGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: toUserId } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!targetMember || targetMember.status !== "accepted") {
    return NextResponse.json({ error: "Target must be an accepted member" }, { status: 400 });
  }

  // Cancel any prior pending transfer on this group.
  await prisma.ownershipTransfer.updateMany({
    where: { groupId, status: "pending" },
    data: { status: "cancelled", resolvedAt: new Date() },
  });

  const transfer = await prisma.ownershipTransfer.create({
    data: {
      groupId,
      fromUserId: callerId,
      toUserId,
      status: "pending",
    },
  });

  await createNotification(toUserId, "ownership-transfer", {
    groupId: group.id,
    groupName: group.name,
    fromUserId: group.owner.id,
    fromUserName: group.owner.name,
    fromUserEmail: group.owner.email,
    transferId: transfer.id,
  });

  return NextResponse.json({ ok: true, transferId: transfer.id });
}

/**
 * POST /api/groups/[id]/transfer/[transferId]   { action }
 *   action="accept"  — recipient accepts; group.ownerId swaps.
 *   action="decline" — recipient declines; transfer marked declined.
 *   action="cancel"  — original owner cancels their pending transfer.
 *
 *   Both parties get a notification on accept/decline.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { createNotification } from "@/app/lib/notifications";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; transferId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = session.user.id;
  const { id: groupId, transferId } = await context.params;

  let body: { action?: "accept" | "decline" | "cancel" };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = body.action;
  if (!action || !["accept", "decline", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const transfer = await prisma.ownershipTransfer.findUnique({
    where: { id: transferId },
    include: {
      fromUser: { select: { id: true, name: true, email: true } },
      toUser:   { select: { id: true, name: true, email: true } },
      group:    true,
    },
  });
  if (!transfer || transfer.groupId !== groupId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (transfer.status !== "pending") {
    return NextResponse.json({ error: `Transfer already ${transfer.status}` }, { status: 400 });
  }

  if (action === "accept" || action === "decline") {
    if (callerId !== transfer.toUserId) {
      return NextResponse.json({ error: "Recipient only" }, { status: 403 });
    }
  }
  if (action === "cancel") {
    if (callerId !== transfer.fromUserId) {
      return NextResponse.json({ error: "From-user only" }, { status: 403 });
    }
  }

  if (action === "accept") {
    // Swap ownership atomically. The previous owner becomes an accepted
    // member; the new owner is already accepted.
    await prisma.$transaction([
      prisma.collaborationGroup.update({
        where: { id: groupId },
        data: { ownerId: transfer.toUserId },
      }),
      // Ensure previous owner has an accepted membership row.
      prisma.collaborationGroupMember.upsert({
        where: { groupId_userId: { groupId, userId: transfer.fromUserId } },
        create: { groupId, userId: transfer.fromUserId, status: "accepted", joinedAt: new Date() },
        update: { status: "accepted", joinedAt: new Date() },
      }),
      prisma.ownershipTransfer.update({
        where: { id: transferId },
        data: { status: "accepted", resolvedAt: new Date() },
      }),
    ]);
    await createNotification(transfer.fromUserId, "ownership-transfer-accepted", {
      groupId,
      groupName: transfer.group.name,
      fromUserId: transfer.toUser.id,
      fromUserName: transfer.toUser.name,
      fromUserEmail: transfer.toUser.email,
      transferId,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    await prisma.ownershipTransfer.update({
      where: { id: transferId },
      data: { status: "declined", resolvedAt: new Date() },
    });
    await createNotification(transfer.fromUserId, "ownership-transfer-declined", {
      groupId,
      groupName: transfer.group.name,
      fromUserId: transfer.toUser.id,
      fromUserName: transfer.toUser.name,
      fromUserEmail: transfer.toUser.email,
      transferId,
    });
    return NextResponse.json({ ok: true });
  }

  // cancel
  await prisma.ownershipTransfer.update({
    where: { id: transferId },
    data: { status: "cancelled", resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

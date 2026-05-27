/**
 * POST /api/groups/[id]/members
 *   Invite a set of users to a group. Owner only. Body { userIds }.
 *   Creates a CollaborationGroupMember row (status="invited") for each
 *   userId AND a Notification for each so the recipients see it in
 *   their bell. Skips users who are already invited/accepted in this
 *   group (idempotent re-invite of left/declined users reinstates the
 *   row as invited).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { createNotifications } from "@/app/lib/notifications";

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

  const group = await prisma.collaborationGroup.findUnique({
    where: { id: groupId },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (group.ownerId !== callerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userIds?: string[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const userIds = Array.isArray(body.userIds) ? [...new Set(body.userIds)] : null;
  if (!userIds || userIds.length === 0) {
    return NextResponse.json({ error: "Missing userIds" }, { status: 400 });
  }

  // Look up which user ids are valid + their existing membership.
  const [users, existing] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.collaborationGroupMember.findMany({
      where: { groupId, userId: { in: userIds } },
    }),
  ]);
  const validUserIds = new Set(users.map(u => u.id));
  const existingByUserId = new Map(existing.map(e => [e.userId, e]));

  const newlyInvited: { userId: string; name: string | null; email: string }[] = [];
  for (const u of users) {
    if (!validUserIds.has(u.id)) continue;
    if (u.id === callerId) continue;          // owner can't invite themselves
    const ex = existingByUserId.get(u.id);
    if (ex) {
      // Already invited/accepted → skip. Left/declined → revive as
      // invited so the user gets another chance via the bell.
      if (ex.status === "invited" || ex.status === "accepted") continue;
      await prisma.collaborationGroupMember.update({
        where: { id: ex.id },
        data: { status: "invited", invitedAt: new Date(), invitedById: callerId, joinedAt: null },
      });
    } else {
      await prisma.collaborationGroupMember.create({
        data: {
          groupId,
          userId: u.id,
          status: "invited",
          invitedById: callerId,
        },
      });
    }
    newlyInvited.push({ userId: u.id, name: u.name, email: u.email });
  }

  if (newlyInvited.length > 0) {
    await createNotifications(
      newlyInvited.map(u => ({
        userId: u.userId,
        type: "group-invite" as const,
        payload: {
          groupId: group.id,
          groupName: group.name,
          fromUserId: group.owner.id,
          fromUserName: group.owner.name,
          fromUserEmail: group.owner.email,
        },
      })),
    );
  }

  return NextResponse.json({ ok: true, invited: newlyInvited.length });
}

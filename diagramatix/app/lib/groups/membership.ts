/**
 * Collaboration-group membership operations, extracted verbatim from the group
 * member routes so the owner-only invite gate + member self-service transitions
 * + their notification side-effects can be unit-tested directly against the DB.
 *
 *  - inviteGroupMembers  ← POST /api/groups/[id]/members
 *  - groupMemberAction   ← POST /api/groups/[id]/members/[userId]
 *
 * The routes keep their auth 401 + JSON parsing + status-code shaping; the data
 * effects (member rows + notifications) live here, unchanged.
 */

import { prisma } from "@/app/lib/db";
import { createNotification, createNotifications } from "@/app/lib/notifications";

export type GroupMemberAction = "accept" | "decline" | "leave" | "remove";

/**
 * Invite a set of users to a group. Owner only. Creates a
 * CollaborationGroupMember row (status="invited") for each valid userId AND a
 * group-invite Notification for each. Skips the owner inviting themselves and
 * users already invited/accepted; revives left/declined rows as invited.
 */
export async function inviteGroupMembers(
  groupId: string,
  callerId: string,
  userIds: string[],
): Promise<{ ok: true; invited: number } | { error: string; status: number }> {
  const group = await prisma.collaborationGroup.findUnique({
    where: { id: groupId },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!group) return { error: "Not found", status: 404 };
  if (group.ownerId !== callerId) {
    return { error: "Forbidden", status: 403 };
  }

  const dedupedUserIds = [...new Set(userIds)];

  // Look up which user ids are valid + their existing membership.
  const [users, existing] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: dedupedUserIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.collaborationGroupMember.findMany({
      where: { groupId, userId: { in: dedupedUserIds } },
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

  return { ok: true, invited: newlyInvited.length };
}

/**
 * Single-member membership transition.
 *   accept  — invitee accepts their own invitation (notifies owner)
 *   decline — invitee declines their own invitation (notifies owner)
 *   leave   — accepted member leaves the group (silent)
 *   remove  — owner removes any other member (notifies the removed user)
 */
export async function groupMemberAction(
  groupId: string,
  callerId: string,
  targetUserId: string,
  action: GroupMemberAction,
): Promise<{ ok: true; status: string } | { error: string; status: number }> {
  const group = await prisma.collaborationGroup.findUnique({
    where: { id: groupId },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!group) return { error: "Not found", status: 404 };

  const member = await prisma.collaborationGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!member) return { error: "Member not found", status: 404 };

  // Permission checks per action.
  if (action === "accept" || action === "decline" || action === "leave") {
    if (callerId !== targetUserId) {
      return { error: "Forbidden", status: 403 };
    }
  }
  if (action === "remove") {
    if (callerId !== group.ownerId) {
      return { error: "Owner only", status: 403 };
    }
    if (targetUserId === group.ownerId) {
      return { error: "Owner can't remove themselves; transfer ownership first", status: 400 };
    }
  }

  // State checks.
  if (action === "accept" && member.status !== "invited") {
    return { error: `Cannot accept a ${member.status} invitation`, status: 400 };
  }
  if (action === "decline" && member.status !== "invited") {
    return { error: `Cannot decline a ${member.status} invitation`, status: 400 };
  }
  if (action === "leave" && member.status !== "accepted") {
    return { error: "Only accepted members can leave", status: 400 };
  }
  if (action === "leave" && targetUserId === group.ownerId) {
    return { error: "Owner can't leave; transfer ownership first", status: 400 };
  }
  if (action === "remove" && member.status !== "accepted" && member.status !== "invited") {
    return { error: `Cannot remove a ${member.status} member`, status: 400 };
  }

  // Apply.
  let newStatus: string;
  switch (action) {
    case "accept":
      newStatus = "accepted";
      await prisma.collaborationGroupMember.update({
        where: { id: member.id },
        data: { status: newStatus, joinedAt: new Date() },
      });
      await createNotification(group.ownerId, "group-invite-accepted", {
        groupId: group.id,
        groupName: group.name,
        fromUserId: member.user.id,
        fromUserName: member.user.name,
        fromUserEmail: member.user.email,
      });
      break;
    case "decline":
      newStatus = "declined";
      await prisma.collaborationGroupMember.update({
        where: { id: member.id },
        data: { status: newStatus },
      });
      await createNotification(group.ownerId, "group-invite-declined", {
        groupId: group.id,
        groupName: group.name,
        fromUserId: member.user.id,
        fromUserName: member.user.name,
        fromUserEmail: member.user.email,
      });
      break;
    case "leave":
      newStatus = "left";
      await prisma.collaborationGroupMember.update({
        where: { id: member.id },
        data: { status: newStatus },
      });
      break;
    case "remove":
      newStatus = "removed";
      await prisma.collaborationGroupMember.update({
        where: { id: member.id },
        data: { status: newStatus },
      });
      await createNotification(member.user.id, "group-removed", {
        groupId: group.id,
        groupName: group.name,
        fromUserId: group.owner.id,
        fromUserName: group.owner.name,
        fromUserEmail: group.owner.email,
      });
      break;
  }

  return { ok: true, status: newStatus };
}

/**
 * POST /api/groups/[id]/members/[userId]   { action }
 *   Single-member membership transitions.
 *   action="accept"  — invitee accepts their own invitation
 *   action="decline" — invitee declines their own invitation
 *   action="leave"   — accepted member leaves the group
 *   action="remove"  — owner removes any other member
 *
 *   On accept: notifies the owner (group-invite-accepted).
 *   On decline: notifies the owner (group-invite-declined).
 *   On remove: notifies the removed user (group-removed).
 *   On leave: no notification (silent).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { createNotification } from "@/app/lib/notifications";

type Action = "accept" | "decline" | "leave" | "remove";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = session.user.id;
  const { id: groupId, userId: targetUserId } = await context.params;

  let body: { action?: Action };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = body.action;
  if (!action || !["accept", "decline", "leave", "remove"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const group = await prisma.collaborationGroup.findUnique({
    where: { id: groupId },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await prisma.collaborationGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Permission checks per action.
  if (action === "accept" || action === "decline" || action === "leave") {
    if (callerId !== targetUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (action === "remove") {
    if (callerId !== group.ownerId) {
      return NextResponse.json({ error: "Owner only" }, { status: 403 });
    }
    if (targetUserId === group.ownerId) {
      return NextResponse.json({ error: "Owner can't remove themselves; transfer ownership first" }, { status: 400 });
    }
  }

  // State checks.
  if (action === "accept" && member.status !== "invited") {
    return NextResponse.json({ error: `Cannot accept a ${member.status} invitation` }, { status: 400 });
  }
  if (action === "decline" && member.status !== "invited") {
    return NextResponse.json({ error: `Cannot decline a ${member.status} invitation` }, { status: 400 });
  }
  if (action === "leave" && member.status !== "accepted") {
    return NextResponse.json({ error: "Only accepted members can leave" }, { status: 400 });
  }
  if (action === "leave" && targetUserId === group.ownerId) {
    return NextResponse.json({ error: "Owner can't leave; transfer ownership first" }, { status: 400 });
  }
  if (action === "remove" && member.status !== "accepted" && member.status !== "invited") {
    return NextResponse.json({ error: `Cannot remove a ${member.status} member` }, { status: 400 });
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

  return NextResponse.json({ ok: true, status: newStatus });
}

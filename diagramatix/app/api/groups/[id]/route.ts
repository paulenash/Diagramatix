/**
 * Per-group detail + admin actions.
 *
 *   GET    /api/groups/[id]
 *     Group detail incl. member list + pending ownership transfers.
 *     Caller must be the owner or an accepted/invited member.
 *
 *   PATCH  /api/groups/[id]   { name }
 *     Rename (owner only). Org auto-groups are read-only.
 *
 *   DELETE /api/groups/[id]
 *     Delete (owner only). Org auto-groups can't be deleted.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

async function loadGroupForUser(groupId: string, userId: string) {
  const group = await prisma.collaborationGroup.findUnique({
    where: { id: groupId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          invitedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { invitedAt: "asc" },
      },
      transfers: {
        where: { status: "pending" },
        include: {
          fromUser: { select: { id: true, name: true, email: true } },
          toUser:   { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!group) return { error: "Not found", status: 404 as const };
  const isOwner = group.ownerId === userId;
  const myMember = group.members.find(m => m.userId === userId);
  const canSee = isOwner || (myMember && (myMember.status === "accepted" || myMember.status === "invited"));
  if (!canSee) return { error: "Forbidden", status: 403 as const };
  return { group, isOwner, myMember };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const r = await loadGroupForUser(id, session.user.id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { group, isOwner, myMember } = r;
  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
      isOrgGroup: group.isOrgGroup,
      ownerId: group.ownerId,
      ownerName: group.owner.name,
      ownerEmail: group.owner.email,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    },
    isOwner,
    myStatus: myMember?.status ?? null,
    members: group.members.map(m => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      status: m.status,
      invitedAt: m.invitedAt.toISOString(),
      joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
      invitedByName: m.invitedBy?.name ?? null,
      invitedByEmail: m.invitedBy?.email ?? null,
    })),
    pendingTransfers: group.transfers.map(t => ({
      id: t.id,
      fromUserId: t.fromUserId,
      fromName: t.fromUser.name,
      fromEmail: t.fromUser.email,
      toUserId: t.toUserId,
      toName: t.toUser.name,
      toEmail: t.toUser.email,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const group = await prisma.collaborationGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (group.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (group.isOrgGroup) {
    return NextResponse.json({ error: "Org groups cannot be renamed" }, { status: 400 });
  }
  let body: { name?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (name.length === 0 || name.length > 80) {
    return NextResponse.json({ error: "Group name 1-80 chars" }, { status: 400 });
  }
  await prisma.collaborationGroup.update({ where: { id }, data: { name } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const group = await prisma.collaborationGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (group.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (group.isOrgGroup) {
    return NextResponse.json({ error: "Org groups cannot be deleted" }, { status: 400 });
  }
  // Owner must be the sole occupant — any other user in invited or
  // accepted state blocks deletion. Transfer ownership or remove
  // the other members first.
  const otherActive = await prisma.collaborationGroupMember.count({
    where: {
      groupId: id,
      userId: { not: group.ownerId },
      status: { in: ["invited", "accepted"] },
    },
  });
  if (otherActive > 0) {
    return NextResponse.json(
      { error: "Remove all other members before deleting the group" },
      { status: 400 },
    );
  }
  await prisma.collaborationGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

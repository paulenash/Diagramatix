/**
 * GET /api/admin/groups
 *   Superuser-only. Returns every CollaborationGroup with its members
 *   (any status) + owner details. Used by the admin Groups page to
 *   surface ALL groups (including Org auto-groups) for moderation.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const groups = await prisma.collaborationGroup.findMany({
    orderBy: [{ isOrgGroup: "desc" }, { name: "asc" }],
    include: {
      owner: { select: { id: true, name: true, email: true } },
      org: { select: { id: true, name: true } },
      members: {
        orderBy: { invitedAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return NextResponse.json({
    groups: groups.map(g => ({
      id: g.id,
      name: g.name,
      isOrgGroup: g.isOrgGroup,
      orgName: g.org?.name ?? null,
      ownerId: g.ownerId,
      ownerName: g.owner.name,
      ownerEmail: g.owner.email,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      members: g.members.map(m => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        status: m.status,
        invitedAt: m.invitedAt.toISOString(),
        joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
      })),
    })),
  });
}

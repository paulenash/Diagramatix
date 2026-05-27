/**
 * Collaboration Groups list + create.
 *
 *   GET  /api/groups
 *     Returns every group the signed-in user owns OR is an accepted /
 *     invited member of. Each row includes the user's role
 *     ("owner" | "invited" | "member"), member counts, and the Org
 *     flag. Used by the Collaboration Groups dashboard page.
 *
 *   POST /api/groups
 *     Body { name }. Creates a new user-owned group with the caller as
 *     ownerId + an `accepted` member row for themselves. orgId is left
 *     null; users can additionally belong to their Org's auto-created
 *     group (created by scripts/seed-org-groups.ts on deploy).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

interface GroupRowOut {
  id: string;
  name: string;
  isOrgGroup: boolean;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string;
  role: "owner" | "invited" | "member";
  myStatus: string; // for invited/member rows
  memberCount: number;
  invitedCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [owned, memberships] = await Promise.all([
    prisma.collaborationGroup.findMany({
      where: { ownerId: userId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: { select: { status: true } },
      },
      orderBy: [{ isOrgGroup: "desc" }, { createdAt: "asc" }],
    }),
    prisma.collaborationGroupMember.findMany({
      where: { userId, status: { in: ["invited", "accepted"] } },
      include: {
        group: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
            members: { select: { status: true } },
          },
        },
      },
      orderBy: { invitedAt: "desc" },
    }),
  ]);

  const out: GroupRowOut[] = [];
  for (const g of owned) {
    out.push({
      id: g.id,
      name: g.name,
      isOrgGroup: g.isOrgGroup,
      ownerId: g.ownerId,
      ownerName: g.owner.name,
      ownerEmail: g.owner.email,
      role: "owner",
      myStatus: "accepted",
      memberCount: g.members.filter(m => m.status === "accepted").length,
      invitedCount: g.members.filter(m => m.status === "invited").length,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    });
  }
  for (const m of memberships) {
    // Skip if the user is also the owner (already in `owned`).
    if (m.group.ownerId === userId) continue;
    out.push({
      id: m.group.id,
      name: m.group.name,
      isOrgGroup: m.group.isOrgGroup,
      ownerId: m.group.ownerId,
      ownerName: m.group.owner.name,
      ownerEmail: m.group.owner.email,
      role: m.status === "invited" ? "invited" : "member",
      myStatus: m.status,
      memberCount: m.group.members.filter(x => x.status === "accepted").length,
      invitedCount: m.group.members.filter(x => x.status === "invited").length,
      createdAt: m.group.createdAt.toISOString(),
      updatedAt: m.group.updatedAt.toISOString(),
    });
  }
  return NextResponse.json({ groups: out });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (name.length === 0) {
    return NextResponse.json({ error: "Group name required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Group name too long (max 80)" }, { status: 400 });
  }

  const group = await prisma.collaborationGroup.create({
    data: {
      name,
      ownerId: userId,
      members: {
        create: { userId, status: "accepted", joinedAt: new Date() },
      },
    },
  });
  return NextResponse.json({ group: { id: group.id, name: group.name } });
}

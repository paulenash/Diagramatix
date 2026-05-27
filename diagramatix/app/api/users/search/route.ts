/**
 * GET /api/users/search?q=...
 *   Type-ahead search across every registered Diagramatix user. Used
 *   by the Collaboration Groups invite UI — owner types a name or
 *   email fragment, gets matching users back. Names are non-unique
 *   so the UI shows email next to each match for disambiguation.
 *
 *   Auth required. Empty / very short queries return empty.
 *   Excludes the caller themselves (you can't invite yourself).
 *
 *   Optional ?excludeGroupId=<id> — also excludes users who are
 *   already in that group (status in invited|accepted) so the
 *   invite UI doesn't surface duplicates.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

const MAX_RESULTS = 20;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const excludeGroupId = url.searchParams.get("excludeGroupId");

  if (q.length < 1) {
    return NextResponse.json({ users: [] });
  }

  const callerId = session.user.id;

  // Collect already-in-group user ids if asked.
  let excludedUserIds: Set<string> = new Set([callerId]);
  if (excludeGroupId) {
    const inGroup = await prisma.collaborationGroupMember.findMany({
      where: {
        groupId: excludeGroupId,
        status: { in: ["invited", "accepted"] },
      },
      select: { userId: true },
    });
    for (const m of inGroup) excludedUserIds.add(m.userId);
  }

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { notIn: [...excludedUserIds] } },
        {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: MAX_RESULTS,
  });

  return NextResponse.json({ users });
}

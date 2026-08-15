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
import { searchUsers } from "@/app/lib/userSearch";

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
  const excludedUserIds: Set<string> = new Set();
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

  // SEC-08: the scoping (colleagues by partial match; everyone else by exact
  // email only) lives in searchUsers so it's unit-tested directly.
  const users = await searchUsers({ callerId, q, excludeUserIds: excludedUserIds, max: MAX_RESULTS });

  return NextResponse.json({ users });
}

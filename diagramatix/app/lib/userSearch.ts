import { prisma } from "@/app/lib/db";

export interface UserSearchResult { id: string; name: string | null; email: string }

/**
 * SEC-08 — type-ahead user search that does NOT expose a cross-tenant directory.
 *
 * Colleagues (users who share an org with the caller) match on a partial name or
 * email fragment — you already know them. Everyone else matches ONLY by an exact
 * email address, so you can still invite an external collaborator whose address
 * you know (as bundle invite-by-email already allows), but a partial like
 * "@gmail.com" can't harvest a directory of every user's email.
 *
 * Extracted from the route so the scoping is unit-tested directly.
 */
export async function searchUsers(opts: {
  callerId: string;
  q: string;
  excludeUserIds?: Iterable<string>;
  max?: number;
}): Promise<UserSearchResult[]> {
  const q = opts.q.trim();
  if (!q) return [];
  const excluded = new Set<string>([opts.callerId, ...(opts.excludeUserIds ?? [])]);

  const callerOrgIds = (
    await prisma.orgMember.findMany({ where: { userId: opts.callerId }, select: { orgId: true } })
  ).map((m) => m.orgId);
  const sameOrgUserIds = callerOrgIds.length
    ? (await prisma.orgMember.findMany({ where: { orgId: { in: callerOrgIds } }, select: { userId: true } })).map((m) => m.userId)
    : [];

  const looksLikeEmail = q.includes("@");
  return prisma.user.findMany({
    where: {
      id: { notIn: [...excluded] },
      OR: [
        {
          id: { in: sameOrgUserIds },
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
        ...(looksLikeEmail ? [{ email: { equals: q, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: opts.max ?? 20,
  });
}

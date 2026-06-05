import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/share-candidates?q=...
 *
 * Powers the ProjectShareDialog's debounced search box. Returns up to 20
 * registered users matching the query against name or email, with these
 * exclusions applied server-side:
 *
 *   • the project owner (you cannot share with yourself), and
 *   • anyone already sharing this project (the dialog edits those rows
 *     via the per-share PUT/DELETE — no point listing them as new
 *     candidates).
 *
 * The candidate pool is scoped to the project's Org unless that Org has
 * allowCrossOrgSharing = true. This mirrors the access gate enforced by
 * the POST /shares route — picking a forbidden candidate from the list
 * is impossible, not "valid then 400'd later".
 *
 * Owner-only. Editors and viewers don't get to invite new sharers.
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let access;
  try {
    access = await requireProjectAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  // Empty query is intentionally allowed — the dialog opens with no
  // query and shows the most-recently-active candidates. A heavier
  // shop would rank these; we just give the dialog *something* to
  // render and let the user start typing.

  // Whom NOT to surface: the project owner, plus everyone already
  // sharing the project. Both kept in a Set for the IN-NOT predicate
  // below — tiny lists in practice.
  const exclude = new Set<string>([access.ownerUserId]);
  const existingShares = await prisma.projectShare.findMany({
    where: { projectId: id },
    select: { userId: true },
  });
  for (const s of existingShares) exclude.add(s.userId);

  // Cross-org gate. When the project's Org disallows external sharing,
  // restrict candidates to that Org's members. Otherwise the whole
  // user table is fair game.
  const project = await prisma.project.findUnique({
    where: { id },
    select: { orgId: true, org: { select: { allowCrossOrgSharing: true } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Build the candidate pool.
  let allowedUserIds: string[] | null = null;
  if (!project.org.allowCrossOrgSharing) {
    const members = await prisma.orgMember.findMany({
      where: { orgId: project.orgId },
      select: { userId: true },
    });
    allowedUserIds = members.map((m) => m.userId).filter((u) => !exclude.has(u));
    if (allowedUserIds.length === 0) {
      return NextResponse.json([]);
    }
  }

  // Two id-predicates in the same `where` object would collide on the key,
  // so we compose via AND. `allowedUserIds` already has the exclude set
  // filtered out, but we still apply `notIn` because the cross-org-open
  // path has no allowedUserIds and needs the exclusion too.
  const idClause = allowedUserIds
    ? { id: { in: allowedUserIds } }
    : { id: { notIn: Array.from(exclude) } };

  const users = await prisma.user.findMany({
    where: {
      ...idClause,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 20,
  });

  return NextResponse.json(users);
}

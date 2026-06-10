import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/[id]/audience-candidates?q=...&excludeIds=a,b,c
//
// Powers the audience picker in PublishBundleDialog. Returns up to 20
// registered users matching the query against name or email. The
// candidate pool is scoped to the project's Org unless that Org has
// allowCrossOrgSharing = true (same gate as ProjectShare / bundle POST).
//
// Differs from share-candidates: no exclusion of existing share
// recipients (bundle audiences are distinct from project shares — a
// VIEW share recipient can also be in a bundle audience without issue).
//
// `excludeIds` is a comma-separated list of user IDs already picked in
// the dialog's local audience list; surfacing them as candidates would
// just clutter the dropdown.
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const excludeIdsRaw = searchParams.get("excludeIds") ?? "";
  const exclude = new Set<string>(
    excludeIdsRaw.split(",").map(s => s.trim()).filter(s => s.length > 0),
  );

  const project = await prisma.project.findUnique({
    where: { id },
    select: { orgId: true, org: { select: { allowCrossOrgSharing: true } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let allowedUserIds: string[] | null = null;
  if (!project.org.allowCrossOrgSharing) {
    const members = await prisma.orgMember.findMany({
      where: { orgId: project.orgId },
      select: { userId: true },
    });
    allowedUserIds = members.map(m => m.userId).filter(u => !exclude.has(u));
    if (allowedUserIds.length === 0) {
      return NextResponse.json([]);
    }
  }

  const idClause = allowedUserIds
    ? { id: { in: allowedUserIds } }
    : exclude.size > 0
      ? { id: { notIn: Array.from(exclude) } }
      : {};

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

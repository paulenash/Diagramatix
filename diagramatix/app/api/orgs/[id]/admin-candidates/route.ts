import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/orgs/[id]/admin-candidates?q=...
 *
 * Search-as-you-type endpoint powering the "Add OrgAdmin" picker.
 *
 *   • **SuperAdmin** — candidates = every registered user, minus
 *     existing OrgAdmins/Owners of this Org. Adding a non-member
 *     creates a new OrgMember(role=Admin) row.
 *
 *   • **OrgAdmin** — candidates = existing OrgMembers of this Org
 *     with a role other than Owner/Admin. They can promote in-Org
 *     members but not pull in outsiders.
 *
 * Server-side exclusion mirrors the access gate so a forbidden
 * candidate cannot be selected at all.
 *
 * 20 row cap; UI uses a 250ms debounce.
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;

  let isSuperAdmin = false;
  try {
    const gate = await requireOrgAdminFor(session, await cookies(), id);
    isSuperAdmin = gate.isSuperAdmin;
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  // Existing OrgAdmins to exclude — they're already in the list above
  // the picker, so don't surface them as candidates.
  const existingAdmins = await prisma.orgMember.findMany({
    where: { orgId: id, role: { in: ["Owner", "Admin"] } },
    select: { userId: true },
  });
  const excludeUserIds = new Set(existingAdmins.map((m) => m.userId));

  // Search predicate — case-insensitive contains on name/email.
  const searchClause = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  if (isSuperAdmin) {
    // SuperAdmin: search all users, minus existing admins.
    const users = await prisma.user.findMany({
      where: {
        ...searchClause,
        ...(excludeUserIds.size > 0 ? { id: { notIn: [...excludeUserIds] } } : {}),
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 20,
      select: { id: true, name: true, email: true },
    });
    return NextResponse.json(users);
  }

  // OrgAdmin: scope to existing OrgMembers of this Org.
  const members = await prisma.orgMember.findMany({
    where: {
      orgId: id,
      ...(excludeUserIds.size > 0 ? { userId: { notIn: [...excludeUserIds] } } : {}),
      user: searchClause,
    },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(members.map((m) => m.user));
}

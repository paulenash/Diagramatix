import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";

// GET /api/notifications/audience
//
// Returns the set of users whose notification feed the caller may
// inspect, for the admin filter pickers on the Notifications page:
//   • SuperAdmin → scope "all": every registered user + their Org, plus
//     the distinct Org list for the Org filter dropdown.
//   • OrgAdmin (Owner/Admin) → scope "org": users in the caller's active
//     Org only.
//   • Anyone else → 403 (they only ever see their own feed).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSuperuser(session)) {
    // All users + their primary Org membership.
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        orgMembers: {
          select: { orgId: true, org: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { email: "asc" },
    });
    const orgMap = new Map<string, string>();
    const userRows = users.map(u => {
      const m = u.orgMembers[0];
      if (m) orgMap.set(m.orgId, m.org.name);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        orgId: m?.orgId ?? null,
        orgName: m?.org.name ?? null,
      };
    });
    const orgs = Array.from(orgMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ scope: "all", users: userRows, orgs });
  }

  // OrgAdmin path.
  const cookieStore = await cookies();
  const callerOrgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!callerOrgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const callerMembership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: callerOrgId, role: { in: ["Owner", "Admin"] } },
    select: { id: true },
  });
  if (!callerMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.orgMember.findMany({
    where: { orgId: callerOrgId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  const org = await prisma.org.findUnique({ where: { id: callerOrgId }, select: { name: true } });
  const userRows = members
    .map(m => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      orgId: callerOrgId,
      orgName: org?.name ?? null,
    }))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

  return NextResponse.json({
    scope: "org",
    users: userRows,
    orgs: org ? [{ id: callerOrgId, name: org.name }] : [],
  });
}

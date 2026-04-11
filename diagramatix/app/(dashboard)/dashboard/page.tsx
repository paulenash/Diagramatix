import { redirect } from "next/navigation";
import { execSync } from "child_process";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DashboardClient } from "./DashboardClient";
import { getEffectiveUserId, isImpersonating, isSuperuser } from "@/app/lib/superuser";
import { ARCHIVE_PROJECT_NAME } from "@/app/lib/archive";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  let effectiveUserId = getEffectiveUserId(session, cookieStore);
  let viewing = isImpersonating(session, cookieStore);

  // Validate impersonation target exists — clear stale cookie if not
  if (viewing) {
    const target = await prisma.user.findUnique({ where: { id: effectiveUserId }, select: { id: true } });
    if (!target) {
      cookieStore.delete("dgx_view_as");
      effectiveUserId = session.user.id;
      viewing = false;
    }
  }

  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!orgId) {
    // Should never happen after Phase 0 backfill, but render an empty
    // dashboard rather than crashing.
    return (
      <DashboardClient
        projects={[]}
        unorganized={[]}
        userName={session.user.name ?? "User"}
        userEmail={session.user.email ?? ""}
        version={0}
        readOnly={false}
        viewingAsName=""
        viewingAsEmail=""
        isSuperuser={isSuperuser(session)}
      />
    );
  }

  // Fetch current user name/email from DB (session JWT may be stale after profile edit)
  const currentUser = await prisma.user.findUnique({
    where: { id: effectiveUserId },
    select: { name: true, email: true },
  });

  const [projects, unorganized, org] = await Promise.all([
    prisma.project.findMany({
      where: { userId: effectiveUserId, orgId, name: { not: ARCHIVE_PROJECT_NAME } },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { diagrams: true } } },
    }),
    prisma.diagram.findMany({
      where: { userId: effectiveUserId, orgId, projectId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, type: true, createdAt: true, updatedAt: true },
    }),
    prisma.org.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);

  // If impersonating, fetch the target user's info for the banner
  let viewingAsName = "";
  let viewingAsEmail = "";
  if (viewing) {
    const target = await prisma.user.findUnique({
      where: { id: effectiveUserId },
      select: { name: true, email: true },
    });
    viewingAsName = target?.name ?? "";
    viewingAsEmail = target?.email ?? "";
  }

  let commitCount = 0;
  try {
    commitCount = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 0;
  } catch { /* fallback to 0 */ }

  return (
    <DashboardClient
      projects={projects}
      unorganized={unorganized}
      userName={currentUser?.name ?? session.user.name ?? "User"}
      userEmail={currentUser?.email ?? session.user.email ?? ""}
      orgName={org?.name ?? ""}
      version={commitCount}
      readOnly={viewing}
      viewingAsName={viewingAsName}
      viewingAsEmail={viewingAsEmail}
      isSuperuser={isSuperuser(session)}
    />
  );
}

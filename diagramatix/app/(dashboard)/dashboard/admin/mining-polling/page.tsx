import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";
import { MiningPollingClient, type PollingRow } from "./MiningPollingClient";

export const metadata = { title: "Live-source Polling — Admin" };

/**
 * Manage DiagramatixMINER live-source polling across projects.
 *   • SuperAdmin (acting) → every project's live sources.
 *   • OrgAdmin (Owner/Admin of the active org) → their org's live sources only.
 * Turn per-source automatic polling on/off (writes MiningSource.autoRefresh via the
 * existing project-scoped PATCH route, which already elevates all three roles).
 */
export default async function MiningPollingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const su = await isActingSuperuser(session);
  const cookieStore = await cookies();
  const activeOrgId = await getCurrentOrgId(session, cookieStore);
  let scopeName: string | null = null;

  if (!su) {
    const membership = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId: activeOrgId },
      select: { role: true, org: { select: { name: true } } },
    });
    const isOrgAdmin = membership?.role === "Owner" || membership?.role === "Admin";
    if (!isOrgAdmin) redirect("/dashboard");
    scopeName = membership?.org.name ?? null;
  }

  const sources = await prisma.miningSource.findMany({
    where: su ? {} : { project: { orgId: activeOrgId } },
    orderBy: [{ lastRefreshAt: "desc" }],
    select: {
      id: true, name: true, kind: true, autoRefresh: true, eventCount: true,
      lastIngestAt: true, lastRefreshAt: true,
      project: {
        select: { id: true, name: true, org: { select: { name: true } }, user: { select: { email: true } } },
      },
    },
  });

  const rows: PollingRow[] = sources.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    autoRefresh: s.autoRefresh,
    eventCount: s.eventCount,
    lastIngestAt: s.lastIngestAt ? s.lastIngestAt.toISOString() : null,
    lastRefreshAt: s.lastRefreshAt ? s.lastRefreshAt.toISOString() : null,
    projectId: s.project.id,
    projectName: s.project.name,
    orgName: s.project.org?.name ?? null,
    ownerEmail: s.project.user?.email ?? null,
  }));

  return <MiningPollingClient rows={rows} isSuperAdmin={su} scopeName={scopeName} />;
}

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { NotificationsClient } from "./NotificationsClient";
import { safeInternalPath } from "@/app/lib/safeRedirect";

// /notifications — full Notifications & Feedback screen.
//
// Default: the caller's own feed. SuperAdmins and OrgAdmins additionally
// get filter pickers (Org + User / User respectively) to inspect another
// user's feed — gated server-side in the list + audience APIs.
//
// `?from=` controls the Continue/back target (defaults to the dashboard);
// `?visited=<diagramId>` highlights the row whose diagram was just viewed.
type Props = {
  searchParams: Promise<{ from?: string; visited?: string; asUserId?: string }>;
};

export default async function NotificationsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { from, visited, asUserId } = await searchParams;
  const backHref = safeInternalPath(from) ?? "/dashboard";  // SEC-15

  // Decide the admin scope so the client knows whether to show pickers.
  let adminScope: "all" | "org" | null = null;
  if (isSuperuser(session)) {
    adminScope = "all";
  } else {
    const cookieStore = await cookies();
    const orgId = await tryGetCurrentOrgId(session, cookieStore);
    if (orgId) {
      const membership = await prisma.orgMember.findFirst({
        where: { userId: session.user.id, orgId, role: { in: ["Owner", "Admin"] } },
        select: { id: true },
      });
      if (membership) adminScope = "org";
    }
  }

  return (
    <NotificationsClient
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? null}
      currentUserEmail={session.user.email ?? ""}
      initialAsUserId={asUserId ?? session.user.id}
      adminScope={adminScope}
      backHref={backHref}
      visitedDiagramId={visited ?? null}
      overlay={false}
    />
  );
}

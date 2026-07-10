/**
 * Process Portal (/portal) — the org-wide, read-only discovery surface over the
 * caller's ACCESSIBLE published processes (access-scoped: never widens what the
 * user could already open via /processes). Server-loads the slim index + facets
 * and hands them to the client, which searches/filters/sorts in memory. Cards
 * link to the existing read-only viewer.
 */
import { auth } from "@/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { listAccessiblePublishedDiagrams, categoryLabelsFor } from "@/app/lib/portal/accessiblePublished";
import { buildFacets } from "@/app/lib/portal/facets";
import { PortalClient } from "./PortalClient";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const cookieStore = await cookies();
  const userId = getEffectiveUserId(session, cookieStore);
  if (!userId) redirect("/login");

  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  const rows = orgId ? await listAccessiblePublishedDiagrams(userId, orgId) : [];
  const categoryLabels = await categoryLabelsFor(rows.map((r) => r.pcfHierarchyId));
  const facets = buildFacets(rows, Date.now(), categoryLabels);

  return <PortalClient rows={rows} facets={facets} />;
}

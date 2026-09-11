import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { tryGetCurrentOrgId, requireOrgAdminFor } from "@/app/lib/auth/orgContext";
import { SkillsClient } from "./SkillsClient";

/**
 * The master Skills list — ORG-level, so an OrgAdmin maintains their own
 * vocabulary rather than waiting on a SuperAdmin. Everyone in the org can READ
 * it (the pickers need it); only an admin may change it, which is the whole
 * point of a governed list.
 *
 * `canEdit` only decides what the screen OFFERS. The API gates every write
 * independently, because a hidden button is not a permission check.
 */
export default async function SkillsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const cookieStore = await cookies();
  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!orgId) redirect("/dashboard");

  let canEdit = false;
  try { await requireOrgAdminFor(session, cookieStore, orgId); canEdit = true; } catch { /* read-only view */ }

  return <SkillsClient canEdit={canEdit} />;
}

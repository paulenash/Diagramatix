import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getCurrentOrgId, requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { ValueChainLibraryClient } from "../../admin/value-chain-library/ValueChainLibraryClient";

export const metadata = { title: "Diagramatix — Master Template Value Chain Generation" };

/**
 * OrgAdmin: "Master Template Value Chain Generation" — this Org's OWN Process Repository (Paul, 2026-10-08).
 *
 * The same screen as the SuperAdmin Process Repository, over the Org's own rows: adopt chains from the master repository, change them, regenerate
 * their prompts from the master template (plus the Org's additions), and publish. A chain published here replaces the master's for this Org's
 * users; when SuperAdmin issues a new master template version the screen says so and the OrgAdmin regenerates and publishes.
 */
export default async function OrgValueChainGenerationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const cookieStore = await cookies();
  try {
    const orgId = await getCurrentOrgId(session, cookieStore);
    await requireOrgAdminFor(session, cookieStore, orgId);
  } catch (err) {
    if (err instanceof OrgContextError) redirect("/dashboard");
    throw err;
  }
  return <ValueChainLibraryClient scope="org" />;
}

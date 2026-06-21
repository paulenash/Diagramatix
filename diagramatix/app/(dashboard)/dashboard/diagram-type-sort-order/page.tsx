import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { requireRole } from "@/app/lib/auth/orgContext";
import type { OrgRole } from "@/app/lib/auth/orgRoleType";
import { DiagramTypeSortOrderClient } from "./DiagramTypeSortOrderClient";

/**
 * Diagram Type Sort Order editor. Shared by SuperAdmin and OrgAdmin — the order
 * is a single global config (like the code/colour identity), so the OrgAdmin
 * tile edits the same shared order.
 */
export default async function DiagramTypeSortOrderPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const superAdmin = isSuperuser(session);
  let allowed = superAdmin;
  if (!allowed) {
    try {
      await requireRole(session, await cookies(), ["Owner", "Admin"] as OrgRole[]);
      allowed = true;
    } catch {
      /* not an org admin */
    }
  }
  if (!allowed) redirect("/dashboard");

  return <DiagramTypeSortOrderClient isSuperAdmin={superAdmin} />;
}

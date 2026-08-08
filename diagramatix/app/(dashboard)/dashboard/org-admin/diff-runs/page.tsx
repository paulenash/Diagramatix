import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { requireRole, OrgContextError } from "@/app/lib/auth/orgContext";
import { DiffRunsAdminClient } from "@/app/components/diff/DiffRunsAdminClient";

export default async function OrgAdminDiffRunsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    await requireRole(session, await cookies(), ["Owner", "Admin"]);
  } catch (err) {
    if (err instanceof OrgContextError) redirect("/dashboard");
    throw err;
  }
  return <DiffRunsAdminClient scope="org" />;
}

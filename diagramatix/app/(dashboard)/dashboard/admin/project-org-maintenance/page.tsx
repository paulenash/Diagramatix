import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { ProjectOrgMaintenanceClient, type OrgWithProjects } from "./ProjectOrgMaintenanceClient";

/**
 * Project Org Maintenance (SuperAdmin only). Re-home a project under a different
 * owning Org, which drives org-wide Risk & Control numbering + the compliance
 * roll-up. Loads every Org with its projects for the picker; the re-home + the
 * two renumbers happen server-side (POST /api/admin/project-org-maintenance).
 */
export default async function ProjectOrgMaintenancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");

  const rows = await prisma.org.findMany({
    select: { id: true, name: true, projects: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  const orgs: OrgWithProjects[] = rows.map((o) => ({ id: o.id, name: o.name, projects: o.projects }));

  return <ProjectOrgMaintenanceClient orgs={orgs} />;
}

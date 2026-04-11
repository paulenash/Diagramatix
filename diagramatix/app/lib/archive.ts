import { prisma, pgPool } from "@/app/lib/db";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";

/** The name used to identify the system archive project */
export const ARCHIVE_PROJECT_NAME = "__SYSTEM_ARCHIVE__";

/** Get (or create) the system archive project, owned by the first superuser found */
export async function getArchiveProject(): Promise<{ id: string; adminId: string }> {
  const admin = await prisma.user.findFirst({
    where: { email: { in: [...SUPERUSER_EMAILS] } },
    select: { id: true },
  });
  if (!admin) throw new Error("Admin user not found");

  const existing = await prisma.project.findFirst({
    where: { name: ARCHIVE_PROJECT_NAME, userId: admin.id },
    select: { id: true },
  });
  if (existing) return { id: existing.id, adminId: admin.id };

  // Archive project lives in the superuser's first org. The Phase 0 backfill
  // guarantees the superuser has an OrgMember row.
  const adminOrg = await prisma.orgMember.findFirst({
    where: { userId: admin.id },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  if (!adminOrg) {
    throw new Error("Superuser has no org membership — run scripts/backfill-orgs.ts");
  }

  const created = await prisma.project.create({
    data: {
      name: ARCHIVE_PROJECT_NAME,
      description: "System archive for deleted diagrams",
      userId: admin.id,
      orgId: adminOrg.orgId,
    },
  });
  return { id: created.id, adminId: admin.id };
}

/** Archive a diagram instead of deleting it */
export async function archiveDiagram(
  diagramId: string,
  originalUserId: string,
  originalUserEmail: string,
  originalProjectId: string | null,
  originalProjectName: string | null,
) {
  const archive = await getArchiveProject();

  // Read current diagram data
  const diagram = await prisma.diagram.findFirst({
    where: { id: diagramId },
  });
  if (!diagram) throw new Error("Diagram not found");

  // Inject archive metadata into the data JSON
  const data = (diagram.data as Record<string, unknown>) ?? {};
  data._archive = {
    _archived: true,
    _archivedAt: new Date().toISOString(),
    _archivedFromUserId: originalUserId,
    _archivedFromUserEmail: originalUserEmail,
    _archivedFromProjectId: originalProjectId,
    _archivedFromProjectName: originalProjectName,
  };

  // Move diagram to archive project under admin's userId via raw SQL
  await pgPool.query(
    'UPDATE "Diagram" SET "data" = $1::jsonb, "userId" = $2, "projectId" = $3, "updatedAt" = NOW() WHERE id = $4',
    [JSON.stringify(data), archive.adminId, archive.id, diagramId]
  );
}

/** Restore a diagram from the archive to its original owner/project */
export async function restoreDiagram(diagramId: string): Promise<{ success: boolean; error?: string }> {
  const diagram = await prisma.diagram.findFirst({
    where: { id: diagramId },
  });
  if (!diagram) return { success: false, error: "Diagram not found" };

  const data = (diagram.data as Record<string, unknown>) ?? {};
  const archive = data._archive as Record<string, unknown> | undefined;
  if (!archive) return { success: false, error: "No archive metadata found" };

  const originalUserId = archive._archivedFromUserId as string;
  const originalProjectId = archive._archivedFromProjectId as string | null;

  // Verify original user still exists
  const user = await prisma.user.findUnique({
    where: { id: originalUserId },
    select: { id: true },
  });
  if (!user) return { success: false, error: "Original user no longer exists" };

  // Verify original project still exists (if it had one)
  let targetProjectId: string | null = null;
  if (originalProjectId) {
    const project = await prisma.project.findFirst({
      where: { id: originalProjectId },
      select: { id: true },
    });
    if (project) targetProjectId = originalProjectId;
  }

  // Remove archive metadata from data
  delete data._archive;

  await pgPool.query(
    'UPDATE "Diagram" SET "data" = $1::jsonb, "userId" = $2, "projectId" = $3, "updatedAt" = NOW() WHERE id = $4',
    [JSON.stringify(data), originalUserId, targetProjectId, diagramId]
  );

  return { success: true };
}

/** Check if a project is the system archive */
export function isArchiveProject(projectName: string): boolean {
  return projectName === ARCHIVE_PROJECT_NAME;
}

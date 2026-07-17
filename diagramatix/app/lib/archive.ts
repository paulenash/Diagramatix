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

interface ArchiveFolderInfo { id: string | null; name: string | null }

/** Look up a diagram's containing folder from its project's folderTree.
 *  Returns { id: null, name: null } if the diagram sits at the project
 *  root, the project has no folderTree, or the project doesn't exist. */
async function lookupOriginalFolder(
  projectId: string | null,
  diagramId: string,
): Promise<ArchiveFolderInfo> {
  if (!projectId) return { id: null, name: null };
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { folderTree: true },
  });
  if (!project?.folderTree) return { id: null, name: null };
  // Prisma 7 JSON: cast through unknown to a structured shape.
  const tree = project.folderTree as unknown as {
    folders?: { id: string; name: string }[];
    diagramFolderMap?: Record<string, string>;
  };
  const folderId = tree.diagramFolderMap?.[diagramId];
  if (!folderId || folderId === "root") return { id: null, name: null };
  const folder = tree.folders?.find((f) => f.id === folderId);
  return { id: folderId, name: folder?.name ?? null };
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

  // Look up the diagram's folder inside its source project so the
  // archived-diagrams UI can group by user → project → folder.
  const folderInfo = await lookupOriginalFolder(originalProjectId, diagramId);

  const archiveMeta = {
    _archived: true,
    _archivedAt: new Date().toISOString(),
    _archivedFromUserId: originalUserId,
    _archivedFromUserEmail: originalUserEmail,
    _archivedFromProjectId: originalProjectId,
    _archivedFromProjectName: originalProjectName,
    _archivedFromFolderId: folderInfo.id,
    _archivedFromFolderName: folderInfo.name,
  };

  // DATA-05: merge ONLY the _archive key via jsonb_set in a single statement.
  // Previously this read the whole `data` JSON in JS and wrote it all back, so a
  // concurrent autosave landing between read and write was silently clobbered.
  // jsonb_set re-reads the row's current data at write time, preserving any
  // concurrent edits to elements/connectors. rowCount==0 ⇒ the diagram is gone.
  const res = await pgPool.query(
    `UPDATE "Diagram"
        SET "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{_archive}', $1::jsonb, true),
            "userId" = $2, "projectId" = $3, "updatedAt" = NOW()
      WHERE id = $4`,
    [JSON.stringify(archiveMeta), archive.adminId, archive.id, diagramId]
  );
  if (res.rowCount === 0) throw new Error("Diagram not found");

  // A linked CHILD diagram was just archived (deleted). Any element in a SIBLING
  // diagram that drills into it — a collapsed uml-package, a subprocess, etc. —
  // would be left with a dangling link + drill marker. Null out those links so
  // the element reverts to a plain, unlinked shape. The element itself is NEVER
  // removed, and no parent diagram is touched beyond dropping the stale link.
  await clearDanglingLinksTo(diagramId, originalProjectId);
}

/** Null out `linkedDiagramId` on any element (in the same project's other
 *  diagrams) that pointed at the now-removed diagram. */
async function clearDanglingLinksTo(removedDiagramId: string, projectId: string | null) {
  if (!projectId) return;
  const siblings = await prisma.diagram.findMany({
    where: { projectId, id: { not: removedDiagramId } },
    select: { id: true, data: true },
  });
  for (const sib of siblings) {
    const data = sib.data as unknown as { elements?: Array<{ properties?: Record<string, unknown> }> } | null;
    const els = data?.elements;
    if (!Array.isArray(els)) continue;
    let touched = false;
    for (const e of els) {
      if (e.properties && e.properties.linkedDiagramId === removedDiagramId) {
        e.properties.linkedDiagramId = null;
        touched = true;
      }
    }
    if (touched) {
      await pgPool.query(
        `UPDATE "Diagram" SET "data" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
        [JSON.stringify(data), sib.id],
      );
    }
  }
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

  // DATA-05: strip ONLY the _archive key with the jsonb `-` operator in a single
  // statement (was: write the whole data blob back, clobbering concurrent edits).
  await pgPool.query(
    `UPDATE "Diagram"
        SET "data" = "data" - '_archive', "userId" = $1, "projectId" = $2, "updatedAt" = NOW()
      WHERE id = $3`,
    [originalUserId, targetProjectId, diagramId]
  );

  return { success: true };
}

/** Check if a project is the system archive */
export function isArchiveProject(projectName: string): boolean {
  return projectName === ARCHIVE_PROJECT_NAME;
}

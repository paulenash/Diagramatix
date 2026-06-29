/**
 * Project delete cascade — the DATA effects of deleting a project, extracted from
 * the DELETE /api/projects/[id] route so they can be unit-tested directly. The
 * auth + tier gates stay in the route; this is purely "what happens to the data".
 *
 * Three modes (Paul's three-tier delete model):
 *   - "unorganise" (default, ×)  — delete the project; its diagrams SetNull to
 *       Unorganised (FK). Any still-PUBLISHED child is demoted to DRAFT first
 *       (clearing currentPublishedVersionId) so it doesn't become an invisible
 *       orphan (DATA-16). Shares + PublicationBundles cascade-delete with the project.
 *   - "archive" (×+)             — move every diagram into the system archive
 *       first, then delete the project as above (no children remain to demote).
 *   - "hard" (×++)               — permanently delete every diagram (their history
 *       + versions cascade) and then the project. Nothing recoverable.
 */
import { prisma } from "@/app/lib/db";
import { archiveDiagram } from "@/app/lib/archive";

export type ProjectDeleteMode = "unorganise" | "archive" | "hard";

/**
 * Per-tier authorization decision for a project delete, extracted verbatim from
 * the DELETE /api/projects/[id] route so the three-tier rules can be unit-tested
 * directly. The route computes the three booleans (from requireProjectAccess +
 * isSuperuser + a requireRole probe) and asks this for the verdict.
 *
 * Rules (Paul's three-tier delete model, 2026-06-08):
 *   - hard       — SuperAdmin who owns the project.
 *   - archive    — OrgAdmin (Owner/Admin in the project's Org).
 *   - unorganise — project Owner OR SuperAdmin OR OrgAdmin.
 */
export function authorizeProjectDelete(
  mode: ProjectDeleteMode,
  ctx: { isProjectOwner: boolean; isSuperuser: boolean; isOrgAdmin: boolean },
): { allowed: boolean; message?: string } {
  if (mode === "hard") {
    if (ctx.isSuperuser && ctx.isProjectOwner) return { allowed: true };
    return { allowed: false, message: "Hard delete requires SuperAdmin who owns the project" };
  }
  if (mode === "archive") {
    if (ctx.isOrgAdmin) return { allowed: true };
    return { allowed: false, message: "Not an OrgAdmin for this org" };
  }
  // unorganise (default)
  if (ctx.isProjectOwner || ctx.isSuperuser || ctx.isOrgAdmin) return { allowed: true };
  return { allowed: false, message: "No access to this project" };
}

export interface ProjectDeleteResult {
  mode: ProjectDeleteMode;
  archived: number;    // diagrams moved to the archive (archive mode)
  unpublished: number; // PUBLISHED children demoted to DRAFT (unorganise mode)
  purged: number;      // diagrams permanently deleted (hard mode)
}

export async function deleteProjectCascade(
  projectId: string,
  orgId: string,
  mode: ProjectDeleteMode,
  actor: { id: string; email: string },
  projectName: string | null,
): Promise<ProjectDeleteResult> {
  // ×++ hard delete — purge every diagram (history + versions cascade) + the project.
  if (mode === "hard") {
    const result = await prisma.$transaction(async (tx) => {
      const purged = await tx.diagram.deleteMany({ where: { projectId, orgId } });
      await tx.project.delete({ where: { id: projectId } });
      return { purged: purged.count };
    });
    return { mode, archived: 0, unpublished: 0, purged: result.purged };
  }

  // ×+ archive — move each diagram into the system archive first. A single bad
  // diagram is skipped so the rest still archive.
  let archived = 0;
  if (mode === "archive") {
    const diagrams = await prisma.diagram.findMany({ where: { projectId, orgId }, select: { id: true } });
    for (const d of diagrams) {
      try { await archiveDiagram(d.id, actor.id, actor.email, projectId, projectName); archived++; }
      catch { /* skip one, keep going */ }
    }
  }

  // × (default) / post-archive — demote any still-PUBLISHED child to DRAFT, then
  // delete the project (FK SetNull-s remaining diagrams to Unorganised; cascades
  // shares + bundles), in one transaction.
  const delResult = await prisma.$transaction(async (tx) => {
    const demoted = await tx.diagram.updateMany({
      where: { projectId, orgId, lifecycle: "PUBLISHED" },
      data: { lifecycle: "DRAFT", currentPublishedVersionId: null },
    });
    await tx.project.delete({ where: { id: projectId } });
    return { demoted: demoted.count };
  });
  return { mode, archived, unpublished: delResult.demoted, purged: 0 };
}

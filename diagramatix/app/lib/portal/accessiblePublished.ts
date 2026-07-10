/**
 * Process Portal — resolve the set of PUBLISHED diagrams the caller can already
 * see, batched for org-wide browse (no per-diagram access checks). This mirrors
 * the access rules in app/lib/auth/orgContext.ts (project ownership + shares +
 * silent org-admin elevation, plus the active-bundle-audience business-user
 * path) but computes the whole set in a handful of queries instead of N+1.
 *
 * "Access-scoped": the Portal never widens visibility — a reader sees exactly
 * the published processes they could already open via /processes.
 */
import { prisma } from "@/app/lib/db";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import type { PortalRow } from "./facets";

/** Build the caller's accessible published index for the given org. */
export async function listAccessiblePublishedDiagrams(userId: string, orgId: string): Promise<PortalRow[]> {
  // Silent elevation: SuperAdmin (by email) or an Owner/Admin member of THIS org
  // sees every project in the org (matches isAdminElevatedForOrg in orgContext).
  const [user, adminMember] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.orgMember.findFirst({ where: { userId, orgId, role: { in: ["Owner", "Admin"] } }, select: { id: true } }),
  ]);
  const elevated = (!!user && SUPERUSER_EMAILS.has(user.email.toLowerCase())) || !!adminMember;

  // 1. Projects the caller can reach in this org.
  const projects = await prisma.project.findMany({
    where: elevated ? { orgId } : { orgId, OR: [{ userId }, { shares: { some: { userId } } }] },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);
  const projectIdSet = new Set(projectIds);

  // 2. Diagrams granted only through an active bundle audience (covers diagrams
  //    in projects the caller can't otherwise open, incl. orphan diagrams).
  const grants = await prisma.publicationBundleAudience.findMany({
    where: { userId, bundle: { supersededAt: null } },
    select: { bundle: { select: { diagrams: { select: { diagramId: true } } } } },
  });
  const bundleDiagramIds = [...new Set(grants.flatMap((g) => g.bundle.diagrams.map((d) => d.diagramId)))];

  if (projectIds.length === 0 && bundleDiagramIds.length === 0) return [];

  // 3. Published diagrams reachable via EITHER path (org-scoped; the OR dedupes
  //    a diagram that's both in an accessible project and in a granted bundle).
  const orClauses = [
    ...(projectIds.length ? [{ projectId: { in: projectIds } }] : []),
    ...(bundleDiagramIds.length ? [{ id: { in: bundleDiagramIds } }] : []),
  ];
  const diagrams = await prisma.diagram.findMany({
    where: { orgId, lifecycle: "PUBLISHED", currentPublishedVersionId: { not: null }, OR: orClauses },
    select: {
      id: true, name: true, type: true, projectId: true, updatedAt: true,
      diagramOwnerId: true, diagramOwner: { select: { name: true } },
      nextReviewDate: true, procedureDocUrl: true, procedureDocName: true,
      pcfHierarchyId: true, pcfName: true,
      currentPublishedVersion: { select: { versionNumber: true, publishedAt: true } },
    },
    orderBy: { name: "asc" },
  });

  return diagrams.map((d): PortalRow => ({
    id: d.id,
    name: d.name,
    type: d.type,
    ownerId: d.diagramOwnerId,
    ownerName: d.diagramOwner?.name ?? null,
    projectId: d.projectId,
    updatedAt: d.updatedAt.toISOString(),
    publishedAt: d.currentPublishedVersion?.publishedAt.toISOString() ?? null,
    versionNumber: d.currentPublishedVersion?.versionNumber ?? null,
    nextReviewDate: d.nextReviewDate ? d.nextReviewDate.toISOString() : null,
    procedureDocUrl: d.procedureDocUrl,
    procedureDocName: d.procedureDocName,
    pcfHierarchyId: d.pcfHierarchyId,
    pcfName: d.pcfName,
    // Provenance: a diagram in an accessible project reads as "project", else
    // it's visible only through a bundle grant.
    via: d.projectId && projectIdSet.has(d.projectId) ? "project" : "bundle",
  }));
}

/**
 * Resolve APQC top-category codes ("8.0") → their category name, for the
 * category facet labels. Reads distinct PcfNode level-1 rows for the codes in
 * play. Reference (org-null) frameworks are fine — category names are stable.
 */
export async function categoryLabelsFor(hierarchyIds: (string | null)[]): Promise<Record<string, string>> {
  const codes = [...new Set(
    hierarchyIds.map((h) => (h ? h.split(".")[0] : "")).filter((h) => /^\d+$/.test(h)).map((h) => `${h}.0`),
  )];
  if (codes.length === 0) return {};
  const nodes = await prisma.pcfNode.findMany({
    where: { hierarchyId: { in: codes } },
    select: { hierarchyId: true, name: true },
    distinct: ["hierarchyId"],
  });
  return Object.fromEntries(nodes.map((n) => [n.hierarchyId, n.name]));
}

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { walkForwardClosure } from "@/app/lib/diagram/linkClosure";
import { createNotifications } from "@/app/lib/notifications";
import { getProjectAccess } from "@/app/lib/auth/orgContext";

// POST /api/bundles
//
// Body: {
//   name: string,
//   projectId: string,
//   rootDiagramIds: string[],          // >= 1; all must be in projectId
//   audienceUserIds: string[],         // org members granted business-user access
//   releaseNotes?: string,
//   nextReviewDate?: string|null,      // ISO
//   acceptCrossProjectWarnings?: bool, // owner ack'd the dead-end-link list
// }
//
// Effects (in one transaction):
//   • Creates PublicationBundle row.
//   • Creates one PublicationBundleDiagram per unioned closure member.
//   • Creates one PublicationBundleAudience per audience user.
//   • Fires `bundle-published` notification per audience user.
//
// Gate: caller must be `diagramOwnerId` of every root. (Project ownership
// alone is not sufficient — CPS 230 accountability.)
//
// Pre-conditions: every closure member must have currentPublishedVersionId.
// If any are DRAFT the call returns 409 with the list of unready diagrams.
//
// Returns: { bundleId, memberCount, audienceCount }.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const name: string = typeof body.name === "string" ? body.name.trim() : "";
  const projectId: string | undefined = typeof body.projectId === "string" ? body.projectId : undefined;
  const rootDiagramIds: string[] = Array.isArray(body.rootDiagramIds)
    ? Array.from(new Set(body.rootDiagramIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)))
    : [];
  const audienceUserIds: string[] = Array.isArray(body.audienceUserIds)
    ? Array.from(new Set(body.audienceUserIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)))
    : [];
  const releaseNotes: string | undefined = typeof body.releaseNotes === "string" && body.releaseNotes.trim().length > 0
    ? body.releaseNotes.trim()
    : undefined;
  const nextReviewDate: Date | null = body.nextReviewDate ? new Date(body.nextReviewDate) : null;
  const acceptCrossProjectWarnings: boolean = body.acceptCrossProjectWarnings === true;

  if (!name) return NextResponse.json({ error: "Bundle name required" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (rootDiagramIds.length === 0) return NextResponse.json({ error: "At least one root diagram required" }, { status: 400 });
  if (nextReviewDate && Number.isNaN(nextReviewDate.getTime())) {
    return NextResponse.json({ error: "Invalid nextReviewDate" }, { status: 400 });
  }

  // Verify project + access. Cross-org sharing for audiences is gated by
  // the same flag used by ProjectShare (re-using getProjectAccess walks
  // through that check naturally for the caller; audience cross-org is
  // checked separately below).
  const projectAccess = await getProjectAccess(callerId, projectId);
  if (!projectAccess) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }
  const projectOrgId = projectAccess.projectOrgId;

  // Verify every root: in the named project AND the caller is its diagramOwner.
  const roots = await prisma.diagram.findMany({
    where: { id: { in: rootDiagramIds } },
    select: { id: true, name: true, projectId: true, diagramOwnerId: true },
  });
  if (roots.length !== rootDiagramIds.length) {
    return NextResponse.json({ error: "One or more roots not found" }, { status: 404 });
  }
  for (const r of roots) {
    if (r.projectId !== projectId) {
      return NextResponse.json(
        { error: `Diagram '${r.name}' is in a different project; bundles cannot span projects.` },
        { status: 400 },
      );
    }
    if (r.diagramOwnerId !== callerId) {
      return NextResponse.json(
        { error: `You are not the Diagram Owner of '${r.name}'. Only the Diagram Owner can publish.` },
        { status: 403 },
      );
    }
  }

  // Walk closure per root, union.
  const allIds = new Set<string>();
  let totalCrossProjectLinkCount = 0;
  for (const root of roots) {
    const closure = await walkForwardClosure(root.id, projectId, prisma);
    for (const id of closure.diagramIds) allIds.add(id);
    totalCrossProjectLinkCount += closure.crossProjectLinks.length;
  }
  if (totalCrossProjectLinkCount > 0 && !acceptCrossProjectWarnings) {
    return NextResponse.json(
      {
        error: "Closure contains cross-project links — owner must acknowledge",
        crossProjectLinkCount: totalCrossProjectLinkCount,
      },
      { status: 409 },
    );
  }

  // Verify every member is publishable (currentPublishedVersionId set).
  const members = await prisma.diagram.findMany({
    where: { id: { in: Array.from(allIds) } },
    select: { id: true, name: true, currentPublishedVersionId: true },
  });
  const unpublished = members.filter(m => !m.currentPublishedVersionId);
  if (unpublished.length > 0) {
    return NextResponse.json(
      {
        error: "Some diagrams in the closure haven't been published yet",
        unpublished: unpublished.map(m => ({ id: m.id, name: m.name })),
      },
      { status: 409 },
    );
  }

  // Verify audience users exist + are in the project's Org (or cross-org sharing is on).
  if (audienceUserIds.length > 0) {
    const audienceRows = await prisma.user.findMany({
      where: { id: { in: audienceUserIds } },
      select: { id: true, email: true, orgMembers: { where: { orgId: projectOrgId }, select: { id: true } } },
    });
    if (audienceRows.length !== audienceUserIds.length) {
      return NextResponse.json({ error: "One or more audience users not found" }, { status: 404 });
    }
    // Cross-org gate.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { org: { select: { allowCrossOrgSharing: true } } },
    });
    const crossOrgAllowed = project?.org?.allowCrossOrgSharing ?? false;
    if (!crossOrgAllowed) {
      const outsiders = audienceRows.filter(u => u.orgMembers.length === 0);
      if (outsiders.length > 0) {
        return NextResponse.json(
          {
            error: "Some audience members are outside this Org; enable cross-Org sharing first",
            outsiders: outsiders.map(u => ({ id: u.id, email: u.email })),
          },
          { status: 409 },
        );
      }
    }
  }

  const rootSet = new Set(rootDiagramIds);

  try {
    const bundle = await prisma.$transaction(async (tx) => {
      const created = await tx.publicationBundle.create({
        data: {
          name,
          projectId,
          publishedById: callerId,
          releaseNotes,
          nextReviewDate,
        },
      });
      if (allIds.size > 0) {
        await tx.publicationBundleDiagram.createMany({
          data: Array.from(allIds).map(diagramId => ({
            bundleId: created.id,
            diagramId,
            isRoot: rootSet.has(diagramId),
          })),
        });
      }
      if (audienceUserIds.length > 0) {
        await tx.publicationBundleAudience.createMany({
          data: audienceUserIds.map(userId => ({
            bundleId: created.id,
            userId,
            addedById: callerId,
          })),
        });
      }
      return created;
    });

    // Fire in-app notifications. Email is wired in Phase 6 of the plan
    // (cron + email infrastructure) — for now, in-app only.
    const singleRoot = rootDiagramIds.length === 1 ? rootDiagramIds[0] : undefined;
    if (audienceUserIds.length > 0) {
      await createNotifications(
        audienceUserIds.map(userId => ({
          userId,
          type: "bundle-published" as const,
          payload: {
            bundleId: bundle.id,
            bundleName: name,
            rootDiagramId: singleRoot,
            fromUserId: callerId,
          },
        })),
      );
    }

    return NextResponse.json({
      bundleId: bundle.id,
      memberCount: allIds.size,
      audienceCount: audienceUserIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/bundles] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/bundles
//
// Returns the caller's bundles in two buckets:
//   • created: bundles they published (where publishedById = caller).
//   • received: bundles they are in the audience of (active only).
//
// Useful for the dashboard "Published processes" section and the
// owner-side "My bundles" list.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [created, audienceRows] = await Promise.all([
    prisma.publicationBundle.findMany({
      where: { publishedById: userId },
      select: {
        id: true,
        name: true,
        projectId: true,
        publishedAt: true,
        supersededAt: true,
        nextReviewDate: true,
        _count: { select: { diagrams: true, audience: true } },
      },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.publicationBundleAudience.findMany({
      where: { userId, bundle: { supersededAt: null } },
      select: {
        addedAt: true,
        bundle: {
          select: {
            id: true,
            name: true,
            projectId: true,
            publishedAt: true,
            supersededAt: true,
            nextReviewDate: true,
            _count: { select: { diagrams: true, audience: true } },
          },
        },
      },
      orderBy: { addedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    created,
    received: audienceRows.map(r => ({ ...r.bundle, addedAt: r.addedAt })),
  });
}

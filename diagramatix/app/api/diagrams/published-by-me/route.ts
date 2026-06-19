import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId } from "@/app/lib/superuser";

// GET /api/diagrams/published-by-me
//
// Returns every diagram where the caller is the `diagramOwnerId` AND
// the lifecycle is PUBLISHED (i.e., at least one PublishedVersion exists
// and the diagram isn't archived). Powers the dashboard "Published
// diagrams" list.
//
// Includes the current version number + published date, the diagram's
// `nextReviewDate`, the project it belongs to, and a count of how many
// bundles include it (handy "this v3 reaches N audiences" badge later).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Honour SuperAdmin impersonation: show the impersonated user's published
  // diagrams, not the admin's own.
  const effectiveUserId = getEffectiveUserId(session, await cookies());

  const diagrams = await prisma.diagram.findMany({
    where: {
      diagramOwnerId: effectiveUserId,
      lifecycle: "PUBLISHED",
    },
    select: {
      id: true,
      name: true,
      type: true,
      nextReviewDate: true,
      updatedAt: true,
      project: { select: { id: true, name: true } },
      currentPublishedVersion: {
        select: {
          versionNumber: true,
          publishedAt: true,
          releaseNotes: true,
        },
      },
      _count: { select: { bundleMemberships: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json({
    diagrams: diagrams.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      projectId: d.project?.id ?? null,
      projectName: d.project?.name ?? null,
      currentVersion: d.currentPublishedVersion
        ? {
            versionNumber: d.currentPublishedVersion.versionNumber,
            publishedAt: d.currentPublishedVersion.publishedAt.toISOString(),
            releaseNotes: d.currentPublishedVersion.releaseNotes,
          }
        : null,
      nextReviewDate: d.nextReviewDate?.toISOString() ?? null,
      bundleCount: d._count.bundleMemberships,
    })),
  });
}

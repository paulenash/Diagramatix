import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId } from "@/app/lib/superuser";

type Params = { params: Promise<{ id: string }> };

// GET /api/bundles/[id] — bundle details.
//
// Owner view (publishedById === caller): full closure + audience list +
// release notes + next review date. Used by the bundle-detail page in
// the owner's "My bundles" UI.
//
// Audience view (caller in PublicationBundleAudience): name + release
// notes + roots list (no other audience members, no metadata about
// non-root members the user can't access). Used by the business-user
// bundle index in Phase 3.
//
// Anyone else → 404 (avoid leaking bundle existence).
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Honour SuperAdmin impersonation: owner/audience access is judged from the
  // impersonated user's perspective so the admin sees what they would see.
  const userId = getEffectiveUserId(session, await cookies());
  const { id } = await params;

  const bundle = await prisma.publicationBundle.findUnique({
    where: { id },
    include: {
      diagrams: {
        include: {
          diagram: {
            select: {
              id: true,
              name: true,
              type: true,
              lifecycle: true,
              currentPublishedVersion: { select: { versionNumber: true, publishedAt: true } },
            },
          },
        },
      },
      audience: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          addedBy: { select: { id: true, name: true, email: true } },
        },
      },
      publishedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!bundle) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = bundle.publishedById === userId;
  const isAudience = bundle.audience.some(a => a.userId === userId);

  if (!isOwner && !isAudience) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isOwner) {
    return NextResponse.json({ role: "owner", bundle });
  }

  // Audience view — trim down to what the business user should see.
  const rootMemberships = bundle.diagrams
    .filter(d => d.isRoot)
    .map(d => ({
      diagramId: d.diagramId,
      name: d.diagram.name,
      type: d.diagram.type,
      currentVersion: d.diagram.currentPublishedVersion
        ? {
            versionNumber: d.diagram.currentPublishedVersion.versionNumber,
            publishedAt: d.diagram.currentPublishedVersion.publishedAt,
          }
        : null,
    }));
  return NextResponse.json({
    role: "audience",
    bundle: {
      id: bundle.id,
      name: bundle.name,
      releaseNotes: bundle.releaseNotes,
      publishedAt: bundle.publishedAt,
      nextReviewDate: bundle.nextReviewDate,
      roots: rootMemberships,
    },
  });
}

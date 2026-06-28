/**
 * Publish + version-history data effects, extracted from
 * POST /api/diagrams/[id]/publish and POST /api/diagrams/[id]/history/[snapshotId]
 * so they can be unit-tested directly. The auth + diagram-owner gates stay in
 * the routes; these are purely "what happens to the data".
 */
import { prisma } from "@/app/lib/db";

export class PublishError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface PublishInput {
  releaseNotes?: string;
  /** Explicit next-review date. Null/undefined falls back to the diagram's. */
  nextReviewDate?: Date | null;
  /** Review cadence in months (clamped 1..120 by the caller). */
  reviewCadenceMonths?: number | null;
}

/**
 * Create the next PublishedVersion for a diagram and flip its lifecycle.
 *
 * Effects (one transaction):
 *   • stamps `supersededAt` on the previously-current version (if any);
 *   • creates a new PublishedVersion with versionNumber = MAX(prev) + 1 and a
 *     frozen snapshot of the live diagram (name/type/data/colorConfig/displayMode);
 *   • points Diagram.currentPublishedVersionId at it, sets lifecycle=PUBLISHED,
 *     applies nextReviewDate / reviewCadenceMonths, and resets the cron guard.
 *
 * Returns the created PublishedVersion. Throws PublishError(404) if the diagram
 * is gone.
 */
export async function publishDiagramVersion(
  diagramId: string,
  publisherId: string,
  input: PublishInput = {},
) {
  const diagram = await prisma.diagram.findUnique({ where: { id: diagramId } });
  if (!diagram) throw new PublishError("Not found", 404);

  const last = await prisma.publishedVersion.findFirst({
    where: { diagramId },
    select: { versionNumber: true },
    orderBy: { versionNumber: "desc" },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;

  const nextReviewDate = input.nextReviewDate ?? null;

  return prisma.$transaction(async (tx) => {
    if (diagram.currentPublishedVersionId) {
      await tx.publishedVersion.update({
        where: { id: diagram.currentPublishedVersionId },
        data: { supersededAt: new Date() },
      });
    }
    const created = await tx.publishedVersion.create({
      data: {
        diagramId,
        versionNumber,
        publishedById: publisherId,
        name: diagram.name,
        type: diagram.type,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: diagram.data as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        colorConfig: diagram.colorConfig as any,
        displayMode: diagram.displayMode,
        releaseNotes: input.releaseNotes,
        nextReviewDateAtPublish: nextReviewDate ?? diagram.nextReviewDate ?? null,
      },
    });
    await tx.diagram.update({
      where: { id: diagramId },
      data: {
        currentPublishedVersionId: created.id,
        lifecycle: "PUBLISHED",
        nextReviewDate: nextReviewDate ?? diagram.nextReviewDate,
        reviewCadenceMonths: input.reviewCadenceMonths ?? diagram.reviewCadenceMonths,
        lastReviewDueNotifiedAt: null,
      },
    });
    return created;
  });
}

/**
 * Restore a diagram to a past history snapshot. Reversible: the CURRENT state is
 * first saved as a NEW DiagramHistory entry, then the diagram is rolled back to
 * the snapshot's fields. No data is lost.
 *
 * Throws PublishError(404) if the diagram or snapshot is missing.
 */
export async function restoreDiagramSnapshot(
  diagramId: string,
  snapshotId: string,
  actorUserId: string,
) {
  const diagram = await prisma.diagram.findUnique({ where: { id: diagramId } });
  if (!diagram) throw new PublishError("Diagram not found", 404);

  const snap = await prisma.diagramHistory.findFirst({ where: { id: snapshotId, diagramId } });
  if (!snap) throw new PublishError("Snapshot not found", 404);

  const s = snap.snapshot as { name?: string; type?: string; data?: unknown; colorConfig?: unknown; displayMode?: string };

  // Save the CURRENT state first so the restore is reversible.
  const currentSnap = {
    name: diagram.name,
    type: diagram.type,
    data: diagram.data,
    colorConfig: diagram.colorConfig,
    displayMode: diagram.displayMode,
  };
  await prisma.diagramHistory.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { diagramId, snapshot: currentSnap as any, userId: actorUserId },
  });

  await prisma.diagram.update({
    where: { id: diagramId },
    data: {
      ...(s.name !== undefined && { name: s.name }),
      ...(s.type !== undefined && { type: s.type }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(s.data !== undefined && { data: s.data as any }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(s.colorConfig !== undefined && { colorConfig: s.colorConfig as any }),
      ...(s.displayMode !== undefined && { displayMode: s.displayMode }),
    },
  });

  return prisma.diagram.findUnique({ where: { id: diagramId } });
}

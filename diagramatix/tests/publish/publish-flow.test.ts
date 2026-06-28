/**
 * Publish + version-history flow (#4).
 *
 * Exercises the extracted publish + restore data-effect libs
 * (`publishDiagramVersion` / `restoreDiagramSnapshot`) against the real test DB
 * — no mocks. These are the data effects of POST /api/diagrams/[id]/publish and
 * POST /api/diagrams/[id]/history/[snapshotId]; the routes are now thin callers
 * with their auth + diagram-owner gates unchanged.
 *
 * Pins:
 *   • publishing a DRAFT → PublishedVersion v1, lifecycle DRAFT→PUBLISHED,
 *     currentPublishedVersionId set, nextReviewDate/cadence applied;
 *   • publishing AGAIN → v2, currentPublishedVersionId re-pointed, the prior
 *     version stamped supersededAt;
 *   • restore from a history snapshot SAVES the current state as a new history
 *     entry FIRST, then rolls the diagram back — no data lost, reversible.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, createProject, createDiagram } from "../_setup/factories";
import { publishDiagramVersion, restoreDiagramSnapshot, PublishError } from "@/app/lib/diagram/publishVersion";

async function seed() {
  const { user, org } = await createUserWithOrg();
  const project = await createProject({ userId: user.id, orgId: org.id });
  // The diagram owner is the publisher (CPS 230 accountability) — set it.
  const diagram = await createDiagram({
    userId: user.id, orgId: org.id, projectId: project.id, diagramOwnerId: user.id,
  });
  return { user, org, project, diagram };
}
type World = Awaited<ReturnType<typeof seed>>;

describe("publish + version-history flow", () => {
  let w: World;
  beforeEach(async () => { await truncateAll(); w = await seed(); });

  it("publishing a DRAFT creates v1, flips lifecycle, sets the current pointer + review date", async () => {
    // Sanity: starts as a draft with no current version.
    const before = await prisma.diagram.findUnique({ where: { id: w.diagram.id } });
    expect(before?.lifecycle).toBe("DRAFT");
    expect(before?.currentPublishedVersionId).toBeNull();

    const reviewDate = new Date("2027-01-15T00:00:00.000Z");
    const v1 = await publishDiagramVersion(w.diagram.id, w.user.id, {
      releaseNotes: "Initial release",
      nextReviewDate: reviewDate,
      reviewCadenceMonths: 12,
    });

    expect(v1.versionNumber).toBe(1);
    expect(v1.supersededAt).toBeNull();
    expect(v1.releaseNotes).toBe("Initial release");
    expect(v1.publishedById).toBe(w.user.id);

    const after = await prisma.diagram.findUnique({ where: { id: w.diagram.id } });
    expect(after?.lifecycle).toBe("PUBLISHED");
    expect(after?.currentPublishedVersionId).toBe(v1.id);
    expect(after?.nextReviewDate?.toISOString()).toBe(reviewDate.toISOString());
    expect(after?.reviewCadenceMonths).toBe(12);
    // Cron-idempotency guard reset on publish.
    expect(after?.lastReviewDueNotifiedAt).toBeNull();

    expect(await prisma.publishedVersion.count({ where: { diagramId: w.diagram.id } })).toBe(1);
  });

  it("publishing AGAIN increments to v2, re-points current, and supersedes v1", async () => {
    const v1 = await publishDiagramVersion(w.diagram.id, w.user.id, { reviewCadenceMonths: 6 });
    const v2 = await publishDiagramVersion(w.diagram.id, w.user.id, {});

    expect(v2.versionNumber).toBe(2);

    const after = await prisma.diagram.findUnique({ where: { id: w.diagram.id } });
    expect(after?.currentPublishedVersionId).toBe(v2.id);
    expect(after?.lifecycle).toBe("PUBLISHED");
    // Re-publish without a cadence keeps the prior cadence (fallback path).
    expect(after?.reviewCadenceMonths).toBe(6);

    // v1 stamped superseded; v2 still current.
    const v1After = await prisma.publishedVersion.findUnique({ where: { id: v1.id } });
    const v2After = await prisma.publishedVersion.findUnique({ where: { id: v2.id } });
    expect(v1After?.supersededAt).not.toBeNull();
    expect(v2After?.supersededAt).toBeNull();

    expect(await prisma.publishedVersion.count({ where: { diagramId: w.diagram.id } })).toBe(2);
  });

  it("publishing a missing diagram throws PublishError(404)", async () => {
    await expect(publishDiagramVersion("cnonexistent000000000000", w.user.id, {}))
      .rejects.toBeInstanceOf(PublishError);
    await expect(publishDiagramVersion("cnonexistent000000000000", w.user.id, {}))
      .rejects.toMatchObject({ status: 404 });
  });

  it("restore saves the CURRENT state as a new history entry, THEN rolls back to the snapshot", async () => {
    // Put the diagram in its "old" state and snapshot it.
    await prisma.diagram.update({
      where: { id: w.diagram.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { name: "Old Name", data: { elements: [{ id: "x" }] } as any },
    });
    const oldSnap = await prisma.diagramHistory.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { diagramId: w.diagram.id, snapshot: { name: "Old Name", type: "bpmn", data: { elements: [{ id: "x" }] }, colorConfig: {}, displayMode: "normal" } as any, userId: w.user.id },
    });

    // Move the diagram forward to a "new" state (what the user wants to undo).
    await prisma.diagram.update({
      where: { id: w.diagram.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { name: "New Name", data: { elements: [{ id: "y" }, { id: "z" }] } as any },
    });

    const historyBefore = await prisma.diagramHistory.count({ where: { diagramId: w.diagram.id } });
    expect(historyBefore).toBe(1);

    const restored = await restoreDiagramSnapshot(w.diagram.id, oldSnap.id, w.user.id);

    // Diagram rolled back to the snapshot's fields.
    expect(restored?.name).toBe("Old Name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((restored?.data as any)?.elements).toHaveLength(1);

    // A NEW history entry was created FIRST capturing the pre-restore "New Name"
    // state — so the restore is itself reversible (no data lost).
    const historyAfter = await prisma.diagramHistory.findMany({
      where: { diagramId: w.diagram.id }, orderBy: { createdAt: "asc" },
    });
    expect(historyAfter).toHaveLength(2);
    const saved = historyAfter.find(h => h.id !== oldSnap.id)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((saved.snapshot as any)?.name).toBe("New Name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((saved.snapshot as any)?.data?.elements).toHaveLength(2);
  });

  it("restore of a missing snapshot throws PublishError(404) and does not touch the diagram", async () => {
    const before = await prisma.diagram.findUnique({ where: { id: w.diagram.id } });
    await expect(restoreDiagramSnapshot(w.diagram.id, "cnope0000000000000000000", w.user.id))
      .rejects.toMatchObject({ status: 404 });
    // No spurious history entry created.
    expect(await prisma.diagramHistory.count({ where: { diagramId: w.diagram.id } })).toBe(0);
    const after = await prisma.diagram.findUnique({ where: { id: w.diagram.id } });
    expect(after?.name).toBe(before?.name);
  });
});

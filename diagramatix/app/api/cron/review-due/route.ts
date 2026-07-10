/**
 * Daily review-due reminders. `POST /api/cron/review-due` — no session;
 * authenticated by the CRON_SECRET env via the X-Cron-Key header (mirrors
 * /api/mining/poll). Scans PUBLISHED diagrams and active bundles whose
 * nextReviewDate has passed and that haven't been notified for this review
 * window, fires a `review-due` notification to the accountable owner/publisher,
 * and stamps the idempotency guard so re-runs are no-ops. Invoked by the
 * review-cron GitHub Action.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { createNotifications } from "@/app/lib/notifications";
import { selectReviewDue } from "@/app/lib/diagram/reviewDue";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (req.headers.get("x-cron-key") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  // Diagrams — notify the accountable Diagram Owner.
  const diagrams = await prisma.diagram.findMany({
    where: { lifecycle: "PUBLISHED", nextReviewDate: { lte: now }, diagramOwnerId: { not: null } },
    select: {
      id: true, name: true, diagramOwnerId: true, nextReviewDate: true, lastReviewDueNotifiedAt: true,
      currentPublishedVersionId: true, currentPublishedVersion: { select: { versionNumber: true } },
    },
    take: 500,
  });
  const dDue = selectReviewDue(diagrams, now);
  if (dDue.length) {
    await createNotifications(dDue.map((d) => ({
      userId: d.diagramOwnerId!,
      type: "review-due" as const,
      payload: {
        diagramId: d.id, diagramName: d.name,
        publishedVersionId: d.currentPublishedVersionId ?? undefined,
        versionNumber: d.currentPublishedVersion?.versionNumber,
        nextReviewDate: d.nextReviewDate?.toISOString(),
      },
    })));
    await prisma.diagram.updateMany({ where: { id: { in: dDue.map((d) => d.id) } }, data: { lastReviewDueNotifiedAt: now } });
  }

  // Bundles — notify the publisher.
  const bundles = await prisma.publicationBundle.findMany({
    where: { supersededAt: null, nextReviewDate: { lte: now }, publishedById: { not: null } },
    select: { id: true, name: true, publishedById: true, nextReviewDate: true, lastReviewDueNotifiedAt: true },
    take: 500,
  });
  const bDue = selectReviewDue(bundles, now);
  if (bDue.length) {
    await createNotifications(bDue.map((b) => ({
      userId: b.publishedById!,
      type: "review-due" as const,
      payload: { bundleId: b.id, bundleName: b.name, nextReviewDate: b.nextReviewDate?.toISOString() },
    })));
    await prisma.publicationBundle.updateMany({ where: { id: { in: bDue.map((b) => b.id) } }, data: { lastReviewDueNotifiedAt: now } });
  }

  return NextResponse.json({ diagrams: dDue.length, bundles: bDue.length });
}

/**
 * POST /api/reviews/[id]/resubmit
 *   The requester re-submits the diagram for a fresh review round after
 *   addressing comments: every reviewer's status resets to "pending",
 *   the review status becomes "resubmitted", and each reviewer is
 *   re-notified. Comments from the previous round stay on the diagram.
 *   Requester only.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { createNotifications } from "@/app/lib/notifications";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const myName = session.user.name ?? null;
  const myEmail = session.user.email ?? undefined;
  const { id } = await context.params;

  const review = await prisma.diagramReview.findUnique({
    where: { id },
    select: {
      id: true,
      requesterId: true,
      objective: true,
      dueDate: true,
      diagram: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
      reviewers: { select: { userId: true } },
    },
  });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (review.requesterId !== me) {
    return NextResponse.json({ error: "Only the requester can re-submit" }, { status: 403 });
  }
  if (review.reviewers.length === 0) {
    return NextResponse.json({ error: "No reviewers on this review" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.diagramReviewer.updateMany({
      where: { reviewId: id },
      data: { status: "pending", lastActivityAt: new Date() },
    }),
    prisma.diagramReview.update({
      where: { id },
      data: { status: "resubmitted" },
    }),
  ]);

  await createNotifications(
    review.reviewers.map((r) => ({
      userId: r.userId,
      type: "diagram-review-requested" as const,
      payload: {
        reviewId: review.id,
        diagramId: review.diagram.id,
        diagramName: review.diagram.name,
        groupId: review.group.id,
        groupName: review.group.name,
        objective: review.objective,
        dueDate: review.dueDate.toISOString(),
        fromUserId: me,
        fromUserName: myName,
        fromUserEmail: myEmail,
      },
    })),
  );

  return NextResponse.json({ ok: true, reviewers: review.reviewers.length });
}

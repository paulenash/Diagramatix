/**
 * POST /api/reviews/[id]/status   { action }
 *   The signed-in reviewer updates their own status on review [id]:
 *     "start"   → in-progress (silent)
 *     "submit"  → submitted        → notifies the requester
 *     "approve" → approved         → notifies the requester
 *     "decline" → declined-to-review → notifies the requester
 *   Caller must be an assigned reviewer on the review.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { createNotification, type NotificationType } from "@/app/lib/notifications";

const ACTION_TO_STATUS: Record<string, string> = {
  start: "in-progress",
  submit: "submitted",
  approve: "approved",
  decline: "declined-to-review",
};

const ACTION_TO_NOTIF: Record<string, NotificationType | null> = {
  start: null,
  submit: "diagram-review-submitted",
  approve: "diagram-review-approved",
  decline: "diagram-review-declined",
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { id: reviewId } = await context.params;

  let body: { action?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = body.action ?? "";
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const reviewer = await prisma.diagramReviewer.findUnique({
    where: { reviewId_userId: { reviewId, userId: me } },
    select: { id: true },
  });
  if (!reviewer) {
    return NextResponse.json({ error: "You are not a reviewer on this review" }, { status: 403 });
  }

  await prisma.diagramReviewer.update({
    where: { reviewId_userId: { reviewId, userId: me } },
    data: { status: newStatus, lastActivityAt: new Date() },
  });

  const notifType = ACTION_TO_NOTIF[action];
  if (notifType) {
    const review = await prisma.diagramReview.findUnique({
      where: { id: reviewId },
      select: {
        requesterId: true,
        objective: true,
        dueDate: true,
        diagram: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
    });
    if (review) {
      await createNotification(review.requesterId, notifType, {
        reviewId,
        diagramId: review.diagram.id,
        diagramName: review.diagram.name,
        groupId: review.group.id,
        groupName: review.group.name,
        objective: review.objective,
        dueDate: review.dueDate.toISOString(),
        fromUserId: me,
        fromUserName: session.user.name ?? null,
        fromUserEmail: session.user.email ?? undefined,
      });
    }
  }

  return NextResponse.json({ ok: true, status: newStatus });
}

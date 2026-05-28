/**
 * GET /api/reviews/[id]
 *   Review context for the signed-in user, used by the diagram editor's
 *   Review Mode banner + comment pre-fill. Caller must be a reviewer on
 *   the review OR its requester.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { id } = await context.params;

  const review = await prisma.diagramReview.findUnique({
    where: { id },
    select: {
      id: true,
      objective: true,
      dueDate: true,
      status: true,
      diagramId: true,
      requesterId: true,
      requester: { select: { name: true, email: true } },
      reviewers: {
        where: { userId: me },
        select: { status: true },
      },
    },
  });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const myReviewer = review.reviewers[0];
  const isRequester = review.requesterId === me;
  if (!myReviewer && !isRequester) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    reviewId: review.id,
    diagramId: review.diagramId,
    objective: review.objective,
    dueDate: review.dueDate.toISOString(),
    status: review.status,
    requesterName: review.requester.name ?? review.requester.email,
    requesterEmail: review.requester.email,
    isRequester,
    myStatus: myReviewer?.status ?? null,
    myUserId: me,
    myName: session.user.name ?? null,
    myEmail: session.user.email ?? null,
  });
}

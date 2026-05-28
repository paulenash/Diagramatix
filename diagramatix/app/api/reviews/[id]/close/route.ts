/**
 * POST /api/reviews/[id]/close
 *   The requester finalises a review round — marks the DiagramReview
 *   "closed". Closed reviews drop out of both dashboard collections
 *   (Received + Sent); the row is kept for history. Requester only.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const review = await prisma.diagramReview.findUnique({
    where: { id },
    select: { id: true, requesterId: true },
  });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (review.requesterId !== session.user.id) {
    return NextResponse.json({ error: "Only the requester can close the review" }, { status: 403 });
  }

  await prisma.diagramReview.update({
    where: { id },
    data: { status: "closed" },
  });
  return NextResponse.json({ ok: true });
}

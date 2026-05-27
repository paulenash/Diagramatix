/**
 * Phase 2 — Send for Review.
 *
 *   GET  /api/reviews
 *     Returns { received, sent } — the two virtual-project tile lists
 *     for the signed-in user (diagrams they must review + diagrams they
 *     sent for review).
 *
 *   POST /api/reviews   { diagramId, objective, dueDate, groups: [{ groupId, reviewerUserIds }] }
 *     Creates one DiagramReview per group + one DiagramReviewer per
 *     selected reviewer, and notifies each reviewer. Caller must own the
 *     diagram and be an owner/accepted-member of each target group;
 *     reviewers must be accepted members of their group.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { createNotifications } from "@/app/lib/notifications";
import {
  getReceivedForReviewDiagrams,
  getSentForReviewDiagrams,
} from "@/app/lib/reviewProjects";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [received, sent] = await Promise.all([
    getReceivedForReviewDiagrams(session.user.id),
    getSentForReviewDiagrams(session.user.id),
  ]);
  return NextResponse.json({ received, sent });
}

interface GroupSpec { groupId: string; reviewerUserIds: string[] }

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;

  let body: { diagramId?: string; objective?: string; dueDate?: string; groups?: GroupSpec[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const diagramId = body.diagramId;
  const objective = (body.objective ?? "").trim();
  const groups = Array.isArray(body.groups) ? body.groups : [];
  if (!diagramId) return NextResponse.json({ error: "diagramId required" }, { status: 400 });
  if (!objective) return NextResponse.json({ error: "An objective is required" }, { status: 400 });
  if (groups.length === 0) return NextResponse.json({ error: "Pick at least one group" }, { status: 400 });
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "A valid due date is required" }, { status: 400 });
  }

  // Caller must own the diagram they're sending.
  const diagram = await prisma.diagram.findUnique({
    where: { id: diagramId },
    select: { id: true, name: true, userId: true },
  });
  if (!diagram) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
  if (diagram.userId !== me) {
    return NextResponse.json({ error: "Only the diagram owner can send it for review" }, { status: 403 });
  }

  const notif: Parameters<typeof createNotifications>[0] = [];
  let createdReviews = 0;
  let createdReviewers = 0;

  for (const g of groups) {
    if (!g?.groupId) continue;
    // Caller must be owner or accepted member of the group.
    const group = await prisma.collaborationGroup.findUnique({
      where: { id: g.groupId },
      select: { id: true, name: true, ownerId: true },
    });
    if (!group) continue;
    const callerMember = await prisma.collaborationGroupMember.findUnique({
      where: { groupId_userId: { groupId: g.groupId, userId: me } },
      select: { status: true },
    });
    const callerInGroup = group.ownerId === me || callerMember?.status === "accepted";
    if (!callerInGroup) continue;

    // Resolve the requested reviewers to those who are accepted members
    // of THIS group (never the requester themselves).
    const wanted = new Set((g.reviewerUserIds ?? []).filter((id) => id && id !== me));
    if (wanted.size === 0) continue;
    const validMembers = await prisma.collaborationGroupMember.findMany({
      where: { groupId: g.groupId, userId: { in: [...wanted] }, status: "accepted" },
      select: { userId: true },
    });
    const reviewerIds = validMembers.map((m) => m.userId);
    if (reviewerIds.length === 0) continue;

    const review = await prisma.diagramReview.create({
      data: {
        diagramId,
        groupId: g.groupId,
        requesterId: me,
        objective,
        dueDate,
        status: "open",
        reviewers: {
          create: reviewerIds.map((userId) => ({ userId, status: "pending" })),
        },
      },
      select: { id: true },
    });
    createdReviews += 1;
    createdReviewers += reviewerIds.length;

    for (const userId of reviewerIds) {
      notif.push({
        userId,
        type: "diagram-review-requested",
        payload: {
          reviewId: review.id,
          diagramId,
          diagramName: diagram.name,
          groupId: group.id,
          groupName: group.name,
          objective,
          dueDate: dueDate.toISOString(),
          fromUserId: me,
          fromUserName: session.user.name ?? null,
          fromUserEmail: session.user.email ?? undefined,
        },
      });
    }
  }

  if (createdReviews === 0) {
    return NextResponse.json(
      { error: "No reviews created — check you're in the selected groups and picked valid reviewers" },
      { status: 400 },
    );
  }
  await createNotifications(notif);
  return NextResponse.json({ ok: true, reviews: createdReviews, reviewers: createdReviewers });
}

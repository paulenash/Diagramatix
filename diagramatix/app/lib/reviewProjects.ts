/**
 * Phase 2 — "Send for Review" virtual projects.
 *
 * Unlike the system archive (a real Project that owns rows), the two
 * review collections own NO Diagram rows. Their membership is derived
 * per request from the DiagramReview / DiagramReviewer tables:
 *   - Received: diagrams where the current user is an assigned reviewer.
 *   - Sent:     diagrams the current user has sent for review (one tile
 *               per DiagramReview, so sending to N groups = N tiles).
 *
 * The dashboard pins these as two synthetic projects at the top of the
 * list, keyed by the slug IDs below.
 */

import { prisma } from "@/app/lib/db";

export const REVIEWS_RECEIVED_ID = "__REVIEWS_RECEIVED__";
export const REVIEWS_SENT_ID = "__REVIEWS_SENT__";
export const REVIEWS_RECEIVED_LABEL = "Diagrams Received for Review";
export const REVIEWS_SENT_LABEL = "Diagrams Sent for Review";

export function isReviewVirtualProject(id: string): boolean {
  return id === REVIEWS_RECEIVED_ID || id === REVIEWS_SENT_ID;
}

/**
 * True if `userId` is an assigned reviewer on any review of `diagramId`.
 * Grants a non-owner reviewer the right to open + comment on the
 * diagram (Phase 3 Review Mode), checked by the diagram page and the
 * diagram save endpoint.
 */
export async function isAssignedReviewer(userId: string, diagramId: string): Promise<boolean> {
  const row = await prisma.diagramReviewer.findFirst({
    where: { userId, review: { diagramId } },
    select: { id: true },
  });
  return !!row;
}

/** Uniform reviewer-status → pill style across the feature. */
export const REVIEWER_STATUS_STYLE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  "in-progress": "bg-blue-100 text-blue-700",
  submitted: "bg-green-100 text-green-700",
  approved: "bg-yellow-100 text-yellow-800",
  "declined-to-review": "bg-red-100 text-red-700",
};

/**
 * Tile border colour by due-date proximity (R: review):
 *   > 2 days away → green, ≤ 2 days → orange, past due → red.
 * Returns a Tailwind border class.
 */
export function dueDateBorderClass(dueDateISO: string): string {
  const due = new Date(dueDateISO).getTime();
  const now = Date.now();
  const days = (due - now) / 86_400_000;
  if (days < 0) return "border-red-500";
  if (days <= 2) return "border-orange-400";
  return "border-green-400";
}

export interface ReviewerStatusEntry {
  userId: string;
  name: string | null;
  email: string;
  status: string;
}

export interface ReviewTile {
  /** The underlying diagram. */
  diagramId: string;
  diagramName: string;
  diagramType: string;
  /** Review context driving the tile's footer + border colour. */
  reviewContext: {
    role: "received" | "sent";
    reviewId: string;
    groupName: string;
    objective: string;
    dueDate: string;       // ISO
    status: string;        // DiagramReview.status
    requesterName: string;
    requesterEmail: string;
    /** Present on "sent" tiles: per-reviewer colour-coded statuses. */
    reviewerStatuses?: ReviewerStatusEntry[];
    /** Present on "received" tiles: this user's own reviewer status. */
    myStatus?: string;
  };
}

/** Diagrams the user has been asked to review (one tile per assignment). */
export async function getReceivedForReviewDiagrams(userId: string): Promise<ReviewTile[]> {
  const rows = await prisma.diagramReviewer.findMany({
    where: { userId, review: { status: { not: "closed" } } },
    include: {
      review: {
        include: {
          diagram: { select: { id: true, name: true, type: true } },
          group: { select: { name: true } },
          requester: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { review: { dueDate: "asc" } },
  });
  return rows.map((r) => ({
    diagramId: r.review.diagram.id,
    diagramName: r.review.diagram.name,
    diagramType: r.review.diagram.type,
    reviewContext: {
      role: "received" as const,
      reviewId: r.reviewId,
      groupName: r.review.group.name,
      objective: r.review.objective,
      dueDate: r.review.dueDate.toISOString(),
      status: r.review.status,
      requesterName: r.review.requester.name ?? r.review.requester.email,
      requesterEmail: r.review.requester.email,
      myStatus: r.status,
    },
  }));
}

/** Diagrams the user has sent for review (one tile per DiagramReview). */
export async function getSentForReviewDiagrams(userId: string): Promise<ReviewTile[]> {
  const reviews = await prisma.diagramReview.findMany({
    where: { requesterId: userId, status: { not: "closed" } },
    include: {
      diagram: { select: { id: true, name: true, type: true } },
      group: { select: { name: true } },
      requester: { select: { name: true, email: true } },
      reviewers: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: { dueDate: "asc" },
  });
  return reviews.map((rev) => ({
    diagramId: rev.diagram.id,
    diagramName: rev.diagram.name,
    diagramType: rev.diagram.type,
    reviewContext: {
      role: "sent" as const,
      reviewId: rev.id,
      groupName: rev.group.name,
      objective: rev.objective,
      dueDate: rev.dueDate.toISOString(),
      status: rev.status,
      requesterName: rev.requester.name ?? rev.requester.email,
      requesterEmail: rev.requester.email,
      reviewerStatuses: rev.reviewers.map((rr) => ({
        userId: rr.userId,
        name: rr.user.name,
        email: rr.user.email,
        status: rr.status,
      })),
    },
  }));
}

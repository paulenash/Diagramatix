/**
 * Helper functions for creating in-app notifications.
 *
 * Notifications are minimal — a discriminator string + a JSON payload.
 * Each callsite that creates one knows what payload shape it needs;
 * the bell-popover renderer dispatches on `type` to render the row.
 */

import { prisma } from "@/app/lib/db";

export type NotificationType =
  | "group-invite"
  | "group-invite-accepted"
  | "group-invite-declined"
  | "group-removed"
  | "ownership-transfer"
  | "ownership-transfer-accepted"
  | "ownership-transfer-declined"
  // Phase 2 — Send for Review.
  | "diagram-review-requested"   // → each assigned reviewer when owner sends
  | "diagram-review-submitted"   // → requester when a reviewer submits
  | "diagram-review-approved"    // → requester when a reviewer approves
  | "diagram-review-declined"    // → requester when a reviewer declines to review
  // BPMN lifecycle (publish bundles + feedback + review cadence).
  | "bundle-published"           // → each audience member when owner publishes a bundle
  | "feedback-received"          // → diagram owner when a business user files feedback
  | "review-due";                // → diagram owner from the daily cron when nextReviewDate is past

export interface NotificationPayload {
  // group-invite / group-invite-accepted / group-invite-declined /
  // group-removed / ownership-transfer*: all carry groupId + groupName.
  groupId?: string;
  groupName?: string;
  // Who triggered the notification (inviter, accepter, etc.).
  fromUserId?: string;
  fromUserName?: string | null;
  fromUserEmail?: string;
  // ownership-transfer*: the pending OwnershipTransfer row.
  transferId?: string;
  // diagram-review-*: the review + diagram it concerns.
  reviewId?: string;
  diagramId?: string;
  diagramName?: string;
  objective?: string;
  dueDate?: string;   // ISO
  // BPMN lifecycle — bundle-published / feedback-received / review-due.
  bundleId?: string;
  bundleName?: string;
  rootDiagramId?: string;       // bundle-published: which root the audience lands on first (if single)
  feedbackId?: string;          // feedback-received: the new DiagramFeedback row id
  publishedVersionId?: string;  // review-due: the version that's now overdue
  versionNumber?: number;       // review-due / bundle-published
  nextReviewDate?: string;      // review-due (ISO)
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
    },
  });
}

export async function createNotifications(
  rows: Array<{ userId: string; type: NotificationType; payload: NotificationPayload }>,
): Promise<void> {
  if (rows.length === 0) return;
  await prisma.notification.createMany({
    data: rows.map(r => ({
      userId: r.userId,
      type: r.type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: r.payload as any,
    })),
  });
}

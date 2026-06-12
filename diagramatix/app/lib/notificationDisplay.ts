/**
 * Shared display metadata for notifications — used by the bell, the
 * full Notifications page, and the admin variants so the labels and
 * categories stay consistent everywhere.
 */

import type { NotificationType } from "@/app/lib/notifications";

// Human-readable label per notification type. Keep in sync with the
// NotificationType union in notifications.ts.
export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  "group-invite": "Collaboration Group Invite",
  "group-invite-accepted": "Group Invite Accepted",
  "group-invite-declined": "Group Invite Declined",
  "group-removed": "Removed from Group",
  "ownership-transfer": "Group Ownership Offered",
  "ownership-transfer-accepted": "Group Ownership Accepted",
  "ownership-transfer-declined": "Group Ownership Declined",
  "diagram-review-requested": "Collaboration Group Review — Requested",
  "diagram-review-submitted": "Review Submitted",
  "diagram-review-approved": "Review Approved",
  "diagram-review-declined": "Review Declined",
  "bundle-published": "Process Published to You",
  "feedback-received": "Publish Feedback Received",
  "review-due": "Review Due",
};

// Coarser grouping for the filter dropdown — several fine-grained types
// roll up to one user-facing category.
export const NOTIFICATION_CATEGORY: Record<string, string> = {
  "group-invite": "Collaboration Group",
  "group-invite-accepted": "Collaboration Group",
  "group-invite-declined": "Collaboration Group",
  "group-removed": "Collaboration Group",
  "ownership-transfer": "Collaboration Group",
  "ownership-transfer-accepted": "Collaboration Group",
  "ownership-transfer-declined": "Collaboration Group",
  "diagram-review-requested": "Diagram Review",
  "diagram-review-submitted": "Diagram Review",
  "diagram-review-approved": "Diagram Review",
  "diagram-review-declined": "Diagram Review",
  "bundle-published": "Publishing",
  "feedback-received": "Publish Feedback",
  "review-due": "Review Due",
};

export function typeLabel(type: string): string {
  return NOTIFICATION_TYPE_LABEL[type] ?? type;
}

export function categoryLabel(type: string): string {
  return NOTIFICATION_CATEGORY[type] ?? "Other";
}

// All distinct categories, for the filter dropdown.
export const ALL_CATEGORIES = Array.from(
  new Set(Object.values(NOTIFICATION_CATEGORY)),
).sort();

// "3 days ago" style relative label.
export function daysAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// Per-type deep link inside the diagram (so the row's action matches what
// the bell does). Returns null when the notification has no diagram.
export function diagramHrefForNotification(
  type: string,
  diagramId: string | null,
  reviewId: string | null,
  backHref: string,
): string | null {
  if (!diagramId) return null;
  const from = `?from=${encodeURIComponent(backHref)}`;
  if (type === "diagram-review-requested" && reviewId) {
    return `/diagram/${diagramId}?review=${reviewId}&from=${encodeURIComponent(backHref)}`;
  }
  if (type === "feedback-received") {
    return `/diagram/${diagramId}?feedback=1&from=${encodeURIComponent(backHref)}`;
  }
  return `/diagram/${diagramId}${from}`;
}

// Narrow re-export so callers can type against the canonical union when
// they have it.
export type { NotificationType };

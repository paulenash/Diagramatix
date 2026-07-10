/**
 * Review-due selection (pure) — decides which published diagrams / bundles are
 * overdue for review and haven't already been notified this cycle. The daily
 * cron (app/api/cron/review-due) fetches candidates, filters with these, fires a
 * `review-due` notification, and stamps `lastReviewDueNotifiedAt` so re-runs are
 * idempotent. Kept pure so the guard logic is unit-testable without a DB.
 */

export interface ReviewDueItem {
  nextReviewDate: Date | null;
  /** Cron idempotency guard — when the last review-due notice fired. */
  lastReviewDueNotifiedAt: Date | null;
}

/**
 * Due iff the review date has passed AND we haven't notified for THIS review
 * window yet. A notice stamps `lastReviewDueNotifiedAt` at/after the review
 * date, so a second run skips it; moving the review date forward (or a
 * re-publish, which nulls the guard) re-arms it.
 */
export function isReviewDue(item: ReviewDueItem, now: Date): boolean {
  const due = item.nextReviewDate;
  if (!due || due.getTime() > now.getTime()) return false;
  const last = item.lastReviewDueNotifiedAt;
  return !last || last.getTime() < due.getTime();
}

export function selectReviewDue<T extends ReviewDueItem>(items: T[], now: Date): T[] {
  return items.filter((i) => isReviewDue(i, now));
}

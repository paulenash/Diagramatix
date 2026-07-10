/**
 * Review-due selection (T0699). The daily cron fires a `review-due` notice for
 * a published diagram/bundle once its review date passes, then stamps
 * `lastReviewDueNotifiedAt` so it never spams. This pins that guard: due only
 * when overdue AND not yet notified for the current window; re-arms when the
 * review date moves forward (or a re-publish nulls the guard).
 */
import { describe, it, expect } from "vitest";
import { isReviewDue, selectReviewDue, type ReviewDueItem } from "@/app/lib/diagram/reviewDue";

const now = new Date("2026-07-10T00:00:00Z");
const d = (s: string) => new Date(s);

describe("review-due selection (T0699)", () => {
  it("is not due when there's no review date or it's still in the future", () => {
    expect(isReviewDue({ nextReviewDate: null, lastReviewDueNotifiedAt: null }, now)).toBe(false);
    expect(isReviewDue({ nextReviewDate: d("2026-08-01"), lastReviewDueNotifiedAt: null }, now)).toBe(false);
  });

  it("is due when overdue and never notified", () => {
    expect(isReviewDue({ nextReviewDate: d("2026-06-01"), lastReviewDueNotifiedAt: null }, now)).toBe(true);
  });

  it("is idempotent — not due again once notified for this window", () => {
    // The cron stamps lastReviewDueNotifiedAt = now (>= the review date).
    const item: ReviewDueItem = { nextReviewDate: d("2026-06-01"), lastReviewDueNotifiedAt: now };
    expect(isReviewDue(item, now)).toBe(false);
  });

  it("re-arms when the review date is pushed forward past the last notice", () => {
    // Owner moved the (now past-again) review date beyond the old stamp.
    const item: ReviewDueItem = { nextReviewDate: d("2026-07-05"), lastReviewDueNotifiedAt: d("2026-06-01") };
    expect(isReviewDue(item, now)).toBe(true);
  });

  it("selectReviewDue keeps only the overdue-unnotified items", () => {
    const items = [
      { id: "a", nextReviewDate: d("2026-06-01"), lastReviewDueNotifiedAt: null },       // due
      { id: "b", nextReviewDate: d("2026-09-01"), lastReviewDueNotifiedAt: null },       // future
      { id: "c", nextReviewDate: d("2026-06-01"), lastReviewDueNotifiedAt: now },         // already notified
      { id: "d", nextReviewDate: null, lastReviewDueNotifiedAt: null },                   // no review
    ];
    expect(selectReviewDue(items, now).map((i) => i.id)).toEqual(["a"]);
  });
});

/**
 * Mobile review-comment helpers: `collapseReviewCommentElement` (pure collapse used
 * by mobile Save — "always collapse review comments on save") and
 * `buildReviewComment` (creates a note + tether identical to the desktop shape).
 */
import { describe, it, expect } from "vitest";
import { collapseReviewCommentElement, collapseAllReviewComments, REVIEW_COLLAPSED_W, REVIEW_COLLAPSED_H } from "@/app/lib/diagram/reviewCollapse";
import { buildReviewComment } from "@/app/lib/diagram/reviewComment";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const rc = (id: string): DiagramElement => ({ id, type: "review-comment", x: 100, y: 80, width: 227, height: 144, label: "note", properties: {} });
const task = (id: string): DiagramElement => ({ id, type: "task", x: 400, y: 100, width: 120, height: 60, label: "Do a thing", properties: {} });

describe("mobile review-comment helpers", () => {
  it("T2261 — collapse shrinks to the 38x32 icon and stashes expanded geometry; idempotent", () => {
    const c = collapseReviewCommentElement(rc("r1"));
    expect(c.width).toBe(REVIEW_COLLAPSED_W);
    expect(c.height).toBe(REVIEW_COLLAPSED_H);
    expect(c.properties.collapsed).toBe(true);
    expect(c.properties.expandedWidth).toBe(227);
    expect(c.properties.expandedHeight).toBe(144);
    expect(c.properties.expandedX).toBe(100);
    expect(c.properties.expandedY).toBe(80);
    // idempotent — a second collapse doesn't re-stash the (now 38x32) size
    const again = collapseReviewCommentElement(c);
    expect(again.properties.expandedWidth).toBe(227);
    // non-review elements pass through untouched
    expect(collapseReviewCommentElement(task("t1"))).toEqual(task("t1"));
  });

  it("T2262 — collapseAllReviewComments only touches review-comment elements", () => {
    const data: DiagramData = { elements: [rc("r1"), task("t1")], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const out = collapseAllReviewComments(data);
    expect(out.elements.find((e) => e.id === "r1")!.width).toBe(REVIEW_COLLAPSED_W);
    expect(out.elements.find((e) => e.id === "t1")!.width).toBe(120);
  });

  it("T2263 — buildReviewComment makes a review-comment + a review-comment-link tether to the target", () => {
    const t = task("t1");
    const { element, connector } = buildReviewComment(t, [t], "Please clarify", { reviewerId: "u1", reviewerName: "Paul" });
    expect(element.type).toBe("review-comment");
    expect(element.label).toBe("Please clarify");
    expect(element.width).toBe(227);
    expect(element.properties.reviewerName).toBe("Paul");
    expect(connector.type).toBe("review-comment-link");
    expect(connector.directionType).toBe("non-directed");
    // one endpoint is the note, the other the target
    expect([connector.sourceId, connector.targetId].sort()).toEqual([element.id, "t1"].sort());
    expect(Array.isArray(connector.waypoints)).toBe(true);
  });
});

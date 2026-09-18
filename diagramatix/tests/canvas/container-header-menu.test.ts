/**
 * T4550-T4552 — what a right-click on a pool or lane offers, and where.
 *
 * Paul, 2026-09-19:
 *   1. "The right-click menu should show 'Generate SOP …' only when clicked on
 *       the Pool or Lane Header region."
 *   2. "The right-click menu should show the element matrix when clicked in the
 *       body of the pool or lane."
 *   3. "The right-click menu element matrix should include the Pool/Lane after
 *       the Gateway, and the Pain Point, Issue, and Review Comment at the end."
 *
 * The container's own menu belongs to the container's own strip; the body
 * offers what you can put IN it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_HEADER_W, containerHeaderWidth, inContainerHeader, isHeaderContainer,
} from "@/app/lib/diagram/containerHeader";
import { quickAddSymbols, QUICK_ADD_LABELS, REVIEW_COMMENT } from "@/app/lib/diagram/quickAddSymbols";
import type { DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const container = (type: string, properties: Record<string, unknown> = {}): DiagramElement =>
  ({ id: "c1", type, label: "Sales", x: 100, y: 200, width: 800, height: 160, properties }) as unknown as DiagramElement;

describe("T4550 — the header strip, read not assumed", () => {
  it("falls back to 36px on a container that was never resized", () => {
    expect(DEFAULT_HEADER_W).toBe(36);
    expect(containerHeaderWidth(container("pool"))).toBe(36);
    expect(containerHeaderWidth(container("lane"))).toBe(36);
  });

  it("honours a resized strip, per container kind", () => {
    // Widening a pool header once made clicks on the right of it silently do
    // nothing, because the 36 was assumed rather than read.
    expect(containerHeaderWidth(container("pool", { poolHeaderWidth: 72 }))).toBe(72);
    expect(containerHeaderWidth(container("lane", { laneHeaderWidth: 54 }))).toBe(54);
    // A pool must not read the lane key, or vice versa.
    expect(containerHeaderWidth(container("pool", { laneHeaderWidth: 72 }))).toBe(36);
    expect(containerHeaderWidth(container("lane", { poolHeaderWidth: 72 }))).toBe(36);
  });

  it("ignores a nonsense stored width", () => {
    expect(containerHeaderWidth(container("pool", { poolHeaderWidth: 0 }))).toBe(36);
    expect(containerHeaderWidth(container("pool", { poolHeaderWidth: -20 }))).toBe(36);
    expect(containerHeaderWidth(container("pool", { poolHeaderWidth: "wide" }))).toBe(36);
  });

  it("puts the strip on the left, inside the container's own rows", () => {
    const pool = container("pool");
    expect(inContainerHeader(pool, { x: 110, y: 250 }), "in the strip").toBe(true);
    expect(inContainerHeader(pool, { x: 136, y: 250 }), "the right edge of the strip").toBe(true);
    expect(inContainerHeader(pool, { x: 137, y: 250 }), "one pixel into the body").toBe(false);
    expect(inContainerHeader(pool, { x: 500, y: 250 }), "the body").toBe(false);
    expect(inContainerHeader(pool, { x: 90, y: 250 }), "left of the container").toBe(false);
    expect(inContainerHeader(pool, { x: 110, y: 190 }), "above it").toBe(false);
    expect(inContainerHeader(pool, { x: 110, y: 400 }), "below it").toBe(false);
  });

  it("moves the boundary with a resized strip", () => {
    const wide = container("pool", { poolHeaderWidth: 100 });
    expect(inContainerHeader(wide, { x: 190, y: 250 })).toBe(true);
    expect(inContainerHeader(wide, { x: 210, y: 250 })).toBe(false);
  });

  it("is only a thing for pools and lanes", () => {
    expect(isHeaderContainer({ type: "pool" })).toBe(true);
    expect(isHeaderContainer({ type: "lane" })).toBe(true);
    expect(isHeaderContainer({ type: "task" })).toBe(false);
    expect(inContainerHeader(container("task"), { x: 110, y: 250 })).toBe(false);
  });

  it("is the only copy of the rule", () => {
    // It was being re-derived in five places, each with its own 36. A sixth
    // would have been the one that drifted.
    const canvas = read("app", "components", "canvas", "Canvas.tsx");
    const renderer = read("app", "components", "canvas", "SymbolRenderer.tsx");
    for (const [name, src] of [["Canvas", canvas], ["SymbolRenderer", renderer]] as const) {
      expect(src, `${name} must not re-derive the header width`)
        .not.toMatch(/(poolHeaderWidth|laneHeaderWidth)[\s\S]{0,120}\?\s*stored\s*:\s*36/);
      expect(src).toContain("containerHeaderWidth");
    }
  });
});

describe("T4551 — the element matrix", () => {
  const bpmn = quickAddSymbols("bpmn", { canAddReviewComment: true });

  it("puts Pool/Lane straight after the Gateway", () => {
    expect(bpmn[bpmn.indexOf("gateway") + 1]).toBe("pool");
  });

  it("ends with Pain Point, Issue and Review Comment, in that order", () => {
    expect(bpmn.slice(-3)).toEqual(["uml-pain-point", "uml-issue", "review-comment"]);
  });

  it("keeps everything that was already there", () => {
    for (const sym of ["start-event", "intermediate-event", "end-event", "task", "subprocess",
      "subprocess-expanded", "gateway", "data-object", "data-store", "text-annotation", "group"]) {
      expect(bpmn, `${sym} must still be offered`).toContain(sym);
    }
    expect(new Set(bpmn).size, "and nothing is listed twice").toBe(bpmn.length);
  });

  it("names every symbol it offers", () => {
    // An unlabelled button is a button with an empty tooltip.
    for (const type of ["bpmn", "state-machine", "value-chain"] as const) {
      for (const sym of quickAddSymbols(type, { canAddReviewComment: true })) {
        expect(QUICK_ADD_LABELS[sym], `${sym} needs a label`).toBeTruthy();
      }
    }
    expect(QUICK_ADD_LABELS["pool"]).toBe("Pool/Lane");
    expect(QUICK_ADD_LABELS["uml-pain-point"]).toBe("Pain Point");
    expect(QUICK_ADD_LABELS["uml-issue"]).toBe("Issue");
    expect(QUICK_ADD_LABELS["review-comment"]).toBe("Review Comment");
  });

  it("withholds the Review Comment where the editor cannot build one", () => {
    // It carries an author and a timestamp, so a bare shape would be wrong.
    expect(quickAddSymbols("bpmn")).not.toContain(REVIEW_COMMENT);
    expect(quickAddSymbols("bpmn", { canAddReviewComment: false })).not.toContain(REVIEW_COMMENT);
    expect(quickAddSymbols("bpmn", { canAddReviewComment: false }).slice(-2))
      .toEqual(["uml-pain-point", "uml-issue"]);
  });

  it("leaves the other diagram types alone", () => {
    expect(quickAddSymbols("state-machine", { canAddReviewComment: true })).not.toContain("pool");
    expect(quickAddSymbols("value-chain", { canAddReviewComment: true })).toEqual(
      ["chevron", "chevron-collapsed", "process-group"]);
  });

  it("builds a Review Comment through the editor, not as a bare shape", () => {
    const canvas = read("app", "components", "canvas", "Canvas.tsx");
    expect(canvas).toContain('if (sym === "review-comment") onAddReviewComment?.(quickAdd.worldPos, null);');
  });
});

describe("T4552 — header opens the container menu, body opens the matrix", () => {
  const canvas = read("app", "components", "canvas", "Canvas.tsx");

  it("requires a header click before the container menu opens", () => {
    expect(canvas).toContain("const headerClick = target");
    expect(canvas).toContain("inContainerHeader(target, worldPos)");
    expect(canvas).toContain("if (target && headerClick && hasItems) {");
  });

  it("falls through to the matrix otherwise", () => {
    // The body click must reach the quick-add fallback rather than returning
    // with no menu at all.
    const handler = canvas.slice(canvas.indexOf("const headerClick = target"));
    const fallback = handler.indexOf("setQuickAdd({");
    const guarded = handler.indexOf("if (target && headerClick && hasItems) {");
    expect(fallback, "the quick-add fallback follows the container branch").toBeGreaterThan(guarded);
  });

  it("answers anywhere on a black-box pool", () => {
    // It has no body to put anything in, and dropping something in would turn
    // it into a white-box pool — which is never what is wanted.
    expect(canvas).toContain("isBlackBoxPool(target) || inContainerHeader(target, worldPos)");
  });
});

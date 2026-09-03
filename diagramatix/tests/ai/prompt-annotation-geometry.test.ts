import { describe, it, expect } from "vitest";
import { buildPromptAnnotation } from "@/app/lib/ai/promptAnnotation";
import type { DiagramElement } from "@/app/lib/diagram/types";

/**
 * The purple AI-Prompt note forgot where it was put.
 *
 * Paul, 2026-09-04: "after the edit it is replaced on the diagram with different
 * co-ordinates for its boundary. i.e. it forgets its original shape." Every
 * caller strips the old element and builds a fresh one, and the builder derived
 * x, y, width and height from the diagram's content box each time -- so a note
 * the user had dragged and resized snapped back to the left margin on any
 * rebuild. Nothing was preserved because nothing was passed.
 *
 * The rule these pin: geometry a PERSON chose outranks geometry we computed.
 * Height is the single exception, and only upward -- a taller note is better
 * than a clipped prompt, while a shrinking one is the same forgetting in the
 * other direction.
 */
const INPUT = { name: "Receive Order — AI prompt", text: "Line one.", generatedAt: "2026-09-04T00:00:00.000Z" };
const BBOX = { minX: 1000, midY: 500 };

const noteAt = (over: Partial<DiagramElement>): DiagramElement => ({
  id: "__ai_prompt_annotation", type: "text-annotation",
  x: 40, y: 60, width: 300, height: 500, label: "",
  ...over,
} as DiagramElement);

describe("AI-Prompt annotation — geometry survives a rebuild", () => {
  it("T3188 keeps the position and width the user left it at", () => {
    const built = buildPromptAnnotation(INPUT, BBOX, noteAt({}));
    expect(built.x).toBe(40);
    expect(built.y).toBe(60);
    expect(built.width).toBe(300);
  });

  it("T3189 without a previous note, places it against the content box", () => {
    // The first generation has nothing to preserve, and must still land clear of
    // the diagram rather than on top of it.
    const built = buildPromptAnnotation(INPUT, BBOX);
    expect(built.x).toBeLessThan(BBOX.minX);
    expect(built.y).toBeGreaterThan(0);
  });

  it("T3190 grows the height when the text no longer fits, and never shrinks it", () => {
    const long = { ...INPUT, text: Array.from({ length: 200 }, (_, i) => `Paragraph ${i}.`).join("\n") };
    const grown = buildPromptAnnotation(long, BBOX, noteAt({ height: 120 }));
    expect(grown.height).toBeGreaterThan(120);

    // A short prompt in a tall box the user made tall stays tall.
    const kept = buildPromptAnnotation(INPUT, BBOX, noteAt({ height: 900 }));
    expect(kept.height).toBe(900);
  });

  it("T3191 wraps to the width it was given, not the default", () => {
    // Height is derived from wrapped line count, so a narrow note must wrap
    // narrower and therefore run taller. Measuring against the default width
    // while rendering at the user's width is how a note ends up clipped.
    const narrow = buildPromptAnnotation({ ...INPUT, text: "word ".repeat(400) }, BBOX, noteAt({ width: 160, height: 1 }));
    const wide = buildPromptAnnotation({ ...INPUT, text: "word ".repeat(400) }, BBOX, noteAt({ width: 640, height: 1 }));
    expect(narrow.height).toBeGreaterThan(wide.height);
  });
});

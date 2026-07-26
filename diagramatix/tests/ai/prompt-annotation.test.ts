/**
 * The on-canvas "AI Prompt" annotation for AI-generated diagrams — heading format,
 * placement (left of + vertically centred on the diagram), and overwrite (strip).
 */
import { describe, it, expect } from "vitest";
import type { DiagramElement } from "@/app/lib/diagram/types";
import {
  formatGeneratedOn,
  promptHeading,
  contentBBox,
  buildPromptAnnotation,
  stripPromptAnnotations,
  AI_PROMPT_ANNOTATION_ID,
} from "@/app/lib/ai/promptAnnotation";

const el = (id: string, x: number, y: number, w = 100, h = 60, type = "task"): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], x, y, width: w, height: h, label: id, properties: {} });

describe("AI Prompt annotation", () => {
  it("T1032 formatGeneratedOn — dd-mm-yyyy, no leading-zero hour, padded minutes, lower-case am/pm", () => {
    // Local-time construction keeps this timezone-independent.
    expect(formatGeneratedOn(new Date(2026, 6, 16, 13, 35))).toBe("16-07-2026 1:35 pm"); // 1:35 pm (not 01:35)
    expect(formatGeneratedOn(new Date(2026, 0, 5, 9, 5))).toBe("05-01-2026 9:05 am");    // padded date + minute
    expect(formatGeneratedOn(new Date(2026, 6, 16, 0, 0))).toBe("16-07-2026 12:00 am");  // midnight → 12 am
    expect(formatGeneratedOn(new Date(2026, 6, 16, 12, 0))).toBe("16-07-2026 12:00 pm"); // noon → 12 pm
    // The heading uses the exact requested shape.
    expect(promptHeading("Event Gateway - Test 4", new Date(2026, 6, 16, 13, 35)))
      .toBe("AI Prompt: Event Gateway - Test 4 - Generated on: 16-07-2026 1:35 pm");
  });

  it("T1033 buildPromptAnnotation sits left-of + vertically-centred, and strip overwrites all prompt notes", () => {
    const content = [el("a", 200, 100, 120, 80), el("b", 400, 300, 120, 80)];
    const bbox = contentBBox(content)!;
    expect(bbox.minX).toBe(200);
    expect(bbox.midY).toBe((100 + 380) / 2);

    const anno = buildPromptAnnotation(
      { name: "P1", text: "line one\nline two", generatedAt: new Date(2026, 6, 16, 13, 35).toISOString() },
      bbox,
    );
    expect(anno.id).toBe(AI_PROMPT_ANNOTATION_ID);
    expect(anno.type).toBe("text-annotation");
    expect(anno.label.startsWith("AI Prompt: P1 - Generated on: 16-07-2026 1:35 pm\n\n")).toBe(true);
    expect(anno.label).toContain("line one\nline two");
    expect((anno.properties as Record<string, unknown>).aiPromptAnnotation).toBe(true);
    // Left of the diagram (right edge is GAP px before minX)…
    expect(anno.x + anno.width).toBeLessThanOrEqual(bbox.minX);
    // …and vertically centred on the content.
    expect(anno.y + anno.height / 2).toBeCloseTo(bbox.midY, 6);

    // Overwrite: a fresh generation strips ours + the legacy R56 + the script note.
    const withNotes = [
      { ...anno },
      el("_ai_gen_annotation", 0, 0),
      el("__ai_prompt_note", 0, 0),
      ...content,
    ];
    const stripped = stripPromptAnnotations(withNotes);
    expect(stripped.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("T1033b contentBBox is null for an empty / annotation-only diagram", () => {
    expect(contentBBox([])).toBeNull();
    expect(contentBBox([el(AI_PROMPT_ANNOTATION_ID, 0, 0, 320, 100, "text-annotation")])).toBeNull();
  });
});

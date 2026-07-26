/**
 * The on-canvas "AI Prompt" annotation for AI-generated diagrams — a `text-annotation`
 * element carrying the prompt that last generated the diagram, headed
 *   `AI Prompt: <name> - Generated on: <dd-mm-yyyy h:mm am|pm>`
 * placed to the LEFT of, and vertically centred on, the generated diagram.
 *
 * Pure + framework-free so it's unit-testable and can be reused by the editor
 * (DiagramEditor.onApplyDiagram) for EVERY generable diagram type. The editor
 * strips any prior prompt annotation (this one, or the legacy R56 / script notes)
 * and prepends a fresh one on each generation, so regeneration overwrites in place.
 */
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";
import { wrapText } from "@/app/lib/diagram/textMetrics";

/** Stable id so regeneration can find + overwrite the annotation. */
export const AI_PROMPT_ANNOTATION_ID = "__ai_prompt_annotation";

/** Ids of every prompt-note flavour we replace, so there's never a duplicate:
 *  ours, the legacy BPMN R56 `_ai_gen_annotation`, and the script `__ai_prompt_note`. */
const PROMPT_ANNOTATION_IDS = new Set([
  AI_PROMPT_ANNOTATION_ID,
  "_ai_gen_annotation",
  "__ai_prompt_note",
]);

const ANNOTATION_WIDTH = 320;
const GAP = 40; // px between the annotation's right edge and the diagram's left edge
// Mirror SymbolRenderer's text-annotation render EXACTLY so the box fits the text:
// it wraps to (width - PAD - 4) at 14px lines, 12px font, centred vertically.
const RENDER_PAD = 10;
const LINE_H = 14;
const V_PAD = 12; // extra px above + below the text so the box sits OUTSIDE it

/**
 * Format a Date as `dd-mm-yyyy h:mm am|pm` in LOCAL time — e.g. `16-07-2026 1:35 pm`.
 * Date is zero-padded; the hour has NO leading zero; minutes are zero-padded; the
 * meridiem is lower-case.
 */
export function formatGeneratedOn(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const ampm = h < 12 ? "am" : "pm";
  h = h % 12;
  if (h === 0) h = 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${h}:${min} ${ampm}`;
}

export interface ContentBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  midY: number;
}

/** Bounding box over the real diagram content (ignores any prompt annotation and
 *  markers). Returns null when there's nothing to bound. */
export function contentBBox(elements: DiagramElement[]): ContentBBox | null {
  const real = elements.filter((e) => !PROMPT_ANNOTATION_IDS.has(e.id));
  if (real.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of real) {
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.width);
    maxY = Math.max(maxY, e.y + e.height);
  }
  return { minX, minY, maxX, maxY, midY: (minY + maxY) / 2 };
}

/** Remove every prompt-note element (ours + legacy + script) so a fresh one can be
 *  prepended without duplicating. */
export function stripPromptAnnotations(elements: DiagramElement[]): DiagramElement[] {
  return elements.filter((e) => !PROMPT_ANNOTATION_IDS.has(e.id));
}

/** Remove any connector that hangs off a prompt-note element — e.g. the legacy
 *  BPMN R56 association that linked the "AI Generated" note to the start event.
 *  The note element is stripped by `stripPromptAnnotations`; this drops its
 *  now-orphaned association so no dangling line is left on the canvas. */
export function stripPromptAnnotationConnectors(connectors: Connector[]): Connector[] {
  return connectors.filter(
    (c) => !PROMPT_ANNOTATION_IDS.has(c.sourceId) && !PROMPT_ANNOTATION_IDS.has(c.targetId),
  );
}

/** Heading line for the annotation (and the Properties link tooltip). */
export function promptHeading(name: string, generatedAt: string | Date): string {
  const when = typeof generatedAt === "string" ? new Date(generatedAt) : generatedAt;
  return `AI Prompt: ${name} - Generated on: ${formatGeneratedOn(when)}`;
}

/** Rough box height for the wrapped label — enough to show heading + body without
 *  guessing the renderer's exact wrap, capped so a huge prompt doesn't dominate. */
/** Box height that fully contains the wrapped label — using the SAME wrapText the
 *  renderer uses (same width + font), so the box always sits OUTSIDE the text. No
 *  cap: the whole prompt is shown, however long. */
function boxHeight(label: string): number {
  const lines = wrapText(label, ANNOTATION_WIDTH - RENDER_PAD - 4, 12);
  return Math.max(70, lines.length * LINE_H + V_PAD * 2);
}

export interface PromptAnnotationInput {
  name: string;
  text: string;
  generatedAt: string; // ISO
}

/**
 * Build the AI-Prompt `text-annotation` element. `bbox` is the generated diagram's
 * content box (from `contentBBox`); the note sits GAP px to its left, vertically
 * centred. With no bbox (empty diagram) it lands at the origin. The `label` is PLAIN
 * text — heading line, blank line, then the full prompt text (no markdown).
 */
export function buildPromptAnnotation(
  input: PromptAnnotationInput,
  bbox: ContentBBox | null,
): DiagramElement {
  const label = `${promptHeading(input.name, input.generatedAt)}\n\n${input.text}`;
  const height = boxHeight(label);
  const x = bbox ? bbox.minX - ANNOTATION_WIDTH - GAP : 0;
  const y = bbox ? bbox.midY - height / 2 : 0;
  return {
    id: AI_PROMPT_ANNOTATION_ID,
    type: "text-annotation",
    x,
    y,
    width: ANNOTATION_WIDTH,
    height,
    label,
    properties: { boxed: true, annotationColor: "purple", aiPromptAnnotation: true },
  };
}

/**
 * The Voice Assist template window's types — moved verbatim out of
 * DiagramEditor.tsx (Stage 4 of mobile voice, 2026-09-29): the voice session
 * hook and the editor's template window both use them, and a hook must never
 * import from the page component.
 */
import type { TemplateCard, TemplateSection } from "@/app/lib/assist/templatePick";
import type { TemplateIds } from "@/app/lib/diagram/templatePreview";
import type { Connector, DiagramElement, Point } from "@/app/lib/diagram/types";

/** A template the window has put on the diagram to be looked at (templatePreview.ts). */
export type TemplateShowing = {
  card: TemplateCard;
  /** applyTemplate's stamp — asked of templateStillShowing before any swap or cancel. */
  stamp: number;
  /** The diagram it was applied to: what a swap restores while it is still showing. */
  base: { elements: DiagramElement[]; connectors: Connector[] };
  ids: TemplateIds;
};

/**
 * The "add template" window (Paul, 2026-09-24), and where its picks go — after
 * an element ("add template after X", 2026-09-25), at the pointer, or on the
 * end of the current elements in the lane under the middle of the screen
 * (templateAttach.ts `planTemplateDrop`).
 */
export type TemplateFlow = {
  /** A new window is a new id: a pick still loading for an old one is dropped. */
  openId: string;
  sections: TemplateSection[];
  cards: TemplateCard[];
  provisional: TemplateShowing | null;
  hiddenInitial: number;
  hiddenContainer: number;
  anchorId?: string;
  anchorName?: string;
  at?: Point;
  /** What was selected when the window opened. Once a number is picked the
   *  preview IS the selection, and "after selected" still means this. */
  selectionAtOpen: string[];
  /** Why the last pick was refused; the window stays open. */
  notice?: string | null;
};

/** How a template pick reports: one log line, written in the same tick as the change it describes. */
export type TemplateReport = (r: { ok: boolean; summary: string }) => void;

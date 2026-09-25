/**
 * What Animate says as each element appears — the guided-tour script.
 *
 * Animate already reveals a diagram in reading-and-flow order. Narration adds
 * the one thing a stakeholder who does not read BPMN needs: someone saying what
 * each shape is as it lands. The script is therefore the diagram's own labels,
 * in the order Animate already chose, and nothing invented.
 *
 * Three rules, and the reasons they are rules:
 *
 *  • **An unlabelled shape is silent.** A start event usually has no label, and
 *    "start event" said aloud tells a listener nothing they cannot see arriving.
 *  • **Notes are not the process.** Annotations, groups and review comments are
 *    commentary on the diagram, not steps in it — the same boundary Paul drew for
 *    "put a pool around everything" (`wrapInPoolPlan.ts`'s PROCESS_TYPES).
 *  • **A container says what it is.** A pool named "Customer" and a task named
 *    "Customer submits claim" are different kinds of thing, and in speech — with
 *    no shapes to look at — only the prefix says which just appeared.
 *
 * Connectors are never narrated. One appears the moment both its ends exist,
 * which is not where it would fall in a sentence, so reading them would cut
 * across the order the rest of the tour follows.
 */

import type { DiagramElement, SymbolType } from "@/app/lib/diagram/types";
import { speechTransform } from "./spokenText";

/** Commentary on the diagram rather than a step in it — never narrated. */
const NOT_THE_PROCESS: ReadonlySet<SymbolType> = new Set<SymbolType>([
  "text-annotation",
  "review-comment",
  "group",
  "process-group",
  // Body halves of two-part shapes: the titled half carries the label.
  "system-boundary-body",
  "composite-state-body",
]);

/** Containers, and the word that introduces each. */
const CONTAINER_WORD: Partial<Record<SymbolType, string>> = {
  pool: "Pool",
  lane: "Lane",
  sublane: "Sub-lane",
};

/**
 * The line to speak when `el` appears, or "" when it appears in silence.
 */
export function narrationFor(el: DiagramElement): string {
  if (NOT_THE_PROCESS.has(el.type)) return "";

  const label = speechTransform(el.label ?? "");
  if (!label) return "";

  const word = CONTAINER_WORD[el.type];
  return word ? `${word}, ${label}` : label;
}

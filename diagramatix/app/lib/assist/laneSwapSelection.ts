/**
 * Is the selection exactly TWO lanes of one pool (or of one lane — sub-lanes)? Then a bare "swap" / "swap lanes" is a whole
 * command and need not wait for names (Paul, 2026-10-04). Whether they are NEXT to each other is the apply's to say.
 *
 * Pure.
 */
import type { DiagramElement } from "../diagram/types";

export function twoLanesSelected(elements: readonly DiagramElement[], selectedIds: readonly string[]): boolean {
  if (selectedIds.length !== 2) return false;
  const picked = selectedIds.map((id) => elements.find((e) => e.id === id));
  return picked.every((e) => !!e && e.type === "lane") && picked[0]!.parentId === picked[1]!.parentId;
}

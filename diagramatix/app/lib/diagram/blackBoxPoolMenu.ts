/**
 * The right-click menu for a black-box pool.
 *
 * Paul, 2026-09-18: "Do not display the right-click Generate SOP for this pool
 * for a black-box pool. instead display a right-click popup menu to select /
 * deselect IT System and Collection."
 *
 * A black-box pool has no internals, so there is no procedure to write about —
 * a role SOP for it would be empty. What it does carry are the two flags that
 * say what the participant IS: `isSystem` (an IT application / database rather
 * than an external party, which is what feeds the Portal's "IT System" facet
 * and the entity lists) and `multiplicity: "collection"` (many instances of
 * the participant, drawn with the three-line collection glyph).
 *
 * Both flags already live in the Properties panel; this module is the single
 * place that says what they are called, how they read off an element and what
 * patch a click produces, so the two surfaces cannot drift. Pure — the menu
 * renders what it returns and hands the patch back to `onUpdateProperties`.
 */
import type { DiagramElement } from "./types";

export const isBlackBoxPool = (e: DiagramElement): boolean =>
  e.type === "pool" && (e.properties?.poolType as string | undefined) === "black-box";

/** A key a black-box pool's menu can toggle. */
export type BlackBoxPoolFlag = "isSystem" | "collection";

export interface BlackBoxPoolMenuItem {
  flag: BlackBoxPoolFlag;
  label: string;
  checked: boolean;
}

/** Is the flag set on this element right now? */
export function blackBoxPoolFlagOn(el: DiagramElement, flag: BlackBoxPoolFlag): boolean {
  const p = (el.properties ?? {}) as Record<string, unknown>;
  return flag === "isSystem"
    ? p.isSystem === true
    : (p.multiplicity as string | undefined) === "collection";
}

/** The menu, in display order, with each item's current tick state. */
export function blackBoxPoolMenuItems(el: DiagramElement): BlackBoxPoolMenuItem[] {
  if (!isBlackBoxPool(el)) return [];
  return [
    { flag: "isSystem",   label: "IT System",  checked: blackBoxPoolFlagOn(el, "isSystem") },
    { flag: "collection", label: "Collection", checked: blackBoxPoolFlagOn(el, "collection") },
  ];
}

/**
 * The properties patch for clicking one item. Deselecting `collection` clears
 * the key rather than writing "single" — that is what the Properties panel
 * does, and what the Visio exporter and the canvas glyph both test for.
 */
export function toggleBlackBoxPoolFlag(el: DiagramElement, flag: BlackBoxPoolFlag): Record<string, unknown> {
  const on = blackBoxPoolFlagOn(el, flag);
  return flag === "isSystem"
    ? { isSystem: !on }
    : { multiplicity: on ? undefined : "collection" };
}

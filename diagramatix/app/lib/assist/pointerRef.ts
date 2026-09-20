/**
 * M5 — the pointer as a reference. "Put a task here", "connect the selected
 * task to the one under the cursor".
 *
 * The mouse already says WHICH better than any name can (that is M1). This
 * extends the same idea to WHERE, which a name cannot express at all: there is
 * no way to say "just there, below Approve and left of the gateway" in words
 * that a parser could act on, and no reason to try when the hand is already
 * resting on the answer.
 *
 * ⚠ A DECISION WORTH RECORDING. The review plan asked for "connect this to
 * that", with *that* meaning the element under the pointer. That is not what
 * shipped, and deliberately: "this" and "that" ALREADY mean the selection
 * (M1, `a49a8006`, tested), and redefining one of them would regress shipped
 * behaviour. Worse, the plan's phrasing needs the two demonstratives to mean
 * DIFFERENT things inside one sentence — "this" the selection, "that" the
 * pointer — which is a rule nobody could remember and which would make every
 * existing "delete that" ambiguous.
 *
 * What ships instead:
 *
 *   • "here" / "there"                 → the pointer POSITION, for placement.
 *   • "the one under the cursor",      → the ELEMENT under the pointer.
 *     "this one here", "that one there"
 *   • "this" / "that"                  → unchanged: the selection; and NOW,
 *                                        when nothing is selected, the element
 *                                        under the pointer before falling back
 *                                        to the last one added.
 *
 * That last line is the part that makes the plan's intent work without
 * breaking anything: the selection still wins, so no shipped phrase changes
 * meaning, and pointing at something with nothing selected is a better guess
 * than "the last element added" ever was.
 *
 * So the plan's exact sentence is said as "connect the selected task to the one
 * under the cursor".
 *
 * Pure.
 */
import type { DiagramElement } from "../diagram/types";

/** Where the pointer last was, in WORLD coordinates. */
export interface PointerAt {
  x: number;
  y: number;
}

/** "here", "there", "right here", "over here" — a POSITION, not an element. */
const POSITION_WORD = /^(?:right |over |just )?(?:here|there)$/;

/**
 * "the one under the cursor", "this one here", "that one there", "the one I'm
 * pointing at" — the ELEMENT under the pointer.
 *
 * Every one of these is longer than a bare demonstrative on purpose. A word
 * this cheap to say should not be able to mean "somewhere entirely different
 * from what is selected".
 */
const POINTER_ELEMENT =
  /^(?:the\s+)?(?:(?:one|element|thing)\s+(?:under|below|beneath|at)\s+(?:the\s+)?(?:cursor|pointer|mouse)|(?:this|that)\s+one\s+(?:here|there)|one\s+(?:i'?m\s+)?pointing\s+at)$/;

/** Does this reference mean "the pointer position"? */
export function isPositionRef(spoken: string): boolean {
  return POSITION_WORD.test(spoken.toLowerCase().replace(/[.,!?;:]+$/g, "").trim());
}

/** Does this reference explicitly mean "the element under the pointer"? */
export function isPointerElementRef(spoken: string): boolean {
  return POINTER_ELEMENT.test(spoken.toLowerCase().replace(/[.,!?;:]+$/g, "").trim());
}

/**
 * The topmost element containing `at`.
 *
 * "Topmost" is LAST in document order, which is what the canvas paints on top
 * and therefore what the user believes they are pointing at. Containers are
 * skipped when anything smaller is under the pointer, because a pool covers
 * every element inside it and is almost never what the hand is aiming for —
 * but a pointer over the bare part of a pool still finds the pool, since
 * otherwise there would be no way to point at one at all.
 */
export function elementUnderPointer(
  at: PointerAt | null,
  elements: readonly DiagramElement[],
): DiagramElement | null {
  if (!at) return null;
  const hits = elements.filter(
    (e) => at.x >= e.x && at.x <= e.x + e.width && at.y >= e.y && at.y <= e.y + e.height,
  );
  if (!hits.length) return null;
  const CONTAINER = new Set(["pool", "lane", "sublane", "group", "system-boundary"]);
  const nonContainer = hits.filter((e) => !CONTAINER.has(e.type));
  const pool = nonContainer.length ? nonContainer : hits;
  // Smallest area first breaks the tie between a subprocess and the task drawn
  // inside it; document order settles anything genuinely overlapping.
  const area = (e: DiagramElement) => e.width * e.height;
  return [...pool].sort((a, b) => area(a) - area(b) || pool.indexOf(b) - pool.indexOf(a))[0] ?? null;
}

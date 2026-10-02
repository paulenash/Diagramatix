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
import type { Connector, DiagramElement } from "../diagram/types";
import { getLaneHeaderWidth, getPoolHeaderWidth } from "../diagram/containerMetrics";
import { externalLabelBox } from "../diagram/textMetrics";
import { connectorLabelBox } from "../diagram/checks/layoutViolations";

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

/** How close (px) the pointer must be to a connector's line to be "on" it — the line's own click width. */
export const CONNECTOR_HOVER_PX = 6;

const distToSegment = (p: PointerAt, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/**
 * The CONNECTOR under the pointer — on its line, or on its label (a message's name, a flow's condition). Paul,
 * 2026-10-02: connectors and their labels are hover targets too.
 *
 * Callers ask `elementUnderPointer` first and only come here when it found nothing: an element is in front of a
 * connector. A connector attached to an expanded subprocess is NOT hovered inside that subprocess (the same rule
 * as its click area — ConnectorRenderer `epHitHoles`): its stored route runs on to the subprocess's centre.
 */
export function hoverConnectorAt(
  at: PointerAt | null,
  elements: readonly DiagramElement[],
  connectors: readonly Connector[],
): Connector | null {
  if (!at) return null;
  const eps = elements.filter((e) => e.type === "subprocess-expanded");
  const insideEp = (c: Connector) => eps.some((e) => (e.id === c.sourceId || e.id === c.targetId) && at.x >= e.x && at.x <= e.x + e.width && at.y >= e.y && at.y <= e.y + e.height);
  let best: { c: Connector; d: number } | null = null;
  for (const c of connectors) {
    const box = connectorLabelBox(c, elements as DiagramElement[]);
    if (box && at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h) return c;   // its label: unambiguous
    if (insideEp(c)) continue;
    const w = c.waypoints ?? [];
    for (let i = 1; i < w.length; i++) {
      const d = distToSegment(at, w[i - 1], w[i]);
      if (d <= CONNECTOR_HOVER_PX && (!best || d < best.d)) best = { c, d };
    }
  }
  return best?.c ?? null;
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
  const inside = (e: DiagramElement) => at.x >= e.x && at.x <= e.x + e.width && at.y >= e.y && at.y <= e.y + e.height;
  const hits = elements.filter((e) => {
    if (!inside(e)) return false;
    // THE HOVER RULES FOR CONTAINERS (Paul, 2026-10-02). A white-box pool is the hover target only over its HEADER
    // (the name strip down its left), a lane or sub-lane only over ITS header; a black-box pool is fine as it is —
    // all of it. Their bodies are backgrounds: a cursor over the empty part of a lane is over nothing.
    if (e.type === "pool" && (e.properties as { poolType?: string } | undefined)?.poolType !== "black-box") return at.x <= e.x + getPoolHeaderWidth(e);
    if (e.type === "lane") return at.x <= e.x + getLaneHeaderWidth(e);
    return true;
  });
  // A LABEL counts as its element: an event's or a gateway's name is drawn outside the shape, and pointing at it is
  // pointing at the event or the gateway.
  for (const e of elements) {
    if (e.type !== "gateway" && e.type !== "start-event" && e.type !== "end-event" && e.type !== "intermediate-event") continue;
    const b = externalLabelBox(e);
    if (b && at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h && !hits.includes(e)) hits.push(e);
  }
  if (!hits.length) return null;
  const CONTAINER = new Set(["pool", "lane", "sublane", "group", "system-boundary"]);
  const nonContainer = hits.filter((e) => !CONTAINER.has(e.type));
  const pool = nonContainer.length ? nonContainer : hits;
  // Smallest area first breaks the tie between a subprocess and the task drawn
  // inside it; document order settles anything genuinely overlapping.
  const area = (e: DiagramElement) => e.width * e.height;
  // An event or gateway whose LABEL is under the pointer beats a larger shape that merely contains the point.
  const byLabel = pool.find((e) => {
    const b = externalLabelBox(e);
    return !!b && at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h;
  });
  if (byLabel) return byLabel;
  return [...pool].sort((a, b) => area(a) - area(b) || pool.indexOf(b) - pool.indexOf(a))[0] ?? null;
}

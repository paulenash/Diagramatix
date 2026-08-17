import type { DiagramElement } from "./types";

/**
 * The pool an element belongs to (its id), or null at the top level. Pure.
 * Shared by canConnect (pool-boundary rule), the connector-highlight module,
 * and the canvas. Lives in its own file so canConnect can use it without a
 * circular import through connectorHighlight.
 */
export function getElementPoolId(el: DiagramElement, elements: DiagramElement[]): string | null {
  if (el.type === "pool") return el.id;
  // Try parentId chain first (fast path)
  if (el.parentId) {
    const parent = elements.find((e) => e.id === el.parentId);
    if (parent?.type === "pool") return parent.id;
    if (parent?.type === "lane") {
      const gp = elements.find((e) => e.id === parent.parentId);
      if (gp?.type === "pool") return gp.id;
    }
  }
  // Fallback: position check — is this element's centre inside any pool?
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const pool = elements.find(
    (p) => p.type === "pool" &&
      cx >= p.x && cx <= p.x + p.width &&
      cy >= p.y && cy <= p.y + p.height
  );
  return pool?.id ?? null;
}

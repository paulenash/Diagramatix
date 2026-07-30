/**
 * Geometry for the ArchiMate Node ICON (the 3D "box"/cuboid form).
 *
 * A Node icon is a FRONT rectangle plus two external trapezium faces (a top face
 * and a right face) that give the 3D look. The front rectangle is the CONTAINMENT
 * boundary (label + any nested children live here); the trapeziums are pure
 * decoration that sit OUTSIDE it. The element's full bounds (front + trapeziums)
 * remain the ATTACHMENT boundary for connectors.
 *
 * `archiNodeDepth` is the shared trapezium size — it grows with the icon but is
 * capped at 80px, so the top face is never taller than 80px and the right face
 * never wider than 80px. The renderer (ArchimateShape), the label placement
 * (SymbolRenderer.getLabelPos) and the container hug (genericLayout) all read this
 * one function so they stay in agreement.
 */
export const ARCHI_NODE_MAX_DEPTH = 80;

export function archiNodeDepth(width: number, height: number): number {
  return Math.min(ARCHI_NODE_MAX_DEPTH, Math.max(10, Math.min(width, height) * 0.16));
}

/** The front rectangle (containment boundary) of a Node icon within its bounds. */
export function archiNodeFrontRect(
  x: number, y: number, width: number, height: number,
): { x: number; y: number; width: number; height: number; depth: number } {
  const depth = archiNodeDepth(width, height);
  return { x, y: y + depth, width: width - depth, height: height - depth, depth };
}

/** True for the Node ICON (3D box) form — the expressed form these rules apply to. */
export function isArchiNodeIcon(shapeKey: unknown, iconOnly: unknown): boolean {
  return iconOnly === true && typeof shapeKey === "string" && shapeKey.includes("node");
}

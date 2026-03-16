import type { DiagramElement, Connector, TemplateData, Point } from "./types";
import { nanoid } from "@/app/hooks/useDiagram";

/**
 * Capture selected elements and their mutual connectors as a template.
 * Positions are normalized relative to the bounding-box origin (0, 0).
 */
export function captureTemplate(
  elements: DiagramElement[],
  connectors: Connector[],
  selectedIds: Set<string>,
): TemplateData {
  const selected = elements.filter((el) => selectedIds.has(el.id));
  if (selected.length === 0) return { elements: [], connectors: [] };

  // Bounding box origin
  const minX = Math.min(...selected.map((el) => el.x));
  const minY = Math.min(...selected.map((el) => el.y));

  // Normalize element positions
  const normalizedElements = selected.map((el) => ({
    ...el,
    x: el.x - minX,
    y: el.y - minY,
    // Keep parentId/boundaryHostId only if the referenced element is also selected
    parentId: el.parentId && selectedIds.has(el.parentId) ? el.parentId : undefined,
    boundaryHostId: el.boundaryHostId && selectedIds.has(el.boundaryHostId) ? el.boundaryHostId : undefined,
  }));

  // Only include connectors where both endpoints are in the selection
  const mutualConnectors = connectors
    .filter((c) => selectedIds.has(c.sourceId) && selectedIds.has(c.targetId))
    .map((c) => ({
      ...c,
      waypoints: c.waypoints.map((wp) => ({ x: wp.x - minX, y: wp.y - minY })),
    }));

  return { elements: normalizedElements, connectors: mutualConnectors };
}

/**
 * Instantiate a template at a given center position.
 * Returns new elements/connectors with fresh IDs and translated positions.
 */
export function instantiateTemplate(
  templateData: TemplateData,
  centerX: number,
  centerY: number,
): { elements: DiagramElement[]; connectors: Connector[]; newIds: Set<string> } {
  if (templateData.elements.length === 0) {
    return { elements: [], connectors: [], newIds: new Set() };
  }

  // Compute template bounding box dimensions
  let maxX = 0;
  let maxY = 0;
  for (const el of templateData.elements) {
    const right = el.x + el.width;
    const bottom = el.y + el.height;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }

  // Offset to center the template at (centerX, centerY)
  const offsetX = centerX - maxX / 2;
  const offsetY = centerY - maxY / 2;

  // Build old ID → new ID map
  const idMap = new Map<string, string>();
  for (const el of templateData.elements) {
    idMap.set(el.id, nanoid());
  }

  const newIds = new Set<string>();

  // Clone elements with new IDs and translated positions
  const elements: DiagramElement[] = templateData.elements.map((el) => {
    const newId = idMap.get(el.id)!;
    newIds.add(newId);
    return {
      ...el,
      id: newId,
      x: el.x + offsetX,
      y: el.y + offsetY,
      parentId: el.parentId ? idMap.get(el.parentId) : undefined,
      boundaryHostId: el.boundaryHostId ? idMap.get(el.boundaryHostId) : undefined,
    };
  });

  // Clone connectors with new IDs and remapped source/target
  const connectors: Connector[] = templateData.connectors.map((c) => ({
    ...c,
    id: nanoid(),
    sourceId: idMap.get(c.sourceId) ?? c.sourceId,
    targetId: idMap.get(c.targetId) ?? c.targetId,
    waypoints: c.waypoints.map((wp: Point) => ({ x: wp.x + offsetX, y: wp.y + offsetY })),
  }));

  return { elements, connectors, newIds };
}

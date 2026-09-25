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

/**
 * The elements a sequence flow runs between — what a template can be joined to,
 * and what it can be joined BY. Data, annotations, pools and lanes are not.
 */
export const SEQUENCE_NODE_TYPES: ReadonlySet<string> = new Set([
  "task", "subprocess", "subprocess-expanded", "gateway", "start-event", "intermediate-event", "end-event",
]);

/**
 * The element a template attaches BY when joined inline to a selected element.
 *
 * A top-level flow node — not data, an annotation or a container, not mounted
 * on another element's edge, not an event sub-process (which is started by its
 * event, never by a flow) — with no incoming SEQUENCE flow. The old rule took
 * the first element with no incoming connector of ANY kind, so "Data Input /
 * Output" entered by its data object and "Perform Regular Task" by its event
 * sub-process, and the join was refused both times with the template already
 * placed. A loop (every step has a flow in) enters at its leftmost step; a
 * template with no such step has no entry at all (null).
 *
 * If the entry is a Start Event with a single outgoing sequence, it is stripped
 * (and its connector) — the entry becomes that connector's target. Returns the
 * (possibly trimmed) data + the entry element's id (in template-local id space).
 */
export function templateAttachData(
  templateData: TemplateData,
): { data: TemplateData; entryId: string } | null {
  const els = templateData.elements;
  if (els.length === 0) return null;
  const ids = new Set(els.map((e) => e.id));
  const joinable = els.filter((e) =>
    SEQUENCE_NODE_TYPES.has(e.type)
    && !(e.parentId && ids.has(e.parentId))
    && !e.boundaryHostId
    && !(e.type === "subprocess-expanded" && (e.properties?.subprocessType as string | undefined) === "event"));
  if (joinable.length === 0) return null;
  const incoming = new Set(templateData.connectors.filter((c) => c.type === "sequence").map((c) => c.targetId));
  let entry = joinable.find((e) => !incoming.has(e.id)) ?? [...joinable].sort((a, b) => a.x - b.x)[0];
  let data = templateData;

  if (entry.type === "start-event") {
    const out = templateData.connectors.filter((c) => c.sourceId === entry.id);
    if (out.length === 1) {
      const next = els.find((e) => e.id === out[0].targetId);
      if (next) {
        data = {
          elements: els.filter((e) => e.id !== entry.id),
          connectors: templateData.connectors.filter((c) => c.id !== out[0].id),
        };
        entry = next;
      }
    }
  }
  return { data, entryId: entry.id };
}

/**
 * Instantiate a template so its `entryId` element's TOP-LEFT lands at
 * (anchorX, anchorY). Fresh ids; returns the new entry id for wiring a
 * connector from the source. Sibling of instantiateTemplate (which centres).
 */
export function instantiateTemplateAnchored(
  templateData: TemplateData,
  entryId: string,
  anchorX: number,
  anchorY: number,
): { elements: DiagramElement[]; connectors: Connector[]; newIds: Set<string>; entryNewId: string | null } {
  const entry = templateData.elements.find((e) => e.id === entryId);
  const offsetX = entry ? anchorX - entry.x : anchorX;
  const offsetY = entry ? anchorY - entry.y : anchorY;

  const idMap = new Map<string, string>();
  for (const el of templateData.elements) idMap.set(el.id, nanoid());
  const newIds = new Set<string>();

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

  const connectors: Connector[] = templateData.connectors.map((c) => ({
    ...c,
    id: nanoid(),
    sourceId: idMap.get(c.sourceId) ?? c.sourceId,
    targetId: idMap.get(c.targetId) ?? c.targetId,
    waypoints: c.waypoints.map((wp: Point) => ({ x: wp.x + offsetX, y: wp.y + offsetY })),
  }));

  return { elements, connectors, newIds, entryNewId: entry ? idMap.get(entry.id)! : null };
}

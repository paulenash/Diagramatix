"use client";

import { useCallback, useReducer, useRef, useState } from "react";
import type {
  BpmnTaskType,
  FlowType,
  GatewayType,
  EventType,
  RepeatType,
  Bounds,
  Connector,
  ConnectorType,
  DiagramData,
  DiagramElement,
  DiagramTitle,
  DirectionType,
  Point,
  RoutingType,
  Side,
  SymbolType,
} from "@/app/lib/diagram/types";
import { computeWaypoints, recomputeAllConnectors, consolidateWaypoints, rectifyWaypoints, constrainControlPoint } from "@/app/lib/diagram/routing";
import { getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";
import { CHEVRON_THEMES } from "@/app/lib/diagram/chevronThemes";

const BPMN_EVENT_TYPES = new Set(["start-event", "intermediate-event", "end-event"]);

// ── Boundary-event geometry ───────────────────────────────────────────────────
const BOUNDARY_HOST_TYPES = new Set<SymbolType>(["task", "subprocess", "subprocess-expanded"]);
const BOUNDARY_EVENT_TYPES = new Set<SymbolType>(["start-event", "intermediate-event", "end-event"]);
const BOUNDARY_SNAP_THRESHOLD = 25; // world px
const BOUNDARY_W = 27;              // 75% of standard 36
const BOUNDARY_H = 27;

function nearestPointOnRectBoundary(
  rect: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number }
): { x: number; y: number } {
  const { x: rx, y: ry, width: rw, height: rh } = rect;
  const cx = Math.max(rx, Math.min(point.x, rx + rw));
  const cy = Math.max(ry, Math.min(point.y, ry + rh));
  if (cx !== point.x || cy !== point.y) return { x: cx, y: cy };
  // Inside rect → project to nearest edge
  const dL = point.x - rx, dR = rx + rw - point.x,
        dT = point.y - ry, dB = ry + rh - point.y;
  const m = Math.min(dL, dR, dT, dB);
  if (m === dL) return { x: rx,      y: point.y };
  if (m === dR) return { x: rx + rw, y: point.y };
  if (m === dT) return { x: point.x, y: ry       };
                return { x: point.x, y: ry + rh  };
}
// ─────────────────────────────────────────────────────────────────────────────

function boundaryEdgeOf(
  evCenter: { x: number; y: number },
  host: { x: number; y: number; width: number; height: number }
): { side: "top" | "bottom" | "left" | "right"; frac: number } {
  const { x, y, width, height } = host;
  const dTop    = Math.abs(evCenter.y - y);
  const dBottom = Math.abs(evCenter.y - (y + height));
  const dLeft   = Math.abs(evCenter.x - x);
  const dRight  = Math.abs(evCenter.x - (x + width));
  const min     = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop)    return { side: "top",    frac: (evCenter.x - x) / width  };
  if (min === dBottom) return { side: "bottom", frac: (evCenter.x - x) / width  };
  if (min === dLeft)   return { side: "left",   frac: (evCenter.y - y) / height };
                       return { side: "right",  frac: (evCenter.y - y) / height };
}

function messageBpmnWaypoints(
  source: DiagramElement, target: DiagramElement,
  sourceSide: Side, targetSide: Side, sourceOffset: number, _targetOffset?: number
): { waypoints: Point[]; sourceInvisibleLeader: true; targetInvisibleLeader: true } {
  const srcIsEvent = BPMN_EVENT_TYPES.has(source.type);
  const tgtIsEvent = BPMN_EVENT_TYPES.has(target.type);
  // Compute a single shared x — message connectors must always be vertical
  const effectiveSrcAlong = srcIsEvent ? 0.5 : sourceOffset;
  let x: number;
  if (tgtIsEvent) {
    x = target.x + target.width / 2;
  } else if (srcIsEvent) {
    x = source.x + source.width / 2;
  } else {
    // Use the source offset to position, clamped to both element boundaries
    const rawX = source.x + source.width * effectiveSrcAlong;
    // Clamp to source boundary
    x = Math.max(source.x, Math.min(source.x + source.width, rawX));
    // Also clamp to target boundary so the connector stays on both elements
    x = Math.max(target.x, Math.min(target.x + target.width, x));
  }
  const srcEdge: Point = sourceSide === "bottom"
    ? { x, y: source.y + source.height } : { x, y: source.y };
  const tgtEdge: Point = targetSide === "top"
    ? { x, y: target.y } : { x, y: target.y + target.height };
  return {
    waypoints: [
      { x: source.x + source.width / 2, y: source.y + source.height / 2 },
      srcEdge, tgtEdge,
      { x: target.x + target.width / 2, y: target.y + target.height / 2 },
    ],
    sourceInvisibleLeader: true,
    targetInvisibleLeader: true,
  };
}

/**
 * When messageBPMN waypoints change (endpoint move, space insertion, etc.),
 * adjust labelOffsetY so the label stays at the same signed distance from
 * its nearest original endpoint.
 *
 * Does NOT try to detect "sides flipped" — that's CASE A2's job and it uses
 * the stored-side-vs-optimal-side comparison, which is reliable. Doing flip
 * detection here by waypoint Y-ordering would double-fire (once at the real
 * flip and again when the pool's far edge crosses the task's far edge) and
 * reflect the label a second time.
 *
 * Waypoint formats:
 *   - 4 points [srcCenter, srcEdge, tgtEdge, tgtCenter] with both
 *     invisible-leader flags true (messageBpmnWaypoints runtime helper).
 *   - 2 points [srcEdge, tgtEdge] with both leaders false
 *     (bpmnLayout.ts AI output).
 * Edge indices are picked from the leader flags so either format works.
 */
function adjustMsgLabelOffset(
  conn: Connector,
  oldWaypoints: Point[],
  newWaypoints: Point[]
): { labelOffsetY?: number } {
  if (conn.type !== "messageBPMN") return {};
  if (oldWaypoints.length < 2 || newWaypoints.length < 2) return {};
  const oldSrcIdx = conn.sourceInvisibleLeader ? 1 : 0;
  const oldTgtIdx = conn.targetInvisibleLeader ? oldWaypoints.length - 2 : oldWaypoints.length - 1;
  // messageBpmnWaypoints always returns 4 points with both leaders; for
  // NEW waypoints use 1 / length-2 regardless of the OLD format.
  const newSrcIdx = 1;
  const newTgtIdx = newWaypoints.length - 2;
  const oldSrcY = oldWaypoints[oldSrcIdx].y;
  const oldTgtY = oldWaypoints[oldTgtIdx].y;
  const newSrcY = newWaypoints[newSrcIdx]?.y ?? 0;
  const newTgtY = newWaypoints[newTgtIdx]?.y ?? 0;
  const oldMidY = (oldSrcY + oldTgtY) / 2;
  const newMidY = (newSrcY + newTgtY) / 2;
  if (oldSrcY === newSrcY && oldTgtY === newTgtY) return {};

  // Label height from the text content (match ConnectorRenderer's line height).
  const LINE_H = 14;
  const lineCount = ((conn.label ?? "").split("\n").length) || 1;
  const halfLabelH = (lineCount * LINE_H) / 2;

  const labelOY = conn.labelOffsetY ?? 0;
  const oldLabelTopY = oldMidY + labelOY;
  const oldLabelCentreY = oldLabelTopY + halfLabelH;

  // Which endpoint was the label closer to? (Compare to the CENTRE, so the
  // detection lines up with the user's visual judgement of proximity.)
  const distToSrc = Math.abs(oldLabelCentreY - oldSrcY);
  const distToTgt = Math.abs(oldLabelCentreY - oldTgtY);
  const [nearestOldY, nearestNewY] = distToSrc <= distToTgt
    ? [oldSrcY, newSrcY]
    : [oldTgtY, newTgtY];

  // Preserve signed distance from the nearest endpoint — no flip detection.
  const relativeOffset = oldLabelCentreY - nearestOldY;
  const newLabelCentreY = nearestNewY + relativeOffset;
  const newLabelTopY = newLabelCentreY - halfLabelH;
  const result = newLabelTopY - newMidY;
  if (typeof window !== "undefined" && (window as unknown as { __DIAGRAMATIX_TRACE?: boolean }).__DIAGRAMATIX_TRACE) {
    console.log(`[TRACE adjustMsgLabelOffset] conn=${conn.id} label="${conn.label}" nearest=${distToSrc <= distToTgt ? "src" : "tgt"} nearestOldY=${nearestOldY} nearestNewY=${nearestNewY} oldLblCentre=${oldLabelCentreY.toFixed(1)} → newLblCentre=${newLabelCentreY.toFixed(1)} RESULT labelOffsetY=${result.toFixed(1)}`);
  }
  return { labelOffsetY: result };
}

type Action =
  | { type: "SET_DATA"; payload: DiagramData }
  | { type: "ADD_ELEMENT"; payload: { symbolType: SymbolType; position: Point; taskType?: BpmnTaskType; eventType?: EventType; id?: string } }
  | { type: "MOVE_ELEMENT"; payload: { id: string; x: number; y: number; unconstrained?: boolean } }
  | { type: "RESIZE_ELEMENT"; payload: { id: string; x: number; y: number; width: number; height: number } }
  | { type: "UPDATE_LABEL"; payload: { id: string; label: string } }
  | { type: "UPDATE_PROPERTIES"; payload: { id: string; properties: Record<string, unknown> } }
  | { type: "DELETE_ELEMENT"; payload: { id: string } }
  | { type: "ADD_CONNECTOR"; payload: {
      sourceId: string;
      targetId: string;
      connectorType: ConnectorType;
      directionType: DirectionType;
      routingType: RoutingType;
      sourceSide: Side;
      targetSide: Side;
      sourceOffsetAlong?: number;
      targetOffsetAlong?: number;
      force?: boolean;
    }}
  | { type: "DELETE_CONNECTOR"; payload: { id: string } }
  | { type: "UPDATE_CONNECTOR_ENDPOINT"; payload: {
      connectorId: string;
      endpoint: "source" | "target";
      newElementId: string;
      newSide: Side;
      newOffsetAlong?: number;
    }}
  | { type: "NUDGE_CONNECTOR"; payload: { connectorId: string; dx: number; dy: number } }
  | { type: "NUDGE_CONNECTOR_ENDPOINT"; payload: { connectorId: string; endpoint: "source" | "target"; dx: number; dy: number } }
  | { type: "UPDATE_CONNECTOR"; payload: { id: string; directionType: DirectionType } }
  | { type: "UPDATE_CONNECTOR_TYPE"; payload: { id: string; connectorType: ConnectorType } }
  | { type: "CONVERT_TASK_SUBPROCESS"; payload: { id: string } }
  | { type: "CONVERT_PROCESS_COLLAPSED"; payload: { id: string } }
  | { type: "CONVERT_EVENT_TYPE"; payload: { id: string; newEventType: "start-event" | "intermediate-event" | "end-event" } }
  | { type: "ADD_SELF_TRANSITION"; payload: {
      elementId: string;
      side: Side;
      sourceOffsetAlong: number;
      targetOffsetAlong: number;
      bulge: number;
    }}
  | { type: "FLIP_FORK_JOIN"; payload: { id: string } }
  | { type: "REVERSE_CONNECTOR"; payload: { id: string } }
  | { type: "UPDATE_CONNECTOR_WAYPOINTS"; payload: { id: string; waypoints: Point[] } }
  | { type: "UPDATE_CURVE_HANDLES"; payload: {
      id: string;
      waypoints: Point[];
      cp1RelOffset: Point;
      cp2RelOffset: Point;
    }}
  | { type: "UPDATE_CONNECTOR_LABEL"; payload: { id: string; label?: string; labelOffsetX?: number; labelOffsetY?: number; labelWidth?: number } }
  | { type: "UPDATE_CONNECTOR_FIELDS"; payload: { id: string; fields: Partial<Connector> } }
  | { type: "UPDATE_DIAGRAM_TITLE"; payload: DiagramTitle }
  | { type: "SET_FONT_SIZE"; payload: number }
  | { type: "SET_CONNECTOR_FONT_SIZE"; payload: number }
  | { type: "SET_TITLE_FONT_SIZE"; payload: number }
  | { type: "SET_POOL_FONT_SIZE"; payload: number }
  | { type: "SET_LANE_FONT_SIZE"; payload: number }
  | { type: "SET_DATABASE"; payload: string }
  | { type: "CORRECT_ALL_CONNECTORS" }
  | { type: "INSERT_SPACE"; payload: { markerX: number; markerY: number; dx: number; dy: number } }
  | { type: "SET_VIEWPORT"; payload: { x: number; y: number; zoom: number } }
  | { type: "MOVE_END"; payload: { id: string } }
  | { type: "SPLIT_CONNECTOR"; payload: {
      symbolType: SymbolType;
      position: Point;
      taskType?: BpmnTaskType;
      eventType?: EventType;
      connectorId: string;
    }}
  | { type: "ADD_LANE"; payload: { poolId: string } }
  | { type: "ADD_SUBLANE"; payload: { laneId: string } }
  | { type: "MOVE_LANE_BOUNDARY"; payload: { aboveLaneId: string; belowLaneId: string; dy: number } }
  | { type: "REORDER_LANE"; payload: { laneId: string; direction: "up" | "down" } }
  | { type: "MOVE_ELEMENTS"; payload: { ids: string[]; dx: number; dy: number } }
  | { type: "APPLY_TEMPLATE"; payload: { elements: DiagramElement[]; connectors: Connector[] } }
  | { type: "ALIGN_ELEMENTS"; payload: { ids: string[]; mode: "center" | "top" | "bottom" | "vcenter" | "left" | "right" | "smart" } };

export function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DATA_ELEMENT_TYPES = new Set<SymbolType>(["data-object", "data-store", "text-annotation"]);

const BPMN_CONTENT_TYPES = new Set<SymbolType>([
  "task", "gateway", "start-event", "end-event", "intermediate-event",
  "subprocess", "subprocess-expanded", "data-object", "data-store",
]);

function isContainerType(type: SymbolType): boolean {
  return type === "system-boundary" || type === "composite-state"
      || type === "pool" || type === "lane" || type === "subprocess-expanded"
      || type === "process-group";
}

const PROCESS_GROUP_CHILDREN = new Set<SymbolType>(["chevron", "chevron-collapsed", "process-group"]);

function containerAccepts(containerType: SymbolType, childType: SymbolType): boolean {
  if (containerType === "system-boundary") return childType === "use-case" || childType === "hourglass";
  if (containerType === "composite-state") return childType === "state" || childType === "initial-state" || childType === "final-state";
  if (containerType === "pool") return childType === "lane" || BPMN_CONTENT_TYPES.has(childType);
  if (containerType === "lane") return childType === "lane" || BPMN_CONTENT_TYPES.has(childType);
  if (containerType === "subprocess-expanded") return BPMN_CONTENT_TYPES.has(childType);
  if (containerType === "process-group") return PROCESS_GROUP_CHILDREN.has(childType);
  return false;
}

function getAllDescendantIds(elements: DiagramElement[], containerId: string): Set<string> {
  const result = new Set<string>();
  const queue = [containerId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of elements) {
      if (e.parentId === id && !result.has(e.id)) { result.add(e.id); queue.push(e.id); }
    }
  }
  return result;
}

/**
 * Find the snapped group containing the given element.
 * A snapped group = set of chevron/chevron-collapsed elements where each overlaps
 * horizontally by ~10px and has ≥75% vertical overlap with at least one neighbour.
 */
const CHEVRON_SNAP_TYPES = new Set<SymbolType>(["chevron", "chevron-collapsed"]);
const SNAP_TOLERANCE = 15; // max gap between right edge of one and left edge of next

function findSnappedGroup(elements: DiagramElement[], seedId: string): DiagramElement[] {
  const seed = elements.find(e => e.id === seedId);
  if (!seed || !CHEVRON_SNAP_TYPES.has(seed.type)) return [];
  const chevrons = elements.filter(e => CHEVRON_SNAP_TYPES.has(e.type));
  const group = new Set<string>([seedId]);
  const queue = [seed];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const other of chevrons) {
      if (group.has(other.id)) continue;
      // Check horizontal adjacency (overlap or small gap)
      const gap = Math.min(
        Math.abs((cur.x + cur.width) - other.x),
        Math.abs((other.x + other.width) - cur.x),
      );
      if (gap > SNAP_TOLERANCE) continue;
      // Check vertical overlap ≥ 75%
      const overlapTop = Math.max(cur.y, other.y);
      const overlapBot = Math.min(cur.y + cur.height, other.y + other.height);
      const vOverlap = overlapBot - overlapTop;
      const minH = Math.min(cur.height, other.height);
      if (vOverlap < minH * 0.75) continue;
      group.add(other.id);
      queue.push(other);
    }
  }
  if (group.size < 2) return [];
  // Sort left-to-right
  return chevrons.filter(e => group.has(e.id)).sort((a, b) => a.x - b.x);
}

/**
 * Detect the theme currently applied to a snapped group by checking the first element's fillColor.
 */
function detectTheme(group: DiagramElement[]): { name: string; colours: readonly string[] } | null {
  if (group.length === 0) return null;
  const firstColor = group[0].properties.fillColor as string | undefined;
  if (!firstColor) return null;
  for (const theme of CHEVRON_THEMES) {
    if (theme.colours.includes(firstColor)) return theme;
  }
  return null;
}

/**
 * Reapply a theme to a snapped group (left-to-right order), returning updated elements.
 * Also auto-tints any parent value chain container.
 */
function reapplyThemeToGroup(elements: DiagramElement[], group: DiagramElement[], theme: { colours: readonly string[] }): DiagramElement[] {
  const groupIds = new Set(group.map(e => e.id));
  // Build colour assignments
  const colorMap = new Map<string, string>();
  for (let i = 0; i < group.length; i++) {
    colorMap.set(group[i].id, theme.colours[i % theme.colours.length]);
  }
  // Find parent process-groups that contain any group member and auto-tint
  const parentIds = new Set<string>();
  for (const el of group) {
    if (el.parentId) parentIds.add(el.parentId);
  }
  const parentTints = new Map<string, string>();
  for (const pid of parentIds) {
    // Lighten the leftmost child's colour for the container
    const leftmostChild = group.find(e => e.parentId === pid);
    if (leftmostChild) {
      const baseColor = colorMap.get(leftmostChild.id) ?? theme.colours[0];
      parentTints.set(pid, lightenHex(baseColor, 0.6));
    }
  }

  return elements.map(e => {
    if (colorMap.has(e.id)) {
      return { ...e, properties: { ...e.properties, fillColor: colorMap.get(e.id) } };
    }
    if (parentTints.has(e.id) && e.type === "process-group") {
      return { ...e, properties: { ...e.properties, fillColor: parentTints.get(e.id) } };
    }
    return e;
  });
}

/** Lighten a hex colour toward white by the given fraction (0=no change, 1=white). */
function lightenHex(hex: string, frac: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * frac);
  const lg = Math.round(g + (255 - g) * frac);
  const lb = Math.round(b + (255 - b) * frac);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

/** Check if candidateParentId is a descendant of elementId (would create a cycle) */
function wouldCreateCycle(elements: DiagramElement[], elementId: string, candidateParentId: string): boolean {
  let cur = candidateParentId;
  const visited = new Set<string>();
  while (cur) {
    if (cur === elementId) return true;
    if (visited.has(cur)) return false;
    visited.add(cur);
    const el = elements.find(e => e.id === cur);
    cur = el?.parentId ?? "";
  }
  return false;
}

function segmentIntersectsRect(
  a: Point, b: Point,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  const inside = (p: Point) =>
    p.x >= rx && p.x <= rx + rw && p.y >= ry && p.y <= ry + rh;
  if (inside(a) || inside(b)) return true;

  function cross2d(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
    const denom = dx * dy2 - dy * dx2;
    if (Math.abs(denom) < 1e-10) return false;
    const t = ((p3.x - p1.x) * dy2 - (p3.y - p1.y) * dx2) / denom;
    const u = ((p3.x - p1.x) * dy  - (p3.y - p1.y) * dx)  / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  const tl = { x: rx,      y: ry      };
  const tr = { x: rx + rw, y: ry      };
  const br = { x: rx + rw, y: ry + rh };
  const bl = { x: rx,      y: ry + rh };
  return cross2d(a, b, tl, tr) || cross2d(a, b, tr, br) ||
         cross2d(a, b, br, bl) || cross2d(a, b, bl, tl);
}

function findConnectorOverlappingElement(
  connectors: Connector[],
  el: DiagramElement
): Connector | null {
  for (const c of connectors) {
    if (c.type !== "sequence") continue;
    if (c.sourceId === el.id || c.targetId === el.id) continue;
    // Skip invisible leader endpoints (first and last point); check only visible segments
    const pts = c.waypoints.slice(1, -1);
    for (let i = 0; i < pts.length - 1; i++) {
      if (segmentIntersectsRect(pts[i], pts[i + 1], el.x, el.y, el.width, el.height))
        return c;
    }
  }
  return null;
}

function updatePoolTypes(elements: DiagramElement[]): DiagramElement[] {
  return elements.map((el) => {
    if (el.type !== "pool") return el;
    const hasContent = elements.some((e) => e.parentId === el.id);
    const current = (el.properties.poolType as string | undefined) ?? "black-box";
    const next = hasContent ? "white-box" : "black-box";
    if (current === next) return el;
    return { ...el, properties: { ...el.properties, poolType: next } };
  });
}

function clampChildrenToLane(elements: DiagramElement[], lane: DiagramElement): DiagramElement[] {
  const LANE_LW = 36;
  const minX = lane.x + LANE_LW;
  const minY = lane.y;
  const maxX = lane.x + lane.width;
  const maxY = lane.y + lane.height;
  return elements.map((el) => {
    if (el.parentId !== lane.id || el.boundaryHostId) return el;
    const cx = Math.max(minX, Math.min(el.x, maxX - el.width));
    const cy = Math.max(minY, Math.min(el.y, maxY - el.height));
    return (cx === el.x && cy === el.y) ? el : { ...el, x: cx, y: cy };
  });
}

function getBounds(el: DiagramElement): Bounds {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

/** Check if a segment intersects a rectangle (with margin) */
function segmentHitsRect(p1: Point, p2: Point, rect: Bounds, margin = 4): boolean {
  const left = rect.x - margin, right = rect.x + rect.width + margin;
  const top = rect.y - margin, bottom = rect.y + rect.height + margin;
  // Horizontal segment
  if (Math.abs(p1.y - p2.y) < 1) {
    if (p1.y < top || p1.y > bottom) return false;
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    return maxX > left && minX < right;
  }
  // Vertical segment
  if (Math.abs(p1.x - p2.x) < 1) {
    if (p1.x < left || p1.x > right) return false;
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
    return maxY > top && minY < bottom;
  }
  // Diagonal segment — check if the segment's bounding box overlaps the rect
  const segMinX = Math.min(p1.x, p2.x), segMaxX = Math.max(p1.x, p2.x);
  const segMinY = Math.min(p1.y, p2.y), segMaxY = Math.max(p1.y, p2.y);
  if (segMaxX < left || segMinX > right || segMaxY < top || segMinY > bottom) return false;
  // Check if line actually crosses the rectangle using line-rect intersection
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  // Check each edge of the rect for intersection with the segment
  function lineIntersectsHEdge(ey: number, ex1: number, ex2: number): boolean {
    if (Math.abs(dy) < 0.01) return false;
    const t = (ey - p1.y) / dy;
    if (t < 0 || t > 1) return false;
    const ix = p1.x + dx * t;
    return ix >= ex1 && ix <= ex2;
  }
  function lineIntersectsVEdge(ex: number, ey1: number, ey2: number): boolean {
    if (Math.abs(dx) < 0.01) return false;
    const t = (ex - p1.x) / dx;
    if (t < 0 || t > 1) return false;
    const iy = p1.y + dy * t;
    return iy >= ey1 && iy <= ey2;
  }
  return lineIntersectsHEdge(top, left, right) || lineIntersectsHEdge(bottom, left, right)
    || lineIntersectsVEdge(left, top, bottom) || lineIntersectsVEdge(right, top, bottom);
}

/** Check if a connector's visible path passes through any element (including its own source/target interior) */
function connectorHitsAnyElement(conn: Connector, elements: DiagramElement[]): boolean {
  const wp = conn.waypoints;
  if (wp.length < 3) return false;
  const vs = conn.sourceInvisibleLeader ? 1 : 0;
  const ve = conn.targetInvisibleLeader ? wp.length - 2 : wp.length - 1;
  // Check interior waypoints (skip srcEdge and tgtEdge — they're ON the boundary)
  const interior = wp.slice(vs + 1, ve);

  // Collect ancestors of source/target so we can exclude container elements that contain them
  function ancestorsOf(id: string): Set<string> {
    const result = new Set<string>();
    let cur = elements.find(e => e.id === id);
    while (cur?.parentId) {
      result.add(cur.parentId);
      cur = elements.find(e => e.id === cur!.parentId);
    }
    return result;
  }
  const srcAncestors = ancestorsOf(conn.sourceId);
  const tgtAncestors = ancestorsOf(conn.targetId);

  const CONTAINER_TYPES = new Set(["pool", "lane", "subprocess-expanded", "composite-state", "system-boundary", "process-group", "group"]);
  const obsEls = elements.filter(el => {
    // Pools and lanes are never obstacles
    if (el.type === "pool" || el.type === "lane") return false;
    // Other containers are obstacles only if they don't contain either endpoint
    if (CONTAINER_TYPES.has(el.type)) {
      if (srcAncestors.has(el.id) || tgtAncestors.has(el.id)) return false;
    }
    return true;
  });

  for (const obs of obsEls) {
    const b = getBounds(obs);
    const isSourceOrTarget = obs.id === conn.sourceId || obs.id === conn.targetId;
    // For source/target: only check interior waypoints (not edge points)
    // For other elements: check all visible waypoints and segments
    if (isSourceOrTarget) {
      // Check if any interior waypoint is inside the source/target element
      for (const pt of interior) {
        if (pt.x > b.x + 1 && pt.x < b.x + b.width - 1 && pt.y > b.y + 1 && pt.y < b.y + b.height - 1) {
          return true;
        }
      }
    } else {
      // Exclude boundary events on source/target
      if (obs.boundaryHostId === conn.sourceId || obs.boundaryHostId === conn.targetId) continue;
      const visible = wp.slice(vs, ve + 1);
      for (let i = 0; i < visible.length; i++) {
        const pt = visible[i];
        if (pt.x > b.x && pt.x < b.x + b.width && pt.y > b.y && pt.y < b.y + b.height) return true;
      }
      for (let i = 0; i < visible.length - 1; i++) {
        if (segmentHitsRect(visible[i], visible[i + 1], b, 0)) return true;
      }
    }
  }
  return false;
}

/** Validate all connectors: reroute any whose path violates obstacles. Runs multiple passes. */
function validateConnectorsAgainstObstacles(connectors: Connector[], elements: DiagramElement[]): Connector[] {
  let result = connectors;
  // Run up to 3 passes to resolve cascading violations
  for (let pass = 0; pass < 3; pass++) {
    let anyChanged = false;
    result = result.map(conn => {
      // Message and association connectors ignore obstacle avoidance — they
      // always render on top and keep their waypoints unchanged when elements move.
      if (conn.type === "messageBPMN" || conn.type === "associationBPMN") {
        if (typeof window !== "undefined" && (window as unknown as { __DIAGRAMATIX_TRACE?: boolean }).__DIAGRAMATIX_TRACE) {
          console.log(`[TRACE validateObstacles] skipping ${conn.type} ${conn.id} srcSide=${conn.sourceSide} tgtSide=${conn.targetSide} wpCount=${conn.waypoints.length}`);
        }
        return conn;
      }
      if (!connectorHitsAnyElement(conn, elements)) return conn;
      anyChanged = true;
      const source = elements.find(e => e.id === conn.sourceId);
      const target = elements.find(e => e.id === conn.targetId);
      if (!source || !target) return conn;
      // Try with stored sides first
      const r1 = computeWaypoints(source, target, elements, conn.sourceSide, conn.targetSide, conn.routingType, conn.sourceOffsetAlong ?? 0.5, conn.targetOffsetAlong ?? 0.5);
      const endLabelResets = {
        associationNameOffset: undefined,
        sourceRoleOffset: undefined, sourceMultOffset: undefined,
        sourceConstraintOffset: undefined, sourceUniqueOffset: undefined,
        targetRoleOffset: undefined, targetMultOffset: undefined,
        targetConstraintOffset: undefined, targetUniqueOffset: undefined,
      };
      const c1 = { ...conn, waypoints: r1.waypoints, sourceInvisibleLeader: r1.sourceInvisibleLeader, targetInvisibleLeader: r1.targetInvisibleLeader,
        ...endLabelResets };
      if (!connectorHitsAnyElement(c1, elements)) return c1;
      // Try with recalculated optimal sides
      const srcCx = source.x + source.width / 2, srcCy = source.y + source.height / 2;
      const tgtCx = target.x + target.width / 2, tgtCy = target.y + target.height / 2;
      const ddx = tgtCx - srcCx, ddy = tgtCy - srcCy;
      const newSrcSide: Side = Math.abs(ddx) >= Math.abs(ddy) ? (ddx > 0 ? "right" : "left") : (ddy > 0 ? "bottom" : "top");
      const newTgtSide: Side = Math.abs(ddx) >= Math.abs(ddy) ? (ddx > 0 ? "left" : "right") : (ddy > 0 ? "top" : "bottom");
      const r2 = computeWaypoints(source, target, elements, newSrcSide, newTgtSide, conn.routingType, 0.5, 0.5);
      return { ...conn, waypoints: r2.waypoints, sourceInvisibleLeader: r2.sourceInvisibleLeader, targetInvisibleLeader: r2.targetInvisibleLeader,
        sourceSide: newSrcSide, targetSide: newTgtSide, sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
        ...endLabelResets };
    });
    if (!anyChanged) break;
  }
  return result;
}

/** Auto-resize a text-annotation element so the bounding rect hugs its text.
 *  Width = longest line in characters × avg char width + left bracket cap +
 *  horizontal pad. Height = line count × line height + top/bottom pad. User
 *  newlines are honoured; no auto-wrapping — the box grows sideways instead. */
function autoResizeTextAnnotation(el: DiagramElement): DiagramElement {
  const LINE_H = 14;
  const CHAR_W = 12 * 0.55;         // matches wrapText's avgCharWidth
  const LEFT_BRACKET = 24;          // matches TextAnnotationShape capLen
  const RIGHT_PAD = 10;
  const VERT_PAD = 8 * 2 + 6;       // top/bottom 8-px bracket caps + extra
  const MIN_W = 60;
  const MIN_H = 26;
  const lines = (el.label ?? "").split("\n");
  const longest = Math.max(1, ...lines.map(l => l.length));
  const width  = Math.max(MIN_W, Math.round(LEFT_BRACKET + longest * CHAR_W + RIGHT_PAD));
  const height = Math.max(MIN_H, lines.length * LINE_H + VERT_PAD);
  return { ...el, width, height };
}

/** Auto-resize a uml-enumeration or uml-class element to fit its label and content */
function autoResizeUmlElement(el: DiagramElement): DiagramElement {
  const BASE_HEADER_H = 28;
  const PAD = 4;
  const CHAR_W = 6.5;
  const LINE_H = 14;
  const MIN_W = 80;
  const MIN_H = 40;

  const stereotype = (el.properties.stereotype as string | undefined)
    ?? (el.type === "uml-class" ? "entity" : "enumeration");
  const showStereotype = el.type === "uml-enumeration"
    || ((el.properties.showStereotype as boolean | undefined) ?? false);
  const stereotypeW = showStereotype ? (`\u00AB${stereotype}\u00BB`.length * CHAR_W * 0.8) : 0;
  const stereotypeH = showStereotype ? Math.round(9 + 2) : 0; // tight: stereotype font size (~9) + 2px gap

  const labelLines = el.label.split("\n");
  const labelMaxW = Math.max(...labelLines.map(l => l.length * CHAR_W));
  const extraLabelLines = Math.max(0, labelLines.length - 1);
  const headerH = BASE_HEADER_H + extraLabelLines * LINE_H + stereotypeH;

  if (el.type === "uml-enumeration") {
    const values: string[] = (el.properties.values as string[] | undefined) ?? [];
    const valuesMaxW = values.length > 0 ? Math.max(...values.map(v => v.length * CHAR_W)) : 0;
    const contentW = Math.max(stereotypeW, labelMaxW, valuesMaxW) + PAD * 2;
    const newWidth = Math.max(MIN_W, contentW);
    const ENUM_BOTTOM_PAD = -2; // tighter bottom on enumeration values
    const valuesH = values.length * LINE_H;
    const newHeight = Math.max(MIN_H, headerH + valuesH + (values.length > 0 ? ENUM_BOTTOM_PAD : 0));
    if (newWidth === el.width && newHeight === el.height) return el;
    return { ...el, width: newWidth, height: newHeight };
  }

  // uml-class — with attributes and operations compartments
  const attributes = (el.properties.attributes as { name: string; visibility?: string; type?: string; multiplicity?: string; defaultValue?: string; propertyString?: string; isDerived?: boolean }[] | undefined) ?? [];
  const operations = (el.properties.operations as { name: string; visibility?: string }[] | undefined) ?? [];
  const showAttrs = (el.properties.showAttributes as boolean | undefined) ?? false;
  const showOps = (el.properties.showOperations as boolean | undefined) ?? false;

  // Compute max width from all content
  let maxContentW = Math.max(stereotypeW, labelMaxW);
  if (showAttrs) {
    for (const attr of attributes) {
      let s = "";
      if (attr.visibility) s += attr.visibility + " ";
      if (attr.isDerived) s += "/";
      s += attr.name;
      if (attr.type) s += " : " + attr.type;
      if (attr.multiplicity) s += " [" + attr.multiplicity + "]";
      if (attr.defaultValue) s += " = " + attr.defaultValue;
      if (attr.propertyString) s += " " + attr.propertyString;
      maxContentW = Math.max(maxContentW, s.length * CHAR_W);
    }
  }
  if (showOps) {
    for (const op of operations) {
      let s = "";
      if (op.visibility) s += op.visibility + " ";
      s += op.name + "()";
      maxContentW = Math.max(maxContentW, s.length * CHAR_W);
    }
  }

  const contentW = maxContentW + PAD * 2;
  const newWidth = Math.max(MIN_W, contentW);
  const BOTTOM_PAD = 10;
  const SECTION_PAD = 5;
  const attrsH = showAttrs ? attributes.length * LINE_H + (attributes.length > 0 && showOps ? SECTION_PAD : 0) : 0;
  const opsH = showOps ? operations.length * LINE_H : 0;
  const hasContent = (showAttrs && attributes.length > 0) || (showOps && operations.length > 0);
  const bodyH = Math.max(LINE_H, attrsH + opsH + (hasContent ? BOTTOM_PAD : 0));
  const newHeight = Math.max(MIN_H, headerH + bodyH);
  if (newWidth === el.width && newHeight === el.height) return el;
  return { ...el, width: newWidth, height: newHeight };
}

function reducer(state: DiagramData, action: Action): DiagramData {
  if (typeof window !== "undefined" && (window as unknown as { __DIAGRAMATIX_TRACE?: boolean }).__DIAGRAMATIX_TRACE) {
    console.log(`[TRACE reducer] action=${action.type}`);
  }
  switch (action.type) {
    case "SET_DATA":
      return action.payload;

    case "ADD_ELEMENT": {
      const def = getSymbolDefinition(action.payload.symbolType);
      let label = def.label;
      if (action.payload.symbolType === "task") {
        const count = state.elements.filter((e) => e.type === "task").length;
        label = `Task ${count + 1}`;
      } else if (action.payload.symbolType === "use-case") {
        const count = state.elements.filter((e) => e.type === "use-case").length;
        label = `Process ${count + 1}`;
      } else if (action.payload.symbolType === "state") {
        const count = state.elements.filter((e) => e.type === "state").length;
        label = `State ${count + 1}`;
      } else if (action.payload.symbolType === "composite-state") {
        const count = state.elements.filter((e) => e.type === "composite-state").length;
        label = `Composite ${count + 1}`;
      } else if (action.payload.symbolType === "actor") {
        const count = state.elements.filter((e) => e.type === "actor").length;
        label = `Participant ${count + 1}`;
      } else if (action.payload.symbolType === "team") {
        const count = state.elements.filter((e) => e.type === "team").length;
        label = `Team ${count + 1}`;
      } else if (action.payload.symbolType === "system") {
        const count = state.elements.filter((e) => e.type === "system").length;
        label = `System ${count + 1}`;
      } else if (action.payload.symbolType === "hourglass") {
        const count = state.elements.filter((e) => e.type === "hourglass").length;
        label = `Auto Scheduler ${count + 1}`;
      } else if (action.payload.symbolType === "subprocess") {
        const count = state.elements.filter((e) => e.type === "subprocess").length;
        label = `Subprocess ${count + 1}`;
      } else if (action.payload.symbolType === "subprocess-expanded") {
        const count = state.elements.filter((e) => e.type === "subprocess-expanded").length;
        label = `Expanded ${count + 1}`;
      } else if (action.payload.symbolType === "intermediate-event") {
        const count = state.elements.filter((e) => e.type === "intermediate-event").length;
        label = `Event ${count + 1}`;
      } else if (action.payload.symbolType === "data-object") {
        const count = state.elements.filter((e) => e.type === "data-object").length;
        label = `Data ${count + 1}`;
      } else if (action.payload.symbolType === "data-store") {
        const count = state.elements.filter((e) => e.type === "data-store").length;
        label = `Store ${count + 1}`;
      } else if (action.payload.symbolType === "submachine") {
        const count = state.elements.filter((e) => e.type === "submachine").length;
        label = `SubMachine ${count + 1}`;
      } else if (action.payload.symbolType === "chevron") {
        const count = state.elements.filter((e) => e.type === "chevron").length;
        label = `Process ${count + 1}`;
      } else if (action.payload.symbolType === "chevron-collapsed") {
        const count = state.elements.filter((e) => e.type === "chevron-collapsed").length;
        label = `Process ${count + 1}`;
      } else if (action.payload.symbolType === "process-group") {
        const count = state.elements.filter((e) => e.type === "process-group").length;
        label = `Value Chain ${count + 1}`;
      } else if (action.payload.symbolType === "fork-join") {
        label = "";
      } else if (action.payload.symbolType === "pool") {
        const count = state.elements.filter((e) => e.type === "pool").length;
        label = `Pool ${count + 1}`;
      } else if (action.payload.symbolType === "lane") {
        const count = state.elements.filter((e) => e.type === "lane").length;
        label = `Lane ${count + 1}`;
      } else if (action.payload.symbolType === "uml-class") {
        const count = state.elements.filter((e) => e.type === "uml-class").length;
        label = `Entity ${count + 1}`;
      } else if (action.payload.symbolType === "uml-enumeration") {
        const count = state.elements.filter((e) => e.type === "uml-enumeration").length;
        label = `Enumeration ${count + 1}`;
      } else if (action.payload.symbolType === "external-entity") {
        const count = state.elements.filter((e) => e.type === "external-entity").length;
        label = `Entity ${count + 1}`;
      } else if (action.payload.symbolType === "process-system") {
        const count = state.elements.filter((e) => e.type === "process-system").length;
        label = `Process ${count + 1}`;
      } else if (action.payload.symbolType === "gateway") {
        // Exclusive/Inclusive get "Test?", Parallel/Event-based get no label
        label = "Test?";
      }
      // Pools: place header near the drop point instead of centring the full width
      const isPool = action.payload.symbolType === "pool";
      const dropX = isPool
        ? action.payload.position.x - 18  // header is 36px wide, put its centre at drop
        : action.payload.position.x - def.defaultWidth / 2;
      const dropY = action.payload.position.y - def.defaultHeight / 2;

      let newEl: DiagramElement = {
        id: action.payload.id ?? nanoid(),
        type: action.payload.symbolType,
        x: dropX,
        y: dropY,
        width: def.defaultWidth,
        height: def.defaultHeight,
        label,
        properties: action.payload.symbolType === "pool" ? { poolType: "black-box" }
          : action.payload.symbolType === "uml-class" ? { showAttributes: false, showOperations: false }
          : action.payload.symbolType === "gateway" ? { labelOffsetX: -30, labelOffsetY: -54 }
          : (action.payload.symbolType === "chevron" || action.payload.symbolType === "chevron-collapsed") ? { showDescription: true }
          : {},
        taskType:  action.payload.taskType,
        eventType: action.payload.eventType,
      };
      // Snap event to host boundary on drop
      if (BOUNDARY_EVENT_TYPES.has(newEl.type)) {
        const centre = { x: newEl.x + newEl.width / 2, y: newEl.y + newEl.height / 2 };
        let bestDist = BOUNDARY_SNAP_THRESHOLD, bestHost: DiagramElement | null = null, bestPt = centre;
        for (const candidate of state.elements) {
          if (!BOUNDARY_HOST_TYPES.has(candidate.type)) continue;
          const pt = nearestPointOnRectBoundary(candidate, centre);
          const dist = Math.hypot(pt.x - centre.x, pt.y - centre.y);
          if (dist < bestDist) { bestDist = dist; bestHost = candidate; bestPt = pt; }
        }
        if (bestHost) {
          newEl = {
            ...newEl,
            x: bestPt.x - BOUNDARY_W / 2, y: bestPt.y - BOUNDARY_H / 2,
            width: BOUNDARY_W, height: BOUNDARY_H,
            boundaryHostId: bestHost.id,
            parentId: bestHost.parentId,
          };
        }
      }
      // Elements dropped inside an Expanded Subprocess use their default size
      // (no shrinking).
      if (!newEl.boundaryHostId) {
        const dropCx = action.payload.position.x;
        const dropCy = action.payload.position.y;
        const insideExpanded = state.elements.find(
          (b) =>
            b.type === "subprocess-expanded" &&
            dropCx >= b.x && dropCx <= b.x + b.width &&
            dropCy >= b.y && dropCy <= b.y + b.height
        );
        if (insideExpanded) {
          // Keep default size, just centre on drop point
          newEl = {
            ...newEl,
            x: dropCx - newEl.width / 2,
            y: dropCy - newEl.height / 2,
          };
        }
      }

      // Check if newly dropped element is inside a container
      // For containers dropped inside other containers, use centre-point containment
      // (they may not fit fully inside). For regular elements, use full bounds.
      if (!newEl.boundaryHostId) {
        const newCx = newEl.x + newEl.width / 2;
        const newCy = newEl.y + newEl.height / 2;
        const isNewContainer = isContainerType(newEl.type);
        const containers = state.elements.filter(
          (b) =>
            isContainerType(b.type) &&
            containerAccepts(b.type, newEl.type) &&
            (isNewContainer
              ? (newCx >= b.x && newCx <= b.x + b.width && newCy >= b.y && newCy <= b.y + b.height)
              : (newEl.x >= b.x && newEl.x + newEl.width <= b.x + b.width &&
                 newEl.y >= b.y && newEl.y + newEl.height <= b.y + b.height))
        );
        // Prefer smallest (innermost) container
        const container = containers.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
        console.log(`[ADD_ELEMENT] type=${newEl.type} isContainer=${isNewContainer} cx=${newCx.toFixed(0)} cy=${newCy.toFixed(0)} matchingContainers=${containers.length} parent=${container?.id ?? 'none'} (${container?.type ?? ''})`);
        if (container) {
          newEl = { ...newEl, parentId: container.id };
        }
      }
      // Text annotations start already tight around their default label
      if (newEl.type === "text-annotation") {
        newEl = autoResizeTextAnnotation(newEl);
      }
      return { ...state, elements: [...state.elements, newEl] };
    }

    case "MOVE_ELEMENT": {
      const { id, x, y, unconstrained } = action.payload;
      const el = state.elements.find((e) => e.id === id);
      if (!el) return state;

      // CASE A: Moving a boundary event — constrain centre to host boundary
      if (el.boundaryHostId) {
        const host = state.elements.find((e) => e.id === el.boundaryHostId);
        if (host) {
          const desired = { x: x + el.width / 2, y: y + el.height / 2 };
          const snapped = nearestPointOnRectBoundary(host, desired);
          const nx = snapped.x - el.width / 2, ny = snapped.y - el.height / 2;
          const elements = state.elements.map((e) => e.id === id ? { ...e, x: nx, y: ny } : e);
          const connectors = state.connectors.map(conn => {
            if (conn.sourceId !== id && conn.targetId !== id) return conn;
            return recomputeAllConnectors([conn], elements)[0] ?? conn;
          });
          return { ...state, elements, connectors };
        }
      }

      // CASE A2: Moving a black-box pool — connector attachment points stay fixed in world space.
      // The pool is clamped so no messageBPMN attachment point falls outside its boundary.
      const isBlackBoxPool = el.type === "pool" &&
        ((el.properties.poolType as string | undefined) ?? "black-box") === "black-box";
      const traceA2 = typeof window !== "undefined" && (window as unknown as { __DIAGRAMATIX_TRACE?: boolean }).__DIAGRAMATIX_TRACE;
      if (traceA2) console.log(`[TRACE MOVE_ELEMENT/A2-check] id=${id} type=${el.type} poolType=${el.properties?.poolType} isBlackBoxPool=${isBlackBoxPool} target=(${x},${y})`);
      if (isBlackBoxPool) {
        let rawDx = x - el.x;
        const rawDy = y - el.y;
        // Find all messageBPMN connectors attached to this pool and their world-x attachment points.
        // waypoints[1] and [2] share the same x for vertical messageBPMN connectors.
        const msgConns = state.connectors.filter(
          c => c.type === "messageBPMN" && (c.sourceId === id || c.targetId === id)
        );
        const attachXs: number[] = [];
        for (const c of msgConns) {
          // The shared vertical x is at waypoints[1] (source edge) or waypoints[2] (target edge)
          const edgeX = c.waypoints[1]?.x;
          if (edgeX != null) attachXs.push(edgeX);
        }
        // Clamp dx so no attachment point falls outside the new pool boundary
        if (attachXs.length > 0) {
          const minAttachX = Math.min(...attachXs);
          const maxAttachX = Math.max(...attachXs);
          // After move: pool spans [el.x + rawDx, el.x + rawDx + el.width]
          // Need: minAttachX >= el.x + rawDx  →  rawDx <= minAttachX - el.x
          // Need: maxAttachX <= el.x + rawDx + el.width  →  rawDx >= maxAttachX - el.x - el.width
          const maxDx = minAttachX - el.x;
          const minDx = maxAttachX - el.x - el.width;
          rawDx = Math.max(minDx, Math.min(maxDx, rawDx));
        }
        const clampedX = el.x + rawDx;
        const clampedY = el.y + rawDy;
        // Move the pool
        const elements = state.elements.map(e =>
          e.id === id ? { ...e, x: clampedX, y: clampedY } : e
        );
        // Update messageBPMN connectors: keep attachment world-x fixed, adjust offsets.
        // If the move put this pool on the opposite side of its message partner
        // (e.g. the black-box pool used to be ABOVE the white-box process pool and
        // is now BELOW it), flip sourceSide ↔ targetSide so the connector still
        // exits the nearer face of each element instead of going "through" them.
        const connectors = state.connectors.map(conn => {
          if (conn.type !== "messageBPMN") return conn;
          const isSrc = conn.sourceId === id;
          const isTgt = conn.targetId === id;
          if (!isSrc && !isTgt) return conn;
          const source = elements.find(e => e.id === conn.sourceId)!;
          const target = elements.find(e => e.id === conn.targetId)!;
          // The current world-x of the vertical connector (from existing waypoints)
          const worldX = conn.waypoints[1]?.x ?? (el.x + el.width * (conn.sourceOffsetAlong ?? 0.5));
          // Recompute source offset so the world-x stays fixed relative to the
          // (possibly moved) source element
          const newSrcOffset = source.width > 0
            ? (worldX - source.x) / source.width : 0.5;

          // Determine optimal sides from the new element positions.
          // source above target → source-bottom → target-top; otherwise flip.
          const srcCy = source.y + source.height / 2;
          const tgtCy = target.y + target.height / 2;
          const optSourceSide: Side = srcCy <= tgtCy ? "bottom" : "top";
          const optTargetSide: Side = srcCy <= tgtCy ? "top"    : "bottom";
          if (traceA2) console.log(`[TRACE MOVE_ELEMENT/A2-flip] conn=${conn.id} srcCy=${srcCy} tgtCy=${tgtCy} oldSides=${conn.sourceSide}/${conn.targetSide} newSides=${optSourceSide}/${optTargetSide}`);
          const sidesFlipped = conn.sourceSide !== optSourceSide;

          const updated = {
            ...conn,
            sourceOffsetAlong: newSrcOffset,
            sourceSide: optSourceSide,
            targetSide: optTargetSide,
          };
          const wp = messageBpmnWaypoints(source, target,
            updated.sourceSide, updated.targetSide, newSrcOffset);

          // Label handling — anchor to the MOVING POOL'S attachment so the
          // label's distance from the pool edge is preserved every dispatch.
          // `isSrc` tells us which waypoint is on the moving pool.
          //
          //   oldOff  = oldLabel − oldAttach(moving pool)       [signed]
          //   non-flip:  newLabel = newAttach + oldOff          (move with pool)
          //   flip:      newLabel = newAttach − oldOff          (mirror across attachment)
          //
          // Because the anchor is always on the moving pool, oldOff stays
          // constant across pre-flip dispatches — no drift. At the flip
          // dispatch, mirroring puts the label the same distance from the
          // (new-side) attachment as it was from the (old-side) attachment,
          // which places it in the gap between the pool and its partner on
          // the new side.
          //
          // This formulation does not use `moveH` at all: the attachment Y
          // already carries the pool's displacement.
          let labelAdj: { labelOffsetY?: number } = {};
          if (conn.labelOffsetY != null) {
            const oldSrcIdx = conn.sourceInvisibleLeader ? 1 : 0;
            const oldTgtIdx = conn.targetInvisibleLeader ? conn.waypoints.length - 2 : conn.waypoints.length - 1;
            const oldSrcX = conn.waypoints[oldSrcIdx]?.x ?? 0;
            const oldSrcY = conn.waypoints[oldSrcIdx]?.y ?? 0;
            const oldTgtX = conn.waypoints[oldTgtIdx]?.x ?? 0;
            const oldTgtY = conn.waypoints[oldTgtIdx]?.y ?? 0;
            const oldMidY = (oldSrcY + oldTgtY) / 2;
            const LINE_H = 14;
            const lineCount = ((conn.label ?? "").split("\n").length) || 1;
            const halfLabelH = (lineCount * LINE_H) / 2;
            const labelOX = conn.labelOffsetX ?? 0;
            const oldMidX = (oldSrcX + oldTgtX) / 2;
            const oldLabelCentreX = oldMidX + labelOX;
            const oldLabelCentreY = oldMidY + conn.labelOffsetY + halfLabelH;
            // messageBpmnWaypoints always returns 4 points with both invisible leaders.
            const newSrcX = wp.waypoints[1].x;
            const newSrcY = wp.waypoints[1].y;
            const newTgtX = wp.waypoints[2].x;
            const newTgtY = wp.waypoints[2].y;
            const newMidX = (newSrcX + newTgtX) / 2;
            const newMidY = (newSrcY + newTgtY) / 2;
            const oldAttachX = isSrc ? oldSrcX : oldTgtX;
            const oldAttachY = isSrc ? oldSrcY : oldTgtY;
            const newAttachX = isSrc ? newSrcX : newTgtX;
            const newAttachY = isSrc ? newSrcY : newTgtY;
            const oldOffsetX = oldLabelCentreX - oldAttachX;
            const oldOffsetY = oldLabelCentreY - oldAttachY;
            const newLabelCentreY = sidesFlipped
              ? newAttachY - oldOffsetY
              : newAttachY + oldOffsetY;
            const newLabelCentreX = oldLabelCentreX; // label x is unchanged by a Y-only pool move
            const newOffsetX = newLabelCentreX - newAttachX;
            const newOffsetY = newLabelCentreY - newAttachY;
            const newLabelTopY = newLabelCentreY - halfLabelH;
            labelAdj = { labelOffsetY: newLabelTopY - newMidY };
            const connName = conn.label ? conn.label.replace(/\s+/g, " ").trim() : conn.id;
            if (traceA2) console.log(`[TRACE A2-label] "${connName}" isSrc=${isSrc} flipped=${sidesFlipped}`
              + ` oldSrc=(${oldSrcX.toFixed(0)}, ${oldSrcY.toFixed(0)})`
              + ` oldTgt=(${oldTgtX.toFixed(0)}, ${oldTgtY.toFixed(0)})`
              + ` newSrc=(${newSrcX.toFixed(0)}, ${newSrcY.toFixed(0)})`
              + ` newTgt=(${newTgtX.toFixed(0)}, ${newTgtY.toFixed(0)})`
              + ` oldLabel=(${oldLabelCentreX.toFixed(0)}, ${oldLabelCentreY.toFixed(0)})`
              + ` newLabel=(${newLabelCentreX.toFixed(0)}, ${newLabelCentreY.toFixed(0)})`
              + ` oldAttach=(${oldAttachX.toFixed(0)}, ${oldAttachY.toFixed(0)})`
              + ` newAttach=(${newAttachX.toFixed(0)}, ${newAttachY.toFixed(0)})`
              + ` oldOff-from-attach=(${oldOffsetX.toFixed(0)}, ${oldOffsetY.toFixed(0)})`
              + ` newOff-from-attach=(${newOffsetX.toFixed(0)}, ${newOffsetY.toFixed(0)})`
              + ` → offsetY=${labelAdj.labelOffsetY?.toFixed(1)}`);
          }

          return { ...updated, waypoints: wp.waypoints,
            sourceInvisibleLeader: wp.sourceInvisibleLeader,
            targetInvisibleLeader: wp.targetInvisibleLeader, ...labelAdj };
        });
        return { ...state, elements: updatePoolTypes(elements), connectors };
      }

      // CASE B + C: Normal move (host elements also carry their boundary events)
      // Clamp child elements within their process-group parent (unless unconstrained via Shift+drag)
      let effectiveX = x, effectiveY = y;
      if (el.parentId && !unconstrained) {
        const parent = state.elements.find(p => p.id === el.parentId);
        if (parent?.type === "process-group") {
          effectiveX = Math.max(parent.x, Math.min(parent.x + parent.width - el.width, x));
          effectiveY = Math.max(parent.y, Math.min(parent.y + parent.height - el.height, y));
        }
      }
      const dx = effectiveX - el.x, dy = effectiveY - el.y;
      const movingIsContainer = isContainerType(el.type);
      const descendantIds = movingIsContainer ? getAllDescendantIds(state.elements, id) : new Set<string>();
      const attachedBoundaryIds = new Set(state.elements.filter(e => e.boundaryHostId === id).map(e => e.id));

      // Event proximity snap (free events only — not already boundary-mounted)
      let snapResult: { hostId: string; cx: number; cy: number } | null = null;
      if (BOUNDARY_EVENT_TYPES.has(el.type) && !el.boundaryHostId) {
        const centre = { x: x + el.width / 2, y: y + el.height / 2 };
        let bestDist = BOUNDARY_SNAP_THRESHOLD;
        for (const candidate of state.elements) {
          if (!BOUNDARY_HOST_TYPES.has(candidate.type) || candidate.id === id) continue;
          const pt = nearestPointOnRectBoundary(candidate, centre);
          const dist = Math.hypot(pt.x - centre.x, pt.y - centre.y);
          if (dist < bestDist) { bestDist = dist; snapResult = { hostId: candidate.id, cx: pt.x, cy: pt.y }; }
        }
      }

      let elements = state.elements.map((e) => {
        if (e.id === id) {
          if (snapResult) {
            const host = state.elements.find(h => h.id === snapResult!.hostId)!;
            return {
              ...e, width: BOUNDARY_W, height: BOUNDARY_H,
              x: snapResult.cx - BOUNDARY_W / 2, y: snapResult.cy - BOUNDARY_H / 2,
              boundaryHostId: snapResult.hostId, parentId: host.parentId,
            };
          }
          let parentId = e.parentId;
          const cx = effectiveX + e.width / 2;
          const cy = effectiveY + e.height / 2;
          const potentialParents = state.elements.filter(
            (b) =>
              isContainerType(b.type) &&
              containerAccepts(b.type, e.type) &&
              b.id !== id &&
              !wouldCreateCycle(state.elements, id, b.id) &&
              cx >= b.x && cx <= b.x + b.width &&
              cy >= b.y && cy <= b.y + b.height
          );
          // Prefer innermost (smallest) container by type priority
          const potentialParent =
            // subprocess-expanded: pick smallest (innermost)
            (potentialParents.filter(b => b.type === "subprocess-expanded")
              .sort((a, b) => (a.width * a.height) - (b.width * b.height))[0]) ??
            potentialParents.find(b => b.type === "lane") ??
            potentialParents.find(b => b.type === "pool") ??
            // process-groups: pick smallest (innermost)
            (potentialParents.filter(b => b.type === "process-group")
              .sort((a, b) => (a.width * a.height) - (b.width * b.height))[0]) ??
            potentialParents[0];
          if (potentialParent !== undefined || state.elements.some(b => isContainerType(b.type) && containerAccepts(b.type, e.type))) {
            parentId = potentialParent?.id;
          }
          return { ...e, x: effectiveX, y: effectiveY, parentId };
        }
        // If moving a container, move all descendants
        if (movingIsContainer && (e.parentId === id || descendantIds.has(e.id))) {
          return { ...e, x: e.x + dx, y: e.y + dy };
        }
        // Carry boundary events when their host moves
        if (attachedBoundaryIds.has(e.id)) {
          const newHost = { x, y, width: el.width, height: el.height };
          const centre  = { x: e.x + e.width / 2 + dx, y: e.y + e.height / 2 + dy };
          const snapped = nearestPointOnRectBoundary(newHost, centre);
          return { ...e, x: snapped.x - e.width / 2, y: snapped.y - e.height / 2 };
        }
        return e;
      });

      // Chevron horizontal snap: when a chevron is moved near another chevron
      // with ≥75% vertical overlap, snap to aligned Y-centre with 10px overlap.
      const CHEVRON_TYPES = new Set(["chevron", "chevron-collapsed"]);
      if (CHEVRON_TYPES.has(el.type)) {
        const moved = elements.find(e => e.id === id)!;
        const OVERLAP = 10; // chevrons overlap by this many pixels
        let snapX: number | null = null;
        let snapY: number | null = null;
        let bestDist = Infinity;
        const movedCx = moved.x + moved.width / 2;
        const movedCy = moved.y + moved.height / 2;
        for (const other of elements) {
          if (other.id === id) continue;
          if (!CHEVRON_TYPES.has(other.type)) continue;
          // Check vertical overlap ≥ 75% of the shorter element's height
          const overlapTop = Math.max(moved.y, other.y);
          const overlapBot = Math.min(moved.y + moved.height, other.y + other.height);
          const vOverlap = overlapBot - overlapTop;
          const minH = Math.min(moved.height, other.height);
          if (vOverlap < minH * 0.75) continue;
          // Pick the nearest matching neighbour by centre distance
          const otherCx = other.x + other.width / 2;
          const otherCy = other.y + other.height / 2;
          const dist = Math.hypot(movedCx - otherCx, movedCy - otherCy);
          if (dist >= bestDist) continue;
          bestDist = dist;
          // Snap Y to align centres
          snapY = otherCy - moved.height / 2;
          // Snap X so chevrons overlap by OVERLAP px
          if (movedCx > otherCx) {
            snapX = other.x + other.width - OVERLAP;
          } else {
            snapX = other.x + OVERLAP - moved.width;
          }
        }
        if (snapX !== null || snapY !== null) {
          const finalX = snapX ?? moved.x;
          const finalY = snapY ?? moved.y;
          elements = elements.map(e => e.id === id ? { ...e, x: finalX, y: finalY } : e);

          // Auto-reapply theme: if snapped into an existing themed group, recolour
          const group = findSnappedGroup(elements, id);
          if (group.length >= 2) {
            const theme = detectTheme(group.filter(e => e.id !== id));
            if (theme) {
              elements = reapplyThemeToGroup(elements, group, theme);
            }
          }
        }
      }

      const affectedIds = new Set([id, ...descendantIds, ...attachedBoundaryIds]);

      const trace = typeof window !== "undefined" && (window as unknown as { __DIAGRAMATIX_TRACE?: boolean }).__DIAGRAMATIX_TRACE;
      if (trace) {
        console.log(`[TRACE MOVE_ELEMENT] id=${id} type=${el.type} dx=${dx} dy=${dy} affected=[${[...affectedIds].join(",")}]`);
        for (const conn of state.connectors) {
          if (conn.type === "messageBPMN" || conn.type === "associationBPMN") {
            console.log(`  pre ${conn.type} ${conn.id} src=${conn.sourceId}(${conn.sourceSide}@${conn.sourceOffsetAlong}) tgt=${conn.targetId}(${conn.targetSide}@${conn.targetOffsetAlong}) wp=${JSON.stringify(conn.waypoints)}`);
          }
        }
      }

      // Step 1: Initial connector update
      let connectors = state.connectors.map(conn => {
        const srcIn = affectedIds.has(conn.sourceId);
        const tgtIn = affectedIds.has(conn.targetId);
        if (srcIn && tgtIn) {
          return { ...conn, waypoints: conn.waypoints.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) };
        }
        if (srcIn || tgtIn) {
          // messageBPMN: shift the shared-x by dx so both ends follow whichever
          // endpoint is the moving one. recomputeAllConnectors's messageBPMN
          // branch derives x purely from sourceOffsetAlong, which leaves the
          // target's attachment drifting when the target is what moved.
          if (conn.type === "messageBPMN") {
            const source = elements.find(e => e.id === conn.sourceId);
            const target = elements.find(e => e.id === conn.targetId);
            if (source && target) {
              const priorX = conn.waypoints[1]?.x ?? (source.x + source.width * (conn.sourceOffsetAlong ?? 0.5));
              const newSharedX = priorX + dx;
              const newSrcOffset = source.width > 0 ? (newSharedX - source.x) / source.width : 0.5;
              const wp = messageBpmnWaypoints(source, target, conn.sourceSide, conn.targetSide, newSrcOffset);
              const labelAdj = adjustMsgLabelOffset(conn, conn.waypoints, wp.waypoints);
              return { ...conn, sourceOffsetAlong: newSrcOffset, waypoints: wp.waypoints,
                sourceInvisibleLeader: wp.sourceInvisibleLeader, targetInvisibleLeader: wp.targetInvisibleLeader, ...labelAdj };
            }
          }
          const recomputed = recomputeAllConnectors([conn], elements)[0] ?? conn;
          if (trace && (conn.type === "messageBPMN" || conn.type === "associationBPMN")) {
            console.log(`  recomputed ${conn.type} ${conn.id} src=${recomputed.sourceId}(${recomputed.sourceSide}@${recomputed.sourceOffsetAlong}) tgt=${recomputed.targetId}(${recomputed.targetSide}@${recomputed.targetOffsetAlong}) wp=${JSON.stringify(recomputed.waypoints)}`);
          }
          const labelAdj = adjustMsgLabelOffset(conn, conn.waypoints, recomputed.waypoints);
          return Object.keys(labelAdj).length > 0 ? { ...recomputed, ...labelAdj } : recomputed;
        }
        return conn;
      });

      // Step 2: Validate connectors against obstacles.
      // For curvilinear connectors (transitions, flows) NOT attached to the
      // moved element, skip obstacle validation — their Bezier control points
      // may technically lie inside elements without the visible curve passing
      // through, and rerouting them destroys the user's carefully shaped curves.
      const curvilinearUnaffected = new Set(
        connectors
          .filter(c => c.routingType === "curvilinear" && !affectedIds.has(c.sourceId) && !affectedIds.has(c.targetId))
          .map(c => c.id)
      );
      if (curvilinearUnaffected.size > 0) {
        const toValidate = connectors.filter(c => !curvilinearUnaffected.has(c.id));
        const unchanged  = connectors.filter(c => curvilinearUnaffected.has(c.id));
        connectors = [...validateConnectorsAgainstObstacles(toValidate, elements), ...unchanged];
      } else {
        connectors = validateConnectorsAgainstObstacles(connectors, elements);
      }

      if (trace) {
        for (const conn of connectors) {
          if (conn.type === "messageBPMN" || conn.type === "associationBPMN") {
            console.log(`  post ${conn.type} ${conn.id} src=${conn.sourceId}(${conn.sourceSide}@${conn.sourceOffsetAlong}) tgt=${conn.targetId}(${conn.targetSide}@${conn.targetOffsetAlong}) wp=${JSON.stringify(conn.waypoints)}`);
          }
        }
      }

      return { ...state, elements: updatePoolTypes(elements), connectors };
    }

    case "MOVE_ELEMENTS": {
      const { ids, dx, dy } = action.payload;
      if (dx === 0 && dy === 0) return state;

      // Expand selection to include container descendants and boundary events
      const expandedIds = new Set(ids);
      for (const id of ids) {
        const el = state.elements.find(e => e.id === id);
        if (!el) continue;
        if (isContainerType(el.type)) {
          for (const descId of getAllDescendantIds(state.elements, id)) expandedIds.add(descId);
        }
        for (const be of state.elements) {
          if (be.boundaryHostId === id) expandedIds.add(be.id);
        }
      }

      const elements = state.elements.map(e => {
        if (!expandedIds.has(e.id)) return e;
        return { ...e, x: e.x + dx, y: e.y + dy };
      });

      // Connector updates during multi-element drag:
      //   • fully-contained (both ends in the moved group) → translate waypoints
      //   • partial messageBPMN → shift the vertical line's shared-x by dx and
      //     update sourceOffsetAlong so the stored model matches the visual.
      //     Without this, recomputeAllConnectors would re-derive x from the
      //     unchanged source offset when the TARGET is the moving one, and the
      //     target's attachment would drift.
      //   • any other partial connector (sequence, transition, association,
      //     associationBPMN, uml-*, etc.) → recompute via recomputeAllConnectors
      //     so the route tracks whichever endpoint moved. Other partials used
      //     to be deferred to ELEMENTS_MOVE_END, which left a visible lag.
      const connectors = state.connectors.map(conn => {
        const srcIn = expandedIds.has(conn.sourceId);
        const tgtIn = expandedIds.has(conn.targetId);
        if (srcIn && tgtIn) {
          return { ...conn, waypoints: conn.waypoints.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) };
        }
        if (!srcIn && !tgtIn) return conn;
        if (conn.type === "messageBPMN") {
          const source = elements.find(e => e.id === conn.sourceId);
          const target = elements.find(e => e.id === conn.targetId);
          if (source && target) {
            const priorX = conn.waypoints[1]?.x ?? (source.x + source.width * (conn.sourceOffsetAlong ?? 0.5));
            const newSharedX = priorX + dx;
            const newSrcOffset = source.width > 0 ? (newSharedX - source.x) / source.width : 0.5;
            const wp = messageBpmnWaypoints(source, target, conn.sourceSide, conn.targetSide, newSrcOffset);
            const labelAdj = adjustMsgLabelOffset(conn, conn.waypoints, wp.waypoints);
            return { ...conn, sourceOffsetAlong: newSrcOffset, waypoints: wp.waypoints,
              sourceInvisibleLeader: wp.sourceInvisibleLeader, targetInvisibleLeader: wp.targetInvisibleLeader, ...labelAdj };
          }
        }
        return recomputeAllConnectors([conn], elements)[0] ?? conn;
      });

      return { ...state, elements: updatePoolTypes(elements), connectors };
    }

    case "CONVERT_TASK_SUBPROCESS": {
      const { id } = action.payload;
      const el = state.elements.find(e => e.id === id);
      if (!el) return state;
      const isTask = el.type === "task";
      const isSub = el.type === "subprocess";
      if (!isTask && !isSub) return state;

      const newType = isTask ? "subprocess" : "task";
      const elements = state.elements.map(e => {
        if (e.id !== id) return e;
        const converted = { ...e, type: newType as SymbolType };
        if (newType === "task") {
          // Clear subprocess-specific props, set taskType to none
          converted.taskType = "none" as BpmnTaskType;
          const props = { ...converted.properties };
          delete props.subprocessType;
          delete props.linkedDiagramId;
          converted.properties = props;
        } else {
          // Clear task-specific props
          converted.taskType = undefined;
        }
        return converted;
      });
      // Recompute connectors since element type changed (shape may differ)
      const connectors = recomputeAllConnectors(state.connectors, elements);
      return { ...state, elements, connectors };
    }

    case "CONVERT_PROCESS_COLLAPSED": {
      const { id } = action.payload;
      const el = state.elements.find(e => e.id === id);
      if (!el) return state;
      const isProcess = el.type === "chevron";
      const isCollapsed = el.type === "chevron-collapsed";
      if (!isProcess && !isCollapsed) return state;

      const newType = isProcess ? "chevron-collapsed" : "chevron";
      const elements = state.elements.map(e => {
        if (e.id !== id) return e;
        const converted = { ...e, type: newType as SymbolType };
        if (newType === "chevron") {
          // Clear collapsed-specific props
          const props = { ...converted.properties };
          delete props.linkedDiagramId;
          converted.properties = props;
        }
        return converted;
      });
      return { ...state, elements };
    }

    case "CONVERT_EVENT_TYPE": {
      const { id, newEventType } = action.payload;
      const el = state.elements.find(e => e.id === id);
      if (!el) return state;
      const EVENT_TYPES = new Set(["start-event", "intermediate-event", "end-event"]);
      if (!EVENT_TYPES.has(el.type)) return state;
      if (el.type === newEventType) return state;

      const def = getSymbolDefinition(newEventType);
      const elements = state.elements.map(e => {
        if (e.id !== id) return e;
        // Preserve position, label, and common properties; clear type-specific ones
        const props = { ...e.properties };
        // Clear eventType trigger if it's not valid for the new type
        if (newEventType === "end-event") {
          if (e.eventType === "timer" || e.eventType === "conditional") {
            return { ...e, type: newEventType as SymbolType, width: def.defaultWidth, height: def.defaultHeight, eventType: "none" as EventType, properties: props };
          }
        }
        if (newEventType !== "end-event" && e.eventType === "terminate") {
          return { ...e, type: newEventType as SymbolType, width: def.defaultWidth, height: def.defaultHeight, eventType: "none" as EventType, properties: props };
        }
        if (newEventType !== "intermediate-event" && e.eventType === "link") {
          return { ...e, type: newEventType as SymbolType, width: def.defaultWidth, height: def.defaultHeight, eventType: "none" as EventType, properties: props };
        }
        return { ...e, type: newEventType as SymbolType, width: def.defaultWidth, height: def.defaultHeight, properties: props };
      });
      const connectors = recomputeAllConnectors(state.connectors, elements);
      return { ...state, elements, connectors };
    }

    case "ADD_SELF_TRANSITION": {
      const { elementId, side, sourceOffsetAlong, targetOffsetAlong, bulge } = action.payload;
      const el = state.elements.find(e => e.id === elementId);
      if (!el) return state;

      // Compute attachment points on the element boundary
      function sidePoint(s: Side, offset: number): Point {
        switch (s) {
          case "top":    return { x: el!.x + el!.width * offset, y: el!.y };
          case "bottom": return { x: el!.x + el!.width * offset, y: el!.y + el!.height };
          case "left":   return { x: el!.x, y: el!.y + el!.height * offset };
          case "right":  return { x: el!.x + el!.width, y: el!.y + el!.height * offset };
        }
      }
      const srcPt = sidePoint(side, sourceOffsetAlong);
      const tgtPt = sidePoint(side, targetOffsetAlong);

      // Build the loop waypoints: src → control out → control back → tgt
      // The bulge extends perpendicular to the side
      let cp1: Point, cp2: Point;
      switch (side) {
        case "top":    cp1 = { x: srcPt.x, y: srcPt.y - bulge }; cp2 = { x: tgtPt.x, y: tgtPt.y - bulge }; break;
        case "bottom": cp1 = { x: srcPt.x, y: srcPt.y + bulge }; cp2 = { x: tgtPt.x, y: tgtPt.y + bulge }; break;
        case "left":   cp1 = { x: srcPt.x - bulge, y: srcPt.y }; cp2 = { x: tgtPt.x - bulge, y: tgtPt.y }; break;
        case "right":  cp1 = { x: srcPt.x + bulge, y: srcPt.y }; cp2 = { x: tgtPt.x + bulge, y: tgtPt.y }; break;
      }

      // Standard 6-waypoint curvilinear format: [center, srcEdge, cp1, cp2, tgtEdge, center]
      const center: Point = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
      const waypoints: Point[] = [center, srcPt, cp1, cp2, tgtPt, center];

      const transitionCount = state.connectors.filter(c => c.type === "transition").length;
      const newConnector: Connector = {
        id: nanoid(),
        sourceId: elementId,
        targetId: elementId,
        sourceSide: side,
        targetSide: side,
        sourceOffsetAlong,
        targetOffsetAlong,
        type: "transition",
        directionType: "open-directed",
        routingType: "curvilinear",
        sourceInvisibleLeader: true,
        targetInvisibleLeader: true,
        waypoints,
        label: `transition ${transitionCount + 1}`,
        labelOffsetX: 0,
        labelOffsetY: side === "top" || side === "left" ? -(bulge / 2 + 10) : (bulge / 2 + 10),
      };

      return { ...state, connectors: [...state.connectors, newConnector] };
    }

    case "FLIP_FORK_JOIN": {
      const { id } = action.payload;
      const el = state.elements.find(e => e.id === id);
      if (!el || el.type !== "fork-join") return state;

      // Swap width ↔ height, keeping the centre fixed
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const newW = el.height;
      const newH = el.width;
      const newX = cx - newW / 2;
      const newY = cy - newH / 2;
      const elements = state.elements.map(e =>
        e.id === id ? { ...e, x: newX, y: newY, width: newW, height: newH } : e
      );

      // Map connector sides: when flipping, left↔top and right↔bottom
      const flipSide = (s: Side): Side =>
        ({ top: "left", right: "bottom", bottom: "right", left: "top" } as const)[s];

      const connectors = state.connectors.map(conn => {
        const srcFlip = conn.sourceId === id;
        const tgtFlip = conn.targetId === id;
        if (!srcFlip && !tgtFlip) return conn;
        const updated = {
          ...conn,
          ...(srcFlip ? { sourceSide: flipSide(conn.sourceSide) } : {}),
          ...(tgtFlip ? { targetSide: flipSide(conn.targetSide) } : {}),
        };
        const source = elements.find(e => e.id === updated.sourceId);
        const target = elements.find(e => e.id === updated.targetId);
        if (!source || !target) return conn;
        const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
          computeWaypoints(source, target, elements,
            updated.sourceSide, updated.targetSide, updated.routingType,
            updated.sourceOffsetAlong ?? 0.5, updated.targetOffsetAlong ?? 0.5);
        return { ...updated, waypoints, sourceInvisibleLeader, targetInvisibleLeader };
      });

      return { ...state, elements, connectors };
    }

    case "RESIZE_ELEMENT": {
      const { id, x: newX, y: newY, width: newW, height: newH } = action.payload;
      const target = state.elements.find((e) => e.id === id);

      if (target?.type === "pool") {
        const POOL_LW = 30;
        const sortedLanes = state.elements
          .filter((e) => e.type === "lane" && e.parentId === id)
          .sort((a, b) => a.y - b.y);
        const totalLaneH = sortedLanes.reduce((s, l) => s + l.height, 0) || 1;
        let stackY = newY;
        const laneUpdates = new Map<string, DiagramElement>();
        for (const lane of sortedLanes) {
          const newLaneH = Math.max(40, Math.round(newH * (lane.height / totalLaneH)));
          const updated = { ...lane, x: newX + POOL_LW, y: stackY, width: newW - POOL_LW, height: newLaneH };
          laneUpdates.set(lane.id, updated);
          stackY += newLaneH;
        }
        // Also proportionally resize sub-lanes within each lane
        const sublaneUpdates = new Map<string, DiagramElement>();
        for (const [laneId, updatedLane] of laneUpdates) {
          const LANE_LW = 36;
          const sublanes = state.elements
            .filter((e) => e.type === "lane" && e.parentId === laneId)
            .sort((a, b) => a.y - b.y);
          if (sublanes.length > 0) {
            const totalSubH = sublanes.reduce((s, l) => s + l.height, 0) || 1;
            let subStackY = updatedLane.y;
            for (const sub of sublanes) {
              const newSubH = Math.max(40, Math.round(updatedLane.height * (sub.height / totalSubH)));
              const updatedSub = { ...sub, x: updatedLane.x + LANE_LW, y: subStackY, width: updatedLane.width - LANE_LW, height: newSubH };
              sublaneUpdates.set(sub.id, updatedSub);
              subStackY += newSubH;
            }
          }
        }
        let elements = state.elements.map((e) =>
          e.id === id ? { ...e, x: newX, y: newY, width: newW, height: newH }
          : laneUpdates.has(e.id) ? laneUpdates.get(e.id)!
          : sublaneUpdates.has(e.id) ? sublaneUpdates.get(e.id)!
          : e
        );
        for (const updatedLane of laneUpdates.values()) {
          elements = clampChildrenToLane(elements, updatedLane);
        }
        for (const updatedSub of sublaneUpdates.values()) {
          elements = clampChildrenToLane(elements, updatedSub);
        }
        const connectors = recomputeAllConnectors(state.connectors, elements);
        return { ...state, elements, connectors };
      }

      const movedIds = new Set<string>([id]);
      const elements = state.elements.map((el) => {
        if (el.id === id) return { ...el, x: newX, y: newY, width: newW, height: newH };
        if (el.boundaryHostId === id && target) {
          movedIds.add(el.id);
          const evCx = el.x + el.width / 2;
          const evCy = el.y + el.height / 2;
          const { side, frac } = boundaryEdgeOf({ x: evCx, y: evCy }, target);
          const f = Math.max(0, Math.min(1, frac));
          let ncx: number, ncy: number;
          switch (side) {
            case "top":    ncx = newX + f * newW;  ncy = newY;          break;
            case "bottom": ncx = newX + f * newW;  ncy = newY + newH;   break;
            case "left":   ncx = newX;             ncy = newY + f * newH; break;
            default:       ncx = newX + newW;      ncy = newY + f * newH; break;
          }
          return { ...el, x: ncx - el.width / 2, y: ncy - el.height / 2 };
        }
        return el;
      });
      // When a process-group is resized, adopt/release children
      let finalElements = elements;
      if (target?.type === "process-group") {
        finalElements = elements.map(el => {
          if (el.id === id) return el;
          if (!containerAccepts("process-group", el.type)) return el;
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const inside = cx >= newX && cx <= newX + newW && cy >= newY && cy <= newY + newH;
          if (inside && el.parentId !== id && !wouldCreateCycle(elements, el.id, id)) return { ...el, parentId: id };
          if (!inside && el.parentId === id) return { ...el, parentId: undefined };
          return el;
        });
      }
      // Only recompute connectors attached to the resized element or its boundary events
      let connectors = state.connectors.map(conn => {
        if (!movedIds.has(conn.sourceId) && !movedIds.has(conn.targetId)) return conn;
        return recomputeAllConnectors([conn], finalElements)[0] ?? conn;
      });
      // Validate ALL connectors against ALL elements
      connectors = validateConnectorsAgainstObstacles(connectors, finalElements);
      return { ...state, elements: finalElements, connectors };
    }

    case "UPDATE_LABEL": {
      const elements = state.elements.map((el) =>
        el.id === action.payload.id
          ? { ...el, label: action.payload.label }
          : el
      );
      // Auto-resize UML elements and recompute attached connectors
      const labelEl = elements.find(e => e.id === action.payload.id);
      if (labelEl && (labelEl.type === "uml-enumeration" || labelEl.type === "uml-class")) {
        const resizedElements = elements.map(e =>
          e.id === action.payload.id ? autoResizeUmlElement(e) : e
        );
        const connectors = state.connectors.map(conn => {
          if (conn.sourceId !== action.payload.id && conn.targetId !== action.payload.id) return conn;
          return recomputeAllConnectors([conn], resizedElements)[0] ?? conn;
        });
        return { ...state, elements: resizedElements, connectors };
      }
      // Auto-resize text annotations so the bounding rect hugs the text
      if (labelEl && labelEl.type === "text-annotation") {
        const resizedElements = elements.map(e =>
          e.id === action.payload.id ? autoResizeTextAnnotation(e) : e
        );
        const connectors = state.connectors.map(conn => {
          if (conn.sourceId !== action.payload.id && conn.targetId !== action.payload.id) return conn;
          return recomputeAllConnectors([conn], resizedElements)[0] ?? conn;
        });
        return { ...state, elements: resizedElements, connectors };
      }
      // Auto-resize pool height to fit vertical label text + buffer
      if (labelEl && labelEl.type === "pool") {
        const label = action.payload.label;
        const textH = label.length * 7 + 20; // ~7px per char + 10px buffer each side
        const hasLanes = elements.some(e => e.type === "lane" && e.parentId === labelEl.id);
        // Only auto-resize if the pool has no lanes (black-box or empty white-box)
        if (!hasLanes) {
          const minH = Math.max(50, textH);
          if (labelEl.height < minH) {
            const resized = elements.map(e =>
              e.id === labelEl.id ? { ...e, height: minH } : e
            );
            return { ...state, elements: resized };
          }
        } else {
          // With lanes: expand lanes if pool is too short for the label
          const totalLaneH = elements
            .filter(e => e.type === "lane" && e.parentId === labelEl.id)
            .reduce((s, e) => s + e.height, 0);
          if (totalLaneH < textH) {
            const extra = textH - totalLaneH;
            const lanes = elements.filter(e => e.type === "lane" && e.parentId === labelEl.id);
            const perLane = Math.ceil(extra / lanes.length);
            let offsetY = 0;
            const resized = elements.map(e => {
              if (e.type === "lane" && e.parentId === labelEl.id) {
                const newH = e.height + perLane;
                const newE = { ...e, y: e.y + offsetY, height: newH };
                offsetY += perLane;
                return newE;
              }
              if (e.id === labelEl.id) return { ...e, height: totalLaneH + extra };
              return e;
            });
            return { ...state, elements: resized };
          }
        }
      }
      return { ...state, elements };
    }

    case "UPDATE_PROPERTIES": {
      const elements = state.elements.map((el) => {
        if (el.id !== action.payload.id) return el;
        const { taskType, gatewayType, eventType, repeatType, flowType, ...rest } = action.payload.properties;
        let updatedLabel = el.label;
        // When gateway type changes, update label accordingly
        if (gatewayType !== undefined && el.type === "gateway") {
          const gt = gatewayType as GatewayType;
          if (gt === "parallel" || gt === "event-based") {
            updatedLabel = "";
          } else if ((gt === "exclusive" || gt === "inclusive" || gt === "none") && !el.label) {
            updatedLabel = "Test?";
          }
        }
        return {
          ...el,
          label: updatedLabel,
          ...(taskType !== undefined ? { taskType: taskType as BpmnTaskType } : {}),
          ...(gatewayType !== undefined ? { gatewayType: gatewayType as GatewayType } : {}),
          ...(eventType !== undefined ? { eventType: eventType as EventType } : {}),
          ...(repeatType !== undefined ? { repeatType: repeatType as RepeatType } : {}),
          ...(flowType !== undefined ? { flowType: flowType as FlowType } : {}),
          properties: { ...el.properties, ...rest },
        };
      });
      // Auto-resize UML elements and recompute attached connectors
      const el = elements.find(e => e.id === action.payload.id);
      if (el && (el.type === "uml-enumeration" || el.type === "uml-class")) {
        const resizedElements = elements.map(e =>
          e.id === action.payload.id ? autoResizeUmlElement(e) : e
        );
        const connectors = state.connectors.map(conn => {
          if (conn.sourceId !== action.payload.id && conn.targetId !== action.payload.id) return conn;
          return recomputeAllConnectors([conn], resizedElements)[0] ?? conn;
        });
        return { ...state, elements: resizedElements, connectors };
      }
      return { ...state, elements };
    }

    case "DELETE_ELEMENT": {
      const { id } = action.payload;
      const el = state.elements.find((e) => e.id === id);
      // Prevent deleting a pool that still has lanes or elements inside
      if (el?.type === "pool" && state.elements.some((e) => e.parentId === id)) {
        return state;
      }
      const deletingIsContainer = el ? isContainerType(el.type) : false;
      let elements = state.elements
        .filter((e) => e.id !== id)
        .filter((e) => e.boundaryHostId !== id)
        .map((e) =>
          deletingIsContainer && e.parentId === id ? { ...e, parentId: undefined } : e
        );

      // If deleting a lane: shrink each ancestor container by the deleted
      // height and re-stack the surviving siblings at their ORIGINAL heights
      // (content moves with them). This replaces the earlier reflow-to-fill
      // behaviour that silently scaled siblings proportionally — users now
      // see the pool shrink to match the new lane count.
      if (el?.type === "lane" && el.parentId) {
        const parent = elements.find((e) => e.id === el.parentId);
        if (parent) {
          const headerW = 36; // same for pools and lanes
          const deletedH = el.height;

          // First, remove any sub-lanes of the deleted lane (cascades content removal).
          const sublanesToDelete = new Set<string>();
          function collectSublanes(parentId: string) {
            for (const e of elements) {
              if (e.type === "lane" && e.parentId === parentId) {
                sublanesToDelete.add(e.id);
                collectSublanes(e.id);
              }
            }
          }
          collectSublanes(id);
          if (sublanesToDelete.size > 0) {
            elements = elements
              .filter((e) => !sublanesToDelete.has(e.id))
              .map((e) => sublanesToDelete.has(e.parentId ?? "") ? { ...e, parentId: undefined } : e);
          }

          // Walk up the container chain (immediate parent → grandparent → …):
          //   - shrink the container by deletedH
          //   - re-stack its direct lane children at their own heights, moving
          //     each lane's descendants along by the same Δy so content travels
          //     with its lane.
          // Stops once we hit a non-lane ancestor (the pool terminates the chain).
          let cursor: DiagramElement | undefined = parent;
          while (cursor) {
            const curId = cursor.id;
            const curBefore = elements.find(e => e.id === curId);
            if (!curBefore) break;
            const newH = Math.max(40, curBefore.height - deletedH);
            elements = elements.map(e => e.id === curId ? { ...e, height: newH } : e);
            const curAfter = elements.find(e => e.id === curId)!;

            const childLanes = elements
              .filter(e => e.type === "lane" && e.parentId === curId)
              .sort((a, b) => a.y - b.y);
            let stackY = curAfter.y;
            for (const lane of childLanes) {
              const deltaY = stackY - lane.y;
              const laneNewX = curAfter.x + headerW;
              const laneNewW = curAfter.width - headerW;
              if (deltaY !== 0) {
                const descIds = getAllDescendantIds(elements, lane.id);
                elements = elements.map(e => {
                  if (e.id === lane.id) return { ...e, y: lane.y + deltaY, x: laneNewX, width: laneNewW };
                  if (descIds.has(e.id)) return { ...e, y: e.y + deltaY };
                  return e;
                });
              } else {
                elements = elements.map(e => e.id === lane.id ? { ...e, x: laneNewX, width: laneNewW } : e);
              }
              stackY += lane.height;
            }

            // Ascend only through lane→lane. Pools (and any other container type)
            // terminate the cascade — the pool has just shrunk to fit.
            cursor = cursor.type === "lane" && cursor.parentId
              ? elements.find(e => e.id === cursor!.parentId)
              : undefined;
          }

          // Second-last-lane rule: if only one lane remains in the parent and
          // it is empty, delete it too so the pool returns to its laneless state.
          const remainingLanes = elements.filter(e => e.type === "lane" && e.parentId === parent.id);
          if (remainingLanes.length === 1) {
            const lastLane = remainingLanes[0];
            const lastHasChildren = elements.some(e => e.parentId === lastLane.id);
            if (!lastHasChildren) {
              const lastH = lastLane.height;
              elements = elements.filter(e => e.id !== lastLane.id);
              // Shrink the parent (and above, if parent is itself a lane) by the last lane's height too.
              let cursor2: DiagramElement | undefined = elements.find(e => e.id === parent.id);
              while (cursor2) {
                const curId = cursor2.id;
                const curBefore = elements.find(e => e.id === curId);
                if (!curBefore) break;
                elements = elements.map(e => e.id === curId ? { ...e, height: Math.max(40, curBefore.height - lastH) } : e);
                cursor2 = cursor2.type === "lane" && cursor2.parentId
                  ? elements.find(e => e.id === cursor2!.parentId)
                  : undefined;
              }
            }
          }
        }
      }

      // Connector bridging: if exactly 1 incoming and 1 outgoing sequence/transition connector,
      // create a new connector from the source of the incoming to the target of the outgoing
      const BRIDGE_TYPES = new Set(["task", "subprocess", "subprocess-expanded", "gateway", "intermediate-event",
        "state", "submachine", "initial-state", "final-state", "composite-state", "fork-join"]);
      const BRIDGE_CONN_TYPES = new Set(["sequence", "transition"]);
      let bridgeConnector: Connector | null = null;
      if (el && BRIDGE_TYPES.has(el.type)) {
        const incoming = state.connectors.filter(c => c.targetId === id && BRIDGE_CONN_TYPES.has(c.type));
        const outgoing = state.connectors.filter(c => c.sourceId === id && BRIDGE_CONN_TYPES.has(c.type));
        if (incoming.length === 1 && outgoing.length === 1) {
          const cX = incoming[0];
          const cY = outgoing[0];
          const sourceEl = elements.find(e => e.id === cX.sourceId);
          const targetEl = elements.find(e => e.id === cY.targetId);
          if (sourceEl && targetEl) {
            const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
              computeWaypoints(sourceEl, targetEl, elements,
                cX.sourceSide, cY.targetSide, cX.routingType,
                cX.sourceOffsetAlong ?? 0.5, cY.targetOffsetAlong ?? 0.5);
            bridgeConnector = {
              id: nanoid(),
              sourceId: cX.sourceId,
              targetId: cY.targetId,
              sourceSide: cX.sourceSide,
              targetSide: cY.targetSide,
              type: cX.type,
              directionType: cX.directionType,
              routingType: cX.routingType,
              sourceInvisibleLeader,
              targetInvisibleLeader,
              waypoints,
              sourceOffsetAlong: cX.sourceOffsetAlong,
              targetOffsetAlong: cY.targetOffsetAlong,
              label: cX.label,
              labelOffsetX: cX.labelOffsetX,
              labelOffsetY: cX.labelOffsetY,
              labelWidth: cX.labelWidth,
              labelAnchor: cX.labelAnchor,
            };
          }
        }
      }

      let connectors = state.connectors.filter(
        (c) => c.sourceId !== id && c.targetId !== id
      );
      if (bridgeConnector) connectors = [...connectors, bridgeConnector];

      // Re-theme snapped group if a process was removed from it
      if (el && CHEVRON_SNAP_TYPES.has(el.type)) {
        // Find any remaining neighbour that was snapped to the deleted element
        const neighbours = elements.filter(e =>
          CHEVRON_SNAP_TYPES.has(e.type) && e.properties.fillColor
        );
        for (const nb of neighbours) {
          const group = findSnappedGroup(elements, nb.id);
          if (group.length >= 2) {
            const theme = detectTheme(group);
            if (theme) {
              elements = reapplyThemeToGroup(elements, group, theme);
              break; // one group reapply is enough
            }
          }
        }
      }

      return { ...state, elements: updatePoolTypes(elements), connectors };
    }

    case "ADD_CONNECTOR": {
      const { sourceId, targetId, connectorType, directionType, routingType, sourceSide, targetSide, sourceOffsetAlong, targetOffsetAlong, force } = action.payload;
      const source = state.elements.find((el) => el.id === sourceId);
      const target = state.elements.find((el) => el.id === targetId);
      if (!source || !target) return state;

      // Data elements may only use associationBPMN connectors
      const isDataConn = DATA_ELEMENT_TYPES.has(source.type) || DATA_ELEMENT_TYPES.has(target.type);

      // Force mode: skip all validation (used by Shift+Ctrl+Click override)
      if (!force) {

      // State-machine rules: never connect FROM a final-state or TO an initial-state
      if (source.type === "final-state") return state;
      if (target.type === "initial-state") return state;

      if (isDataConn && connectorType !== "associationBPMN") return state;
      // Allow associationBPMN between event elements (child/boundary event connections)
      const EVENT_CONN_TYPES = new Set<SymbolType>(["start-event", "intermediate-event", "end-event"]);
      const isEventToEvent = EVENT_CONN_TYPES.has(source.type) && EVENT_CONN_TYPES.has(target.type);
      if (!isDataConn && !isEventToEvent && connectorType === "associationBPMN") return state;

      // Message flows attach only to black-box pools (or to flow elements
      // inside any pool). A white-box pool ITSELF is not a valid endpoint —
      // white-box pools expose internal elements instead. Reject to prevent
      // orphan connectors that the layout engine can't sensibly render.
      if (connectorType === "messageBPMN") {
        const srcIsWhiteBoxPool = source.type === "pool"
          && ((source.properties.poolType as string | undefined) ?? "black-box") === "white-box";
        const tgtIsWhiteBoxPool = target.type === "pool"
          && ((target.properties.poolType as string | undefined) ?? "black-box") === "white-box";
        if (srcIsWhiteBoxPool || tgtIsWhiteBoxPool) return state;
      }

      // ── BPMN sequence connector rules ──
      const isSeqConn = connectorType === "sequence";
      if (isSeqConn) {
        // Helper: find the expanded subprocess ancestor of an element
        const findExpandedSubParent = (el: DiagramElement): DiagramElement | undefined => {
          let cur = el;
          for (let i = 0; i < 10; i++) {
            if (!cur.parentId) return undefined;
            const parent = state.elements.find(e => e.id === cur.parentId);
            if (!parent) return undefined;
            if (parent.type === "subprocess-expanded") return parent;
            cur = parent;
          }
          return undefined;
        };
        const isEventExpandedSub = (el: DiagramElement) =>
          el.type === "subprocess-expanded" &&
          (el.properties.subprocessType as string | undefined) === "event";

        // Rule: No sequence connector TO a non-boundary start event
        // (boundary start events CAN receive sequence from outside their host subprocess)
        if (target.type === "start-event" && !target.boundaryHostId) return state;

        // Rule: No sequence connector FROM an end event (end events have no outgoing sequence)
        // Exception: boundary-mounted end events can't connect inside either (handled below)
        if (source.type === "end-event" && !source.boundaryHostId) return state;

        // Rule: No sequence connector TO or FROM an Event Expanded Subprocess
        if (isEventExpandedSub(target)) return state;
        if (isEventExpandedSub(source)) return state;
        const targetParentExp = findExpandedSubParent(target);
        if (targetParentExp && isEventExpandedSub(targetParentExp)) {
          // Target is inside an event subprocess — only allow if source is also inside the same one
          const sourceParentExp = findExpandedSubParent(source);
          if (sourceParentExp?.id !== targetParentExp.id) return state;
        }

        // Rule: Nothing inside an Event Expanded Subprocess can connect out
        const sourceParentExp = findExpandedSubParent(source);
        if (sourceParentExp && isEventExpandedSub(sourceParentExp)) {
          const targetParentExp2 = findExpandedSubParent(target);
          if (targetParentExp2?.id !== sourceParentExp.id) return state;
        }

        // Rule: Edge-mounted End/Intermediate events cannot connect inside their host subprocess
        if (source.boundaryHostId && (source.type === "end-event" || source.type === "intermediate-event")) {
          const hostSub = state.elements.find(e => e.id === source.boundaryHostId);
          if (hostSub) {
            // Check if target is inside the host subprocess
            let cur: DiagramElement | undefined = target;
            for (let i = 0; i < 10 && cur; i++) {
              if (cur.id === hostSub.id || cur.parentId === hostSub.id) return state;
              cur = cur.parentId ? state.elements.find(e => e.id === cur!.parentId) : undefined;
            }
          }
        }
      }

      } // end if (!force)

      const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
        connectorType === "messageBPMN"
          ? messageBpmnWaypoints(source, target, sourceSide, targetSide, sourceOffsetAlong ?? 0.5, targetOffsetAlong)
          : computeWaypoints(source, target, state.elements, sourceSide, targetSide, routingType, sourceOffsetAlong, targetOffsetAlong);

      const isMsgBpmn = connectorType === "messageBPMN";
      const msgBpmnCount = isMsgBpmn
        ? state.connectors.filter((c) => c.type === "messageBPMN").length
        : 0;
      const isTransition = connectorType === "transition";
      const isFromInitialState = isTransition && source.type === "initial-state";
      const transitionCount = isTransition
        ? state.connectors.filter((c) => c.type === "transition").length
        : 0;
      const isFlow = connectorType === "flow";
      const flowCount = isFlow
        ? state.connectors.filter((c) => c.type === "flow").length
        : 0;

      // Decision gateway outgoing sequence connectors get a source-anchored label
      const gwType = source.gatewayType ?? "exclusive";
      const isDecisionGateway = source.type === "gateway"
        && (gwType === "none" || gwType === "exclusive" || gwType === "inclusive");
      const isDecisionGatewayOutgoing = (connectorType === "sequence" || connectorType === "transition") && isDecisionGateway;
      const isDecisionGatewayBottom = isDecisionGatewayOutgoing && sourceSide === "bottom";

      const newConnector: Connector = {
        id: nanoid(),
        sourceId,
        targetId,
        sourceSide,
        targetSide,
        sourceOffsetAlong,
        targetOffsetAlong,
        type: connectorType,
        directionType,
        routingType,
        sourceInvisibleLeader,
        targetInvisibleLeader,
        waypoints,
        label:        isFlow       ? `flow ${flowCount + 1}`
                    : isFromInitialState ? ""
                    : isTransition ? `transition ${transitionCount + 1}`
                    : isMsgBpmn   ? `message ${msgBpmnCount + 1}`
                    : isDecisionGatewayOutgoing ? ""
                    : connectorType === "sequence" ? ""
                    : undefined,
        labelOffsetX: isFlow ? 0   : isTransition ? 0   : isMsgBpmn ? 20  : isDecisionGatewayBottom ? 10 : isDecisionGatewayOutgoing ? 5  : connectorType === "sequence" ? 0 : undefined,
        labelOffsetY: isFlow ? -30 : isTransition ? -30 : isMsgBpmn ? (() => {
          // Find the pool containing each element
          function findPool(el: DiagramElement): DiagramElement | undefined {
            if (el.type === "pool") return el;
            // Walk up parentId chain to find pool
            let cur = el;
            for (let i = 0; i < 10; i++) {
              if (!cur.parentId) break;
              const parent = state.elements.find(e => e.id === cur.parentId);
              if (!parent) break;
              if (parent.type === "pool") return parent;
              cur = parent;
            }
            // Fallback: find pool by containment
            return state.elements.find(e => e.type === "pool"
              && el.x >= e.x && el.x + el.width <= e.x + e.width
              && el.y >= e.y && el.y + el.height <= e.y + e.height);
          }
          const srcPool = findPool(source);
          const tgtPool = findPool(target);
          if (srcPool && tgtPool) {
            const goingDown = sourceSide === "bottom";
            const srcPoolEdgeY = goingDown ? srcPool.y + srcPool.height : srcPool.y;
            const tgtPoolEdgeY = goingDown ? tgtPool.y : tgtPool.y + tgtPool.height;
            const srcIsBlackBox = (srcPool.properties.poolType as string | undefined) !== "white-box";
            const tgtIsBlackBox = (tgtPool.properties.poolType as string | undefined) !== "white-box";
            let labelY: number;
            if (srcIsBlackBox && tgtIsBlackBox) {
              labelY = srcPoolEdgeY + (goingDown ? 15 : -15);
            } else {
              labelY = (srcPoolEdgeY + tgtPoolEdgeY) / 2;
            }
            const anchorY = (waypoints[1].y + waypoints[waypoints.length - 2].y) / 2;
            return labelY - anchorY - 7;
          }
          return 0;
        })() : isDecisionGatewayBottom ? 10 : isDecisionGatewayOutgoing ? -20 : connectorType === "sequence" ? -20 : undefined,
        labelWidth:   isFlow ? 80  : isTransition ? 80  : isMsgBpmn ? 80  : isDecisionGatewayOutgoing ? 60  : connectorType === "sequence" ? 80 : undefined,
        labelAnchor:  isDecisionGatewayOutgoing ? "source" : undefined,
      };

      const isSeq = connectorType === "sequence";
      // Determine if the other end of a message connector is a system pool
      function findPoolOf(el: DiagramElement): DiagramElement | undefined {
        if (el.type === "pool") return el;
        let cur = el;
        for (let i = 0; i < 10; i++) {
          if (!cur.parentId) break;
          const parent = state.elements.find(e => e.id === cur.parentId);
          if (!parent) break;
          if (parent.type === "pool") return parent;
          cur = parent;
        }
        return state.elements.find(e => e.type === "pool"
          && el.x >= e.x && el.x + el.width <= e.x + e.width
          && el.y >= e.y && el.y + el.height <= e.y + e.height);
      }
      const isSystemPool = (el: DiagramElement): boolean => {
        const pool = findPoolOf(el);
        return !!pool && !!pool.properties.isSystem;
      };

      const updatedElements = state.elements.map((el) => {
        if (isMsgBpmn) {
          // For tasks: system pool → "user", non-system pool → "send"/"receive"
          if (el.id === sourceId) {
            if (el.type === "task") {
              const otherIsSystem = isSystemPool(target);
              return { ...el, taskType: (otherIsSystem ? "user" : "send") as BpmnTaskType };
            }
            if (el.type === "end-event")          return { ...el, eventType: "message" as EventType, flowType: "throwing" as FlowType };
            if (el.type === "intermediate-event") return { ...el, eventType: "message" as EventType, taskType: "send" as BpmnTaskType, flowType: "throwing" as FlowType };
          }
          if (el.id === targetId) {
            if (el.type === "task") {
              const otherIsSystem = isSystemPool(source);
              return { ...el, taskType: (otherIsSystem ? "user" : "receive") as BpmnTaskType };
            }
            if (el.type === "start-event")        return { ...el, eventType: "message" as EventType, flowType: "catching" as FlowType };
            if (el.type === "intermediate-event") return { ...el, eventType: "message" as EventType, flowType: "catching" as FlowType };
          }
        } else if (isSeq) {
          // Start events cannot be sequence targets → convert to intermediate (unless boundary-mounted)
          if (el.id === targetId && el.type === "start-event" && !el.boundaryHostId) return { ...el, type: "intermediate-event" as SymbolType };
          // End events cannot be sequence sources → convert to intermediate (unless boundary-mounted)
          if (el.id === sourceId && el.type === "end-event"   && !el.boundaryHostId) return { ...el, type: "intermediate-event" as SymbolType };
        }
        return el;
      });

      // Auto-set data-object role based on associationBPMN connector directions
      const allConnectors = [...state.connectors, newConnector];
      const finalElements = (connectorType === "associationBPMN")
        ? updatedElements.map(el => {
            if (el.type !== "data-object") return el;
            // Only update if this data object is involved in the new connector
            if (el.id !== sourceId && el.id !== targetId) return el;
            const inbound = allConnectors.filter(c => c.type === "associationBPMN" && c.targetId === el.id);
            const outbound = allConnectors.filter(c => c.type === "associationBPMN" && c.sourceId === el.id);
            let role: string;
            if (inbound.length > 0 && outbound.length > 0) role = "none";
            else if (inbound.length > 0) role = "output";
            else if (outbound.length > 0) role = "input";
            else role = "none";
            return { ...el, properties: { ...el.properties, role } };
          })
        : updatedElements;

      return { ...state, elements: finalElements, connectors: allConnectors };
    }

    case "DELETE_CONNECTOR": {
      const conn = state.connectors.find((c) => c.id === action.payload.id);
      const updatedConnectors = state.connectors.filter((c) => c.id !== action.payload.id);

      if (conn?.type === "messageBPMN") {
        // Count remaining messageBPMN connections for source and target after removal
        const remainingForSource = updatedConnectors.filter(
          (c) => c.type === "messageBPMN" && (c.sourceId === conn.sourceId || c.targetId === conn.sourceId)
        ).length;
        const remainingForTarget = updatedConnectors.filter(
          (c) => c.type === "messageBPMN" && (c.sourceId === conn.targetId || c.targetId === conn.targetId)
        ).length;

        const updatedElements = state.elements.map((el) => {
          if (!BPMN_EVENT_TYPES.has(el.type)) return el;
          if (el.id === conn.sourceId && remainingForSource === 0) {
            return { ...el, flowType: "none" as FlowType, eventType: "none" as EventType };
          }
          if (el.id === conn.targetId && remainingForTarget === 0) {
            return { ...el, flowType: "none" as FlowType, eventType: "none" as EventType };
          }
          return el;
        });

        return { ...state, elements: updatedElements, connectors: updatedConnectors };
      }

      // Recalculate data-object role when associationBPMN connector is deleted
      if (conn?.type === "associationBPMN") {
        const updatedElements = state.elements.map(el => {
          if (el.type !== "data-object") return el;
          if (el.id !== conn.sourceId && el.id !== conn.targetId) return el;
          const inbound = updatedConnectors.filter(c => c.type === "associationBPMN" && c.targetId === el.id);
          const outbound = updatedConnectors.filter(c => c.type === "associationBPMN" && c.sourceId === el.id);
          let role: string;
          if (inbound.length > 0 && outbound.length > 0) role = "none";
          else if (inbound.length > 0) role = "output";
          else if (outbound.length > 0) role = "input";
          else role = "none";
          return { ...el, properties: { ...el.properties, role } };
        });
        return { ...state, elements: updatedElements, connectors: updatedConnectors };
      }

      return { ...state, connectors: updatedConnectors };
    }

    case "UPDATE_CONNECTOR":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.payload.id
            ? { ...c, directionType: action.payload.directionType }
            : c
        ),
      };

    case "UPDATE_CONNECTOR_TYPE":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.payload.id
            ? { ...c, type: action.payload.connectorType }
            : c
        ),
      };

    case "REVERSE_CONNECTOR": {
      const connectors = state.connectors.map((c) => {
        if (c.id !== action.payload.id) return c;
        const source = state.elements.find((el) => el.id === c.targetId);
        const target = state.elements.find((el) => el.id === c.sourceId);
        if (!source || !target) return c;
        const reversed = {
          ...c,
          sourceId: c.targetId, targetId: c.sourceId,
          sourceSide: c.targetSide, targetSide: c.sourceSide,
          sourceOffsetAlong: c.targetOffsetAlong, targetOffsetAlong: c.sourceOffsetAlong,
        };
        const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
          computeWaypoints(source, target, state.elements,
            reversed.sourceSide, reversed.targetSide, reversed.routingType,
            reversed.sourceOffsetAlong ?? 0.5, reversed.targetOffsetAlong ?? 0.5);
        return { ...reversed, waypoints, sourceInvisibleLeader, targetInvisibleLeader };
      });
      return { ...state, connectors };
    }

    case "UPDATE_CONNECTOR_ENDPOINT": {
      const { connectorId, endpoint, newElementId, newSide, newOffsetAlong } = action.payload;
      const connectors = state.connectors.map((conn) => {
        if (conn.id !== connectorId) return conn;
        const updated = endpoint === "source"
          ? { ...conn, sourceId: newElementId, sourceSide: newSide, sourceOffsetAlong: newOffsetAlong ?? 0.5,
              sourceRoleOffset: undefined, sourceMultOffset: undefined,
              sourceConstraintOffset: undefined, sourceUniqueOffset: undefined,
              associationNameOffset: undefined }
          : { ...conn, targetId: newElementId, targetSide: newSide, targetOffsetAlong: newOffsetAlong ?? 0.5,
              targetRoleOffset: undefined, targetMultOffset: undefined,
              targetConstraintOffset: undefined, targetUniqueOffset: undefined,
              associationNameOffset: undefined };
        const source = state.elements.find((el) => el.id === updated.sourceId);
        const target = state.elements.find((el) => el.id === updated.targetId);
        if (!source || !target) return conn;
        const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
          updated.type === "messageBPMN"
            ? messageBpmnWaypoints(source, target, updated.sourceSide, updated.targetSide,
                updated.sourceOffsetAlong ?? 0.5, updated.targetOffsetAlong)
            : computeWaypoints(source, target, state.elements,
                updated.sourceSide, updated.targetSide, updated.routingType,
                updated.sourceOffsetAlong ?? 0.5, updated.targetOffsetAlong ?? 0.5);
        const labelAdj = adjustMsgLabelOffset(conn, conn.waypoints, waypoints);
        return { ...updated, waypoints, sourceInvisibleLeader, targetInvisibleLeader, ...labelAdj };
      });
      // Skip obstacle validation for messageBPMN — they cross pools and don't interact with obstacles
      const updatedConn = connectors.find(c => c.id === connectorId);
      if (updatedConn?.type === "messageBPMN") {
        return { ...state, connectors };
      }
      return { ...state, connectors: validateConnectorsAgainstObstacles(connectors, state.elements) };
    }

    case "NUDGE_CONNECTOR": {
      const { connectorId, dx, dy } = action.payload;
      const connectors = state.connectors.map((conn) => {
        if (conn.id !== connectorId) return conn;
        const source = state.elements.find((el) => el.id === conn.sourceId);
        const target = state.elements.find((el) => el.id === conn.targetId);
        if (!source || !target) return conn;

        let newSrcOffset: number, newTgtOffset: number;

        if (conn.type === "messageBPMN") {
          // For message connectors, nudge by pixels using a single shared x to stay vertical
          const clamp = (v: number) => Math.max(0.02, Math.min(0.98, v));
          const curX = source.x + source.width * (conn.sourceOffsetAlong ?? 0.5);
          let newX = curX + dx;
          // Clamp to both element boundaries
          newX = Math.max(source.x, Math.min(source.x + source.width, newX));
          newX = Math.max(target.x, Math.min(target.x + target.width, newX));
          newSrcOffset = clamp(source.width > 0 ? (newX - source.x) / source.width : 0.5);
          newTgtOffset = newSrcOffset; // not used — messageBpmnWaypoints uses sourceOffset only
        } else {
          // For other connectors, use fractional offset
          function nudgeOffset(side: Side, offset: number): number {
            const clamp = (v: number) => Math.max(0.02, Math.min(0.98, v));
            if (side === "top" || side === "bottom") return clamp(offset + dx * 0.02);
            return clamp(offset + dy * 0.02);
          }
          newSrcOffset = nudgeOffset(conn.sourceSide, conn.sourceOffsetAlong ?? 0.5);
          newTgtOffset = nudgeOffset(conn.targetSide, conn.targetOffsetAlong ?? 0.5);
        }

        const updated = { ...conn, sourceOffsetAlong: newSrcOffset, targetOffsetAlong: newTgtOffset,
          sourceRoleOffset: undefined, sourceMultOffset: undefined,
          sourceConstraintOffset: undefined, sourceUniqueOffset: undefined,
          targetRoleOffset: undefined, targetMultOffset: undefined,
          targetConstraintOffset: undefined, targetUniqueOffset: undefined,
          associationNameOffset: undefined };
        const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
          updated.type === "messageBPMN"
            ? messageBpmnWaypoints(source, target, updated.sourceSide, updated.targetSide,
                updated.sourceOffsetAlong ?? 0.5, updated.targetOffsetAlong)
            : computeWaypoints(source, target, state.elements,
                updated.sourceSide, updated.targetSide, updated.routingType,
                updated.sourceOffsetAlong ?? 0.5, updated.targetOffsetAlong ?? 0.5);
        return { ...updated, waypoints, sourceInvisibleLeader, targetInvisibleLeader };
      });
      // Skip obstacle validation for messageBPMN nudges — they don't interact with obstacles
      const nudgedConn = connectors.find(c => c.id === connectorId);
      if (nudgedConn?.type === "messageBPMN") {
        return { ...state, connectors };
      }
      return { ...state, connectors: validateConnectorsAgainstObstacles(connectors, state.elements) };
    }

    case "NUDGE_CONNECTOR_ENDPOINT": {
      const { connectorId, endpoint, dx, dy } = action.payload;
      const connectors = state.connectors.map((conn) => {
        if (conn.id !== connectorId) return conn;
        function nudgeOffset(side: Side, offset: number, elId: string): number {
          const clamp = (v: number) => Math.max(0.02, Math.min(0.98, v));
          const el = state.elements.find(e => e.id === elId);
          if (el?.type === "gateway") {
            // Map (dx, dy) → offset delta so the visible endpoint moves
            // in the same direction as the arrow key. Per side, increasing
            // offset (0→1) traverses the two diamond edges:
            //   top:    left vertex → top → right vertex (offset rises with +dx)
            //   right:  top vertex → right → bottom vertex (offset rises with +dy)
            //   bottom: right vertex → bottom → left vertex (offset rises with -dx)
            //   left:   bottom vertex → left → top vertex (offset rises with -dy)
            let delta = 0;
            switch (side) {
              case "top":    delta = dx; break;
              case "right":  delta = dy; break;
              case "bottom": delta = -dx; break;
              case "left":   delta = -dy; break;
            }
            return clamp(offset + delta * 0.02);
          }
          if (side === "top" || side === "bottom") return clamp(offset + dx * 0.02);
          return clamp(offset + dy * 0.02);
        }
        const updated = endpoint === "source"
          ? { ...conn, sourceOffsetAlong: nudgeOffset(conn.sourceSide, conn.sourceOffsetAlong ?? 0.5, conn.sourceId),
              sourceRoleOffset: undefined, sourceMultOffset: undefined,
              sourceConstraintOffset: undefined, sourceUniqueOffset: undefined }
          : { ...conn, targetOffsetAlong: nudgeOffset(conn.targetSide, conn.targetOffsetAlong ?? 0.5, conn.targetId),
              targetRoleOffset: undefined, targetMultOffset: undefined,
              targetConstraintOffset: undefined, targetUniqueOffset: undefined };
        const source = state.elements.find((el) => el.id === updated.sourceId);
        const target = state.elements.find((el) => el.id === updated.targetId);
        if (!source || !target) return conn;
        const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
          updated.type === "messageBPMN"
            ? messageBpmnWaypoints(source, target, updated.sourceSide, updated.targetSide,
                updated.sourceOffsetAlong ?? 0.5, updated.targetOffsetAlong)
            : computeWaypoints(source, target, state.elements,
                updated.sourceSide, updated.targetSide, updated.routingType,
                updated.sourceOffsetAlong ?? 0.5, updated.targetOffsetAlong ?? 0.5);
        return { ...updated, waypoints, sourceInvisibleLeader, targetInvisibleLeader };
      });
      return { ...state, connectors: validateConnectorsAgainstObstacles(connectors, state.elements) };
    }

    case "UPDATE_CONNECTOR_WAYPOINTS": {
      const updatedConns = state.connectors.map((c) =>
        c.id === action.payload.id ? { ...c, waypoints: consolidateWaypoints(action.payload.waypoints) } : c
      );
      // Skip obstacle validation for messageBPMN — they cross pools and don't interact with obstacles
      const waypointConn = updatedConns.find(c => c.id === action.payload.id);
      if (waypointConn?.type === "messageBPMN") {
        return { ...state, connectors: updatedConns };
      }
      return { ...state, connectors: validateConnectorsAgainstObstacles(updatedConns, state.elements) };
    }

    case "UPDATE_CURVE_HANDLES": {
      const { id: chId, waypoints: chWp, cp1RelOffset: chCp1, cp2RelOffset: chCp2 } = action.payload;
      return {
        ...state,
        connectors: state.connectors.map((c) => {
          if (c.id !== chId) return c;
          // For transition connectors, constrain control points to angle limits
          if (c.type === "transition" && chWp.length >= 5) {
            const srcEdge = chWp[1]; // srcEdge waypoint
            const tgtEdge = chWp[chWp.length - 2]; // tgtEdge waypoint
            const srcEl = state.elements.find(e => e.id === c.sourceId);
            const tgtEl = state.elements.find(e => e.id === c.targetId);
            const srcRatio = srcEl?.type === "gateway" ? 0 : 0.325;
            const tgtRatio = tgtEl?.type === "gateway" ? 0 : 0.325;
            const cp1Raw = chWp[2];
            const cp2Raw = chWp[chWp.length - 3];
            const cp1 = constrainControlPoint(srcEdge, cp1Raw, c.sourceSide, srcRatio,
              srcEl?.type === "gateway", c.sourceOffsetAlong ?? 0.5);
            const cp2 = constrainControlPoint(tgtEdge, cp2Raw, c.targetSide, tgtRatio,
              tgtEl?.type === "gateway", c.targetOffsetAlong ?? 0.5);
            const constrained = [...chWp];
            constrained[2] = cp1;
            constrained[chWp.length - 3] = cp2;
            return { ...c,
              waypoints: constrained,
              cp1RelOffset: { x: cp1.x - srcEdge.x, y: cp1.y - srcEdge.y },
              cp2RelOffset: { x: cp2.x - tgtEdge.x, y: cp2.y - tgtEdge.y },
            };
          }
          return { ...c, waypoints: chWp, cp1RelOffset: chCp1, cp2RelOffset: chCp2 };
        }),
      };
    }

    case "UPDATE_CONNECTOR_LABEL":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload } : c
        ),
      };

    case "UPDATE_CONNECTOR_FIELDS":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload.fields } : c
        ),
      };

    case "UPDATE_DIAGRAM_TITLE":
      return { ...state, title: action.payload };

    case "SET_FONT_SIZE":
      return { ...state, fontSize: action.payload };

    case "SET_CONNECTOR_FONT_SIZE":
      return { ...state, connectorFontSize: action.payload };

    case "SET_TITLE_FONT_SIZE":
      return { ...state, titleFontSize: action.payload };

    case "SET_POOL_FONT_SIZE":
      return { ...state, poolFontSize: action.payload };

    case "SET_LANE_FONT_SIZE":
      return { ...state, laneFontSize: action.payload };

    case "SET_DATABASE":
      return { ...state, database: action.payload || undefined };

    case "INSERT_SPACE": {
      const { markerX, markerY, dx, dy } = action.payload;

      // First pass: shift / grow non-boundary-event elements. Boundary events
      // are handled in a second pass so they can be re-anchored to their
      // host's NEW edges.
      const elements = state.elements.map(el => {
        // Skip boundary events here — handled in second pass
        if (el.boundaryHostId) return el;

        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const isPool = el.type === "pool";
        const isLane = el.type === "lane";
        const isSublane = isLane && !!el.parentId &&
          state.elements.some(p => p.id === el.parentId && p.type === "lane");
        // Expanded subprocesses behave like pools/lanes for space insertion:
        // their boundary stretches when the marker line cuts through them so
        // that children straddling the marker stay inside the container.
        const isExpandedSp = el.type === "subprocess-expanded";

        // Horizontal shift (dx > 0: push elements to the right of marker)
        if (dx !== 0) {
          if (isPool || isLane || isSublane || isExpandedSp) {
            // Extend right boundary if the marker vertical line intersects it
            if (markerX > el.x && markerX < el.x + el.width) {
              return { ...el, width: el.width + dx };
            }
            // If the entire container is to the right, shift it
            if (el.x >= markerX) {
              return { ...el, x: el.x + dx };
            }
            return el;
          }
          // Normal element: shift if centre is to the right of marker
          if (cx > markerX) {
            return { ...el, x: el.x + dx };
          }
          return el;
        }

        // Vertical shift (dy > 0: push elements below marker down)
        if (dy !== 0) {
          if (isPool) {
            // If marker horizontal line intersects this pool, extend its bottom
            if (markerY > el.y && markerY < el.y + el.height) {
              return { ...el, height: el.height + dy };
            }
            // If pool is entirely below marker, shift it down
            if (el.y >= markerY) {
              return { ...el, y: el.y + dy };
            }
            return el;
          }
          if (isLane || isSublane || isExpandedSp) {
            // If marker intersects this lane / expanded subprocess, extend its bottom
            if (markerY > el.y && markerY < el.y + el.height) {
              return { ...el, height: el.height + dy };
            }
            // If it is entirely below the marker, shift it down
            if (el.y >= markerY) {
              return { ...el, y: el.y + dy };
            }
            return el;
          }
          // Normal element: shift if centre is below marker
          if (cy > markerY) {
            return { ...el, y: el.y + dy };
          }
          return el;
        }

        return el;
      });

      // Second pass: re-anchor boundary events to their host's new edges.
      // A boundary event only moves when the specific host edge it is mounted
      // on actually moves:
      //   • If the host shifts entirely → ALL boundary events shift with it
      //   • If the host grows right (dx>0, marker line cuts host horizontally)
      //     → only boundary events on the RIGHT edge shift right
      //   • If the host grows down (dy>0, marker line cuts host vertically)
      //     → only boundary events on the BOTTOM edge shift down
      //   • Otherwise → the event stays where it is
      const oldElementMap = new Map(state.elements.map(e => [e.id, e]));
      const newElementMap = new Map(elements.map(e => [e.id, e]));
      const finalElements = elements.map(el => {
        if (!el.boundaryHostId) return el;
        const oldHost = oldElementMap.get(el.boundaryHostId);
        const newHost = newElementMap.get(el.boundaryHostId);
        if (!oldHost || !newHost) return el;

        // Identify which side of the OLD host the event is mounted on
        const evCx = el.x + el.width / 2;
        const evCy = el.y + el.height / 2;
        const distTop    = Math.abs(evCy - oldHost.y);
        const distBottom = Math.abs(evCy - (oldHost.y + oldHost.height));
        const distLeft   = Math.abs(evCx - oldHost.x);
        const distRight  = Math.abs(evCx - (oldHost.x + oldHost.width));
        const minDist = Math.min(distTop, distBottom, distLeft, distRight);
        const onTop    = minDist === distTop;
        const onBottom = !onTop && minDist === distBottom;
        const onLeft   = !onTop && !onBottom && minDist === distLeft;
        const onRight  = !onTop && !onBottom && !onLeft;

        const hostShifted = oldHost.x !== newHost.x || oldHost.y !== newHost.y;
        const hostGrewRight = newHost.width !== oldHost.width;
        const hostGrewDown  = newHost.height !== oldHost.height;

        let evDx = 0;
        let evDy = 0;
        if (hostShifted) {
          evDx += newHost.x - oldHost.x;
          evDy += newHost.y - oldHost.y;
        }
        if (hostGrewRight && onRight) {
          evDx += newHost.width - oldHost.width;
        }
        if (hostGrewDown && onBottom) {
          evDy += newHost.height - oldHost.height;
        }
        if (evDx === 0 && evDy === 0) return el;
        return { ...el, x: el.x + evDx, y: el.y + evDy };
      });

      // Recompute all connectors after space insertion, adjusting messageBPMN labels
      const recomputed = recomputeAllConnectors(state.connectors, finalElements);
      const connectors = recomputed.map((conn, i) => {
        const old = state.connectors[i];
        if (!old || old.id !== conn.id) return conn;
        const labelAdj = adjustMsgLabelOffset(old, old.waypoints, conn.waypoints);
        return Object.keys(labelAdj).length > 0 ? { ...conn, ...labelAdj } : conn;
      });

      return { ...state, elements: updatePoolTypes(finalElements), connectors: validateConnectorsAgainstObstacles(connectors, finalElements) };
    }

    case "CORRECT_ALL_CONNECTORS": {
      const connectors = state.connectors.map((conn) => {
        if (conn.routingType !== "rectilinear" || conn.waypoints.length < 7) return conn;
        const rectified = rectifyWaypoints(conn.waypoints, conn.sourceSide);
        return { ...conn, waypoints: consolidateWaypoints(rectified) };
      });
      return { ...state, connectors };
    }

    case "SET_VIEWPORT":
      return {
        ...state,
        viewport: action.payload,
      };

    case "MOVE_END": {
      const { id } = action.payload;
      const el = state.elements.find(e => e.id === id);
      if (!el) return state;
      const SPLITTABLE_TYPES = new Set(["gateway", "intermediate-event", "task", "subprocess"]);
      if (!SPLITTABLE_TYPES.has(el.type)) return state;

      const orig = findConnectorOverlappingElement(state.connectors, el);
      if (!orig) return state;

      const oppSide = (s: Side): Side =>
        ({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[s];

      const srcA = state.elements.find(e => e.id === orig.sourceId);
      const tgtB = state.elements.find(e => e.id === orig.targetId);
      if (!srcA || !tgtB) return state;

      const cASide = oppSide(orig.sourceSide);
      const cBSide = oppSide(orig.targetSide);

      const { waypoints: wA, sourceInvisibleLeader: sIA, targetInvisibleLeader: tIA } =
        computeWaypoints(srcA, el, state.elements, orig.sourceSide, cASide, orig.routingType,
          orig.sourceOffsetAlong ?? 0.5, 0.5);

      const { waypoints: wB, sourceInvisibleLeader: sIB, targetInvisibleLeader: tIB } =
        computeWaypoints(el, tgtB, state.elements, cBSide, orig.targetSide, orig.routingType,
          0.5, orig.targetOffsetAlong ?? 0.5);

      const filtered = state.connectors.filter(c => c.id !== orig.id);
      return {
        ...state,
        connectors: [
          ...filtered,
          { id: nanoid(), type: orig.type, sourceId: orig.sourceId, targetId: el.id,
            sourceSide: orig.sourceSide, targetSide: cASide,
            directionType: orig.directionType, routingType: orig.routingType,
            sourceOffsetAlong: orig.sourceOffsetAlong, targetOffsetAlong: 0.5,
            waypoints: wA, sourceInvisibleLeader: sIA, targetInvisibleLeader: tIA,
            label: orig.label, labelOffsetX: orig.labelOffsetX, labelOffsetY: orig.labelOffsetY,
            labelWidth: orig.labelWidth, labelAnchor: orig.labelAnchor },
          { id: nanoid(), type: orig.type, sourceId: el.id, targetId: orig.targetId,
            sourceSide: cBSide, targetSide: orig.targetSide,
            directionType: orig.directionType, routingType: orig.routingType,
            sourceOffsetAlong: 0.5, targetOffsetAlong: orig.targetOffsetAlong,
            waypoints: wB, sourceInvisibleLeader: sIB, targetInvisibleLeader: tIB,
            label: orig.type === "sequence" ? "" : undefined,
            labelOffsetX: orig.type === "sequence" ? (el.type === "gateway" ? 5 : 0) : undefined,
            labelOffsetY: orig.type === "sequence" ? -20 : undefined,
            labelWidth: orig.type === "sequence" ? (el.type === "gateway" ? 60 : 80) : undefined,
            labelAnchor: el.type === "gateway" ? "source" : undefined },
        ],
      };
    }

    case "SPLIT_CONNECTOR": {
      const { symbolType, position, taskType, eventType, connectorId } = action.payload;
      const orig = state.connectors.find(c => c.id === connectorId);
      if (!orig) return state;

      // Build new element (same labelling logic as ADD_ELEMENT)
      const def = getSymbolDefinition(symbolType);
      let label = def.label;
      if (symbolType === "gateway") {
        label = "Test?";
      } else if (symbolType === "intermediate-event") {
        const count = state.elements.filter(e => e.type === "intermediate-event").length;
        label = `Event ${count + 1}`;
      } else if (symbolType === "task") {
        const count = state.elements.filter(e => e.type === "task").length;
        label = `Task ${count + 1}`;
      } else if (symbolType === "subprocess") {
        const count = state.elements.filter(e => e.type === "subprocess").length;
        label = `Subprocess ${count + 1}`;
      } else if (symbolType === "state") {
        const count = state.elements.filter(e => e.type === "state").length;
        label = `State ${count + 1}`;
      } else if (symbolType === "submachine") {
        const count = state.elements.filter(e => e.type === "submachine").length;
        label = `SubMachine ${count + 1}`;
      } else if (symbolType === "composite-state") {
        const count = state.elements.filter(e => e.type === "composite-state").length;
        label = `Composite ${count + 1}`;
      }
      const newEl: DiagramElement = {
        id: nanoid(),
        type: symbolType,
        x: position.x - def.defaultWidth / 2,
        y: position.y - def.defaultHeight / 2,
        width: def.defaultWidth,
        height: def.defaultHeight,
        label,
        properties: symbolType === "gateway" ? { labelOffsetX: -30, labelOffsetY: -54 } : {},
        ...(taskType  !== undefined ? { taskType  } : {}),
        ...(eventType !== undefined ? { eventType } : {}),
        ...(symbolType === "gateway" ? { gatewayType: "none" as GatewayType } : {}),
      };

      const elementsWithNew = [...state.elements, newEl];

      const oppSide = (s: Side): Side =>
        ({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[s];

      const srcA = elementsWithNew.find(e => e.id === orig.sourceId);
      const tgtB = elementsWithNew.find(e => e.id === orig.targetId);
      if (!srcA || !tgtB) return state;

      const cASide = oppSide(orig.sourceSide);
      const cBSide = oppSide(orig.targetSide);

      const { waypoints: wA, sourceInvisibleLeader: sIA, targetInvisibleLeader: tIA } =
        computeWaypoints(srcA, newEl, elementsWithNew, orig.sourceSide, cASide, orig.routingType, orig.sourceOffsetAlong ?? 0.5, 0.5);

      const { waypoints: wB, sourceInvisibleLeader: sIB, targetInvisibleLeader: tIB } =
        computeWaypoints(newEl, tgtB, elementsWithNew, cBSide, orig.targetSide, orig.routingType, 0.5, orig.targetOffsetAlong ?? 0.5);

      const filtered = state.connectors.filter(c => c.id !== connectorId);
      return {
        ...state,
        elements: elementsWithNew,
        connectors: [
          ...filtered,
          { id: nanoid(), type: orig.type, sourceId: orig.sourceId, targetId: newEl.id,
            sourceSide: orig.sourceSide, targetSide: cASide,
            directionType: orig.directionType, routingType: orig.routingType,
            sourceOffsetAlong: orig.sourceOffsetAlong, targetOffsetAlong: 0.5,
            waypoints: wA, sourceInvisibleLeader: sIA, targetInvisibleLeader: tIA,
            label: orig.label, labelOffsetX: orig.labelOffsetX, labelOffsetY: orig.labelOffsetY,
            labelWidth: orig.labelWidth, labelAnchor: orig.labelAnchor },
          { id: nanoid(), type: orig.type, sourceId: newEl.id, targetId: orig.targetId,
            sourceSide: cBSide, targetSide: orig.targetSide,
            directionType: orig.directionType, routingType: orig.routingType,
            sourceOffsetAlong: 0.5, targetOffsetAlong: orig.targetOffsetAlong,
            waypoints: wB, sourceInvisibleLeader: sIB, targetInvisibleLeader: tIB,
            label: (orig.type === "sequence" || orig.type === "transition") ? "" : undefined,
            labelOffsetX: (orig.type === "sequence" || orig.type === "transition") ? (symbolType === "gateway" ? 5 : 0) : undefined,
            labelOffsetY: (orig.type === "sequence" || orig.type === "transition") ? -20 : undefined,
            labelWidth: (orig.type === "sequence" || orig.type === "transition") ? (symbolType === "gateway" ? 60 : 80) : undefined,
            labelAnchor: symbolType === "gateway" ? "source" : undefined },
        ],
      };
    }

    case "ADD_LANE": {
      const { poolId } = action.payload;
      const pool = state.elements.find((e) => e.id === poolId && e.type === "pool");
      if (!pool) return state;
      const POOL_LABEL_W = 36;
      const LANE_HEADER_H = 28;
      const MIN_LANE_H = 80;
      const existingLanes = state.elements
        .filter((e) => e.type === "lane" && e.parentId === poolId)
        .sort((a, b) => a.y - b.y);
      const laneCount = state.elements.filter((e) => e.type === "lane").length;

      if (existingLanes.length === 0) {
        // First lane: split pool into two lanes
        const topH = Math.max(MIN_LANE_H, Math.floor(pool.height / 2));
        const botH = Math.max(MIN_LANE_H, pool.height - topH);
        const poolH = topH + botH;
        const lane1: DiagramElement = {
          id: nanoid(), type: "lane",
          x: pool.x + POOL_LABEL_W, y: pool.y,
          width: pool.width - POOL_LABEL_W, height: topH,
          label: `Lane ${laneCount + 1}`, properties: {}, parentId: poolId,
        };
        const lane2: DiagramElement = {
          id: nanoid(), type: "lane",
          x: pool.x + POOL_LABEL_W, y: pool.y + topH,
          width: pool.width - POOL_LABEL_W, height: botH,
          label: `Lane ${laneCount + 2}`, properties: {}, parentId: poolId,
        };
        const elements = state.elements.map((e) =>
          e.id === poolId ? { ...e, height: poolH } : e
        );
        return { ...state, elements: updatePoolTypes([...elements, lane1, lane2]) };
      }

      // Additional lane: add at bottom, grow pool
      const lastLane = existingLanes[existingLanes.length - 1];
      const laneY = lastLane.y + lastLane.height;
      const newLaneH = Math.max(LANE_HEADER_H, MIN_LANE_H);
      const newLane: DiagramElement = {
        id: nanoid(), type: "lane",
        x: pool.x + POOL_LABEL_W, y: laneY,
        width: pool.width - POOL_LABEL_W, height: newLaneH,
        label: `Lane ${laneCount + 1}`, properties: {}, parentId: poolId,
      };
      const neededH = (laneY + newLaneH) - pool.y;
      const elements = state.elements.map((e) =>
        e.id === poolId && neededH > e.height ? { ...e, height: neededH } : e
      );
      return { ...state, elements: updatePoolTypes([...elements, newLane]) };
    }

    case "ADD_SUBLANE": {
      const { laneId } = action.payload;
      const parentLane = state.elements.find((e) => e.id === laneId && e.type === "lane");
      if (!parentLane) return state;
      const LANE_LW = 36;
      const existingSublanes = state.elements.filter((e) => e.type === "lane" && e.parentId === laneId);
      if (existingSublanes.length > 0) {
        // Add one more sublane at the bottom
        const stackedH = existingSublanes.reduce((s, l) => s + l.height, 0);
        const sublaneCount = state.elements.filter((e) => e.type === "lane" && e.parentId).length;
        const SUBLANE_HEADER_H = 28;
        const newSublane: DiagramElement = {
          id: nanoid(), type: "lane",
          x: parentLane.x + LANE_LW,
          y: parentLane.y + stackedH,
          width: parentLane.width - LANE_LW,
          height: SUBLANE_HEADER_H,
          label: `Sublane ${sublaneCount + 1}`,
          properties: {}, parentId: laneId,
        };
        const neededH = stackedH + SUBLANE_HEADER_H;
        let elements = [...state.elements, newSublane];
        if (neededH > parentLane.height) {
          const growBy = neededH - parentLane.height;
          elements = elements.map((e) => {
            if (e.id === laneId) return { ...e, height: neededH };
            // Shift sibling lanes below this one down
            if (e.type === "lane" && e.parentId === parentLane.parentId && e.y > parentLane.y) {
              return { ...e, y: e.y + growBy };
            }
            // Grow parent pool
            if (e.id === parentLane.parentId && e.type === "pool") return { ...e, height: e.height + growBy };
            return e;
          });
        }
        return { ...state, elements };
      } else {
        // First time: split parent lane into 2 sublanes
        const sublaneCount = state.elements.filter((e) => e.type === "lane").length;
        const halfH = Math.max(40, Math.round(parentLane.height / 2));
        const sublane1: DiagramElement = {
          id: nanoid(), type: "lane",
          x: parentLane.x + LANE_LW,
          y: parentLane.y,
          width: parentLane.width - LANE_LW,
          height: halfH,
          label: `Sublane ${sublaneCount + 1}`,
          properties: {}, parentId: laneId,
        };
        const sublane2: DiagramElement = {
          id: nanoid(), type: "lane",
          x: parentLane.x + LANE_LW,
          y: parentLane.y + halfH,
          width: parentLane.width - LANE_LW,
          height: parentLane.height - halfH,
          label: `Sublane ${sublaneCount + 2}`,
          properties: {}, parentId: laneId,
        };
        // Re-parent any existing children of the parent lane into sublane1
        const elements = state.elements.map((e) => {
          if (e.parentId === laneId && e.type !== "lane") return { ...e, parentId: sublane1.id };
          return e;
        });
        return { ...state, elements: [...elements, sublane1, sublane2] };
      }
    }

    case "REORDER_LANE": {
      const { laneId, direction } = action.payload;
      const lane = state.elements.find(e => e.id === laneId && e.type === "lane");
      if (!lane || !lane.parentId) return state;

      // Find sibling lanes in the same parent, sorted by y
      const siblings = state.elements
        .filter(e => e.type === "lane" && e.parentId === lane.parentId)
        .sort((a, b) => a.y - b.y);
      const idx = siblings.findIndex(s => s.id === laneId);
      if (idx < 0) return state;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return state;

      const A = siblings[idx];
      const B = siblings[swapIdx];
      // Determine new y positions: swap A and B's positions, keeping their heights
      const Ay = direction === "up" ? B.y : B.y + B.height - A.height;
      const By = direction === "up" ? A.y + A.height - B.height + (A.y - B.y) + (B.height - A.height) : A.y;
      // Simpler: swap them so A takes B's y and B takes A's y, but heights differ
      const newAy = direction === "up" ? B.y : B.y + B.height - A.height;
      const newBy = direction === "up" ? A.y + A.height - B.height : A.y;
      // Compute delta for each lane's children
      const deltaA = newAy - A.y;
      const deltaB = newBy - B.y;

      // Collect all transitive descendants of each lane (for moving their content)
      function descendantIds(rootId: string): Set<string> {
        const result = new Set<string>();
        const stack = [rootId];
        while (stack.length) {
          const cur = stack.pop()!;
          for (const e of state.elements) {
            if (e.parentId === cur && !result.has(e.id)) {
              result.add(e.id);
              stack.push(e.id);
            }
            if (e.boundaryHostId === cur && !result.has(e.id)) result.add(e.id);
          }
        }
        return result;
      }
      const aDescendants = descendantIds(A.id);
      const bDescendants = descendantIds(B.id);

      const elements = state.elements.map(e => {
        if (e.id === A.id) return { ...e, y: newAy };
        if (e.id === B.id) return { ...e, y: newBy };
        if (aDescendants.has(e.id)) return { ...e, y: e.y + deltaA };
        if (bDescendants.has(e.id)) return { ...e, y: e.y + deltaB };
        return e;
      });
      // Update connector waypoints for moved elements
      const movedIds = new Set([A.id, B.id, ...aDescendants, ...bDescendants]);
      const connectors = state.connectors.map(conn => {
        const srcIn = movedIds.has(conn.sourceId);
        const tgtIn = movedIds.has(conn.targetId);
        if (srcIn && tgtIn) {
          // Both ends moved — shift waypoints by the larger lane's delta if they match
          // Actually pick the correct delta per endpoint
          const srcDelta = aDescendants.has(conn.sourceId) || conn.sourceId === A.id ? deltaA : deltaB;
          const tgtDelta = aDescendants.has(conn.targetId) || conn.targetId === A.id ? deltaA : deltaB;
          if (srcDelta === tgtDelta) {
            return { ...conn, waypoints: conn.waypoints.map(pt => ({ x: pt.x, y: pt.y + srcDelta })) };
          }
          return { ...conn, waypoints: recomputeAllConnectors([conn], elements)[0]?.waypoints ?? conn.waypoints };
        }
        if (srcIn || tgtIn) {
          const recomputed = recomputeAllConnectors([conn], elements)[0];
          return recomputed ?? conn;
        }
        return conn;
      });

      // Ignore unused computed values
      void Ay; void By;

      return { ...state, elements, connectors };
    }

    case "MOVE_LANE_BOUNDARY": {
      const { aboveLaneId, belowLaneId, dy } = action.payload;
      const MIN_H = 40;
      const above = state.elements.find((e) => e.id === aboveLaneId);
      const below = state.elements.find((e) => e.id === belowLaneId);
      if (!above || !below) return state;

      // Clamp so neither lane goes below MIN_H
      const maxGrow = below.height - MIN_H;   // above can grow at most this much
      const maxShrink = above.height - MIN_H;  // above can shrink at most this much
      const clampedDy = Math.max(-maxShrink, Math.min(maxGrow, dy));
      if (clampedDy === 0) return state;

      const newAboveH = above.height + clampedDy;
      const newBelowH = below.height - clampedDy;
      const newBelowY = below.y + clampedDy;

      // Ensure lanes stay within parent bounds
      const parent = above.parentId ? state.elements.find(e => e.id === above.parentId) : undefined;
      if (parent) {
        const parentBottom = parent.y + parent.height;
        if (newBelowY + newBelowH > parentBottom + 1) return state;
        if (above.y < parent.y - 1) return state;
      }

      // Proportionally resize sub-lanes within the resized lanes (recurse into deeper nesting)
      const LANE_LW = 36;
      function resizeSublanes(elements: DiagramElement[], laneId: string, newLaneY: number, newLaneH: number, newLaneX: number, newLaneW: number): DiagramElement[] {
        const subs = elements.filter((e) => e.type === "lane" && e.parentId === laneId).sort((a, b) => a.y - b.y);
        if (subs.length === 0) return elements;
        const totalSubH = subs.reduce((s, l) => s + l.height, 0) || 1;
        let stackY = newLaneY;
        for (const sub of subs) {
          const newSubH = Math.max(28, Math.round(newLaneH * (sub.height / totalSubH)));
          const newSubX = newLaneX + LANE_LW;
          const newSubW = newLaneW - LANE_LW;
          const updatedSub = { ...sub, x: newSubX, y: stackY, width: newSubW, height: newSubH };
          elements = elements.map((e) => e.id === sub.id ? updatedSub : e);
          // Recurse — resize this sublane's own children
          elements = resizeSublanes(elements, sub.id, stackY, newSubH, newSubX, newSubW);
          stackY += newSubH;
        }
        return elements;
      }
      let elements = state.elements.map((e) => {
        if (e.id === aboveLaneId) return { ...e, height: newAboveH };
        if (e.id === belowLaneId) return { ...e, y: newBelowY, height: newBelowH };
        return e;
      });
      elements = resizeSublanes(elements, aboveLaneId, above.y, newAboveH, above.x, above.width);
      elements = resizeSublanes(elements, belowLaneId, newBelowY, newBelowH, below.x, below.width);
      return { ...state, elements };
    }

    case "APPLY_TEMPLATE":
      return {
        ...state,
        elements: [...state.elements, ...action.payload.elements],
        connectors: [...state.connectors, ...action.payload.connectors],
      };

    case "ALIGN_ELEMENTS": {
      const { ids, mode } = action.payload;
      const idSet = new Set(ids);
      const selected = state.elements.filter((el) => idSet.has(el.id));
      if (selected.length < 2) return state;

      // Compute dx, dy per element
      const dxyMap = new Map<string, { dx: number; dy: number }>();

      if (mode === "smart") {
        // Smart align: detect ROWS (elements whose Y-ranges overlap, plus
        // a small tolerance) and COLUMNS (whose X-ranges overlap), using
        // union-find so membership is transitive. Each row of size >= 2
        // snaps to its median Y; each column of size >= 2 snaps to its
        // median X. An element in both a row and a column gets snapped on
        // both axes — a 3x3 grid resolves to a clean grid in one click.
        //
        // Boundary intermediate events stay with their host. Boundary
        // start/end events are movable.
        const movable = selected.filter((el) =>
          !el.boundaryHostId || el.type === "start-event" || el.type === "end-event"
        );
        if (movable.length < 2) return state;

        // Tolerance pad on each side of the bounding box, so elements that
        // are close but not quite overlapping still cluster together.
        const PAD = 12;

        // Union-find
        function makeUF(n: number) {
          const parent = Array.from({ length: n }, (_, i) => i);
          function find(i: number): number {
            while (parent[i] !== i) {
              parent[i] = parent[parent[i]];
              i = parent[i];
            }
            return i;
          }
          function union(a: number, b: number) {
            const ra = find(a), rb = find(b);
            if (ra !== rb) parent[ra] = rb;
          }
          return { find, union };
        }

        // Cluster movable elements by axis overlap. For rows we test
        // Y-range overlap; for columns we test X-range overlap.
        function clusterByOverlap(axis: "x" | "y") {
          const uf = makeUF(movable.length);
          for (let i = 0; i < movable.length; i++) {
            for (let j = i + 1; j < movable.length; j++) {
              const a = movable[i];
              const b = movable[j];
              const aLo = (axis === "y" ? a.y : a.x) - PAD;
              const aHi = (axis === "y" ? a.y + a.height : a.x + a.width) + PAD;
              const bLo = (axis === "y" ? b.y : b.x);
              const bHi = (axis === "y" ? b.y + b.height : b.x + b.width);
              if (aLo < bHi && bLo < aHi) uf.union(i, j);
            }
          }
          const groups = new Map<number, DiagramElement[]>();
          for (let i = 0; i < movable.length; i++) {
            const r = uf.find(i);
            if (!groups.has(r)) groups.set(r, []);
            groups.get(r)!.push(movable[i]);
          }
          return [...groups.values()];
        }

        const rows = clusterByOverlap("y");   // Y-range overlap → rows
        const cols = clusterByOverlap("x");   // X-range overlap → columns

        // Per-element accumulated dx/dy
        const dx = new Map<string, number>();
        const dy = new Map<string, number>();
        for (const el of movable) { dx.set(el.id, 0); dy.set(el.id, 0); }

        // Snap each row of >= 2 to its median centre Y
        for (const row of rows) {
          if (row.length < 2) continue;
          const sorted = row.map((el) => el.y + el.height / 2).sort((a, b) => a - b);
          const medianY = sorted[Math.floor(sorted.length / 2)];
          for (const el of row) {
            dy.set(el.id, medianY - (el.y + el.height / 2));
          }
        }

        // Snap each column of >= 2 to its median centre X
        for (const col of cols) {
          if (col.length < 2) continue;
          const sorted = col.map((el) => el.x + el.width / 2).sort((a, b) => a - b);
          const medianX = sorted[Math.floor(sorted.length / 2)];
          for (const el of col) {
            dx.set(el.id, medianX - (el.x + el.width / 2));
          }
        }

        for (const el of movable) {
          dxyMap.set(el.id, { dx: dx.get(el.id) ?? 0, dy: dy.get(el.id) ?? 0 });
        }

        // Boundary intermediate events: follow their host's movement
        for (const el of selected) {
          if (el.boundaryHostId && el.type === "intermediate-event") {
            const hostDelta = dxyMap.get(el.boundaryHostId);
            dxyMap.set(el.id, hostDelta ? { ...hostDelta } : { dx: 0, dy: 0 });
          }
        }
        // Boundary events NOT in selection but whose host IS moving
        for (const el of state.elements) {
          if (el.boundaryHostId && !idSet.has(el.id)) {
            const hostDelta = dxyMap.get(el.boundaryHostId);
            if (hostDelta && (hostDelta.dx !== 0 || hostDelta.dy !== 0)) {
              dxyMap.set(el.id, { ...hostDelta });
            }
          }
        }
      } else {
        const isVertical = mode === "vcenter" || mode === "left" || mode === "right";
        if (isVertical) {
          let targetX: number;
          if (mode === "vcenter") {
            targetX = selected.reduce((sum, el) => sum + el.x + el.width / 2, 0) / selected.length;
          } else if (mode === "left") {
            targetX = Math.min(...selected.map((el) => el.x));
          } else {
            targetX = Math.max(...selected.map((el) => el.x + el.width));
          }
          for (const el of selected) {
            let newX: number;
            if (mode === "vcenter") newX = targetX - el.width / 2;
            else if (mode === "left") newX = targetX;
            else newX = targetX - el.width;
            dxyMap.set(el.id, { dx: newX - el.x, dy: 0 });
          }
        } else {
          let targetY: number;
          if (mode === "center") {
            targetY = selected.reduce((sum, el) => sum + el.y + el.height / 2, 0) / selected.length;
          } else if (mode === "top") {
            targetY = Math.min(...selected.map((el) => el.y));
          } else {
            targetY = Math.max(...selected.map((el) => el.y + el.height));
          }
          for (const el of selected) {
            let newY: number;
            if (mode === "center") newY = targetY - el.height / 2;
            else if (mode === "top") newY = targetY;
            else newY = targetY - el.height;
            dxyMap.set(el.id, { dx: 0, dy: newY - el.y });
          }
        }
      }

      const newElements = state.elements.map((el) => {
        const d = dxyMap.get(el.id);
        if (!d || (d.dx === 0 && d.dy === 0)) return el;
        return { ...el, x: el.x + d.dx, y: el.y + d.dy };
      });

      // Build a lookup of elements at their new positions
      const elMap = new Map<string, DiagramElement>();
      for (const el of newElements) elMap.set(el.id, el);

      // Re-route connectors that touch aligned elements.
      //
      // Use the same code path as a normal element move (recomputeAllConnectors)
      // so the result preserves sourceInvisibleLeader / targetInvisibleLeader
      // flags and the connector's first/last waypoints land exactly on the
      // element's boundary. The previous bespoke recompute here updated only
      // sourceSide/targetSide/waypoints and left the leader flags stale,
      // which made connectors appear visually disconnected from elements.
      //
      // Optimisation: connectors where BOTH endpoints move by the SAME delta
      // (uniform translation, e.g. all members of the same group nudged) can
      // be translated directly without rerouting.
      const newConnectors = state.connectors.map((c) => {
        const srcInSet = idSet.has(c.sourceId);
        const tgtInSet = idSet.has(c.targetId);
        if (!srcInSet && !tgtInSet) return c;

        const dSrc = dxyMap.get(c.sourceId) ?? { dx: 0, dy: 0 };
        const dTgt = dxyMap.get(c.targetId) ?? { dx: 0, dy: 0 };

        // Both endpoints moved by the same delta → simple translation preserves
        // the existing geometry (no diagonal segments introduced).
        if (
          srcInSet && tgtInSet &&
          dSrc.dx === dTgt.dx && dSrc.dy === dTgt.dy &&
          c.waypoints && c.waypoints.length > 0
        ) {
          return {
            ...c,
            waypoints: c.waypoints.map((wp) => ({ x: wp.x + dSrc.dx, y: wp.y + dSrc.dy })),
          };
        }

        // Otherwise: full recompute via the same helper used for normal moves.
        // This sets sourceInvisibleLeader/targetInvisibleLeader correctly.
        return recomputeAllConnectors([c], newElements)[0] ?? c;
      });

      return { ...state, elements: newElements, connectors: newConnectors };
    }

    default:
      return state;
  }
}

export function useDiagram(initialData: DiagramData) {
  const [data, dispatch] = useReducer(reducer, initialData);

  // Build marker so we can confirm the latest build is live.
  if (typeof window !== "undefined" && !(window as unknown as { __DIAGRAMATIX_BUILD?: string }).__DIAGRAMATIX_BUILD) {
    (window as unknown as { __DIAGRAMATIX_BUILD?: string }).__DIAGRAMATIX_BUILD = "trace-2026-04-18-a";
    console.log("[Diagramatix] build=trace-2026-04-18-a — set window.__DIAGRAMATIX_TRACE=true to see trace logs");
  }

  // ── Undo / Redo infrastructure ──────────────────────────────────────────────
  type Snapshot = { elements: DiagramElement[]; connectors: Connector[] };
  const dataRef      = useRef(data);
  dataRef.current    = data;   // always fresh — updated every render

  const pastRef   = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Drag-coalescing refs — capture snapshot at drag start, push at drag end
  const preMoveRef        = useRef<Snapshot | null>(null);
  const draggingRef       = useRef<string | null>(null);
  const preResizeRef      = useRef<Snapshot | null>(null);
  const resizingRef       = useRef<string | null>(null);
  const preGroupMoveRef   = useRef<Snapshot | null>(null);
  const groupDraggingRef  = useRef<boolean>(false);
  const preLaneRef        = useRef<Snapshot | null>(null);
  const preWaypointRef    = useRef<Snapshot | null>(null);
  const waypointConnIdRef = useRef<string | null>(null);

  function snapshotData(): Snapshot {
    return { elements: dataRef.current.elements, connectors: dataRef.current.connectors };
  }

  function pushHistory(snap: Snapshot) {
    const next = [...pastRef.current, snap];
    if (next.length > 100) next.shift();
    pastRef.current = next;
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }
  // ────────────────────────────────────────────────────────────────────────────

  const addElement = useCallback(
    (symbolType: SymbolType, position: Point, taskType?: BpmnTaskType, eventType?: EventType, id?: string) => {
      pushHistory(snapshotData());
      dispatch({ type: "ADD_ELEMENT", payload: { symbolType, position, taskType, eventType, id } });
    },
    []
  );

  const moveElement = useCallback((id: string, x: number, y: number, unconstrained?: boolean) => {
    if (draggingRef.current !== id) {
      draggingRef.current = id;
      preMoveRef.current = snapshotData(); // snapshot before drag starts
    }
    dispatch({ type: "MOVE_ELEMENT", payload: { id, x, y, unconstrained } });
  }, []);

  const moveElements = useCallback((ids: string[], dx: number, dy: number) => {
    if (!groupDraggingRef.current) {
      groupDraggingRef.current = true;
      preGroupMoveRef.current = snapshotData();
    }
    dispatch({ type: "MOVE_ELEMENTS", payload: { ids, dx, dy } });
  }, []);

  const elementsMoveEnd = useCallback(() => {
    if (groupDraggingRef.current && preGroupMoveRef.current) {
      pushHistory(preGroupMoveRef.current);
      preGroupMoveRef.current = null;
      groupDraggingRef.current = false;
    }
    // Recompute partial connectors and validate obstacles after group drag ends
    dispatch({ type: "CORRECT_ALL_CONNECTORS" });
  }, []);

  const resizeElement = useCallback((id: string, x: number, y: number, width: number, height: number) => {
    if (resizingRef.current !== id) {
      resizingRef.current = id;
      preResizeRef.current = snapshotData(); // snapshot before resize starts
    }
    dispatch({ type: "RESIZE_ELEMENT", payload: { id, x, y, width, height } });
  }, []);

  const resizeElementEnd = useCallback((id: string) => {
    if (resizingRef.current === id && preResizeRef.current) {
      pushHistory(preResizeRef.current);
      preResizeRef.current = null;
      resizingRef.current = null;
    }
  }, []);

  const updateLabel = useCallback((id: string, label: string) => {
    pushHistory(snapshotData());
    dispatch({ type: "UPDATE_LABEL", payload: { id, label } });
  }, []);

  const updateProperties = useCallback(
    (id: string, properties: Record<string, unknown>) => {
      pushHistory(snapshotData());
      dispatch({ type: "UPDATE_PROPERTIES", payload: { id, properties } });
    },
    []
  );

  const updatePropertiesBatch = useCallback(
    (updates: Array<{ id: string; properties: Record<string, unknown> }>) => {
      pushHistory(snapshotData());
      for (const { id, properties } of updates) {
        dispatch({ type: "UPDATE_PROPERTIES", payload: { id, properties } });
      }
      // Auto-tint parent value chain containers when child fill colours change
      const hasFillChange = updates.some(u => "fillColor" in u.properties);
      if (hasFillChange) {
        const snap = snapshotData(); // note: dataRef is stale, but parentId values are stable
        // Build a map of new fill colours from the updates
        const newFillMap = new Map<string, string | undefined>();
        for (const u of updates) {
          if ("fillColor" in u.properties) {
            newFillMap.set(u.id, u.properties.fillColor as string | undefined);
          }
        }
        // Find parent process-groups of updated elements
        const parentIds = new Set<string>();
        for (const u of updates) {
          const el = snap.elements.find(e => e.id === u.id);
          if (el?.parentId) parentIds.add(el.parentId);
        }
        for (const pid of parentIds) {
          const parent = snap.elements.find(e => e.id === pid && e.type === "process-group");
          if (!parent) continue;
          // Find leftmost child with a fill colour (prefer new colour from updates)
          const children = snap.elements
            .filter(e => e.parentId === pid && CHEVRON_SNAP_TYPES.has(e.type))
            .sort((a, b) => a.x - b.x);
          // Resolve effective fill for each child: new value from updates, or existing
          const leftmost = children.find(e => {
            const newVal = newFillMap.get(e.id);
            return newVal ?? (e.properties.fillColor as string | undefined);
          });
          if (leftmost) {
            const baseColor = (newFillMap.get(leftmost.id) ?? leftmost.properties.fillColor) as string;
            if (baseColor) {
              const tint = lightenHex(baseColor, 0.6);
              dispatch({ type: "UPDATE_PROPERTIES", payload: { id: pid, properties: { fillColor: tint } } });
            } else {
              // Colours cleared — reset container too
              dispatch({ type: "UPDATE_PROPERTIES", payload: { id: pid, properties: { fillColor: undefined } } });
            }
          }
        }
      }
    },
    []
  );

  const deleteElement = useCallback((id: string) => {
    pushHistory(snapshotData());
    dispatch({ type: "DELETE_ELEMENT", payload: { id } });
  }, []);

  const addConnector = useCallback(
    (
      sourceId: string,
      targetId: string,
      connectorType: ConnectorType = "sequence",
      directionType: DirectionType = "directed",
      routingType: RoutingType = "rectilinear",
      sourceSide: Side = "right",
      targetSide: Side = "left",
      sourceOffsetAlong?: number,
      targetOffsetAlong?: number,
      force?: boolean
    ) => {
      pushHistory(snapshotData());
      dispatch({
        type: "ADD_CONNECTOR",
        payload: { sourceId, targetId, connectorType, directionType, routingType, sourceSide, targetSide, sourceOffsetAlong, targetOffsetAlong, force },
      });
    },
    []
  );

  const deleteConnector = useCallback((id: string) => {
    pushHistory(snapshotData());
    dispatch({ type: "DELETE_CONNECTOR", payload: { id } });
  }, []);

  const updateConnectorDirection = useCallback(
    (id: string, directionType: DirectionType) => {
      pushHistory(snapshotData());
      dispatch({ type: "UPDATE_CONNECTOR", payload: { id, directionType } });
    },
    []
  );

  const updateConnectorType = useCallback(
    (id: string, connectorType: ConnectorType) => {
      pushHistory(snapshotData());
      dispatch({ type: "UPDATE_CONNECTOR_TYPE", payload: { id, connectorType } });
    },
    []
  );

  const reverseConnector = useCallback(
    (id: string) => {
      pushHistory(snapshotData());
      dispatch({ type: "REVERSE_CONNECTOR", payload: { id } });
    },
    []
  );

  const updateConnectorEndpoint = useCallback(
    (connectorId: string, endpoint: "source" | "target", newElementId: string, newSide: Side, newOffsetAlong?: number) => {
      // Clear any pending waypoint snapshot (messageBPMN drag commits via endpoint, not waypointDragEnd)
      preWaypointRef.current = null;
      waypointConnIdRef.current = null;
      pushHistory(snapshotData());
      dispatch({ type: "UPDATE_CONNECTOR_ENDPOINT", payload: { connectorId, endpoint, newElementId, newSide, newOffsetAlong } });
    },
    []
  );

  const updateConnectorWaypoints = useCallback((id: string, waypoints: Point[]) => {
    // Capture snapshot on first waypoint update for this connector (drag-coalescing)
    if (waypointConnIdRef.current !== id) {
      waypointConnIdRef.current = id;
      preWaypointRef.current = snapshotData();
    }
    dispatch({ type: "UPDATE_CONNECTOR_WAYPOINTS", payload: { id, waypoints } });
  }, []);

  const updateCurveHandles = useCallback((
    id: string, waypoints: Point[], cp1RelOffset: Point, cp2RelOffset: Point
  ) => {
    if (waypointConnIdRef.current !== id) {
      waypointConnIdRef.current = id;
      preWaypointRef.current = snapshotData();
    }
    dispatch({ type: "UPDATE_CURVE_HANDLES", payload: { id, waypoints, cp1RelOffset, cp2RelOffset } });
  }, []);

  const nudgeConnector = useCallback((connectorId: string, dx: number, dy: number) => {
    pushHistory(snapshotData());
    dispatch({ type: "NUDGE_CONNECTOR", payload: { connectorId, dx, dy } });
  }, []);

  const nudgeConnectorEndpoint = useCallback((connectorId: string, endpoint: "source" | "target", dx: number, dy: number) => {
    pushHistory(snapshotData());
    dispatch({ type: "NUDGE_CONNECTOR_ENDPOINT", payload: { connectorId, endpoint, dx, dy } });
  }, []);

  const connectorWaypointDragEnd = useCallback((id: string) => {
    if (waypointConnIdRef.current === id && preWaypointRef.current) {
      pushHistory(preWaypointRef.current);
      preWaypointRef.current = null;
      waypointConnIdRef.current = null;
    }
  }, []);

  const updateConnectorLabel = useCallback(
    (id: string, label?: string, labelOffsetX?: number, labelOffsetY?: number, labelWidth?: number) => {
      pushHistory(snapshotData());
      dispatch({ type: "UPDATE_CONNECTOR_LABEL", payload: { id, label, labelOffsetX, labelOffsetY, labelWidth } });
    }, []
  );

  const elementMoveEnd = useCallback((id: string) => {
    if (draggingRef.current === id && preMoveRef.current) {
      pushHistory(preMoveRef.current);
      preMoveRef.current = null;
      draggingRef.current = null;
    }
    dispatch({ type: "MOVE_END", payload: { id } });
  }, []);

  const splitConnector = useCallback((
    symbolType: SymbolType,
    position: Point,
    connectorId: string,
    taskType?: BpmnTaskType,
    eventType?: EventType,
  ) => {
    pushHistory(snapshotData());
    dispatch({ type: "SPLIT_CONNECTOR", payload: { symbolType, position, connectorId, taskType, eventType } });
  }, []);

  const applyTemplate = useCallback((elements: DiagramElement[], connectors: Connector[]) => {
    pushHistory(snapshotData());
    dispatch({ type: "APPLY_TEMPLATE", payload: { elements, connectors } });
  }, []);

  const alignElements = useCallback((ids: string[], mode: "center" | "top" | "bottom" | "vcenter" | "left" | "right" | "smart") => {
    pushHistory(snapshotData());
    dispatch({ type: "ALIGN_ELEMENTS", payload: { ids, mode } });
  }, []);

  const setData = useCallback((newData: DiagramData) => {
    // Clear history on full state replacement (e.g. initial DB load)
    pastRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    dispatch({ type: "SET_DATA", payload: newData });
  }, []);

  const setViewport = useCallback((x: number, y: number, zoom: number) => {
    dispatch({ type: "SET_VIEWPORT", payload: { x, y, zoom } });
  }, []);

  const correctAllConnectors = useCallback(() => {
    dispatch({ type: "CORRECT_ALL_CONNECTORS" });
  }, []);

  const insertSpace = useCallback((markerX: number, markerY: number, dx: number, dy: number) => {
    pushHistory(snapshotData());
    dispatch({ type: "INSERT_SPACE", payload: { markerX, markerY, dx, dy } });
  }, []);

  const addLane = useCallback((poolId: string) => {
    pushHistory(snapshotData());
    dispatch({ type: "ADD_LANE", payload: { poolId } });
  }, []);

  const addSublane = useCallback((laneId: string) => {
    pushHistory(snapshotData());
    dispatch({ type: "ADD_SUBLANE", payload: { laneId } });
  }, []);

  const moveLaneBoundary = useCallback(
    (aboveLaneId: string, belowLaneId: string, dy: number) => {
      if (!preLaneRef.current) preLaneRef.current = snapshotData();
      dispatch({ type: "MOVE_LANE_BOUNDARY", payload: { aboveLaneId, belowLaneId, dy } });
    },
    []
  );

  const reorderLane = useCallback((laneId: string, direction: "up" | "down") => {
    pushHistory(snapshotData());
    dispatch({ type: "REORDER_LANE", payload: { laneId, direction } });
  }, []);

  const laneBoundaryMoveEnd = useCallback(() => {
    if (preLaneRef.current) {
      pushHistory(preLaneRef.current);
      preLaneRef.current = null;
    }
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const snap = pastRef.current.pop()!;
    futureRef.current.push(snapshotData());
    dispatch({ type: "SET_DATA", payload: { ...snap, viewport: dataRef.current.viewport } });
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const snap = futureRef.current.pop()!;
    pastRef.current.push(snapshotData());
    dispatch({ type: "SET_DATA", payload: { ...snap, viewport: dataRef.current.viewport } });
    setCanRedo(futureRef.current.length > 0);
    setCanUndo(true);
  }, []);

  return {
    data,
    addElement,
    moveElement,
    moveElements,
    elementsMoveEnd,
    resizeElement,
    resizeElementEnd,
    updateLabel,
    updateProperties,
    updatePropertiesBatch,
    deleteElement,
    addConnector,
    deleteConnector,
    updateConnectorDirection,
    updateConnectorType,
    reverseConnector,
    updateConnectorEndpoint,
    updateConnectorWaypoints,
    updateCurveHandles,
    connectorWaypointDragEnd,
    nudgeConnector,
    nudgeConnectorEndpoint,
    updateConnectorLabel,
    updateConnectorFields: useCallback(
      (id: string, fields: Partial<Connector>) => {
        pushHistory(snapshotData());
        dispatch({ type: "UPDATE_CONNECTOR_FIELDS", payload: { id, fields } });
      }, []
    ),
    updateDiagramTitle: useCallback(
      (title: DiagramTitle) => {
        dispatch({ type: "UPDATE_DIAGRAM_TITLE", payload: title });
      }, []
    ),
    setFontSize: useCallback(
      (size: number) => {
        dispatch({ type: "SET_FONT_SIZE", payload: size });
      }, []
    ),
    setConnectorFontSize: useCallback(
      (size: number) => {
        dispatch({ type: "SET_CONNECTOR_FONT_SIZE", payload: size });
      }, []
    ),
    setTitleFontSize: useCallback(
      (size: number) => {
        dispatch({ type: "SET_TITLE_FONT_SIZE", payload: size });
      }, []
    ),
    setPoolFontSize: useCallback(
      (size: number) => {
        dispatch({ type: "SET_POOL_FONT_SIZE", payload: size });
      }, []
    ),
    setLaneFontSize: useCallback(
      (size: number) => {
        dispatch({ type: "SET_LANE_FONT_SIZE", payload: size });
      }, []
    ),
    setDatabase: useCallback(
      (db: string) => {
        dispatch({ type: "SET_DATABASE", payload: db });
      }, []
    ),
    convertTaskSubprocess: useCallback((id: string) => {
      pushHistory(snapshotData());
      dispatch({ type: "CONVERT_TASK_SUBPROCESS", payload: { id } });
    }, []),
    convertProcessCollapsed: useCallback((id: string) => {
      pushHistory(snapshotData());
      dispatch({ type: "CONVERT_PROCESS_COLLAPSED", payload: { id } });
    }, []),
    convertEventType: useCallback((id: string, newEventType: "start-event" | "intermediate-event" | "end-event") => {
      pushHistory(snapshotData());
      dispatch({ type: "CONVERT_EVENT_TYPE", payload: { id, newEventType } });
    }, []),
    addSelfTransition: useCallback((elementId: string, side: Side, sourceOffsetAlong: number, targetOffsetAlong: number, bulge: number) => {
      pushHistory(snapshotData());
      dispatch({ type: "ADD_SELF_TRANSITION", payload: { elementId, side, sourceOffsetAlong, targetOffsetAlong, bulge } });
    }, []),
    flipForkJoin: useCallback((id: string) => {
      pushHistory(snapshotData());
      dispatch({ type: "FLIP_FORK_JOIN", payload: { id } });
    }, []),
    elementMoveEnd,
    splitConnector,
    applyTemplate,
    alignElements,
    setData,
    setViewport,
    correctAllConnectors,
    insertSpace,
    addLane,
    addSublane,
    moveLaneBoundary,
    reorderLane,
    laneBoundaryMoveEnd,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}

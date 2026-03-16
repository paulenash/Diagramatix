"use client";

import { useCallback, useReducer, useRef, useState } from "react";
import type {
  BpmnTaskType,
  FlowType,
  GatewayType,
  EventType,
  RepeatType,
  Connector,
  ConnectorType,
  DiagramData,
  DiagramElement,
  DirectionType,
  Point,
  RoutingType,
  Side,
  SymbolType,
} from "@/app/lib/diagram/types";
import { computeWaypoints, recomputeAllConnectors, consolidateWaypoints, rectifyWaypoints } from "@/app/lib/diagram/routing";
import { getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";

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
  sourceSide: Side, targetSide: Side, offsetAlong: number
): { waypoints: Point[]; sourceInvisibleLeader: true; targetInvisibleLeader: true } {
  const tgtIsEvent = target.type === "start-event" || target.type === "intermediate-event";
  let x: number;
  if (tgtIsEvent) {
    x = target.x + target.width / 2;
  } else {
    const effectiveAlong = BPMN_EVENT_TYPES.has(source.type) ? 0.5 : offsetAlong;
    const srcX = source.x + source.width * effectiveAlong;
    const minX = Math.max(source.x, target.x);
    const maxX = Math.min(source.x + source.width, target.x + target.width);
    x = maxX > minX ? Math.max(minX, Math.min(maxX, srcX)) : srcX;
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

type Action =
  | { type: "SET_DATA"; payload: DiagramData }
  | { type: "ADD_ELEMENT"; payload: { symbolType: SymbolType; position: Point; taskType?: BpmnTaskType; eventType?: EventType } }
  | { type: "MOVE_ELEMENT"; payload: { id: string; x: number; y: number } }
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
    }}
  | { type: "DELETE_CONNECTOR"; payload: { id: string } }
  | { type: "UPDATE_CONNECTOR_ENDPOINT"; payload: {
      connectorId: string;
      endpoint: "source" | "target";
      newElementId: string;
      newSide: Side;
      newOffsetAlong?: number;
    }}
  | { type: "UPDATE_CONNECTOR"; payload: { id: string; directionType: DirectionType } }
  | { type: "UPDATE_CONNECTOR_WAYPOINTS"; payload: { id: string; waypoints: Point[] } }
  | { type: "UPDATE_CURVE_HANDLES"; payload: {
      id: string;
      waypoints: Point[];
      cp1RelOffset: Point;
      cp2RelOffset: Point;
    }}
  | { type: "UPDATE_CONNECTOR_LABEL"; payload: { id: string; label?: string; labelOffsetX?: number; labelOffsetY?: number; labelWidth?: number } }
  | { type: "CORRECT_ALL_CONNECTORS" }
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
  | { type: "MOVE_LANE_BOUNDARY"; payload: { aboveLaneId: string; belowLaneId: string; dy: number } }
  | { type: "MOVE_ELEMENTS"; payload: { ids: string[]; dx: number; dy: number } }
  | { type: "APPLY_TEMPLATE"; payload: { elements: DiagramElement[]; connectors: Connector[] } };

export function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DATA_ELEMENT_TYPES = new Set<SymbolType>(["data-object", "data-store", "text-annotation"]);

const BPMN_CONTENT_TYPES = new Set<SymbolType>([
  "task", "gateway", "start-event", "end-event", "intermediate-event",
  "subprocess", "data-object", "data-store",
]);

function isContainerType(type: SymbolType): boolean {
  return type === "system-boundary" || type === "composite-state"
      || type === "pool" || type === "lane" || type === "subprocess-expanded";
}

function containerAccepts(containerType: SymbolType, childType: SymbolType): boolean {
  if (containerType === "system-boundary") return childType === "use-case" || childType === "hourglass";
  if (containerType === "composite-state") return childType === "state" || childType === "initial-state" || childType === "final-state";
  if (containerType === "pool") return childType === "lane" || BPMN_CONTENT_TYPES.has(childType);
  if (containerType === "lane") return BPMN_CONTENT_TYPES.has(childType);
  if (containerType === "subprocess-expanded") return BPMN_CONTENT_TYPES.has(childType);
  return false;
}

function getAllDescendantIds(elements: DiagramElement[], containerId: string): Set<string> {
  const result = new Set<string>();
  const queue = [containerId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of elements) {
      if (e.parentId === id) { result.add(e.id); queue.push(e.id); }
    }
  }
  return result;
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
  const LANE_LW = 24;
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

function reducer(state: DiagramData, action: Action): DiagramData {
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
        label = `AutoTimer ${count + 1}`;
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
      } else if (action.payload.symbolType === "pool") {
        const count = state.elements.filter((e) => e.type === "pool").length;
        label = `Pool ${count + 1}`;
      } else if (action.payload.symbolType === "lane") {
        const count = state.elements.filter((e) => e.type === "lane").length;
        label = `Lane ${count + 1}`;
      }
      let newEl: DiagramElement = {
        id: nanoid(),
        type: action.payload.symbolType,
        x: action.payload.position.x - def.defaultWidth / 2,
        y: action.payload.position.y - def.defaultHeight / 2,
        width: def.defaultWidth,
        height: def.defaultHeight,
        label,
        properties: action.payload.symbolType === "pool" ? { poolType: "black-box" } : {},
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
      // Check if newly dropped element is fully inside a subprocess-expanded
      if (!newEl.boundaryHostId) {
        const container = state.elements.find(
          (b) =>
            b.type === "subprocess-expanded" &&
            containerAccepts(b.type, newEl.type) &&
            newEl.x >= b.x && newEl.x + newEl.width <= b.x + b.width &&
            newEl.y >= b.y && newEl.y + newEl.height <= b.y + b.height
        );
        if (container) {
          newEl = { ...newEl, parentId: container.id };
        }
      }
      return { ...state, elements: [...state.elements, newEl] };
    }

    case "MOVE_ELEMENT": {
      const { id, x, y } = action.payload;
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

      // CASE B + C: Normal move (host elements also carry their boundary events)
      const dx = x - el.x, dy = y - el.y;
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

      const elements = state.elements.map((e) => {
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
          const potentialParents = state.elements.filter(
            (b) =>
              isContainerType(b.type) &&
              containerAccepts(b.type, e.type) &&
              b.id !== id &&
              (x + e.width / 2) >= b.x && (x + e.width / 2) <= b.x + b.width &&
              (y + e.height / 2) >= b.y && (y + e.height / 2) <= b.y + b.height
          );
          // Prefer innermost container: subprocess-expanded > lane > pool > other
          const potentialParent =
            potentialParents.find(b => b.type === "subprocess-expanded") ??
            potentialParents.find(b => b.type === "lane") ??
            potentialParents.find(b => b.type === "pool") ??
            potentialParents[0];
          if (potentialParent !== undefined || state.elements.some(b => isContainerType(b.type) && containerAccepts(b.type, e.type))) {
            parentId = potentialParent?.id;
          }
          return { ...e, x, y, parentId };
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

      const affectedIds = new Set([id, ...descendantIds, ...attachedBoundaryIds]);
      const connectors = state.connectors.map(conn => {
        const srcIn = affectedIds.has(conn.sourceId);
        const tgtIn = affectedIds.has(conn.targetId);
        if (!srcIn && !tgtIn) return conn;
        if (srcIn && tgtIn) return {
          ...conn,
          waypoints: conn.waypoints.map(pt => ({ x: pt.x + dx, y: pt.y + dy })),
        };
        return recomputeAllConnectors([conn], elements)[0] ?? conn;
      });
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

      const connectors = state.connectors.map(conn => {
        const srcIn = expandedIds.has(conn.sourceId);
        const tgtIn = expandedIds.has(conn.targetId);
        if (!srcIn && !tgtIn) return conn;
        if (srcIn && tgtIn) return {
          ...conn,
          waypoints: conn.waypoints.map(pt => ({ x: pt.x + dx, y: pt.y + dy })),
        };
        return recomputeAllConnectors([conn], elements)[0] ?? conn;
      });

      return { ...state, elements: updatePoolTypes(elements), connectors };
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
        let elements = state.elements.map((e) =>
          e.id === id ? { ...e, x: newX, y: newY, width: newW, height: newH }
          : laneUpdates.has(e.id) ? laneUpdates.get(e.id)!
          : e
        );
        for (const updatedLane of laneUpdates.values()) {
          elements = clampChildrenToLane(elements, updatedLane);
        }
        const connectors = recomputeAllConnectors(state.connectors, elements);
        return { ...state, elements, connectors };
      }

      const elements = state.elements.map((el) => {
        if (el.id === id) return { ...el, x: newX, y: newY, width: newW, height: newH };
        if (el.boundaryHostId === id && target) {
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
      const connectors = recomputeAllConnectors(state.connectors, elements);
      return { ...state, elements, connectors };
    }

    case "UPDATE_LABEL":
      return {
        ...state,
        elements: state.elements.map((el) =>
          el.id === action.payload.id
            ? { ...el, label: action.payload.label }
            : el
        ),
      };

    case "UPDATE_PROPERTIES": {
      return {
        ...state,
        elements: state.elements.map((el) => {
          if (el.id !== action.payload.id) return el;
          const { taskType, gatewayType, eventType, repeatType, flowType, ...rest } = action.payload.properties;
          return {
            ...el,
            ...(taskType !== undefined ? { taskType: taskType as BpmnTaskType } : {}),
            ...(gatewayType !== undefined ? { gatewayType: gatewayType as GatewayType } : {}),
            ...(eventType !== undefined ? { eventType: eventType as EventType } : {}),
            ...(repeatType !== undefined ? { repeatType: repeatType as RepeatType } : {}),
            ...(flowType !== undefined ? { flowType: flowType as FlowType } : {}),
            properties: { ...el.properties, ...rest },
          };
        }),
      };
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

      // If deleting a lane, reflow remaining sibling lanes to fill the pool height
      if (el?.type === "lane" && el.parentId) {
        const pool = elements.find((e) => e.id === el.parentId);
        if (pool) {
          const POOL_LW = 30;
          const siblings = elements
            .filter((e) => e.type === "lane" && e.parentId === pool.id)
            .sort((a, b) => a.y - b.y);
          const totalSibH = siblings.reduce((s, l) => s + l.height, 0) || 1;
          let stackY = pool.y;
          for (const sib of siblings) {
            const newH = Math.max(40, Math.round(pool.height * (sib.height / totalSibH)));
            const updated = { ...sib, x: pool.x + POOL_LW, y: stackY, width: pool.width - POOL_LW, height: newH };
            elements = elements.map((e) => e.id === sib.id ? updated : e);
            elements = clampChildrenToLane(elements, updated);
            stackY += newH;
          }
        }
      }

      const connectors = state.connectors.filter(
        (c) => c.sourceId !== id && c.targetId !== id
      );
      return { ...state, elements: updatePoolTypes(elements), connectors };
    }

    case "ADD_CONNECTOR": {
      const { sourceId, targetId, connectorType, directionType, routingType, sourceSide, targetSide } = action.payload;
      const source = state.elements.find((el) => el.id === sourceId);
      const target = state.elements.find((el) => el.id === targetId);
      if (!source || !target) return state;

      // Data elements may only use associationBPMN connectors
      const isDataConn = DATA_ELEMENT_TYPES.has(source.type) || DATA_ELEMENT_TYPES.has(target.type);
      if (isDataConn && connectorType !== "associationBPMN") return state;
      if (!isDataConn && connectorType === "associationBPMN") return state;

      const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
        connectorType === "messageBPMN"
          ? messageBpmnWaypoints(source, target, sourceSide, targetSide, 0.5)
          : computeWaypoints(source, target, state.elements, sourceSide, targetSide, routingType);

      const isMsgBpmn = connectorType === "messageBPMN";
      const msgBpmnCount = isMsgBpmn
        ? state.connectors.filter((c) => c.type === "messageBPMN").length
        : 0;
      const isTransition = connectorType === "transition";
      const transitionCount = isTransition
        ? state.connectors.filter((c) => c.type === "transition").length
        : 0;

      // Decision gateway outgoing sequence connectors get a source-anchored label
      const isDecisionGatewayOutgoing = connectorType === "sequence"
        && source.type === "gateway"
        && ((source.properties.gatewayRole as string | undefined) ?? "decision") === "decision";

      const newConnector: Connector = {
        id: nanoid(),
        sourceId,
        targetId,
        sourceSide,
        targetSide,
        type: connectorType,
        directionType,
        routingType,
        sourceInvisibleLeader,
        targetInvisibleLeader,
        waypoints,
        label:        isTransition ? `transition ${transitionCount + 1}`
                    : isMsgBpmn   ? `message ${msgBpmnCount + 1}`
                    : isDecisionGatewayOutgoing ? ""
                    : undefined,
        labelOffsetX: isTransition ? 0   : isMsgBpmn ? 20  : isDecisionGatewayOutgoing ? 5  : undefined,
        labelOffsetY: isTransition ? -30 : isMsgBpmn ? 0   : isDecisionGatewayOutgoing ? -20 : undefined,
        labelWidth:   isTransition ? 80  : isMsgBpmn ? 80  : isDecisionGatewayOutgoing ? 60  : undefined,
        labelAnchor:  isDecisionGatewayOutgoing ? "source" : undefined,
      };

      const isSeq = connectorType === "sequence";
      const updatedElements = state.elements.map((el) => {
        if (isMsgBpmn) {
          if (el.id === sourceId) {
            if (el.type === "task")               return { ...el, taskType: "send" as BpmnTaskType };
            if (el.type === "end-event")          return { ...el, eventType: "message" as EventType, flowType: "throwing" as FlowType };
            if (el.type === "intermediate-event") return { ...el, eventType: "message" as EventType, taskType: "send" as BpmnTaskType, flowType: "throwing" as FlowType };
          }
          if (el.id === targetId) {
            if (el.type === "task")               return { ...el, taskType: "receive" as BpmnTaskType };
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

      return { ...state, elements: updatedElements, connectors: [...state.connectors, newConnector] };
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

    case "UPDATE_CONNECTOR_ENDPOINT": {
      const { connectorId, endpoint, newElementId, newSide, newOffsetAlong } = action.payload;
      const connectors = state.connectors.map((conn) => {
        if (conn.id !== connectorId) return conn;
        const updated = endpoint === "source"
          ? { ...conn, sourceId: newElementId, sourceSide: newSide, sourceOffsetAlong: newOffsetAlong ?? 0.5 }
          : { ...conn, targetId: newElementId, targetSide: newSide, targetOffsetAlong: newOffsetAlong ?? 0.5 };
        const source = state.elements.find((el) => el.id === updated.sourceId);
        const target = state.elements.find((el) => el.id === updated.targetId);
        if (!source || !target) return conn;
        const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } =
          updated.type === "messageBPMN"
            ? messageBpmnWaypoints(source, target, updated.sourceSide, updated.targetSide,
                updated.sourceOffsetAlong ?? 0.5)
            : computeWaypoints(source, target, state.elements,
                updated.sourceSide, updated.targetSide, updated.routingType,
                updated.sourceOffsetAlong ?? 0.5, updated.targetOffsetAlong ?? 0.5);
        return { ...updated, waypoints, sourceInvisibleLeader, targetInvisibleLeader };
      });
      return { ...state, connectors };
    }

    case "UPDATE_CONNECTOR_WAYPOINTS":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.payload.id ? { ...c, waypoints: consolidateWaypoints(action.payload.waypoints) } : c
        ),
      };

    case "UPDATE_CURVE_HANDLES":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.payload.id
            ? { ...c,
                waypoints:    action.payload.waypoints,
                cp1RelOffset: action.payload.cp1RelOffset,
                cp2RelOffset: action.payload.cp2RelOffset,
              }
            : c
        ),
      };

    case "UPDATE_CONNECTOR_LABEL":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload } : c
        ),
      };

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
      if (el.type !== "gateway" && el.type !== "intermediate-event") return state;

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
            waypoints: wA, sourceInvisibleLeader: sIA, targetInvisibleLeader: tIA },
          { id: nanoid(), type: orig.type, sourceId: el.id, targetId: orig.targetId,
            sourceSide: cBSide, targetSide: orig.targetSide,
            directionType: orig.directionType, routingType: orig.routingType,
            sourceOffsetAlong: 0.5, targetOffsetAlong: orig.targetOffsetAlong,
            waypoints: wB, sourceInvisibleLeader: sIB, targetInvisibleLeader: tIB },
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
      if (symbolType === "intermediate-event") {
        const count = state.elements.filter(e => e.type === "intermediate-event").length;
        label = `Event ${count + 1}`;
      }
      const newEl: DiagramElement = {
        id: nanoid(),
        type: symbolType,
        x: position.x - def.defaultWidth / 2,
        y: position.y - def.defaultHeight / 2,
        width: def.defaultWidth,
        height: def.defaultHeight,
        label,
        properties: {},
        ...(taskType  !== undefined ? { taskType  } : {}),
        ...(eventType !== undefined ? { eventType } : {}),
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
            waypoints: wA, sourceInvisibleLeader: sIA, targetInvisibleLeader: tIA },
          { id: nanoid(), type: orig.type, sourceId: newEl.id, targetId: orig.targetId,
            sourceSide: cBSide, targetSide: orig.targetSide,
            directionType: orig.directionType, routingType: orig.routingType,
            sourceOffsetAlong: 0.5, targetOffsetAlong: orig.targetOffsetAlong,
            waypoints: wB, sourceInvisibleLeader: sIB, targetInvisibleLeader: tIB },
        ],
      };
    }

    case "ADD_LANE": {
      const { poolId } = action.payload;
      const pool = state.elements.find((e) => e.id === poolId && e.type === "pool");
      if (!pool) return state;
      const POOL_LABEL_W = 30;
      const DEFAULT_LANE_H = 150;
      const LANE_HEADER_H = 28;
      const existingLanes = state.elements.filter((e) => e.type === "lane" && e.parentId === poolId);
      const stackedH = existingLanes.reduce((s, l) => s + l.height, 0);
      const laneY = pool.y + stackedH;
      const laneCount = state.elements.filter((e) => e.type === "lane").length;
      const laneH = existingLanes.length === 0 ? pool.height : LANE_HEADER_H;
      const newLane: DiagramElement = {
        id: nanoid(), type: "lane",
        x: pool.x + POOL_LABEL_W,
        y: laneY,
        width: pool.width - POOL_LABEL_W,
        height: laneH,
        label: `Lane ${laneCount + 1}`,
        properties: {}, parentId: poolId,
      };
      const neededH = laneY + laneH - pool.y;
      const elements = state.elements.map((e) =>
        e.id === poolId && neededH > e.height ? { ...e, height: neededH } : e
      );
      return { ...state, elements: updatePoolTypes([...elements, newLane]) };
    }

    case "MOVE_LANE_BOUNDARY": {
      const { aboveLaneId, belowLaneId, dy } = action.payload;
      const MIN_H = 40;
      const above = state.elements.find((e) => e.id === aboveLaneId);
      const below = state.elements.find((e) => e.id === belowLaneId);
      if (!above || !below) return state;
      const newAboveH = Math.max(MIN_H, above.height + dy);
      const actualDy = newAboveH - above.height;
      const newBelowH = Math.max(MIN_H, below.height - actualDy);
      const elements = state.elements.map((e) => {
        if (e.id === aboveLaneId) return { ...e, height: newAboveH };
        if (e.id === belowLaneId) return { ...e, y: e.y + actualDy, height: newBelowH };
        return e;
      });
      return { ...state, elements };
    }

    case "APPLY_TEMPLATE":
      return {
        ...state,
        elements: [...state.elements, ...action.payload.elements],
        connectors: [...state.connectors, ...action.payload.connectors],
      };

    default:
      return state;
  }
}

export function useDiagram(initialData: DiagramData) {
  const [data, dispatch] = useReducer(reducer, initialData);

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
    (symbolType: SymbolType, position: Point, taskType?: BpmnTaskType, eventType?: EventType) => {
      pushHistory(snapshotData());
      dispatch({ type: "ADD_ELEMENT", payload: { symbolType, position, taskType, eventType } });
    },
    []
  );

  const moveElement = useCallback((id: string, x: number, y: number) => {
    if (draggingRef.current !== id) {
      draggingRef.current = id;
      preMoveRef.current = snapshotData(); // snapshot before drag starts
    }
    dispatch({ type: "MOVE_ELEMENT", payload: { id, x, y } });
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
      targetSide: Side = "left"
    ) => {
      pushHistory(snapshotData());
      dispatch({
        type: "ADD_CONNECTOR",
        payload: { sourceId, targetId, connectorType, directionType, routingType, sourceSide, targetSide },
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

  const addLane = useCallback((poolId: string) => {
    pushHistory(snapshotData());
    dispatch({ type: "ADD_LANE", payload: { poolId } });
  }, []);

  const moveLaneBoundary = useCallback(
    (aboveLaneId: string, belowLaneId: string, dy: number) => {
      if (!preLaneRef.current) preLaneRef.current = snapshotData();
      dispatch({ type: "MOVE_LANE_BOUNDARY", payload: { aboveLaneId, belowLaneId, dy } });
    },
    []
  );

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
    deleteElement,
    addConnector,
    deleteConnector,
    updateConnectorDirection,
    updateConnectorEndpoint,
    updateConnectorWaypoints,
    updateCurveHandles,
    connectorWaypointDragEnd,
    updateConnectorLabel,
    elementMoveEnd,
    splitConnector,
    applyTemplate,
    setData,
    setViewport,
    correctAllConnectors,
    addLane,
    moveLaneBoundary,
    laneBoundaryMoveEnd,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}

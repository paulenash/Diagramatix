"use client";

import { useCallback, useReducer } from "react";
import type {
  BpmnTaskType,
  GatewayType,
  EventType,
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

type Action =
  | { type: "SET_DATA"; payload: DiagramData }
  | { type: "ADD_ELEMENT"; payload: { symbolType: SymbolType; position: Point; taskType?: BpmnTaskType; eventType?: EventType } }
  | { type: "MOVE_ELEMENT"; payload: { id: string; x: number; y: number } }
  | { type: "RESIZE_ELEMENT"; payload: { id: string; width: number; height: number } }
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
    }};

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function isContainerType(type: SymbolType): boolean {
  return type === "system-boundary" || type === "composite-state";
}

function containerAccepts(containerType: SymbolType, childType: SymbolType): boolean {
  if (containerType === "system-boundary") return childType === "use-case" || childType === "hourglass";
  if (containerType === "composite-state") return childType === "state" || childType === "initial-state" || childType === "final-state";
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
      } else if (action.payload.symbolType === "intermediate-event") {
        const count = state.elements.filter((e) => e.type === "intermediate-event").length;
        label = `Event ${count + 1}`;
      }
      const newEl: DiagramElement = {
        id: nanoid(),
        type: action.payload.symbolType,
        x: action.payload.position.x - def.defaultWidth / 2,
        y: action.payload.position.y - def.defaultHeight / 2,
        width: def.defaultWidth,
        height: def.defaultHeight,
        label,
        properties: {},
        taskType:  action.payload.taskType,
        eventType: action.payload.eventType,
      };
      return { ...state, elements: [...state.elements, newEl] };
    }

    case "MOVE_ELEMENT": {
      const { id, x, y } = action.payload;
      const el = state.elements.find((e) => e.id === id);
      if (!el) return state;

      const dx = x - el.x;
      const dy = y - el.y;
      const movingIsContainer = isContainerType(el.type);

      const elements = state.elements.map((e) => {
        if (e.id === id) {
          let parentId = e.parentId;
          // Check if this element can live inside a container
          const potentialParent = state.elements.find(
            (b) =>
              isContainerType(b.type) &&
              containerAccepts(b.type, e.type) &&
              b.id !== id &&
              (x + e.width / 2) >= b.x && (x + e.width / 2) <= b.x + b.width &&
              (y + e.height / 2) >= b.y && (y + e.height / 2) <= b.y + b.height
          );
          if (potentialParent !== undefined || state.elements.some(b => isContainerType(b.type) && containerAccepts(b.type, e.type))) {
            parentId = potentialParent?.id;
          }
          return { ...e, x, y, parentId };
        }
        // If moving a container, move its children with it
        if (movingIsContainer && e.parentId === id) {
          return { ...e, x: e.x + dx, y: e.y + dy };
        }
        return e;
      });

      const connectors = recomputeAllConnectors(state.connectors, elements);
      return { ...state, elements, connectors };
    }

    case "RESIZE_ELEMENT": {
      const { id, width, height } = action.payload;
      const elements = state.elements.map((el) =>
        el.id === id ? { ...el, width, height } : el
      );
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
          const { taskType, gatewayType, eventType, ...rest } = action.payload.properties;
          return {
            ...el,
            ...(taskType !== undefined ? { taskType: taskType as BpmnTaskType } : {}),
            ...(gatewayType !== undefined ? { gatewayType: gatewayType as GatewayType } : {}),
            ...(eventType !== undefined ? { eventType: eventType as EventType } : {}),
            properties: { ...el.properties, ...rest },
          };
        }),
      };
    }

    case "DELETE_ELEMENT": {
      const { id } = action.payload;
      const el = state.elements.find((e) => e.id === id);
      const deletingIsContainer = el ? isContainerType(el.type) : false;
      const elements = state.elements
        .filter((e) => e.id !== id)
        .map((e) =>
          deletingIsContainer && e.parentId === id ? { ...e, parentId: undefined } : e
        );
      const connectors = state.connectors.filter(
        (c) => c.sourceId !== id && c.targetId !== id
      );
      return { ...state, elements, connectors };
    }

    case "ADD_CONNECTOR": {
      const { sourceId, targetId, connectorType, directionType, routingType, sourceSide, targetSide } = action.payload;
      const source = state.elements.find((el) => el.id === sourceId);
      const target = state.elements.find((el) => el.id === targetId);
      if (!source || !target) return state;

      const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } = computeWaypoints(
        source,
        target,
        state.elements,
        sourceSide,
        targetSide,
        routingType
      );

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
        label:        connectorType === "interaction" ? "interaction label" : undefined,
        labelOffsetX: connectorType === "interaction" ? 0   : undefined,
        labelOffsetY: connectorType === "interaction" ? -30 : undefined,
        labelWidth:   connectorType === "interaction" ? 80  : undefined,
      };

      return { ...state, connectors: [...state.connectors, newConnector] };
    }

    case "DELETE_CONNECTOR":
      return {
        ...state,
        connectors: state.connectors.filter(
          (c) => c.id !== action.payload.id
        ),
      };

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
        const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } = computeWaypoints(
          source, target, state.elements,
          updated.sourceSide, updated.targetSide, updated.routingType,
          updated.sourceOffsetAlong ?? 0.5, updated.targetOffsetAlong ?? 0.5,
        );
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

    default:
      return state;
  }
}

export function useDiagram(initialData: DiagramData) {
  const [data, dispatch] = useReducer(reducer, initialData);

  const addElement = useCallback(
    (symbolType: SymbolType, position: Point, taskType?: BpmnTaskType, eventType?: EventType) => {
      dispatch({ type: "ADD_ELEMENT", payload: { symbolType, position, taskType, eventType } });
    },
    []
  );

  const moveElement = useCallback((id: string, x: number, y: number) => {
    dispatch({ type: "MOVE_ELEMENT", payload: { id, x, y } });
  }, []);

  const resizeElement = useCallback((id: string, width: number, height: number) => {
    dispatch({ type: "RESIZE_ELEMENT", payload: { id, width, height } });
  }, []);

  const updateLabel = useCallback((id: string, label: string) => {
    dispatch({ type: "UPDATE_LABEL", payload: { id, label } });
  }, []);

  const updateProperties = useCallback(
    (id: string, properties: Record<string, unknown>) => {
      dispatch({ type: "UPDATE_PROPERTIES", payload: { id, properties } });
    },
    []
  );

  const deleteElement = useCallback((id: string) => {
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
      dispatch({
        type: "ADD_CONNECTOR",
        payload: { sourceId, targetId, connectorType, directionType, routingType, sourceSide, targetSide },
      });
    },
    []
  );

  const deleteConnector = useCallback((id: string) => {
    dispatch({ type: "DELETE_CONNECTOR", payload: { id } });
  }, []);

  const updateConnectorDirection = useCallback(
    (id: string, directionType: DirectionType) => {
      dispatch({ type: "UPDATE_CONNECTOR", payload: { id, directionType } });
    },
    []
  );

  const updateConnectorEndpoint = useCallback(
    (connectorId: string, endpoint: "source" | "target", newElementId: string, newSide: Side, newOffsetAlong?: number) => {
      dispatch({ type: "UPDATE_CONNECTOR_ENDPOINT", payload: { connectorId, endpoint, newElementId, newSide, newOffsetAlong } });
    },
    []
  );

  const updateConnectorWaypoints = useCallback((id: string, waypoints: Point[]) => {
    dispatch({ type: "UPDATE_CONNECTOR_WAYPOINTS", payload: { id, waypoints } });
  }, []);

  const updateConnectorLabel = useCallback(
    (id: string, label?: string, labelOffsetX?: number, labelOffsetY?: number, labelWidth?: number) => {
      dispatch({ type: "UPDATE_CONNECTOR_LABEL", payload: { id, label, labelOffsetX, labelOffsetY, labelWidth } });
    }, []
  );

  const elementMoveEnd = useCallback((id: string) => {
    dispatch({ type: "MOVE_END", payload: { id } });
  }, []);

  const splitConnector = useCallback((
    symbolType: SymbolType,
    position: Point,
    connectorId: string,
    taskType?: BpmnTaskType,
    eventType?: EventType,
  ) => {
    dispatch({ type: "SPLIT_CONNECTOR", payload: { symbolType, position, connectorId, taskType, eventType } });
  }, []);

  const setData = useCallback((newData: DiagramData) => {
    dispatch({ type: "SET_DATA", payload: newData });
  }, []);

  const setViewport = useCallback((x: number, y: number, zoom: number) => {
    dispatch({ type: "SET_VIEWPORT", payload: { x, y, zoom } });
  }, []);

  const correctAllConnectors = useCallback(() => {
    dispatch({ type: "CORRECT_ALL_CONNECTORS" });
  }, []);

  return {
    data,
    addElement,
    moveElement,
    resizeElement,
    updateLabel,
    updateProperties,
    deleteElement,
    addConnector,
    deleteConnector,
    updateConnectorDirection,
    updateConnectorEndpoint,
    updateConnectorWaypoints,
    updateConnectorLabel,
    elementMoveEnd,
    splitConnector,
    setData,
    setViewport,
    correctAllConnectors,
  };
}

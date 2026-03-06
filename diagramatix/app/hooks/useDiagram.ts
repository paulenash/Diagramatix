"use client";

import { useCallback, useReducer } from "react";
import type {
  BpmnTaskType,
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
import { computeWaypoints, recomputeAllConnectors } from "@/app/lib/diagram/routing";
import { getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";

type Action =
  | { type: "SET_DATA"; payload: DiagramData }
  | { type: "ADD_ELEMENT"; payload: { symbolType: SymbolType; position: Point; taskType?: BpmnTaskType } }
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
    }}
  | { type: "UPDATE_CONNECTOR"; payload: { id: string; directionType: DirectionType } }
  | { type: "UPDATE_CONNECTOR_WAYPOINTS"; payload: { id: string; waypoints: Point[] } }
  | { type: "SET_VIEWPORT"; payload: { x: number; y: number; zoom: number } };

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
        taskType: action.payload.taskType,
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

    case "UPDATE_PROPERTIES":
      return {
        ...state,
        elements: state.elements.map((el) =>
          el.id === action.payload.id
            ? { ...el, properties: { ...el.properties, ...action.payload.properties } }
            : el
        ),
      };

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
      const { connectorId, endpoint, newElementId, newSide } = action.payload;
      const connectors = state.connectors.map((conn) => {
        if (conn.id !== connectorId) return conn;
        const updated = endpoint === "source"
          ? { ...conn, sourceId: newElementId, sourceSide: newSide }
          : { ...conn, targetId: newElementId, targetSide: newSide };
        const source = state.elements.find((el) => el.id === updated.sourceId);
        const target = state.elements.find((el) => el.id === updated.targetId);
        if (!source || !target) return conn;
        const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } = computeWaypoints(
          source, target, state.elements, updated.sourceSide, updated.targetSide, updated.routingType
        );
        return { ...updated, waypoints, sourceInvisibleLeader, targetInvisibleLeader };
      });
      return { ...state, connectors };
    }

    case "UPDATE_CONNECTOR_WAYPOINTS":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.payload.id ? { ...c, waypoints: action.payload.waypoints } : c
        ),
      };

    case "SET_VIEWPORT":
      return {
        ...state,
        viewport: action.payload,
      };

    default:
      return state;
  }
}

export function useDiagram(initialData: DiagramData) {
  const [data, dispatch] = useReducer(reducer, initialData);

  const addElement = useCallback(
    (symbolType: SymbolType, position: Point, taskType?: BpmnTaskType) => {
      dispatch({ type: "ADD_ELEMENT", payload: { symbolType, position, taskType } });
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
    (connectorId: string, endpoint: "source" | "target", newElementId: string, newSide: Side) => {
      dispatch({ type: "UPDATE_CONNECTOR_ENDPOINT", payload: { connectorId, endpoint, newElementId, newSide } });
    },
    []
  );

  const updateConnectorWaypoints = useCallback((id: string, waypoints: Point[]) => {
    dispatch({ type: "UPDATE_CONNECTOR_WAYPOINTS", payload: { id, waypoints } });
  }, []);

  const setData = useCallback((newData: DiagramData) => {
    dispatch({ type: "SET_DATA", payload: newData });
  }, []);

  const setViewport = useCallback((x: number, y: number, zoom: number) => {
    dispatch({ type: "SET_VIEWPORT", payload: { x, y, zoom } });
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
    setData,
    setViewport,
  };
}

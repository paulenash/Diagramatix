"use client";

import { useCallback, useReducer } from "react";
import type {
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
  | { type: "ADD_ELEMENT"; payload: { symbolType: SymbolType; position: Point } }
  | { type: "MOVE_ELEMENT"; payload: { id: string; x: number; y: number } }
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
  | { type: "SET_VIEWPORT"; payload: { x: number; y: number; zoom: number } };

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function reducer(state: DiagramData, action: Action): DiagramData {
  switch (action.type) {
    case "SET_DATA":
      return action.payload;

    case "ADD_ELEMENT": {
      const def = getSymbolDefinition(action.payload.symbolType);
      let label = def.label;
      if (action.payload.symbolType === "use-case") {
        const count = state.elements.filter((e) => e.type === "use-case").length;
        label = `Process ${count + 1}`;
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
      };
      return { ...state, elements: [...state.elements, newEl] };
    }

    case "MOVE_ELEMENT": {
      const elements = state.elements.map((el) =>
        el.id === action.payload.id
          ? { ...el, x: action.payload.x, y: action.payload.y }
          : el
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
      const elements = state.elements.filter(
        (el) => el.id !== action.payload.id
      );
      const connectors = state.connectors.filter(
        (c) =>
          c.sourceId !== action.payload.id &&
          c.targetId !== action.payload.id
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
    (symbolType: SymbolType, position: Point) => {
      dispatch({ type: "ADD_ELEMENT", payload: { symbolType, position } });
    },
    []
  );

  const moveElement = useCallback((id: string, x: number, y: number) => {
    dispatch({ type: "MOVE_ELEMENT", payload: { id, x, y } });
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
    updateLabel,
    updateProperties,
    deleteElement,
    addConnector,
    deleteConnector,
    setData,
    setViewport,
  };
}

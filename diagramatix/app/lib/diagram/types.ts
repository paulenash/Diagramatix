export type DiagramType = "basic" | "process-context" | "state-machine" | "bpmn";

export type SymbolType =
  | "task"
  | "gateway"
  | "start-event"
  | "end-event"
  | "use-case"
  | "actor"
  | "state"
  | "initial-state"
  | "final-state"
  | "pool"
  | "lane"
  | "subprocess";

export type ConnectorType = "sequence" | "message" | "association";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramElement {
  id: string;
  type: SymbolType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  properties: Record<string, unknown>;
  parentId?: string;
}

export interface Connector {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectorType;
  waypoints: Point[];
  label?: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface DiagramData {
  elements: DiagramElement[];
  connectors: Connector[];
  viewport: Viewport;
}

export const EMPTY_DIAGRAM: DiagramData = {
  elements: [],
  connectors: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

export type InteractionMode =
  | "select"
  | "connecting"
  | "panning"
  | "drawing";

export interface CanvasState {
  selectedElementId: string | null;
  selectedConnectorId: string | null;
  mode: InteractionMode;
  connectingFromId: string | null;
  mousePos: Point;
}

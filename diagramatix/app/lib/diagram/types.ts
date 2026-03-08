export type DiagramType = "basic" | "process-context" | "state-machine" | "bpmn";

export type SymbolType =
  | "task"
  | "gateway"
  | "start-event"
  | "intermediate-event"
  | "end-event"
  | "use-case"
  | "actor"
  | "team"
  | "state"
  | "initial-state"
  | "final-state"
  | "pool"
  | "lane"
  | "subprocess"
  | "subprocess-expanded"
  | "system-boundary"
  | "hourglass"
  | "composite-state"
  | "system"
  | "data-object"
  | "data-store";

export type BpmnTaskType =
  | "none"
  | "user"
  | "service"
  | "script"
  | "send"
  | "receive"
  | "manual"
  | "business-rule";

export type GatewayType = "exclusive" | "inclusive" | "parallel" | "event-based";

export type EventType =
  | "none" | "message" | "timer" | "error" | "signal" | "terminate" | "conditional";

export type ConnectorType = "sequence" | "message" | "association" | "interaction" | "associationBPMN" | "messageBPMN";

export type Side = "top" | "right" | "bottom" | "left";

export type DirectionType = "directed" | "non-directed" | "open-directed" | "both";

export type RoutingType = "direct" | "rectilinear" | "curvilinear";

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
  taskType?: BpmnTaskType;
  gatewayType?: GatewayType;
  eventType?: EventType;
}

export interface Connector {
  id: string;
  sourceId: string;
  targetId: string;
  sourceSide: Side;
  targetSide: Side;
  type: ConnectorType;
  directionType: DirectionType;
  routingType: RoutingType;
  sourceInvisibleLeader: boolean;
  targetInvisibleLeader: boolean;
  waypoints: Point[];
  label?: string;
  labelOffsetX?: number;
  labelOffsetY?: number;
  labelWidth?: number;
  sourceOffsetAlong?: number;
  targetOffsetAlong?: number;
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

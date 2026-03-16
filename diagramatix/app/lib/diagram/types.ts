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
  | "system-boundary-body"
  | "hourglass"
  | "composite-state"
  | "composite-state-body"
  | "system"
  | "data-object"
  | "data-store"
  | "group"
  | "text-annotation";

export type BpmnTaskType =
  | "none"
  | "user"
  | "service"
  | "script"
  | "send"
  | "receive"
  | "manual"
  | "business-rule";

export type GatewayType = "none" | "exclusive" | "inclusive" | "parallel" | "event-based";

export type GatewayRole = "decision" | "merge";

export type EventType =
  | "none" | "message" | "timer" | "error" | "signal" | "terminate" | "conditional";

export type RepeatType = "none" | "loop";

export type FlowType = "none" | "catching" | "throwing";

export type ConnectorType = "sequence" | "message" | "association" | "transition" | "associationBPMN" | "messageBPMN";

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
  boundaryHostId?: string;  // if set → event is boundary-mounted on this element's edge
  taskType?: BpmnTaskType;
  gatewayType?: GatewayType;
  eventType?: EventType;
  repeatType?: RepeatType;
  flowType?: FlowType;
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
  cp1RelOffset?: Point;   // cp1 offset from srcEdge — preserved across element moves
  cp2RelOffset?: Point;   // cp2 offset from tgtEdge — preserved across element moves
  labelAnchor?: "midpoint" | "source";  // where the label tethers to; default "midpoint"
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

export interface TemplateData {
  elements: DiagramElement[];
  connectors: Connector[];
}

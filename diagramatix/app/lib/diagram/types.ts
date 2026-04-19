export type DiagramType = "context" | "basic" | "process-context" | "state-machine" | "bpmn" | "domain" | "value-chain";

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
  | "text-annotation"
  | "external-entity"
  | "process-system"
  | "uml-class"
  | "uml-enumeration"
  | "sublane"
  | "fork-join"
  | "submachine"
  | "chevron"
  | "chevron-collapsed"
  | "process-group";

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
  | "none" | "message" | "timer" | "error" | "signal" | "terminate" | "conditional"
  | "escalation" | "cancel" | "compensation" | "link";

export type RepeatType = "none" | "loop" | "mi-sequential" | "mi-parallel";

export type FlowType = "none" | "catching" | "throwing";

export type ConnectorType = "sequence" | "message" | "association" | "transition" | "associationBPMN" | "messageBPMN" | "flow" | "uml-association" | "uml-aggregation" | "uml-composition" | "uml-generalisation";

export type Side = "top" | "right" | "bottom" | "left";

export type DirectionType = "directed" | "non-directed" | "open-directed" | "both";

export type RoutingType = "direct" | "rectilinear" | "curvilinear";

export interface Point {
  x: number;
  y: number;
}

export interface UmlAttribute {
  visibility?: "+" | "-" | "#";
  name: string;
  type?: string;
  multiplicity?: string;
  defaultValue?: string;
  propertyString?: string;
  isDerived?: boolean;
  // Database-specific fields
  notNull?: boolean;        // sets multiplicity to [1] and shows {NOT NULL}
  primaryKey?: boolean;     // shows {PK} constraint
  foreignKey?: boolean;     // shows {FK} constraint
  fkTable?: string;         // referenced table name
  fkColumn?: string;        // referenced column name
}

export interface UmlOperation {
  visibility?: "+" | "-" | "#";
  name: string;
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
  // Formal transition label parts (state-machine only)
  labelMode?: "informal" | "formal";
  transitionEvent?: string;
  transitionGuard?: string;
  transitionActions?: string;
  // UML association end properties
  sourceRole?: string;
  sourceMultiplicity?: string;
  sourcePropertyString?: string;  // e.g. "{ordered}", "{unique}"
  sourceOrdered?: boolean;
  sourceUnique?: boolean;
  sourceVisibility?: string;      // +, -, #
  sourceQualifier?: string;       // e.g. "accountNumber"
  sourceRoleOffset?: Point;       // offset for visibility+role composite label
  sourceMultOffset?: Point;       // offset for multiplicity label
  sourceConstraintOffset?: Point; // offset for {ordered}
  sourceUniqueOffset?: Point;     // offset for {unique}
  targetRole?: string;
  targetMultiplicity?: string;
  targetPropertyString?: string;
  targetOrdered?: boolean;
  targetUnique?: boolean;
  targetVisibility?: string;
  targetQualifier?: string;
  targetRoleOffset?: Point;
  targetMultOffset?: Point;
  targetConstraintOffset?: Point; // offset for {ordered}
  targetUniqueOffset?: Point;     // offset for {unique}
  // UML association name (shown near midpoint)
  associationName?: string;
  readingDirection?: "none" | "to-source" | "to-target";
  associationNameOffset?: Point;
  arrowAtSource?: boolean; // if true, open-directed arrow is shown at source end instead of target
  // Bottleneck indicator (sequence connectors only)
  bottleneck?: boolean;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type DiagramStatus = "draft" | "final" | "production";

export interface DiagramTitle {
  version?: string;
  authors?: string;
  status?: DiagramStatus;
  showTitle?: boolean;
}

export interface DiagramData {
  elements: DiagramElement[];
  connectors: Connector[];
  viewport: Viewport;
  title?: DiagramTitle;
  fontSize?: number; // element names/labels font size in px (default 12)
  connectorFontSize?: number; // connector labels font size in px (default 10)
  titleFontSize?: number; // diagram title font size in px (default 14)
  database?: string; // domain diagram database type: "none" | "postgres" (default "none")
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

/** Export schema version — bump when the export data structure changes.
 *  Major bump = breaking (fields removed/renamed). Minor bump = additive (new optional fields).
 *  History:
 *    1.2 — initial XSD release
 *    1.3 — added RepeatType values "mi-sequential" / "mi-parallel"; documented
 *          GatewayRoleEnum, SubprocessTypeEnum, PoolTypeEnum and the
 *          element.properties keys (adHoc, labelOffsetX/Y, labelWidth,
 *          multiplicity, role, state, linkedDiagramId).
 *    1.4 — added SymbolType values "fork-join" / "submachine" for state
 *          machine diagrams; linkedDiagramId now also used by submachine.
 *    1.5 — added DiagramType "value-chain"; SymbolType values "chevron",
 *          "chevron-collapsed", "process-group"; new properties fillColor,
 *          description, showDescription for chevrons.
 *    1.6 — value chain display labels renamed: Chevron→Process,
 *          Collapsed→Collapsed Process, Process Group→Value Chain.
 *          Process Context diagrams: zigzag layout, process numbering
 *          (P-XX-NN), hourglass auto-scheduler with open-directed connectors,
 *          system/team/hourglass actor type auto-detection.
 *          AI prompts: diagramType field, dictation support.
 *          Process ↔ Collapsed Process conversion.
 *          Theme auto-reapply on snap/delete, auto-tint value chain containers.
 *    1.7 — BPMN: Event Type conversion dropdown, Trigger rename,
 *          palette reorder, pool/lane headers 50% wider (45/36px),
 *          pool height accommodates vertical name text,
 *          sequence connector rules (S1-S8), Event Expanded Subprocess
 *          isolation, force-connect override (Shift+Ctrl+Click),
 *          target highlighting synced with validation,
 *          message connector task type auto-set (Send/Receive/User),
 *          nested expanded subprocess shade lightening.
 *          AI: document attachment, speech dictation.
 *          UI: zoom slider, PDF title export, select-all on focus,
 *          no inline edit for events/data elements, Import/Export menu rename.
 * v1.8:    BPMN: pool.properties.isSystem now first-class (set by AI Plan;
 *          falls back to label regex). Two-phase AI Plan workflow for BPMN
 *          (Plan + Apply Layout endpoints, 4-tab structural editor, plan
 *          JSON persisted alongside saved Prompts via Prompt.planJson).
 *          Pool behaviour: message connectors blocked on white-box pools;
 *          orphan messages to white-box pools highlighted red; deleting
 *          a lane shrinks the pool height; right-edge resize grip appears
 *          only during an active drag. Click model: white-box pool header
 *          and lane header are the only selection hit zones (bodies bubble).
 */
export const SCHEMA_VERSION = "1.8";

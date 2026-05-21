export type DiagramType = "context" | "basic" | "process-context" | "state-machine" | "bpmn" | "domain" | "value-chain" | "archimate";

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
  | "process-group"
  | "archimate-shape";

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

export type ArchimateConnectorType =
  // Structural
  | "archi-composition"
  | "archi-aggregation"
  | "archi-assignment"
  | "archi-realisation"
  // Dependency
  | "archi-serving"
  | "archi-access"
  | "archi-influence"
  | "archi-association"
  // Dynamic
  | "archi-triggering"
  | "archi-flow"
  // Other
  | "archi-specialisation";

export type ConnectorType =
  | "sequence" | "message" | "association" | "transition"
  | "associationBPMN" | "messageBPMN" | "flow"
  | "uml-association" | "uml-aggregation" | "uml-composition" | "uml-generalisation"
  | ArchimateConnectorType;

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
  poolFontSize?: number; // pool header labels font size in px (default 12)
  laneFontSize?: number; // lane header labels font size in px (default 12)
  database?: string; // domain diagram database type: "none" | "postgres" (default "none")
  /** Diagram-level list of all parent diagrams that currently link TO
   *  this diagram (managed by the project-wide "Scan Diagrams for Links"
   *  feature). A diagram can be linked from many parents — every one of
   *  them is listed. The PropertiesPanel renders each entry as a
   *  clickable link. Highlighting of the "most recently visited" parent
   *  comes from session-stack state, not this field. */
  parentDiagramIds?: string[];
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
 * v1.9:    Additive XSD catch-up — DiagramType "archimate", SymbolType
 *          "archimate-shape", ConnectorType "archi-*" (11 ArchiMate
 *          relationships); DiagramData attributes "poolFontSize",
 *          "laneFontSize", "database". No breaking changes.
 *          Behaviour changes (no schema impact, documented for
 *          completeness):
 *            - Auto-connect 3-state toggle: on / to-only / off.
 *              Persisted in localStorage as "diagramatix.autoConnect".
 *              "to-only" suppresses the new→existing leg; "off" disables
 *              auto-connect entirely (gateway-merge group connect still
 *              runs).
 *            - Auto-connect rejects ANY cross-pool candidate (regardless
 *              of pool subtype) and ANY edge-mounted boundary event as
 *              source or target.
 *            - Insert / Remove Space: Ctrl+click drops a green INSERT
 *              marker; a second Ctrl+click switches to two-marker
 *              REMOVE mode (red strips). Enter opens a confirmation
 *              dialog with three checkbox sections (fully-inside /
 *              partial-ignored / partial-affected). Direction-aware
 *              shift on removal — the lighter side moves.
 *            - EP isolation: EPs cross lane / sublane / pool
 *              boundaries freely on move; EP resize pushes only
 *              elements within the EP's innermost lane / sublane /
 *              pool / outer-EP scope and never grows ancestor
 *              containers; render order paints EPs above lane / pool
 *              backgrounds so they're visible and selectable.
 *            - Sublanes are first-class parents. Drag-drop into a
 *              sublane region sets element.parentId to the sublane;
 *              the Properties panel surfaces the new parent.
 *            - Lane / sublane divider drag REDISTRIBUTES height
 *              between the two adjacent lanes (above grows, below
 *              shrinks) — the parent lane / pool keeps its size,
 *              preserving "sublanes fill their lane, lanes fill
 *              their pool".
 *            - Connector self-avoidance: newly created and rerouted
 *              sequence connectors validate against source / target
 *              body interior and pick a safe side pair if the path
 *              would clip through.
 *            - Boundary-event side picking: connectors to / from an
 *              edge-mounted event use the OUTER face when the other
 *              endpoint sits outside the host EP, the INNER face
 *              when inside; never the perpendicular sides.
 * v1.10:   Round-trip fix release — the XML exporter / importer now
 *          actually emits and parses the v1.9 fields that the XSD
 *          declared but the serialiser dropped:
 *            - <dgx:data> attributes: poolFontSize, laneFontSize,
 *              database.
 *            - <dgx:connector> attribute: bottleneck (sequence
 *              connector "stage" marker — already in types.ts and
 *              ddlGenerate.ts but silently lost on XML round-trip
 *              before this release).
 *          No new data fields and no XSD shape change — purely a
 *          serialisation completeness bump so round-trip is faithful.
 *          Behaviour changes since v1.9 (no schema impact, documented
 *          for completeness):
 *            - Task / Sub-Process Name terminology + autosize:
 *              in-element label renamed "Name" (was "Label") for
 *              task / subprocess / subprocess-expanded in the
 *              Properties Panel and help docs. Live text-driven
 *              autosize for task and collapsed sub-process — the
 *              element scales aspect-locked to its type's default
 *              size as the user types; default size is the floor.
 *              Task-type marker reserves horizontal space on line 1
 *              only when the centred text block crosses the marker
 *              zone; the marker no longer reserves vertical space.
 *              Sub-Process bottom marker always reserved.
 *            - Pool / Lane edits never auto-shrink. Manual size and
 *              the user's chosen header strip width are preserved
 *              across label edits; only grow when the new label
 *              demands more room.
 *            - Pool labels auto-wrap on import to fit pool height
 *              (replicates Visio's visual wrap). poolHeaderWidth
 *              widens proportionally to the line count.
 *            - Visio Bulk Import: multi-page selection, optional
 *              new-project creation, dashboard System-menu entry,
 *              per-project folder placement. Importer now stamps
 *              originalFolderId / originalFolderName onto archived
 *              diagrams so the Deleted Diagrams view groups by
 *              user → project → folder.
 *            - Visio import — sequence and association connectors
 *              never resolve to a Pool / Lane endpoint (neither
 *              via resolveGlueId nor via the geometric fallback);
 *              widened EPS for sequence / association free ends so
 *              "very near a Task" snaps to that Task instead of
 *              falling through to the surrounding Pool.
 *            - Right-click on a Task / Gateway / Sub-Process / EP /
 *              Data Object / Event surfaces a type-picker menu
 *              instead of the canvas shape palette.
 *            - Project ▾ menu: Configuration / Scan Diagrams for
 *              Issues. Scan checks: sequence/association on
 *              Pool/Lane, duplicate Pool/Lane names (whitespace-
 *              insensitive), single-lane Pools, hanging messages
 *              (red on canvas) split into Errors vs Warnings, with
 *              per-type "ignore" filter persisted in sessionStorage
 *              for the Scan-Fix-Rescan cycle.
 *            - Deleted Diagrams view rewritten: user → project →
 *              folder hierarchy with per-level Delete All; Restore
 *              and permanent Delete on one row per diagram; all
 *              destructive actions go through ConfirmDialog.
 *            - Project delete cascade-archive option (`?cascade=
 *              archive`) — server archives every diagram before
 *              dropping the project row.
 *            - Nav-tree per-project sort: Manual (drag-and-drop),
 *              Name asc/desc, Modified asc/desc. Stored in
 *              localStorage per project.
 * v1.11:   Template groups — `DiagramTemplate.group` (nullable string)
 *          clusters templates under a named, collapsible header in the
 *          editor's Templates dropdown. User templates and built-in
 *          templates are independent group namespaces. Per-user
 *          collapse state stored in `User.templateGroupPrefs` (Json).
 *          Backup payload + `.diag_tems` export carry the group field
 *          and round-trip cleanly. The project-export XSD does not
 *          carry templates, so no XSD shape change — `schemaVersion`
 *          attribute still bumps to 1.11 so importers can detect the
 *          new feature window. Pre-1.11 backups omit `group`; restore
 *          treats absent as ungrouped (null).
 * v1.12:   Subscriptions — new SubscriptionLevel + UsageCounter models
 *          and two new User fields (subscriptionLevelId,
 *          subscriptionAssignedAt). Diagram export payload is unchanged
 *          (subscriptions are user-level metadata, never embedded in
 *          a diagram or project export), so no XSD shape change. The
 *          schemaVersion attribute bumps to 1.12 so importers and the
 *          User Guide reflect the new feature window. Pre-1.12 backups
 *          have no subscription state to restore.
 */
export const SCHEMA_VERSION = "1.12";

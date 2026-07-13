export type DiagramType = "context" | "basic" | "process-context" | "state-machine" | "bpmn" | "domain" | "value-chain" | "archimate" | "flowchart";

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
  | "uml-package"
  | "uml-note"
  | "uml-pain-point"
  | "sublane"
  | "fork-join"
  | "submachine"
  | "chevron"
  | "chevron-collapsed"
  | "process-group"
  | "archimate-shape"
  | "review-comment"
  // Standard Flowchart (monochrome ISO symbols)
  | "flowchart-terminator"
  | "flowchart-process"
  | "flowchart-decision"
  | "flowchart-io"
  | "flowchart-document"
  | "flowchart-multidoc"
  | "flowchart-predefined"
  | "flowchart-preparation"
  | "flowchart-manual-input"
  | "flowchart-manual-op"
  | "flowchart-display"
  | "flowchart-delay"
  | "flowchart-database"
  | "flowchart-onpage"
  | "flowchart-offpage"
  | "flowchart-merge"
  | "flowchart-parallel"
  | "flowchart-comment"
  | "flowchart-vswimlane";

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
  | "associationBPMN" | "messageBPMN" | "flow" | "flowline" | "flowchart-association"
  | "uml-association" | "uml-aggregation" | "uml-composition" | "uml-generalisation"
  | "uml-dependency" | "uml-realisation"
  | "review-comment-link"
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
  // Mining (discovered state machine): how many cases took this transition
  // (green count badge); illegal vs the conformance reference (red badge). The
  // badge is movable — its offset from the connector midpoint is kept here.
  transitionCount?: number;
  transitionIllegal?: boolean;
  transitionCountOffset?: Point;
  // OCEL object model: other object types a transition's activity also touches
  // (a small "⇄ Item" synchronisation note on a per-type state machine).
  transitionTouches?: string[];
  // OCEL Domain Diagram associations: interaction weight → line thickness
  // (stroke-width px, already scaled) and a dashed behavioural-interaction edge
  // (types that synchronise via shared events but have no declared O2O relationship).
  weight?: number;
  dashed?: boolean;
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
  // ── Simulation (schema 1.24) ──────────────────────────────────────────
  // For an outgoing edge of a decision gateway: the branch probability
  // (0..100, BPSim Probability) OR a routing condition expression (BPSim
  // Condition, e.g. "getProperty('noOfIssues') > 0"). A gateway edge uses one
  // or the other; an edge may be marked the default/else branch.
  branchProbability?: number;
  branchCondition?: string;
  isDefaultFlow?: boolean;
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
  fontSize?: number; // element names/labels font size in px (default 12; Context Diagram entities default 14)
  connectorFontSize?: number; // connector labels font size in px (default 10; Context Diagram flow labels default 12)
  titleFontSize?: number; // diagram title font size in px (default 14)
  poolFontSize?: number; // pool header labels font size in px (default 16)
  laneFontSize?: number; // lane header labels font size in px (default 14)
  processFontSize?: number; // process-system label font size — Context Diagram only (default 16)
  valueChainFontSize?: number; // Value Chain element (process-group) name font size — Value Chain only (default 16)
  descriptionFontSize?: number; // Process description box font size — Value Chain only (default 14)
  database?: string; // domain diagram database type: "none" | "postgres" (default "none")
  /** BPMN "free-form / imported layout" mode. When true this diagram was
   *  imported from another vendor (typically an image) and must be shown
   *  exactly as drawn: pools may be any size / side-by-side (not stacked
   *  full-width), and message flows may be rectilinear between non-aligned
   *  elements. It relaxes the geometry validation rules and disables the
   *  editor's pool-stacking + message-vertical enforcement. Set automatically
   *  when the AI reproduces an imported image's positions; also toggleable in
   *  Diagram Properties. Optional — absent/false means normal Diagramatix rules. */
  relaxedLayout?: boolean;
  /** Diagram-level list of all parent diagrams that currently link TO
   *  this diagram (managed by the project-wide "Scan Diagrams for Links"
   *  feature). A diagram can be linked from many parents — every one of
   *  them is listed. The PropertiesPanel renders each entry as a
   *  clickable link. Highlighting of the "most recently visited" parent
   *  comes from session-stack state, not this field. */
  parentDiagramIds?: string[];
  /** Per-diagram process owner — shown in the Diagram Properties panel
   *  alongside Title / Authors. Both fields optional and free-text. */
  processOwner?: ProcessOwner;
  /** APQC PCF classification for this diagram — which standard process this
   *  model represents. Keyed on the stable `pcfId` so it survives PCF version
   *  bumps; `nodeId`/`hierarchyId`/`name`/`variant` are cached for display. */
  pcf?: PcfClassification;
  /** The "primary procedure document" — the written SOP that accompanies this
   *  process. Set in Diagram Properties (a URL + display name; can be filled
   *  from the SharePoint picker). Rides autosave + is snapshotted at publish;
   *  denormalised to Diagram.procedureDoc* columns for the Portal. */
  procedureDoc?: ProcedureDoc;
  /** AI-generated feedback for this diagram — the "open questions" the AI
   *  raised while building it (e.g. from a recorded meeting / transcript via
   *  the AI-tidy pass). Preserved so the user can revisit and answer them
   *  later; answering them feeds a clarification round back into generation. */
  aiFeedback?: AiFeedback;
}

export interface ProcessOwner {
  name?: string;
  email?: string;
}

/** The written procedure/SOP linked to a process (Portal governance). */
export interface ProcedureDoc {
  url: string;
  name?: string;
}

/** APQC PCF classification reference on a diagram (cached from the catalog). */
export interface PcfClassification {
  nodeId: string;
  pcfId: number;
  hierarchyId: string;
  name: string;
  frameworkId: string;
  variant: string;
  // Extra attributes captured when a diagram is generated from APQC (optional
  // so existing classifications stay valid). See the Create APQC Process flow.
  frameworkName?: string;
  version?: string;
  level?: number;
  numbered?: boolean;      // labels were prefixed with APQC codes
  generated?: "decompose" | "ai"; // how the diagram was produced
}

/** A persisted set of AI clarification questions + the user's answers. */
export interface AiFeedback {
  /** Each open question the AI raised, with the user's answer (if given). */
  questions: { q: string; a?: string }[];
  /** ISO timestamp of when the feedback was generated. */
  createdAt: string;
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
 *  ON BUMP: also add the entry to public/diagramatix-export.xsd's history block AND to
 *  /Version History.md (the human-readable changelog). Keep all three in sync.
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
 * v1.13:   Subscriptions Phase 2 foundation — Stripe-payment wiring.
 *          New User columns (stripeCustomerId, stripeSubscriptionId,
 *          stripeSubscriptionStatus, currentPeriodEnd,
 *          subscriptionEndsAt) plus SubscriptionLevel.stripePriceId.
 *          Diagram export payload is unchanged (Stripe identifiers
 *          are user-level metadata, never embedded in a diagram or
 *          project export), so no XSD shape change. Also released
 *          alongside: Visio v1.6 stencil + template (fresh BaseID
 *          GUIDs eliminate the v1.4↔v1.5 master collision), focus-
 *          edit zoom for label edits (Dashboard → File → Zoom →
 *          Edit Zoom), and Pool/Lane "Label" → "Name" rename.
 * v1.14:   Bubble Help v2 + Diagram Properties restructure.
 *          - New BubbleHelp Prisma model (admin-editable, per
 *            diagramType bubble-help text/duration); not exported
 *            with diagrams.
 *          - New per-diagram `processOwner` field
 *            ({ name?, email? }) on DiagramData — written into the
 *            diagram's XML export so it round-trips.
 *          - Right-hand panel renamed "Diagram Title" → "Diagram
 *            Properties" with nested sub-sections; admin sub-section
 *            for Bubble Help editor.
 *          - New click-driven bubble triggers: ep-body, start-event,
 *            intermediate-event, end-event (admin fills the text).
 *          - Task drop no longer auto-pops the marker picker;
 *            tasks start markerless and the right-click menu sets
 *            the type.
 * v1.15:   Collaboration & Review (Phases 1–3). Two additive enum
 *          values reach the diagram-export shape:
 *          - SymbolType "review-comment" — a reviewer's pink note,
 *            stored like any element; carries free-form properties
 *            reviewId / reviewerId / reviewerName / reviewerEmail.
 *          - ConnectorType "review-comment-link" — the pink link from
 *            a note to the element it concerns.
 *          Everything else in the feature (CollaborationGroup,
 *          DiagramReview / DiagramReviewer, Notification rows) is
 *          relational metadata and is never embedded in a diagram or
 *          project export, so the only XSD change is the two new enum
 *          members. Pre-1.15 exports simply contain neither.
 * v1.16:   BPMN right-click picker + small editor polish. No schema
 *          shape change — both `gatewayType` and `properties.gatewayRole`
 *          already existed (GatewayTypeEnum / GatewayRoleEnum). Bump is
 *          for the behavioural changes:
 *          - The gateway right-click "type-picker" now shows TWO sections:
 *            Gateway Type (None / Exclusive / Inclusive / Parallel /
 *            Event-based) and Role (Decision / Merge). Arrow keys
 *            navigate across both sections, skipping the headers.
 *          - The intermediate-event right-click Trigger list no longer
 *            offers "Terminate" — BPMN reserves the terminate trigger
 *            for end events only.
 *          - Intermediate events get a second right-click section,
 *            Flow Type (None / Catching / Throwing), writing to the
 *            existing top-level element.flowType field.
 *          - Properties panel label "Element" renamed to "Gateway Type"
 *            for clarity (matches the right-click section heading).
 *          - Four new diagram-check rules in the shared registry:
 *              * activity-no-incoming (error) — every Task / Sub-Process
 *                / Expanded Sub-Process must have an incoming sequence
 *                connector. Event sub-processes and process-scope
 *                expanded subs (those containing their own Start event)
 *                are exempt.
 *              * activity-no-outgoing (error) — same, for outgoing.
 *              * connector-bends (warning) — flags sequence connectors
 *                with 4 or more direction changes. Flagged connectors
 *                get an orange stroke overlay on the canvas during
 *                Review Mode (new scanHighlightConnectorById prop on
 *                Canvas).
 *              * task-type-for-messages (warning) — Task/Sub-Process
 *                with a message TO a non-IT external pool should be
 *                Send; FROM a non-IT pool should be Receive; TO/FROM
 *                an IT system pool should be User.
 *          - Sub-process right-click picker gets a second section,
 *            "Repeat" (None / Loop / MI Sequential / MI Parallel),
 *            writing to the existing top-level element.repeatType
 *            field. Applies to both subprocess and subprocess-expanded.
 *          - Two ad-hoc-aware diagram-check rules + matching changes
 *            to activity-no-in/out:
 *              * adhoc-ep-no-start-end (error) — Expanded Sub-Process
 *                marked Ad-Hoc must not contain or boundary-mount
 *                Start/End events.
 *              * adhoc-ep-no-sequence-between-children (error) —
 *                Ad-Hoc EP must not have sequence connectors between
 *                its child activities.
 *              * activity-no-incoming / activity-no-outgoing are now
 *                EP-aware: activities inside an ad-hoc EP are never
 *                flagged; inside a non-ad-hoc EP one orphan per EP is
 *                allowed (the entry/exit activity), 2+ orphans become
 *                errors. Top-level activities keep the strict rule.
 *          - Scan-highlight connector overlay no longer draws through
 *            the centre of the source/target elements — the invisible-
 *            leader endpoints at element centres are sliced off before
 *            drawing the orange/red polyline.
 *          - Two new data-artefact rules (warnings): Data Object and
 *            Data Store with no association connector flag a warning
 *            so the modeller wires it up or removes it.
 *
 *    1.17 — Independent Context-Diagram "Process Names" font size + a
 *           large behaviour batch. ONE shape change: a new optional
 *           attribute `processFontSize` on `<dgx:data>` (default 16
 *           when omitted). Sets the central process-system's label
 *           size independently from entity labels / connector labels.
 *           Pre-1.17 exports omit the attribute; importers fall back
 *           to the 16-px default.
 *
 *           Behaviour-only changes worth noting alongside the bump:
 *
 *           Context Diagram (AI Generate):
 *           - C3.* rules code-enforced in layoutContextDiagram: process
 *             circle radius capped at +15 % growth, entity-side
 *             attachment points spread across the primary inward face
 *             until K>8, process-side cluster spacing ≥ 20 px arc, no
 *             entity→entity targets, ellipse selection ring on
 *             circular shapes, endpoint nudge supports continuous
 *             travel around corners and circles.
 *           - Upper-left-quadrant entity attachment pile-up fixed by
 *             wrapping procAngle to (-π, π] before the side check.
 *           - Per-Context font controls in the diagram config:
 *             Entity Names (default 14), Process Names (default 16,
 *             via processFontSize above), Flow Labels (default 12).
 *           - Properties label header reads "Name" for entities and
 *             processes; "Label" stays for flow connectors.
 *
 *           Process Context (AI Generate):
 *           - layoutProcessContext drops association connectors
 *             between two use-case (process) elements (P2.09), spaces
 *             actors / teams / systems / hourglasses by 30 px + label
 *             allowance (P2.08), grows each use-case ellipse to fit
 *             its wrapped label while preserving the default aspect
 *             ratio (P2.11), and centres each side's actor group on
 *             the boundary's vertical midpoint (P2.10).
 *           - Hardcoded "P-XX-NN" numbering prompt instruction
 *             removed.
 *
 *           BPMN scanner rules + AI prompt:
 *           - Codes B01..B31 assigned. Flat rules viewer at
 *             /dashboard/admin/scanner-rules.
 *           - B14 rewritten as a per-Task trigger matrix keyed on
 *             message direction × pool kind (external entity vs
 *             IT-system); errors flag forbidden triggers and warnings
 *             recommend the default. B28 absorbed into B14.
 *           - B19 (boundary intermediate event incoming) narrowed to
 *             INCOMING flow only.
 *           - B22 loop-back-routing removed.
 *           - B23..B27 added (boundary start / intermediate routing).
 *           - B28 task-bothmsg-not-send-receive folded into B14.
 *           - B29 sequence-clips-own-endpoint + B30
 *             sequence-clips-foreign-node (visible-path interior
 *             checks; circle/diamond shapes exempted).
 *           - B31 manual-task-no-it-system-message added.
 *           - Plan prompt teaches the matrix + Manual-IT prohibition.
 *
 *           BPMN AI Generate:
 *           - Image attachments accepted (PNG / JPEG / WebP / GIF).
 *             Sonnet vision reverse-engineers BPMN structure or
 *             translates a flowchart into BPMN. Two-phase plan-then-
 *             apply-layout pipeline lets the user edit the plan JSON
 *             before committing.
 *           - bpmnLayout messageBPMN emission now writes 4 waypoints
 *             (centre, srcEdge, tgtEdge, centre) + invisible-leader
 *             flags true so AI-generated message flows are draggable
 *             out of the box.
 *
 *           UI / admin:
 *           - "Create Prompt from Diagram" red admin block on every
 *             AI-Generate panel (BPMN PlanPanel + non-BPMN AiPanel):
 *             Technical Description (deterministic walker) +
 *             Staff Narrative (Sonnet rewrite under an editable
 *             briefing stored as DiagramRules category
 *             "staff-narrative").
 *           - AI Plan Formats viewer now covers every diagram type
 *             via a type selector. Per-diagram-type "AI Rules &
 *             Preferences — <Type>" admin link in the Diagram menu
 *             opens /dashboard/rules?category=<slug> scoped to that
 *             diagram type. Sidebar hides in scoped mode.
 *           - Admin link moved from the System / File menu to the
 *             leftmost menu item on Dashboard / Project / Diagram.
 *           - Matrix screensaver toggle moved to the bottom-left.
 *           - messageBPMN body drag: select a message flow and grab
 *             anywhere on the highlighted line to slide it
 *             horizontally; the blue midpoint handle is removed.
 *           - Connector endpoint nudge wraps around rectangle corners
 *             and travels the full circumference of circles.
 *           - Notification dropdown wider with two visible lines.
 *   1.19    - Audit Stage-2 Critical fixes: (DATA-01) author/attribution
 *             FKs (PublishedVersion/PublicationBundle/…Audience/Pending…)
 *             switched from Restrict to nullable + SetNull so publishing
 *             users can be deleted. (DATA-02) full backup now captures and
 *             restores ALL models (was 11/26) so a wipe-restore no longer
 *             silently deletes publish/bundle/share/review/notification
 *             data. (DATA-03) wipe-restore breaks the Diagram↔
 *             PublishedVersion cycle (insert with null pointer, re-link
 *             after) instead of aborting on the FK.
 *   1.20    - Audit Stage-3 engine fixes: (ENG-01) undo/redo now spread
 *             the live data so title/fonts/database/processOwner/
 *             parentDiagramIds survive instead of being wiped + auto-saved
 *             away. (ENG-02) DELETE_ELEMENT now drops connectors attached
 *             to the deleted host's boundary-event children (no dangling
 *             connectors). (ENG-03) title/font/database setters clear the
 *             stale redo branch so Ctrl+Y can't replay diverged geometry.
 *   1.21    - Diagram-type identity (per-type 2-char codes + pastel colours,
 *             SuperAdmin-editable DiagramTypeStyle table) + colour-coded
 *             dashboard/project tiles + connected-nodes background on all
 *             non-editor screens. Backups: pre-flight preview with stats +
 *             member/Org selection, live per-section streaming progress and
 *             an end report for all five backup/export flows. Restore
 *             hardening: user .diag restore and rules/prompts import are now
 *             transactional (audit DATA-06/22) with natural-key rule upsert
 *             (DATA-23). No change to the diagram XML export shape (XSD
 *             structure unchanged since 1.17 — version bump only).
 *   1.22    - SharePoint file linking: Data Object / Data Store elements may
 *             carry a `properties.sharepointLink` object
 *             { driveId, itemId, name, webUrl } pointing at a SharePoint /
 *             OneDrive file (set via the editor's "Link SharePoint file…"
 *             button; previewed in-app). Round-trips through the existing
 *             flexible PropertiesType — no XSD structure change, documented
 *             there + version bump.
 * 1.24      — BPMN process Simulation: per-element baseline parameters carried
 *             in `element.properties.sim` (arrival/cycle/wait distributions,
 *             team + resource units, token property assignments) and decision
 *             branch routing on the Connector (`branchProbability` /
 *             `branchCondition` / `isDefaultFlow`). All optional + additive;
 *             rides the flexible PropertiesType. Simulation parameters
 *             interchange via BPSim XML (see app/lib/simulation/bpsim/*) — the
 *             core diagram XML/XSD export was unchanged at 1.24; the XSD note +
 *             connector export land at 1.25 (this is that slice).
 * 1.25      — Simulation connector fields now SERIALISED in the diagram XML
 *             export. The decision-branch routing fields (`branchProbability` /
 *             `branchCondition` / `isDefaultFlow`) are emitted as optional
 *             `<dgx:connector>` attributes (previously in-model only, like the
 *             v1.10 `bottleneck` fix). Element simulation parameters keep
 *             riding `element.properties.sim` opaquely (open PropertiesType).
 *             Export-only — no XML importer change. Additive + optional. The
 *             matching DDL-generator columns + User-Guide/Features notes are a
 *             separate follow-up update.
 *
 *  v1.26 (2026-06-25): DiagramData gains optional `aiFeedback` — the AI's open
 *             questions for the diagram (+ the user's answers), preserved for a
 *             clarification round. App-metadata only; lives in the saved JSON,
 *             NOT the BPMN XML interchange, so no BPMN-XSD shape change.
 *
 *  v1.27 (2026-06-27): DB-backed User Guide — in-app SuperAdmin editor (TipTap
 *             WYSIWYG), an image library (screen capture + upload), global voice
 *             dictation, Save & View, Markdown export, SharePoint documents, and
 *             a table-level User Guide backup/restore (content + the whole image
 *             library, ids preserved). All application/admin features — NO diagram
 *             export or BPMN-XSD shape change; the version advances with the
 *             release window (same convention as v1.10 / v1.21).
 *
 *  v1.28 (2026-06-30): BPMN layout-geometry rules — Start/End event placement +
 *             connector length (R8.14/R8.15/R8.18), element de-overlap (R8.17),
 *             event-label nudge (R8.16); new scanner checks B33 (event-label
 *             overlap), B34 (element overlap), B35 (lane tiling); a lane-tiling
 *             re-stack fix and an EP boundary-resize drift fix. Layout / validation
 *             / editor-interaction only — NO diagram export or BPMN-XSD shape
 *             change; the version advances with the release window (as v1.27).
 *
 *  v1.29 (2026-07-01): Simulation results & comparison — true per-case flow-time
 *             distribution (Typical p50 / Near-worst p95 / Spread sd + a
 *             distribution histogram) replacing run-average percentiles; a
 *             grounded AI assessment of an As-is/To-be comparison (deterministic
 *             deltas → Claude prose); a browsable Run History (name/pin runs,
 *             prune unpinned, compare any two saved runs); and As-is/To-be
 *             comparison support carried through the example pipeline (variant
 *             scenarios in captured/adopted examples) with a seeded Aardwolf Loans
 *             comparison. Simulation runtime / results / example-catalog only — NO
 *             diagram export or BPMN-XSD shape change; the version advances with
 *             the release window (as v1.27 / v1.28).
 *
 *  v1.30 (2026-07-02): Simulator resource calendars / working hours (Tier 1) —
 *             a project-level Calendar library (reusable weekly shift patterns:
 *             open windows per weekday with optional per-window arrival-rate
 *             multipliers for time-varying demand). A team is staffed only during
 *             its calendar's open windows (in-service tasks finish at shift end;
 *             new work waits for the next shift); an arrival source only generates
 *             during open windows. A source event may carry `sim.calendarId` in
 *             element.properties.sim — the ONLY diagram-export change (the open
 *             PropertiesType already permits it, as with v1.24). New DB tables
 *             SimulationCalendar + SimulationTeam.calendarId (backup/restore
 *             pick them up automatically). Starter examples back-filled with a
 *             Business-hours (9–5 w/ lunch) calendar on their human teams.
 *
 *  v1.31 (2026-07-03): DiagramatixMINER — Process Mining. Ingest event logs →
 *             discover the implied BPMN + a candidate State-Machine, check state-
 *             change conformance against a reference State-Machine, and calibrate
 *             a simulation "digital twin" from the mined timing/resource data
 *             (cycle times, arrivals, branch probabilities, teams, working hours)
 *             that opens in the Simulator. New runtime table ProcessMiningRun
 *             (compressed variants + stats + performance; backup picks it up
 *             automatically). Discovered diagrams are ordinary bpmn/state-machine
 *             diagrams. Runtime/analytics only — NO diagram-export or BPMN-XSD
 *             shape change; the version advances with the release window.
 *
 *  v1.32 (2026-07-03): DiagramatixMINER Examples — an adoptable process-mining
 *             sample catalog (mirrors Simulator Examples). New runtime table
 *             MiningExample (global catalog; `package` JSON carries a compressed
 *             event log + reference State-Machine diagrams). One-click "Load &
 *             open" adopts a ready ProcessMiningRun + the reference diagrams into
 *             a fresh project; SuperAdmins author more by capturing a run. Ships
 *             the Accounts Payable invoice-lifecycle starter. Runtime only — NO
 *             diagram-export or BPMN-XSD shape change.
 *
 *  v1.33 (2026-07-05): Risk & Control. A step may carry risk/control references
 *             in element.properties.risk ({ riskRefs[], controlRefs[] } — catalog
 *             item id + cached code/label), the ONLY diagram-export change (the
 *             open PropertiesType already permits it, as with v1.24/v1.30). New DB
 *             tables RiskControlLibrary + RiskControlItem + RiskControlLink (an
 *             org master adopted into a project copy, like Entity Lists; scoped
 *             backup carries them). Two structure rules (B38 control-coverage,
 *             B39 segregation-of-duties) + a Risk-Control Matrix .xlsx export.
 *
 *  v1.34 (2026-07-06): DiagramatixMINER standards + Technical Design Notes +
 *             Logical DDL. (1) Miner: event logs may omit the State column (an
 *             Activity→State table completes the lifecycle), events may carry
 *             Control/Risk/Policy IDs (a mined governance aggregate feeds control
 *             operating-effectiveness), and logs import/export as IEEE XES (1849)
 *             and OCEL 2.0/1.0 in addition to CSV — new ProcessMiningRun.governance
 *             JSON column. (2) A SuperAdmin "Technical Design Notes" document
 *             (the User-Guide editor generalised into a Document Editor over a
 *             `collection` discriminator on HelpChapter/HelpSection) with Word
 *             .docx export. (3) The DDL generator is relabelled "Logical DDL
 *             Generation". Runtime/app only — NO diagram-export or XSD shape
 *             change; the version advances with the release window.
 *
 *  v1.35 (2026-07-08): APQC Process Classification Framework (PCF) — full L0–L5.
 *             Diagrams carry an OPTIONAL `DiagramData.pcf` classification
 *             ({ nodeId, pcfId, hierarchyId, name, frameworkId, variant, +opt
 *             frameworkName/version/level/numbered/generated }) and elements may
 *             carry `properties.pcfHierarchyId`/`pcfId` (open PropertiesType). The
 *             ONE XSD shape change: a new OPTIONAL top-level `<pcfAttribution>`
 *             element on the export root, emitted (with the verbatim ©APQC
 *             notice) whenever the export carries PCF-derived content — APQC's
 *             royalty-free licence requires the notice to travel with every copy
 *             and derivative. New runtime tables PcfFramework + PcfNode (global
 *             reference frameworks + org-owned tailored frameworks w/ provenance);
 *             Project gains a `pcf` JSON column. Reference frameworks import from
 *             APQC .xlsx; tailoring/versioning/divisions + coverage + by-category
 *             compliance are runtime/app, not part of the diagram export.
 *
 *  v1.36 (2026-07-10): Primary procedure document. Diagrams carry an OPTIONAL
 *             `DiagramData.procedureDoc` ({ url, name? }) — the written SOP linked
 *             to a process, surfaced read-only in the Process Portal + viewer. The
 *             ONE XSD shape change: a new OPTIONAL `<procedureDoc>` element on
 *             DiagramDataType (ProcedureDocType), mirroring `<processOwner>`.
 *             Runtime-only (NOT part of the diagram export): the Process Portal
 *             (org-wide search/browse of published processes, entity where-used
 *             search by IT-system/team, admin-managed "My Teams" → OrgMemberTeam
 *             table + Diagram denorm columns procedureDoc/pcf/entityRefs) and
 *             the review-due reminder cron. The denorm columns are a query
 *             optimisation derived from `data`, so they are NOT in the export.
 *
 *  v1.37 (2026-07-11): Import competitor BPMN diagrams as-is. Diagrams carry an
 *             OPTIONAL `DiagramData.relaxedLayout` boolean ("free-form / imported
 *             layout"): pools any size/placement (not stacked full-width),
 *             rectilinear message flows between non-aligned elements, and the
 *             pure-geometry validation rules suppressed. The ONE XSD shape change:
 *             a new OPTIONAL boolean `relaxedLayout` attribute on `<dgx:data>`,
 *             emitted only when true. AI image import can reproduce a vendor's
 *             drawn positions + connector attachment/routing (normalised `bounds`
 *             captured by the vision plan, honoured by a preserved-layout engine
 *             path that falls back to auto-stack when the geometry is unusable);
 *             those AiElement/AiConnection `bounds`/`waypoints` are plan-only and
 *             NOT part of the diagram export.
 */
export const SCHEMA_VERSION = "1.37";

"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { nanoid } from "nanoid";
import type {
  ArchimateConnectorType,
  BpmnTaskType,
  Connector,
  ConnectorType,
  DiagramData,
  DiagramElement,
  DiagramType,
  DirectionType,
  EventType,
  Point,
  RoutingType,
  Side,
  SymbolType,
} from "@/app/lib/diagram/types";
import { ArchimateConnectorPicker } from "./ArchimateConnectorPicker";
import { BubbleHelp } from "./BubbleHelp";
import { EntityNameInput } from "./EntityNameInput";
import type { ProjectEntityStructure, EntityNodeLevel, EntityListKind } from "@/app/lib/entityLists/types";
import { SymbolRenderer, SublaneIdsCtx, ProcessGroupDepthCtx, LaneDepthCtx, DatabaseCtx, ArchimateDepthCtx, type ResizeHandle } from "./SymbolRenderer";
import { ElementContextMenu } from "./ElementContextMenu";
import { getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";
import { PaletteSymbolPreview } from "./Palette";
import { CHEVRON_THEMES, chevronReadingOrder } from "@/app/lib/diagram/chevronThemes";
import { DisplayModeCtx, FontScaleCtx, ConnectorFontScaleCtx, TitleFontSizeCtx, PoolFontSizeCtx, LaneFontSizeCtx, ProcessFontSizeCtx, ValueChainFontSizeCtx, DescriptionFontSizeCtx, SketchyFilter } from "@/app/lib/diagram/displayMode";
import { ConnectorRenderer } from "./ConnectorRenderer";
import { findShapeByKey as findArchimateShapeByKey } from "@/app/lib/archimate/catalogue";
import { RemoveSpaceDialog, type RsRef, type RsSelection } from "@/app/components/RemoveSpaceDialog";

const HEADER_H = 28;
const MIN_BOUNDARY_W = 100;
const MIN_BOUNDARY_H = HEADER_H + 40;

const DATA_ELEMENT_TYPES = new Set<SymbolType>(["data-object", "data-store", "text-annotation"]);

// Context-Diagram flow rule: connectors only go entity ↔ process.
// entity → entity or process → process is invalid in a Context Diagram.
// Used to filter drop targets when dragging a new connector from one of the
// two Context-Diagram symbol types so only the complementary type lights up.
function isValidContextFlowPair(sourceType: string, targetType: string): boolean {
  if (sourceType === "external-entity") return targetType === "process-system";
  if (sourceType === "process-system") return targetType === "external-entity";
  return false;
}

function getElementPoolId(el: DiagramElement, elements: DiagramElement[]): string | null {
  if (el.type === "pool") return el.id;
  // Try parentId chain first (fast path)
  if (el.parentId) {
    const parent = elements.find((e) => e.id === el.parentId);
    if (parent?.type === "pool") return parent.id;
    if (parent?.type === "lane") {
      const gp = elements.find((e) => e.id === parent.parentId);
      if (gp?.type === "pool") return gp.id;
    }
  }
  // Fallback: position check — is this element's centre inside any pool?
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const pool = elements.find(
    (p) => p.type === "pool" &&
      cx >= p.x && cx <= p.x + p.width &&
      cy >= p.y && cy <= p.y + p.height
  );
  return pool?.id ?? null;
}

function getContainingPool(el: DiagramElement, elements: DiagramElement[]): DiagramElement | null {
  if (el.type === "pool") return null;
  const poolId = getElementPoolId(el, elements);
  if (!poolId) return null;
  return elements.find((p) => p.id === poolId && p.type === "pool") ?? null;
}

const USE_CASE_DEFAULT_W = 120;
const USE_CASE_DEFAULT_H = 60;
const USE_CASE_ASPECT = USE_CASE_DEFAULT_W / USE_CASE_DEFAULT_H;
const USE_CASE_LINE_H = 16;

function wrapText(text: string, maxWidth: number, fontSize = 12): string[] {
  const avgCharWidth = fontSize * 0.55;
  const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
  const lines: string[] = [];
  for (const segment of text.split('\n')) {
    const words = segment.split(' ');
    let current = '';
    for (const word of words) {
      if (!current) { current = word; }
      else if (current.length + 1 + word.length <= charsPerLine) { current += ' ' + word; }
      else { lines.push(current); current = word; }
    }
    lines.push(current);
  }
  return lines.length ? lines : [''];
}

function computeUseCaseSize(label: string, currentW: number): { w: number; h: number } {
  const innerW = currentW * 0.7;
  const lines = wrapText(label, innerW);
  const neededH = lines.length * USE_CASE_LINE_H + 16;
  const h = Math.max(USE_CASE_DEFAULT_H, Math.round(neededH));
  const w = Math.max(USE_CASE_DEFAULT_W, Math.round(h * USE_CASE_ASPECT));
  return { w, h };
}

/**
 * Aspect-locked decision-diamond sizing. The largest axis-aligned rectangle
 * inscribed in a diamond of (w,h) is (w/2 × h/2), so the label must fit inside
 * that half-size box. Grows the diamond uniformly (keeping the base w:h ratio)
 * until the wrapped label fits the inscribed rect. baseW/baseH default to the
 * Decision symbol's default 120×80.
 */
function computeDecisionSize(label: string, baseW = 120, baseH = 80): { w: number; h: number } {
  const aspect = baseW / baseH;
  const lineH = 14, fontSize = 12;
  let w = baseW;
  for (let i = 0; i < 60; i++) {
    const innerW = w * 0.5;
    const lines = wrapText(label || "", innerW, fontSize);
    const h = w / aspect;
    const textH = lines.length * lineH;
    const maxLineChars = lines.reduce((m, l) => Math.max(m, l.length), 1);
    const maxLineW = maxLineChars * fontSize * 0.55;
    if (textH + 8 <= h * 0.5 && maxLineW <= innerW) break;
    w += 8;
  }
  return { w: Math.round(w), h: Math.round(w / aspect) };
}

const INTERMEDIATE_EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "none",         label: "None" },
  { value: "message",      label: "Message" },
  { value: "timer",        label: "Timer" },
  { value: "error",        label: "Error" },
  { value: "signal",       label: "Signal" },
  { value: "conditional",  label: "Conditional" },
  { value: "escalation",   label: "Escalation" },
  { value: "cancel",       label: "Cancel" },
  { value: "compensation", label: "Compensation" },
  { value: "link",         label: "Link" },
];

const TASK_TYPE_OPTIONS: { value: BpmnTaskType; label: string }[] = [
  { value: "none",          label: "None" },
  { value: "user",          label: "User Task" },
  { value: "service",       label: "Service Task" },
  { value: "script",        label: "Script Task" },
  { value: "send",          label: "Send Task" },
  { value: "receive",       label: "Receive Task" },
  { value: "manual",        label: "Manual Task" },
  { value: "business-rule", label: "Business Rule Task" },
];

interface PendingDrop {
  worldPos: Point;
  containerX: number;
  symbolType: SymbolType;
  containerY: number;
  splitConnectorId?: string;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function findConnectorNearPoint(connectors: Connector[], pos: Point, margin = 15): Connector | null {
  for (const c of connectors) {
    if (c.type !== "sequence" && c.type !== "transition") continue;
    const pts = c.waypoints;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(pos, pts[i], pts[i + 1]) <= margin) return c;
    }
  }
  return null;
}

interface Props {
  data: DiagramData;
  diagramType: DiagramType;
  onAddElement: (
    type: SymbolType,
    position: Point,
    taskType?: BpmnTaskType,
    eventType?: EventType,
    id?: string,
    initial?: { properties?: Record<string, unknown>; width?: number; height?: number; label?: string },
  ) => void;
  onMoveElement: (id: string, x: number, y: number, unconstrained?: boolean) => void;
  onResizeElement: (id: string, x: number, y: number, width: number, height: number) => void;
  onUpdateLabel: (id: string, label: string) => void;
  entityStructure?: ProjectEntityStructure | null;
  onAddEntityNode?: (listId: string, input: { name: string; level: EntityNodeLevel; parentId: string | null }) => Promise<boolean>;
  onBeginLabelEdit?: (id: string) => void;
  onUpdateLabelLive?: (id: string, label: string) => void;
  onCancelLabelEdit?: () => void;
  onDeleteElement: (id: string) => void;
  onAddConnector: (
    sourceId: string,
    targetId: string,
    type: ConnectorType,
    directionType: DirectionType,
    routingType: RoutingType,
    sourceSide: Side,
    targetSide: Side,
    sourceOffsetAlong?: number,
    targetOffsetAlong?: number,
    force?: boolean,
    initialLabel?: string,
  ) => void;
  onDeleteConnector: (id: string) => void;
  onUpdateConnectorEndpoint: (
    connectorId: string,
    endpoint: "source" | "target",
    newElementId: string,
    newSide: Side,
    newOffsetAlong?: number,
  ) => void;
  selectedElementIds: Set<string>;
  selectedConnectorId: string | null;
  /** After the user closes "Scan Diagram for Issues", flagged elements are
   *  tinted on the canvas (red = error, orange = warning) for a short window.
   *  The map is element id → severity; undefined / empty means no tint. */
  scanHighlightById?: Map<string, "error" | "warning">;
  /** Same idea, but for connectors. A flagged connector gets a thicker
   *  semi-transparent stroke painted along its waypoints in the severity
   *  colour. Used by rules like `connector-bends`. */
  scanHighlightConnectorById?: Map<string, "error" | "warning">;
  /** When cycling through issues in Review Mode, only this issue's ids
   *  render at full strength. Everything else in the scan highlights
   *  fades so the user can see where they are without losing the wider
   *  scan context. */
  currentIssueIds?: Set<string>;
  onSetSelectedElements: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  onSelectConnector: (id: string | null) => void;
  onMoveElements?: (ids: string[], dx: number, dy: number) => void;
  onElementsMoveEnd?: () => void;
  pendingDragSymbol: SymbolType | null;
  pendingArchimateShapeKey?: string | null;
  pendingArchimateIconOnly?: boolean;
  /** Bump this number to force a re-fetch of /api/bubble-helps.
   *  Used by the admin Bubble Help editor inside PropertiesPanel
   *  after it saves a new set, so the live cloud picks up changes
   *  without a page reload. */
  bubbleHelpRefreshToken?: number;
  defaultDirectionType: DirectionType;
  defaultRoutingType: RoutingType;
  onUpdateProperties?: (id: string, props: Record<string, unknown>) => void;
  onUpdatePropertiesBatch?: (updates: Array<{ id: string; properties: Record<string, unknown> }>) => void;
  onCollapseEpToSubprocess?: (id: string) => void;
  onUpdateConnectorWaypoints?: (id: string, waypoints: Point[]) => void;
  onUpdateConnectorLabel?: (id: string, label?: string, offsetX?: number, offsetY?: number, width?: number) => void;
  onSplitConnector?: (symbolType: SymbolType, position: Point, connectorId: string, taskType?: BpmnTaskType, eventType?: EventType) => void;
  /** Review Mode: dropping a review-comment calls this with the drop
   *  point + the id of the element under the cursor (or null). The
   *  editor creates the pink note + a review-comment-link to it. */
  onAddReviewComment?: (worldPos: Point, targetElementId: string | null) => void;
  onElementMoveEnd?: (id: string) => void;
  onMoveLaneBoundary?: (aboveLaneId: string, belowLaneId: string, dy: number) => void;
  onResizeElementEnd?: (id: string) => void;
  onLaneBoundaryMoveEnd?: () => void;
  onConnectorWaypointDragEnd?: (id: string) => void;
  onNudgeConnector?: (connectorId: string, dx: number, dy: number) => void;
  onNudgeConnectorEndpoint?: (connectorId: string, endpoint: "source" | "target", dx: number, dy: number) => void;
  onUpdateCurveHandles?: (id: string, waypoints: Point[], cp1Rel: Point, cp2Rel: Point) => void;
  colorConfig?: import("@/app/lib/diagram/colors").SymbolColorConfig;
  displayMode?: import("@/app/lib/diagram/displayMode").DisplayMode;
  debugMode?: boolean;
  onUpdateConnectorFields?: (id: string, fields: Partial<import("@/app/lib/diagram/types").Connector>) => void;
  getViewportCenterRef?: React.MutableRefObject<(() => Point) | null>;
  /** Imperative trigger for the toolbar "Space" button. The parent calls
   *  these to start an insert / remove-space gesture without the user
   *  having to Ctrl+click the canvas. startInsert places one green marker
   *  at the viewport centre (then the user Shift+drags it); startRemove
   *  places the two red markers (then the user repositions + presses
   *  Enter). Populated by Canvas, called by DiagramEditor. */
  spaceActionRef?: React.MutableRefObject<{ startInsert: () => void; startRemove: () => void } | null>;
  /** Click-to-attach mode for the published viewer's feedback flow. When
   *  true, a transparent overlay captures the next canvas click, hit-tests
   *  it against the elements, and reports the topmost match via
   *  onPickElement (then the parent turns the mode off). Works even on a
   *  readOnly canvas — the overlay sets its own pointer-events. */
  pickElementMode?: boolean;
  onPickElement?: (elementId: string, label: string) => void;
  diagramName?: string;
  createdAt?: string;
  updatedAt?: string;
  readOnly?: boolean;
  onDrillIntoSubprocess?: (diagramId: string) => void;
  onDrillBack?: () => void;
  parentDiagramName?: string;
  showValueDisplay?: boolean;
  showBottleneck?: boolean;
  onInsertSpace?: (markerX: number, markerY: number, dx: number, dy: number) => void;
  onRemoveSpace?: (
    zone: { x: number; y: number; width: number; height: number },
    overrides?: {
      preserveIds?: string[];
      extraDeleteIds?: string[];
      leaveAloneIds?: string[];
    },
  ) => void;
  onAddSelfTransition?: (elementId: string, side: Side, srcOffset: number, tgtOffset: number, bulge: number) => void;
  /** Swap a top-level lane with its neighbour in the given direction.
   *  Wired in Phase 2 to a SWAP_LANES_VERTICAL reducer action. Until
   *  then the prop is undefined and the lane-header ↑/↓ buttons are
   *  visible but no-op when clicked. */
  onSwapLane?: (laneId: string, direction: "up" | "down") => void;
}

interface EditingLabel {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
}

interface DraggingConnector {
  fromId: string;
  fromSide: Side;
  fromPos: Point;
  currentPos: Point;
}

interface DraggingEndpoint {
  connectorId: string;
  endpoint: "source" | "target";
  startPos: Point;
  currentPos: Point;
}

function getClosestSide(pos: Point, el: DiagramElement): Side {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const normX = Math.abs(dx) / (el.width / 2 || 1);
  const normY = Math.abs(dy) / (el.height / 2 || 1);
  if (normX > normY) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

function pointToBoundaryOffset(p: Point, el: DiagramElement): { side: Side; offsetAlong: number } {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  // Gateways: snap to nearest diamond vertex if within 3px.
  // Each vertex is at offset 0.5 of its corresponding side.
  if (el.type === "gateway") {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const verts: Array<{ side: Side; x: number; y: number }> = [
      { side: "top",    x: cx,                y: el.y },
      { side: "right",  x: el.x + el.width,   y: cy },
      { side: "bottom", x: cx,                y: el.y + el.height },
      { side: "left",   x: el.x,              y: cy },
    ];
    let best = verts[0]; let bestDist = Infinity;
    for (const v of verts) {
      const d = Math.hypot(p.x - v.x, p.y - v.y);
      if (d < bestDist) { bestDist = d; best = v; }
    }
    if (bestDist <= 3) return { side: best.side, offsetAlong: 0.5 };
  }
  const distTop    = Math.abs(p.y - el.y);
  const distBottom = Math.abs(p.y - (el.y + el.height));
  const distLeft   = Math.abs(p.x - el.x);
  const distRight  = Math.abs(p.x - (el.x + el.width));
  const min = Math.min(distTop, distBottom, distLeft, distRight);
  if (min === distTop)    return { side: "top",    offsetAlong: clamp((p.x - el.x) / el.width) };
  if (min === distBottom) return { side: "bottom", offsetAlong: clamp((p.x - el.x) / el.width) };
  if (min === distLeft)   return { side: "left",   offsetAlong: clamp((p.y - el.y) / el.height) };
  return                         { side: "right",  offsetAlong: clamp((p.y - el.y) / el.height) };
}

/** Returns the side of the host subprocess that this boundary event is mounted on (= its outer side), or null. */
function getBoundaryEventOuterSide(el: DiagramElement, allElements: DiagramElement[]): Side | null {
  if (!el.boundaryHostId) return null;
  const host = allElements.find(h => h.id === el.boundaryHostId);
  if (!host) return null;
  const ecx = el.x + el.width / 2;
  const ecy = el.y + el.height / 2;
  const distTop    = Math.abs(ecy - host.y);
  const distBottom = Math.abs(ecy - (host.y + host.height));
  const distLeft   = Math.abs(ecx - host.x);
  const distRight  = Math.abs(ecx - (host.x + host.width));
  const min = Math.min(distTop, distBottom, distLeft, distRight);
  if (min === distTop)    return "top";
  if (min === distBottom) return "bottom";
  if (min === distLeft)   return "left";
  return "right";
}

/** Returns the opposite of a Side (used to get the inward-facing side of a boundary event). */
function oppositeSide(s: Side): Side {
  if (s === "top")    return "bottom";
  if (s === "bottom") return "top";
  if (s === "left")   return "right";
  return "left";
}

/** Returns the midpoint of the specified outer face of an element. */
function sideMidpoint(el: DiagramElement, side: Side): Point {
  switch (side) {
    case "top":    return { x: el.x + el.width / 2, y: el.y };
    case "bottom": return { x: el.x + el.width / 2, y: el.y + el.height };
    case "left":   return { x: el.x,                y: el.y + el.height / 2 };
    case "right":  return { x: el.x + el.width,     y: el.y + el.height / 2 };
  }
}

interface DebugItem {
  id: string; label: string;
  anchorX: number; anchorY: number;
  color: string; defaultOX: number; defaultOY: number;
}

function DebugLabel({ item, svgToWorld, offsets, setOffset }: {
  item: DebugItem;
  svgToWorld: (cx: number, cy: number) => Point;
  offsets: Map<string, Point>;
  setOffset: (id: string, offset: Point) => void;
}) {
  const offset = offsets.get(item.id) ?? { x: item.defaultOX, y: item.defaultOY };
  const lx = item.anchorX + offset.x;
  const ly = item.anchorY + offset.y;

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    const startWorld = svgToWorld(e.clientX, e.clientY);
    const startOff = { ...offset };
    function onMove(ev: MouseEvent) {
      const cur = svgToWorld(ev.clientX, ev.clientY);
      setOffset(item.id, { x: startOff.x + cur.x - startWorld.x, y: startOff.y + cur.y - startWorld.y });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <g>
      <line x1={item.anchorX} y1={item.anchorY} x2={lx} y2={ly}
        stroke={item.color} strokeWidth={0.5} strokeDasharray="2 2"
        style={{ pointerEvents: "none" }} />
      <text x={lx} y={ly} fontSize={7} fill={item.color} textAnchor="middle"
        fontFamily="monospace" style={{ cursor: "grab", userSelect: "none" }}
        onMouseDown={handleMouseDown}>
        {item.label}
      </text>
    </g>
  );
}

export function Canvas({
  data,
  diagramType,
  onAddElement,
  onMoveElement,
  onResizeElement,
  onUpdateLabel,
  entityStructure,
  onAddEntityNode,
  onBeginLabelEdit,
  onUpdateLabelLive,
  onCancelLabelEdit,
  onDeleteElement,
  onAddConnector,
  onDeleteConnector,
  onUpdateConnectorEndpoint,
  selectedElementIds,
  selectedConnectorId,
  scanHighlightById,
  scanHighlightConnectorById,
  currentIssueIds,
  onSetSelectedElements,
  onSelectConnector,
  onMoveElements,
  onElementsMoveEnd,
  pendingDragSymbol,
  pendingArchimateShapeKey,
  pendingArchimateIconOnly,
  bubbleHelpRefreshToken,
  defaultDirectionType,
  defaultRoutingType,
  onUpdateProperties,
  onUpdatePropertiesBatch,
  onCollapseEpToSubprocess,
  onUpdateConnectorWaypoints,
  onUpdateConnectorLabel,
  onSplitConnector,
  onAddReviewComment,
  onElementMoveEnd,
  onMoveLaneBoundary,
  onResizeElementEnd,
  onLaneBoundaryMoveEnd,
  onConnectorWaypointDragEnd,
  onNudgeConnector,
  onNudgeConnectorEndpoint,
  onUpdateCurveHandles,
  colorConfig,
  displayMode: displayModeProp,
  debugMode,
  onUpdateConnectorFields,
  getViewportCenterRef,
  spaceActionRef,
  pickElementMode,
  onPickElement,
  diagramName,
  createdAt,
  updatedAt,
  readOnly,
  onDrillIntoSubprocess,
  onDrillBack,
  parentDiagramName,
  showValueDisplay,
  showBottleneck,
  onInsertSpace,
  onRemoveSpace,
  onAddSelfTransition,
  onSwapLane,
}: Props) {
  const displayMode = displayModeProp ?? "normal";
  const svgRef = useRef<SVGSVGElement>(null);

  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const baseZoomRef = useRef<number | null>(null); // the "100%" reference zoom
  // Live refs for pan + zoom. Window-bound mouse handlers (connector
  // drag, auto-scroll rAF loop) need to read the CURRENT pan/zoom each
  // tick rather than the values captured in their closure on drag-start
  // — otherwise auto-scroll changes pan but the drag's mousemove keeps
  // computing world coords from the original pan, drifting the rubber-
  // band line off the cursor and breaking drop-target detection.
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  // Initialise baseZoomRef on mount so the zoom-slider percent display
  // works even when the fit-to-content effect below bails (e.g. empty
  // diagram, SVG not yet measured). Without this, `base ?? zoom` ALWAYS
  // returns zoom, making (zoom / base) * 100 stuck at 100% even while
  // the canvas actually zooms.
  useEffect(() => {
    if (baseZoomRef.current !== null) return;
    const stored = typeof window !== "undefined"
      ? parseFloat(window.localStorage.getItem("initialZoom") ?? "") : NaN;
    baseZoomRef.current = Number.isFinite(stored) && stored > 0 ? stored : 0.7;
  }, []);
  const [editingLabel, setEditingLabel] = useState<EditingLabel | null>(null);
  // Focus-edit zoom: when an inline label edit begins we snap the canvas
  // so the edited target is centred and its width is ~30% of the screen,
  // then restore the pre-edit zoom/pan when the edit ends. `null` = not
  // in focus mode.
  //
  // Two entry points:
  //   • Element labels — startEditingLabel() below sets scope="element".
  //     Restore is driven by the useEffect: when editingLabel goes back
  //     to null (Enter / Escape / blur — all five exit paths flow
  //     through setEditingLabel(null)), the canvas snaps back. Scope
  //     check stops the effect from firing prematurely on the connector
  //     path (which never sets editingLabel).
  //   • Connector labels — InteractionLabel inside ConnectorRenderer
  //     manages its own edit state, so it calls enterFocusMode / exit
  //     FocusMode explicitly through props plumbed from this component.
  const [focusModeRestore, setFocusModeRestore] = useState<
    { zoom: number; pan: Point; scope: "element" | "connector" | "external" } | null
  >(null);
  // Ref mirror so exitFocusMode() called from event listeners attached
  // in a previous render still sees the latest focusModeRestore value
  // (the function closure would otherwise see the value at attach time,
  // which is stale by the time the user blurs out of the field).
  const focusModeRestoreRef = useRef<typeof focusModeRestore>(null);
  useEffect(() => {
    focusModeRestoreRef.current = focusModeRestore;
  }, [focusModeRestore]);
  useEffect(() => {
    // Only the inline-element-edit path is restore-on-editingLabel-null.
    // "connector" (InteractionLabel) and "external" (PropertiesPanel
    // redirect for events / data objects) both call exitFocusMode()
    // explicitly because their edit lifecycle isn't tied to editingLabel.
    if (editingLabel === null && focusModeRestore?.scope === "element") {
      setZoom(focusModeRestore.zoom);
      setPan(focusModeRestore.pan);
      setFocusModeRestore(null);
    }
  }, [editingLabel, focusModeRestore]);

  /**
   * Snap the canvas so (centerX, centerY) is in the centre of the viewport
   * and a feature of `worldWidth` covers ~30% of the screen. Returns the
   * post-snap zoom/pan so the caller can use them to position any HTML
   * overlay it's about to render (SVG-internal foreignObjects re-layout
   * automatically, but HTML overlays positioned in screen coords need
   * the new values supplied to them). Returns null if no snap was needed
   * (current zoom is already comfortable) or measurement failed.
   */
  function enterFocusModeAt(
    centerX: number,
    centerY: number,
    worldWidth: number,
    scope: "element" | "connector" | "external",
  ): { focusZoom: number; focusPan: Point } | null {
    // Editing an external label (events / gateways / data objects) should
    // not leave the shape selected behind the editor (item 2). The inline
    // editor's open state is local to SymbolRenderer, so dropping the
    // selection here doesn't close it.
    if (scope === "external") onSetSelectedElements(new Set());
    // Edit-zoom can be disabled entirely via the Active checkbox in
    // Dashboard → File → Zoom → Edit Zoom (localStorage key
    // `editZoomActive` — missing or "true" = on, "false" = off).
    // When off, return null so callers fall back to current zoom/pan
    // and no restore state is set up. Editors still open normally,
    // just without the canvas snap.
    if (
      typeof window !== "undefined" &&
      window.localStorage.getItem("editZoomActive") === "false"
    ) {
      return null;
    }
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    // Edit-zoom fraction is user-tunable via Dashboard → File → Zoom →
    // Edit Zoom (stored in localStorage as `editZoomFraction`, default
    // 0.2). Clamp 0.05..0.95 here too so a malformed key can't break
    // the math; the dashboard already clamps on save.
    const storedFraction =
      typeof window !== "undefined"
        ? parseFloat(window.localStorage.getItem("editZoomFraction") ?? "")
        : NaN;
    const TARGET_FRACTION =
      Number.isFinite(storedFraction) && storedFraction > 0
        ? Math.max(0.05, Math.min(0.95, storedFraction))
        : 0.2;
    // Clamp tiny features (events, short connector labels) so they
    // don't drive an absurd zoom level.
    const effectiveWidth = Math.max(60, worldWidth);
    const idealZoom = (TARGET_FRACTION * rect.width) / effectiveWidth;
    const focusZoom = Math.min(4, Math.max(zoom, idealZoom));
    // Only enter focus mode if the snap meaningfully changes zoom.
    if (focusZoom <= zoom + 0.01) return null;
    const focusPan = {
      x: rect.width / 2 - centerX * focusZoom,
      y: rect.height / 2 - centerY * focusZoom,
    };
    setFocusModeRestore({ zoom, pan, scope });
    setZoom(focusZoom);
    setPan(focusPan);
    return { focusZoom, focusPan };
  }

  function exitFocusMode() {
    // Read via the ref so deferred-fired event listeners (e.g. the
    // PropertiesPanel blur handler attached in a previous render)
    // still restore the correct zoom/pan instead of an empty
    // closure-captured null.
    const restore = focusModeRestoreRef.current;
    if (restore) {
      setZoom(restore.zoom);
      setPan(restore.pan);
      setFocusModeRestore(null);
    }
  }

  // Pool-move boundary alignment. While dragging a pool horizontally, snap
  // its LEFT (or RIGHT) edge to another pool's left/right edge so pool
  // boundaries line up — the move-time analogue of the resize L/R lockstep.
  // Returns the snapped x plus a poolBoundaryGuide payload (the same dashed
  // line + markers used by the resize guide). `null` guide → nothing nearby.
  function computePoolMoveSnap(
    movingPool: DiagramElement,
    x: number,
  ): { x: number; guide: typeof poolBoundaryGuide } {
    const SHOW = 16 / zoom; // world px: show the guide when this close
    const SNAP = 8 / zoom;  // world px: snap the edge when this close
    const w = movingPool.width;
    const liveLeft = x;
    const liveRight = x + w;
    const otherPools = data.elements.filter((p) => p.type === "pool" && p.id !== movingPool.id);
    if (otherPools.length === 0) return { x, guide: null };
    let bestLeft: { d: number; target: number } | null = null;
    let bestRight: { d: number; target: number } | null = null;
    for (const p of otherPools) {
      const dL = Math.abs(liveLeft - p.x);
      if (!bestLeft || dL < bestLeft.d) bestLeft = { d: dL, target: p.x };
      const pR = p.x + p.width;
      const dR = Math.abs(liveRight - pR);
      if (!bestRight || dR < bestRight.d) bestRight = { d: dR, target: pR };
    }
    const useLeft = (bestLeft?.d ?? Infinity) <= (bestRight?.d ?? Infinity);
    const chosen = useLeft ? bestLeft! : bestRight!;
    if (chosen.d > SHOW) return { x, guide: null };
    const side: "left" | "right" = useLeft ? "left" : "right";
    let snappedX = x;
    if (chosen.d <= SNAP) snappedX = useLeft ? chosen.target : chosen.target - w;
    const movingEdge = useLeft ? snappedX : snappedX + w;
    const others = data.elements
      .filter((p) => p.type === "pool")
      .map((p) => ({
        id: p.id,
        x: p.id === movingPool.id ? movingEdge : side === "left" ? p.x : p.x + p.width,
        midY: p.y + p.height / 2,
        isMoving: p.id === movingPool.id,
      }));
    return { x: snappedX, guide: { side, currentX: movingEdge, others } };
  }
  const [draggingConnector, setDraggingConnector] = useState<DraggingConnector | null>(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState<DraggingEndpoint | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  // Live preview for "drag Pool/Lane over existing Pool" — shows where a
  // new lane will be inserted on release. `kind` controls the colour:
  //   "boundary" → bright green (above-all, between, below-all)
  //   "split"    → light green (split a lane into 2 sublanes)
  // Auto-connect 3-state toggle. Modes:
  //   "on"      — full auto-connect: pick a FROM source AND a TO target.
  //   "to-only" — only auto-connect TO the new element; never source FROM.
  //   "off"     — no auto-connect (gateway-merge group connect still runs).
  // Persisted in localStorage so the choice survives reloads. Reads the
  // legacy "0" / "1" values from the binary toggle for backwards compat.
  const [autoConnectMode, setAutoConnectMode] = useState<"on" | "to-only" | "off">(() => {
    if (typeof window === "undefined") return "on";
    const v = window.localStorage.getItem("diagramatix.autoConnect");
    if (v === "off" || v === "0") return "off";
    if (v === "to-only") return "to-only";
    return "on";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("diagramatix.autoConnect", autoConnectMode);
    }
  }, [autoConnectMode]);

  // Bubble-help master toggle. ON by default; persisted in localStorage
  // so the user's preference survives reloads. Each bubble TYPE (e.g.
  // "create-connector") appears at most BUBBLE_HELP_MAX_PER_TYPE times
  // per browser session — counts kept in sessionStorage so they reset
  // when the tab closes. Toggling OFF→ON also resets the counters so
  // users can re-trigger bubbles for testing without a full reload.
  const [bubbleHelpEnabled, setBubbleHelpEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("diagramatix.bubbleHelp");
    if (v === "off") return false;
    return true;
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("diagramatix.bubbleHelp", bubbleHelpEnabled ? "on" : "off");
    }
  }, [bubbleHelpEnabled]);
  // Bubble-help data, keyed by topicKey. Fetched per-diagramType
  // from /api/bubble-helps. Each row supplies text + duration. When
  // the toggle is ON and the user triggers a topic that has a row
  // here, the cloud renders. Topics absent from the map are silently
  // no-ops (useful while admins stage new triggers).
  interface BubbleHelpRow {
    topicKey: string;
    text: string;
    durationMs: number;
  }
  const [bubbleHelpMap, setBubbleHelpMap] = useState<Map<string, BubbleHelpRow>>(new Map());
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    fetch(`/api/bubble-helps?diagramType=${encodeURIComponent(diagramType)}`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then((data: { rows?: BubbleHelpRow[] }) => {
        if (cancelled) return;
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const map = new Map<string, BubbleHelpRow>();
        for (const row of rows) {
          if (row && row.topicKey) map.set(row.topicKey, row);
        }
        setBubbleHelpMap(map);
      })
      .catch(() => { /* offline / 404 — leave map empty */ });
    return () => { cancelled = true; };
  }, [diagramType, bubbleHelpRefreshToken]);
  // Currently-shown bubble. Always point-anchored — the cloud sits to
  // the upper-right of where the user clicked rather than where the
  // element is, so the hint appears right next to the user's cursor.
  const [bubbleHelpAnchor, setBubbleHelpAnchor] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const bubbleHelpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-topic click counter. Bubble fires on odd clicks (1, 3, 5, …)
  // and stays silent on even clicks — gives the user the hint once,
  // then backs off until their next deliberate click on that topic.
  // Reset to 0 when the master toggle is flipped ON (so admins can
  // re-test from a clean state).
  const bubbleHelpClickCountsRef = useRef<Record<string, number>>({});
  function bumpClickCountAndShouldShow(topicKey: string): boolean {
    const next = (bubbleHelpClickCountsRef.current[topicKey] ?? 0) + 1;
    bubbleHelpClickCountsRef.current = { ...bubbleHelpClickCountsRef.current, [topicKey]: next };
    return next % 2 === 1; // show on 1st, 3rd, 5th… ; skip 2nd, 4th, …
  }
  // Unified trigger — every call site supplies a world-space (x, y)
  // for the click point. The bubble's bottom-left lands above/right
  // of that point; BubbleHelp itself flips below if there's no room.
  const showBubbleHelp = useCallback((topicKey: string, worldX: number, worldY: number) => {
    // Never show help clouds in the read-only published viewer — selecting
    // an element there (e.g. clicking a feedback item) must not pop a cloud.
    if (readOnly) return;
    if (!bubbleHelpEnabled) return;
    const row = bubbleHelpMap.get(topicKey);
    if (!row || !row.text.trim()) return;
    if (!bumpClickCountAndShouldShow(topicKey)) return;
    if (bubbleHelpTimerRef.current) clearTimeout(bubbleHelpTimerRef.current);
    setBubbleHelpAnchor({ x: worldX, y: worldY, text: row.text });
    bubbleHelpTimerRef.current = setTimeout(() => setBubbleHelpAnchor(null), row.durationMs);
  }, [readOnly, bubbleHelpEnabled, bubbleHelpMap]);
  // Canvas-background trigger uses the same function — the
  // background-click path already had world coords.
  const showBubbleHelpAtPoint = showBubbleHelp;
  const toggleBubbleHelp = useCallback(() => {
    setBubbleHelpEnabled((prev) => {
      // Toggling ON resets per-topic counts so testers see the hint
      // again immediately rather than having to click twice.
      if (!prev) bubbleHelpClickCountsRef.current = {};
      return !prev;
    });
  }, []);
  // Maps element type → bubble-help topic key. Used by all single-
  // select onSelect handlers so each type triggers its own admin-
  // editable cloud. Falls back to "create-connector" for any type
  // that doesn't have a dedicated topic (covers tasks, gateways,
  // data objects, archi shapes, etc.).
  function topicForElement(type: string): string {
    switch (type) {
      case "pool": return "pool-header";
      case "lane": return "lane-header";
      case "subprocess-expanded": return "Enhanced Subprocess Usage";
      case "start-event": return "start-event";
      case "intermediate-event": return "intermediate-event";
      case "end-event": return "end-event";
      default: return "create-connector";
    }
  }
  const hideBubbleHelp = useCallback(() => {
    if (bubbleHelpTimerRef.current) {
      clearTimeout(bubbleHelpTimerRef.current);
      bubbleHelpTimerRef.current = null;
    }
    setBubbleHelpAnchor(null);
  }, []);
  // Clear timer on unmount so a navigation-away doesn't leak it.
  useEffect(() => () => {
    if (bubbleHelpTimerRef.current) clearTimeout(bubbleHelpTimerRef.current);
  }, []);
  // Dismiss the bubble on the user's next mousedown — that covers
  // "starts a click and drag" plus any other follow-up interaction.
  // Skipped while the bubble is hidden so we don't leak a listener.
  useEffect(() => {
    if (!bubbleHelpAnchor) return;
    // Skip the mousedown that triggered the bubble itself: ignore for
    // one tick so it doesn't dismiss immediately.
    let armed = false;
    const arm = () => { armed = true; };
    const tick = setTimeout(arm, 0);
    const onDown = () => { if (armed) hideBubbleHelp(); };
    window.addEventListener("mousedown", onDown, true);
    return () => {
      clearTimeout(tick);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [bubbleHelpAnchor, hideBubbleHelp]);

  // Drop-preview line:
  //   "lane"        → bright green  — any LANE insert
  //   "sublane"     → bright blue   — sublane insert (top/bottom/between
  //                                   inside a lane that has sublanes,
  //                                   plus split-lane-into-2-sublanes)
  //   "subsublane"  → bright purple — split an existing sublane into 2
  //                                   sub-sublanes (3rd-level nesting)
  const [poolDropPreview, setPoolDropPreview] = useState<{
    x1: number; y1: number; x2: number; y2: number;
    kind: "lane" | "sublane" | "subsublane";
  } | null>(null);
  const [connectorChoice, setConnectorChoice] = useState<{
    sourceId: string; targetId: string;
    sourceSide: Side; targetSide: Side;
    sourceOffset?: number; targetOffset?: number;
    pos: Point;
  } | null>(null);
  // ArchiMate connector picker: stores the dropped-connector parameters
  // and defers onAddConnector until the user selects a relationship type.
  const [pendingArchiConn, setPendingArchiConn] = useState<{
    sourceId: string; targetId: string;
    sourceSide: Side; targetSide: Side;
    sourceOffset?: number; targetOffset?: number;
    screenX: number; screenY: number;
  } | null>(null);
  const [focusedEndpoint, setFocusedEndpoint] = useState<"source" | "target" | null>(null);
  // Pool vertical-boundary alignment guide. Active during a left/right
  // resize of a pool. Shows a dotted vertical line at the moving
  // boundary's current X plus a marker at every other pool's same-side
  // boundary (vertical centre), highlighted green on alignment.
  const [poolBoundaryGuide, setPoolBoundaryGuide] = useState<{
    side: "left" | "right";
    currentX: number;
    others: { id: string; x: number; midY: number; isMoving: boolean }[];
  } | null>(null);
  const [debugLabelOffsets, setDebugLabelOffsets] = useState<Map<string, Point>>(new Map());
  const setDebugLabelOffset = useCallback((id: string, offset: Point) => {
    setDebugLabelOffsets(prev => { const next = new Map(prev); next.set(id, offset); return next; });
  }, []);
  const [pickerOffset, setPickerOffset] = useState<Point>({ x: 0, y: 0 });
  const pickerDragRef = useRef<{ startX: number; startY: number; origOffX: number; origOffY: number } | null>(null);

  // Auto-connect after BPMN element drop: flashes a sequence connector preview
  // that the user can abort by pressing Esc.
  const [autoConnectFlash, setAutoConnectFlash] = useState<{
    sourceId: string;
    targetId: string;
    from: Point;
    to: Point;
    visible: boolean;
  } | null>(null);
  const autoConnectAbortRef = useRef(false);

  // Connection-creation mode: when set, the next click on a different element
  // creates a sequence connector from this source. Triggered by clicking an
  // already-selected task/subprocess. Cleared by Esc, background click, or
  // successful connector creation.
  const [pendingConnSourceId, setPendingConnSourceId] = useState<string | null>(null);

  // Force-connect override (Shift+Ctrl+Click drag): bypasses all validation
  const [forceConnect, setForceConnect] = useState<{
    sourceId: string;
    dragging: boolean;
    targetId?: string;
    screenX?: number;
    screenY?: number;
  } | null>(null);

  // Group-Connect-to-Gateway support: a click on a gateway clears any
  // pre-existing multi-selection before the double-click event fires. We
  // capture the pre-click selection here so the double-click handler can
  // still see the original group. Cleared after a short window so it can't
  // affect unrelated future events.
  const groupConnectPrevSelectionRef = useRef<{ ids: Set<string>; expiresAt: number } | null>(null);
  const GROUP_CONNECT_CAPTURE_MS = 600;

  // Group-Connect flash overlay: shows red lines for connectors about to be
  // deleted and green lines for the new ones, both flashing 3 times before
  // committing. Multiple connectors at once.
  const [groupFlash, setGroupFlash] = useState<{
    deleted: Array<{ from: Point; to: Point }>;
    created: Array<{ from: Point; to: Point }>;
    visible: boolean;
  } | null>(null);

  // Right-click quick-add popup: small palette of common BPMN shapes shown
  // at the cursor position. Choosing one places that element at the original
  // right-click world position and runs auto-connect.
  const [quickAdd, setQuickAdd] = useState<{
    worldPos: Point;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [themePicker, setThemePicker] = useState<{ screenX: number; screenY: number } | null>(null);

  // Right-click context menu shown when the click lands on a supported
  // element type — replaces the quick-add shape palette in that case.
  //   task        → Task Type options
  //   gateway     → Gateway Type options
  //   subprocess  → Sub-Process Usage options (collapsed and expanded)
  //   data-object → Role options
  //   event       → Trigger options
  const [elementContextMenu, setElementContextMenu] = useState<{
    elementId: string;
    kind: "task" | "gateway" | "subprocess" | "data-object" | "event";
    screenX: number;
    screenY: number;
  } | null>(null);

  // Fit-to-content. Runs:
  //   (a) once on initial mount with the loaded diagram
  //   (b) on the `dgx:fitToContent` window CustomEvent, which the AI Apply
  //       Layout handler dispatches — large generated diagrams can extend
  //       well beyond the default 0.7× viewport, so without a re-fit the
  //       user thinks "Apply Layout didn't produce a diagram" when really
  //       it's there, just panned off-screen.
  //
  // Default initial zoom is 70% (readable text at most element sizes).
  // Users can override via System Menu → Initial Zoom…, stored in
  // localStorage key "initialZoom" as a decimal (e.g. 0.7 = 70%).
  // Small diagrams that fit the viewport at the chosen zoom are centred;
  // larger diagrams anchor to the top-left with a margin. The chosen zoom
  // becomes the "100%" reference on the zoom slider.
  const performFit = useCallback(() => {
    if (!svgRef.current || data.elements.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of data.elements) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      if (el.x + el.width > maxX) maxX = el.x + el.width;
      if (el.y + el.height > maxY) maxY = el.y + el.height;
    }
    if (data.title?.showTitle) {
      const titleLines = 4;
      const titleH = titleLines * 16 + 28;
      minY -= titleH;
    }
    const pad = 40;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW < 1 || contentH < 1) return;

    const DEFAULT_INITIAL_ZOOM = 0.7;
    const storedZoomRaw = typeof window !== "undefined"
      ? parseFloat(window.localStorage.getItem("initialZoom") ?? "") : NaN;
    const initialZoom = Number.isFinite(storedZoomRaw) && storedZoomRaw > 0
      ? storedZoomRaw : DEFAULT_INITIAL_ZOOM;

    const EDGE_MARGIN = 40;
    const fitsHorizontally = contentW * initialZoom <= rect.width;
    const fitsVertically   = contentH * initialZoom <= rect.height;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const panX = fitsHorizontally ? rect.width / 2 - cx * initialZoom : EDGE_MARGIN - minX * initialZoom;
    const panY = fitsVertically   ? rect.height / 2 - cy * initialZoom : EDGE_MARGIN - minY * initialZoom;
    setPan({ x: panX, y: panY });
    setZoom(initialZoom);
    baseZoomRef.current = initialZoom;
  }, [data.elements, data.title]);

  // Initial mount fit — guarded so subsequent re-renders don't keep
  // re-centring as the user pans/zooms.
  const hasFitted = useRef(false);
  useEffect(() => {
    if (hasFitted.current || data.elements.length === 0) return;
    hasFitted.current = true;
    performFit();
  }, [data.elements.length, performFit]);

  // External "please re-fit" trigger.
  useEffect(() => {
    function onFit() { performFit(); }
    window.addEventListener("dgx:fitToContent", onFit);
    return () => window.removeEventListener("dgx:fitToContent", onFit);
  }, [performFit]);

  // Reset picker offset when a new pending drop appears
  useEffect(() => { setPickerOffset({ x: 0, y: 0 }); }, [pendingDrop]);
  useEffect(() => { setFocusedEndpoint(null); }, [selectedConnectorId]);

  // Dismiss connector choice popup on click outside
  useEffect(() => {
    if (!connectorChoice) return;
    function handleClick() { setConnectorChoice(null); }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [connectorChoice]);

  // Picker drag: attach window listeners while dragging
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = pickerDragRef.current;
      if (!d) return;
      setPickerOffset({ x: d.origOffX + e.clientX - d.startX, y: d.origOffY + e.clientY - d.startY });
    }
    function onUp() { pickerDragRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);

  // Safety net: clear draggingElementId on any window-level mouseup. The
  // per-element onMoveEnd handler clears it on normal drops, but if the
  // drag ends outside the SVG (mouseup fires on a different DOM target,
  // a focus change interrupts the drag, etc.) the orange containment
  // indicator can otherwise stay visible. This effect guarantees the
  // indicator is always dismissed at the end of any drag.
  useEffect(() => {
    function onWindowMouseUp() { setDraggingElementId(null); }
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);

  // Lasso selection state
  const [lassoRect, setLassoRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Space insertion / removal marker state (BPMN + state-machine).
  // Two markers active = REMOVE mode (red); one marker = INSERT mode (green).
  const [spaceMarker, setSpaceMarker] = useState<Point | null>(null);
  const [spaceMarkerPlacing, setSpaceMarkerPlacing] = useState(false);
  const [secondSpaceMarker, setSecondSpaceMarker] = useState<Point | null>(null);
  // Tracks whether the current space gesture was started from the toolbar
  // "Space" button (vs. an ad-hoc Ctrl+click). When button-initiated, a
  // single Escape clears the whole gesture (the user's expected "exit");
  // Ctrl+click gestures keep the older step-by-step Escape cascade.
  const [spaceMode, setSpaceMode] = useState<"insert" | "remove" | null>(null);
  const [removalConfirm, setRemovalConfirm] = useState<{
    zone: { x: number; y: number; width: number; height: number };
    toDelete: RsRef[];
    ignored: RsRef[];
    affected: RsRef[];
  } | null>(null);
  // (Shift key is checked directly via event.shiftKey for lasso selection)

  // Expose viewport center to parent via ref
  if (getViewportCenterRef) {
    getViewportCenterRef.current = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (-pan.x + rect.width / 2) / zoom,
        y: (-pan.y + rect.height / 2) / zoom,
      };
    };
  }

  // Expose the Space-button imperative API. Reassigned every render so the
  // closures capture current pan/zoom. startInsert drops one green marker
  // at the viewport centre (INSERT mode); startRemove drops the two red
  // markers a fixed distance apart around the centre (REMOVE mode).
  if (spaceActionRef) {
    const centre = (): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (-pan.x + rect.width / 2) / zoom, y: (-pan.y + rect.height / 2) / zoom };
    };
    spaceActionRef.current = {
      startInsert: () => {
        const c = centre();
        setSpaceMarker(c);
        setSecondSpaceMarker(null);
        setSpaceMarkerPlacing(false);
        setSpaceMode("insert");
      },
      startRemove: () => {
        const c = centre();
        // Initial remove-zone half-extent in world units — a comfortable
        // box the user can resize by dragging either marker.
        const off = 80;
        setSpaceMarker({ x: c.x - off, y: c.y - off });
        setSecondSpaceMarker({ x: c.x + off, y: c.y + off });
        setSpaceMarkerPlacing(false);
        setSpaceMode("remove");
      },
    };
  }

  const svgToWorld = useCallback(
    (svgX: number, svgY: number): Point => ({
      x: (svgX - pan.x) / zoom,
      y: (svgY - pan.y) / zoom,
    }),
    [pan, zoom]
  );

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      return svgToWorld(clientX - rect.left, clientY - rect.top);
    },
    [svgToWorld]
  );

  function findDropTarget(pos: Point, fromId: string, filter?: (el: DiagramElement) => boolean): DiagramElement | null {
    const MARGIN = 30;
    const matches: DiagramElement[] = [];
    for (const el of data.elements) {
      if (el.id === fromId) continue;
      if (el.type === "system-boundary" || el.type === "lane" || el.type === "group") continue; // containers are not connector targets (pools allowed for messageBPMN)
      if (filter && !filter(el)) continue;
      if (
        pos.x >= el.x - MARGIN &&
        pos.x <= el.x + el.width + MARGIN &&
        pos.y >= el.y - MARGIN &&
        pos.y <= el.y + el.height + MARGIN
      ) {
        matches.push(el);
      }
    }
    if (matches.length === 0) return null;
    // Highest priority: boundary events (small elements on host edges) — check within margin
    const boundaryHit = matches.find(el => !!el.boundaryHostId);
    if (boundaryHit) return boundaryHit;
    // Prefer non-container elements (child states) over composite-state containers so that
    // dropping onto a state inside a composite returns the child state, not the composite.
    // But only prefer children that actually contain the drop point (not just within margin).
    // When several eligible elements directly contain the point (e.g. a nested ArchiMate
    // shape inside an ArchiMate container — both are `archimate-shape`), the INNERMOST
    // (smallest area) wins, so the connector targets the contained element, not its
    // container. Array order would otherwise pick the container (added first).
    const directHits = matches.filter(el =>
      el.type !== "composite-state" && el.type !== "pool" && el.type !== "subprocess-expanded" &&
      pos.x >= el.x && pos.x <= el.x + el.width &&
      pos.y >= el.y && pos.y <= el.y + el.height
    );
    if (directHits.length > 0) {
      return directHits.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
    }
    // No child directly under cursor — prefer non-container within margin, then container
    const nonContainer = matches.find(el => el.type !== "composite-state" && el.type !== "pool" && el.type !== "subprocess-expanded" && el.type !== "process-group");
    if (nonContainer) return nonContainer;
    // Return the smallest container (innermost) so expanded subprocesses are valid targets
    return matches.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
  }

  function handleConnectionPointDragStart(elementId: string, side: Side, worldPos: Point) {
    const sourceEl = data.elements.find(e => e.id === elementId);
    const outerSide = sourceEl ? getBoundaryEventOuterSide(sourceEl, data.elements) : null;
    const effectiveSide = outerSide ?? side;
    const effectiveWorldPos = (outerSide && sourceEl) ? sideMidpoint(sourceEl, outerSide) : worldPos;
    const drag: DraggingConnector = {
      fromId: elementId,
      fromSide: effectiveSide,
      fromPos: effectiveWorldPos,
      currentPos: effectiveWorldPos,
    };
    setDraggingConnector(drag);

    // Compute world position from ev directly via panRef/zoomRef so the
    // handlers see the CURRENT pan/zoom even after the auto-scroll
    // (Correction #7) shifts pan mid-drag. Reading the closure-captured
    // clientToWorld would use the stale pan from drag-start and the
    // rubber-band line would slide off the cursor.
    const liveClientToWorld = (clientX: number, clientY: number): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const r = svg.getBoundingClientRect();
      return {
        x: (clientX - r.left - panRef.current.x) / zoomRef.current,
        y: (clientY - r.top  - panRef.current.y) / zoomRef.current,
      };
    };

    function onMouseMove(ev: MouseEvent) {
      const pos = liveClientToWorld(ev.clientX, ev.clientY);
      setDraggingConnector((prev) => prev ? { ...prev, currentPos: pos } : null);
    }

    function onMouseUp(ev: MouseEvent) {
      const pos = liveClientToWorld(ev.clientX, ev.clientY);
      // Check if released over the source element's bounding box.
      const srcEl = data.elements.find((e) => e.id === elementId);
      if (
        srcEl &&
        pos.x >= srcEl.x && pos.x <= srcEl.x + srcEl.width &&
        pos.y >= srcEl.y && pos.y <= srcEl.y + srcEl.height
      ) {
        // Self-transition for state elements: if drag started and ended on same state
        const SELF_TRANS_TYPES = new Set(["state", "composite-state", "submachine"]);
        if (SELF_TRANS_TYPES.has(srcEl.type) && onAddSelfTransition) {
          // Determine which long side is nearest to the release point
          const distTop    = Math.abs(pos.y - srcEl.y);
          const distBottom = Math.abs(pos.y - (srcEl.y + srcEl.height));
          const distLeft   = Math.abs(pos.x - srcEl.x);
          const distRight  = Math.abs(pos.x - (srcEl.x + srcEl.width));
          const minDist = Math.min(distTop, distBottom, distLeft, distRight);
          let side: Side;
          if (minDist === distTop)         side = "top";
          else if (minDist === distBottom) side = "bottom";
          else if (minDist === distLeft)   side = "left";
          else                             side = "right";

          // Place source and target 40px apart centred on the midpoint
          // For top/bottom: offset is along width; for left/right: along height
          const dim = (side === "top" || side === "bottom") ? srcEl.width : srcEl.height;
          const midFrac = (side === "top" || side === "bottom")
            ? (pos.x - srcEl.x) / dim
            : (pos.y - srcEl.y) / dim;
          const halfGap = 20 / dim; // 40px apart → 20px each side
          const srcOff = Math.max(0.05, Math.min(0.95, midFrac - halfGap));
          const tgtOff = Math.max(0.05, Math.min(0.95, midFrac + halfGap));

          onAddSelfTransition(elementId, side, srcOff, tgtOff, 60);
        }
        setDraggingConnector(null);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        return;
      }
      // Context-Diagram drop filter: enforce entity ↔ process pairing so
      // the connector creation matches the drop-target highlight rule.
      const isCtxDiagram = diagramType === "context" || diagramType === "basic";
      const ctxSrcEl = isCtxDiagram ? data.elements.find((e) => e.id === elementId) : null;
      const ctxFilter = ctxSrcEl
        ? (cand: DiagramElement) => isValidContextFlowPair(ctxSrcEl.type, cand.type)
        : undefined;
      const targetEl = findDropTarget(pos, elementId, ctxFilter);
      if (targetEl) {
        const sourceEl = data.elements.find((e) => e.id === elementId);
        const actorLike = ["actor", "team", "system", "hourglass"];
        const isDataConn =
          (sourceEl && DATA_ELEMENT_TYPES.has(sourceEl.type)) ||
          DATA_ELEMENT_TYPES.has(targetEl.type);

        const sourcePoolId = sourceEl ? getElementPoolId(sourceEl, data.elements) : null;
        const targetPoolId = getElementPoolId(targetEl, data.elements);
        const isCrossPool =
          sourcePoolId !== null && targetPoolId !== null && sourcePoolId !== targetPoolId;
        const involvesPool = sourceEl?.type === "pool" || targetEl.type === "pool";

        // Resolve ancestor chain (treating boundaryHostId as parent)
        const CHILD_EVENT_TYPES = new Set(["start-event", "intermediate-event", "end-event"]);
        function getAncestorIds(el: DiagramElement): Set<string> {
          const ids = new Set<string>();
          let cur: DiagramElement | undefined = el;
          const visited = new Set<string>();
          while (cur && !visited.has(cur.id)) {
            visited.add(cur.id);
            const nextId: string | undefined = cur.boundaryHostId ?? cur.parentId;
            if (nextId) { ids.add(nextId); cur = data.elements.find(e => e.id === nextId); }
            else break;
          }
          return ids;
        }
        // Child/boundary event ↔ boundary event on an ancestor — bypass validation rules
        const sourceAncestors = sourceEl ? getAncestorIds(sourceEl) : new Set<string>();
        const targetAncestors = getAncestorIds(targetEl);
        // True when source and target share an ancestor chain (one is nested inside the other's host hierarchy)
        const isChildEventToBoundary =
          (sourceEl && CHILD_EVENT_TYPES.has(sourceEl.type) && targetEl.boundaryHostId && sourceAncestors.has(targetEl.boundaryHostId)) ||
          (CHILD_EVENT_TYPES.has(targetEl.type) && sourceEl?.boundaryHostId && targetAncestors.has(sourceEl.boundaryHostId)) ||
          // Also: both are boundary events and one's host is an ancestor of the other
          (sourceEl && CHILD_EVENT_TYPES.has(sourceEl.type) && sourceEl.boundaryHostId &&
           CHILD_EVENT_TYPES.has(targetEl.type) && targetEl.boundaryHostId &&
           (sourceAncestors.has(targetEl.boundaryHostId) || targetAncestors.has(sourceEl.boundaryHostId)));

        if (!isChildEventToBoundary) {
          // End-event source restrictions
          if (sourceEl?.type === "end-event") {
            if (!sourceEl.boundaryHostId && !isCrossPool && !involvesPool) return;
            if (sourceEl.boundaryHostId) {
              if (targetEl.parentId === sourceEl.boundaryHostId) return;
              if (isCrossPool || involvesPool) return;
            }
          }

          // Rule 2: Edge-mounted start event — can only connect to children of its parent subprocess
          if (sourceEl?.type === "start-event" && sourceEl.boundaryHostId) {
            if (targetEl.parentId !== sourceEl.boundaryHostId) return;
          }

          // Rules 3 & 5: Edge-mounted intermediate event
          if (sourceEl?.type === "intermediate-event" && sourceEl.boundaryHostId) {
            // Rule 5: cannot connect to boundary events of the same parent subprocess
            if (targetEl.boundaryHostId === sourceEl.boundaryHostId) return;

            if (sourceEl.taskType === "send" || sourceEl.flowType === "throwing") {
              if (targetEl.parentId === sourceEl.boundaryHostId) return;
            } else if (sourceEl.taskType === "receive" || sourceEl.flowType === "catching") {
              if (targetEl.parentId !== sourceEl.boundaryHostId) return;
            }
          }
        }

        // Rule 4: Child of subprocess cannot connect to its own parent subprocess
        if (sourceEl?.parentId && targetEl.id === sourceEl.parentId && targetEl.type === "subprocess-expanded") return;
        // Rule 4b: Child state cannot connect to its own parent composite-state
        if (sourceEl?.parentId && targetEl.id === sourceEl.parentId && targetEl.type === "composite-state") return;

        if (isCrossPool || involvesPool) {
          // Never create messageBPMN between an element and its own containing pool
          if (targetEl.type === "pool" && targetPoolId === sourcePoolId) return;
          if (sourceEl?.type === "pool" && sourcePoolId === targetPoolId) return;
          // Start events cannot send messageBPMN
          if (sourceEl?.type === "start-event") return;
          const srcCy = sourceEl ? sourceEl.y + sourceEl.height / 2 : 0;
          const tgtCy = targetEl.y + targetEl.height / 2;
          const msgSrcSide: Side = srcCy <= tgtCy ? "bottom" : "top";
          const msgTgtSide: Side = srcCy <= tgtCy ? "top"    : "bottom";
          // Determine x for perpendicular messageBPMN connector
          const clamp01 = (v: number) => Math.max(0.05, Math.min(0.95, v));
          const srcLeft = sourceEl ? sourceEl.x : 0;
          const srcRight = sourceEl ? sourceEl.x + sourceEl.width : 0;
          const tgtLeft = targetEl.x;
          const tgtRight = targetEl.x + targetEl.width;
          const overlapLeft = Math.max(srcLeft, tgtLeft);
          const overlapRight = Math.min(srcRight, tgtRight);
          const hasOverlap = overlapRight > overlapLeft;

          let chosenX: number;
          if (hasOverlap) {
            // Always draw perpendicular: prefer click x, then release x, then overlap midpoint
            const clickX = effectiveWorldPos.x;
            if (clickX >= overlapLeft && clickX <= overlapRight) {
              chosenX = clickX;
            } else if (pos.x >= overlapLeft && pos.x <= overlapRight) {
              chosenX = pos.x;
            } else {
              // Clamp click x into overlap range
              chosenX = Math.max(overlapLeft, Math.min(overlapRight, clickX));
            }
          } else {
            // No overlap — no perpendicular connector possible; use click x
            chosenX = effectiveWorldPos.x;
          }

          // Store the source offset (unclamped so waypoints can reach edges)
          const msgSrcOffset = sourceEl && sourceEl.width > 0
            ? Math.max(0, Math.min(1, (chosenX - sourceEl.x) / sourceEl.width))
            : 0.5;
          onAddConnector(
            elementId, targetEl.id,
            "messageBPMN", "directed", "direct",
            msgSrcSide, msgTgtSide,
            msgSrcOffset
          );
        } else {
          if (targetEl.type === "lane") return;  // pool already handled above
          const targetOuterSide = getBoundaryEventOuterSide(targetEl, data.elements);
          // For edge-mounted events: use inner side if target is inside the host, outer side if outside
          let seqSourceSide: Side;
          if (outerSide && sourceEl?.boundaryHostId) {
            const targetIsInsideHost = targetEl.parentId === sourceEl.boundaryHostId;
            seqSourceSide = targetIsInsideHost ? oppositeSide(outerSide) : outerSide;
          } else {
            seqSourceSide = outerSide ? oppositeSide(outerSide) : effectiveSide;
          }
          // Boundary START event as target → connection comes from OUTSIDE
          // the host EP, so attach at the OUTER side.
          // Boundary END event as target → connection comes from INSIDE the
          // host EP, so attach at the INNER side.
          let seqTargetSide: Side;
          if (targetOuterSide) {
            seqTargetSide = targetEl.type === "start-event" ? targetOuterSide : oppositeSide(targetOuterSide);
          } else {
            seqTargetSide = getClosestSide(pos, targetEl);
          }

          // Source: nearest boundary point to initial click; Target: nearest to release point
          let seqSourceOffsetAlong: number | undefined;
          let seqTargetOffsetAlong: number | undefined;
          if (sourceEl && !outerSide && !targetOuterSide) {
            const srcBound = pointToBoundaryOffset(effectiveWorldPos, sourceEl);
            seqSourceSide = srcBound.side;
            seqSourceOffsetAlong = srcBound.offsetAlong;
            const tgtBound = pointToBoundaryOffset(pos, targetEl);
            seqTargetSide = tgtBound.side;
            seqTargetOffsetAlong = tgtBound.offsetAlong;
          }
          // Expanded subprocess targets always attach at the boundary point
          // nearest to the release position — even when the conditional
          // branch above didn't run (e.g. boundary-event source).
          if (targetEl.type === "subprocess-expanded") {
            const tgtBound = pointToBoundaryOffset(pos, targetEl);
            seqTargetSide = tgtBound.side;
            seqTargetOffsetAlong = tgtBound.offsetAlong;
          }
          let connType: ConnectorType;
          let connRouting: RoutingType;
          let connDirection: DirectionType;

          // Child/boundary event ↔ boundary event on ancestor → always associationBPMN
          const isChildToBoundary = isChildEventToBoundary;

          if (isChildToBoundary) {
            connType = "associationBPMN"; connRouting = "direct"; connDirection = "open-directed";
          } else if (isDataConn) {
            const isAnnotationConn =
              sourceEl?.type === "text-annotation" || targetEl.type === "text-annotation";
            connType = "associationBPMN"; connRouting = "direct";
            connDirection = isAnnotationConn ? "non-directed" : "open-directed";
          } else if (diagramType === "flowchart") {
            connType = "flowline"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
          } else if (diagramType === "domain") {
            connType = "uml-association"; connRouting = defaultRoutingType; connDirection = "non-directed";
          } else if ((diagramType === "context" || diagramType === "basic") && defaultRoutingType === "curvilinear") {
            connType = "flow"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
            // Precise boundary attachment for flow connectors
            if (sourceEl) {
              const srcBound = pointToBoundaryOffset(effectiveWorldPos, sourceEl);
              seqSourceSide = srcBound.side;
              seqSourceOffsetAlong = srcBound.offsetAlong;
            }
            const tgtBound = pointToBoundaryOffset(pos, targetEl);
            seqTargetSide = tgtBound.side;
            seqTargetOffsetAlong = tgtBound.offsetAlong;
          } else if (defaultRoutingType === "curvilinear") {
            connType = "transition"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
          } else if ((sourceEl && actorLike.includes(sourceEl.type)) || actorLike.includes(targetEl.type)) {
            connType = "association"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
            // Auto Scheduler (hourglass) ↔ Process: hourglass is always source, direction is Directed (toward Process)
            const hourglassInvolved = (sourceEl?.type === "hourglass" && targetEl.type !== "hourglass") ||
              (targetEl.type === "hourglass" && sourceEl && sourceEl.type !== "hourglass");
            if (hourglassInvolved) {
              connDirection = "open-directed";
              if (targetEl.type === "hourglass") {
                // Swap source and target so hourglass is source
                const tmpSide = seqSourceSide; const tmpOff = seqSourceOffsetAlong;
                seqSourceSide = seqTargetSide; seqSourceOffsetAlong = seqTargetOffsetAlong;
                seqTargetSide = tmpSide; seqTargetOffsetAlong = tmpOff;
                onAddConnector(targetEl.id, elementId, connType, connDirection, connRouting, seqSourceSide, seqTargetSide, seqSourceOffsetAlong, seqTargetOffsetAlong);
                setDraggingConnector(null);
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                return;
              }
            }
          } else if (diagramType === "archimate") {
            // Defer to the picker — the user chooses the relationship type
            // from a popup. Do NOT create the connector yet.
            // Attach at the boundary point on each element NEAREST the other
            // element (toward its centre), not the side-midpoint the user
            // happened to grab/release at — this gives clean, natural
            // ArchiMate connections instead of always meeting the middle of a
            // side. Endpoints stay draggable + nudgeable for manual override.
            let archiSrcSide = seqSourceSide, archiTgtSide = seqTargetSide;
            let archiSrcOffset = seqSourceOffsetAlong, archiTgtOffset = seqTargetOffsetAlong;
            if (sourceEl) {
              const srcCenter = { x: sourceEl.x + sourceEl.width / 2, y: sourceEl.y + sourceEl.height / 2 };
              const tgtCenter = { x: targetEl.x + targetEl.width / 2, y: targetEl.y + targetEl.height / 2 };
              const sBound = pointToBoundaryOffset(tgtCenter, sourceEl);
              const tBound = pointToBoundaryOffset(srcCenter, targetEl);
              archiSrcSide = sBound.side; archiSrcOffset = sBound.offsetAlong;
              archiTgtSide = tBound.side; archiTgtOffset = tBound.offsetAlong;
            }
            setPendingArchiConn({
              sourceId: elementId,
              targetId: targetEl.id,
              sourceSide: archiSrcSide,
              targetSide: archiTgtSide,
              sourceOffset: archiSrcOffset,
              targetOffset: archiTgtOffset,
              screenX: ev.clientX,
              screenY: ev.clientY,
            });
            setDraggingConnector(null);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            return;
          } else {
            connType = "sequence"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
          }
          onAddConnector(elementId, targetEl.id, connType, connDirection, connRouting, seqSourceSide, seqTargetSide, seqSourceOffsetAlong, seqTargetOffsetAlong);
        }
      }
      setDraggingConnector(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleEndpointDragStart(
    connectorId: string,
    endpoint: "source" | "target",
    startPos: Point,
    e: React.MouseEvent
  ) {
    e.stopPropagation();
    // Find the connector's current source/target id to use as "from" exclusion
    const conn = data.connectors.find((c) => c.id === connectorId);
    const fromId = conn
      ? endpoint === "source" ? conn.sourceId : conn.targetId
      : connectorId;

    // Annotation-endpoint freeze: an associationBPMN endpoint attached to
    // a text-annotation cannot be moved at all (user spec). The opposite
    // end of the same association remains freely re-targetable. Bail out
    // of the drag immediately when the user tries to grab the annotation
    // side.
    if (conn?.type === "associationBPMN") {
      const fromEl = data.elements.find((e) => e.id === fromId);
      if (fromEl?.type === "text-annotation") return;
    }

    setDraggingEndpoint({ connectorId, endpoint, startPos, currentPos: startPos });

    function onMouseMove(ev: MouseEvent) {
      const pos = clientToWorld(ev.clientX, ev.clientY);
      setDraggingEndpoint((prev) => prev ? { ...prev, currentPos: pos } : null);
    }

    function onMouseUp(ev: MouseEvent) {
      const pos = clientToWorld(ev.clientX, ev.clientY);
      const isMsgBPMN = conn?.type === "messageBPMN";

      // Check if dropped on the same element — reposition along its boundary
      // (skip for messageBPMN: it uses top/bottom sides only, not arbitrary boundary positions)
      // For expanded subprocesses: check if a child element is under the cursor first
      const currentEl = data.elements.find((e) => e.id === fromId);
      const isCurrentExpanded = currentEl?.type === "subprocess-expanded";
      const childUnderCursor = isCurrentExpanded
        ? data.elements.find((el) =>
            el.id !== fromId && el.parentId === fromId &&
            pos.x >= el.x && pos.x <= el.x + el.width &&
            pos.y >= el.y && pos.y <= el.y + el.height
          )
        : null;
      // Also check for boundary events on the expanded subprocess
      const boundaryUnderCursor = isCurrentExpanded
        ? data.elements.find((el) =>
            el.boundaryHostId === fromId &&
            pos.x >= el.x - 15 && pos.x <= el.x + el.width + 15 &&
            pos.y >= el.y - 15 && pos.y <= el.y + el.height + 15
          )
        : null;
      const innerTarget = childUnderCursor ?? boundaryUnderCursor;
      // Drop on (or NEAR) the same element → reposition along its boundary.
      // Using a 30px MARGIN — same tolerance findDropTarget already uses for
      // reconnects — fixes the "endpoint snaps back" UX when the user drags
      // an endpoint slightly past the element's edge. Without the margin the
      // strict bounds-check failed, findDropTarget excluded the current
      // element via `fromId`, and no update was emitted.
      const SAME_EL_MARGIN = 30;
      if (!isMsgBPMN && currentEl && !innerTarget &&
        pos.x >= currentEl.x - SAME_EL_MARGIN && pos.x <= currentEl.x + currentEl.width + SAME_EL_MARGIN &&
        pos.y >= currentEl.y - SAME_EL_MARGIN && pos.y <= currentEl.y + currentEl.height + SAME_EL_MARGIN) {
        const { side, offsetAlong } = pointToBoundaryOffset(pos, currentEl);
        onUpdateConnectorEndpoint(connectorId, endpoint, currentEl.id, side, offsetAlong);
        onSelectConnector(null);
      } else if (!isMsgBPMN && innerTarget) {
        // Dropped on a child or boundary event inside an expanded subprocess.
        // Same data-side lock as the main targetEl branch: a Data Object
        // or Data Store endpoint can only re-attach to another data
        // element — an EP child is never one of those, so abort.
        const fromElInner = data.elements.find(e => e.id === fromId);
        const DATA_OBJ_STORE = new Set<string>(["data-object", "data-store"]);
        if (fromElInner && DATA_OBJ_STORE.has(fromElInner.type) && !DATA_OBJ_STORE.has(innerTarget.type)) {
          // silently abort
          setDraggingEndpoint(null);
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
          return;
        }
        // Side selection for boundary events:
        //   - Boundary START event as TARGET → OUTER (incoming flow comes
        //     from outside the host EP).
        //   - Boundary START event as SOURCE → INNER (emits into the EP).
        //   - Boundary END event → INNER both ways (received from inside,
        //     and end events don't emit).
        const targetOuterSide = getBoundaryEventOuterSide(innerTarget, data.elements);
        if (!targetOuterSide && (conn?.type === "flow" || conn?.type === "transition")) {
          const bound = pointToBoundaryOffset(pos, innerTarget);
          onUpdateConnectorEndpoint(connectorId, endpoint, innerTarget.id, bound.side, bound.offsetAlong);
        } else {
          let newSide: Side;
          if (targetOuterSide) {
            const isStartTarget = innerTarget.type === "start-event" && endpoint === "target";
            newSide = isStartTarget ? targetOuterSide : oppositeSide(targetOuterSide);
          } else {
            newSide = getClosestSide(pos, innerTarget);
          }
          onUpdateConnectorEndpoint(connectorId, endpoint, innerTarget.id, newSide, 0.5);
        }
        onSelectConnector(null);
      } else if (isMsgBPMN) {
        // messageBPMN endpoint reconnection — rules mirror the highlight logic:
        //   - If the moving end is currently on a Pool, the drop target must
        //     be another (black-box) pool.
        //   - If the moving end is currently on a Task/Subprocess, the drop
        //     target must be another Task/Subprocess inside any white-box pool.
        //   - Additionally, the arrowhead (target) end may land on a Start or
        //     Intermediate event, and the source end may land on an Intermediate
        //     or End event — both must sit in a white-box pool and not be
        //     boundary-mounted.
        // In all cases, the target must not be the fixed end itself.
        // Validity is role-based, NOT tied to what the moving end currently
        // sits on — so an endpoint on an event (or pool, or task) can be
        // re-attached to ANY legal participant: a black-box pool, a
        // task/subprocess in a white-box pool, or a role-appropriate event in
        // a white-box pool.
        const RECEIVE_EVENTS: Set<SymbolType> = new Set(["start-event", "intermediate-event"]);
        const SEND_EVENTS:    Set<SymbolType> = new Set(["intermediate-event", "end-event"]);
        const fixedId   = endpoint === "source" ? conn!.targetId : conn!.sourceId;
        const fixedEl   = data.elements.find(e => e.id === fixedId);
        const validEvents = endpoint === "target" ? RECEIVE_EVENTS : SEND_EVENTS;
        const targetEl  = findDropTarget(pos, fromId);
        let valid = false;
        if (targetEl && targetEl.id !== fixedId && targetEl.id !== fromId) {
          if (targetEl.type === "pool") {
            const ptype = (targetEl.properties.poolType as string | undefined) ?? "black-box";
            if (ptype === "black-box") valid = true;
          } else if (MSG_TASKSUB_TYPES.has(targetEl.type)) {
            const tPoolId = getElementPoolId(targetEl, data.elements);
            const tPool   = tPoolId ? data.elements.find(p => p.id === tPoolId) : null;
            if (((tPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
              valid = true;
            }
          } else if (validEvents.has(targetEl.type) && !targetEl.boundaryHostId) {
            const tPoolId = getElementPoolId(targetEl, data.elements);
            const tPool   = tPoolId ? data.elements.find(p => p.id === tPoolId) : null;
            if (((tPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
              valid = true;
            }
          }
        }
        if (valid && targetEl && fixedEl) {
          // Top/bottom sides computed from vertical positions of new source & target
          const newSourceEl = endpoint === "source" ? targetEl : fixedEl;
          const newTargetEl = endpoint === "target" ? targetEl : fixedEl;
          const srcCy = newSourceEl.y + newSourceEl.height / 2;
          const tgtCy = newTargetEl.y + newTargetEl.height / 2;
          const newSide = endpoint === "source"
            ? ((srcCy <= tgtCy ? "bottom" : "top") as Side)
            : ((srcCy <= tgtCy ? "top"    : "bottom") as Side);
          onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, newSide, 0.5);
        }
        onSelectConnector(null);
      } else {
        // Dropped elsewhere — reconnect to a different element (non-messageBPMN)
        const isAssocBPMN = conn?.type === "associationBPMN";
        const epFilter = isAssocBPMN
          ? undefined  // associationBPMN can connect to any element
          : conn?.routingType === "direct"
            ? (el: DiagramElement) => el.type === "use-case"
            : undefined;
        const targetEl = findDropTarget(pos, fromId, epFilter);
        if (targetEl) {
          // Data-side lock: when the endpoint being moved currently sits on
          // a Data Object or Data Store, it may only be re-attached to
          // another Data Object or Data Store. Drops on tasks / events /
          // anything else are silently rejected. Annotation endpoints
          // are already blocked at drag start, so they don't reach this
          // path.
          const fromEl = data.elements.find(e => e.id === fromId);
          const DATA_OBJ_STORE = new Set<string>(["data-object", "data-store"]);
          const movingIsDataObjOrStore = !!fromEl && DATA_OBJ_STORE.has(fromEl.type);
          if (movingIsDataObjOrStore && !DATA_OBJ_STORE.has(targetEl.type)) {
            // silently abort — data endpoint can only swap to another data element
          } else
          // Block: non-associationBPMN connectors cannot connect to data elements
          if (!isAssocBPMN && DATA_ELEMENT_TYPES.has(targetEl.type)) {
            // silently abort
          } else if (isAssocBPMN && DATA_ELEMENT_TYPES.has(targetEl.type)) {
            // Block data-to-data: check if the fixed end is also a data element
            const otherEndId = endpoint === "source" ? conn!.targetId : conn!.sourceId;
            const otherEl = data.elements.find(e => e.id === otherEndId);
            if (otherEl && DATA_ELEMENT_TYPES.has(otherEl.type)) {
              // silently abort — data-to-data not allowed
            } else {
              const targetOuterSide = getBoundaryEventOuterSide(targetEl, data.elements);
              if (!targetOuterSide && (conn?.type === "flow" || conn?.type === "transition")) {
                const bound = pointToBoundaryOffset(pos, targetEl);
                onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, bound.side, bound.offsetAlong);
              } else {
                // Boundary events: snap to the INNER side (opposite of
                // the host edge they sit on) — that's the connection
                // point inside the EP.
                const newSide = targetOuterSide ? oppositeSide(targetOuterSide) : getClosestSide(pos, targetEl);
                onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, newSide, 0.5);
              }
            }
          } else if (targetEl.type === "pool") {
            // silently abort — only messageBPMN connectors may attach to a pool
          } else {
            const targetOuterSide = getBoundaryEventOuterSide(targetEl, data.elements);
            if (!targetOuterSide && (conn?.type === "flow" || conn?.type === "transition")) {
              const bound = pointToBoundaryOffset(pos, targetEl);
              onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, bound.side, bound.offsetAlong);
            } else {
              // Boundary events: target-of-start = OUTER (from outside the
              // EP); everything else (including target-of-end) = INNER.
              let newSide: Side;
              if (targetOuterSide) {
                const isStartTarget = targetEl.type === "start-event" && endpoint === "target";
                newSide = isStartTarget ? targetOuterSide : oppositeSide(targetOuterSide);
              } else {
                newSide = getClosestSide(pos, targetEl);
              }
              onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, newSide, 0.5);
            }
          }
        }
        onSelectConnector(null);
      }

      setDraggingEndpoint(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleLaneBoundaryDrag(e: React.MouseEvent, aboveLaneId: string, belowLaneId: string) {
    e.stopPropagation();
    let lastClientY = e.clientY;

    function onMouseMove(ev: MouseEvent) {
      const rawDy = ev.clientY - lastClientY;
      lastClientY = ev.clientY;
      const dy = rawDy / zoom;
      onMoveLaneBoundary?.(aboveLaneId, belowLaneId, dy);
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onLaneBoundaryMoveEnd?.();
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const handleUpdateEndOffset = useCallback((connectorId: string, field: string, offset: Point) => {
    onUpdateConnectorFields?.(connectorId, { [field]: offset } as Partial<import("@/app/lib/diagram/types").Connector>);
  }, [onUpdateConnectorFields]);

  function handleResizeDragStart(elementId: string, handle: ResizeHandle, e: React.MouseEvent) {
    e.stopPropagation();
    const el = data.elements.find((el) => el.id === elementId);
    if (!el) return;

    const isContainer = el.type === "system-boundary" || el.type === "composite-state"
      || el.type === "pool" || el.type === "subprocess-expanded" || el.type === "group"
      || el.type === "uml-class" || el.type === "uml-enumeration";
    const ar = el.width / el.height;
    const minW = isContainer ? MIN_BOUNDARY_W : 20;
    const minH = isContainer ? MIN_BOUNDARY_H : 20;

    const startMouse = { x: e.clientX, y: e.clientY };
    const startBounds = { x: el.x, y: el.y, width: el.width, height: el.height };

    // Pool vertical-boundary guide: detect left/right resize of a pool
    // and snapshot every OTHER pool's same-side boundary so we can show
    // alignment markers during the drag.
    const isPoolBoundaryDrag = el.type === "pool" && (handle.includes("w") || handle.includes("e"));
    const movingSide: "left" | "right" | null = isPoolBoundaryDrag
      ? (handle.includes("w") ? "left" : "right")
      : null;
    if (movingSide) {
      // Include EVERY pool — the moving one is included so the guide
      // line spans the full set of pools on the canvas (and gets a
      // marker on its own boundary too).
      const others = data.elements
        .filter(p => p.type === "pool")
        .map(p => ({
          id: p.id,
          x: movingSide === "left" ? p.x : p.x + p.width,
          midY: p.y + p.height / 2,
          isMoving: p.id === el.id,
        }));
      setPoolBoundaryGuide({
        side: movingSide,
        currentX: movingSide === "left" ? el.x : el.x + el.width,
        others,
      });
    }

    function onMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startMouse.x) / zoom;
      const dy = (ev.clientY - startMouse.y) / zoom;
      let { x, y, width, height } = startBounds;

      if (handle.includes("e")) width  = Math.max(minW, width  + dx);
      if (handle.includes("s")) height = Math.max(minH, height + dy);
      if (handle.includes("w")) {
        const newW = Math.max(minW, width - dx);
        x = startBounds.x + startBounds.width - newW;
        width = newW;
      }
      if (handle.includes("n")) {
        const newH = Math.max(minH, height - dy);
        y = startBounds.y + startBounds.height - newH;
        height = newH;
      }

      // Types that allow independent width/height resizing
      const elType = el!.type;
      const freeResize = elType === "task" || elType === "subprocess"
        || elType === "subprocess-expanded" || elType === "state"
        || elType === "submachine" || elType === "composite-state"
        || elType === "chevron" || elType === "chevron-collapsed" || elType === "process-group"
        || elType === "archimate-shape"; // all ArchiMate shapes resize freely (incl. icon-only)
      if (!isContainer && !freeResize && ar > 0) {
        if (handle.includes("e") || handle.includes("w")) {
          // Width is primary — derive height to preserve aspect ratio
          height = width / ar;
          if (handle.includes("n")) y = startBounds.y + startBounds.height - height;
        } else {
          // n or s only — height is primary, derive width and re-center x
          width = height * ar;
          x = startBounds.x + (startBounds.width - width) / 2;
        }
      }
      if (freeResize) {
        // Side handles: width only; top/bottom: height only; corners: both
        const isHoriz = handle === "e" || handle === "w";
        const isVert = handle === "n" || handle === "s";
        if (isHoriz) { y = startBounds.y; height = startBounds.height; }
        if (isVert) { x = startBounds.x; width = startBounds.width; }
      }

      // Fork/Join: only resize along the long axis, keep the thin dimension fixed
      if (elType === "fork-join") {
        const isVertical = startBounds.height >= startBounds.width;
        if (isVertical) {
          // Long axis is vertical — only allow n/s resize
          width = startBounds.width;
          x = startBounds.x;
          height = Math.max(20, height);
        } else {
          // Long axis is horizontal — only allow e/w resize
          height = startBounds.height;
          y = startBounds.y;
          width = Math.max(20, width);
        }
      }

      // Enforce content-based minimums for UML elements
      if (el!.type === "uml-enumeration" || el!.type === "uml-class") {
        const HEADER_H = 28;
        const CHAR_W = 6.5;
        const LINE_H = 14;
        const PAD = 4;
        const labelLines = (el!.type === "uml-enumeration" || el!.type === "uml-class")
          ? (editingLabel?.elementId === el!.id ? editingLabel.value : el!.label).split("\n") : [el!.label];
        const extraLines = Math.max(0, labelLines.length - 1);
        const headerH = HEADER_H + extraLines * LINE_H;
        const labelMaxW = Math.max(...labelLines.map((l: string) => l.length * CHAR_W));
        let contentMinW = labelMaxW + PAD * 2;
        let contentMinH = headerH + LINE_H;
        if (el!.type === "uml-enumeration") {
          const values: string[] = (el!.properties.values as string[] | undefined) ?? [];
          const stereotypeW = 15 * CHAR_W * 0.8;
          const valuesMaxW = values.length > 0 ? Math.max(...values.map((v: string) => v.length * CHAR_W)) : 0;
          contentMinW = Math.max(stereotypeW, labelMaxW, valuesMaxW) + PAD * 2;
          contentMinH = headerH + values.length * LINE_H;
        } else if (el!.type === "uml-class") {
          const attrs = (el!.properties.attributes as { name: string }[] | undefined) ?? [];
          const ops = (el!.properties.operations as { name: string }[] | undefined) ?? [];
          const showA = (el!.properties.showAttributes as boolean | undefined) ?? false;
          const showO = (el!.properties.showOperations as boolean | undefined) ?? false;
          const attrsH = showA ? attrs.length * LINE_H : 0;
          const opsH = showO ? ops.length * LINE_H : 0;
          contentMinH = headerH + Math.max(LINE_H, attrsH + opsH + 3);
        }
        width = Math.max(width, Math.max(80, contentMinW));
        height = Math.max(height, Math.max(40, contentMinH));
        if (handle.includes("w")) x = startBounds.x + startBounds.width - width;
        if (handle.includes("n")) y = startBounds.y + startBounds.height - height;
      }

      onResizeElement(elementId, x, y, width, height);

      // Live-update the boundary guide's X as the user drags.
      if (movingSide) {
        const newX = movingSide === "left" ? x : x + width;
        setPoolBoundaryGuide(prev => prev ? { ...prev, currentX: newX } : null);
      }
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onResizeElementEnd?.(elementId);
      if (movingSide) setPoolBoundaryGuide(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const panStart = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);

  function handleBackgroundMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (pendingDrop) {
      setPendingDrop(null);
      return;
    }
    if (quickAdd) {
      setQuickAdd(null);
      return;
    }
    if (themePicker) {
      setThemePicker(null);
      return;
    }
    if (elementContextMenu) {
      setElementContextMenu(null);
      return;
    }

    // Ctrl+click on background: state machine
    //   • idle (no marker)         → place 1st green marker (INSERT mode)
    //   • INSERT mode (1 marker)   → place 2nd marker → REMOVE mode (red)
    //   • REMOVE mode (2 markers)  → reposition the 2nd marker to the click
    //                                 (drag updates it in real time)
    if (e.ctrlKey && onInsertSpace) {
      const worldPt = clientToWorld(e.clientX, e.clientY);
      // Ad-hoc Ctrl+click gesture — not button-initiated, so clear any
      // stale button mode and fall back to the step-by-step Escape cascade.
      setSpaceMode(null);
      const placingSecond = spaceMarker !== null;
      if (placingSecond) {
        setSecondSpaceMarker(worldPt);
      } else {
        setSpaceMarker(worldPt);
        setSpaceMarkerPlacing(true);
      }
      // Allow immediate drag to reposition the just-placed marker.
      function onMove(ev: MouseEvent) {
        const wp = clientToWorld(ev.clientX, ev.clientY);
        if (placingSecond) setSecondSpaceMarker(wp);
        else setSpaceMarker(wp);
      }
      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (!placingSecond) setSpaceMarkerPlacing(false);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }

    // Default drag → pan; hold Shift → lasso
    if (!e.shiftKey) {
      // --- Pan mode ---
      const startCX = e.clientX;
      const startCY = e.clientY;
      // Cache the world-space click position so the bubble-help cloud
      // can anchor here if this turns out to be a click-without-drag.
      const clickWorld = clientToWorld(e.clientX, e.clientY);
      let didPanDrag = false;
      panStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };

      function onMouseMove(ev: MouseEvent) {
        if (!panStart.current) return;
        if (!didPanDrag && Math.abs(ev.clientX - startCX) < 3 && Math.abs(ev.clientY - startCY) < 3) return;
        didPanDrag = true;
        setPan({
          x: panStart.current.panX + ev.clientX - panStart.current.mouseX,
          y: panStart.current.panY + ev.clientY - panStart.current.mouseY,
        });
      }

      function onMouseUp() {
        panStart.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        // Simple click (no drag) — clear selection + show the
        // canvas-click bubble help (topic "select-multiple"). The
        // bubble itself decides if it should render based on the
        // toggle + admin-configured map.
        if (!didPanDrag) {
          onSetSelectedElements(new Set());
          onSelectConnector(null);
          if (pendingConnSourceId) setPendingConnSourceId(null);
          if (forceConnect) setForceConnect(null);
          showBubbleHelpAtPoint("select-multiple", clickWorld.x, clickWorld.y);
        }
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    } else {
      // --- Lasso mode ---
      const startWorld = clientToWorld(e.clientX, e.clientY);
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      let didDrag = false;

      function onMouseMove(ev: MouseEvent) {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        if (!didDrag && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        didDrag = true;
        const endWorld = clientToWorld(ev.clientX, ev.clientY);
        setLassoRect({
          startX: startWorld.x, startY: startWorld.y,
          endX: endWorld.x, endY: endWorld.y,
        });
      }

      function onMouseUp(ev: MouseEvent) {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        setLassoRect(null);

        if (!didDrag) {
          // Simple click on background — clear selection
          if (!ev.shiftKey) {
            onSetSelectedElements(new Set());
            onSelectConnector(null);
          }
          return;
        }

        // Find all elements fully enclosed in lasso rectangle
        const endWorld = clientToWorld(ev.clientX, ev.clientY);
        const lx = Math.min(startWorld.x, endWorld.x);
        const ly = Math.min(startWorld.y, endWorld.y);
        const lx2 = Math.max(startWorld.x, endWorld.x);
        const ly2 = Math.max(startWorld.y, endWorld.y);

        const enclosed = new Set<string>();
        for (const el of data.elements) {
          if (el.x >= lx && el.y >= ly &&
              el.x + el.width <= lx2 && el.y + el.height <= ly2) {
            enclosed.add(el.id);
          }
        }

        if (ev.shiftKey) {
          // Shift+lasso: add to existing selection
          onSetSelectedElements((prev) => {
            const next = new Set(prev);
            for (const id of enclosed) next.add(id);
            return next;
          });
        } else {
          onSetSelectedElements(enclosed);
        }
        onSelectConnector(null);
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(4, Math.max(0.2, zoom * delta));

    setPan((prev) => ({
      x: cx - (cx - prev.x) * (newZoom / zoom),
      y: cy - (cy - prev.y) * (newZoom / zoom),
    }));
    setZoom(newZoom);
  }

  // Predict which EP / composite-state will end up as the new element's
  // parent AFTER the ADD_ELEMENT reducer runs. Mirrors the reducer's
  // centre-inside-OR-straddle test for subprocess-expanded (the EP
  // grows to absorb a near-edge drop) and centre-inside for composite-
  // state. The original auto-connect code used a strict bbox-fully-inside
  // test, which meant near-edge drops looked "outside" the EP and
  // auto-connect cheerfully drew sequence flows across the boundary
  // before the EP had grown.
  function predictNewExpandedScope(
    x: number, y: number, w: number, h: number,
  ): string | null {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const right = x + w;
    const bottom = y + h;
    const matches: DiagramElement[] = [];
    for (const b of data.elements) {
      if (b.type !== "subprocess-expanded" && b.type !== "composite-state") continue;
      const centreInside =
        cx >= b.x && cx <= b.x + b.width &&
        cy >= b.y && cy <= b.y + b.height;
      if (centreInside) { matches.push(b); continue; }
      if (b.type === "subprocess-expanded") {
        const xOverlap = x < b.x + b.width && right > b.x;
        const yOverlap = y < b.y + b.height && bottom > b.y;
        const straddleLR = yOverlap && (
          (x < b.x && right > b.x) ||
          (x < b.x + b.width && right > b.x + b.width)
        );
        const straddleTB = xOverlap && (
          (y < b.y && bottom > b.y) ||
          (y < b.y + b.height && bottom > b.y + b.height)
        );
        if (straddleLR || straddleTB) matches.push(b);
      }
    }
    if (matches.length === 0) return null;
    // Smallest (innermost) wins, matching the reducer's container pick.
    matches.sort((a, b) => (a.width * a.height) - (b.width * b.height));
    return matches[0].id;
  }

  // BPMN auto-connect: find the best existing element to connect to a newly placed
  // element, plus which sides to use. Returns null if no suitable source found.
  // Priority order (checked A → B → C):
  //   A) Nearest element strictly to the LEFT (no vertical overlap, diagonal) → top/bottom→left
  //   B) Nearest element strictly ABOVE/BELOW with horizontal overlap → bottom→top or top→bottom
  //   C) Nearest element strictly to the LEFT with vertical overlap → right→left
  function findAutoConnectSource(
    newX: number, newY: number, newW: number, newH: number,
    newSymbolType?: SymbolType
  ): { source: DiagramElement; srcSide: Side; tgtSide: Side } | null {
    const BPMN_AUTO_CONNECT = new Set<SymbolType>([
      "task", "subprocess", "subprocess-expanded", "gateway",
      "start-event", "intermediate-event", "end-event",
    ]);
    const SM_AUTO_CONNECT = new Set<SymbolType>([
      "state", "initial-state", "final-state", "composite-state", "gateway",
    ]);
    const AUTO_CONNECT_TYPES = diagramType === "state-machine" ? SM_AUTO_CONNECT : BPMN_AUTO_CONNECT;

    // Walk an element's parent chain and return the id of the nearest
    // subprocess-expanded ANCESTOR (excluding the element itself) — or null
    // if there isn't one. Used to confine auto-connect to elements that share
    // the same expanded-subprocess scope. An expanded-subprocess element is
    // therefore "outside its own scope", so it can be a valid target from
    // siblings outside the subprocess.
    function expandedParentOf(el: DiagramElement): string | null {
      let cur: DiagramElement | undefined = el.parentId
        ? data.elements.find((e) => e.id === el.parentId)
        : undefined;
      while (cur) {
        if (cur.type === "subprocess-expanded" || cur.type === "composite-state") return cur.id;
        if (!cur.parentId) return null;
        cur = data.elements.find((e) => e.id === cur!.parentId);
      }
      return null;
    }
    // The new element doesn't have a parentId yet, so predict the EP /
    // composite-state that will be its parent post-drop. Centre-inside
    // OR straddle (for EPs that grow to absorb) — mirrors ADD_ELEMENT.
    const newRight2 = newX + newW;
    const newBottom2 = newY + newH;
    const newExpandedScope = predictNewExpandedScope(newX, newY, newW, newH);

    // Infer the pool the new element would land in (spatial containment).
    // Pick the deepest spatial-fit lane (innermost wins) and walk up its
    // parent chain to find the actual pool — without the walk, a sublane
    // hit set newPool to its parent LANE (not a pool), which broke the
    // cross-pool guard for nested lane structures (issue 3).
    let newPool: DiagramElement | null = null;
    let deepestLane: DiagramElement | null = null;
    for (const cand of data.elements) {
      if (cand.type !== "lane") continue;
      if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
          newY >= cand.y && newBottom2 <= cand.y + cand.height) {
        if (!deepestLane || (cand.width * cand.height) < (deepestLane.width * deepestLane.height)) {
          deepestLane = cand;
        }
      }
    }
    if (deepestLane) {
      let cur: DiagramElement | undefined = deepestLane;
      for (let i = 0; i < 10 && cur; i++) {
        if (cur.type === "pool") { newPool = cur; break; }
        if (!cur.parentId) break;
        cur = data.elements.find((e) => e.id === cur!.parentId);
      }
    }
    if (!newPool) {
      for (const cand of data.elements) {
        if (cand.type !== "pool") continue;
        if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
            newY >= cand.y && newBottom2 <= cand.y + cand.height) {
          newPool = cand;
          break;
        }
      }
    }
    function containingPool(el: DiagramElement): DiagramElement | null {
      let cur: DiagramElement | undefined = el;
      for (let i = 0; i < 10 && cur; i++) {
        if (cur.type === "pool") return cur;
        if (!cur.parentId) return null;
        cur = data.elements.find(e => e.id === cur!.parentId);
      }
      return null;
    }

    // Never auto-connect to/from edge-mounted (boundary) events, and never
    // cross a container boundary (expanded-subprocess or composite-state).
    // BPMN rules: never auto-connect TO a start event, never FROM an end event.
    // State-machine rules: never auto-connect TO an initial-state, never
    // connect initial → initial, never connect final → final.
    const isBpmn = diagramType === "bpmn";
    const isStateMachine = diagramType === "state-machine";
    const newIsInitial = newSymbolType === "initial-state";
    const newIsFinal = newSymbolType === "final-state";
    const newIsStartEvent = newSymbolType === "start-event";
    // BPMN: never auto-connect to/from event/transaction expanded subprocesses
    const isEventOrTxnSub = (el: DiagramElement) =>
      el.type === "subprocess-expanded" &&
      ((el.properties.subprocessType as string | undefined) === "event" ||
       (el.properties.subprocessType as string | undefined) === "transaction");

    const candidates = data.elements.filter((e) => {
      if (!AUTO_CONNECT_TYPES.has(e.type)) return false;
      // Per spec: never auto-connect from/to ANY edge-mounted (boundary)
      // event — they are always manually wired by the user.
      if (e.boundaryHostId) return false;
      // BPMN: never auto-connect FROM an end event (end events have no outgoing)
      if (isBpmn && e.type === "end-event") return false;
      // BPMN: never auto-connect TO a start event
      if (isBpmn && newIsStartEvent) return false;
      // BPMN: never auto-connect to/from event or transaction expanded subprocesses
      if (isBpmn && isEventOrTxnSub(e)) return false;
      // New element is a subprocess-expanded: subtype isn't known at drop
      // time. Assume the default "regular" subtype and allow auto-connect
      // from valid sources (start/intermediate events, tasks,
      // subprocesses, gateways). The user can delete the connector if
      // they later change the subtype to event/transaction.
      // (The candidate's own validity is already covered by other rules.)
      // BPMN: never auto-connect from elements inside an Event Expanded Subprocess to outside (or vice versa)
      if (isBpmn) {
        const candParent = e.parentId ? data.elements.find(p => p.id === e.parentId) : null;
        const candInEventSub = candParent?.type === "subprocess-expanded" &&
          (candParent.properties.subprocessType as string | undefined) === "event";
        if (candInEventSub && candParent.id !== newExpandedScope) return false;
      }
      // BPMN: sequence flows never auto-connect across pool boundaries.
      // Reject when the candidate's containing pool differs from the new
      // element's containing pool — INCLUDING null-vs-pool mismatches
      // (anything outside all pools can't auto-connect to anything inside
      // a pool, and vice versa). Manual messageBPMN flows are the only
      // BPMN-legal cross-pool link (issues 6 + 3).
      if (isBpmn) {
        const candPool = containingPool(e);
        if ((candPool?.id ?? null) !== (newPool?.id ?? null)) {
          return false;
        }
      }
      // State-machine: never auto-connect initial → initial or final → final
      if (isStateMachine && newIsInitial && e.type === "initial-state") return false;
      if (isStateMachine && newIsFinal && e.type === "final-state") return false;
      // Never auto-connect from an EP (or composite-state) to an element
      // that ends up inside it. Bounds-containment is the authoritative
      // test — covers direct parent and any transitive ancestor, even if
      // newExpandedScope only points to the outermost match.
      if ((e.type === "subprocess-expanded" || e.type === "composite-state") &&
          newX >= e.x && newRight2 <= e.x + e.width &&
          newY >= e.y && newBottom2 <= e.y + e.height) {
        return false;
      }
      // Both must share the same container scope (or both have none).
      if (e.id === newExpandedScope) return false;
      const candScope = expandedParentOf(e);
      return candScope === newExpandedScope;
    });
    const newRight = newX + newW;
    const newBottom = newY + newH;
    const newCx = newX + newW / 2;
    const newCy = newY + newH / 2;

    // Pre-pass 1: PROXIMITY OVERRIDE — if the nearest left candidate is
    // closer than 1/4 of the second-nearest, it wins absolutely (regardless
    // of any gateway preference).
    //
    // Pre-pass 2: DECISION-GATEWAY PRECEDENCE — if a decision gateway is
    // 1st or 2nd closest of all left candidates, it always takes precedence.
    {
      // Compute proposed connector endpoints + length for each left candidate.
      const buildResult = (src: DiagramElement) => {
        const srcCy = src.y + src.height / 2;
        const vOverlap = Math.min(src.y + src.height, newBottom) - Math.max(src.y, newY);
        let srcSide: Side; let tgtSide: Side;
        if (vOverlap > 0) {
          srcSide = "right"; tgtSide = "left";
        } else {
          srcSide = newCy < srcCy ? "top" : "bottom";
          tgtSide = "left";
        }
        // Edge-mounted start events: emit from the inner side (opposite
        // to the host edge they sit on), regardless of the new element's
        // relative geometry.
        if (src.type === "start-event" && src.boundaryHostId) {
          const outer = getBoundaryEventOuterSide(src, data.elements);
          if (outer) srcSide = oppositeSide(outer);
        }
        return { source: src, srcSide, tgtSide };
      };

      const proposedLength = (el: DiagramElement) => {
        const r = buildResult(el);
        const from = sideMidpoint(r.source, r.srcSide);
        // Synthetic target rect for the new element
        const targetRect = { ...el, x: newX, y: newY, width: newW, height: newH } as DiagramElement;
        const to = sideMidpoint(targetRect, r.tgtSide);
        return Math.hypot(to.x - from.x, to.y - from.y);
      };

      const leftCandidates = candidates
        .filter(el => el.x + el.width <= newX)
        .map(el => ({ el, dist: proposedLength(el) }))
        .sort((a, b) => a.dist - b.dist);

      // Pre-pass 1: proximity override.
      // "Very near" means the proposed connector is short relative to the
      // new element's size. If the nearest left candidate's connector is
      // shorter than the smaller of the new element's dimensions, use it
      // directly. This guarantees that placing an element right next to an
      // existing one always wires straight to it, regardless of any decision
      // gateway preference.
      // Additionally, when there are multiple candidates, the nearest also
      // wins if it is < 1/4 the length of the second-nearest.
      if (leftCandidates.length >= 1) {
        const first = leftCandidates[0];
        const proximityThreshold = Math.min(newW, newH);
        if (first.dist < proximityThreshold) {
          return buildResult(first.el);
        }
        if (leftCandidates.length >= 2) {
          const second = leftCandidates[1];
          if (first.dist < second.dist / 4) {
            return buildResult(first.el);
          }
        }
      }

      // Pre-pass 2: decision-gateway precedence (BPMN + state-machine)
      const top2 = leftCandidates.slice(0, 2);
      const decisionGw = top2.find(c =>
        c.el.type === "gateway" &&
        ((c.el.properties?.gatewayRole as string | undefined) ?? "decision") === "decision"
      );
      if (decisionGw) {
        return buildResult(decisionGw.el);
      }

      // Pre-pass 3 (state-machine only): initial-state precedence.
      // If an initial-state with no outgoing connectors exists among all
      // candidates (not just left), it always takes priority as the source.
      if (isStateMachine && newSymbolType !== "initial-state") {
        const unconnectedInitial = candidates.find(c =>
          c.type === "initial-state" &&
          !data.connectors.some(conn => conn.sourceId === c.id)
        );
        if (unconnectedInitial) {
          return buildResult(unconnectedInitial);
        }
      }
    }

    // Main: pick the NEAREST eligible candidate across all positional
    // categories (left+vertical-overlap, left+diagonal, above/below with
    // horizontal overlap). For each candidate compute the proposed connector
    // (using the side pair appropriate to its relative position) and rank by
    // the resulting connector length. Return the shortest.
    {
      type Match = { el: DiagramElement; srcSide: Side; tgtSide: Side; dist: number };
      const matches: Match[] = [];
      for (const el of candidates) {
        const elLeft = el.x;
        const elRight = el.x + el.width;
        const elTop = el.y;
        const elBottom = el.y + el.height;
        const vOverlap = Math.min(elBottom, newBottom) - Math.max(elTop, newY);
        const hOverlap = Math.min(elRight, newRight) - Math.max(elLeft, newX);

        let srcSide: Side | null = null;
        let tgtSide: Side | null = null;

        if (elRight <= newX && vOverlap > 0) {
          // Left + vertical overlap → right→left
          srcSide = "right"; tgtSide = "left";
        } else if (elRight <= newX) {
          // Left + diagonal (no vertical overlap)
          const elCy = elTop + el.height / 2;
          const newCy = newY + newH / 2;
          srcSide = newCy < elCy ? "top" : "bottom";
          tgtSide = "left";
        } else if (hOverlap > 0 && elBottom <= newY) {
          // Above with horizontal overlap → bottom→top
          srcSide = "bottom"; tgtSide = "top";
        } else if (hOverlap > 0 && newBottom <= elTop) {
          // Below with horizontal overlap → top→bottom
          srcSide = "top"; tgtSide = "bottom";
        } else if (
          (el.type === "subprocess-expanded" || el.type === "composite-state") &&
          (vOverlap > 0 || hOverlap > 0)
        ) {
          // Container source partially overlaps the new element — none of
          // the strict edge-relations fired, but a connector still makes
          // sense. Pick direction by center comparison so dropping a
          // task NEAR (not strictly outside) an EP still wires up.
          const elCx = el.x + el.width / 2;
          const elCy = elTop + el.height / 2;
          if (vOverlap > 0 && newCx > elCx) {
            srcSide = "right"; tgtSide = "left";
          } else if (hOverlap > 0 && newCy > elCy) {
            srcSide = "bottom"; tgtSide = "top";
          }
        }
        if (!srcSide || !tgtSide) continue;

        // Edge-mounted start events emit their flow into the host: the
        // visible connection point is the side OPPOSITE to the host edge
        // they're mounted on. Override the geometry-derived srcSide so
        // the connector always leaves through that "inner" side (e.g.
        // right-hand point for a left-edge mount).
        if (el.type === "start-event" && el.boundaryHostId) {
          const outer = getBoundaryEventOuterSide(el, data.elements);
          if (outer) srcSide = oppositeSide(outer);
        }

        // Distance metric: sideMidpoint (source) → sideMidpoint (synthetic
        // target rect at the new element's position).
        const from = sideMidpoint(el, srcSide);
        const targetRect = { ...el, x: newX, y: newY, width: newW, height: newH } as DiagramElement;
        const to = sideMidpoint(targetRect, tgtSide);
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        matches.push({ el, srcSide, tgtSide, dist });
      }
      if (matches.length === 0) return null;
      matches.sort((a, b) => a.dist - b.dist);
      const winner = matches[0];
      return { source: winner.el, srcSide: winner.srcSide, tgtSide: winner.tgtSide };
    }
  }

  /**
   * Mirror of findAutoConnectSource for the OPPOSITE flow direction:
   * find an existing element to be the TARGET of a sequence connector
   * from the new (just-dropped) element. Used to support:
   *   - Pass-through wiring when a new element is dropped between two
   *     existing unconnected elements (left → new → right).
   *   - Auto-connect FROM a new element TO an existing EP that sits to
   *     its right (was missing from the source-only path).
   *
   * The candidate must be positioned RIGHT/BELOW (or diagonally
   * RIGHT-of) the new element so the new element naturally flows into
   * it. Boundary events and non-boundary start events are excluded as
   * targets — sequence flows can't terminate there.
   */
  function findAutoConnectTarget(
    newX: number, newY: number, newW: number, newH: number,
    newSymbolType?: SymbolType
  ): { target: DiagramElement; srcSide: Side; tgtSide: Side } | null {
    const BPMN_AUTO_CONNECT = new Set<SymbolType>([
      "task", "subprocess", "subprocess-expanded", "gateway",
      "intermediate-event", "end-event",
    ]);
    const SM_AUTO_CONNECT = new Set<SymbolType>([
      "state", "submachine", "final-state", "composite-state", "gateway", "fork-join",
    ]);
    const AUTO_CONNECT_TYPES = diagramType === "state-machine" ? SM_AUTO_CONNECT : BPMN_AUTO_CONNECT;

    function expandedParentOf(el: DiagramElement): string | null {
      let cur: DiagramElement | undefined = el.parentId
        ? data.elements.find((e) => e.id === el.parentId)
        : undefined;
      while (cur) {
        if (cur.type === "subprocess-expanded" || cur.type === "composite-state") return cur.id;
        if (!cur.parentId) return null;
        cur = data.elements.find((e) => e.id === cur!.parentId);
      }
      return null;
    }

    const newRight2 = newX + newW;
    const newBottom2 = newY + newH;
    const newExpandedScope = predictNewExpandedScope(newX, newY, newW, newH);

    // Pick the deepest spatial-fit lane and walk up to its enclosing pool
    // (issue 3 — sublane parent-chain wasn't always reaching a pool).
    let newPool: DiagramElement | null = null;
    let deepestLane: DiagramElement | null = null;
    for (const cand of data.elements) {
      if (cand.type !== "lane") continue;
      if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
          newY >= cand.y && newBottom2 <= cand.y + cand.height) {
        if (!deepestLane || (cand.width * cand.height) < (deepestLane.width * deepestLane.height)) {
          deepestLane = cand;
        }
      }
    }
    if (deepestLane) {
      let cur: DiagramElement | undefined = deepestLane;
      for (let i = 0; i < 10 && cur; i++) {
        if (cur.type === "pool") { newPool = cur; break; }
        if (!cur.parentId) break;
        cur = data.elements.find((e) => e.id === cur!.parentId);
      }
    }
    if (!newPool) {
      for (const cand of data.elements) {
        if (cand.type !== "pool") continue;
        if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
            newY >= cand.y && newBottom2 <= cand.y + cand.height) {
          newPool = cand;
          break;
        }
      }
    }
    function containingPool(el: DiagramElement): DiagramElement | null {
      let cur: DiagramElement | undefined = el;
      for (let i = 0; i < 10 && cur; i++) {
        if (cur.type === "pool") return cur;
        if (!cur.parentId) return null;
        cur = data.elements.find(e => e.id === cur!.parentId);
      }
      return null;
    }

    const isBpmn = diagramType === "bpmn";
    const isStateMachine = diagramType === "state-machine";
    const newIsEnd = newSymbolType === "end-event";
    const newIsFinal = newSymbolType === "final-state";
    const isEventOrTxnSub = (el: DiagramElement) =>
      el.type === "subprocess-expanded" &&
      ((el.properties.subprocessType as string | undefined) === "event" ||
       (el.properties.subprocessType as string | undefined) === "transaction");

    // BPMN: end events have no outgoing sequence — short-circuit.
    if (isBpmn && newIsEnd) return null;
    // State-machine: final states have no outgoing transitions — short-circuit.
    if (isStateMachine && newIsFinal) return null;

    const candidates = data.elements.filter((e) => {
      if (!AUTO_CONNECT_TYPES.has(e.type)) return false;
      // Boundary events as auto-connect targets aren't intuitive — exclude.
      if (e.boundaryHostId) return false;
      // BPMN: never connect to event/txn sub
      if (isBpmn && isEventOrTxnSub(e)) return false;
      // BPMN: candidate inside an event sub that isn't the new element's scope
      if (isBpmn) {
        const candParent = e.parentId ? data.elements.find(p => p.id === e.parentId) : null;
        const candInEventSub = candParent?.type === "subprocess-expanded" &&
          (candParent.properties.subprocessType as string | undefined) === "event";
        if (candInEventSub && candParent.id !== newExpandedScope) return false;
      }
      // BPMN: sequence flows never auto-connect across pool boundaries.
      // Reject when the candidate's containing pool differs from the new
      // element's containing pool — INCLUDING null-vs-pool mismatches
      // (anything outside all pools can't auto-connect to anything inside
      // a pool, and vice versa). Manual messageBPMN flows are the only
      // BPMN-legal cross-pool link (issues 6 + 3).
      if (isBpmn) {
        const candPool = containingPool(e);
        if ((candPool?.id ?? null) !== (newPool?.id ?? null)) {
          return false;
        }
      }
      // State-machine: never connect to initial state
      if (isStateMachine && e.type === "initial-state") return false;
      // Cannot target an EP/composite-state whose bounds contain the new element
      // (would be the new element's own parent).
      if ((e.type === "subprocess-expanded" || e.type === "composite-state") &&
          newX >= e.x && newRight2 <= e.x + e.width &&
          newY >= e.y && newBottom2 <= e.y + e.height) {
        return false;
      }
      // Cannot target the new element's parent EP scope
      if (e.id === newExpandedScope) return false;
      // Both must share the same container scope (or both have none)
      const candScope = expandedParentOf(e);
      return candScope === newExpandedScope;
    });

    const newRight = newX + newW;
    const newBottom = newY + newH;
    const newCx = newX + newW / 2;
    const newCy = newY + newH / 2;

    type Match = { el: DiagramElement; srcSide: Side; tgtSide: Side; dist: number };
    const matches: Match[] = [];
    for (const el of candidates) {
      const elLeft = el.x;
      const elRight = el.x + el.width;
      const elTop = el.y;
      const elBottom = el.y + el.height;
      const vOverlap = Math.min(elBottom, newBottom) - Math.max(elTop, newY);
      const hOverlap = Math.min(elRight, newRight) - Math.max(elLeft, newX);

      let srcSide: Side | null = null;
      let tgtSide: Side | null = null;

      if (newRight <= elLeft && vOverlap > 0) {
        // Existing RIGHT of new with vOverlap → new.right → existing.left
        srcSide = "right"; tgtSide = "left";
      } else if (newRight <= elLeft) {
        // Existing RIGHT of new diagonally
        const elCy = elTop + el.height / 2;
        tgtSide = newCy < elCy ? "top" : "bottom";
        srcSide = "right";
      } else if (hOverlap > 0 && newBottom <= elTop) {
        // Existing BELOW new with hOverlap → new.bottom → existing.top
        srcSide = "bottom"; tgtSide = "top";
      } else if (hOverlap > 0 && elBottom <= newY) {
        // Existing ABOVE new with hOverlap (uncommon) → new.top → existing.bottom
        srcSide = "top"; tgtSide = "bottom";
      } else if (
        (el.type === "subprocess-expanded" || el.type === "composite-state") &&
        (vOverlap > 0 || hOverlap > 0)
      ) {
        // Container target partially overlaps new — center direction fallback
        const elCx = el.x + el.width / 2;
        const elCy = elTop + el.height / 2;
        if (vOverlap > 0 && newCx < elCx) {
          srcSide = "right"; tgtSide = "left";
        } else if (hOverlap > 0 && newCy < elCy) {
          srcSide = "bottom"; tgtSide = "top";
        }
      }
      if (!srcSide || !tgtSide) continue;

      const newRectSyn = { ...el, x: newX, y: newY, width: newW, height: newH } as DiagramElement;
      const from = sideMidpoint(newRectSyn, srcSide);
      const to = sideMidpoint(el, tgtSide);
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      matches.push({ el, srcSide, tgtSide, dist });
    }
    if (matches.length === 0) return null;
    matches.sort((a, b) => a.dist - b.dist);
    const winner = matches[0];
    return { target: winner.el, srcSide: winner.srcSide, tgtSide: winner.tgtSide };
  }

  // Compute the (x,y) point on an element's side at offset 0.5 (middle).
  function sideMidpoint(el: DiagramElement, side: Side): Point {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    switch (side) {
      case "left":   return { x: el.x,              y: cy };
      case "right":  return { x: el.x + el.width,   y: cy };
      case "top":    return { x: cx,                y: el.y };
      case "bottom": return { x: cx,                y: el.y + el.height };
    }
  }

  /**
   * Run a flashing-line auto-connect animation, then dispatch ONE
   * connector. Generalised to accept arbitrary source + target rects so
   * the new (just-dropped) element can be either source OR target.
   */
  function startAutoConnect(
    sourceId: string, sourceX: number, sourceY: number, sourceW: number, sourceH: number,
    targetId: string, targetX: number, targetY: number, targetW: number, targetH: number,
    srcSide: Side, tgtSide: Side
  ) {
    autoConnectAbortRef.current = false;
    const sourceRect = { x: sourceX, y: sourceY, width: sourceW, height: sourceH } as DiagramElement;
    const targetRect = { x: targetX, y: targetY, width: targetW, height: targetH } as DiagramElement;
    const from = sideMidpoint(sourceRect, srcSide);
    const to = sideMidpoint(targetRect, tgtSide);
    let cycle = 0;
    const TOTAL_CYCLES = 6; // 3 flashes = 3 on + 3 off
    setAutoConnectFlash({ sourceId, targetId, from, to, visible: true });
    const tick = () => {
      if (autoConnectAbortRef.current) { setAutoConnectFlash(null); return; }
      cycle++;
      if (cycle >= TOTAL_CYCLES) {
        setAutoConnectFlash(null);
        if (!autoConnectAbortRef.current) {
          const autoConnType: ConnectorType = diagramType === "state-machine" ? "transition" : "sequence";
          onAddConnector(
            sourceId, targetId,
            autoConnType, defaultDirectionType, defaultRoutingType,
            srcSide, tgtSide, 0.5, 0.5
          );
        }
        return;
      }
      setAutoConnectFlash(prev => prev ? { ...prev, visible: !prev.visible } : null);
      setTimeout(tick, 150);
    };
    setTimeout(tick, 150);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!pendingDragSymbol) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const worldPos = svgToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // ArchiMate shape drop: short-circuit the BPMN/state-machine split +
    // auto-connect paths. Look up the catalogue entry and call
    // onAddElement with the shape's natural dimensions, label, and
    // shapeKey in properties.
    //
    // Label generation: strip the layer prefix from the catalogue name
    // ("Business Actor" → "Actor") and append a counter that increments
    // across drops of the same base name ("Actor 1", "Actor 2", …).
    if (pendingDragSymbol === "archimate-shape" && pendingArchimateShapeKey) {
      const entry = findArchimateShapeByKey(pendingArchimateShapeKey);
      const iconOnly = !!pendingArchimateIconOnly;
      let initial: { properties: Record<string, unknown>; width?: number; height?: number; label?: string };
      if (entry) {
        const baseName = entry.name.replace(/^(Business|Application|Motivation|Strategy|Technology|Physical|Implementation|Composite)\s+/i, "");
        const baseRe = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+\\d+)?$`, "i");
        const used = data.elements.filter(el =>
          el.type === "archimate-shape" &&
          typeof el.label === "string" && baseRe.test(el.label)
        ).length;
        // Default aspect matches the palette preview (64 × 38 ≈ 1.68:1).
        // Icon-only variants use their own fixed aspect so the glyph
        // renders at a sensible scale.
        let w: number, h: number;
        if (iconOnly) {
          if (entry.iconType === "actor") { w = 48; h = 86; }       // portrait stick figure
          else if (entry.iconType === "service") { w = 120; h = 60; } // rounded-rect
          else { w = 120; h = 60; }                                   // event + fallbacks
        } else {
          w = 128; h = 76; // matches palette preview aspect
        }
        initial = {
          properties: { shapeKey: entry.key, archimateIconOnly: iconOnly },
          width: w,
          height: h,
          label: `${baseName} ${used + 1}`,
        };
      } else {
        initial = { properties: { shapeKey: pendingArchimateShapeKey, archimateIconOnly: iconOnly } };
      }
      onAddElement("archimate-shape", worldPos, undefined, undefined, undefined, initial);
      return;
    }

    // Review Mode: a review-comment drops as a pink note auto-linked to
    // whatever element sits under the cursor (smallest enclosing element
    // wins; review-comments themselves are never targets). The editor
    // creates both the note and the review-comment-link.
    if (pendingDragSymbol === "review-comment" && onAddReviewComment) {
      const under = data.elements
        .filter((el) =>
          el.type !== "review-comment" &&
          worldPos.x >= el.x && worldPos.x <= el.x + el.width &&
          worldPos.y >= el.y && worldPos.y <= el.y + el.height,
        )
        .sort((a, b) => a.width * a.height - b.width * b.height);
      onAddReviewComment(worldPos, under[0]?.id ?? null);
      return;
    }

    // Check if dropped on a connector (split connector feature)
    const BPMN_SPLITTABLE = new Set([
      "gateway", "intermediate-event", "task", "subprocess", "subprocess-expanded",
    ]);
    const SM_SPLITTABLE = new Set(["gateway", "state", "submachine", "composite-state", "fork-join"]);
    const SPLITTABLE_DROPS = diagramType === "state-machine" ? SM_SPLITTABLE : BPMN_SPLITTABLE;
    if ((diagramType === "bpmn" || diagramType === "state-machine") && onSplitConnector && SPLITTABLE_DROPS.has(pendingDragSymbol)) {
      const hit = findConnectorNearPoint(data.connectors, worldPos);
      if (hit) {
        if (pendingDragSymbol === "gateway" || pendingDragSymbol === "task" || pendingDragSymbol === "subprocess"
            || pendingDragSymbol === "state" || pendingDragSymbol === "submachine" || pendingDragSymbol === "composite-state" || pendingDragSymbol === "fork-join") {
          // These have no type picker — split immediately
          onSplitConnector(pendingDragSymbol, worldPos, hit.id);
          return;
        } else {
          // Intermediate event: show type picker, then split
          const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPendingDrop({
            worldPos,
            containerX: e.clientX - containerRect.left,
            containerY: e.clientY - containerRect.top,
            symbolType: "intermediate-event",
            splitConnectorId: hit.id,
          });
          return;
        }
      }
    }

    if (pendingDragSymbol === "intermediate-event" && diagramType === "bpmn") {
      // Intermediate events look completely different per trigger
      // type (message, timer, error, …) so the picker still pops on
      // drop. Tasks now start with no marker — user right-clicks to
      // pick a marker afterwards.
      const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPendingDrop({
        worldPos,
        containerX: e.clientX - containerRect.left,
        containerY: e.clientY - containerRect.top,
        symbolType: pendingDragSymbol,
      });
    } else {
      addElementWithAutoConnect(pendingDragSymbol, worldPos);
    }
  }

  // Wraps onAddElement, adding BPMN auto-connect logic for elements placed
  // to the right of an existing element with vertical overlap.
  function addElementWithAutoConnect(
    symbolType: SymbolType, worldPos: Point,
    taskType?: BpmnTaskType, eventType?: EventType
  ) {
    // Toggle override: when auto-connect is OFF, skip auto-connect entirely
    // (gateway-merge group connect at handleGatewayDoubleClick remains
    // unaffected — it never consulted this toggle).
    if (autoConnectMode === "off") {
      onAddElement(symbolType, worldPos, taskType, eventType);
      return;
    }
    const BPMN_AUTO_CONNECT_TYPES = new Set<SymbolType>([
      "task", "subprocess", "subprocess-expanded", "gateway",
      "start-event", "intermediate-event", "end-event",
    ]);
    const SM_AUTO_CONNECT_TYPES = new Set<SymbolType>([
      "state", "submachine", "initial-state", "final-state", "composite-state", "gateway", "fork-join",
    ]);
    const AUTO_CONNECT_TYPES = diagramType === "state-machine" ? SM_AUTO_CONNECT_TYPES : BPMN_AUTO_CONNECT_TYPES;

    // Mirror useDiagram's boundary-snap thresholds so we can predict if the
    // new element will become an edge-mounted (boundary) event in the reducer.
    const BOUNDARY_EVENT_TYPES_LOCAL = new Set<SymbolType>([
      "start-event", "intermediate-event", "end-event",
    ]);
    const BOUNDARY_HOST_TYPES_LOCAL = new Set<SymbolType>([
      "task", "subprocess", "subprocess-expanded",
    ]);
    const BOUNDARY_SNAP_THRESHOLD_LOCAL = 25;
    function willBeBoundaryEvent(): boolean {
      if (diagramType !== "bpmn") return false; // no boundary events in state machine
      if (!BOUNDARY_EVENT_TYPES_LOCAL.has(symbolType)) return false;
      const centre = worldPos;
      for (const host of data.elements) {
        if (!BOUNDARY_HOST_TYPES_LOCAL.has(host.type)) continue;
        const cx = Math.max(host.x, Math.min(host.x + host.width, centre.x));
        const cy = Math.max(host.y, Math.min(host.y + host.height, centre.y));
        const onLeft   = Math.abs(centre.x - host.x);
        const onRight  = Math.abs(centre.x - (host.x + host.width));
        const onTop    = Math.abs(centre.y - host.y);
        const onBottom = Math.abs(centre.y - (host.y + host.height));
        const inside =
          centre.x > host.x && centre.x < host.x + host.width &&
          centre.y > host.y && centre.y < host.y + host.height;
        let dist: number;
        if (inside) {
          dist = Math.min(onLeft, onRight, onTop, onBottom);
        } else {
          dist = Math.hypot(centre.x - cx, centre.y - cy);
        }
        if (dist < BOUNDARY_SNAP_THRESHOLD_LOCAL) return true;
      }
      return false;
    }

    const supportsAutoConnect = diagramType === "bpmn" || diagramType === "state-machine";
    // State-machine rules: never auto-connect TO an initial-state or final-state
    const skipAutoConnect = diagramType === "state-machine" && (symbolType === "initial-state" || symbolType === "final-state");
    if (supportsAutoConnect && AUTO_CONNECT_TYPES.has(symbolType) && !willBeBoundaryEvent() && !skipAutoConnect) {
      const def = getSymbolDefinition(symbolType);
      let newX = worldPos.x - def.defaultWidth / 2;
      let newY = worldPos.y - def.defaultHeight / 2;
      // Mode semantics:
      //   "on"      — both directions: existing→new (src) AND new→existing (tgt).
      //   "to-only" — only auto-connect TO the new element; skip the new→existing leg.
      //   "off"     — handled above (early return).
      const srcFound = findAutoConnectSource(newX, newY, def.defaultWidth, def.defaultHeight, symbolType);
      const tgtFound = autoConnectMode === "to-only"
        ? null
        : findAutoConnectTarget(newX, newY, def.defaultWidth, def.defaultHeight, symbolType);

      // Pass-through auto-connect: new element placed BETWEEN two
      // existing unconnected elements → wire src→new AND new→tgt.
      // Skip if there is already a sequence/transition connector
      // between src and tgt (per user rule: don't override an existing
      // direct relationship).
      let dualEligible = !!srcFound && !!tgtFound;
      if (dualEligible && srcFound && tgtFound) {
        const existingDirect = data.connectors.some(c =>
          c.sourceId === srcFound.source.id &&
          c.targetId === tgtFound.target.id &&
          (c.type === "sequence" || c.type === "transition")
        );
        if (existingDirect) dualEligible = false;
        // Also: if src and tgt are the same element (shouldn't happen
        // but defensive), skip.
        if (srcFound.source.id === tgtFound.target.id) dualEligible = false;
      }

      if (dualEligible && srcFound && tgtFound) {
        // Two-connector dual: align new.y to source's centre when the
        // src→new leg is right→left so the layout reads cleanly.
        let alignedPos = worldPos;
        let srcSide = srcFound.srcSide;
        let srcTgtSide = srcFound.tgtSide;
        let newSrcSide = tgtFound.srcSide;
        let tgtSide = tgtFound.tgtSide;
        if (srcSide === "right" && srcTgtSide === "left") {
          const srcCy = srcFound.source.y + srcFound.source.height / 2;
          newY = srcCy - def.defaultHeight / 2;
          alignedPos = { x: worldPos.x, y: srcCy };
        }
        // Gateway-as-new: pick diamond vertices for both sides.
        if (symbolType === "gateway") {
          const src = srcFound.source;
          const tgt = tgtFound.target;
          const gwTop = newY;
          const gwBottom = newY + def.defaultHeight;
          // src→new
          if (src.y + src.height <= gwTop) { srcSide = "bottom"; srcTgtSide = "top"; }
          else if (src.y >= gwBottom)      { srcSide = "top";    srcTgtSide = "bottom"; }
          else                              { srcSide = "right";  srcTgtSide = "left"; }
          // new→tgt
          if (tgt.y + tgt.height <= gwTop) { newSrcSide = "top";    tgtSide = "bottom"; }
          else if (tgt.y >= gwBottom)      { newSrcSide = "bottom"; tgtSide = "top"; }
          else                              { newSrcSide = "right"; tgtSide = "left"; }
        }
        const newId = nanoid();
        onAddElement(symbolType, alignedPos, taskType, eventType, newId);
        // Two connectors at once — skip the flash to avoid juggling two
        // independent timers, and dispatch immediately.
        const autoConnType: ConnectorType = diagramType === "state-machine" ? "transition" : "sequence";
        onAddConnector(
          srcFound.source.id, newId,
          autoConnType, defaultDirectionType, defaultRoutingType,
          srcSide, srcTgtSide, 0.5, 0.5
        );
        onAddConnector(
          newId, tgtFound.target.id,
          autoConnType, defaultDirectionType, defaultRoutingType,
          newSrcSide, tgtSide, 0.5, 0.5
        );
        return;
      }

      if (srcFound) {
        // Existing → new (the legacy path, with flash).
        let alignedPos = worldPos;
        let srcSide = srcFound.srcSide;
        let tgtSide = srcFound.tgtSide;
        if (srcSide === "right" && tgtSide === "left") {
          const srcCy = srcFound.source.y + srcFound.source.height / 2;
          newY = srcCy - def.defaultHeight / 2;
          alignedPos = { x: worldPos.x, y: srcCy };
        }
        // Override target side when the new element is a gateway.
        if (symbolType === "gateway") {
          const src = srcFound.source;
          const srcTop = src.y;
          const srcBottom = src.y + src.height;
          const gwTop = newY;
          const gwBottom = newY + def.defaultHeight;
          if (srcBottom <= gwTop) { srcSide = "bottom"; tgtSide = "top"; }
          else if (srcTop >= gwBottom) { srcSide = "top"; tgtSide = "bottom"; }
          else { srcSide = "right"; tgtSide = "left"; }
        }
        const newId = nanoid();
        onAddElement(symbolType, alignedPos, taskType, eventType, newId);
        const src = srcFound.source;
        startAutoConnect(
          src.id, src.x, src.y, src.width, src.height,
          newId, newX, newY, def.defaultWidth, def.defaultHeight,
          srcSide, tgtSide,
        );
        return;
      }

      if (tgtFound) {
        // New → existing (covers e.g. new task placed to the LEFT of an
        // existing EP). Align new.y to target's centre when the
        // new→tgt leg is right→left.
        let alignedPos = worldPos;
        const srcSide = tgtFound.srcSide;
        const tgtSide = tgtFound.tgtSide;
        if (srcSide === "right" && tgtSide === "left") {
          const tgtCy = tgtFound.target.y + tgtFound.target.height / 2;
          newY = tgtCy - def.defaultHeight / 2;
          alignedPos = { x: worldPos.x, y: tgtCy };
        }
        const newId = nanoid();
        onAddElement(symbolType, alignedPos, taskType, eventType, newId);
        const tgt = tgtFound.target;
        startAutoConnect(
          newId, newX, newY, def.defaultWidth, def.defaultHeight,
          tgt.id, tgt.x, tgt.y, tgt.width, tgt.height,
          srcSide, tgtSide,
        );
        return;
      }
    }
    onAddElement(symbolType, worldPos, taskType, eventType);
  }

  // Group-connect feature: when there's a multi-selection and the user
  // double-clicks a gateway that sits to the right of every selected element,
  // create a sequence connector from each selected element to the gateway and
  // mark the gateway as a Merge gateway.
  //
  // The first click of the double-click typically replaces the selection with
  // just the gateway, so we also consult `groupConnectPrevSelectionRef` which
  // captures the pre-click selection at element-mousedown time.
  //
  // Returns true if the group-connect was performed (so the caller skips its
  // default double-click behaviour).
  // Multi-select "diamond" auto-connect (Paul's 2026-06-13 spec). When the
  // selection forms a decision → stacked activities → merge layout and the
  // user double-clicks ANY selected item, wire the whole split/merge at once:
  //   • each activity ABOVE the gateway band attaches to that gateway's TOP
  //     vertex, one OVERLAPPING the band to the inside face (decision RIGHT /
  //     merge LEFT), and one BELOW to the BOTTOM vertex;
  //   • activities take the connector on their LEFT (in) / RIGHT (out);
  //   • both gateways are centred vertically on the activities, roles are set
  //     (decision / merge), pre-existing connectors among the group are
  //     cleared, and the selection is dropped.
  // Fallback: with only a LEFT gateway (no merge) it does the decision →
  // activities split alone (no centre/deselect), mirroring the existing
  // merge-only group-connect. A single RIGHT gateway is left to that handler.
  // Returns true when it handled the double-click.
  function tryDiamondConnect(clicked: DiagramElement): boolean {
    if (diagramType !== "bpmn") return false;

    // Prefer the fresh pre-click capture (a click before the double-click
    // collapses a multi-selection to one). Don't consume it unless we fire.
    let sel: Set<string> = selectedElementIds;
    const cap = groupConnectPrevSelectionRef.current;
    if (cap && Date.now() < cap.expiresAt && cap.ids.size >= 3 && cap.ids.has(clicked.id)) {
      sel = cap.ids;
    }
    if (sel.size < 3 || !sel.has(clicked.id)) return false;

    const ACTIVITY = new Set(["task", "subprocess", "subprocess-expanded"]);
    const chosen = data.elements.filter((e) => sel.has(e.id));
    const gateways = chosen.filter((e) => e.type === "gateway");
    const activities = chosen.filter((e) => ACTIVITY.has(e.type));
    const events = chosen.filter((e) => e.type === "intermediate-event");
    if (gateways.length < 1 || gateways.length > 2) return false;

    // Pick the fan-out target set, requiring the selection to be ONLY
    // gateways + that one target type:
    //   • normal mode → activities (task / subprocess / EP)
    //   • event-based → intermediate events (an event-based gateway fans out
    //     to a deferred choice of catching events). The event-based marker on
    //     the SOURCE gateway is verified once the decision gateway is known.
    let targets: DiagramElement[];
    let eventBasedMode = false;
    if (activities.length >= 2 && events.length === 0
        && gateways.length + activities.length === chosen.length) {
      targets = activities;
    } else if (events.length >= 2 && activities.length === 0
        && gateways.length + events.length === chosen.length) {
      targets = events;
      eventBasedMode = true;
    } else {
      return false;
    }

    const actMinX = Math.min(...targets.map((a) => a.x));
    const actMaxX = Math.max(...targets.map((a) => a.x + a.width));
    const actTop = Math.min(...targets.map((a) => a.y));
    const actBottom = Math.max(...targets.map((a) => a.y + a.height));
    const actCenterY = (actTop + actBottom) / 2;

    // Decision = a gateway strictly LEFT of every activity; merge = strictly RIGHT.
    const decision = gateways.find((g) => g.x + g.width <= actMinX) ?? null;
    const merge = gateways.find((g) => g.x >= actMaxX) ?? null;
    const fullDiamond = !!decision && !!merge;
    const decisionOnly = !!decision && !merge && gateways.length === 1;
    const mergeOnly = !!merge && !decision && gateways.length === 1;
    if (!fullDiamond && !decisionOnly && !mergeOnly) return false;
    // Event-based fan-out requires the SOURCE gateway (the decision, sitting
    // left of the events) to carry the event-based marker.
    if (eventBasedMode && (!decision || decision.gatewayType !== "event-based")) return false;

    // Committed — consume the capture so it can't bleed into a later dblclick.
    groupConnectPrevSelectionRef.current = null;

    // Event-based fan-out needs a Timer branch as the deferred-choice
    // timeout. If none of the selected events is a timer (e.g. they are all
    // receive/message events), synthesise a timer intermediate event below
    // the lowest one and fan out to it as well.
    if (eventBasedMode && decision && !targets.some((e) => e.eventType === "timer")) {
      const bottom = targets.reduce((a, b) => (a.y + a.height >= b.y + b.height ? a : b));
      const tw = bottom.width, th = bottom.height;
      const tx = bottom.x;
      const ty = bottom.y + th + 36;
      const timerId = nanoid();
      onAddElement(
        "intermediate-event",
        { x: tx + tw / 2, y: ty + th / 2 },
        undefined,
        "timer",
        timerId,
        { width: tw, height: th, label: "Timer" },
      );
      targets = [...targets, { ...bottom, id: timerId, x: tx, y: ty, width: tw, height: th, eventType: "timer", label: "Timer" }];
    }

    // Gateway side for an activity, given the gateway's band at the Y it will
    // occupy (centred for a full diamond, current for decision-only).
    const sideFor = (gwTopY: number, gwH: number, act: DiagramElement, inside: Side): Side => {
      if (act.y + act.height <= gwTopY) return "top";
      if (act.y >= gwTopY + gwH) return "bottom";
      return inside;
    };

    const decY = fullDiamond ? actCenterY - decision!.height / 2 : (decision ? decision.y : 0);
    const mrgY = fullDiamond ? actCenterY - merge!.height / 2 : (merge ? merge.y : 0);
    const decAt = decision ? { ...decision, y: decY } : null;
    const mrgAt = merge ? { ...merge, y: mrgY } : null;

    // Number the branches top-to-bottom so the option labels read in order.
    targets.sort((a, b) => a.y - b.y);
    // Always CREATE and place an optionN label on every decision branch,
    // regardless of the gateway's marker. Whether the label is DISPLAYED is
    // decided dynamically at render time from the gateway's current marker
    // (shown for None / Exclusive / Inclusive, hidden for Parallel /
    // Event-based) — so flipping the marker later reveals or hides the
    // already-placed labels without recreating them.

    type Plan = { from: string; to: string; fromSide: Side; toSide: Side; flashFrom: Point; flashTo: Point; label?: string };
    const plans: Plan[] = [];
    targets.forEach((act, i) => {
      if (decision && decAt) {
        const s = sideFor(decY, decision.height, act, "right");
        plans.push({ from: decision.id, to: act.id, fromSide: s, toSide: "left",
          flashFrom: sideMidpoint(decAt, s), flashTo: sideMidpoint(act, "left"),
          label: `option${i + 1}` });
      }
      if (merge && mrgAt) {
        const s = sideFor(mrgY, merge.height, act, "left");
        plans.push({ from: act.id, to: merge.id, fromSide: "right", toSide: s,
          flashFrom: sideMidpoint(act, "right"), flashTo: sideMidpoint(mrgAt, s) });
      }
    });

    const groupIds = new Set<string>(
      [...targets.map((a) => a.id), decision?.id, merge?.id].filter(Boolean) as string[],
    );
    const existing = data.connectors.filter((c) => groupIds.has(c.sourceId) && groupIds.has(c.targetId));
    const deletedFlash = existing.map((c) => ({
      from: c.waypoints[0] ?? { x: 0, y: 0 },
      to: c.waypoints[c.waypoints.length - 1] ?? { x: 0, y: 0 },
    }));

    setGroupFlash({ deleted: deletedFlash, created: plans.map((p) => ({ from: p.flashFrom, to: p.flashTo })), visible: true });
    let cycle = 0;
    const tick = () => {
      cycle++;
      if (cycle >= 6) {
        setGroupFlash(null);
        if (fullDiamond) {
          onMoveElement(decision!.id, decision!.x, decY);
          onMoveElement(merge!.id, merge!.x, mrgY);
        }
        for (const c of existing) onDeleteConnector(c.id);
        for (const p of plans) {
          onAddConnector(p.from, p.to, "sequence", defaultDirectionType, defaultRoutingType, p.fromSide, p.toSide, 0.5, 0.5, undefined, p.label);
        }
        if (decision) onUpdateProperties?.(decision.id, { gatewayRole: "decision" });
        if (merge) {
          // Match the merge's marker to the decision/split gateway's marker
          // (exclusive ×, parallel +, inclusive ○ …) when there is one.
          onUpdateProperties?.(merge.id, {
            gatewayRole: "merge",
            ...(decision ? { gatewayType: decision.gatewayType } : {}),
          });
        }
        if (fullDiamond) onSetSelectedElements(new Set());
        return;
      }
      setGroupFlash((prev) => (prev ? { ...prev, visible: !prev.visible } : null));
      setTimeout(tick, 150);
    };
    setTimeout(tick, 150);
    return true;
  }

  function tryGroupConnectToGateway(targetEl: DiagramElement): boolean {
    if (diagramType !== "bpmn") return false;
    if (tryDiamondConnect(targetEl)) return true;
    if (targetEl.type !== "gateway") return false;

    // Resolve the effective selection: prefer the captured pre-click set if
    // it's still fresh, otherwise fall back to the current selection.
    let effectiveSelection: Set<string> = selectedElementIds;
    const captured = groupConnectPrevSelectionRef.current;
    if (
      captured &&
      Date.now() < captured.expiresAt &&
      captured.ids.size >= 2 &&
      !captured.ids.has(targetEl.id)
    ) {
      effectiveSelection = captured.ids;
    }
    // Consume the capture so it can't bleed into a later double-click
    groupConnectPrevSelectionRef.current = null;

    if (effectiveSelection.size < 2) return false;
    if (effectiveSelection.has(targetEl.id)) return false;

    const sources = data.elements.filter((e) => effectiveSelection.has(e.id));
    if (sources.length < 2) return false;

    // Gateway must be strictly to the right of every selected element
    const gwLeft = targetEl.x;
    const allLeft = sources.every((s) => s.x + s.width <= gwLeft);
    if (!allLeft) return false;

    // ALWAYS connect FROM the source's right edge.
    // Pick the gateway's diamond vertex based on source vertical position:
    //   source clearly above → top vertex
    //   source vertically overlaps → left vertex
    //   source clearly below → bottom vertex
    const gwTop = targetEl.y;
    const gwBottom = targetEl.y + targetEl.height;
    const sourceIds = new Set(sources.map((s) => s.id));

    // Find any existing connectors from a source in the group to this gateway
    // — they'll be deleted before the new connectors are committed.
    const existingToDelete = data.connectors.filter(
      (c) => sourceIds.has(c.sourceId) && c.targetId === targetEl.id,
    );

    // Prepare per-source connection plans (for both flash + commit)
    const plans: Array<{ src: DiagramElement; tgtSide: Side }> = sources.map((src) => {
      const srcBottom = src.y + src.height;
      const srcTop = src.y;
      let tgtSide: Side;
      if (srcBottom <= gwTop) tgtSide = "top";
      else if (srcTop >= gwBottom) tgtSide = "bottom";
      else tgtSide = "left";
      return { src, tgtSide };
    });

    // Build flash overlay endpoints (in world coords)
    const deletedFlash = existingToDelete.map((c) => {
      const wp = c.waypoints;
      // Use the first and last waypoints — they're the actual visible endpoints
      const from = wp[0] ?? { x: 0, y: 0 };
      const to = wp[wp.length - 1] ?? { x: 0, y: 0 };
      return { from, to };
    });
    const createdFlash = plans.map(({ src, tgtSide }) => ({
      from: sideMidpoint(src, "right"),
      to: sideMidpoint(targetEl, tgtSide),
    }));

    // Run a 3-flash animation, then commit the deletes + adds + role change
    setGroupFlash({ deleted: deletedFlash, created: createdFlash, visible: true });
    let cycle = 0;
    const TOTAL_CYCLES = 6; // 3 on + 3 off
    const tick = () => {
      cycle++;
      if (cycle >= TOTAL_CYCLES) {
        setGroupFlash(null);
        // Delete existing connectors
        for (const c of existingToDelete) onDeleteConnector(c.id);
        // Create new connectors (always source.right → gateway.{top|left|bottom})
        for (const { src, tgtSide } of plans) {
          onAddConnector(
            src.id, targetEl.id,
            "sequence", defaultDirectionType, defaultRoutingType,
            "right", tgtSide, 0.5, 0.5,
          );
        }
        // Mark the gateway as a Merge
        onUpdateProperties?.(targetEl.id, { gatewayRole: "merge" });
        return;
      }
      setGroupFlash((prev) => (prev ? { ...prev, visible: !prev.visible } : null));
      setTimeout(tick, 150);
    };
    setTimeout(tick, 150);
    return true;
  }

  function startEditingLabel(el: DiagramElement) {
    // Double-clicking a selected item that forms a diamond split/merge wires
    // it instead of opening the label editor (covers task double-clicks that
    // reach the label path rather than tryGroupConnectToGateway).
    if (tryDiamondConnect(el)) return;
    // Snapshot history once at edit start (for task/subprocess this is used
    // by updateLabelLive per-keystroke without polluting the undo stack).
    onBeginLabelEdit?.(el.id);
    // Events, gateways, data objects, data stores: shape-dblclick is a
    // no-op for these types. The user explicitly asked that only
    // double-clicking the LABEL trigger the focus-edit zoom + editor;
    // the shape body should not. SymbolRenderer renders the label as a
    // separate hit target below the shape with its own inline editor
    // (isEditingGatewayLabel state) and calls onLabelFocusEditStart /
    // End on the Canvas-supplied focus-zoom hooks. Single-click on the
    // shape still selects the element (handled upstream).
    const LABEL_ONLY_ZOOM = new Set([
      "start-event", "intermediate-event", "end-event",
      "gateway", "data-store", "data-object",
    ]);
    if (LABEL_ONLY_ZOOM.has(el.type)) return;

    // Focus-edit zoom: snap the canvas via the shared helper so the
    // element centres at ~20% of the screen width. The textarea's screen
    // coords below are computed using the POST-SNAP zoom/pan so it lines
    // up immediately rather than chasing the canvas during the snap.
    // Restore happens via the useEffect above when setEditingLabel(null)
    // fires from any of the five Enter / Escape / blur exit paths.
    //
    // Pool/Lane special-case: a pool is hundreds of pixels wide so the
    // "only zoom IN" guard would skip the snap entirely. The actual
    // editable text lives in a small textarea positioned just right of
    // the header strip; aim the focus zoom at THAT region so the snap
    // fires and the editor lands centred on screen.
    let zoomCenterX = el.x + el.width / 2;
    let zoomCenterY = el.y + el.height / 2;
    let zoomWorldWidth = el.width;
    if (el.type === "pool" || el.type === "lane") {
      const storedW = el.type === "pool"
        ? (el.properties?.poolHeaderWidth as number | undefined)
        : (el.properties?.laneHeaderWidth as number | undefined);
      const lw = typeof storedW === "number" && storedW > 0 ? storedW : 36;
      const taW = Math.min(180, el.width - lw);
      const taH = Math.min(80, el.height);
      zoomCenterX = el.x + lw + taW / 2;
      zoomCenterY = el.y + taH / 2;
      zoomWorldWidth = taW;
    }
    const snap = enterFocusModeAt(zoomCenterX, zoomCenterY, zoomWorldWidth, "element");
    const effectiveZoom = snap?.focusZoom ?? zoom;
    const effectivePan = snap?.focusPan ?? pan;

    const isOldContainer = el.type === "system-boundary" || el.type === "composite-state" || el.type === "subprocess-expanded" || el.type === "group";
    if (el.type === "pool" || el.type === "lane") {
      // Both pool and lane support dynamic header widths.
      const storedW = el.type === "pool"
        ? (el.properties?.poolHeaderWidth as number | undefined)
        : (el.properties?.laneHeaderWidth as number | undefined);
      const lw = typeof storedW === "number" && storedW > 0 ? storedW : 36;
      setEditingLabel({
        elementId: el.id,
        x: (el.x + lw) * effectiveZoom + effectivePan.x,
        y: el.y * effectiveZoom + effectivePan.y,
        width: Math.min(180, (el.width - lw) * effectiveZoom),
        height: Math.min(80, el.height * effectiveZoom),
        value: el.label,
      });
    } else if (el.type === 'text-annotation') {
      // Size edit box to match visible text area
      const PAD = 10;
      const lineH = 14;
      const avgCharWidth = 12 * 0.55;
      const charsPerLine = Math.max(1, Math.floor((el.width - PAD - 4) / avgCharWidth));
      let lineCount = 0;
      for (const segment of (el.label || ' ').split('\n')) {
        const words = segment.split(' ');
        let current = '';
        for (const word of words) {
          if (!current) { current = word; }
          else if (current.length + 1 + word.length <= charsPerLine) { current += ' ' + word; }
          else { lineCount++; current = word; }
        }
        lineCount++;
      }
      const textH = Math.max(lineH, lineCount * lineH);
      const textTopY = el.y + el.height / 2 - textH / 2;
      setEditingLabel({
        elementId: el.id,
        x: (el.x + PAD) * effectiveZoom + effectivePan.x,
        y: textTopY * effectiveZoom + effectivePan.y,
        width: (el.width - PAD - 4) * effectiveZoom,
        height: (textH + 4) * effectiveZoom,
        value: el.label,
      });
    } else {
      const isUmlElement = el.type === "uml-class" || el.type === "uml-enumeration";
      setEditingLabel({
        elementId: el.id,
        x: el.x * effectiveZoom + effectivePan.x,
        y: el.y * effectiveZoom + effectivePan.y,
        width: el.width * effectiveZoom,
        height: (isOldContainer || isUmlElement) ? HEADER_H * effectiveZoom : el.height * effectiveZoom,
        value: el.label,
      });
    }
  }

  function commitLabel() {
    if (!editingLabel) return;
    const el = data.elements.find((e) => e.id === editingLabel.elementId);
    if (el && el.type === 'use-case') {
      const { w, h } = computeUseCaseSize(editingLabel.value, el.width);
      if (w !== el.width || h !== el.height) {
        onResizeElement(el.id, el.x, el.y, w, h);
      }
    }
    // Decision diamond: grow (aspect-locked) so the label fits the inscribed rect,
    // keeping the diamond centred on its current centre.
    if (el && el.type === 'flowchart-decision') {
      const { w, h } = computeDecisionSize(editingLabel.value);
      if (w !== el.width || h !== el.height) {
        const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
        onResizeElement(el.id, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
      }
    }
    // Auto-resize text-annotation height to fit wrapped text
    if (el && el.type === 'text-annotation') {
      const PAD = 10;
      const lineH = 14;
      const avgCharWidth = 12 * 0.55;
      const charsPerLine = Math.max(1, Math.floor((el.width - PAD - 4) / avgCharWidth));
      let lineCount = 0;
      for (const segment of (editingLabel.value || ' ').split('\n')) {
        const words = segment.split(' ');
        let current = '';
        for (const word of words) {
          if (!current) { current = word; }
          else if (current.length + 1 + word.length <= charsPerLine) { current += ' ' + word; }
          else { lineCount++; current = word; }
        }
        lineCount++;
      }
      const newH = Math.max(30, lineCount * lineH + 8);
      if (newH !== el.height) {
        onResizeElement(el.id, el.x, el.y, el.width, newH);
      }
    }
    onUpdateLabel(editingLabel.elementId, editingLabel.value);
    setEditingLabel(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (readOnly) return;
    const NUDGE = e.shiftKey ? 1 : 5;
    if (selectedElementIds.size === 1 && !editingLabel) {
      const selId = [...selectedElementIds][0];
      const el = data.elements.find((el) => el.id === selId);
      if (el) {
        if (e.key === "ArrowLeft")  { e.preventDefault(); onMoveElement(selId, el.x - NUDGE, el.y); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); onMoveElement(selId, el.x + NUDGE, el.y); return; }
        if (e.key === "ArrowUp")    { e.preventDefault(); onMoveElement(selId, el.x, el.y - NUDGE); return; }
        if (e.key === "ArrowDown")  { e.preventDefault(); onMoveElement(selId, el.x, el.y + NUDGE); return; }
      }
    } else if (selectedElementIds.size > 1 && !editingLabel && onMoveElements) {
      const ids = [...selectedElementIds];
      if (e.key === "ArrowLeft")  { e.preventDefault(); onMoveElements(ids, -NUDGE, 0); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); onMoveElements(ids, NUDGE, 0); return; }
      if (e.key === "ArrowUp")    { e.preventDefault(); onMoveElements(ids, 0, -NUDGE); return; }
      if (e.key === "ArrowDown")  { e.preventDefault(); onMoveElements(ids, 0, NUDGE); return; }
    }
    // Nudge selected connector or focused endpoint with arrow keys.
    // Skip endpoint nudging when the connector attaches centre-to-centre
    // (direct-routing connectors, and associationBPMN involving a data
    // element) — there's no stable boundary offset to nudge against.
    if (selectedConnectorId && selectedElementIds.size === 0 && !editingLabel) {
      const NUDGE = e.shiftKey ? 1 : 5;
      const endpointNudgeBlocked = selectedConnector?.routingType === "direct"
        || (selectedConnector?.type === "associationBPMN" && (() => {
            const DATA = new Set<string>(["data-object", "data-store"]);
            const s = data.elements.find(el => el.id === selectedConnector.sourceId);
            const t = data.elements.find(el => el.id === selectedConnector.targetId);
            return (s && DATA.has(s.type)) || (t && DATA.has(t.type));
          })());
      if (focusedEndpoint && onNudgeConnectorEndpoint && !endpointNudgeBlocked) {
        if (e.key === "ArrowLeft")  { e.preventDefault(); onNudgeConnectorEndpoint(selectedConnectorId, focusedEndpoint, -NUDGE, 0); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); onNudgeConnectorEndpoint(selectedConnectorId, focusedEndpoint, NUDGE, 0); return; }
        if (e.key === "ArrowUp")    { e.preventDefault(); onNudgeConnectorEndpoint(selectedConnectorId, focusedEndpoint, 0, -NUDGE); return; }
        if (e.key === "ArrowDown")  { e.preventDefault(); onNudgeConnectorEndpoint(selectedConnectorId, focusedEndpoint, 0, NUDGE); return; }
      } else if (onNudgeConnector) {
        if (e.key === "ArrowLeft")  { e.preventDefault(); onNudgeConnector(selectedConnectorId, -NUDGE, 0); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); onNudgeConnector(selectedConnectorId, NUDGE, 0); return; }
        if (e.key === "ArrowUp")    { e.preventDefault(); onNudgeConnector(selectedConnectorId, 0, -NUDGE); return; }
        if (e.key === "ArrowDown")  { e.preventDefault(); onNudgeConnector(selectedConnectorId, 0, NUDGE); return; }
      }
    }
    if (e.key === "Escape") {
      setDraggingConnector(null);
      setDraggingEndpoint(null);
      setEditingLabel(null);
      setPendingDrop(null);
      onSetSelectedElements(new Set());
      onSelectConnector(null);
      // Abort any in-progress auto-connect
      if (autoConnectFlash) {
        autoConnectAbortRef.current = true;
        setAutoConnectFlash(null);
      }
      // Cancel connection-creation mode
      if (pendingConnSourceId) setPendingConnSourceId(null);
      if (forceConnect) setForceConnect(null);
      // Dismiss right-click popups
      if (quickAdd) setQuickAdd(null);
      if (themePicker) setThemePicker(null);
      if (elementContextMenu) setElementContextMenu(null);
    }
    if (e.key === "Delete") {
      if (editingLabel) return;
      if (selectedElementIds.size > 0) {
        for (const id of selectedElementIds) onDeleteElement(id);
        onSetSelectedElements(new Set());
      }
      if (selectedConnectorId) onDeleteConnector(selectedConnectorId);
    }
    // Escape ladder for space markers:
    //   • REMOVE mode (2 markers) → drop the 2nd marker, return to INSERT.
    //   • INSERT mode (1 marker)  → drop the 1st marker, return to idle.
    if (e.key === "Escape") {
      if (removalConfirm) {
        setRemovalConfirm(null);
        return;
      }
      // Toolbar-button gestures exit completely on the first Escape —
      // that's the user's expected "back to normal canvas". Clears both
      // markers in one press regardless of insert/remove.
      if (spaceMode) {
        setSpaceMarker(null);
        setSecondSpaceMarker(null);
        setSpaceMarkerPlacing(false);
        setSpaceMode(null);
        return;
      }
      // Ctrl+click gestures keep the step-by-step cascade: drop the 2nd
      // marker first, then the 1st.
      if (secondSpaceMarker) {
        setSecondSpaceMarker(null);
        return;
      }
      if (spaceMarker) {
        setSpaceMarker(null);
        setSpaceMarkerPlacing(false);
      }
    }
    // Enter in REMOVE mode: open the confirmation dialog with the
    // categorised element lists.
    if (e.key === "Enter" && spaceMarker && secondSpaceMarker && !removalConfirm) {
      e.preventDefault();
      const zx = Math.min(spaceMarker.x, secondSpaceMarker.x);
      const zy = Math.min(spaceMarker.y, secondSpaceMarker.y);
      const zw = Math.abs(secondSpaceMarker.x - spaceMarker.x);
      const zh = Math.abs(secondSpaceMarker.y - spaceMarker.y);
      const zR = zx + zw, zB = zy + zh;
      // Mirror the reducer's EP-exempt classifier.
      const epExempt = new Set<string>();
      const epRoots = new Set<string>();
      for (const ep of data.elements) {
        if (ep.type !== "subprocess-expanded") continue;
        epExempt.add(ep.id);
        epRoots.add(ep.id);
        const stack = [ep.id];
        while (stack.length) {
          const cur = stack.pop()!;
          for (const c of data.elements) {
            if ((c.parentId === cur || c.boundaryHostId === cur) && !epExempt.has(c.id)) {
              epExempt.add(c.id);
              stack.push(c.id);
            }
          }
        }
      }
      const STRUCTURAL = new Set<string>(["pool", "lane", "sublane"]);
      // The deletion zone is the visual cross formed by the two strips:
      // a vertical slice [zx, zR] (full height) and a horizontal slice
      // [zy, zB] (full width). When the markers share an axis, that
      // strip collapses to zero extent and the zone becomes a single
      // strip. "Fully inside" → fits in either strip; "overlap" →
      // touches either strip.
      const vActive = zw > 0;
      const hActive = zh > 0;
      const fullyInside = (el: { x: number; y: number; width: number; height: number }) => {
        const inV = vActive && el.x >= zx && el.x + el.width <= zR;
        const inH = hActive && el.y >= zy && el.y + el.height <= zB;
        return inV || inH;
      };
      const partialOverlap = (el: { x: number; y: number; width: number; height: number }) => {
        const ovV = vActive && el.x < zR && el.x + el.width > zx;
        const ovH = hActive && el.y < zB && el.y + el.height > zy;
        return ovV || ovH;
      };
      const toDelete: RsRef[] = [];
      const ignored: RsRef[] = [];
      const affected: RsRef[] = [];
      for (const el of data.elements) {
        if (el.boundaryHostId) continue;            // boundary events ride with their host
        // EP-internal descendants ride with the EP root — don't list them individually.
        if (epExempt.has(el.id) && !epRoots.has(el.id)) continue;
        const ref: RsRef = { id: el.id, label: el.label || "", type: el.type };
        const inside = fullyInside(el);
        const overlap = !inside && partialOverlap(el);
        if (epRoots.has(el.id)) {
          // EPs are exempt from delete; if they touch the zone, they're affected.
          if (inside || overlap) affected.push(ref);
          continue;
        }
        if (STRUCTURAL.has(el.type)) {
          // Structural containers: shrink/shift in the affected list.
          if (inside || overlap) affected.push(ref);
          continue;
        }
        if (inside) toDelete.push(ref);
        else if (overlap) ignored.push(ref);
      }
      setRemovalConfirm({ zone: { x: zx, y: zy, width: zw, height: zh }, toDelete, ignored, affected });
    }
  }

  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;
  const isDraggingConnector = draggingConnector !== null;
  const isDraggingEndpoint = draggingEndpoint !== null;

  // ── Correction #7 (2026-06-07) ──────────────────────────────────────────
  // Auto-scroll the canvas while the user is drawing a connector and their
  // cursor approaches the viewport edge. The connector's rubber-band line
  // already follows the cursor; without auto-scroll the user can't reach
  // any target that isn't already visible in the current pan.
  //
  // While a connector drag is active, an rAF loop reads the latest client
  // mouse position, compares against the SVG's bounding rect, and shifts
  // `pan` proportionally to how far past the threshold the cursor sits.
  // The rubber-band's `currentPos` (a world coordinate) is recomputed
  // against the new pan so the line endpoint visually stays under the
  // cursor — without this the line would lag the pan by one mouse event.
  // panRef + zoomRef live at the top of the component (next to svgRef)
  // so the connector-drag handlers can read them too.
  const lastConnDragClientRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!isDraggingConnector) {
      lastConnDragClientRef.current = null;
      return;
    }
    const EDGE_MARGIN = 60;       // px from edge that starts triggering scroll
    const MAX_SPEED   = 12;       // max pan delta per frame
    const onMove = (ev: MouseEvent) => {
      lastConnDragClientRef.current = { x: ev.clientX, y: ev.clientY };
    };
    window.addEventListener("mousemove", onMove);

    let rafId = 0;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const mouse = lastConnDragClientRef.current;
      const svg = svgRef.current;
      if (!mouse || !svg) return;
      const rect = svg.getBoundingClientRect();

      const leftDist   = mouse.x - rect.left;
      const rightDist  = rect.right - mouse.x;
      const topDist    = mouse.y - rect.top;
      const bottomDist = rect.bottom - mouse.y;

      let dx = 0, dy = 0;
      if (leftDist < EDGE_MARGIN) {
        // Cursor near left edge — shift pan RIGHT so world content slides
        // right under the cursor, exposing what was off-screen left.
        const intensity = Math.max(0, Math.min(1, (EDGE_MARGIN - leftDist) / EDGE_MARGIN));
        dx = intensity * MAX_SPEED;
      } else if (rightDist < EDGE_MARGIN) {
        const intensity = Math.max(0, Math.min(1, (EDGE_MARGIN - rightDist) / EDGE_MARGIN));
        dx = -intensity * MAX_SPEED;
      }
      if (topDist < EDGE_MARGIN) {
        const intensity = Math.max(0, Math.min(1, (EDGE_MARGIN - topDist) / EDGE_MARGIN));
        dy = intensity * MAX_SPEED;
      } else if (bottomDist < EDGE_MARGIN) {
        const intensity = Math.max(0, Math.min(1, (EDGE_MARGIN - bottomDist) / EDGE_MARGIN));
        dy = -intensity * MAX_SPEED;
      }

      if (dx === 0 && dy === 0) return;
      const newPanX = panRef.current.x + dx;
      const newPanY = panRef.current.y + dy;
      const newWorldX = (mouse.x - rect.left - newPanX) / zoomRef.current;
      const newWorldY = (mouse.y - rect.top  - newPanY) / zoomRef.current;
      setPan({ x: newPanX, y: newPanY });
      setDraggingConnector(prev => prev ? { ...prev, currentPos: { x: newWorldX, y: newWorldY } } : null);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, [isDraggingConnector]);

  // Render pools first (deepest), then other containers, then lanes, then regular elements
  const pools = data.elements.filter((el) => el.type === "pool");
  const lanes = data.elements.filter((el) => el.type === "lane")
    .sort((a, b) => {
      // Parent lanes render before (behind) child lanes
      const depthA = a.parentId && data.elements.find(e => e.id === a.parentId)?.type === "lane" ? 1 : 0;
      const depthB = b.parentId && data.elements.find(e => e.id === b.parentId)?.type === "lane" ? 1 : 0;
      return depthA - depthB;
    });
  // Compute sublane IDs: lanes whose parent is also a lane
  const sublaneIds = useMemo(() => {
    const laneIds = new Set(data.elements.filter(e => e.type === "lane").map(e => e.id));
    const result = new Set<string>();
    for (const el of data.elements) {
      if (el.type === "lane" && el.parentId && laneIds.has(el.parentId)) {
        result.add(el.id);
      }
    }
    return result;
  }, [data.elements]);

  // Lane nesting depth (0 = top-level lane, 1 = sublane, 2 = sub-sublane, etc.)
  const laneDepthMap = useMemo(() => {
    const map = new Map<string, number>();
    const byId = new Map(data.elements.map(e => [e.id, e]));
    for (const el of data.elements) {
      if (el.type !== "lane") continue;
      let depth = 0;
      let cur: typeof el | undefined = el;
      const visited = new Set<string>();
      while (cur?.parentId && !visited.has(cur.id)) {
        visited.add(cur.id);
        const parent = byId.get(cur.parentId);
        if (!parent) break;
        if (parent.type === "lane") depth++;
        cur = parent;
      }
      map.set(el.id, depth);
    }
    return map;
  }, [data.elements]);

  // EPs are split out of `otherContainers` so they can render AFTER lanes
  // (issue 5: EPs in lane-pools were being obscured by the lane background).
  // EPs paint between the sublane drag rects and the regular connectors —
  // above lane fills, below child tasks / boundary events.
  const otherContainersUnsorted = data.elements.filter(
    (el) => el.type === "system-boundary" || el.type === "composite-state"
         || el.type === "process-group"
  );
  // Sort containers by nesting depth so parents render before (behind) children
  const otherContainers = (() => {
    const depthMap = new Map<string, number>();
    const containerSet = new Set(otherContainersUnsorted.map(e => e.id));
    function getDepth(el: DiagramElement, visited: Set<string>): number {
      if (depthMap.has(el.id)) return depthMap.get(el.id)!;
      if (!el.parentId || visited.has(el.id)) { depthMap.set(el.id, 0); return 0; }
      visited.add(el.id);
      const parent = containerSet.has(el.parentId) ? otherContainersUnsorted.find(p => p.id === el.parentId) : undefined;
      const d = parent ? getDepth(parent, visited) + 1 : 0;
      depthMap.set(el.id, d);
      return d;
    }
    for (const el of otherContainersUnsorted) getDepth(el, new Set());
    return [...otherContainersUnsorted].sort((a, b) => (depthMap.get(a.id) ?? 0) - (depthMap.get(b.id) ?? 0));
  })();
  // EPs sorted by nesting depth (parent EP behind nested EP) so a child EP
  // paints over its enclosing EP when stacked.
  const expandedSubprocesses = (() => {
    const eps = data.elements.filter((el) => el.type === "subprocess-expanded");
    const depthMap = new Map<string, number>();
    const epSet = new Set(eps.map((e) => e.id));
    function getDepth(el: DiagramElement, visited: Set<string>): number {
      if (depthMap.has(el.id)) return depthMap.get(el.id)!;
      if (!el.parentId || visited.has(el.id)) { depthMap.set(el.id, 0); return 0; }
      visited.add(el.id);
      const parent = epSet.has(el.parentId) ? eps.find((p) => p.id === el.parentId) : undefined;
      const d = parent ? getDepth(parent, visited) + 1 : 0;
      depthMap.set(el.id, d);
      return d;
    }
    for (const el of eps) getDepth(el, new Set());
    // Paint order: larger EPs first (behind), smaller ones last (on top).
    // A nested child always fits inside its parent, so area-descending also
    // satisfies the parent-behind-child rule; but it ALSO handles the case
    // where one EP is resized to merely envelop another it doesn't own —
    // without this the bigger EP's fill paints over and hides the inner one
    // even though there's no parent link. Depth breaks exact-area ties.
    return [...eps].sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      if (Math.abs(areaA - areaB) > 1) return areaB - areaA;
      return (depthMap.get(a.id) ?? 0) - (depthMap.get(b.id) ?? 0);
    });
  })();
  const groupElements = data.elements.filter((el) => el.type === "group");

  // ArchiMate descendant depth: for every archimate-shape, the max
  // depth of its descendant chain (0 = leaf, 1 = parent of leaves,
  // 2 = grandparent, …). Drives per-level fill lightening.
  const archimateDepthMap = useMemo(() => {
    const m = new Map<string, number>();
    const children = new Map<string, string[]>();
    for (const e of data.elements) {
      if (e.parentId) {
        if (!children.has(e.parentId)) children.set(e.parentId, []);
        children.get(e.parentId)!.push(e.id);
      }
    }
    function depth(id: string, visited: Set<string>): number {
      if (m.has(id)) return m.get(id)!;
      if (visited.has(id)) return 0;
      visited.add(id);
      const kids = children.get(id) ?? [];
      if (kids.length === 0) { m.set(id, 0); return 0; }
      let maxChildDepth = 0;
      for (const kid of kids) maxChildDepth = Math.max(maxChildDepth, depth(kid, visited));
      const d = maxChildDepth + 1;
      m.set(id, d);
      return d;
    }
    for (const e of data.elements) if (e.type === "archimate-shape") depth(e.id, new Set());
    return m;
  }, [data.elements]);

  // Compute process-group nesting depth: how many process-group ancestors each has
  const processGroupDepthMap = useMemo(() => {
    const DEPTH_TYPES = new Set(["process-group", "subprocess-expanded"]);
    const map = new Map<string, number>();
    for (const el of data.elements) {
      if (!DEPTH_TYPES.has(el.type)) continue;
      let depth = 0;
      let cur = el;
      const visited = new Set<string>();
      while (cur.parentId && !visited.has(cur.id)) {
        visited.add(cur.id);
        const parent = data.elements.find(p => p.id === cur.parentId);
        if (!parent) break;
        if (parent.type === el.type) depth++; // count ancestors of the same type
        cur = parent;
      }
      map.set(el.id, depth);
    }
    return map;
  }, [data.elements]);

  // Stray-element warning. An eligible element gets a red outline when
  // its centre point sits OUTSIDE every pool's bounding rectangle AND
  // the diagram contains at least one white-box pool.
  //
  // The test is purely geometric — we don't walk the parentId chain.
  // Without that, the scenario the user flagged would mis-fire:
  //   1. delete the only white-box pool       → all stray flags clear
  //   2. drop a new white-box pool that visually covers some elements
  //      whose parentId is still undefined    → those elements would
  //      have been mis-flagged red, because their parentId never
  //      auto-updates just because a pool grew around them.
  // With geometric containment they read as "inside" the new pool and
  // stay un-flagged. Elements physically outside the new pool stay
  // (correctly) red until the user drags them in.
  //
  // Eligible types (per user list — gateway and the artifacts
  // text-annotation/group are deliberately excluded; the artifacts can
  // legitimately float, gateways were not in the user's list):
  //   task, subprocess, subprocess-expanded,
  //   start-event, intermediate-event, end-event,
  //   data-object, data-store.
  const strayElementIds = useMemo(() => {
    const ids = new Set<string>();
    const pools = data.elements.filter((e) => e.type === "pool");
    const hasWhiteBox = pools.some((p) => p.properties.poolType === "white-box");
    if (!hasWhiteBox) return ids;
    const STRAY_ELIGIBLE = new Set<string>([
      "task", "subprocess", "subprocess-expanded",
      "start-event", "intermediate-event", "end-event",
      "data-object", "data-store",
    ]);
    function insideAnyPool(el: DiagramElement): boolean {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      for (const p of pools) {
        if (cx >= p.x && cx <= p.x + p.width && cy >= p.y && cy <= p.y + p.height) return true;
      }
      return false;
    }
    for (const el of data.elements) {
      if (!STRAY_ELIGIBLE.has(el.type)) continue;
      if (el.boundaryHostId) continue; // attached to a host — host's pool counts
      if (!insideAnyPool(el)) ids.add(el.id);
    }
    return ids;
  }, [data.elements]);

  // Sort non-containers by parent nesting depth so children of deeper subprocesses render on top
  const nonContainers = (() => {
    const items = data.elements.filter(
      (el) => el.type !== "system-boundary" && el.type !== "composite-state"
                && el.type !== "pool" && el.type !== "lane"
                && el.type !== "subprocess-expanded"
                && el.type !== "group"
                && el.type !== "process-group"
                && !el.boundaryHostId
    );
    function getParentDepth(el: DiagramElement): number {
      let depth = 0;
      let current = el;
      const visited = new Set<string>();
      while (current.parentId && !visited.has(current.id)) {
        visited.add(current.id);
        const parent = data.elements.find(p => p.id === current.parentId);
        if (!parent) break;
        depth++;
        current = parent;
      }
      return depth;
    }
    return items.sort((a, b) => {
      // Dragging text-annotation renders LAST so it sits above all other
      // non-container elements while the user moves it (requested UX).
      const aDragAnno = a.id === draggingElementId && a.type === "text-annotation";
      const bDragAnno = b.id === draggingElementId && b.type === "text-annotation";
      if (aDragAnno && !bDragAnno) return 1;
      if (bDragAnno && !aDragAnno) return -1;
      return getParentDepth(a) - getParentDepth(b);
    });
  })();
  const boundaryEvents = data.elements.filter((el) => !!el.boundaryHostId);

  // Active multi-selection (e.g. a template was just stamped onto the
  // diagram). When non-empty, those elements are re-rendered at the
  // END of the world group so the whole moving group sits visually on
  // top of every existing diagram element — pools / lanes / tasks
  // alike. Matches the user spec: every part of the moving template
  // should always be above anything on the existing diagram.
  const inActiveGroup = (id: string): boolean =>
    selectedElementIds.size > 1 && selectedElementIds.has(id);
  const hasActiveGroup = selectedElementIds.size > 1;

  // Precompute messageBPMN highlight context
  const BPMN_TRIGGER_TYPES = new Set<string>(["task", "subprocess", "subprocess-expanded", "intermediate-event", "end-event", "pool"]);
  const draggingSourceEl = draggingConnector
    ? (data.elements.find((e) => e.id === draggingConnector.fromId) ?? null)
    : null;
  const isBpmnSource = draggingSourceEl ? BPMN_TRIGGER_TYPES.has(draggingSourceEl.type) : false;
  const draggingSourcePoolId = draggingSourceEl
    ? getElementPoolId(draggingSourceEl, data.elements)
    : null;
  const draggingSourceIsData = draggingSourceEl ? DATA_ELEMENT_TYPES.has(draggingSourceEl.type) : false;
  const draggingFromPool = draggingSourceEl?.type === "pool";
  const draggingFromFreeEndEvent =
    draggingSourceEl?.type === "end-event" && !draggingSourceEl.boundaryHostId;
  const draggingFromEdgeMountedEndEvent =
    draggingSourceEl?.type === "end-event" && !!draggingSourceEl.boundaryHostId;
  const draggingFromEdgeMountedStartEvent =
    draggingSourceEl?.type === "start-event" && !!draggingSourceEl.boundaryHostId;
  const draggingFromEdgeMountedIntermediateSendEvent =
    draggingSourceEl?.type === "intermediate-event" &&
    !!draggingSourceEl.boundaryHostId &&
    (draggingSourceEl.flowType === "throwing" || (draggingSourceEl.flowType == null && draggingSourceEl.taskType === "send"));
  const draggingFromEdgeMountedIntermediateReceiveEvent =
    draggingSourceEl?.type === "intermediate-event" &&
    !!draggingSourceEl.boundaryHostId &&
    draggingSourceEl.flowType === "catching";
  const draggingFromEdgeMountedIntermediateEvent =
    draggingFromEdgeMountedIntermediateSendEvent || draggingFromEdgeMountedIntermediateReceiveEvent;
  const draggingSourceBoundaryHostId = draggingSourceEl?.boundaryHostId ?? null;
  // State-machine: no connections FROM final-state or TO initial-state
  const draggingFromFinalState = draggingSourceEl?.type === "final-state";
  // BPMN: no sequence from Event Expanded Subprocess
  const draggingFromEventSubprocess = draggingSourceEl?.type === "subprocess-expanded" &&
    (draggingSourceEl.properties.subprocessType as string | undefined) === "event";
  // BPMN: no sequence from inside an Event Expanded Subprocess to outside
  const draggingFromInsideEventSubprocess = (() => {
    if (!draggingSourceEl?.parentId) return false;
    const p = data.elements.find(e => e.id === draggingSourceEl!.parentId);
    return p?.type === "subprocess-expanded" && (p.properties.subprocessType as string | undefined) === "event";
  })();
  const CHILD_EVENT_TYPES_HIGHLIGHT = new Set(["start-event", "intermediate-event", "end-event"]);
  // Compute ancestor IDs for dragging source (treating boundaryHostId as parent)
  const draggingSourceAncestorIds = (() => {
    if (!draggingSourceEl) return new Set<string>();
    const ids = new Set<string>();
    let cur: DiagramElement | undefined = draggingSourceEl;
    const visited = new Set<string>();
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      const nextId: string | undefined = cur.boundaryHostId ?? cur.parentId;
      if (nextId) { ids.add(nextId); cur = data.elements.find(e => e.id === nextId); }
      else break;
    }
    return ids;
  })();
  const draggingFromChildEvent =
    draggingSourceEl != null &&
    CHILD_EVENT_TYPES_HIGHLIGHT.has(draggingSourceEl.type) &&
    !draggingSourceEl.boundaryHostId &&
    !!draggingSourceEl.parentId;
  const draggingSourceParentId = draggingSourceEl?.parentId ?? null;
  // Edge-mounted event on a child element inside an expanded subprocess
  const draggingFromBoundaryOnChild =
    draggingSourceEl != null &&
    CHILD_EVENT_TYPES_HIGHLIGHT.has(draggingSourceEl.type) &&
    !!draggingSourceEl.boundaryHostId &&
    data.elements.some(e => e.id === draggingSourceEl.boundaryHostId && !!e.parentId);
  const draggingSourceHostParentId = draggingFromBoundaryOnChild
    ? data.elements.find(e => e.id === draggingSourceEl!.boundaryHostId)?.parentId ?? null
    : null;

  // Compute misaligned messageBPMN connectors: (a) no x-overlap between source
  // and target, or (b) attached to a white-box pool (messages can only touch
  // black-box pools or flow elements, not white-box pools). Both cases flag
  // the connector for red rendering so the user can see the orphan.
  const misalignedConnectorIds = new Set<string>();
  const errorTargetIds = new Set<string>();
  const isWhiteBoxPool = (el: DiagramElement | undefined): boolean =>
    !!el && el.type === "pool"
      && ((el.properties.poolType as string | undefined) ?? "black-box") === "white-box";
  data.connectors
    .filter((c) => c.type === "messageBPMN")
    .forEach((c) => {
      const src = data.elements.find((e) => e.id === c.sourceId);
      const tgt = data.elements.find((e) => e.id === c.targetId);
      if (src && tgt) {
        if (isWhiteBoxPool(src) || isWhiteBoxPool(tgt)) {
          misalignedConnectorIds.add(c.id);
          errorTargetIds.add(c.targetId);
          return;
        }
        const overlapMax = Math.min(src.x + src.width, tgt.x + tgt.width);
        const overlapMin = Math.max(src.x, tgt.x);
        if (overlapMax <= overlapMin) {
          misalignedConnectorIds.add(c.id);
          errorTargetIds.add(c.targetId);
        }
      }
    });

  // Detect connectors whose path passes through elements (obstacle violations) — domain diagrams only
  const obstacleViolationConnIds = new Set<string>();
  const obstacleViolationElementIds = new Set<string>();
  // Gateway branch labels (labelAnchor "source") are SUPPRESSED — not
  // deleted — while their source gateway's marker is Parallel or
  // Event-based, since those markers carry no branch conditions. Computed
  // every render so flipping the marker back to None/Exclusive/Inclusive
  // re-reveals the stored optionN labels exactly where they were placed.
  const hiddenBranchLabelConnIds = new Set<string>();
  {
    const gwMarker = new Map<string, string>();
    for (const e of data.elements) if (e.type === "gateway") gwMarker.set(e.id, e.gatewayType ?? "exclusive");
    for (const c of data.connectors) {
      if (c.labelAnchor !== "source") continue;
      const m = gwMarker.get(c.sourceId);
      if (m === "parallel" || m === "event-based") hiddenBranchLabelConnIds.add(c.id);
    }
  }

  // Process-Context association highlight: when an element (or a GROUP) is
  // selected, its association connectors and the elements at the other end
  // light up green, and every OTHER element/connector is greyed out — except
  // the Process Group boundary, which always stays visible. Lets you see what
  // a given Actor / Team / System / Process (or selected group) connects to.
  const assocHighlightConnIds = new Set<string>();
  const assocHighlightElIds = new Set<string>();
  const assocActiveElIds = new Set<string>();
  let assocActive = false;
  // While the user is drawing a new connector, suspend the grey-out so every
  // element is a visible drop target. Once the connector completes,
  // draggingConnector clears and this recomputes from data.connectors — so the
  // newly connected element is automatically folded into the highlight.
  if ((diagramType === "process-context" || diagramType === "archimate") && selectedElementIds.size >= 1 && !draggingConnector) {
    for (const c of data.connectors) {
      const srcSel = selectedElementIds.has(c.sourceId);
      const tgtSel = selectedElementIds.has(c.targetId);
      if (srcSel || tgtSel) {
        assocHighlightConnIds.add(c.id);
        if (!srcSel) assocHighlightElIds.add(c.sourceId);
        if (!tgtSel) assocHighlightElIds.add(c.targetId);
      }
    }
    assocActive = assocHighlightConnIds.size > 0;
    if (assocActive) {
      for (const id of selectedElementIds) assocActiveElIds.add(id);
      for (const id of assocHighlightElIds) assocActiveElIds.add(id);
    }
  }
  const ASSOC_KEEP_VISIBLE = new Set(["system-boundary", "system-boundary-body"]);
  const isAssocFadedEl = (el: DiagramElement) =>
    assocActive && !assocActiveElIds.has(el.id) && !ASSOC_KEEP_VISIBLE.has(el.type);
  const isAssocFadedConn = (c: Connector) =>
    assocActive && !assocHighlightConnIds.has(c.id);
  function segCrossesRect(p1: Point, p2: Point, r: { x: number; y: number; w: number; h: number }): boolean {
    const left = r.x, right = r.x + r.w, top = r.y, bottom = r.y + r.h;
    if (Math.abs(p1.y - p2.y) < 1) {
      if (p1.y < top || p1.y > bottom) return false;
      return Math.max(p1.x, p2.x) > left && Math.min(p1.x, p2.x) < right;
    }
    if (Math.abs(p1.x - p2.x) < 1) {
      if (p1.x < left || p1.x > right) return false;
      return Math.max(p1.y, p2.y) > top && Math.min(p1.y, p2.y) < bottom;
    }
    // Diagonal
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    for (const ey of [top, bottom]) {
      if (Math.abs(dy) > 0.01) { const t = (ey - p1.y) / dy; if (t >= 0 && t <= 1) { const ix = p1.x + dx * t; if (ix >= left && ix <= right) return true; } }
    }
    for (const ex of [left, right]) {
      if (Math.abs(dx) > 0.01) { const t = (ex - p1.x) / dx; if (t >= 0 && t <= 1) { const iy = p1.y + dy * t; if (iy >= top && iy <= bottom) return true; } }
    }
    return false;
  }
  const isDbDomain = diagramType === "domain" && data.database && data.database !== "none";
  if (diagramType === "domain" && !isDbDomain) for (const conn of data.connectors) {
    const wp = conn.waypoints;
    if (wp.length < 3) continue;
    const vs = conn.sourceInvisibleLeader ? 1 : 0;
    const ve = conn.targetInvisibleLeader ? wp.length - 2 : wp.length - 1;
    const visible = wp.slice(vs, ve + 1);
    const interior = wp.slice(vs + 1, ve);
    for (const el of data.elements) {
      if (el.type === "pool" || el.type === "lane") continue;
      const b = { x: el.x, y: el.y, w: el.width, h: el.height };
      const isOwn = el.id === conn.sourceId || el.id === conn.targetId;
      let violation = false;
      if (isOwn) {
        // Check if interior waypoints or segments pass through own source/target
        for (const pt of interior) {
          if (pt.x > b.x + 1 && pt.x < b.x + b.w - 1 && pt.y > b.y + 1 && pt.y < b.y + b.h - 1) { violation = true; break; }
        }
        if (!violation) {
          for (let i = 0; i < interior.length - 1; i++) {
            if (segCrossesRect(interior[i], interior[i + 1], b)) { violation = true; break; }
          }
        }
      } else {
        if (el.boundaryHostId === conn.sourceId || el.boundaryHostId === conn.targetId) continue;
        // Check waypoints inside OR segments crossing
        for (const pt of visible) {
          if (pt.x > b.x && pt.x < b.x + b.w && pt.y > b.y && pt.y < b.y + b.h) { violation = true; break; }
        }
        if (!violation) {
          for (let i = 0; i < visible.length - 1; i++) {
            if (segCrossesRect(visible[i], visible[i + 1], b)) { violation = true; break; }
          }
        }
      }
      if (violation) {
        obstacleViolationConnIds.add(conn.id);
        obstacleViolationElementIds.add(el.id);
      }
    }
  }

  // Endpoint handle positions for selected connector
  const selectedConnector: Connector | null =
    selectedConnectorId
      ? (data.connectors.find((c) => c.id === selectedConnectorId) ?? null)
      : null;

  // Force-connect handler: Shift+Ctrl+Click starts, next click on target creates forced sequence connector
  function handleForceConnectSelect(elId: string, ev?: React.MouseEvent): boolean {
    if (diagramType !== "bpmn") return false;
    // Start force-connect: Shift+Ctrl+Click on an element
    if (ev?.shiftKey && ev?.ctrlKey) {
      setForceConnect({ sourceId: elId, dragging: true });
      onSetSelectedElements(new Set([elId]));
      return true;
    }
    // Complete force-connect: click on target while in force-connect mode
    if (forceConnect?.dragging && forceConnect.sourceId !== elId) {
      const src = data.elements.find(e => e.id === forceConnect.sourceId);
      const tgt = data.elements.find(e => e.id === elId);
      if (src && tgt) {
        const srcCx = src.x + src.width / 2;
        const tgtCx = tgt.x + tgt.width / 2;
        const srcCy = src.y + src.height / 2;
        const tgtCy = tgt.y + tgt.height / 2;
        let srcSide: Side, tgtSide: Side;
        if (Math.abs(tgtCy - srcCy) > Math.abs(tgtCx - srcCx)) {
          srcSide = tgtCy > srcCy ? "bottom" : "top";
          tgtSide = tgtCy > srcCy ? "top" : "bottom";
        } else {
          srcSide = "right";
          tgtSide = "left";
        }
        onAddConnector(forceConnect.sourceId, elId, "sequence", "directed", "rectilinear", srcSide, tgtSide, 0.5, 0.5, true);
      }
      setForceConnect(null);
      return true;
    }
    return false;
  }

  const endpointHandles = selectedConnector && selectedConnector.waypoints.length >= 2
    ? (() => {
        const wp = selectedConnector.waypoints;
        // messageBPMN has two waypoint formats (2-point AI import and 4-point
        // runtime). The edge points are determined by the invisible-leader
        // flags. All other connector types use [1] and [length-2].
        const isMsg = selectedConnector.type === "messageBPMN";
        const srcIdx = isMsg && !selectedConnector.sourceInvisibleLeader ? 0 : 1;
        const tgtIdx = isMsg && !selectedConnector.targetInvisibleLeader ? wp.length - 1 : wp.length - 2;
        return { source: wp[srcIdx], target: wp[tgtIdx] };
      })()
    : null;

  // Context for highlighting valid drop targets during messageBPMN endpoint drag
  const draggingEndpointConn = draggingEndpoint
    ? data.connectors.find(c => c.id === draggingEndpoint.connectorId) ?? null
    : null;
  const isMessageBpmnEndpointDrag = draggingEndpointConn?.type === "messageBPMN";
  const epDragFixedId = draggingEndpoint && draggingEndpointConn
    ? (draggingEndpoint.endpoint === "source" ? draggingEndpointConn.targetId : draggingEndpointConn.sourceId)
    : null;
  const epDragFixedEl = epDragFixedId
    ? data.elements.find(e => e.id === epDragFixedId) ?? null
    : null;
  const epDragFixedPoolId = epDragFixedEl ? getElementPoolId(epDragFixedEl, data.elements) : null;

  // Context for highlighting valid drop targets during associationBPMN endpoint drag
  const isAssocBpmnEndpointDrag = draggingEndpointConn?.type === "associationBPMN";
  const epDragMovingId = draggingEndpoint && draggingEndpointConn
    ? (draggingEndpoint.endpoint === "source" ? draggingEndpointConn.sourceId : draggingEndpointConn.targetId)
    : null;
  const epDragFixedIsData = epDragFixedEl ? DATA_ELEMENT_TYPES.has(epDragFixedEl.type) : false;

  // For messageBPMN endpoint drag: the element the moving end is currently
  // attached to. User rules:
  //   - Pool endpoint moves to another pool.
  //   - Task/Subprocess endpoint moves to another task/subprocess inside a
  //     white-box pool.
  //   - Arrowhead (target) endpoint may ALSO attach to a Start or Intermediate
  //     event (receive-capable) inside a white-box pool.
  //   - Source (start) endpoint may ALSO attach to an Intermediate or End
  //     event (send-capable) inside a white-box pool.
  const MSG_TASKSUB_TYPES: Set<SymbolType> = new Set(["task", "subprocess", "subprocess-expanded"]);
  const MSG_RECEIVE_EVENT_TYPES: Set<SymbolType> = new Set(["start-event", "intermediate-event"]);
  const MSG_SEND_EVENT_TYPES: Set<SymbolType> = new Set(["intermediate-event", "end-event"]);
  const epDragMovingEl = epDragMovingId
    ? data.elements.find(e => e.id === epDragMovingId) ?? null
    : null;
  // Which event types are valid for the end being dragged.
  const epDragMsgEventTypes: Set<SymbolType> | null = isMessageBpmnEndpointDrag && draggingEndpoint
    ? (draggingEndpoint.endpoint === "target" ? MSG_RECEIVE_EVENT_TYPES : MSG_SEND_EVENT_TYPES)
    : null;

  return (
    <div
      className="relative flex-1 overflow-hidden bg-gray-50 select-none"
      style={{
        backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* Context-Diagram defaults differ: Entity Names 14 px, Flow Labels
          12 px, Process Names 16 px. Other diagram types keep the old
          12/10/14 defaults. */}
      <DisplayModeCtx.Provider value={displayMode}>
      <FontScaleCtx.Provider value={((data.fontSize ?? ((diagramType === "context" || diagramType === "basic" || diagramType === "archimate") ? 14 : 12)) / 12) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <ConnectorFontScaleCtx.Provider value={((data.connectorFontSize ?? ((diagramType === "context" || diagramType === "basic") ? 12 : 10)) / 10) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <TitleFontSizeCtx.Provider value={data.titleFontSize ?? 14}>
      <PoolFontSizeCtx.Provider value={(data.poolFontSize ?? 12) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <LaneFontSizeCtx.Provider value={(data.laneFontSize ?? 12) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <ValueChainFontSizeCtx.Provider value={(data.valueChainFontSize ?? 16) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <DescriptionFontSizeCtx.Provider value={(data.descriptionFontSize ?? 14) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <ProcessFontSizeCtx.Provider value={(data.processFontSize ?? 16) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <SublaneIdsCtx.Provider value={sublaneIds}>
      <ProcessGroupDepthCtx.Provider value={processGroupDepthMap}>
      <LaneDepthCtx.Provider value={laneDepthMap}>
      <ArchimateDepthCtx.Provider value={archimateDepthMap}>
      <DatabaseCtx.Provider value={data.database}>
      <svg
        ref={svgRef}
        data-canvas
        // dgx-pan applies grab cursor on the canvas background; :active
        // swaps to grabbing while the user is mid-pan-drag. Elements
        // override with their own grabbing cursors via .dgx-grab.
        className="w-full h-full outline-none dgx-pan"
        tabIndex={0}
        onMouseDownCapture={(e) => {
          // Don't steal focus when the click landed inside a
          // foreignObject — that's where the inline label editors
          // (event / gateway / data-object / data-store) live, and
          // they NEED to keep keyboard focus so clicks inside the
          // textarea can place the cursor / extend selection. Capture
          // phase fires BEFORE the textarea's own handlers, so without
          // this guard the SVG steals focus on every click and the
          // textarea blurs → commits.
          const t = e.target as Element;
          if (t && typeof t.closest === "function" && t.closest("foreignObject")) return;
          svgRef.current?.focus({ preventScroll: true });
        }}
        onMouseDown={handleBackgroundMouseDown}
        onWheel={handleWheel}
        onDrop={(e) => { setPoolDropPreview(null); handleDrop(e); }}
        onDragOver={(e) => {
          e.preventDefault();
          // Pool/Lane drop preview: only when dragging the "pool" symbol
          // over an existing pool. Computes the insertion line based on
          // cursor Y exactly as the reducer's drop logic will.
          if (pendingDragSymbol !== "pool") {
            if (poolDropPreview) setPoolDropPreview(null);
            return;
          }
          const rect = svgRef.current!.getBoundingClientRect();
          const wp = svgToWorld(e.clientX - rect.left, e.clientY - rect.top);
          const target = data.elements.find(
            (el) =>
              el.type === "pool" &&
              wp.x >= el.x && wp.x <= el.x + el.width &&
              wp.y >= el.y && wp.y <= el.y + el.height,
          );
          if (!target) {
            if (poolDropPreview) setPoolDropPreview(null);
            return;
          }
          const lanes = data.elements
            .filter((el) => el.type === "lane" && el.parentId === target.id)
            .sort((a, b) => a.y - b.y);
          if (lanes.length === 0) {
            // Will split pool into 2 lanes — no overlay needed.
            if (poolDropPreview) setPoolDropPreview(null);
            return;
          }
          const TOP_BOTTOM = 20;
          const SEP = 15;
          const LANE_EDGE = 10;
          const dy = wp.y - target.y;
          const poolBot = target.y + target.height;
          let preview: typeof poolDropPreview = null;
          // Outer zones: pool-level insertions
          if (dy <= TOP_BOTTOM) {
            preview = { x1: target.x, y1: target.y, x2: target.x + target.width, y2: target.y, kind: "lane" };
          } else if (poolBot - wp.y <= TOP_BOTTOM) {
            preview = { x1: target.x, y1: poolBot, x2: target.x + target.width, y2: poolBot, kind: "lane" };
          } else {
            // Check pool-level separators (between top-level lanes)
            let onSep = false;
            for (let i = 0; i < lanes.length - 1; i++) {
              const sep = lanes[i].y + lanes[i].height;
              if (Math.abs(wp.y - sep) <= SEP) {
                preview = { x1: target.x, y1: sep, x2: target.x + target.width, y2: sep, kind: "lane" };
                onSep = true;
                break;
              }
            }
            if (!onSep) {
              // Cursor inside a specific lane — its sublanes (if any)
              // determine the next-level zone logic.
              const cursorLane = lanes.find((ln) => wp.y >= ln.y && wp.y <= ln.y + ln.height);
              if (cursorLane) {
                const sublanes = data.elements
                  .filter((e) => e.type === "lane" && e.parentId === cursorLane.id)
                  .sort((a, b) => a.y - b.y);
                if (sublanes.length === 0) {
                  // No sublanes: middle ⅓ → split (blue), else fallback bottom of lane (green).
                  if (wp.y >= cursorLane.y + cursorLane.height / 3 && wp.y <= cursorLane.y + (cursorLane.height * 2) / 3) {
                    const midY = cursorLane.y + cursorLane.height / 2;
                    preview = { x1: cursorLane.x, y1: midY, x2: cursorLane.x + cursorLane.width, y2: midY, kind: "sublane" };
                  } else {
                    const insertY = cursorLane.y + cursorLane.height;
                    preview = { x1: target.x, y1: insertY, x2: target.x + target.width, y2: insertY, kind: "lane" };
                  }
                } else {
                  // Lane has sublanes — six-zone logic.
                  const dyInLane = wp.y - cursorLane.y;
                  const laneBottomDist = cursorLane.y + cursorLane.height - wp.y;
                  if (dyInLane <= LANE_EDGE) {
                    preview = { x1: target.x, y1: cursorLane.y, x2: target.x + target.width, y2: cursorLane.y, kind: "lane" };
                  } else if (laneBottomDist <= LANE_EDGE) {
                    const ins = cursorLane.y + cursorLane.height;
                    preview = { x1: target.x, y1: ins, x2: target.x + target.width, y2: ins, kind: "lane" };
                  } else {
                    const splitTarget = sublanes.find(
                      (s) => wp.y >= s.y + s.height / 3 && wp.y <= s.y + (s.height * 2) / 3,
                    );
                    if (splitTarget) {
                      const midY = splitTarget.y + splitTarget.height / 2;
                      preview = { x1: splitTarget.x, y1: midY, x2: splitTarget.x + splitTarget.width, y2: midY, kind: "subsublane" };
                    } else if (wp.y <= sublanes[0].y + sublanes[0].height / 3) {
                      preview = { x1: cursorLane.x, y1: cursorLane.y, x2: cursorLane.x + cursorLane.width, y2: cursorLane.y, kind: "sublane" };
                    } else {
                      const lastSub = sublanes[sublanes.length - 1];
                      if (wp.y >= lastSub.y + (lastSub.height * 2) / 3) {
                        const ins = cursorLane.y + cursorLane.height;
                        preview = { x1: cursorLane.x, y1: ins, x2: cursorLane.x + cursorLane.width, y2: ins, kind: "sublane" };
                      } else {
                        // Between adjacent sublanes — pick separator on the cursor's half.
                        const cursorSub = sublanes.find((s) => wp.y >= s.y && wp.y <= s.y + s.height);
                        if (cursorSub) {
                          const isUpper = wp.y - cursorSub.y < cursorSub.height / 2;
                          const sepY = isUpper ? cursorSub.y : cursorSub.y + cursorSub.height;
                          preview = { x1: cursorLane.x, y1: sepY, x2: cursorLane.x + cursorLane.width, y2: sepY, kind: "sublane" };
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          // Only update if changed to avoid render thrash.
          const same = preview && poolDropPreview &&
            preview.x1 === poolDropPreview.x1 && preview.y1 === poolDropPreview.y1 &&
            preview.x2 === poolDropPreview.x2 && preview.y2 === poolDropPreview.y2 &&
            preview.kind === poolDropPreview.kind;
          if (!same) setPoolDropPreview(preview);
        }}
        onDragLeave={() => { if (poolDropPreview) setPoolDropPreview(null); }}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => {
          if (readOnly || (diagramType !== "bpmn" && diagramType !== "state-machine" && diagramType !== "value-chain")) return;
          e.preventDefault();
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          // If 2+ process elements selected, show theme picker instead of quick-add
          const CHEVRON_SET = new Set(["chevron", "chevron-collapsed"]);
          const selectedChevrons = data.elements.filter(
            el => selectedElementIds.has(el.id) && CHEVRON_SET.has(el.type)
          );
          if (selectedChevrons.length >= 2 && onUpdatePropertiesBatch) {
            setThemePicker({
              screenX: e.clientX - rect.left,
              screenY: e.clientY - rect.top,
            });
            return;
          }
          const worldPos = svgToWorld(e.clientX - rect.left, e.clientY - rect.top);
          // Element-specific right-click menus: hit-test the worldPos
          // against elements in reverse paint order (topmost first) and
          // pick a supported type. Containers (pool/lane) are skipped so a
          // task inside a lane gets the task menu, not a pool menu.
          const ELEMENT_KIND: Record<string, "task" | "gateway" | "subprocess" | "data-object" | "event"> = {
            "task": "task",
            "gateway": "gateway",
            "subprocess": "subprocess",
            "subprocess-expanded": "subprocess",
            "data-object": "data-object",
            "data-store": "data-object",
            "start-event": "event",
            "intermediate-event": "event",
            "end-event": "event",
          };
          let hit: { id: string; kind: "task" | "gateway" | "subprocess" | "data-object" | "event" } | null = null;
          for (let i = data.elements.length - 1; i >= 0; i--) {
            const el = data.elements[i];
            if (worldPos.x < el.x || worldPos.x > el.x + el.width) continue;
            if (worldPos.y < el.y || worldPos.y > el.y + el.height) continue;
            const kind = ELEMENT_KIND[el.type];
            if (kind) { hit = { id: el.id, kind }; break; }
          }
          if (hit) {
            setElementContextMenu({
              elementId: hit.id,
              kind: hit.kind,
              screenX: e.clientX - rect.left,
              screenY: e.clientY - rect.top,
            });
            return;
          }
          // Empty canvas (or element type we don't have a menu for) →
          // fall back to the shape quick-add palette.
          setQuickAdd({
            worldPos,
            screenX: e.clientX - rect.left,
            screenY: e.clientY - rect.top,
          });
        }}
        // While dragging a connector / endpoint, force crosshair on the
        // whole canvas. Otherwise let the .dgx-pan class on <svg> drive
        // the grab/grabbing pan cursor.
        style={isDraggingConnector || isDraggingEndpoint ? { cursor: "crosshair" } : undefined}
      >
        <SketchyFilter />
        <g transform={transform} style={{ ...(displayMode === "hand-drawn" ? { fontStyle: "italic", fontFamily: "var(--font-caveat), 'Segoe Print', 'Comic Sans MS', cursive" } : undefined), ...(readOnly ? { pointerEvents: "none" } : undefined) }}>
          {/* Diagram Title Block */}
          {data.title?.showTitle && (() => {
            const els = data.elements;
            if (els.length === 0) return null;
            let minX = Infinity, maxX = -Infinity, minY = Infinity;
            for (const el of els) {
              const l = el.x, r = el.x + el.width, t = el.y;
              if (l < minX) minX = l;
              if (r > maxX) maxX = r;
              if (t < minY) minY = t;
            }
            const cx = (minX + maxX) / 2;
            const title = data.title;
            const statusLabel = (title.status ?? "draft").charAt(0).toUpperCase() + (title.status ?? "draft").slice(1);
            // Format datetime in AEST/AEDT
            function formatAustralianTime(iso: string): string {
              const d = new Date(iso);
              try {
                return d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "short" });
              } catch { return d.toLocaleString(); }
            }
            function formatAustralianDate(iso: string): string {
              const d = new Date(iso);
              try {
                return d.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" });
              } catch { return d.toLocaleDateString(); }
            }
            // Line 1: Diagram Name (bold, larger)
            // Line 2: Version + Author/s
            // Line 3: Status + Created
            // Line 4: Modified
            // Each sub-line is an array of { label, value } segments
            type Seg = { label: string; value: string };
            const line2Segs: Seg[] = [];
            if (title.version) line2Segs.push({ label: "Version ", value: title.version });
            if (title.authors) line2Segs.push({ label: "Author/s: ", value: title.authors });
            const line3Segs: Seg[] = [];
            line3Segs.push({ label: "Status: ", value: statusLabel });
            if (data.database && data.database !== "none") {
              const DB_LABELS: Record<string, string> = { postgres: "PostgreSQL", mysql: "MySQL", mssql: "SQL Server" };
              const dbLabel = DB_LABELS[data.database] ?? data.database;
              line3Segs.push({ label: "Database: ", value: dbLabel });
            }
            if (createdAt) line3Segs.push({ label: "Created: ", value: formatAustralianDate(createdAt) });
            const line4Segs: Seg[] = updatedAt ? [{ label: "Modified: ", value: formatAustralianTime(updatedAt) }] : [];
            const subLines: Seg[][] = [line2Segs, line3Segs, line4Segs].filter(l => l.length > 0);
            const tfs = data.titleFontSize ?? 14;
            const subFs = Math.round(tfs * 0.79);
            const lineH = Math.round(tfs * 1.15);
            const titleH = (1 + subLines.length) * lineH + 8;
            const topY = minY - titleH - 20;
            return (
              <g data-title-block="true" style={{ pointerEvents: "none", fontStyle: "normal" }}>
                <text textAnchor="middle" x={cx} y={topY + lineH * 0.85}
                  fontSize={tfs} fill="#1f2937" fontWeight="bold" style={{ userSelect: "none" }}>
                  {diagramName ?? "Untitled"}
                </text>
                {subLines.map((segs, i) => (
                  <text key={i} textAnchor="middle" x={cx} y={topY + (i + 1) * lineH + lineH * 0.85}
                    fontSize={subFs} fill="#6b7280" style={{ userSelect: "none" }}>
                    {segs.map((seg, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <tspan>,  </tspan>}
                        <tspan>{seg.label}</tspan>
                        <tspan fontWeight="bold" fill="#1f2937">{seg.value}</tspan>
                      </React.Fragment>
                    ))}
                  </text>
                ))}
              </g>
            );
          })()}
          {/* Pools render first (deepest layer). Elements in an active
              multi-selection are skipped here and re-rendered in the
              overlay block at the END of this group, so the whole
              moving template stays above the existing diagram. */}
          {[...pools, ...otherContainers].filter(el => !inActiveGroup(el.id)).map((el) => {
            const isMsgTarget =
              (isDraggingConnector && isBpmnSource &&
                el.type === "pool" && el.id !== draggingSourcePoolId &&
                ((el.properties.poolType as string | undefined) ?? "black-box") === "black-box" &&
                !draggingFromEdgeMountedEndEvent &&
                !draggingFromEdgeMountedStartEvent &&
                !draggingFromEdgeMountedIntermediateReceiveEvent) // receive can only target subprocess children
              ||
              (isMessageBpmnEndpointDrag &&
                el.type === "pool" &&
                el.id !== epDragMovingEl?.id &&       // not the pool currently connected
                el.id !== epDragFixedEl?.id &&        // not the fixed end itself (if it's a pool)
                el.id !== epDragFixedPoolId &&        // not the pool the fixed end belongs to
                ((el.properties.poolType as string | undefined) ?? "black-box") === "black-box");
            const isWhiteBoxPool = el.type === "pool" &&
              ((el.properties.poolType as string | undefined) ?? "black-box") === "white-box";
            const isEventSubprocess = el.type === "subprocess-expanded" &&
              (el.properties.subprocessType as string | undefined) === "event";
            const isSubExpDropTarget = isDraggingConnector && !draggingSourceIsData &&
              el.type === "subprocess-expanded" &&
              !isEventSubprocess && // never highlight Event Expanded Subprocesses as sequence targets
              !draggingFromEventSubprocess && // Event Expanded Subprocesses cannot create sequence connectors
              !draggingFromInsideEventSubprocess && // elements inside Event subprocesses cannot connect out
              el.id !== draggingConnector!.fromId &&
              el.id !== (draggingSourceEl?.parentId ?? "") && // rule 4: child cannot target its own parent subprocess
              !draggingFromEdgeMountedStartEvent &&
              !draggingFromEdgeMountedIntermediateReceiveEvent; // receive can only target subprocess children
            const isSubExpAssocTarget = isDraggingConnector && draggingSourceIsData &&
              el.type === "subprocess-expanded" &&
              el.id !== draggingConnector!.fromId;
            const isCompositeDropTarget =
              isDraggingConnector &&
              !draggingSourceIsData &&
              el.type === "composite-state" &&
              el.id !== draggingConnector!.fromId &&
              draggingSourceEl?.parentId !== el.id; // source must be outside this composite-state
            // Orange border when element is being dragged into this subprocess-expanded
            const draggingEl = draggingElementId ? data.elements.find(e => e.id === draggingElementId) : null;
            const isElementDragTarget = el.type === "subprocess-expanded" &&
              draggingEl != null &&
              (draggingEl.x + draggingEl.width / 2) >= el.x &&
              (draggingEl.x + draggingEl.width / 2) <= el.x + el.width &&
              (draggingEl.y + draggingEl.height / 2) >= el.y &&
              (draggingEl.y + draggingEl.height / 2) <= el.y + el.height;
            return (
              <SymbolRenderer
                key={el.id}
                element={el}
                selected={selectedElementIds.has(el.id)}
                isAssociationHighlight={assocHighlightElIds.has(el.id)}
                isFaded={isAssocFadedEl(el)}
                isDropTarget={isSubExpDropTarget || isCompositeDropTarget}
                isDisallowedTarget={false}
                isMessageBpmnTarget={isMsgTarget}
                isAssocBpmnTarget={isSubExpAssocTarget}
                isElementDragTarget={isElementDragTarget}
                onSelect={(e) => {
                  // Force-connect override (Shift+Ctrl+Click)
                  if (handleForceConnectSelect(el.id, e)) return;
                  // Connection-creation mode: clicking a different element commits the connector
                  if (pendingConnSourceId && el.type !== "initial-state"
                      && (pendingConnSourceId !== el.id || el.type === "state" || el.type === "composite-state" || el.type === "submachine")) {
                    onAddConnector(
                      pendingConnSourceId, el.id,
                      "sequence", defaultDirectionType, defaultRoutingType,
                      pendingConnSourceId === el.id ? "right" : "right",
                      pendingConnSourceId === el.id ? "top" : "left",
                      pendingConnSourceId === el.id ? 0.8 : 0.5,
                      pendingConnSourceId === el.id ? 0.8 : 0.5
                    );
                    setPendingConnSourceId(null);
                    return;
                  }
                  // Group-Connect-to-Gateway: capture the pre-click multi-selection
                  // before it gets cleared, so the upcoming double-click can use it.
                  if (
                    el.type === "gateway" &&
                    selectedElementIds.size >= 2 &&
                    !selectedElementIds.has(el.id) &&
                    !e?.shiftKey
                  ) {
                    groupConnectPrevSelectionRef.current = {
                      ids: new Set(selectedElementIds),
                      expiresAt: Date.now() + GROUP_CONNECT_CAPTURE_MS,
                    };
                  }
                  if (isWhiteBoxPool && selectedElementIds.has(el.id) && selectedElementIds.size === 1) {
                    onSetSelectedElements(new Set()); // toggle deselect for white-box pools
                  } else if (e?.shiftKey) {
                    onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                  } else if (!selectedElementIds.has(el.id)) {
                    onSetSelectedElements(new Set([el.id]));
                  }
                  // Bubble help: fire on any non-shift single-click of an
                  // element (whether or not selection actually changed)
                  // so the user can re-trigger the cloud while testing.
                  // Pools get their own topic ("pool-header") so the
                  // hint text can talk about lane drops instead of
                  // connector drags.
                  if (!e?.shiftKey && e) {
                    const wp = clientToWorld(e.clientX, e.clientY);
                    showBubbleHelp(topicForElement(el.type), wp.x, wp.y);
                  }
                  onSelectConnector(null);
                }}
                onMove={(x, y, uc) => {
                  setDraggingElementId(el.id);
                  // Pool boundary alignment: snap the dragged pool's edge to
                  // other pools' edges (unless Shift = unconstrained).
                  if (el.type === "pool" && !uc) {
                    const snap = computePoolMoveSnap(el, x);
                    setPoolBoundaryGuide(snap.guide);
                    onMoveElement(el.id, snap.x, y, uc);
                  } else {
                    if (el.type === "pool") setPoolBoundaryGuide(null);
                    onMoveElement(el.id, x, y, uc);
                  }
                }}
                onDoubleClick={() => {
                  if (tryGroupConnectToGateway(el)) return;
                  // Gateway shape double-click never opens the label editor —
                  // the label rect has its own dblclick handler for that.
                  if (el.type === "gateway") return;
                  const linkedId = (el.type === "subprocess" || el.type === "submachine" || el.type === "chevron-collapsed" || el.type === "use-case" || el.type === "archimate-shape") ? el.properties.linkedDiagramId as string | undefined : undefined;
                  if (linkedId && onDrillIntoSubprocess) {
                    onDrillIntoSubprocess(linkedId);
                  } else {
                    startEditingLabel(el);
                  }
                }}
                onConnectionPointDragStart={(side, worldPos) => {
                  if (isWhiteBoxPool) return; // no connectors from white-box pools
                  if (el.type === "final-state") return; // no connectors FROM final-state
                  handleConnectionPointDragStart(el.id, side, worldPos);
                }}
                showConnectionPoints={selectedElementIds.size <= 1 && !isWhiteBoxPool && el.type !== "final-state" && diagramType !== "value-chain" && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
                onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
                svgToWorld={clientToWorld}
                onUpdateProperties={onUpdateProperties}
                onUpdateLabel={onUpdateLabel}
                onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "external")}
                onLabelFocusEditEnd={exitFocusMode}
                onMoveEnd={() => { setDraggingElementId(null); if (el.type === "pool") setPoolBoundaryGuide(null); onElementMoveEnd?.(el.id); }}
                multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
                onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
                onGroupMoveEnd={onElementsMoveEnd}
                colorConfig={colorConfig}
                debugMode={debugMode}
                onEnterConnectionMode={el.type !== "final-state" && diagramType !== "value-chain" ? () => setPendingConnSourceId(el.id) : undefined}
                onCancelConnectionMode={() => setPendingConnSourceId(null)}
                inConnectionMode={pendingConnSourceId === el.id}
                onDrillBack={(el.type === "start-event" || el.type === "initial-state") ? onDrillBack : undefined}
                showValueDisplay={showValueDisplay}
              />
            );
          })}

          {/* Lanes — selectable (for deletion) but not individually draggable.
              Lanes still participate in GROUP moves when part of a
              multi-selection (e.g. a template was just stamped), so we
              wire multiSelected + onGroupMove so a click-and-drag on
              any part of the lane body (which sits above the pool body)
              moves the whole group. Active-group lanes are skipped here
              and re-rendered in the overlay block at the end. */}
          {lanes.filter(el => !inActiveGroup(el.id)).map((el) => {
            // Lane-swap eligibility — only top-level lanes (parent is a
            // pool) get the ↑/↓ controls in the first cut. Sub-lanes
            // currently don't (deferred per Paul 2026-06-04).
            const parentEl = data.elements.find(e => e.id === el.parentId);
            const isTopLevelLane = parentEl?.type === "pool";
            let canSwapLaneUp: boolean | undefined;
            let canSwapLaneDown: boolean | undefined;
            if (isTopLevelLane && parentEl) {
              const siblingLanes = lanes
                .filter(l => l.parentId === parentEl.id)
                .sort((a, b) => a.y - b.y);
              const idx = siblingLanes.findIndex(l => l.id === el.id);
              canSwapLaneUp = idx > 0;
              canSwapLaneDown = idx >= 0 && idx < siblingLanes.length - 1;
            }
            return (
            <SymbolRenderer
              key={el.id}
              element={el}
              selected={selectedElementIds.has(el.id)}
              isAssociationHighlight={assocHighlightElIds.has(el.id)}
                isFaded={isAssocFadedEl(el)}
              isDropTarget={false}
              onSelect={(ev) => {
                onSetSelectedElements(new Set([el.id]));
                if (ev) {
                  const wp = clientToWorld(ev.clientX, ev.clientY);
                  showBubbleHelp(topicForElement(el.type), wp.x, wp.y);
                }
                onSelectConnector(null);
              }}
              onMove={() => {}}
              onDoubleClick={() => startEditingLabel(el)}
              onConnectionPointDragStart={() => {}}
              showConnectionPoints={false}
              svgToWorld={clientToWorld}
              onUpdateProperties={onUpdateProperties}
              onUpdateLabel={onUpdateLabel}
              onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "external")}
              onLabelFocusEditEnd={exitFocusMode}
              multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
              onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
              onGroupMoveEnd={onElementsMoveEnd}
              colorConfig={colorConfig}
              debugMode={debugMode}
              canSwapLaneUp={canSwapLaneUp}
              canSwapLaneDown={canSwapLaneDown}
              onSwapLane={onSwapLane ? (dir) => onSwapLane(el.id, dir) : undefined}
            />
            );
          })}

          {/* Lane boundary drag handles — shown between adjacent lanes in multi-lane pools */}
          {pools.flatMap((pool) => {
            const poolLanes = lanes
              .filter((l) => l.parentId === pool.id)
              .sort((a, b) => a.y - b.y);
            if (poolLanes.length < 2) return [];
            const POOL_LW = 30;
            return poolLanes.slice(0, -1).map((lane, i) => {
              const nextLane = poolLanes[i + 1];
              const boundaryY = lane.y + lane.height;
              return (
                <rect
                  key={`boundary-${lane.id}`}
                  x={pool.x + POOL_LW}
                  y={boundaryY - 4}
                  width={pool.width - POOL_LW}
                  height={8}
                  fill="transparent"
                  style={{ cursor: "ns-resize" }}
                  onMouseDown={(e) => handleLaneBoundaryDrag(e, lane.id, nextLane.id)}
                />
              );
            });
          })}

          {/* Sublane boundary drag handles — between adjacent sublanes within a lane */}
          {lanes.flatMap((parentLane) => {
            const sublanes = lanes
              .filter((l) => l.parentId === parentLane.id)
              .sort((a, b) => a.y - b.y);
            if (sublanes.length < 2) return [];
            const LANE_LW = 36;
            return sublanes.slice(0, -1).map((sub, i) => {
              const nextSub = sublanes[i + 1];
              const boundaryY = sub.y + sub.height;
              return (
                <rect
                  key={`subboundary-${sub.id}`}
                  x={parentLane.x + LANE_LW}
                  y={boundaryY - 4}
                  width={parentLane.width - LANE_LW}
                  height={8}
                  fill="transparent"
                  style={{ cursor: "ns-resize" }}
                  onMouseDown={(e) => handleLaneBoundaryDrag(e, sub.id, nextSub.id)}
                />
              );
            });
          })}

          {/* Expanded Subprocesses — rendered AFTER lanes / sublanes so EPs
              sit above the lane background (issue 5). Depth-sorted so a
              nested EP paints over its parent EP. */}
          {expandedSubprocesses.filter(el => !inActiveGroup(el.id)).map((el) => {
            const isEventSubprocess = el.type === "subprocess-expanded" &&
              (el.properties.subprocessType as string | undefined) === "event";
            const isSubExpDropTarget = isDraggingConnector && !draggingSourceIsData &&
              !isEventSubprocess &&
              !draggingFromEventSubprocess &&
              !draggingFromInsideEventSubprocess &&
              el.id !== draggingConnector!.fromId &&
              el.id !== (draggingSourceEl?.parentId ?? "") &&
              !draggingFromEdgeMountedStartEvent &&
              !draggingFromEdgeMountedIntermediateReceiveEvent;
            const isSubExpAssocTarget = isDraggingConnector && draggingSourceIsData &&
              el.id !== draggingConnector!.fromId;
            const draggingEl = draggingElementId ? data.elements.find(e => e.id === draggingElementId) : null;
            const isElementDragTarget = draggingEl != null &&
              (draggingEl.x + draggingEl.width / 2) >= el.x &&
              (draggingEl.x + draggingEl.width / 2) <= el.x + el.width &&
              (draggingEl.y + draggingEl.height / 2) >= el.y &&
              (draggingEl.y + draggingEl.height / 2) <= el.y + el.height;
            return (
              <SymbolRenderer
                key={el.id}
                element={el}
                selected={selectedElementIds.has(el.id)}
                isAssociationHighlight={assocHighlightElIds.has(el.id)}
                isFaded={isAssocFadedEl(el)}
                isDropTarget={isSubExpDropTarget}
                isDisallowedTarget={false}
                isAssocBpmnTarget={isSubExpAssocTarget}
                isElementDragTarget={isElementDragTarget}
                onSelect={(e) => {
                  if (handleForceConnectSelect(el.id, e)) return;
                  if (pendingConnSourceId && (pendingConnSourceId !== el.id)) {
                    onAddConnector(
                      pendingConnSourceId, el.id,
                      "sequence", defaultDirectionType, defaultRoutingType,
                      "right", "left", 0.5, 0.5,
                    );
                    setPendingConnSourceId(null);
                    return;
                  }
                  if (e?.shiftKey) {
                    onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                  } else if (!selectedElementIds.has(el.id)) {
                    onSetSelectedElements(new Set([el.id]));
                  }
                  if (!e?.shiftKey && e) {
                    const wp = clientToWorld(e.clientX, e.clientY);
                    showBubbleHelp(topicForElement(el.type), wp.x, wp.y);
                  }
                  onSelectConnector(null);
                }}
                onMove={(x, y, uc) => { setDraggingElementId(el.id); onMoveElement(el.id, x, y, uc); }}
                onDoubleClick={() => {
                  if (tryGroupConnectToGateway(el)) return;
                  startEditingLabel(el);
                }}
                onConnectionPointDragStart={(side, worldPos) => {
                  handleConnectionPointDragStart(el.id, side, worldPos);
                }}
                showConnectionPoints={selectedElementIds.size <= 1 && diagramType !== "value-chain" && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
                onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
                svgToWorld={clientToWorld}
                onUpdateProperties={onUpdateProperties}
                onUpdateLabel={onUpdateLabel}
                onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "external")}
                onLabelFocusEditEnd={exitFocusMode}
                onMoveEnd={() => { setDraggingElementId(null); onElementMoveEnd?.(el.id); }}
                multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
                onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
                onGroupMoveEnd={onElementsMoveEnd}
                colorConfig={colorConfig}
                debugMode={debugMode}
                onEnterConnectionMode={diagramType !== "value-chain" ? () => setPendingConnSourceId(el.id) : undefined}
                onCancelConnectionMode={() => setPendingConnSourceId(null)}
                inConnectionMode={pendingConnSourceId === el.id}
                showValueDisplay={showValueDisplay}
              />
            );
          })}

          {/* Regular connectors — rendered behind elements (skip selected, rendered on top later) */}
          {(() => {
            // In ArchiMate diagrams EVERY connector renders on top of all
            // elements (handled by the on-top pass below), so exclude them
            // all here. Elsewhere only associationBPMN/messageBPMN are on top.
            const regularConns = data.connectors.filter(c => c.type !== "associationBPMN" && c.type !== "messageBPMN" && !(c.type.startsWith("archi-") || diagramType === "archimate"));
            const humpEligible = regularConns.filter(c => c.type === "sequence" || c.type === "association" || c.type === "uml-association");
            return regularConns.filter(c => c.id !== selectedConnectorId).map((conn) => (
              <ConnectorRenderer
                key={conn.id}
                connector={conn}
                selected={false}
                onSelect={() => {
                  onSelectConnector(conn.id);
                  onSetSelectedElements(new Set());
                }}
                svgToWorld={clientToWorld}
                onUpdateWaypoints={onUpdateConnectorWaypoints}
                onWaypointsDragEnd={onConnectorWaypointDragEnd ? () => onConnectorWaypointDragEnd(conn.id) : undefined}
                onUpdateLabel={onUpdateConnectorLabel
                  ? (label, ox, oy, w) => onUpdateConnectorLabel(conn.id, label, ox, oy, w)
                  : undefined}
                onUpdateCurveHandles={onUpdateCurveHandles}
                otherConnectorWaypoints={
                  (conn.type === "sequence" || conn.type === "association" || conn.type === "uml-association")
                    ? humpEligible.slice(0, humpEligible.indexOf(conn)).map(c => {
                        const vs = c.sourceInvisibleLeader ? 1 : 0;
                        const ve = c.targetInvisibleLeader ? c.waypoints.length - 2 : c.waypoints.length - 1;
                        return c.waypoints.slice(vs, ve + 1);
                      })
                    : undefined
                }
                debugMode={debugMode}
                misaligned={obstacleViolationConnIds.has(conn.id)}
                onUpdateEndOffset={handleUpdateEndOffset}
                showBottleneck={showBottleneck}
                hideLabel={hiddenBranchLabelConnIds.has(conn.id)}
                highlight={assocHighlightConnIds.has(conn.id)}
                faded={isAssocFadedConn(conn)}
                onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "connector")}
                onLabelFocusEditEnd={exitFocusMode}
              />
            ));
          })()}

          {/* Debug labels rendered at end of SVG for z-order */}

          {/* Non-container elements */}
          {nonContainers.filter(el => !inActiveGroup(el.id)).map((el) => {
            let elIsDropTarget = false;
            let elIsMsgTarget = false;
            let elIsAssocTarget = false;
            // When dragging from an expanded subprocess, never highlight its
            // own children (parentId === source.id) or its boundary events
            // (boundaryHostId === source.id) — connectors from the container
            // to its own contents/boundary aren't valid.
            const skipBecauseExpandedSelfContent =
              draggingSourceEl?.type === "subprocess-expanded" &&
              (el.parentId === draggingSourceEl.id ||
               el.boundaryHostId === draggingSourceEl.id);
            if (isDraggingConnector && el.id !== draggingConnector!.fromId && !skipBecauseExpandedSelfContent
                && !draggingFromFinalState && el.type !== "initial-state") {
              const elIsData = DATA_ELEMENT_TYPES.has(el.type);
              // End events are always senders — never valid messageBPMN targets.
              // Send tasks / throwing events are excluded only if they already have an
              // outgoing messageBPMN connector; otherwise they can be targets (auto-flipped
              // to receive/catching on connection).
              const elIsSendLocked = el.type === "end-event"
                || ((el.taskType === "send" || el.flowType === "throwing")
                    && data.connectors.some(c => c.type === "messageBPMN" && c.sourceId === el.id));
              if (draggingFromPool) {
                // Pools can only create messageBPMN — target elements in other white-box pools
                if (!elIsData && !elIsSendLocked) {
                  const elPoolId = getElementPoolId(el, data.elements);
                  if (elPoolId && elPoolId !== draggingSourcePoolId) {
                    const elPool = data.elements.find((p) => p.id === elPoolId);
                    if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                      elIsMsgTarget = true;
                    }
                  }
                }
              } else if (draggingSourceIsData && !elIsData) {
                elIsAssocTarget = true;
              } else if (draggingSourceIsData && elIsData) {
                // Data → data is not a legal connector. Leave all flags false
                // so the target receives no highlight at all.
              } else if (!draggingSourceIsData && elIsData) {
                elIsAssocTarget = true;
              } else if (draggingFromBoundaryOnChild) {
                // Edge-mounted event on a child element inside expanded subprocess
                // Child events in same subprocess → dual highlight (sequence + association)
                // Other valid targets → sequence only
                if (CHILD_EVENT_TYPES_HIGHLIGHT.has(el.type) && !el.boundaryHostId && el.parentId === draggingSourceHostParentId) {
                  elIsDropTarget = true;
                  elIsAssocTarget = true;
                } else {
                  const elPoolId = getElementPoolId(el, data.elements);
                  if (elPoolId === draggingSourcePoolId || !elPoolId) {
                    elIsDropTarget = true;
                  }
                }
              } else if (draggingFromFreeEndEvent) {
                // Free-standing end-event: messageBPMN targets only in white-box pools
                if (!elIsData && !elIsSendLocked) {
                  const elPoolId = getElementPoolId(el, data.elements);
                  if (elPoolId) {
                    const elPool = data.elements.find((p) => p.id === elPoolId);
                    if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                      elIsMsgTarget = true;
                    }
                  }
                }
              } else if (draggingFromEdgeMountedEndEvent) {
                // Edge-mounted end-event: sequence targets outside the parent subprocess (same/no pool, not children)
                const elPoolId = getElementPoolId(el, data.elements);
                if ((elPoolId === draggingSourcePoolId || !elPoolId) && el.parentId !== draggingSourceBoundaryHostId) {
                  elIsDropTarget = true;
                }
              } else if (draggingFromEdgeMountedStartEvent) {
                // Rule 2: edge-mounted start event — only children of its parent subprocess
                if (el.parentId === draggingSourceBoundaryHostId) elIsDropTarget = true;
              } else if (draggingFromEdgeMountedIntermediateSendEvent) {
                // Rule 3 (send): any element except children of its parent subprocess
                if (el.parentId !== draggingSourceBoundaryHostId) {
                  const elPoolId = getElementPoolId(el, data.elements);
                  if (elPoolId === draggingSourcePoolId) {
                    elIsDropTarget = true;
                  } else if (elPoolId && elPoolId !== draggingSourcePoolId && !elIsData && !elIsSendLocked) {
                    const elPool = data.elements.find((p) => p.id === elPoolId);
                    if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") elIsMsgTarget = true;
                  } else if (!elPoolId) {
                    elIsDropTarget = true;
                  }
                }
              } else if (draggingFromEdgeMountedIntermediateReceiveEvent) {
                // Rule 3 (receive): only children of its parent subprocess
                if (el.parentId === draggingSourceBoundaryHostId) elIsDropTarget = true;
              } else if (!isBpmnSource || !draggingSourcePoolId) {
                // Context-Diagram rule: only the complementary type
                // (entity ↔ process) is a valid flow target. Other diagram
                // types remain unrestricted.
                if ((diagramType === "context" || diagramType === "basic") && draggingSourceEl) {
                  elIsDropTarget = isValidContextFlowPair(draggingSourceEl.type, el.type);
                } else {
                  elIsDropTarget = true;
                }
              } else {
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId === draggingSourcePoolId) {
                  elIsDropTarget = true;
                } else if (elPoolId && elPoolId !== draggingSourcePoolId && !elIsData && !elIsSendLocked) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  const elPoolIsWhiteBox =
                    ((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box";
                  if (elPoolIsWhiteBox) elIsMsgTarget = true;
                }
              }
            } else if (isMessageBpmnEndpointDrag) {
              // Any message endpoint (on a pool, task or event) may re-attach to
              // a task/subprocess inside any white-box pool. No restriction on
              // the fixed end's pool — the message may land inside the same
              // or a different white-box pool.
              if (MSG_TASKSUB_TYPES.has(el.type)
                  && el.id !== epDragMovingEl?.id
                  && el.id !== epDragFixedEl?.id) {
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId) {
                  const elPool = data.elements.find(p => p.id === elPoolId);
                  if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                    elIsMsgTarget = true;
                  }
                }
              }
            }
            // Event targets — orthogonal to the pool vs task/sub branches above.
            // The end being dragged decides which event kinds are valid.
            if (isMessageBpmnEndpointDrag && epDragMsgEventTypes
                && epDragMsgEventTypes.has(el.type)
                && !el.boundaryHostId
                && el.id !== epDragMovingEl?.id
                && el.id !== epDragFixedEl?.id) {
              const elPoolId = getElementPoolId(el, data.elements);
              if (elPoolId) {
                const elPool = data.elements.find(p => p.id === elPoolId);
                if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                  elIsMsgTarget = true;
                }
              }
            } else if (isAssocBpmnEndpointDrag && el.id !== epDragMovingId) {
              const elIsData = DATA_ELEMENT_TYPES.has(el.type);
              const elIsDataObjOrStore = el.type === "data-object" || el.type === "data-store";
              const movingEl = data.elements.find(m => m.id === epDragMovingId);
              const movingIsDataObjOrStore = movingEl?.type === "data-object" || movingEl?.type === "data-store";
              if (movingIsDataObjOrStore) {
                // Data Object / Data Store endpoint can only re-attach to
                // another Data Object / Data Store (user rule).
                if (elIsDataObjOrStore) elIsAssocTarget = true;
              } else {
                // Non-data moving end (task / event / subprocess on a
                // data-or-annotation association) — keep the existing
                // "fixed determines valid target" logic.
                if (epDragFixedIsData && !elIsData) elIsAssocTarget = true;
                else if (!epDragFixedIsData && elIsData) elIsAssocTarget = true;
                // Annotation on the fixed side: any non-annotation, non-
                // pool element is a valid target (annotations clarify
                // anything).
                if (epDragFixedEl?.type === "text-annotation" && !elIsData && el.type !== "pool") {
                  elIsAssocTarget = true;
                }
              }
            }
            // Sequence target validation — sync with ADD_CONNECTOR rules
            // Non-boundary start events cannot be sequence targets (boundary ones CAN from outside)
            if (el.type === "start-event" && !el.boundaryHostId) elIsDropTarget = false;
            // Event Expanded Subprocess as source: no sequence to anything
            if (elIsDropTarget && draggingFromEventSubprocess) elIsDropTarget = false;
            // Source inside an Event Expanded Subprocess: no sequence to outside
            if (elIsDropTarget && draggingFromInsideEventSubprocess) {
              const srcParent = data.elements.find(p => p.id === draggingSourceEl!.parentId);
              if (srcParent && el.parentId !== srcParent.id) elIsDropTarget = false;
            }
            // Target inside an Event Expanded Subprocess: no sequence from outside
            if (elIsDropTarget && el.parentId) {
              const _elP = data.elements.find(p => p.id === el.parentId);
              if (_elP?.type === "subprocess-expanded" && (_elP.properties.subprocessType as string | undefined) === "event") {
                if (draggingConnector && draggingSourceEl?.parentId !== _elP.id) elIsDropTarget = false;
              }
            }
            return (
            <SymbolRenderer
              key={el.id}
              element={el}
              selected={selectedElementIds.has(el.id)}
              isAssociationHighlight={assocHighlightElIds.has(el.id)}
                isFaded={isAssocFadedEl(el)}
              isDropTarget={elIsDropTarget}
              isMessageBpmnTarget={elIsMsgTarget}
              isAssocBpmnTarget={elIsAssocTarget}
              isErrorTarget={errorTargetIds.has(el.id) || obstacleViolationElementIds.has(el.id)}
              onSelect={(ev) => {
                // Force-connect override (Shift+Ctrl+Click)
                if (handleForceConnectSelect(el.id, ev)) return;
                // Group-Connect-to-Gateway: capture pre-click multi-selection
                if (
                  el.type === "gateway" &&
                  selectedElementIds.size >= 2 &&
                  !selectedElementIds.has(el.id) &&
                  !ev?.shiftKey
                ) {
                  groupConnectPrevSelectionRef.current = {
                    ids: new Set(selectedElementIds),
                    expiresAt: Date.now() + GROUP_CONNECT_CAPTURE_MS,
                  };
                }
                if (ev?.shiftKey && !ev?.ctrlKey) {
                  onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                } else if (!selectedElementIds.has(el.id)) {
                  onSetSelectedElements(new Set([el.id]));
                }
                if (!ev?.shiftKey && ev) {
                  const wp = clientToWorld(ev.clientX, ev.clientY);
                  showBubbleHelp(topicForElement(el.type), wp.x, wp.y);
                }
                onSelectConnector(null);
              }}
              onMove={(x, y, uc) => { setDraggingElementId(el.id); onMoveElement(el.id, x, y, uc); }}
              onDoubleClick={() => {
                if (tryGroupConnectToGateway(el)) return;
                // Gateway shape double-click never opens the label editor —
                // the label rect has its own dblclick handler for that.
                if (el.type === "gateway") return;
                const linkedId = (el.type === "subprocess" || el.type === "submachine" || el.type === "chevron-collapsed" || el.type === "use-case" || el.type === "archimate-shape") ? el.properties.linkedDiagramId as string | undefined : undefined;
                if (linkedId && onDrillIntoSubprocess) {
                  onDrillIntoSubprocess(linkedId);
                } else {
                  startEditingLabel(el);
                }
              }}
              onConnectionPointDragStart={(side, worldPos) => {
                if (el.type === "final-state") return;
                handleConnectionPointDragStart(el.id, side, worldPos);
              }}
              showConnectionPoints={selectedElementIds.size <= 1 && el.type !== "final-state" && diagramType !== "value-chain" && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
              onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
              svgToWorld={clientToWorld}
              onUpdateProperties={onUpdateProperties}
              onUpdateLabel={onUpdateLabel}
              onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "external")}
              onLabelFocusEditEnd={exitFocusMode}
              onMoveEnd={() => { setDraggingElementId(null); onElementMoveEnd?.(el.id); }}
              multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
              onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
              onGroupMoveEnd={onElementsMoveEnd}
              colorConfig={colorConfig}
              debugMode={debugMode}
              shouldSnapBack={(x, y) => {
                // System-boundary collision still snaps back (context-diagram
                // rule unchanged).
                const cx = x + el.width / 2;
                const cy = y + el.height / 2;
                const inBoundary = data.elements.some(
                  (b) =>
                    b.type === "system-boundary" &&
                    b.id !== el.id &&
                    el.type !== "use-case" &&
                    el.type !== "hourglass" &&
                    cx >= b.x && cx <= b.x + b.width &&
                    cy >= b.y && cy <= b.y + b.height
                );
                if (inBoundary) return true;
                // No more pool-bounds snap-back. Per user spec, any element
                // can be placed anywhere on the canvas — including outside
                // its pool — while editing. Stray-element warning is
                // delivered by the red outline overlay (see Canvas render
                // below), not by reverting the user's drag.
                return false;
              }}
              onDrillBack={(el.type === "start-event" || el.type === "initial-state") ? onDrillBack : undefined}
              showValueDisplay={showValueDisplay}
            />
            );
          })}

          {/* Boundary events — rendered on top of their hosts */}
          {boundaryEvents.filter(el => !inActiveGroup(el.id)).map((el) => {
            let elIsDropTarget = false;
            let elIsMsgTarget = false;
            let elIsAssocTarget = false;
            // When dragging from an expanded subprocess, never highlight a
            // boundary event mounted on that same subprocess.
            const skipBecauseOwnBoundary =
              draggingSourceEl?.type === "subprocess-expanded" &&
              el.boundaryHostId === draggingSourceEl.id;
            const SELF_TRANSITION_TYPES = new Set(["state", "composite-state", "submachine"]);
            const isSelfStateTarget = el.id === draggingConnector?.fromId && SELF_TRANSITION_TYPES.has(el.type);
            if (isDraggingConnector && (el.id !== draggingConnector!.fromId || isSelfStateTarget) && !skipBecauseOwnBoundary
                && !draggingFromFinalState && el.type !== "initial-state") {
              // Throwing/send boundary events excluded only if they already have an outgoing messageBPMN
              const bEvtIsSendLocked = (el.flowType === "throwing" || el.taskType === "send")
                && data.connectors.some(c => c.type === "messageBPMN" && c.sourceId === el.id);
              if (draggingFromPool) {
                // Pools can only create messageBPMN — boundary catching intermediate-events in other white-box pools
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId && elPoolId !== draggingSourcePoolId && el.type === "intermediate-event" && !bEvtIsSendLocked) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                    elIsMsgTarget = true;
                  }
                }
              } else if ((draggingFromChildEvent || draggingFromBoundaryOnChild) &&
                  el.boundaryHostId && draggingSourceAncestorIds.has(el.boundaryHostId)) {
                elIsAssocTarget = true; // purple — associationBPMN to boundary event on ancestor
              } else if (draggingSourceIsData) {
                elIsAssocTarget = true;
              } else if (draggingFromFreeEndEvent) {
                // Free-standing end-event: boundary catching intermediate-events in other white-box pools are messageBPMN targets
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId && el.type === "intermediate-event" && !bEvtIsSendLocked) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                    elIsMsgTarget = true;
                  }
                }
              } else if (draggingFromEdgeMountedEndEvent) {
                // Edge-mounted end-event: boundary events in same pool, but not on elements inside the subprocess
                const elPoolId = getElementPoolId(el, data.elements);
                const hostEl = data.elements.find((e) => e.id === el.boundaryHostId);
                if (elPoolId === draggingSourcePoolId && hostEl?.parentId !== draggingSourceBoundaryHostId) {
                  elIsDropTarget = true;
                }
              } else if (draggingFromEdgeMountedStartEvent) {
                // Rule 2: edge-mounted start event — boundary events are not inside the subprocess, so not targets
                // (no action — elIsDropTarget stays false)
              } else if (draggingFromEdgeMountedIntermediateSendEvent) {
                // Rule 5: exclude boundary events on the same parent subprocess
                // Rule 3 (send): also exclude those whose host is a child of the parent subprocess
                if (el.boundaryHostId !== draggingSourceBoundaryHostId) {
                  const hostEl = data.elements.find((e) => e.id === el.boundaryHostId);
                  if (!hostEl || hostEl.parentId !== draggingSourceBoundaryHostId) {
                    const elPoolId = getElementPoolId(el, data.elements);
                    if (elPoolId === draggingSourcePoolId) elIsDropTarget = true;
                    else if (elPoolId && elPoolId !== draggingSourcePoolId && el.type === "intermediate-event" && !bEvtIsSendLocked) {
                      const elPool = data.elements.find((p) => p.id === elPoolId);
                      if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") elIsMsgTarget = true;
                    }
                  }
                }
              } else if (draggingFromEdgeMountedIntermediateReceiveEvent) {
                // Rule 3 (receive): boundary events are not subprocess children, not valid targets
                // Rule 5: also not targets for receive events
                // (no action — elIsDropTarget stays false)
              } else if (!isBpmnSource || !draggingSourcePoolId) {
                elIsDropTarget = true;
              } else {
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId === draggingSourcePoolId) {
                  elIsDropTarget = true;
                } else if (elPoolId && elPoolId !== draggingSourcePoolId && el.type === "intermediate-event" && !bEvtIsSendLocked) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  const elPoolIsWhiteBox =
                    ((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box";
                  if (elPoolIsWhiteBox) elIsMsgTarget = true;
                }
              }
            } else if (isAssocBpmnEndpointDrag && el.id !== epDragMovingId) {
              const elIsData = DATA_ELEMENT_TYPES.has(el.type);
              if (epDragFixedIsData && !elIsData) elIsAssocTarget = true;
              else if (!epDragFixedIsData && elIsData) elIsAssocTarget = true;
            }
            // Sequence target validation — sync with ADD_CONNECTOR rules
            // Non-boundary start events cannot be sequence targets (boundary ones CAN from outside)
            if (el.type === "start-event" && !el.boundaryHostId) elIsDropTarget = false;
            // Event Expanded Subprocess as source: no sequence to anything
            if (elIsDropTarget && draggingFromEventSubprocess) elIsDropTarget = false;
            // Source inside an Event Expanded Subprocess: no sequence to outside
            if (elIsDropTarget && draggingFromInsideEventSubprocess) {
              const srcParent = data.elements.find(p => p.id === draggingSourceEl!.parentId);
              if (srcParent && el.parentId !== srcParent.id) elIsDropTarget = false;
            }
            // Target inside an Event Expanded Subprocess: no sequence from outside
            if (elIsDropTarget && el.parentId) {
              const _elP = data.elements.find(p => p.id === el.parentId);
              if (_elP?.type === "subprocess-expanded" && (_elP.properties.subprocessType as string | undefined) === "event") {
                if (draggingConnector && draggingSourceEl?.parentId !== _elP.id) elIsDropTarget = false;
              }
            }
            return (
              <SymbolRenderer
                key={el.id}
                element={el}
                selected={selectedElementIds.has(el.id)}
                isAssociationHighlight={assocHighlightElIds.has(el.id)}
                isFaded={isAssocFadedEl(el)}
                isDropTarget={elIsDropTarget}
                isDisallowedTarget={false}
                isMessageBpmnTarget={elIsMsgTarget}
                isAssocBpmnTarget={elIsAssocTarget}
                onSelect={(ev) => {
                  // Force-connect override (Shift+Ctrl+Click)
                  if (handleForceConnectSelect(el.id, ev)) return;
                  if (pendingConnSourceId && el.type !== "initial-state"
                      && (pendingConnSourceId !== el.id || el.type === "state" || el.type === "composite-state" || el.type === "submachine")) {
                    onAddConnector(
                      pendingConnSourceId, el.id,
                      "sequence", defaultDirectionType, defaultRoutingType,
                      pendingConnSourceId === el.id ? "right" : "right",
                      pendingConnSourceId === el.id ? "top" : "left",
                      pendingConnSourceId === el.id ? 0.8 : 0.5,
                      pendingConnSourceId === el.id ? 0.8 : 0.5
                    );
                    setPendingConnSourceId(null);
                    return;
                  }
                  // Group-Connect-to-Gateway: capture pre-click multi-selection
                  if (
                    el.type === "gateway" &&
                    selectedElementIds.size >= 2 &&
                    !selectedElementIds.has(el.id) &&
                    !ev?.shiftKey
                  ) {
                    groupConnectPrevSelectionRef.current = {
                      ids: new Set(selectedElementIds),
                      expiresAt: Date.now() + GROUP_CONNECT_CAPTURE_MS,
                    };
                  }
                  if (ev?.shiftKey) {
                    onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                  } else if (!selectedElementIds.has(el.id)) {
                    onSetSelectedElements(new Set([el.id]));
                  }
                  if (!ev?.shiftKey && ev) {
                  const wp = clientToWorld(ev.clientX, ev.clientY);
                  showBubbleHelp(topicForElement(el.type), wp.x, wp.y);
                }
                  onSelectConnector(null);
                }}
                onMove={(x, y, uc) => { setDraggingElementId(el.id); onMoveElement(el.id, x, y, uc); }}
                onDoubleClick={() => { tryGroupConnectToGateway(el); }}
                onConnectionPointDragStart={(side, worldPos) => {
                  if (el.type === "final-state") return;
                  handleConnectionPointDragStart(el.id, side, worldPos);
                }}
                showConnectionPoints={selectedElementIds.size <= 1 && el.type !== "final-state" && diagramType !== "value-chain" && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
                svgToWorld={clientToWorld}
                onUpdateProperties={onUpdateProperties}
                onUpdateLabel={onUpdateLabel}
                onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "external")}
                onLabelFocusEditEnd={exitFocusMode}
                multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
                onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
                onGroupMoveEnd={onElementsMoveEnd}
                colorConfig={colorConfig}
                debugMode={debugMode}
                onEnterConnectionMode={el.type !== "final-state" && diagramType !== "value-chain" ? () => setPendingConnSourceId(el.id) : undefined}
                onCancelConnectionMode={() => setPendingConnSourceId(null)}
                inConnectionMode={pendingConnSourceId === el.id}
              />
            );
          })}

          {/* Group elements — rendered on top of all other elements */}
          {groupElements.filter(el => !inActiveGroup(el.id)).map((el) => (
            <SymbolRenderer
              key={el.id}
              element={el}
              selected={selectedElementIds.has(el.id)}
              isAssociationHighlight={assocHighlightElIds.has(el.id)}
                isFaded={isAssocFadedEl(el)}
              isDropTarget={false}
              isDisallowedTarget={false}
              onSelect={(ev) => {
                if (ev?.shiftKey) {
                  onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                } else if (!selectedElementIds.has(el.id)) {
                  onSetSelectedElements(new Set([el.id]));
                }
                if (!ev?.shiftKey && ev) {
                  const wp = clientToWorld(ev.clientX, ev.clientY);
                  showBubbleHelp(topicForElement(el.type), wp.x, wp.y);
                }
                onSelectConnector(null);
              }}
              onMove={(x, y, uc) => onMoveElement(el.id, x, y, uc)}
              onDoubleClick={() => startEditingLabel(el)}
              onConnectionPointDragStart={() => {}}
              showConnectionPoints={false}
              onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
              svgToWorld={clientToWorld}
              onUpdateLabel={onUpdateLabel}
              onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "external")}
              onLabelFocusEditEnd={exitFocusMode}
              onMoveEnd={() => { setDraggingElementId(null); onElementMoveEnd?.(el.id); }}
              multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
              onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
              onGroupMoveEnd={onElementsMoveEnd}
              colorConfig={colorConfig}
              debugMode={debugMode}
            />
          ))}

          {/* Active-group overlay — when a multi-selection is active
              (most often a template was just stamped) every selected
              element is re-rendered here at the END of the world group
              so the whole moving group sits above every existing
              diagram element. Drop targets / connection points are
              suppressed since they're not meaningful during a group
              move. */}
          {hasActiveGroup && (() => {
            // Layer-ordered iteration so the overlay preserves natural
            // internal z-order (pool < lane < EP < non-container <
            // boundary event < group).
            const layered = [
              ...pools, ...otherContainers,
              ...lanes,
              ...expandedSubprocesses,
              ...nonContainers,
              ...boundaryEvents,
              ...groupElements,
            ].filter(el => selectedElementIds.has(el.id));
            return layered.map(el => (
              <SymbolRenderer
                key={`overlay-${el.id}`}
                element={el}
                selected={true}
                isDropTarget={false}
                isDisallowedTarget={false}
                isMessageBpmnTarget={false}
                isAssocBpmnTarget={false}
                isErrorTarget={false}
                onSelect={(ev) => {
                  if (ev?.shiftKey) {
                    onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                  }
                }}
                onMove={el.type === "lane" ? () => {} : (x, y, uc) => { setDraggingElementId(el.id); onMoveElement(el.id, x, y, uc); }}
                onDoubleClick={() => startEditingLabel(el)}
                onConnectionPointDragStart={() => {}}
                showConnectionPoints={false}
                onResizeDragStart={el.type === "lane" ? undefined : (handle, e) => handleResizeDragStart(el.id, handle, e)}
                svgToWorld={clientToWorld}
                onUpdateProperties={onUpdateProperties}
                onUpdateLabel={onUpdateLabel}
                onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "external")}
                onLabelFocusEditEnd={exitFocusMode}
                onMoveEnd={() => { setDraggingElementId(null); onElementMoveEnd?.(el.id); }}
                multiSelected={true}
                onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
                onGroupMoveEnd={onElementsMoveEnd}
                colorConfig={colorConfig}
                debugMode={debugMode}
              />
            ));
          })()}

          {/* Stray-element red outline overlay — drawn above the symbols
              but below selection chrome. Only active when the diagram has
              a white-box pool, since a no-white-box diagram is allowed to
              have free-floating content (Context/Process Context, etc.). */}
          {strayElementIds.size > 0 && (
            <g pointerEvents="none">
              {data.elements.filter(e => strayElementIds.has(e.id)).map(el => (
                <rect
                  key={`stray-${el.id}`}
                  x={el.x - 3}
                  y={el.y - 3}
                  width={el.width + 6}
                  height={el.height + 6}
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  rx={4}
                  ry={4}
                >
                  <title>Outside any pool — illegal in a saved BPMN diagram. Drag into a pool to clear the warning.</title>
                </rect>
              ))}
            </g>
          )}

          {/* Association connectors — rendered above all elements */}
          {data.connectors.filter(c => c.type === "associationBPMN" || c.type === "messageBPMN").map((conn) => {
            const srcEl = data.elements.find(e => e.id === conn.sourceId);
            const tgtEl = data.elements.find(e => e.id === conn.targetId);
            const srcBounds = srcEl ? { x: srcEl.x, y: srcEl.y, width: srcEl.width, height: srcEl.height } : undefined;
            const tgtBounds = tgtEl ? { x: tgtEl.x, y: tgtEl.y, width: tgtEl.width, height: tgtEl.height } : undefined;
            // Walk parentId chain to the containing pool (or use the element
            // itself if it IS a pool). Debug-only — drives the poolH field in
            // the debug overlay so the reflection maths can be verified.
            function containingPoolHeight(el: DiagramElement | undefined): number | undefined {
              if (!el) return undefined;
              if (el.type === "pool") return el.height;
              let cur: DiagramElement | undefined = el;
              for (let i = 0; i < 10 && cur; i++) {
                if (!cur.parentId) break;
                const parent = data.elements.find(e => e.id === cur!.parentId);
                if (!parent) break;
                if (parent.type === "pool") return parent.height;
                cur = parent;
              }
              return undefined;
            }
            const srcPoolH = containingPoolHeight(srcEl);
            const tgtPoolH = containingPoolHeight(tgtEl);
            const srcIsPool = srcEl?.type === "pool";
            const tgtIsPool = tgtEl?.type === "pool";
            return (
              <ConnectorRenderer
                key={conn.id}
                connector={conn}
                selected={conn.id === selectedConnectorId}
                misaligned={misalignedConnectorIds.has(conn.id) || obstacleViolationConnIds.has(conn.id)}
                onSelect={() => {
                  onSelectConnector(conn.id);
                  onSetSelectedElements(new Set());
                }}
                svgToWorld={clientToWorld}
                onUpdateWaypoints={onUpdateConnectorWaypoints}
                onWaypointsDragEnd={onConnectorWaypointDragEnd ? () => onConnectorWaypointDragEnd(conn.id) : undefined}
                onUpdateLabel={onUpdateConnectorLabel
                  ? (label, ox, oy, w) => onUpdateConnectorLabel(conn.id, label, ox, oy, w)
                  : undefined}
                onUpdateCurveHandles={onUpdateCurveHandles}
                debugMode={debugMode}
                onUpdateEndOffset={handleUpdateEndOffset}
                sourceBounds={srcBounds}
                targetBounds={tgtBounds}
                sourcePoolHeight={srcPoolH}
                targetPoolHeight={tgtPoolH}
                sourceIsPool={srcIsPool}
                targetIsPool={tgtIsPool}
                hideLabel={hiddenBranchLabelConnIds.has(conn.id)}
                highlight={assocHighlightConnIds.has(conn.id)}
                faded={isAssocFadedConn(conn)}
                onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "connector")}
                onLabelFocusEditEnd={exitFocusMode}
              />
            );
          })}

          {/* ArchiMate connectors — ALL of them render on top of every element
              so a relationship is never hidden by a container shape. Covers
              every archi-* relationship type plus any connector that lives in
              an ArchiMate diagram. (associationBPMN/messageBPMN keep their own
              pass above, so they're excluded here to avoid double-rendering.) */}
          {data.connectors.filter(c => (c.type.startsWith("archi-") || diagramType === "archimate") && c.type !== "associationBPMN" && c.type !== "messageBPMN").map((conn) => (
            <ConnectorRenderer
              key={`archi-${conn.id}`}
              connector={conn}
              selected={conn.id === selectedConnectorId}
              onSelect={() => { onSelectConnector(conn.id); onSetSelectedElements(new Set()); }}
              svgToWorld={clientToWorld}
              onUpdateWaypoints={onUpdateConnectorWaypoints}
              onWaypointsDragEnd={onConnectorWaypointDragEnd ? () => onConnectorWaypointDragEnd(conn.id) : undefined}
              onUpdateLabel={onUpdateConnectorLabel ? (label, ox, oy, w) => onUpdateConnectorLabel(conn.id, label, ox, oy, w) : undefined}
              onUpdateCurveHandles={onUpdateCurveHandles}
              debugMode={debugMode}
              misaligned={obstacleViolationConnIds.has(conn.id)}
              onUpdateEndOffset={handleUpdateEndOffset}
              hideLabel={hiddenBranchLabelConnIds.has(conn.id)}
              highlight={assocHighlightConnIds.has(conn.id)}
              faded={isAssocFadedConn(conn)}
              onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "connector")}
              onLabelFocusEditEnd={exitFocusMode}
            />
          ))}

          {/* Selected regular connector — rendered on top of all elements */}
          {selectedConnectorId && (() => {
            const conn = data.connectors.find(c => c.id === selectedConnectorId && c.type !== "associationBPMN" && c.type !== "messageBPMN" && !(c.type.startsWith("archi-") || diagramType === "archimate"));
            if (!conn) return null;
            const allHumpConns = data.connectors.filter(c => c.type === "sequence" || c.type === "association" || c.type === "uml-association");
            const connIdx = allHumpConns.findIndex(c => c.id === conn.id);
            // Only hump over connectors added before this one
            const priorHumpConns = allHumpConns.slice(0, connIdx);
            return (
              <ConnectorRenderer
                key={`sel-${conn.id}`}
                connector={conn}
                selected={true}
                onSelect={() => {
                  onSelectConnector(conn.id);
                  onSetSelectedElements(new Set());
                }}
                svgToWorld={clientToWorld}
                onUpdateWaypoints={onUpdateConnectorWaypoints}
                onWaypointsDragEnd={onConnectorWaypointDragEnd ? () => onConnectorWaypointDragEnd(conn.id) : undefined}
                onUpdateLabel={onUpdateConnectorLabel
                  ? (label: string, ox: number, oy: number, w: number) => onUpdateConnectorLabel(conn.id, label, ox, oy, w)
                  : undefined}
                onUpdateCurveHandles={onUpdateCurveHandles}
                otherConnectorWaypoints={
                  (conn.type === "sequence" || conn.type === "association" || conn.type === "uml-association") && priorHumpConns.length > 0
                    ? priorHumpConns.map(c => {
                        const vs = c.sourceInvisibleLeader ? 1 : 0;
                        const ve = c.targetInvisibleLeader ? c.waypoints.length - 2 : c.waypoints.length - 1;
                        return c.waypoints.slice(vs, ve + 1);
                      })
                    : undefined
                }
                debugMode={debugMode}
                misaligned={obstacleViolationConnIds.has(conn.id)}
                onUpdateEndOffset={handleUpdateEndOffset}
                showBottleneck={showBottleneck}
                hideLabel={hiddenBranchLabelConnIds.has(conn.id)}
                highlight={assocHighlightConnIds.has(conn.id)}
                faded={isAssocFadedConn(conn)}
                onLabelFocusEditStart={(cx, cy, w) => enterFocusModeAt(cx, cy, w, "connector")}
                onLabelFocusEditEnd={exitFocusMode}
              />
            );
          })()}

          {/* messageBPMN move handle removed — the whole connector can be
              grabbed anywhere along its length to slide it. */}

          {/* Connector endpoint handles when a connector is selected.
              For messageBPMN: endpoints can be rewired to other pools
              (if currently on a pool) or other tasks/subprocesses inside
              white-box pools (if currently on a task/subprocess). The
              middle ew-resize handle still moves the whole connector. */}
          {endpointHandles && (() => {
            function makeEndpointHandler(endpoint: "source" | "target", pos: Point) {
              return (e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX, startY = e.clientY;
                let dragged = false;
                function onMove(ev: MouseEvent) {
                  if (!dragged && (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3)) {
                    dragged = true;
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                    handleEndpointDragStart(selectedConnectorId!, endpoint, pos, e);
                  }
                }
                function onUp() {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                  if (!dragged) {
                    // Click without drag — toggle focus
                    setFocusedEndpoint(prev => prev === endpoint ? null : endpoint);
                  }
                }
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              };
            }
            return (
              <g data-interactive>
                <circle
                  cx={endpointHandles.source.x} cy={endpointHandles.source.y}
                  r={5.5}
                  fill={focusedEndpoint === "source" ? "#f59e0b" : "#2563eb"}
                  stroke="white" strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                  onMouseDown={makeEndpointHandler("source", endpointHandles.source)}
                />
                <circle
                  cx={endpointHandles.target.x} cy={endpointHandles.target.y}
                  r={5.5}
                  fill={focusedEndpoint === "target" ? "#f59e0b" : "#2563eb"}
                  stroke="white" strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                  onMouseDown={makeEndpointHandler("target", endpointHandles.target)}
                />
              </g>
            );
          })()}

          {/* Rubber-band line during connector drag */}
          {draggingConnector && (
            <line data-interactive
              x1={draggingConnector.fromPos.x}
              y1={draggingConnector.fromPos.y}
              x2={draggingConnector.currentPos.x}
              y2={draggingConnector.currentPos.y}
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Group-connect flash: red for to-be-deleted, green for to-be-created */}
          {groupFlash && groupFlash.visible && (
            <g style={{ pointerEvents: "none" }}>
              {groupFlash.deleted.map((seg, i) => (
                <line
                  key={`del-${i}`}
                  x1={seg.from.x} y1={seg.from.y}
                  x2={seg.to.x} y2={seg.to.y}
                  stroke="#dc2626" strokeWidth={2.5} strokeDasharray="5 3"
                />
              ))}
              {groupFlash.created.map((seg, i) => {
                const dx = seg.to.x - seg.from.x;
                const dy = seg.to.y - seg.from.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len, uy = dy / len;
                const aSize = 8;
                const aBaseX = seg.to.x - ux * aSize;
                const aBaseY = seg.to.y - uy * aSize;
                const aLeftX = aBaseX - uy * (aSize * 0.5);
                const aLeftY = aBaseY + ux * (aSize * 0.5);
                const aRightX = aBaseX + uy * (aSize * 0.5);
                const aRightY = aBaseY - ux * (aSize * 0.5);
                return (
                  <g key={`new-${i}`}>
                    <line
                      x1={seg.from.x} y1={seg.from.y}
                      x2={seg.to.x} y2={seg.to.y}
                      stroke="#10b981" strokeWidth={2}
                    />
                    <polygon
                      points={`${seg.to.x},${seg.to.y} ${aLeftX},${aLeftY} ${aRightX},${aRightY}`}
                      fill="#10b981"
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* Bubble-help cloud — always anchored to the upper-right of
              the user's click point. Rendered inside the world-space
              transform so it pans/zooms with the diagram. */}
          {bubbleHelpAnchor && (
            <BubbleHelp
              pointX={bubbleHelpAnchor.x}
              pointY={bubbleHelpAnchor.y}
              text={bubbleHelpAnchor.text}
            />
          )}

          {/* Auto-connect flashing preview — user can press Esc to abort */}
          {autoConnectFlash && autoConnectFlash.visible && (() => {
            const dx = autoConnectFlash.to.x - autoConnectFlash.from.x;
            const dy = autoConnectFlash.to.y - autoConnectFlash.from.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len;
            // Arrowhead at target end
            const aSize = 8;
            const aBaseX = autoConnectFlash.to.x - ux * aSize;
            const aBaseY = autoConnectFlash.to.y - uy * aSize;
            const aLeftX = aBaseX - uy * (aSize * 0.5);
            const aLeftY = aBaseY + ux * (aSize * 0.5);
            const aRightX = aBaseX + uy * (aSize * 0.5);
            const aRightY = aBaseY - ux * (aSize * 0.5);
            return (
              <g style={{ pointerEvents: "none" }}>
                <line
                  x1={autoConnectFlash.from.x}
                  y1={autoConnectFlash.from.y}
                  x2={autoConnectFlash.to.x}
                  y2={autoConnectFlash.to.y}
                  stroke="#10b981"
                  strokeWidth={2}
                />
                <polygon
                  points={`${autoConnectFlash.to.x},${autoConnectFlash.to.y} ${aLeftX},${aLeftY} ${aRightX},${aRightY}`}
                  fill="#10b981"
                />
              </g>
            );
          })()}

          {/* Pool vertical-boundary alignment guide: dotted vertical line
              at the moving boundary's current X, spanning every pool on
              the canvas (including the one being resized). A marker sits
              at each pool's same-side boundary (vertical centre); the
              moving pool's own marker is always green (it IS the line),
              and other markers turn green when their X matches within
              4px. The whole line flashes green when EVERY pool aligns. */}
          {poolBoundaryGuide && (() => {
            const SNAP_PX = 4;
            const others = poolBoundaryGuide.others;
            if (others.length === 0) return null;
            // The moving pool's marker is always considered "aligned"
            // since the line passes through it by definition.
            const aligned = others.map(o =>
              o.isMoving || Math.abs(o.x - poolBoundaryGuide.currentX) < SNAP_PX
            );
            // "All aligned" means every OTHER pool also aligned.
            const allAligned =
              others.filter(o => !o.isMoving).length > 0 &&
              aligned.every(v => v);
            const minMidY = Math.min(...others.map(o => o.midY));
            const maxMidY = Math.max(...others.map(o => o.midY));
            const y1 = minMidY - 100;
            const y2 = maxMidY + 100;
            return (
              <g pointerEvents="none">
                {/* White halo behind the dotted line so it stays visible
                    over dark / busy backgrounds. */}
                <line
                  x1={poolBoundaryGuide.currentX} x2={poolBoundaryGuide.currentX}
                  y1={y1} y2={y2}
                  stroke="#ffffff"
                  strokeWidth={5}
                  strokeOpacity={0.7}
                />
                <line
                  x1={poolBoundaryGuide.currentX} x2={poolBoundaryGuide.currentX}
                  y1={y1} y2={y2}
                  stroke={allAligned ? "#10b981" : "#000000"}
                  strokeWidth={allAligned ? 3 : 2}
                  strokeDasharray="6 4"
                  className={allAligned ? "animate-pulse" : undefined}
                  opacity={1}
                />
                {others.map((o, i) => {
                  // Issue 2: the moving pool's marker tracks the live drag X
                  // (currentX) instead of the snapshot value. Other pools'
                  // markers stay anchored to their stored boundary X so the
                  // alignment cue is meaningful.
                  const cx = o.isMoving ? poolBoundaryGuide.currentX : o.x;
                  return (
                    <g key={o.id}>
                      {/* White halo around the marker for contrast */}
                      <circle
                        cx={cx} cy={o.midY} r={10}
                        fill="#ffffff" fillOpacity={0.85}
                        stroke="none"
                      />
                      <circle
                        cx={cx} cy={o.midY} r={8}
                        fill={aligned[i] ? "#10b981" : "#1f2937"}
                        fillOpacity={aligned[i] ? 1 : 0.6}
                        stroke={aligned[i] ? "#047857" : "#000000"}
                        strokeWidth={2}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Rubber-band line during endpoint drag */}
          {draggingEndpoint && (
            <line data-interactive
              x1={draggingEndpoint.startPos.x}
              y1={draggingEndpoint.startPos.y}
              x2={draggingEndpoint.currentPos.x}
              y2={draggingEndpoint.currentPos.y}
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Lasso selection rectangle */}
          {lassoRect && (() => {
            const lx = Math.min(lassoRect.startX, lassoRect.endX);
            const ly = Math.min(lassoRect.startY, lassoRect.endY);
            const lw = Math.abs(lassoRect.endX - lassoRect.startX);
            const lh = Math.abs(lassoRect.endY - lassoRect.startY);
            return (
              <rect data-interactive
                x={lx} y={ly} width={lw} height={lh}
                fill="rgba(59,130,246,0.1)" stroke="#3b82f6"
                strokeWidth={1 / zoom}
                strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                style={{ pointerEvents: "none" }}
              />
            );
          })()}

          {/* Pick-element overlay (published-viewer feedback). A huge
              transparent rect on top of the content captures the next
              click, converts it to world coords, and hit-tests against
              the elements (topmost / last-drawn wins) so the user can
              attach feedback to a specific element. Sets its own
              pointer-events so it works on a readOnly canvas. */}
          {pickElementMode && (() => {
            const extent = 100000;
            return (
              <rect
                x={-extent} y={-extent} width={extent * 2} height={extent * 2}
                fill="transparent"
                style={{ pointerEvents: "all", cursor: "crosshair" }}
                onClick={(e) => {
                  e.stopPropagation();
                  const wp = clientToWorld(e.clientX, e.clientY);
                  // Search last-to-first so the topmost (most recently
                  // drawn) element containing the point wins — typically
                  // the small child sitting on top of a pool/lane.
                  let hit: typeof data.elements[number] | undefined;
                  for (let i = data.elements.length - 1; i >= 0; i--) {
                    const el = data.elements[i];
                    if (wp.x >= el.x && wp.x <= el.x + el.width && wp.y >= el.y && wp.y <= el.y + el.height) {
                      hit = el;
                      break;
                    }
                  }
                  if (hit) onPickElement?.(hit.id, hit.label ?? "");
                }}
              />
            );
          })()}

          {/* Space insertion / removal markers.
              One marker = INSERT mode (green); two markers = REMOVE mode
              (red, with light-red strips highlighting the zone that
              will be collapsed). Either marker can be click-dragged
              to reposition; in INSERT mode shift-dragging the marker
              fires onInsertSpace. */}
          {spaceMarker && (() => {
            const inRemove = secondSpaceMarker !== null;
            const extent = 100000;
            const hitSize = 20 / zoom;
            const stroke = inRemove ? "#ef4444" : "#16a34a";
            const fill = inRemove ? "#ef4444" : "#22c55e";
            const lineColor = inRemove ? "rgba(239,68,68,0.45)" : "rgba(34,197,94,0.25)";

            function makeMarkerHandler(setMarker: (p: Point | null) => void, mx: number, my: number) {
              return function (e: React.MouseEvent) {
                e.stopPropagation();
                e.preventDefault();
                if (!inRemove && e.shiftKey && onInsertSpace) {
                  // Shift+drag in INSERT mode: dispatch space insertion.
                  let lastWorld = clientToWorld(e.clientX, e.clientY);
                  function onMove(ev: MouseEvent) {
                    const curWorld = clientToWorld(ev.clientX, ev.clientY);
                    const ddx = curWorld.x - lastWorld.x;
                    const ddy = curWorld.y - lastWorld.y;
                    if (Math.abs(ddx) > Math.abs(ddy)) {
                      if (ddx !== 0) onInsertSpace!(mx, my, ddx, 0);
                    } else {
                      if (ddy !== 0) onInsertSpace!(mx, my, 0, ddy);
                    }
                    lastWorld = curWorld;
                  }
                  function onUp() {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  }
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                } else {
                  // Normal drag: reposition this marker.
                  function onMove(ev: MouseEvent) { setMarker(clientToWorld(ev.clientX, ev.clientY)); }
                  function onUp() {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  }
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }
              };
            }

            const renderMarker = (mx: number, my: number, setter: (p: Point | null) => void) => (
              <g>
                <line x1={mx} y1={my - extent} x2={mx} y2={my + extent}
                  stroke={lineColor} strokeWidth={2 / zoom}
                  style={{ pointerEvents: "none" }} />
                <line x1={mx - extent} y1={my} x2={mx + extent} y2={my}
                  stroke={lineColor} strokeWidth={2 / zoom}
                  style={{ pointerEvents: "none" }} />
                <rect
                  x={mx - hitSize / 2} y={my - hitSize / 2}
                  width={hitSize} height={hitSize}
                  fill="transparent" stroke="none"
                  style={{ cursor: "move", pointerEvents: "all" }}
                  onMouseDown={makeMarkerHandler(setter, mx, my)}
                />
                <circle cx={mx} cy={my} r={6 / zoom}
                  fill={fill} stroke={stroke} strokeWidth={2 / zoom}
                  style={{ pointerEvents: "none" }} />
              </g>
            );

            return (
              <g>
                {/* Light-red zone strips behind markers when in REMOVE mode */}
                {inRemove && secondSpaceMarker && (() => {
                  const x1 = Math.min(spaceMarker.x, secondSpaceMarker.x);
                  const x2 = Math.max(spaceMarker.x, secondSpaceMarker.x);
                  const y1 = Math.min(spaceMarker.y, secondSpaceMarker.y);
                  const y2 = Math.max(spaceMarker.y, secondSpaceMarker.y);
                  return (
                    <g style={{ pointerEvents: "none" }}>
                      {/* Horizontal strip — full width */}
                      <rect x={-extent} y={y1} width={extent * 2} height={y2 - y1}
                        fill="#ef4444" fillOpacity={0.18} />
                      {/* Vertical strip — full height */}
                      <rect x={x1} y={-extent} width={x2 - x1} height={extent * 2}
                        fill="#ef4444" fillOpacity={0.18} />
                    </g>
                  );
                })()}
                {renderMarker(spaceMarker.x, spaceMarker.y, setSpaceMarker)}
                {secondSpaceMarker && renderMarker(secondSpaceMarker.x, secondSpaceMarker.y, setSecondSpaceMarker)}
              </g>
            );
          })()}

          {/* Debug labels — rendered last so they appear on top of everything */}
          {debugMode && (() => {
            const debugItems: { id: string; label: string; anchorX: number; anchorY: number; color: string; defaultOX: number; defaultOY: number }[] = [];
            const addedConnIds = new Set<string>();
            for (const selId of selectedElementIds) {
              const el = data.elements.find(e => e.id === selId);
              if (!el) continue;
              debugItems.push({
                id: `dbg-el-${el.id}`,
                label: `[${el.id.slice(-6)}] ${el.type}`,
                anchorX: el.x + el.width / 2, anchorY: el.y,
                color: "#059669", defaultOX: 0, defaultOY: -18,
              });
              for (const conn of data.connectors) {
                if (conn.sourceId !== el.id && conn.targetId !== el.id) continue;
                if (addedConnIds.has(conn.id)) continue;
                addedConnIds.add(conn.id);
                const wps = conn.waypoints;
                if (wps.length < 2) continue;
                const vs = conn.sourceInvisibleLeader ? 1 : 0;
                const ve = conn.targetInvisibleLeader ? wps.length - 2 : wps.length - 1;
                debugItems.push({ id: `dbg-cs-${conn.id}`, label: `S:${conn.id.slice(-4)} [${conn.sourceSide}]`,
                  anchorX: wps[vs].x, anchorY: wps[vs].y, color: "#dc2626", defaultOX: -20, defaultOY: -14 });
                debugItems.push({ id: `dbg-ct-${conn.id}`, label: `T:${conn.id.slice(-4)} [${conn.targetSide}]`,
                  anchorX: wps[ve].x, anchorY: wps[ve].y, color: "#dc2626", defaultOX: 20, defaultOY: -14 });
                for (let i = 0; i < ve - vs; i++) {
                  const a = wps[vs + i], b = wps[vs + i + 1];
                  debugItems.push({ id: `dbg-seg-${conn.id}-${i}`, label: `${conn.id.slice(-4)}.s${i}`,
                    anchorX: (a.x + b.x) / 2, anchorY: (a.y + b.y) / 2, color: "#9333ea", defaultOX: 0, defaultOY: -10 });
                }
              }
            }
            if (selectedConnectorId && selectedElementIds.size === 0) {
              const conn = data.connectors.find(c => c.id === selectedConnectorId);
              if (conn && conn.waypoints.length >= 2) {
                const wps = conn.waypoints;
                const vs = conn.sourceInvisibleLeader ? 1 : 0;
                const ve = conn.targetInvisibleLeader ? wps.length - 2 : wps.length - 1;
                const srcEl = data.elements.find(e => e.id === conn.sourceId);
                const tgtEl = data.elements.find(e => e.id === conn.targetId);
                debugItems.push({ id: `dbg-conn-${conn.id}`, label: `[${conn.id.slice(-6)}] ${conn.type} ${conn.routingType}`,
                  anchorX: (wps[vs].x + wps[ve].x) / 2, anchorY: (wps[vs].y + wps[ve].y) / 2, color: "#2563eb", defaultOX: 0, defaultOY: -22 });
                debugItems.push({ id: `dbg-cs2-${conn.id}`, label: `S:${srcEl?.label || conn.sourceId.slice(-4)} [${conn.sourceSide}:${(conn.sourceOffsetAlong ?? 0.5).toFixed(2)}]`,
                  anchorX: wps[vs].x, anchorY: wps[vs].y, color: "#dc2626", defaultOX: -30, defaultOY: -14 });
                debugItems.push({ id: `dbg-ct2-${conn.id}`, label: `T:${tgtEl?.label || conn.targetId.slice(-4)} [${conn.targetSide}:${(conn.targetOffsetAlong ?? 0.5).toFixed(2)}]`,
                  anchorX: wps[ve].x, anchorY: wps[ve].y, color: "#dc2626", defaultOX: 30, defaultOY: -14 });
                for (let i = 0; i < ve - vs; i++) {
                  const a = wps[vs + i], b = wps[vs + i + 1];
                  debugItems.push({ id: `dbg-seg2-${conn.id}-${i}`, label: `s${i} (${Math.round(a.x)},${Math.round(a.y)})\u2192(${Math.round(b.x)},${Math.round(b.y)})`,
                    anchorX: (a.x + b.x) / 2, anchorY: (a.y + b.y) / 2, color: "#9333ea", defaultOX: 0, defaultOY: -10 });
                }
              }
            }
            return debugItems.map(item => (
              <DebugLabel key={item.id} item={item} svgToWorld={clientToWorld}
                offsets={debugLabelOffsets} setOffset={setDebugLabelOffset} />
            ));
          })()}

          {/* Pool/Lane drop preview — shown while dragging the Pool/Lane
              palette symbol over an existing pool. Green for LANE,
              blue for SUBLANE, purple for SUB-SUBLANE (split). */}
          {poolDropPreview && (
            <line
              x1={poolDropPreview.x1}
              y1={poolDropPreview.y1}
              x2={poolDropPreview.x2}
              y2={poolDropPreview.y2}
              stroke={
                poolDropPreview.kind === "subsublane" ? "#a855f7"
                : poolDropPreview.kind === "sublane"  ? "#3b82f6"
                : "#22c55e"
              }
              strokeWidth={4 / zoom}
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}

          {/* Scan-issue tint — drawn LAST so it overlays everything. Red for
              errors, orange for warnings. Cleared after the 20s window by
              the editor. */}
          {scanHighlightById && scanHighlightById.size > 0 && data.elements
            .filter((el: DiagramElement) => scanHighlightById.has(el.id))
            .map((el: DiagramElement) => {
              const severity = scanHighlightById.get(el.id);
              const color = severity === "warning" ? "#f59e0b" : "#dc2626";
              // Dim flagged elements that don't belong to the current
              // cycled issue. When no issue is active (currentIssueIds
              // undefined / empty), every flagged element stays at full
              // strength as before.
              const isCurrent = !currentIssueIds || currentIssueIds.size === 0
                || currentIssueIds.has(el.id);
              return (
                <rect
                  key={`scan-hl-${el.id}`}
                  x={el.x - 3}
                  y={el.y - 3}
                  width={el.width + 6}
                  height={el.height + 6}
                  fill="none"
                  stroke={color}
                  strokeWidth={(isCurrent ? 3 : 2) / zoom}
                  opacity={isCurrent ? 1 : 0.25}
                  rx={4}
                  pointerEvents="none"
                />
              );
            })}

          {/* Connector scan highlights — drawn LAST so they overlay the
              normal connector strokes. The first and last waypoints of a
              Diagramatix connector are INVISIBLE LEADERS at the source/
              target element centres; including them in the overlay paints
              an orange line across the centre of each end element. Slice
              them off so the overlay traces only the visible segments. */}
          {scanHighlightConnectorById && scanHighlightConnectorById.size > 0 && data.connectors
            .filter((c) => scanHighlightConnectorById.has(c.id) && (c.waypoints?.length ?? 0) >= 4)
            .map((c) => {
              const severity = scanHighlightConnectorById.get(c.id);
              const color = severity === "warning" ? "#f59e0b" : "#dc2626";
              const visible = c.waypoints.slice(1, -1);
              const points = visible.map((p) => `${p.x},${p.y}`).join(" ");
              // Connectors not in the current cycled issue fade to a
              // breadcrumb so the user can still see where every flagged
              // connector is without losing focus on the current one.
              const isCurrent = !currentIssueIds || currentIssueIds.size === 0
                || currentIssueIds.has(c.id);
              return (
                <polyline
                  key={`scan-hl-conn-${c.id}`}
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={(isCurrent ? 6 : 4) / zoom}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={isCurrent ? 0.55 : 0.18}
                  pointerEvents="none"
                />
              );
            })}

        </g>
      </svg>
      </DatabaseCtx.Provider>
      </ArchimateDepthCtx.Provider>
      </LaneDepthCtx.Provider>
      </ProcessGroupDepthCtx.Provider>
      </SublaneIdsCtx.Provider>
      </ProcessFontSizeCtx.Provider>
      </DescriptionFontSizeCtx.Provider>
      </ValueChainFontSizeCtx.Provider>
      </LaneFontSizeCtx.Provider>
      </PoolFontSizeCtx.Provider>
      </TitleFontSizeCtx.Provider>
      </ConnectorFontScaleCtx.Provider>
      </FontScaleCtx.Provider>
      </DisplayModeCtx.Provider>

      {/* Inline label editor overlay */}
      {editingLabel && (() => {
        const editingEl = data.elements.find(e => e.id === editingLabel.elementId);
        const isUseCase = editingEl?.type === 'use-case';
        const isPoolLane = editingEl?.type === 'pool' || editingEl?.type === 'lane';
        const hasTaskMarker = editingEl?.type === 'task' && !!editingEl?.taskType && editingEl?.taskType !== 'none';
        const isUmlElement = editingEl?.type === 'uml-class' || editingEl?.type === 'uml-enumeration';
        const commonChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          let val = e.target.value;
          // UML class/enumeration: limit to 2 lines
          if (isUmlElement) {
            const lines = val.split('\n');
            if (lines.length > 2) val = lines.slice(0, 2).join('\n');
          }
          setEditingLabel(prev => prev ? { ...prev, value: val } : null);
          // Task / Sub-Process: live autosize during typing — element
          // grows/shrinks per keystroke. History push happens once on
          // commitLabel via the preLabelEditRef captured in onBeginLabelEdit.
          if (editingEl && (editingEl.type === 'task' || editingEl.type === 'subprocess')) {
            onUpdateLabelLive?.(editingEl.id, val);
          }
        };
        if (isUseCase) {
          return (
            <textarea
              autoFocus
              value={editingLabel.value}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0); }}
              onChange={commonChange as React.ChangeEventHandler<HTMLTextAreaElement>}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitLabel();
                }
                if (e.key === 'Escape') setEditingLabel(null);
              }}
              style={{
                position: 'absolute',
                left: editingLabel.x,
                top: editingLabel.y,
                width: editingLabel.width,
                height: editingLabel.height,
                fontSize: (data.fontSize ?? 12) * zoom,
                textAlign: 'center',
                background: 'white',
                border: '2px solid #2563eb',
                borderRadius: 4,
                outline: 'none',
                padding: '4px',
                resize: 'none',
                overflow: 'hidden',
              }}
            />
          );
        }
        if (isPoolLane) {
          // Entity-list autocomplete: white-box pool & lane → Org Structure
          // (whole indented tree, Organisation default); black-box pool →
          // External Participants or IT Systems (flat). Falls back to the
          // plain textarea when the project has no structure loaded.
          const el = editingEl!;
          const isBlackBox = el.type === "pool" && el.properties?.poolType === "black-box";
          const isWhiteBoxPool = el.type === "pool" && !isBlackBox;
          let kind: EntityListKind;
          let suggestions: ProjectEntityStructure["orgStructure"] | undefined;
          let flatLevel: EntityNodeLevel | null = null;
          let defaultName: string | undefined;
          if (isBlackBox) {
            const sys = !!el.properties?.isSystem;
            kind = sys ? "System" : "Participant";
            suggestions = sys ? entityStructure?.systems : entityStructure?.participants;
            flatLevel = sys ? "System" : "Participant";
          } else {
            kind = "OrgStructure";
            suggestions = entityStructure?.orgStructure;
            defaultName = isWhiteBoxPool ? entityStructure?.orgStructure.find(s => s.level === "Organisation")?.name : undefined;
          }
          const listId = entityStructure?.listIds[kind];
          if (entityStructure && suggestions && listId && onAddEntityNode) {
            const commitName = (name: string) => { onUpdateLabel(editingLabel.elementId, name); setEditingLabel(null); };
            return (
              <EntityNameInput
                box={{ x: editingLabel.x, y: editingLabel.y, width: Math.max(editingLabel.width, 150), height: editingLabel.height }}
                fontSizePx={(data.fontSize ?? 12) * 11 / 12 * zoom}
                suggestions={suggestions}
                defaultName={defaultName}
                allowNew
                flatLevel={flatLevel}
                onCommit={commitName}
                onCommitNew={async (name, level, parentId) => { await onAddEntityNode(listId, { name, level, parentId }); commitName(name); }}
                onCancel={() => setEditingLabel(null)}
              />
            );
          }
          return (
            <textarea
              autoFocus
              value={editingLabel.value}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0); }}
              onChange={commonChange as React.ChangeEventHandler<HTMLTextAreaElement>}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingLabel(null);
                if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); commitLabel(); }
              }}
              style={{
                position: 'absolute',
                left: editingLabel.x,
                top: editingLabel.y,
                width: editingLabel.width,
                height: editingLabel.height,
                fontSize: (data.fontSize ?? 12) * 11 / 12 * zoom,
                textAlign: 'left',
                background: 'white',
                border: '2px solid #7c3a2a',
                borderRadius: 4,
                outline: 'none',
                padding: '4px',
                resize: 'none',
              }}
              placeholder="Enter name (Ctrl+Enter to confirm)"
            />
          );
        }
        const isUmlEl = editingEl?.type === "uml-class" || editingEl?.type === "uml-enumeration";
        const editLines = editingLabel.value.split("\n").length;
        // For task/subprocess, read live element dims so the overlay
        // visibly grows/shrinks per keystroke as updateLabelLive runs.
        const isAutoSized = editingEl?.type === "task" || editingEl?.type === "subprocess";
        const liveLeft = isAutoSized ? (editingEl!.x * zoom + pan.x) : editingLabel.x;
        const liveTop  = isAutoSized ? (editingEl!.y * zoom + pan.y) : editingLabel.y;
        const liveW    = isAutoSized ? (editingEl!.width  * zoom) : editingLabel.width;
        const liveH    = isAutoSized ? (editingEl!.height * zoom) : editingLabel.height;
        const editH = isUmlEl ? Math.max(editingLabel.height, editLines * 16 * zoom + 8) : liveH;
        return (
          <textarea
            autoFocus
            value={editingLabel.value}
            onFocus={(e) => {
              const t = e.target;
              setTimeout(() => {
                // Review comments carry a fixed "Name\nEmail\n---\n" header;
                // select only the comment body so editing doesn't highlight
                // (and risk clobbering) the reviewer identity (item 6).
                if (editingEl?.type === "review-comment") {
                  const sep = t.value.indexOf("---\n");
                  const start = sep >= 0 ? sep + 4 : 0;
                  t.setSelectionRange(start, t.value.length);
                } else {
                  t.select();
                }
              }, 0);
            }}
            onChange={commonChange as React.ChangeEventHandler<HTMLTextAreaElement>}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitLabel(); }
              if (e.key === "Escape") {
                onCancelLabelEdit?.();
                setEditingLabel(null);
              }
            }}
            style={{
              position: "absolute",
              left: liveLeft,
              // Marker no longer reserves vertical space — first line of
              // text wraps around the marker on the same row. The textarea
              // covers the full element area during edit; the marker
              // re-appears once commit re-renders the underlying shape.
              top: liveTop,
              width: liveW,
              height: editH,
              fontSize: (data.fontSize ?? 12) * zoom,
              textAlign: "center",
              background: "white",
              border: "2px solid #2563eb",
              borderRadius: 4,
              outline: "none",
              padding: "4px",
              resize: "none",
              overflow: "hidden",
            }}
            placeholder={isUmlEl ? "Name (Shift+Enter for new line)" : undefined}
          />
        );
      })()}

      {/* Task type picker — shown after dropping a task onto a BPMN canvas */}
      {pendingDrop && pendingDrop.symbolType === "task" && (() => {
        const itemH = 20, headerH = 22, pad = 8;
        const dropdownH = headerH + TASK_TYPE_OPTIONS.length * itemH + pad;
        const containerH = svgRef.current?.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
        const top = Math.min(pendingDrop.containerY, containerH - dropdownH);
        return (
          <div
            style={{ position: "absolute", left: pendingDrop.containerX + pickerOffset.x, top: top + pickerOffset.y, zIndex: 50 }}
            className="bg-white border border-gray-200 rounded shadow-lg py-1 flex flex-col"
          >
            <p
              className="px-3 py-0.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={(e) => { e.preventDefault(); pickerDragRef.current = { startX: e.clientX, startY: e.clientY, origOffX: pickerOffset.x, origOffY: pickerOffset.y }; }}
            >
              Task Type
            </p>
            {TASK_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="text-left px-3 py-0.5 text-sm text-gray-700 hover:bg-gray-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addElementWithAutoConnect("task", pendingDrop.worldPos, opt.value);
                  setPendingDrop(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        );
      })()}
      {/* Intermediate Event type picker */}
      {pendingDrop && pendingDrop.symbolType === "intermediate-event" && (() => {
        const itemH = 20, headerH = 22, pad = 8;
        const dropdownH = headerH + INTERMEDIATE_EVENT_TYPE_OPTIONS.length * itemH + pad;
        const containerH = svgRef.current?.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
        const top = Math.min(pendingDrop.containerY, containerH - dropdownH);
        return (
          <div
            style={{ position: "absolute", left: pendingDrop.containerX + pickerOffset.x, top: top + pickerOffset.y, zIndex: 50 }}
            className="bg-white border border-gray-200 rounded shadow-lg py-1 flex flex-col"
          >
            <p
              className="px-3 py-0.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={(e) => { e.preventDefault(); pickerDragRef.current = { startX: e.clientX, startY: e.clientY, origOffX: pickerOffset.x, origOffY: pickerOffset.y }; }}
            >
              Event Type
            </p>
            {INTERMEDIATE_EVENT_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="text-left px-3 py-0.5 text-sm text-gray-700 hover:bg-gray-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (pendingDrop.splitConnectorId && onSplitConnector) {
                    onSplitConnector("intermediate-event", pendingDrop.worldPos, pendingDrop.splitConnectorId, undefined, opt.value);
                  } else {
                    addElementWithAutoConnect("intermediate-event", pendingDrop.worldPos, undefined, opt.value);
                  }
                  setPendingDrop(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Right-click quick-add popup */}
      {quickAdd && (() => {
        const BPMN_QUICK_ADD: SymbolType[] = [
          "start-event", "intermediate-event", "end-event",
          "task", "subprocess", "subprocess-expanded", "gateway",
          "data-object", "data-store", "text-annotation", "group",
        ];
        const SM_QUICK_ADD: SymbolType[] = [
          "state", "submachine", "initial-state", "final-state", "composite-state", "gateway", "fork-join",
        ];
        const VC_QUICK_ADD: SymbolType[] = [
          "chevron", "chevron-collapsed", "process-group",
        ];
        const QUICK_ADD_TYPES = diagramType === "state-machine" ? SM_QUICK_ADD
          : diagramType === "value-chain" ? VC_QUICK_ADD : BPMN_QUICK_ADD;
        const labels: Record<string, string> = {
          "start-event": "Start",
          "task": "Task",
          "subprocess": "Sub-Process",
          "subprocess-expanded": "Expanded",
          "intermediate-event": "Intermediate",
          "end-event": "End",
          "data-object": "Data Object",
          "data-store": "Data Store",
          "text-annotation": "Annotation",
          "group": "Group",
          "state": "State",
          "initial-state": "Initial",
          "final-state": "Final",
          "composite-state": "Composite",
          "gateway": "Gateway",
          "fork-join": "Fork/Join",
          "submachine": "SubMachine",
          "chevron": "Process",
          "chevron-collapsed": "Collapsed",
          "process-group": "Value Chain",
        };
        const COLS = 4;
        const BUTTON = 40;       // w-10 / h-10
        const GAP = 4;           // gap-1 in tailwind = 0.25rem ≈ 4px
        const PAD = 4;           // p-1
        const popupW = COLS * BUTTON + (COLS - 1) * GAP + 2 * PAD;
        const rows = Math.ceil(QUICK_ADD_TYPES.length / COLS);
        const popupH = rows * BUTTON + (rows - 1) * GAP + 2 * PAD;
        // Clamp popup so it stays inside the canvas
        const containerRect = svgRef.current?.parentElement?.getBoundingClientRect();
        const containerW = containerRect?.width ?? window.innerWidth;
        const containerH = containerRect?.height ?? window.innerHeight;
        const left = Math.min(quickAdd.screenX, containerW - popupW - 4);
        const top = Math.min(quickAdd.screenY, containerH - popupH - 4);
        return (
          <div
            style={{
              position: "absolute",
              left,
              top,
              zIndex: 50,
              width: popupW,
              display: "grid",
              gridTemplateColumns: `repeat(${COLS}, ${BUTTON}px)`,
              gap: `${GAP}px`,
              padding: `${PAD}px`,
            }}
            className="bg-white border border-gray-300 rounded shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {QUICK_ADD_TYPES.map((sym) => (
              <button
                key={sym}
                title={labels[sym]}
                className="w-10 h-10 flex items-center justify-center rounded hover:bg-blue-50 border border-transparent hover:border-blue-200"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  addElementWithAutoConnect(sym, quickAdd.worldPos);
                  setQuickAdd(null);
                }}
              >
                <PaletteSymbolPreview type={sym} colorConfig={colorConfig} />
              </button>
            ))}
          </div>
        );
      })()}

      {/* Element-specific right-click context menu (task / gateway /
          subprocess / data-object / event). For gateways this now shows two
          sections — Gateway Type AND Role — and supports ↑/↓/Enter/Esc
          keyboard navigation that skips section headers. */}
      {elementContextMenu && (() => {
        const ecm = elementContextMenu;
        const el = data.elements.find(e => e.id === ecm.elementId);
        if (!el) { setElementContextMenu(null); return null; }
        // Generous height estimate covering the largest menu (Event Trigger
        // with 11 entries). Used only to keep the popup inside the canvas
        // container on right-clicks near a viewport edge.
        const POPUP_W = 160;
        const POPUP_H_MAX = 320;
        const containerRect = svgRef.current?.parentElement?.getBoundingClientRect();
        const containerW = containerRect?.width ?? window.innerWidth;
        const containerH = containerRect?.height ?? window.innerHeight;
        const left = Math.min(ecm.screenX, containerW - POPUP_W - 4);
        const top = Math.min(ecm.screenY, containerH - POPUP_H_MAX - 4);
        return (
          <ElementContextMenu
            el={el}
            kind={ecm.kind}
            left={left}
            top={top}
            width={POPUP_W}
            onSelect={(propKey, value) => {
              onUpdateProperties?.(el.id, { [propKey]: value });
              setElementContextMenu(null);
            }}
            onAction={(action) => {
              setElementContextMenu(null);
              if (action === "collapse-ep" && el.type === "subprocess-expanded") {
                onCollapseEpToSubprocess?.(el.id);
              }
            }}
            onClose={() => setElementContextMenu(null)}
          />
        );
      })()}

      {/* Process colour theme picker popup */}
      {themePicker && onUpdatePropertiesBatch && (() => {
        const CHEVRON_SET = new Set(["chevron", "chevron-collapsed"]);
        // Reading order (top-left → right → down → right) so a Value Chain
        // split across two rows themes as one continuous ramp.
        const selectedChevrons = chevronReadingOrder(
          data.elements.filter(el => selectedElementIds.has(el.id) && CHEVRON_SET.has(el.type)),
        );
        if (selectedChevrons.length < 2) { setThemePicker(null); return null; }
        const containerRect = svgRef.current?.parentElement?.getBoundingClientRect();
        const containerW = containerRect?.width ?? window.innerWidth;
        const containerH = containerRect?.height ?? window.innerHeight;
        const POPUP_W = 268;
        const POPUP_H = CHEVRON_THEMES.length * 32 + 36 + 12; // N themes + clear + padding
        const left = Math.min(themePicker.screenX, containerW - POPUP_W - 4);
        const top = Math.min(themePicker.screenY, containerH - POPUP_H - 4);
        return (
          <div
            style={{ position: "absolute", left, top, zIndex: 50, width: POPUP_W }}
            className="bg-white border border-gray-300 rounded shadow-lg p-1.5"
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide px-1 mb-1">
              Colour Theme ({selectedChevrons.length} processes)
            </p>
            {CHEVRON_THEMES.map((theme) => (
              <button
                key={theme.name}
                className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const updates = selectedChevrons.map((el, i) => ({
                    id: el.id,
                    properties: { fillColor: theme.colours[i % theme.colours.length] },
                  }));
                  onUpdatePropertiesBatch(updates);
                  setThemePicker(null);
                }}
              >
                <span className="text-[10px] text-gray-700 w-12 shrink-0">{theme.name}</span>
                <div className="flex gap-0.5">
                  {theme.colours.map((c, i) => (
                    <div key={i}
                      className={`w-3 h-3 rounded-sm border ${i < selectedChevrons.length ? "border-gray-400" : "border-gray-200 opacity-40"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                className="w-full text-left px-1.5 py-1 text-[10px] text-gray-500 hover:bg-gray-50 rounded"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const updates = selectedChevrons.map((el) => ({
                    id: el.id,
                    properties: { fillColor: undefined },
                  }));
                  onUpdatePropertiesBatch(updates);
                  setThemePicker(null);
                }}
              >
                Clear Colours
              </button>
            </div>
          </div>
        );
      })()}

      {/* Status bar */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-400 bg-white/80 px-2 py-1 rounded">
        {isDraggingConnector || isDraggingEndpoint
          ? "Release over an element to connect · Esc to cancel"
          : "Drag to pan · Shift+Drag to select · Scroll to zoom · Double-click label · Delete to remove"}
        {" · "}
        {Math.round(zoom * 100)}%
      </div>

      {/* Connector type choice popup — shown when both sequence and association are valid */}
      {connectorChoice && (
        <div
          style={{ position: "absolute", left: connectorChoice.pos.x, top: connectorChoice.pos.y, zIndex: 50 }}
          className="bg-white border border-gray-300 rounded shadow-lg p-1"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onAddConnector(connectorChoice.sourceId, connectorChoice.targetId,
                "sequence", defaultDirectionType, defaultRoutingType,
                connectorChoice.sourceSide, connectorChoice.targetSide,
                connectorChoice.sourceOffset, connectorChoice.targetOffset);
              setConnectorChoice(null);
            }}
            className="block px-3 py-1.5 text-xs hover:bg-gray-100 w-full text-left rounded"
          >
            Sequence
          </button>
          <button
            onClick={() => {
              onAddConnector(connectorChoice.sourceId, connectorChoice.targetId,
                "associationBPMN", "open-directed", "direct",
                connectorChoice.sourceSide, connectorChoice.targetSide,
                connectorChoice.sourceOffset, connectorChoice.targetOffset);
              setConnectorChoice(null);
            }}
            className="block px-3 py-1.5 text-xs hover:bg-gray-100 w-full text-left rounded"
          >
            Association
          </button>
        </div>
      )}

      {/* Force-connect mode indicator */}
      {forceConnect?.dragging && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-medium px-3 py-1 rounded-full shadow-sm z-30 select-none animate-pulse">
          Force Connect: click target element (Esc to cancel)
        </div>
      )}

      {/* Zoom slider bar at bottom-right of canvas */}
      {(() => {
        const base = baseZoomRef.current ?? zoom;
        const displayPct = Math.round((zoom / base) * 100);
        const MIN_PCT = 25, MAX_PCT = 250;

        function applyZoomPct(pct: number) {
          const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
          const newZ = base * (clamped / 100);
          const rect = svgRef.current?.getBoundingClientRect();
          if (rect) {
            const cx = rect.width / 2, cy = rect.height / 2;
            setPan(prev => ({ x: cx - (cx - prev.x) * (newZ / zoom), y: cy - (cy - prev.y) * (newZ / zoom) }));
          }
          setZoom(newZ);
        }

        return (
          <div
            className="absolute bottom-2 flex items-center gap-1.5 bg-white/90 border border-gray-200 rounded-full px-2 py-1 shadow-sm backdrop-blur-sm z-30 select-none"
            style={{ right: "calc(0.5rem + 156px + 6px + 130px + 6px)" }}
          >
            <button
              onClick={() => applyZoomPct(displayPct - 10)}
              className="text-gray-500 hover:text-gray-800 text-xs font-bold w-5 h-5 flex items-center justify-center"
              title="Zoom out"
            >&minus;</button>
            <input
              type="range"
              min={MIN_PCT}
              max={MAX_PCT}
              value={Math.min(MAX_PCT, Math.max(MIN_PCT, displayPct))}
              onChange={(e) => applyZoomPct(parseInt(e.target.value))}
              className="w-24 h-1 accent-blue-500 cursor-pointer"
              title={`${displayPct}%`}
            />
            <button
              onClick={() => applyZoomPct(displayPct + 10)}
              className="text-gray-500 hover:text-gray-800 text-xs font-bold w-5 h-5 flex items-center justify-center"
              title="Zoom in"
            >+</button>
            <input
              type="text"
              className="w-10 text-[10px] text-gray-600 text-center border border-gray-300 rounded px-0.5 py-0 bg-white tabular-nums"
              style={{ userSelect: "text" }}
              key={`zoom-${displayPct}`}
              defaultValue={`${displayPct}%`}
              onMouseDown={(e) => e.stopPropagation()}
              onFocus={(e) => { e.target.value = String(displayPct); e.target.select(); }}
              onBlur={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) applyZoomPct(v); }}
              onKeyDown={(e) => { if (e.key === "Enter") { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v)) applyZoomPct(v); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
            />
          </div>
        );
      })()}

      {/* Auto-connect 3-state cyclic toggle (off → to-only → on → off).
          Persists across reloads via localStorage. Editing-only — hidden
          in the read-only published viewer. */}
      {!readOnly && (
      <button
        onClick={() => setAutoConnectMode((m) => m === "off" ? "to-only" : m === "to-only" ? "on" : "off")}
        className={`absolute bottom-2 right-2 flex items-center gap-1 rounded-full px-2 py-1 shadow-sm backdrop-blur-sm z-30 select-none border text-[11px] font-medium transition-colors ${
          autoConnectMode === "on"
            ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
            : autoConnectMode === "to-only"
              ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
              : "bg-white/90 text-gray-600 border-gray-300 hover:bg-gray-50"
        }`}
        title={
          autoConnectMode === "on"
            ? "Auto-connect ON — both incoming and outgoing connectors are auto-created. Click to switch to TO ONLY."
            : autoConnectMode === "to-only"
              ? "Auto-connect TO ONLY — only incoming connectors (existing → new) are auto-created. Click to switch to OFF."
              : "Auto-connect OFF — dropped shapes are placed without auto-connectors (gateway-merge group connect still runs). Click to switch to TO ONLY."
        }
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="3" cy="8" r="2" />
          <circle cx="13" cy="8" r="2" />
          <line x1="5" y1="8" x2="11" y2="8" />
        </svg>
        Auto-connect: {autoConnectMode === "on" ? "ON" : autoConnectMode === "to-only" ? "TO ONLY" : "OFF"}
      </button>
      )}

      {/* Bubble-help master toggle. ON = show the "Click and Drag to
          create a connector" cloud each time an element is single-
          selected (auto-dismiss after 10 s or next mousedown). OFF =
          never show. Persists across reloads. Editing-only — hidden in
          the read-only published viewer. */}
      {!readOnly && (
      <button
        onClick={toggleBubbleHelp}
        style={{ right: "calc(0.5rem + 156px + 6px)" }}
        className={`absolute bottom-2 flex items-center gap-1 rounded-full px-2 py-1 shadow-sm backdrop-blur-sm z-30 select-none border text-[11px] font-medium transition-colors ${
          bubbleHelpEnabled
            ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
            : "bg-white/90 text-gray-600 border-gray-300 hover:bg-gray-50"
        }`}
        title={
          bubbleHelpEnabled
            ? "Bubble help ON — each cloud topic shows up to 3 times per session. Click to turn OFF."
            : "Bubble help OFF — no help clouds. Click to turn ON (resets per-topic counts)."
        }
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 5c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H8l-3 3v-3H5c-1.1 0-2-.9-2-2V5Z" />
        </svg>
        Bubble help: {bubbleHelpEnabled ? "ON" : "OFF"}
      </button>
      )}

      {pendingArchiConn && (
        <ArchimateConnectorPicker
          x={pendingArchiConn.screenX + 6}
          y={pendingArchiConn.screenY + 6}
          sourceName={(() => {
            const el = data.elements.find(e => e.id === pendingArchiConn.sourceId);
            const key = el?.properties?.shapeKey as string | undefined;
            return key ? findArchimateShapeByKey(key)?.name : undefined;
          })()}
          targetName={(() => {
            const el = data.elements.find(e => e.id === pendingArchiConn.targetId);
            const key = el?.properties?.shapeKey as string | undefined;
            return key ? findArchimateShapeByKey(key)?.name : undefined;
          })()}
          onCancel={() => setPendingArchiConn(null)}
          onSelect={(archiType: ArchimateConnectorType, extras?: { influenceSign?: "+" | "-" }) => {
            const p = pendingArchiConn;
            setPendingArchiConn(null);
            const initialLabel = archiType === "archi-influence" && extras?.influenceSign ? extras.influenceSign : undefined;
            onAddConnector(
              p.sourceId,
              p.targetId,
              archiType,
              "directed",
              "rectilinear",
              p.sourceSide,
              p.targetSide,
              p.sourceOffset,
              p.targetOffset,
              false,            // force
              initialLabel,
            );
          }}
        />
      )}

      {removalConfirm && (
        <RemoveSpaceDialog
          zoneWidth={removalConfirm.zone.width}
          zoneHeight={removalConfirm.zone.height}
          toDelete={removalConfirm.toDelete}
          ignored={removalConfirm.ignored}
          affected={removalConfirm.affected}
          onConfirm={(sel: RsSelection) => {
            const z = removalConfirm.zone;
            setRemovalConfirm(null);
            setSpaceMarker(null);
            setSecondSpaceMarker(null);
            setSpaceMode(null);
            if (onRemoveSpace) {
              onRemoveSpace(z, {
                preserveIds: Array.from(sel.preserve),
                extraDeleteIds: Array.from(sel.delete),
                leaveAloneIds: Array.from(sel.leaveAlone),
              });
            }
          }}
          onCancel={() => setRemovalConfirm(null)}
        />
      )}
    </div>
  );
}

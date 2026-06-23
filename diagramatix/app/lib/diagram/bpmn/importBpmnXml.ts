/**
 * BPMN 2.0 (.bpmn) XML import — OMG-standard interchange format.
 *
 * Counterpart to importVisioV3.ts. Where the Visio importer deals with the
 * Microsoft `.vsdx` archive + cached-value shape geometry, this importer
 * deals with the OMG BPMN 2.0 XML interchange format: a single XML
 * document containing a SEMANTIC tree (`<definitions><collaboration|
 * process>` with tags like `<task>`, `<sequenceFlow>`, `<lane>`) and a
 * VISUAL tree (`<bpmndi:BPMNDiagram><bpmndi:BPMNPlane>` with
 * `<BPMNShape bpmnElement="...">` carrying `<Bounds x y width height>`
 * and `<BPMNEdge bpmnElement="...">` carrying `<waypoint x y>` arrays).
 *
 * The plan covering this importer is in
 * `C:\Users\paul\.claude\plans\nifty-singing-hennessy.md` ("BPMN 2.0
 * (.bpmn) file importer — v1 single-file flow"). Key design points:
 *
 *  - One Diagramatix BPMN diagram per .bpmn file. Multi-participant
 *    collaborations become multiple pools on the same canvas.
 *  - Tag matching is namespace-prefix agnostic: <task>, <bpmn:task>,
 *    and <semantic:task> all resolve identically. Signavio (the source
 *    of the 24 sample files) uses default-namespace + omgdc:/omgdi:
 *    prefixes for DI elements; Camunda/bpmn.io exports use bpmn:/dc:/
 *    di: prefixes. The parser handles either.
 *  - Regex-based extraction, mirroring importVisioV3.ts — no new XML
 *    parser dependency. BPMN XML is well-formed enough for this to be
 *    reliable; per-element parse failures emit warnings without
 *    aborting the import.
 *  - Pixel coordinates passed through verbatim — every sample uses
 *    pixels in `<Bounds>` and `<waypoint>`. A diagnostic warning fires
 *    if median element width drops below 20 px (likely mm).
 *  - Signavio's `<signavio:signavioMetaData>` colours and glossary
 *    links preserved opaquely into `properties.signavio.*`. Not
 *    surfaced on the canvas in v1.
 */

import type {
  DiagramData,
  DiagramElement,
  Connector,
  SymbolType,
  BpmnTaskType,
  GatewayType,
  EventType,
  FlowType,
} from "../types";
import { wrapText } from "../textMetrics";

export interface BpmnImportResult {
  data: DiagramData;
  /** Diagram name resolved from collaboration → process → filename. */
  diagramName: string;
  /** Original BPMN element/flow id → the minted Diagramatix id. Lets callers
   *  resolve BPSim elementRefs (which use original BPMN ids). */
  idMap: Record<string, string>;
  warnings: string[];
  stats: {
    processCount: number;
    participantCount: number;
    elementsCreated: number;
    connectorsCreated: number;
    shapesDropped: number;
    flowsDropped: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

interface Bounds { x: number; y: number; width: number; height: number }
interface Waypoint { x: number; y: number }

/** Strip an XML namespace prefix from a tag name. "bpmn:task" → "task". */
function localName(tag: string): string {
  return tag.replace(/^[a-zA-Z0-9_-]+:/, "");
}

/** Read an attribute value from an open-tag substring. Returns undefined when
 *  the attribute is absent. Tolerates either " or ' quoting. */
function getAttr(openTag: string, name: string): string | undefined {
  // Anchor on a leading whitespace so we don't match e.g. "isClosed" when
  // asked for "Closed".
  const re = new RegExp(`\\s${name}=["']([^"']*)["']`);
  const m = openTag.match(re);
  return m ? decodeXmlEntities(m[1]) : undefined;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r")
    .replace(/&#xa;/gi, "\n")
    .replace(/&#xd;/gi, "\r")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

interface ParsedTag {
  /** Open-tag substring including angle brackets, e.g. `<task id="X" name="Y">`. */
  openTag: string;
  /** Local element name with namespace prefix stripped, e.g. `"task"`. */
  local: string;
  /** Body (between open and close tags). Empty string for self-closing tags. */
  body: string;
  /** Span in the source string covering the full element including its
   *  open/close tags. Use this to seek past the element when walking. */
  start: number;
  end: number;
}

/** Find all CHILD elements of `parent` whose local tag name matches one of
 *  `localTagNames`. "Child" here means at depth-1 relative to the parent's
 *  content — nested matches inside a child are not returned (caller can
 *  recurse). Returns matches in document order.
 *
 *  The walker tracks bracket depth so it never returns a tag nested inside
 *  another element of the same name. */
function findChildren(parent: string, localTagNames: string[]): ParsedTag[] {
  const wanted = new Set(localTagNames);
  const out: ParsedTag[] = [];
  // Generic tag matcher: opens, closes, self-closing.
  // Match either:
  //   <ns:tag ...attrs.../>     (self-closing)
  //   <ns:tag ...attrs...>      (open)
  //   </ns:tag>                 (close)
  const re = /<(\/?)([a-zA-Z_][a-zA-Z0-9._:-]*)((?:\s+[^=\s]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let depth = 0;
  let topLevelStart = -1;
  let topLevelOpenTag = "";
  let topLevelLocal = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(parent)) !== null) {
    const [full, slash, tag, , selfClose] = m;
    const local = localName(tag);
    if (selfClose === "/") {
      // self-closing
      if (depth === 0 && wanted.has(local)) {
        out.push({
          openTag: full,
          local,
          body: "",
          start: m.index,
          end: m.index + full.length,
        });
      }
      continue;
    }
    if (slash === "/") {
      // close tag
      if (depth === 1 && topLevelStart >= 0 && local === topLevelLocal) {
        if (wanted.has(topLevelLocal)) {
          const end = m.index + full.length;
          out.push({
            openTag: topLevelOpenTag,
            local: topLevelLocal,
            body: parent.slice(topLevelStart + topLevelOpenTag.length, m.index),
            start: topLevelStart,
            end,
          });
        }
        topLevelStart = -1;
      }
      depth--;
      continue;
    }
    // open tag
    if (depth === 0) {
      topLevelStart = m.index;
      topLevelOpenTag = full;
      topLevelLocal = local;
    }
    depth++;
  }
  return out;
}

/** Read the first text-child of an element body, with all child element
 *  tags stripped and HTML entities decoded. Handles `<text>...</text>`
 *  and `<flowNodeRef>...</flowNodeRef>` style nodes. */
function readInnerText(body: string): string {
  // Drop every nested element open/close tag, leaving only PCDATA.
  const stripped = body.replace(/<[^>]+>/g, "");
  return decodeXmlEntities(stripped).trim();
}

/** Map of generation-time helpers shared across passes. */
function nanoid(): string {
  // Short URL-safe id; matches the convention used elsewhere in the codebase.
  return Math.random().toString(36).slice(2, 11);
}

// ────────────────────────────────────────────────────────────────────────────
// Classifier — OMG local tag → Diagramatix element/connector seed
// ────────────────────────────────────────────────────────────────────────────

interface ElementSeed {
  type: SymbolType;
  taskType?: BpmnTaskType;
  gatewayType?: GatewayType;
  flowType?: FlowType;
}

/** Tasks: every Task subtype in Semantic.xsd. The classifier returns the
 *  matching Diagramatix `taskType` so the canvas renders the right marker. */
const TASK_LOCAL_NAMES: Record<string, BpmnTaskType> = {
  task: "none",
  manualTask: "manual",
  userTask: "user",
  serviceTask: "service",
  sendTask: "send",
  receiveTask: "receive",
  scriptTask: "script",
  businessRuleTask: "business-rule",
  callActivity: "none", // distinct visual TODO (v2); for now a plain task.
};

const SUBPROCESS_LOCAL_NAMES = new Set([
  "subProcess",
  "adHocSubProcess",
  "transaction",
]);

const GATEWAY_LOCAL_NAMES: Record<string, GatewayType> = {
  exclusiveGateway: "exclusive",
  inclusiveGateway: "inclusive",
  parallelGateway: "parallel",
  eventBasedGateway: "event-based",
  complexGateway: "none",
};

const EVENT_LOCAL_NAMES = new Set([
  "startEvent",
  "endEvent",
  "intermediateThrowEvent",
  "intermediateCatchEvent",
  "boundaryEvent",
]);

const DATA_LOCAL_NAMES = new Set([
  "dataObject",
  "dataObjectReference",
  "dataStore",
  "dataStoreReference",
]);

const FLOW_LOCAL_NAMES = new Set(["sequenceFlow", "messageFlow", "association"]);

/** Event sub-type comes from the child `<*EventDefinition>` element. */
const EVENT_DEFINITION_MAP: Record<string, EventType> = {
  messageEventDefinition: "message",
  timerEventDefinition: "timer",
  errorEventDefinition: "error",
  signalEventDefinition: "signal",
  escalationEventDefinition: "escalation",
  cancelEventDefinition: "cancel",
  compensateEventDefinition: "compensation",
  conditionalEventDefinition: "conditional",
  linkEventDefinition: "link",
  terminateEventDefinition: "terminate",
};

function classifyEvent(local: string, body: string): { type: SymbolType; eventType: EventType; flowType: FlowType } {
  let type: SymbolType = "intermediate-event";
  let flowType: FlowType = "none";
  if (local === "startEvent") {
    type = "start-event";
  } else if (local === "endEvent") {
    type = "end-event";
  } else if (local === "boundaryEvent") {
    // Boundary events are rendered as intermediate-event nodes mounted on a
    // host element via boundaryHostId. The caller wires that.
    type = "intermediate-event";
    flowType = "catching";
  } else if (local === "intermediateThrowEvent") {
    type = "intermediate-event";
    flowType = "throwing";
  } else if (local === "intermediateCatchEvent") {
    type = "intermediate-event";
    flowType = "catching";
  }
  // Sub-type from event-definition child.
  let eventType: EventType = "none";
  for (const [defName, et] of Object.entries(EVENT_DEFINITION_MAP)) {
    if (new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${defName}\\b`).test(body)) {
      eventType = et;
      break;
    }
  }
  return { type, eventType, flowType };
}

// ────────────────────────────────────────────────────────────────────────────
// Index pass — build bpmnElement-id → bounds / waypoints maps
// ────────────────────────────────────────────────────────────────────────────

interface DiIndex {
  shapeBounds: Map<string, Bounds>;
  /** Whether the shape was marked `isExpanded="false"` (subprocess collapsed). */
  shapeCollapsed: Map<string, boolean>;
  edgeWaypoints: Map<string, Waypoint[]>;
}

function indexDi(xml: string): DiIndex {
  const shapeBounds = new Map<string, Bounds>();
  const shapeCollapsed = new Map<string, boolean>();
  const edgeWaypoints = new Map<string, Waypoint[]>();

  // Find every <BPMNShape> open-tag block + its body (up to </BPMNShape>).
  const shapeRe = /<(?:[a-zA-Z0-9_-]+:)?BPMNShape\b([^>]*)>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?BPMNShape>/g;
  for (const m of xml.matchAll(shapeRe)) {
    const openAttrs = m[1];
    const body = m[2];
    const bpmnId = getAttr("<x " + openAttrs + ">", "bpmnElement");
    if (!bpmnId) continue;
    const isExpanded = getAttr("<x " + openAttrs + ">", "isExpanded");
    if (isExpanded === "false") shapeCollapsed.set(bpmnId, true);
    // Body has a <Bounds .../> child (self-closing).
    const bm = body.match(/<(?:[a-zA-Z0-9_-]+:)?Bounds\b([^/>]*)\/?>/);
    if (!bm) continue;
    const x = parseFloat(getAttr("<x " + bm[1] + ">", "x") ?? "");
    const y = parseFloat(getAttr("<x " + bm[1] + ">", "y") ?? "");
    const width = parseFloat(getAttr("<x " + bm[1] + ">", "width") ?? "");
    const height = parseFloat(getAttr("<x " + bm[1] + ">", "height") ?? "");
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) continue;
    shapeBounds.set(bpmnId, { x, y, width, height });
  }

  // Self-closing shapes (rare in Signavio but allowed by spec).
  const shapeSelfRe = /<(?:[a-zA-Z0-9_-]+:)?BPMNShape\b([^>]*)\/>/g;
  for (const m of xml.matchAll(shapeSelfRe)) {
    const openAttrs = m[1];
    const bpmnId = getAttr("<x " + openAttrs + ">", "bpmnElement");
    if (!bpmnId || shapeBounds.has(bpmnId)) continue;
    // Self-closing shape with no Bounds — skip; treat as "no visual".
  }

  // Edges + their waypoints.
  const edgeRe = /<(?:[a-zA-Z0-9_-]+:)?BPMNEdge\b([^>]*)>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?BPMNEdge>/g;
  for (const m of xml.matchAll(edgeRe)) {
    const openAttrs = m[1];
    const body = m[2];
    const bpmnId = getAttr("<x " + openAttrs + ">", "bpmnElement");
    if (!bpmnId) continue;
    const points: Waypoint[] = [];
    const wpRe = /<(?:[a-zA-Z0-9_-]+:)?waypoint\b([^/>]*)\/?>/g;
    for (const wm of body.matchAll(wpRe)) {
      const x = parseFloat(getAttr("<x " + wm[1] + ">", "x") ?? "");
      const y = parseFloat(getAttr("<x " + wm[1] + ">", "y") ?? "");
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    }
    if (points.length > 0) edgeWaypoints.set(bpmnId, points);
  }

  return { shapeBounds, shapeCollapsed, edgeWaypoints };
}

// ────────────────────────────────────────────────────────────────────────────
// Signavio extension extraction
// ────────────────────────────────────────────────────────────────────────────

/** Pull Signavio metaKey/metaValue pairs out of a node body. Returned as a
 *  flat record so it can be stored on `element.properties.signavio`. */
function extractSignavio(body: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const metaRe = /<(?:[a-zA-Z0-9_-]+:)?signavioMetaData\b([^/>]*)\/?>/g;
  for (const m of body.matchAll(metaRe)) {
    const k = getAttr("<x " + m[1] + ">", "metaKey");
    const v = getAttr("<x " + m[1] + ">", "metaValue");
    if (k && v != null) out[k] = v;
  }
  // Glossary link — first one wins.
  const linkRe = /<(?:[a-zA-Z0-9_-]+:)?dictionaryLink\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?dictionaryLink>/;
  const lm = body.match(linkRe);
  if (lm) out.dictionaryLink = decodeXmlEntities(lm[1].trim());
  return Object.keys(out).length > 0 ? out : undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Element builders
// ────────────────────────────────────────────────────────────────────────────

interface BuildContext {
  di: DiIndex;
  warnings: string[];
  /** Maps the source `bpmnId` to the Diagramatix element id. (We mint fresh
   *  ids to avoid collisions with any existing diagram's ids on import.) */
  idMap: Map<string, string>;
  elements: DiagramElement[];
  connectors: Connector[];
  /** Set of node ids that the diagram contains a `<BPMNShape>` for. Nodes
   *  without a shape are dropped from the visual but still recorded here so
   *  the corresponding `<sequenceFlow>` can be warned-and-dropped properly. */
  hasShape: Set<string>;
  stats: BpmnImportResult["stats"];
}

/** Allocate a new Diagramatix id for a source BPMN id, or return the
 *  previously-allocated one. */
function mintId(ctx: BuildContext, bpmnId: string): string {
  const existing = ctx.idMap.get(bpmnId);
  if (existing) return existing;
  const fresh = nanoid();
  ctx.idMap.set(bpmnId, fresh);
  return fresh;
}

const FALLBACK_SIZE: Record<SymbolType, { w: number; h: number }> = {
  "task":               { w: 102, h: 65 },
  "subprocess":         { w: 108, h: 72 },
  "subprocess-expanded":{ w: 180, h: 108 },
  "gateway":            { w: 40, h: 40 },
  "start-event":        { w: 36, h: 36 },
  "intermediate-event": { w: 36, h: 36 },
  "end-event":          { w: 36, h: 36 },
  "data-object":        { w: 36, h: 46 },
  "data-store":         { w: 50, h: 40 },
  "text-annotation":    { w: 100, h: 60 },
  "group":              { w: 240, h: 160 },
  "pool":               { w: 600, h: 200 },
  "lane":               { w: 600, h: 80 },
  "sublane":            { w: 600, h: 60 },
  // Types that don't appear in BPMN but keep the record total covering all
  // SymbolType cases; the BPMN classifier never produces these.
  "use-case":           { w: 120, h: 60 },
  "actor":              { w: 40, h: 52 },
  "team":               { w: 96, h: 52 },
  "state":              { w: 120, h: 60 },
  "initial-state":      { w: 30, h: 30 },
  "final-state":        { w: 30, h: 30 },
  "system-boundary":    { w: 200, h: 300 },
  "system-boundary-body": { w: 200, h: 300 },
  "hourglass":          { w: 40, h: 40 },
  "composite-state":    { w: 360, h: 180 },
  "composite-state-body": { w: 360, h: 180 },
  "system":             { w: 40, h: 80 },
  "external-entity":    { w: 100, h: 60 },
  "process-system":     { w: 80, h: 60 },
  "uml-class":          { w: 200, h: 120 },
  "uml-enumeration":    { w: 200, h: 120 },
  "fork-join":          { w: 80, h: 6 },
  "submachine":         { w: 120, h: 60 },
  "chevron":            { w: 120, h: 60 },
  "chevron-collapsed":  { w: 60, h: 30 },
  "process-group":      { w: 400, h: 200 },
  "archimate-shape":    { w: 120, h: 60 },
  "review-comment":     { w: 160, h: 80 },
  "flowchart-terminator":   { w: 120, h: 50 },
  "flowchart-process":      { w: 140, h: 60 },
  "flowchart-decision":     { w: 120, h: 80 },
  "flowchart-io":           { w: 140, h: 60 },
  "flowchart-document":     { w: 130, h: 70 },
  "flowchart-multidoc":     { w: 130, h: 76 },
  "flowchart-predefined":   { w: 140, h: 60 },
  "flowchart-preparation":  { w: 140, h: 60 },
  "flowchart-manual-input": { w: 140, h: 60 },
  "flowchart-manual-op":    { w: 140, h: 60 },
  "flowchart-display":      { w: 140, h: 60 },
  "flowchart-delay":        { w: 130, h: 60 },
  "flowchart-database":     { w: 90,  h: 80 },
  "flowchart-onpage":       { w: 44,  h: 44 },
  "flowchart-offpage":      { w: 60,  h: 56 },
  "flowchart-merge":        { w: 70,  h: 56 },
  "flowchart-parallel":     { w: 120, h: 8 },
  "flowchart-comment":      { w: 120, h: 60 },
  "flowchart-vswimlane":    { w: 220, h: 480 },
};

interface BuiltElement {
  el: DiagramElement;
  /** Whether a `<BPMNShape>` provided real bounds (vs. fallback). */
  hadShape: boolean;
}

function buildElement(
  ctx: BuildContext,
  bpmnId: string,
  type: SymbolType,
  name: string,
  body: string,
  extra: Partial<DiagramElement> = {},
): BuiltElement {
  const id = mintId(ctx, bpmnId);
  const bounds = ctx.di.shapeBounds.get(bpmnId);
  const hadShape = !!bounds;
  if (hadShape) ctx.hasShape.add(bpmnId);
  const fb = FALLBACK_SIZE[type] ?? { w: 80, h: 40 };
  const rect = bounds ?? { x: 0, y: 0, width: fb.w, height: fb.h };
  const properties: Record<string, unknown> = { ...(extra.properties ?? {}) };
  const signavio = extractSignavio(body);
  if (signavio) properties.signavio = signavio;
  const el: DiagramElement = {
    id,
    type,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    label: decodeXmlEntities(name ?? ""),
    properties,
    ...(extra.parentId ? { parentId: extra.parentId } : {}),
    ...(extra.boundaryHostId ? { boundaryHostId: extra.boundaryHostId } : {}),
    ...(extra.taskType ? { taskType: extra.taskType } : {}),
    ...(extra.gatewayType ? { gatewayType: extra.gatewayType } : {}),
    ...(extra.eventType ? { eventType: extra.eventType } : {}),
    ...(extra.flowType ? { flowType: extra.flowType } : {}),
    ...(extra.repeatType ? { repeatType: extra.repeatType } : {}),
  };
  return { el, hadShape };
}

// ────────────────────────────────────────────────────────────────────────────
// Main semantic walk
// ────────────────────────────────────────────────────────────────────────────

/** Walk a `<process>` or `<subProcess>` body and emit all its flow elements
 *  + sequence flows. Recurses into nested sub-processes whose visual shape
 *  is marked expanded; collapsed sub-processes drop their internals with a
 *  single warning. Returns the set of bpmnId values produced from this
 *  container (used by the caller to wire lane parentage). */
function walkProcessBody(
  ctx: BuildContext,
  body: string,
  parentDiagramId: string | undefined,   // Diagramatix id of the containing pool/lane/EP
): Set<string> {
  const produced = new Set<string>();

  // Tasks (every Task subtype).
  for (const t of findChildren(body, Object.keys(TASK_LOCAL_NAMES))) {
    const bpmnId = getAttr(t.openTag, "id");
    if (!bpmnId) continue;
    const name = getAttr(t.openTag, "name") ?? "";
    const taskType = TASK_LOCAL_NAMES[t.local];
    const { el, hadShape } = buildElement(ctx, bpmnId, "task", name, t.body, {
      taskType,
      parentId: parentDiagramId,
    });
    if (!hadShape) {
      ctx.warnings.push(`Task "${name || bpmnId}" has no <BPMNShape> — dropped.`);
      ctx.stats.shapesDropped++;
      continue;
    }
    ctx.elements.push(el);
    ctx.stats.elementsCreated++;
    produced.add(bpmnId);
  }

  // Sub-processes (collapsed vs expanded).
  for (const sp of findChildren(body, Array.from(SUBPROCESS_LOCAL_NAMES))) {
    const bpmnId = getAttr(sp.openTag, "id");
    if (!bpmnId) continue;
    const name = getAttr(sp.openTag, "name") ?? "";
    const collapsed = ctx.di.shapeCollapsed.get(bpmnId) === true;
    const type: SymbolType = collapsed ? "subprocess" : "subprocess-expanded";
    const isAdHoc = sp.local === "adHocSubProcess" || getAttr(sp.openTag, "triggeredByEvent") === "true";
    const subprocessType =
      sp.local === "transaction" ? "transaction"
      : getAttr(sp.openTag, "triggeredByEvent") === "true" ? "event"
      : "normal";
    const extraProps: Record<string, unknown> = {
      subprocessType,
      ...(isAdHoc ? { adHoc: true } : {}),
    };
    const { el, hadShape } = buildElement(ctx, bpmnId, type, name, sp.body, {
      parentId: parentDiagramId,
      properties: extraProps,
    });
    if (!hadShape) {
      ctx.warnings.push(`Sub-process "${name || bpmnId}" has no <BPMNShape> — dropped.`);
      ctx.stats.shapesDropped++;
      continue;
    }
    ctx.elements.push(el);
    ctx.stats.elementsCreated++;
    produced.add(bpmnId);
    if (collapsed) {
      // Per the plan: collapsed sub-process drops its internals with a
      // single aggregated warning. (Counts the children that would
      // otherwise have been emitted.)
      const innerCount =
        findChildren(sp.body, [...Object.keys(TASK_LOCAL_NAMES), ...EVENT_LOCAL_NAMES, ...Object.keys(GATEWAY_LOCAL_NAMES), ...SUBPROCESS_LOCAL_NAMES]).length;
      if (innerCount > 0) {
        ctx.warnings.push(
          `Collapsed sub-process "${name || bpmnId}" had ${innerCount} inner element(s) — open the original .bpmn to view them.`,
        );
      }
    } else {
      walkProcessBody(ctx, sp.body, el.id);
    }
  }

  // Gateways.
  for (const g of findChildren(body, Object.keys(GATEWAY_LOCAL_NAMES))) {
    const bpmnId = getAttr(g.openTag, "id");
    if (!bpmnId) continue;
    const name = getAttr(g.openTag, "name") ?? "";
    const gatewayType = GATEWAY_LOCAL_NAMES[g.local];
    const { el, hadShape } = buildElement(ctx, bpmnId, "gateway", name, g.body, {
      gatewayType,
      parentId: parentDiagramId,
    });
    if (!hadShape) {
      ctx.warnings.push(`Gateway "${name || bpmnId}" has no <BPMNShape> — dropped.`);
      ctx.stats.shapesDropped++;
      continue;
    }
    ctx.elements.push(el);
    ctx.stats.elementsCreated++;
    produced.add(bpmnId);
  }

  // Events.
  for (const ev of findChildren(body, Array.from(EVENT_LOCAL_NAMES))) {
    const bpmnId = getAttr(ev.openTag, "id");
    if (!bpmnId) continue;
    const name = getAttr(ev.openTag, "name") ?? "";
    const { type, eventType, flowType } = classifyEvent(ev.local, ev.body);
    const attachedToRef = ev.local === "boundaryEvent" ? getAttr(ev.openTag, "attachedToRef") : undefined;
    const cancelActivity = getAttr(ev.openTag, "cancelActivity");
    const interruptionType =
      ev.local === "boundaryEvent" && cancelActivity === "false" ? "non-interrupting" : undefined;
    const boundaryHostId = attachedToRef ? mintId(ctx, attachedToRef) : undefined;
    const extraProps: Record<string, unknown> = {};
    if (interruptionType) extraProps.interruptionType = interruptionType;
    const { el, hadShape } = buildElement(ctx, bpmnId, type, name, ev.body, {
      eventType,
      flowType,
      parentId: parentDiagramId,
      boundaryHostId,
      properties: extraProps,
    });
    if (!hadShape) {
      ctx.warnings.push(`Event "${name || bpmnId}" has no <BPMNShape> — dropped.`);
      ctx.stats.shapesDropped++;
      continue;
    }
    ctx.elements.push(el);
    ctx.stats.elementsCreated++;
    produced.add(bpmnId);
  }

  // Data objects + stores.
  for (const d of findChildren(body, Array.from(DATA_LOCAL_NAMES))) {
    const bpmnId = getAttr(d.openTag, "id");
    if (!bpmnId) continue;
    const name = getAttr(d.openTag, "name") ?? "";
    const isStore = d.local === "dataStore" || d.local === "dataStoreReference";
    const isCollection = getAttr(d.openTag, "isCollection") === "true";
    const extraProps: Record<string, unknown> = {};
    if (!isStore && isCollection) extraProps.multiplicity = "collection";
    const { el, hadShape } = buildElement(
      ctx,
      bpmnId,
      isStore ? "data-store" : "data-object",
      name,
      d.body,
      { parentId: parentDiagramId, properties: extraProps },
    );
    if (!hadShape) {
      // Data objects very often appear in the semantic tree without a
      // matching BPMNShape (e.g. referenced via dataInputAssociation but
      // not laid out). Silently drop without a per-element warning — the
      // shapesDropped stat aggregates the count.
      ctx.stats.shapesDropped++;
      continue;
    }
    ctx.elements.push(el);
    ctx.stats.elementsCreated++;
    produced.add(bpmnId);
  }

  // Text annotations.
  for (const t of findChildren(body, ["textAnnotation"])) {
    const bpmnId = getAttr(t.openTag, "id");
    if (!bpmnId) continue;
    // Text content lives in a <text> child of textAnnotation.
    const textChild = findChildren(t.body, ["text"])[0];
    const label = textChild ? readInnerText(textChild.body) : "";
    const { el, hadShape } = buildElement(ctx, bpmnId, "text-annotation", label, t.body, {
      parentId: parentDiagramId,
    });
    if (!hadShape) { ctx.stats.shapesDropped++; continue; }
    ctx.elements.push(el);
    ctx.stats.elementsCreated++;
    produced.add(bpmnId);
  }

  // Groups.
  for (const g of findChildren(body, ["group"])) {
    const bpmnId = getAttr(g.openTag, "id");
    if (!bpmnId) continue;
    const name = getAttr(g.openTag, "name") ?? getAttr(g.openTag, "categoryValueRef") ?? "";
    const { el, hadShape } = buildElement(ctx, bpmnId, "group", name, g.body, {
      parentId: parentDiagramId,
    });
    if (!hadShape) { ctx.stats.shapesDropped++; continue; }
    ctx.elements.push(el);
    ctx.stats.elementsCreated++;
    produced.add(bpmnId);
  }

  return produced;
}

/** Wire lane parentage. After walkProcessBody has placed every flow element
 *  parented to the pool, this pass re-parents each element to its
 *  containing lane (per the lane's `<flowNodeRef>` children).
 *
 *  SINGLE-LANE ABSORPTION: a pool with exactly ONE unnamed lane is
 *  treated as a single-row pool with no visible lane band — the lane's
 *  child nodes stay parented to the pool and the lane element itself is
 *  NOT emitted. This matches Visio importer behaviour and avoids an
 *  empty grey strip running across the pool body. Multi-lane pools, and
 *  pools with a single NAMED lane (which the user evidently wants to
 *  see), render every lane. */
function applyLaneParenting(
  ctx: BuildContext,
  laneSetBody: string,
  poolDiagramId: string,
): void {
  const lanes = findChildren(laneSetBody, ["lane"]);
  // Single-lane absorption: skip the lane when it carries no name OR when
  // its name duplicates the pool's name (case-insensitive, whitespace-
  // collapsed). Both patterns are import artefacts — a pool with a single
  // lane is never meaningful by itself, and a lane named the same as its
  // parent pool is a duplicate label that wastes a horizontal band.
  //
  // For message connectors that target the absorbed lane (common when the
  // source authored a black-box pool with a single lane and ran messages
  // *to the lane*), we map the lane's BPMN id to the pool's Diagramatix id
  // in ctx.idMap so the later buildFlows pass resolves the endpoint to
  // the pool itself.
  if (lanes.length === 1) {
    const only = lanes[0];
    const laneBpmnId = getAttr(only.openTag, "id") ?? "";
    const laneName = (getAttr(only.openTag, "name") ?? "").trim();
    const poolEl = ctx.elements.find((e) => e.id === poolDiagramId);
    const poolName = (poolEl?.label ?? "").trim();
    const normalise = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const sameAsPool = !!laneName && !!poolName && normalise(laneName) === normalise(poolName);
    if (!laneName || sameAsPool) {
      // Re-parent the lane's direct child flow nodes to the pool.
      for (const ref of findChildren(only.body, ["flowNodeRef"])) {
        const refText = readInnerText(ref.body);
        if (!refText) continue;
        const childDiagramId = ctx.idMap.get(refText);
        if (!childDiagramId) continue;
        const child = ctx.elements.find((e) => e.id === childDiagramId);
        if (child) child.parentId = poolDiagramId;
      }
      // Sub-lanes: when the absorbed lane wraps a nested <childLaneSet>,
      // those sub-lanes are now what the pool actually contains. Run
      // applyLaneParenting recursively on the child lane set with the
      // POOL as the parent so the sub-lanes are emitted at top level
      // (and themselves get the same absorption logic applied — a sub-
      // lane of the same name as the pool would also be absorbed).
      const childLaneSet = findChildren(only.body, ["childLaneSet"])[0];
      if (childLaneSet) {
        applyLaneParenting(ctx, childLaneSet.body, poolDiagramId);
      }
      // Reroute any message/sequence/association connector that targets
      // the absorbed lane to the pool. The flow build pass runs later and
      // uses idMap to resolve sourceRef/targetRef, so overwriting the
      // mapping here is sufficient.
      if (laneBpmnId) ctx.idMap.set(laneBpmnId, poolDiagramId);
      if (sameAsPool) {
        ctx.warnings.push(`Pool "${poolName}" had a single lane with the same name — lane absorbed into the pool.`);
      }
      return;
    }
  }
  for (const lane of lanes) {
    const bpmnId = getAttr(lane.openTag, "id");
    if (!bpmnId) continue;
    const name = getAttr(lane.openTag, "name") ?? "";
    const { el, hadShape } = buildElement(ctx, bpmnId, "lane", name, lane.body, {
      parentId: poolDiagramId,
    });
    if (!hadShape) {
      ctx.warnings.push(`Lane "${name || bpmnId}" has no <BPMNShape> — dropped.`);
      ctx.stats.shapesDropped++;
      continue;
    }
    ctx.elements.push(el);
    ctx.stats.elementsCreated++;
    // Re-parent the lane's child nodes.
    for (const ref of findChildren(lane.body, ["flowNodeRef"])) {
      const refText = readInnerText(ref.body);
      if (!refText) continue;
      const childDiagramId = ctx.idMap.get(refText);
      if (!childDiagramId) continue;
      const child = ctx.elements.find((e) => e.id === childDiagramId);
      if (child) child.parentId = el.id;
    }
    // Nested laneSet (sub-lanes).
    const childLaneSet = findChildren(lane.body, ["childLaneSet"])[0];
    if (childLaneSet) {
      applyLaneParenting(ctx, childLaneSet.body, el.id);
    }
  }
}

/** Walk a process body (recursively into nested sub-processes) and emit an
 *  `associationBPMN` connector for every `<dataInputAssociation>` /
 *  `<dataOutputAssociation>` whose source/target resolves to a known
 *  Diagramatix element. These appear as CHILDREN of an activity (task /
 *  subprocess) and carry their own ids — the BPMN DI section emits a
 *  matching `<BPMNEdge bpmnElement="associationId">` so we can look up
 *  waypoints by association id.
 *
 *  dataInputAssociation:  source = data object, target = task's input  →
 *                          arrow from data object → activity.
 *  dataOutputAssociation: source = task's output,  target = data object →
 *                          arrow from activity → data object.
 *  In Diagramatix terms both render as `associationBPMN` between the
 *  data object and the parent activity.
 */
function buildDataAssociations(ctx: BuildContext, body: string): void {
  // Activities that can carry data associations: task subtypes + subprocess.
  const activityTags = [
    ...Object.keys(TASK_LOCAL_NAMES),
    ...SUBPROCESS_LOCAL_NAMES,
  ];
  for (const activity of findChildren(body, activityTags)) {
    const activityBpmnId = getAttr(activity.openTag, "id");
    if (!activityBpmnId) continue;
    const activityDiagramId = ctx.idMap.get(activityBpmnId);
    if (!activityDiagramId) continue; // activity wasn't imported (no shape)

    const emit = (assocBpmnId: string, otherSideId: string, isInput: boolean) => {
      const dataDiagramId = ctx.idMap.get(otherSideId);
      if (!dataDiagramId) {
        // Common case: the targetRef of a dataInputAssociation points at
        // an <ioSpecification><dataInput> nested in the activity, which
        // is not itself imported. Fall back to silent skip — the visual
        // association from the data object → activity comes from the
        // OPPOSITE side (sourceRef of dataInputAssociation = data
        // object). We only emit when the data side resolves.
        return;
      }
      const sourceId = isInput ? dataDiagramId : activityDiagramId;
      const targetId = isInput ? activityDiagramId : dataDiagramId;
      let waypoints = ctx.di.edgeWaypoints.get(assocBpmnId);
      if (!waypoints) {
        const s = ctx.elements.find((e) => e.id === sourceId);
        const t = ctx.elements.find((e) => e.id === targetId);
        if (s && t) {
          waypoints = [
            { x: s.x + s.width / 2, y: s.y + s.height / 2 },
            { x: t.x + t.width / 2, y: t.y + t.height / 2 },
          ];
        } else {
          waypoints = [];
        }
      }
      ctx.connectors.push({
        id: mintId(ctx, assocBpmnId),
        sourceId,
        targetId,
        sourceSide: "right",
        targetSide: "left",
        type: "associationBPMN",
        directionType: "directed",
        routingType: "rectilinear",
        sourceInvisibleLeader: false,
        targetInvisibleLeader: false,
        waypoints,
      });
      ctx.stats.connectorsCreated++;
    };

    for (const a of findChildren(activity.body, ["dataInputAssociation"])) {
      const assocId = getAttr(a.openTag, "id");
      if (!assocId) continue;
      // <sourceRef> child = data object id (the side we care about).
      const srcRef = findChildren(a.body, ["sourceRef"])[0];
      if (!srcRef) continue;
      const dataObjectRef = readInnerText(srcRef.body);
      if (!dataObjectRef) continue;
      emit(assocId, dataObjectRef, true);
    }
    for (const a of findChildren(activity.body, ["dataOutputAssociation"])) {
      const assocId = getAttr(a.openTag, "id");
      if (!assocId) continue;
      // <targetRef> child = data object id.
      const tgtRef = findChildren(a.body, ["targetRef"])[0];
      if (!tgtRef) continue;
      const dataObjectRef = readInnerText(tgtRef.body);
      if (!dataObjectRef) continue;
      emit(assocId, dataObjectRef, false);
    }

    // Recurse into expanded sub-processes so their nested data
    // associations are also wired.
    if (SUBPROCESS_LOCAL_NAMES.has(activity.local) && ctx.di.shapeCollapsed.get(activityBpmnId) !== true) {
      buildDataAssociations(ctx, activity.body);
    }
  }
}

/** Build connectors from sequenceFlow + association + messageFlow.
 *  Drops flows whose endpoints don't resolve to an imported element. */
function buildFlows(
  ctx: BuildContext,
  body: string,
  defaultType: "sequence" | "associationBPMN" | "messageBPMN",
  localNames: string[],
): void {
  for (const f of findChildren(body, localNames)) {
    const bpmnId = getAttr(f.openTag, "id");
    if (!bpmnId) continue;
    const sourceRef = getAttr(f.openTag, "sourceRef");
    const targetRef = getAttr(f.openTag, "targetRef");
    if (!sourceRef || !targetRef) {
      ctx.warnings.push(`Flow ${bpmnId} (${f.local}) missing source/target — dropped.`);
      ctx.stats.flowsDropped++;
      continue;
    }
    const sId = ctx.idMap.get(sourceRef);
    const tId = ctx.idMap.get(targetRef);
    if (!sId || !tId) {
      ctx.warnings.push(`Flow ${bpmnId} (${f.local}) references unknown element — dropped.`);
      ctx.stats.flowsDropped++;
      continue;
    }
    const name = getAttr(f.openTag, "name") ?? "";
    // Type-specific: associations vs sequence vs message.
    let type: "sequence" | "associationBPMN" | "messageBPMN" = defaultType;
    if (f.local === "messageFlow") type = "messageBPMN";
    else if (f.local === "association") type = "associationBPMN";
    else type = "sequence";

    // Waypoints — use the DI index if present, else a straight line between
    // shape centres.
    let waypoints = ctx.di.edgeWaypoints.get(bpmnId);
    if (!waypoints) {
      const s = ctx.elements.find((e) => e.id === sId);
      const t = ctx.elements.find((e) => e.id === tId);
      if (s && t) {
        waypoints = [
          { x: s.x + s.width / 2, y: s.y + s.height / 2 },
          { x: t.x + t.width / 2, y: t.y + t.height / 2 },
        ];
      } else {
        waypoints = [];
      }
    }

    // Condition / default flag on the connector's properties.
    const hasCondition = /<(?:[a-zA-Z0-9_-]+:)?conditionExpression\b/.test(f.body);

    const conn: Connector = {
      id: mintId(ctx, bpmnId),
      sourceId: sId,
      targetId: tId,
      sourceSide: "right",
      targetSide: "left",
      type,
      directionType: "directed",
      routingType: "rectilinear",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints,
      label: name ? decodeXmlEntities(name) : undefined,
    };
    if (hasCondition) {
      // condition expressions are preserved opaquely for future v2
      // rendering — stored as a stringified body since the connector
      // type doesn't have a generic properties bag.
      (conn as Connector & { _condition?: string })._condition = "true";
    }
    ctx.connectors.push(conn);
    ctx.stats.connectorsCreated++;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level entry
// ────────────────────────────────────────────────────────────────────────────

export async function importBpmnXml(
  xmlText: string,
  fileNameStem: string,
): Promise<BpmnImportResult> {
  const warnings: string[] = [];
  const stats: BpmnImportResult["stats"] = {
    processCount: 0,
    participantCount: 0,
    elementsCreated: 0,
    connectorsCreated: 0,
    shapesDropped: 0,
    flowsDropped: 0,
  };

  // Locate <definitions>...</definitions>.
  const defsMatch = xmlText.match(
    /<(?:[a-zA-Z0-9_-]+:)?definitions\b([^>]*)>([\s\S]*)<\/(?:[a-zA-Z0-9_-]+:)?definitions>/,
  );
  if (!defsMatch) {
    return {
      data: { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } },
      diagramName: fileNameStem,
      idMap: {},
      warnings: ["No <definitions> root element found — not a BPMN 2.0 file."],
      stats,
    };
  }
  const defsBody = defsMatch[2];

  // Build DI index (BPMNShape bounds + BPMNEdge waypoints) once.
  const di = indexDi(defsBody);

  const ctx: BuildContext = {
    di,
    warnings,
    idMap: new Map(),
    elements: [],
    connectors: [],
    hasShape: new Set(),
    stats,
  };

  // Diagram name: always the filename stem (per user direction). Earlier
  // versions tried `<collaboration name>` / `<process name>` first, but
  // Signavio's defaults there are generic ("Pool", participant labels)
  // and the filename is the most useful, predictable label.
  const diagramName = fileNameStem.trim();
  const collabs = findChildren(defsBody, ["collaboration"]);

  // Collaboration → participants → pools. processRef links each participant
  // to its <process>. A participant without a matching process becomes a
  // black-box pool.
  const processBodyById = new Map<string, string>();
  for (const p of findChildren(defsBody, ["process"])) {
    const pid = getAttr(p.openTag, "id");
    if (pid) processBodyById.set(pid, p.body);
  }
  stats.processCount = processBodyById.size;

  /** poolDiagramId → process bpmnId so we know which laneSet/contents to
   *  walk under each pool. */
  const poolProcessRefs = new Map<string, string>();
  /** Set of processIds that were attached to a participant (i.e. covered by
   *  a pool). Any process NOT in this set is "free-floating" — we'll emit
   *  it directly without a pool wrapper. */
  const claimedProcesses = new Set<string>();

  if (collabs.length > 0) {
    for (const part of findChildren(collabs[0].body, ["participant"])) {
      const bpmnId = getAttr(part.openTag, "id");
      if (!bpmnId) continue;
      stats.participantCount++;
      const processRef = getAttr(part.openTag, "processRef");
      let poolName = getAttr(part.openTag, "name") ?? "";
      // Fall back to processRef → process.name if participant has no name.
      if (!poolName && processRef) {
        const pBody = processBodyById.get(processRef);
        if (pBody) {
          // The process tag lives in defsBody, not pBody, so re-search.
          const procTag = findChildren(defsBody, ["process"]).find(
            (p) => getAttr(p.openTag, "id") === processRef,
          );
          if (procTag) poolName = getAttr(procTag.openTag, "name") ?? "";
        }
      }
      if (!poolName) poolName = "(unnamed participant)";
      const procBody = processRef ? processBodyById.get(processRef) : undefined;
      const poolType = procBody && procBody.trim().length > 0 ? "white-box" : "black-box";
      const { el, hadShape } = buildElement(ctx, bpmnId, "pool", poolName, part.body, {
        properties: { poolType },
      });
      if (!hadShape) {
        warnings.push(`Pool "${poolName}" has no <BPMNShape> — dropped.`);
        stats.shapesDropped++;
        continue;
      }
      // Pool label wrap pass — narrow header strip benefits from line breaks
      // (matches the Visio importer's pool wrap behaviour).
      if (poolName) {
        const ROT_PAD = 16;
        const usableRotW = Math.max(20, el.height - ROT_PAD);
        const lines = wrapText(poolName, usableRotW, 12);
        if (lines.length > 1) el.label = lines.join("\n");
        const lineCount = el.label.split(/\r?\n/).length;
        if (lineCount > 1) {
          (el.properties as Record<string, unknown>).poolHeaderWidth = Math.max(36, lineCount * 30 + 16);
        }
      }
      ctx.elements.push(el);
      stats.elementsCreated++;
      if (processRef) {
        poolProcessRefs.set(el.id, processRef);
        claimedProcesses.add(processRef);
      }
    }
  }

  // For each pool, walk its process body — lanes first (so lane elements
  // exist before we re-parent), then flow content, then re-parent into
  // lanes.
  for (const [poolDiagramId, processRef] of poolProcessRefs) {
    const procBody = processBodyById.get(processRef);
    if (!procBody) {
      warnings.push(`Pool's processRef "${processRef}" missing — pool stays black-box.`);
      continue;
    }
    // Walk flow content first; parent = pool. We re-parent into lanes
    // afterwards.
    walkProcessBody(ctx, procBody, poolDiagramId);
    // Lane parentage. <laneSet> wraps the lane definitions.
    const laneSet = findChildren(procBody, ["laneSet"])[0];
    if (laneSet) applyLaneParenting(ctx, laneSet.body, poolDiagramId);
    // Sequence flows + plain associations within this process.
    buildFlows(ctx, procBody, "sequence", ["sequenceFlow"]);
    buildFlows(ctx, procBody, "associationBPMN", ["association"]);
    // Data input / output associations (Signavio's preferred way of
    // linking data objects to activities — child elements of each
    // <task>/<subProcess>, not the process body's direct children).
    buildDataAssociations(ctx, procBody);
  }

  // Free-floating processes — those not wrapped by a <participant>. v1
  // imports them at the canvas root with no pool. (Plan calls out that
  // multi-process files without collaboration are rare; first one wins
  // for the diagram name; all of them are imported.)
  for (const [processId, procBody] of processBodyById) {
    if (claimedProcesses.has(processId)) continue;
    walkProcessBody(ctx, procBody, undefined);
    const laneSet = findChildren(procBody, ["laneSet"])[0];
    if (laneSet) applyLaneParenting(ctx, laneSet.body, undefined as unknown as string);
    buildFlows(ctx, procBody, "sequence", ["sequenceFlow"]);
    buildFlows(ctx, procBody, "associationBPMN", ["association"]);
    buildDataAssociations(ctx, procBody);
  }

  // Message flows live at the <collaboration> level.
  if (collabs.length > 0) {
    buildFlows(ctx, collabs[0].body, "messageBPMN", ["messageFlow"]);
  }

  // Pool-type sanity pass. A pool marked white-box at the participant
  // stage (because its <process> body was non-empty) can still end up
  // with zero Diagramatix children — e.g. when every flow node's
  // <BPMNShape> was missing and the children were dropped, or when the
  // process body contained only auditing/monitoring metadata. Visually
  // such a pool is indistinguishable from a black-box pool, and any
  // message connector to/from it should attach to the boundary, not to
  // a non-existent flow element inside. Re-classify these to black-box
  // so the canvas renderer and the project-wide scan agree on the
  // pool's true state.
  for (const pool of ctx.elements) {
    if (pool.type !== "pool") continue;
    const props = (pool.properties as Record<string, unknown> | undefined);
    if (!props || props.poolType !== "white-box") continue;
    const hasChildren = ctx.elements.some((e) => e.parentId === pool.id);
    if (!hasChildren) {
      props.poolType = "black-box";
      ctx.warnings.push(`Pool "${pool.label}" was marked white-box but has no contents — re-classified as black-box.`);
    }
  }

  // Median-width sanity check — if everything's tiny, the file is probably
  // using mm not pixels.
  if (ctx.elements.length > 0) {
    const widths = ctx.elements
      .filter((e) => e.type !== "pool" && e.type !== "lane")
      .map((e) => e.width)
      .sort((a, b) => a - b);
    if (widths.length > 0) {
      const median = widths[Math.floor(widths.length / 2)];
      if (median > 0 && median < 20) {
        warnings.push(
          `Median element width is ${median.toFixed(1)} px — coordinates may be in mm rather than pixels. Check the source file.`,
        );
      }
    }
  }

  const data: DiagramData = {
    elements: ctx.elements,
    connectors: ctx.connectors,
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  // Expose the bpmn-id → minted-id map so callers (e.g. BPSim parameter
  // mapping) can resolve elementRefs that point at original BPMN ids.
  return { data, diagramName, warnings, stats, idMap: Object.fromEntries(ctx.idMap) };
}

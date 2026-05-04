/**
 * V3 Visio Import — reads a `.vsdx` file (BPMN diagram) and produces a
 * Diagramatix `DiagramData`. Inverse of [exportVisioV3.ts](./exportVisioV3.ts).
 *
 * Design points:
 *  - **NameU-first master identification**: V3's stencil and the legacy
 *    BPMN_M v4.6 stencil use different numeric master IDs, but identical
 *    canonical NameU strings ("Task", "Pool / Lane", "Data Object", …).
 *    Mapping by NameU keeps the parser stencil-version-agnostic.
 *  - **Bpmn property overrides**: a generic "Task" master with
 *    `BpmnTaskType: "User"` becomes `{ type: "task", taskType: "user" }` —
 *    the property wins over the NameU base.
 *  - **Round-trip identity**: `BpmnId` (written by V3 export) is reused as
 *    the Diagramatix `id`. Files without `BpmnId` get a fresh nanoid.
 *  - **Lenient**: anything we can't classify is dropped and reported in
 *    `warnings`; the rest of the diagram still imports.
 */
import JSZip from "jszip";
import type {
  DiagramData,
  DiagramElement,
  Connector,
  SymbolType,
  BpmnTaskType,
  GatewayType,
  EventType,
  FlowType,
  Point,
} from "../types";

export interface MasterStat {
  masterId: string;
  nameU: string;
  count: number;          // total shape instances on the page using this master
  classifiedAs: string;   // "task" / "pool" / "skipped" / "(connector) sequence" / etc.
}

export interface ImportStats {
  totalShapesOnPage: number;
  elementsCreated: number;
  connectorsCreated: number;
  shapesSkipped: number;
  connectorsSkipped: number;
  implicitPools: number;
  /** Per-master breakdown — sorted by count desc. The single most useful
   *  signal when debugging: "which Visio master is in your file and what
   *  did we do with it?". */
  masters: MasterStat[];
}

export interface ImportResult {
  data: DiagramData;
  warnings: string[];
  stats: ImportStats;
}

interface MasterInfo {
  nameU: string;
  fileName: string;
}

interface ElementSeed {
  type: SymbolType;
  taskType?: BpmnTaskType;
  gatewayType?: GatewayType;
  eventType?: EventType;
  flowType?: FlowType;
  poolType?: string;
  role?: string;
  multiplicity?: string;
  subprocessType?: string;
}

type ConnectorBase = "sequence" | "messageBPMN" | "associationBPMN";

const PX_PER_INCH = 96;

// Diagramatix uses fixed-size icons for these types — the canvas doesn't
// support arbitrary sizes, and Visio's master defaults (typically 1in
// circles for events) come out 2-3× too large on import. Always force
// these to Diagramatix defaults; preserve PinX/PinY so the centre stays
// put. Resizable types (task, subprocess, pool, lane, group, text-
// annotation) keep their imported dimensions.
const FIXED_ICON_SIZES: Partial<Record<SymbolType, { w: number; h: number }>> = {
  "start-event":        { w: 36, h: 36 },
  "end-event":          { w: 36, h: 36 },
  "intermediate-event": { w: 36, h: 36 },
  "gateway":            { w: 40, h: 40 },
  "data-object":        { w: 36, h: 46 },
  "data-store":         { w: 50, h: 40 },
};

// Fallback sizes when the imported width/height is missing or unparseable
// (e.g. the cell was outside our head slice, or Visio used a formula-only
// cell with no cached V). Used only as a sanity floor.
const FALLBACK_SIZES: Partial<Record<SymbolType, { w: number; h: number }>> = {
  "task":               { w: 102, h: 65 },
  "subprocess":         { w: 108, h: 72 },
  "subprocess-expanded":{ w: 180, h: 108 },
  "pool":               { w: 600, h: 200 },
  "lane":               { w: 600, h: 80 },
  "sublane":            { w: 600, h: 60 },
  "group":              { w: 240, h: 160 },
  "text-annotation":    { w: 100, h: 60 },
};

function nano(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Project an external point onto the nearest edge of a rectangle (in
 *  canvas coords, all in px). Used to snap connector endpoints to the
 *  shape's boundary instead of its centre. If the external point is
 *  inside the rect, return the rect's centre as a graceful fallback. */
function clipToRectEdge(
  rect: { x: number; y: number; width: number; height: number },
  external: { x: number; y: number },
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = external.x - cx;
  const dy = external.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  // Parametric line from centre toward external; clip at first edge hit.
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  // t such that |t*dx| <= halfW and |t*dy| <= halfH; we want the smallest t.
  const tx = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty, 1);   // cap at 1 → don't extend beyond the external point
  return { x: cx + dx * t, y: cy + dy * t };
}

/** V3 export creates per-instance master clones whose NameU has a numeric
 *  suffix appended (e.g. "Pool / Lane.200"). Strip it so lookup hits the
 *  canonical entry. */
function normaliseNameU(nameU: string): string {
  return nameU.replace(/\.\d+$/, "");
}

/* ─── NameU → element/connector base mapping ──────────────────────────── */
// Covers V3 stencil (collapsed: one master per family) AND BPMN_M v4.6
// (expanded: one master per variant).

const ELEMENT_NAMEU_MAP: Record<string, ElementSeed | null> = {
  // Tasks
  "Task": { type: "task", taskType: "none" },
  "User Task": { type: "task", taskType: "user" },
  "Service Task": { type: "task", taskType: "service" },
  "Script Task": { type: "task", taskType: "script" },
  "Send Task": { type: "task", taskType: "send" },
  "Receive Task": { type: "task", taskType: "receive" },
  "Manual Task": { type: "task", taskType: "manual" },
  "Business Rule Task": { type: "task", taskType: "business-rule" },

  // Gateways
  "Gateway": { type: "gateway", gatewayType: "none" },
  "Exclusive Gateway": { type: "gateway", gatewayType: "exclusive" },
  "Inclusive OR": { type: "gateway", gatewayType: "inclusive" },
  "Inclusive Gateway": { type: "gateway", gatewayType: "inclusive" },
  "Parallel Gateway": { type: "gateway", gatewayType: "parallel" },
  "Event Gateway": { type: "gateway", gatewayType: "event-based" },
  "Event-Based Gateway": { type: "gateway", gatewayType: "event-based" },

  // Events — start
  "Start Event": { type: "start-event", eventType: "none" },
  "Start with Timer": { type: "start-event", eventType: "timer" },
  "Receive Message Start": { type: "start-event", eventType: "message" },
  "Edge Start": { type: "start-event", eventType: "none" },

  // Events — intermediate
  "Intermediate Event": { type: "intermediate-event", eventType: "none" },
  "Send Message": { type: "intermediate-event", eventType: "message", flowType: "throwing" },
  "Receive Message": { type: "intermediate-event", eventType: "message", flowType: "catching" },
  "Edge Intermediate Event": { type: "intermediate-event", eventType: "none" },
  "Edge Cancel Event": { type: "intermediate-event", eventType: "cancel" },
  "Edge Error / Exception Event": { type: "intermediate-event", eventType: "error" },
  "Edge Time out Event": { type: "intermediate-event", eventType: "timer" },

  // Events — end
  "End Event": { type: "end-event", eventType: "none" },
  "Send Message End Event": { type: "end-event", eventType: "message" },

  // Subprocesses
  "Collapsed Sub-Process": { type: "subprocess" },
  "Collapsed Sub-process": { type: "subprocess" },
  "Expanded Sub-Process": { type: "subprocess-expanded" },
  "Expanded Sub-process": { type: "subprocess-expanded" },
  "Call Collapsed Sub-process": { type: "subprocess", subprocessType: "call" },

  // Pool / Lane.
  // CFF Container and Swimlane List are Microsoft's Visio Cross-Functional
  // Flowchart pool wrappers — they ARE the BPMN pool. Disambiguation below
  // re-classifies any nested instance to a Lane.
  "Pool / Lane":           { type: "pool" },
  "Pool":                  { type: "pool" },
  "Pool with 2 Lanes":     { type: "pool", poolType: "white-box" },
  "Pool with 3 Lanes":     { type: "pool", poolType: "white-box" },
  "Pool with 4 Lanes":     { type: "pool", poolType: "white-box" },
  "Pool + 2 Lanes":        { type: "pool", poolType: "white-box" },
  "Pool + 3 Lanes":        { type: "pool", poolType: "white-box" },
  "Pool + 4 Lanes":        { type: "pool", poolType: "white-box" },
  "Black-Box Pool":        { type: "pool", poolType: "black-box" },
  "System Pool":           { type: "pool", poolType: "black-box" },
  "Vertical Pool":         { type: "pool" },
  "Horizontal Pool":       { type: "pool" },
  "CFF Container":         { type: "pool" },
  "Swimlane List":         { type: "pool" },
  "Swimlane":              { type: "lane" },
  "Additional Lane":       { type: "lane" },
  "Lane":                  { type: "lane" },

  // Data
  "Data Object": { type: "data-object" },
  "Data Object with Associations": { type: "data-object" },
  "Input Data Object": { type: "data-object", role: "input" },
  "Output Data Object": { type: "data-object", role: "output" },
  "Data Object Collection": { type: "data-object", multiplicity: "collection" },
  "Data Store": { type: "data-store" },

  // Misc
  "Text Annotation": { type: "text-annotation" },
  "Annotation":      { type: "text-annotation" },
  "Group":           { type: "group" },
  "Merge":           { type: "gateway", gatewayType: "exclusive" },
  "Diagram Title":   { type: "text-annotation" },

  // Explicitly ignored (decorative shapes from BPMN_M / CFF stencil).
  // CFF Container and Swimlane List were previously here but are now
  // mapped to pool above — they ARE the pool wrapper in CFF files.
  "Message": null,
  "Phase List": null,
  "Separator": null,
  "Separator (vertical)": null,
};

const CONNECTOR_NAMEU_MAP: Record<string, ConnectorBase | null> = {
  "Sequence Flow":              "sequence",
  "Default Sequence Flow":      "sequence",
  "Conditional Sequence Flow":  "sequence",
  "BPMN Sequence Flow":         "sequence",
  "Message Flow":               "messageBPMN",
  "BPMN Message Flow":          "messageBPMN",
  "Initiating Message Flow":    "messageBPMN",
  "Non-Initiating Message Flow":"messageBPMN",
  "Association":                "associationBPMN",
  "BPMN Association":           "associationBPMN",
  "Directed Association":       "associationBPMN",
  "Data Association":           "associationBPMN",
  "Data Input Association":     "associationBPMN",
  "Data Output Association":    "associationBPMN",
};

/* ─── Bpmn property overrides ─────────────────────────────────────────── */

const BPMN_TASK_TYPE: Record<string, BpmnTaskType> = {
  None: "none",
  User: "user",
  Service: "service",
  Script: "script",
  Send: "send",
  Receive: "receive",
  Manual: "manual",
  "Business Rule": "business-rule",
};

const BPMN_GATEWAY_TYPE: Record<string, GatewayType> = {
  Exclusive: "exclusive",
  Inclusive: "inclusive",
  Parallel: "parallel",
  "Exclusive Event": "event-based",
  "Exclusive Event (Instantiate)": "event-based",
};

const BPMN_EVENT_TRIGGER: Record<string, EventType> = {
  None: "none",
  Message: "message",
  Timer: "timer",
  Error: "error",
  Signal: "signal",
  Terminate: "terminate",
  Conditional: "conditional",
  Escalation: "escalation",
  Cancel: "cancel",
  Compensation: "compensation",
  Link: "link",
};

/* ─── Regex helpers ───────────────────────────────────────────────────── */

function readCellV(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<Cell\\s+N='${name}'\\s+V='([^']*)'`));
  return m ? m[1] : null;
}

function readCellNum(block: string, name: string): number | null {
  const v = readCellV(block, name);
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Scope the block to its OUTER shape only (cells/sections before any
 *  nested `<Shapes>` or `<Shape ID=`). Prevents `readCellNum` from
 *  falling through to deeply-nested marker sub-shapes when the outer
 *  shape's cell has only a formula and no cached `V=` value. */
function outerHead(block: string): string {
  let cut = block.length;
  const m1 = block.indexOf("<Shapes>");
  const m2 = block.search(/<Shape\s+ID=/);
  // m2 of -1 means no match; the open tag itself is `<Shape ID=...`,
  // so the first occurrence will be at index 0 — skip it.
  const innerStart = m2 > 0 ? m2 : -1;
  if (m1 >= 0 && m1 < cut) cut = m1;
  if (innerStart >= 0 && innerStart < cut) cut = innerStart;
  return block.slice(0, cut);
}

function readPropValues(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Property section: <Section N='Property'> ... <Row N='BpmnX'><Cell N='Value' V='...' .../>
  const propSec = block.match(/<Section N='Property'>([\s\S]*?)<\/Section>/);
  if (!propSec) return result;
  const rowRe = /<Row\s+N='(\w+)'>[\s\S]*?<Cell\s+N='Value'\s+V='([^']*)'/g;
  let m;
  while ((m = rowRe.exec(propSec[1])) !== null) result[m[1]] = m[2];
  return result;
}

function readMemberIDs(block: string): string[] {
  const ids: string[] = [];
  const memSec = block.match(/<Section N='Member'>([\s\S]*?)<\/Section>/);
  if (!memSec) return ids;
  const re = /<Cell\s+N='ID'\s+V='(\d+)'/g;
  let m;
  while ((m = re.exec(memSec[1])) !== null) ids.push(m[1]);
  return ids;
}

function readText(block: string): string {
  // Strip Visio's inline formatting markers — `<cp/>` (character props),
  // `<pp/>` (paragraph props), `<tp/>` (tab props), `<fld/>` (field code).
  // Without this, "<pp IX='0'/>Online Modules (OM)" surfaces verbatim.
  const m = block.match(/<Text>([\s\S]*?)<\/Text>/);
  if (!m) return "";
  return m[1]
    .replace(/<(?:cp|pp|tp|fld)\b[^/>]*\/?>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/* ─── Master index ────────────────────────────────────────────────────── */

async function loadMasterIndex(zip: JSZip): Promise<Map<string, MasterInfo>> {
  const masters = new Map<string, MasterInfo>();
  const mastersXml = await zip.file("visio/masters/masters.xml")?.async("string");
  if (!mastersXml) return masters;
  const relsXml =
    (await zip.file("visio/masters/_rels/masters.xml.rels")?.async("string")) ?? "";

  const re = /<Master\s+ID='(\d+)'[\s\S]*?<\/Master>/g;
  let mm;
  while ((mm = re.exec(mastersXml)) !== null) {
    const block = mm[0];
    const id = mm[1];
    const nameU = block.match(/NameU='([^']+)'/)?.[1] ?? "";
    const rId = block.match(/<Rel\s+r:id='(rId\d+)'/)?.[1];
    let fileName = "";
    if (rId) {
      const fm = relsXml.match(
        new RegExp(`Id=["']${rId}["'][^>]*Target=["']([^"']+)["']`),
      );
      fileName = fm?.[1] ?? "";
    }
    masters.set(id, { nameU, fileName });
  }
  return masters;
}

/* ─── Page-level shape walker ─────────────────────────────────────────── */
// Native Visio BPMN files routinely nest content inside Pool/Lane/Group
// shapes (Tasks live inside a Lane's <Shapes>, Lanes inside a Pool's
// <Shapes>, etc.). The walker recurses through every depth and emits one
// record per Shape, with its PinX/PinY translated from parent-local to
// page-absolute Visio coordinates.
//
// Why the transform: Visio sub-shape PinX/PinY are measured in the
// parent group's local frame (origin at the parent's bottom-left,
// Y-up). Page-absolute = parent.pageBottomLeft + child.localPin.

interface WalkedShape {
  shapeId: string;
  block: string;            // full Shape XML, including any nested <Shapes>
  parentShapeId: string | null;
  /** PinX in page-absolute Visio inches (Y-up). Computed in a second
   *  pass via `readCellNum` on the FULL block (not a head slice), so
   *  cells buried deep in the shape XML still resolve. */
  pageX: number;
  /** PinY in page-absolute Visio inches (Y-up). */
  pageY: number;
  width: number;
  height: number;
}

function walkAllShapes(pageXml: string): WalkedShape[] {
  const m = pageXml.match(/<Shapes>([\s\S]*?)<\/Shapes>(?=\s*(?:<Connects>|<\/PageContents>))/);
  if (!m) return [];
  const inner = m[1];

  // First pass: just structure — shape IDs, parent relationships, block ranges.
  type RawNode = { shapeId: string; block: string; parentShapeId: string | null };
  const nodes: RawNode[] = [];
  type Frame = { shapeId: string; blockStart: number };
  const stack: Frame[] = [];
  const tagRe = /<(\/?)Shape(\s|>)/g;
  let t;
  while ((t = tagRe.exec(inner)) !== null) {
    if (t[1] === "/") {
      const frame = stack.pop();
      if (!frame) continue;
      const blockEnd = inner.indexOf(">", t.index) + 1;
      nodes.push({
        shapeId: frame.shapeId,
        block: inner.slice(frame.blockStart, blockEnd),
        parentShapeId: stack.length > 0 ? stack[stack.length - 1].shapeId : null,
      });
      continue;
    }
    const tagEnd = inner.indexOf(">", t.index) + 1;
    const openTag = inner.slice(t.index, tagEnd);
    const shapeId = openTag.match(/ID='(\d+)'/)?.[1] ?? "?";
    stack.push({ shapeId, blockStart: t.index });
  }

  // Second pass: read PinX/PinY/W/H from each shape's FULL block (the
  // first occurrence of each cell is always the outer shape's, since
  // outer cells precede nested <Shapes>).
  type Geom = { localPinX: number; localPinY: number; width: number; height: number };
  const geomById = new Map<string, Geom>();
  const nodeById = new Map<string, RawNode>();
  for (const n of nodes) {
    nodeById.set(n.shapeId, n);
    // Scope cell reads to the outer head — otherwise a Subprocess whose
    // outer Width is formula-only (no cached V=) would inherit a tiny
    // marker sub-shape's Width and render as a pencil-thin sliver.
    const head = outerHead(n.block);
    geomById.set(n.shapeId, {
      localPinX: readCellNum(head, "PinX") ?? 0,
      localPinY: readCellNum(head, "PinY") ?? 0,
      width: readCellNum(head, "Width") ?? 0,
      height: readCellNum(head, "Height") ?? 0,
    });
  }

  // Third pass: compute pageX/pageY iteratively in topological order.
  // The walker emits in post-order (children before parents), so reversing
  // gives parents-first — every shape sees its parent's pageX/pageY already
  // computed. Iterative form avoids stack overflow on deep nesting.
  void nodeById; // not currently used; retained in case future passes want it
  const pageCache = new Map<string, { pageX: number; pageY: number }>();
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const g = geomById.get(n.shapeId)!;
    if (!n.parentShapeId) {
      pageCache.set(n.shapeId, { pageX: g.localPinX, pageY: g.localPinY });
      continue;
    }
    const parentG = geomById.get(n.parentShapeId);
    const parentPage = pageCache.get(n.parentShapeId) ?? { pageX: 0, pageY: 0 };
    const offX = parentG ? parentG.width / 2 : 0;
    const offY = parentG ? parentG.height / 2 : 0;
    pageCache.set(n.shapeId, {
      pageX: parentPage.pageX - offX + g.localPinX,
      pageY: parentPage.pageY - offY + g.localPinY,
    });
  }

  return nodes.map((n) => {
    const g = geomById.get(n.shapeId)!;
    const p = pageCache.get(n.shapeId) ?? { pageX: 0, pageY: 0 };
    return {
      shapeId: n.shapeId,
      block: n.block,
      parentShapeId: n.parentShapeId,
      pageX: p.pageX,
      pageY: p.pageY,
      width: g.width,
      height: g.height,
    };
  });
}

function isConnectorMaster(nameU: string): ConnectorBase | null {
  const exact = CONNECTOR_NAMEU_MAP[nameU];
  if (exact !== undefined) return exact;
  // Fuzzy fallback: many third-party / localised / custom-stencil
  // connectors carry the canonical type as a substring inside a
  // longer NameU. Order matters — check the more specific terms first.
  const n = nameU.toLowerCase();
  if (n.includes("message flow") || n.includes("message connection")) return "messageBPMN";
  if (n.includes("association")) return "associationBPMN";
  if (n.includes("sequence flow") || n.includes("sequence-flow")) return "sequence";
  return null;
}

/** Last-ditch element classification by substring — for files using
 *  custom or localised stencils whose NameUs aren't in the exact-match
 *  table. Order matters: more specific terms before generic ones. */
function fuzzyClassifyElement(nameU: string): ElementSeed | null {
  const n = nameU.toLowerCase();
  // Pools and lanes — Visio cross-functional flowchart files often use
  // names like "Functional Band", "Swimlane" etc. for what we treat as
  // a Pool's lane stripe.
  if (n.includes("black-box") || n.includes("black box")) return { type: "pool", poolType: "black-box" };
  if (n.includes("pool")) return { type: "pool" };
  if (n.includes("swimlane") || n.includes("functional band")) return { type: "lane" };
  if (n.includes("lane")) return { type: "lane" };
  // Subprocesses (check before "process" so "Sub-Process" wins).
  if (n.includes("expanded sub")) return { type: "subprocess-expanded" };
  if (n.includes("collapsed sub") || n.includes("sub-process") || n.includes("subprocess")) return { type: "subprocess" };
  // Gateways
  if (n.includes("exclusive gateway")) return { type: "gateway", gatewayType: "exclusive" };
  if (n.includes("inclusive")) return { type: "gateway", gatewayType: "inclusive" };
  if (n.includes("parallel gateway")) return { type: "gateway", gatewayType: "parallel" };
  if (n.includes("event gateway") || n.includes("event-based")) return { type: "gateway", gatewayType: "event-based" };
  if (n.includes("gateway")) return { type: "gateway" };
  // Events
  if (n.includes("start event") || n.endsWith(" start") || n === "start") return { type: "start-event" };
  if (n.includes("end event") || n.endsWith(" end")) return { type: "end-event" };
  if (n.includes("intermediate")) return { type: "intermediate-event" };
  // Tasks
  if (n.includes("user task")) return { type: "task", taskType: "user" };
  if (n.includes("service task")) return { type: "task", taskType: "service" };
  if (n.includes("script task")) return { type: "task", taskType: "script" };
  if (n.includes("send task")) return { type: "task", taskType: "send" };
  if (n.includes("receive task")) return { type: "task", taskType: "receive" };
  if (n.includes("manual task")) return { type: "task", taskType: "manual" };
  if (n.includes("business rule task")) return { type: "task", taskType: "business-rule" };
  if (n.includes("task") || n.includes("activity")) return { type: "task" };
  // Data
  if (n.includes("data store") || n.includes("datastore")) return { type: "data-store" };
  if (n.includes("data object") || n.includes("dataobject")) return { type: "data-object" };
  // Misc
  if (n.includes("text annotation") || n.includes("annotation")) return { type: "text-annotation" };
  if (n.includes("group")) return { type: "group" };
  return null;
}

function classifyElement(nameU: string, props: Record<string, string>): ElementSeed | null {
  let base = ELEMENT_NAMEU_MAP[nameU];
  if (base === undefined && nameU) base = fuzzyClassifyElement(nameU);
  if (base === null) return null;        // explicitly ignored (CFF Container etc.)
  if (base === undefined) return null;   // unknown — even fuzzy match returned nothing
  const seed: ElementSeed = { ...base };

  // Bpmn property overrides
  if (props.BpmnTaskType && BPMN_TASK_TYPE[props.BpmnTaskType]) {
    seed.taskType = BPMN_TASK_TYPE[props.BpmnTaskType];
  }
  if (props.BpmnGatewayType && BPMN_GATEWAY_TYPE[props.BpmnGatewayType]) {
    seed.gatewayType = BPMN_GATEWAY_TYPE[props.BpmnGatewayType];
  }
  if (props.BpmnTriggerOrResult && BPMN_EVENT_TRIGGER[props.BpmnTriggerOrResult]) {
    seed.eventType = BPMN_EVENT_TRIGGER[props.BpmnTriggerOrResult];
  }
  if (props.BpmnEventType?.includes("Throwing")) seed.flowType = "throwing";
  else if (props.BpmnEventType?.includes("Catching")) seed.flowType = "catching";

  if (seed.type === "data-object" && props.BpmnRole) {
    if (props.BpmnRole === "input" || props.BpmnRole === "output") {
      seed.role = props.BpmnRole;
    }
  }
  if (
    (seed.type === "data-object" || seed.type === "pool") &&
    props.BpmnMultiplicity === "collection"
  ) {
    seed.multiplicity = "collection";
  }
  if (seed.type === "subprocess" || seed.type === "subprocess-expanded") {
    if (props.BpmnBoundaryType === "Call") seed.subprocessType = "call";
    else if (props.BpmnBoundaryType === "Event") seed.subprocessType = "event";
    else if (props.BpmnBoundaryType === "Transaction") seed.subprocessType = "transaction";
  }
  return seed;
}

/* ─── Top-level parse ────────────────────────────────────────────────── */

export async function importVisioV3(buffer: ArrayBuffer): Promise<ImportResult> {
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(buffer);

  const masters = await loadMasterIndex(zip);

  // Find page1.xml — the first page listed in pages.xml.
  const emptyStats: ImportStats = {
    totalShapesOnPage: 0, elementsCreated: 0, connectorsCreated: 0,
    shapesSkipped: 0, connectorsSkipped: 0, implicitPools: 0, masters: [],
  };
  const pagesXml = await zip.file("visio/pages/pages.xml")?.async("string");
  if (!pagesXml) {
    return {
      data: { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } },
      warnings: ["No pages.xml in .vsdx — nothing to import."],
      stats: emptyStats,
    };
  }
  // Count pages first to warn on multi-page.
  const pageCount = (pagesXml.match(/<Page\s+ID='/g) ?? []).length;
  if (pageCount > 1) {
    warnings.push(
      `File has ${pageCount} pages; importing the first page only.`,
    );
  }
  const firstPageRel = pagesXml.match(/<Page\s+ID='\d+'[\s\S]*?<Rel\s+r:id='(rId\d+)'/);
  const pagesRelsXml =
    (await zip.file("visio/pages/_rels/pages.xml.rels")?.async("string")) ?? "";
  const firstPageFile = firstPageRel
    ? pagesRelsXml.match(
        new RegExp(`Id=["']${firstPageRel[1]}["'][^>]*Target=["']([^"']+)["']`),
      )?.[1] ?? "page1.xml"
    : "page1.xml";

  const pageXml = await zip.file(`visio/pages/${firstPageFile}`)?.async("string");
  if (!pageXml) {
    return {
      data: { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } },
      warnings: [...warnings, `Page file ${firstPageFile} not found.`],
      stats: emptyStats,
    };
  }

  // Page dimensions: pages.xml carries <PageSheet> with PageWidth/PageHeight.
  const pagePropsBlock = pagesXml.match(
    /<Page\s+ID='\d+'[\s\S]*?<\/Page>/,
  )?.[0] ?? "";
  const pageW = readCellNum(pagePropsBlock, "PageWidth") ?? 11.69;
  const pageH = readCellNum(pagePropsBlock, "PageHeight") ?? 8.27;
  void pageW; // not currently used; available for future centring logic.

  const walked = walkAllShapes(pageXml);
  // Track skipped masters so we can emit a single summary warning at the
  // end (pasting 200 per-shape warnings into a chat is unhelpful).
  const skippedByTag = new Map<string, number>();
  const perShapeWarnings: string[] = [];
  // Per-master breakdown for the post-import status modal.
  // Key = "${masterId || '-'}|${nameU || ''}" so masters with the same
  // ID-but-no-NameU and masters with no master at all stay distinct.
  type MasterBreakdown = { masterId: string; nameU: string; count: number; classifiedAs: string };
  const masterBreakdown = new Map<string, MasterBreakdown>();
  function recordMaster(masterId: string | null, nameU: string, classifiedAs: string) {
    const id = masterId ?? "-";
    const key = `${id}|${nameU}`;
    const existing = masterBreakdown.get(key);
    if (existing) existing.count++;
    else masterBreakdown.set(key, { masterId: id, nameU, count: 1, classifiedAs });
  }

  // First pass: classify every walked shape (any depth). Track parent
  // shape IDs from nesting AND Pool Member sections — both feed into the
  // Pool→Lane parentage resolution below.
  type RawShape = {
    shapeId: string;
    parentShapeId: string | null;
    masterId: string | null;
    nameU: string;
    block: string;
    pageX: number;     // page-absolute Visio inches (Y-up)
    pageY: number;
    width: number;
    height: number;
    seed: ElementSeed | null;
    connectorBase: ConnectorBase | null;
    bpmnId?: string;
    props: Record<string, string>;
  };
  const raw: RawShape[] = [];
  const poolMembers = new Map<string, string[]>(); // poolShapeId → lane shape IDs

  for (const w of walked) {
    const block = w.block;
    const masterIdM = block.match(/Master='(\d+)'/);
    const masterId = masterIdM?.[1] ?? null;
    const masterInfo = masterId ? masters.get(masterId) : undefined;
    const nameU = normaliseNameU(masterInfo?.nameU ?? "");
    const props = readPropValues(block);
    const bpmnId = props.BpmnId;

    const connectorBase = isConnectorMaster(nameU);
    const seed = connectorBase ? null : classifyElement(nameU, props);

    if (!connectorBase && !seed) {
      recordMaster(masterId, nameU, "skipped");
      const labelHint = readText(block).slice(0, 40);
      const labelSuffix = labelHint ? ` (text: "${labelHint}")` : "";
      const tag = nameU || (masterId ? `master ${masterId} (no NameU)` : "(no master)");
      skippedByTag.set(tag, (skippedByTag.get(tag) ?? 0) + 1);
      // Detailed per-shape warning (capped to avoid flooding) — useful when
      // the summary alone doesn't pinpoint the issue.
      if (perShapeWarnings.length < 20) {
        if (nameU) {
          perShapeWarnings.push(
            `Skipped shape ${w.shapeId} — unrecognised master "${nameU}" (master ID ${masterId})${labelSuffix}.`,
          );
        } else if (masterId) {
          perShapeWarnings.push(
            `Skipped shape ${w.shapeId} — master ${masterId} has no NameU${labelSuffix}.`,
          );
        } else {
          perShapeWarnings.push(`Skipped shape ${w.shapeId} — no Master attribute${labelSuffix}.`);
        }
      }
      continue;
    }

    raw.push({
      shapeId: w.shapeId,
      parentShapeId: w.parentShapeId,
      masterId,
      nameU,
      block,
      pageX: w.pageX,
      pageY: w.pageY,
      width: w.width,
      height: w.height,
      seed,
      connectorBase,
      bpmnId,
      props,
    });
    recordMaster(
      masterId,
      nameU,
      connectorBase
        ? `connector → ${connectorBase}`
        : `element → ${seed!.type}`,
    );

    if (seed?.type === "pool") {
      const memberIds = readMemberIDs(block);
      if (memberIds.length > 0) poolMembers.set(w.shapeId, memberIds);
    }
  }

  // Disambiguate "Pool / Lane" master. A shape is a *Lane* if EITHER:
  //   a) It's referenced by another Pool's Member section (V3 round-trip:
  //      lanes are top-level siblings linked via Member rows), OR
  //   b) Its direct parent in the page shape tree is also a Pool/Lane
  //      (native Visio: lanes are nested inside the Pool's <Shapes>).
  const laneShapeIds = new Set<string>();
  for (const ids of poolMembers.values()) for (const id of ids) laneShapeIds.add(id);
  // Build a quick lookup: shapeId → RawShape (for parent classification).
  const rawByShapeId = new Map<string, RawShape>();
  for (const r of raw) rawByShapeId.set(r.shapeId, r);
  // Names where this disambiguation applies — masters that double as both
  // pool AND lane in different contexts (CFF Container can be the outer
  // pool OR a nested lane band; Swimlane is the same).
  const POOL_OR_LANE_NAMES = new Set([
    "Pool / Lane", "CFF Container", "Swimlane List", "Swimlane",
  ]);
  for (const r of raw) {
    if (r.seed?.type !== "pool" || !POOL_OR_LANE_NAMES.has(r.nameU)) continue;
    let isLane = laneShapeIds.has(r.shapeId);
    if (!isLane && r.parentShapeId) {
      const parent = rawByShapeId.get(r.parentShapeId);
      if (parent?.seed?.type === "pool" || parent?.seed?.type === "lane") {
        isLane = true;
      }
    }
    if (isLane) r.seed.type = "lane";
  }

  // Implicit-pool detection: a wrapper shape that's NOT classified but
  // directly contains 2+ classified Lane children is almost certainly a
  // Pool — Visio cross-functional flowchart files often use a generic
  // container or unrecognised master for the pool wrapper, with named
  // Lane shapes nested inside.
  let implicitPoolCount = 0;
  const walkedById = new Map<string, WalkedShape>();
  for (const w of walked) walkedById.set(w.shapeId, w);
  const childrenByParent = new Map<string, RawShape[]>();
  for (const r of raw) {
    if (!r.parentShapeId) continue;
    const list = childrenByParent.get(r.parentShapeId) ?? [];
    list.push(r);
    childrenByParent.set(r.parentShapeId, list);
  }
  for (const [parentId, children] of childrenByParent) {
    if (rawByShapeId.has(parentId)) continue;          // parent already classified
    const laneChildren = children.filter((c) => c.seed?.type === "lane");
    if (laneChildren.length < 2) continue;
    const wp = walkedById.get(parentId);
    if (!wp) continue;

    // Note: we DON'T skip on the explicit-ignore list (CFF Container,
    // Swimlane List etc.) because in cross-functional flowchart files
    // those *are* the pool's structural shape. Position is computed
    // from lane bounds below, not from the wrapper's reported
    // dimensions, so container padding/overhang can't displace the pool.
    const wrapperMasterId = wp.block.match(/Master='(\d+)'/)?.[1];
    const wrapperMaster = wrapperMasterId ? masters.get(wrapperMasterId) : undefined;
    const wrapperNameU = normaliseNameU(wrapperMaster?.nameU ?? "");

    // Compute the synthesised pool's bounds from its lane children,
    // not from the wrapper's own dimensions. Visio container shapes
    // often include padding / overhang / member-overlap that makes
    // their reported W/H much larger than the visible pool — using the
    // lanes' bounding box snaps the pool exactly around them.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const lane of laneChildren) {
      minX = Math.min(minX, lane.pageX - lane.width / 2);
      maxX = Math.max(maxX, lane.pageX + lane.width / 2);
      minY = Math.min(minY, lane.pageY - lane.height / 2);
      maxY = Math.max(maxY, lane.pageY + lane.height / 2);
    }
    const poolPageX = (minX + maxX) / 2;
    const poolPageY = (minY + maxY) / 2;
    const poolW     = maxX - minX;
    const poolH     = maxY - minY;

    const props = readPropValues(wp.block);
    const synthesised: RawShape = {
      shapeId: parentId,
      parentShapeId: wp.parentShapeId,
      masterId: wrapperMasterId ?? null,
      nameU: wrapperNameU || "(implicit pool)",
      block: wp.block,
      pageX: poolPageX,
      pageY: poolPageY,
      width: poolW,
      height: poolH,
      seed: { type: "pool" },
      connectorBase: null,
      bpmnId: props.BpmnId,
      props,
    };
    raw.push(synthesised);
    rawByShapeId.set(parentId, synthesised);
    implicitPoolCount++;
    // Add a SEPARATE breakdown row for the synthesised pool (instead of
    // reclassifying the existing "(no master)" row, which would falsely
    // mark every same-master shape as a pool — they share one row).
    masterBreakdown.set(`__synth_pool_${parentId}`, {
      masterId: wrapperMasterId ?? "-",
      nameU: wrapperNameU || "(implicit pool wrapper)",
      count: 1,
      classifiedAs: "element → pool (implicit)",
    });
    // Decrement the original skipped row by 1 since this shape is no longer skipped.
    const origKey = `${wrapperMasterId ?? "-"}|${wrapperNameU}`;
    const orig = masterBreakdown.get(origKey);
    if (orig && orig.count > 0) orig.count--;
    if (orig && orig.count === 0) masterBreakdown.delete(origKey);
    // Synthesised pool steals one warning entry off the skip list since
    // it's no longer "skipped".
    const tag = wrapperNameU || (wrapperMasterId ? `master ${wrapperMasterId} (no NameU)` : "(no master)");
    const cur = skippedByTag.get(tag) ?? 0;
    if (cur > 0) skippedByTag.set(tag, cur - 1);
    if (skippedByTag.get(tag) === 0) skippedByTag.delete(tag);
  }

  // Visual-heuristic pool detection: any walked shape that ISN'T classified
  // yet AND has the visual hallmarks of a pool — wider than tall, large,
  // and either text-bearing or with a vertical-text header — gets promoted
  // to a Pool. This catches Microsoft CFF instances (`CFF Container.NN`)
  // whose master NameU isn't in the exact map after suffix-strip, plus
  // hand-drawn pool boxes with no master attribute at all.
  const heuristicSkipNames = new Set([
    "Phase List", "Separator", "Separator (vertical)", "Diagram Title",
    "Message",
  ]);
  for (const w of walked) {
    if (rawByShapeId.has(w.shapeId)) continue;          // already classified
    // Re-resolve NameU for this skipped shape so we can avoid promoting
    // explicit-ignore decorations.
    const wMasterId = w.block.match(/Master='(\d+)'/)?.[1];
    const wMasterInfo = wMasterId ? masters.get(wMasterId) : undefined;
    const wNameU = normaliseNameU(wMasterInfo?.nameU ?? "");
    if (heuristicSkipNames.has(wNameU)) continue;
    if (wNameU.startsWith("Theme Colors")) continue;
    if (wNameU.startsWith("Document")) continue;

    const W = w.width;
    const H = w.height;
    if (!(W > 0 && H > 0)) continue;
    if (W <= H) continue;                               // not landscape
    if (W < 2.0) continue;                              // < ~192 px wide
    if (W * H < 4.0) continue;                          // < 4 sq.in area
    // Require an actual text label — vertical-text-only signals (an
    // unnamed wrapper with rotated empty text frame) produce phantom pools.
    // Also fall back to the BpmnName Property if <Text> is empty.
    const props0 = readPropValues(w.block);
    const text = readText(w.block) || props0.BpmnName || "";
    if (!text.trim()) continue;
    // Dedupe: don't promote if any ancestor in the page tree is already
    // classified as a pool — that would create the "Online Modules (IOM)
    // appears twice" symptom (outer wrapper + inner title sub-shape both
    // pass the heuristic).
    let hasPoolAncestor = false;
    let curParent = w.parentShapeId;
    while (curParent) {
      const pRaw = rawByShapeId.get(curParent);
      if (pRaw?.seed?.type === "pool") { hasPoolAncestor = true; break; }
      curParent = walkedById.get(curParent)?.parentShapeId ?? null;
    }
    if (hasPoolAncestor) continue;

    // Synthesise as a Pool. Use the walker's own page-absolute coords
    // (these wrappers don't necessarily have lane children to bound from).
    const props = props0;
    const synthesised: RawShape = {
      shapeId: w.shapeId,
      parentShapeId: w.parentShapeId,
      masterId: wMasterId ?? null,
      nameU: wNameU || "(visual-heuristic pool)",
      block: w.block,
      pageX: w.pageX,
      pageY: w.pageY,
      width: W,
      height: H,
      seed: { type: "pool" },
      connectorBase: null,
      bpmnId: props.BpmnId,
      props,
    };
    raw.push(synthesised);
    rawByShapeId.set(w.shapeId, synthesised);
    implicitPoolCount++;
    masterBreakdown.set(`__synth_heur_${w.shapeId}`, {
      masterId: wMasterId ?? "-",
      nameU: wNameU || `"${(text || "").slice(0, 30)}"`,
      count: 1,
      classifiedAs: "element → pool (heuristic)",
    });
    // Decrement the corresponding skip row.
    const skipKey = `${wMasterId ?? "-"}|${wNameU}`;
    const skipBd = masterBreakdown.get(skipKey);
    if (skipBd && skipBd.count > 0) skipBd.count--;
    if (skipBd && skipBd.count === 0) masterBreakdown.delete(skipKey);
    const skipTag = wNameU || (wMasterId ? `master ${wMasterId} (no NameU)` : "(no master)");
    const skipN = skippedByTag.get(skipTag) ?? 0;
    if (skipN > 0) skippedByTag.set(skipTag, skipN - 1);
    if (skippedByTag.get(skipTag) === 0) skippedByTag.delete(skipTag);
  }

  // Build element list.
  const shapeIdToElId = new Map<string, string>();
  const elements: DiagramElement[] = [];
  for (const r of raw) {
    if (!r.seed) continue;
    const elId = r.bpmnId && r.bpmnId.length > 0 ? r.bpmnId : nano();
    shapeIdToElId.set(r.shapeId, elId);

    const pinX = r.pageX;        // page-absolute (after parent transform)
    const pinY = r.pageY;
    const w = r.width;
    const h = r.height;

    // Force Diagramatix default sizes for fixed-icon types so events,
    // gateways, data-objects and data-stores don't import as oversized
    // 1in Visio masters. Centre (pinX, pinY) is preserved.
    const fixed = FIXED_ICON_SIZES[r.seed.type];
    let widthPx = fixed ? fixed.w : w * PX_PER_INCH;
    let heightPx = fixed ? fixed.h : h * PX_PER_INCH;
    // Sanity floor: if a resizable shape's imported W/H came out as 0 or
    // implausibly small (e.g. cells outside the head slice, or a master
    // with formula-only cached values that didn't survive parsing), drop
    // back to a sensible default so the shape actually renders on canvas.
    if (!fixed) {
      const fallback = FALLBACK_SIZES[r.seed.type];
      if (fallback) {
        // 20 px floor: BPMN shapes below this size are almost certainly a
        // sub-decoration with an artificially small W/H, not a real
        // user-sized element. Drop in the canonical default so the shape
        // actually renders.
        if (widthPx < 20) widthPx = fallback.w;
        if (heightPx < 20) heightPx = fallback.h;
      }
    }
    const centreXPx = pinX * PX_PER_INCH;
    const centreYPx = (pageH - pinY) * PX_PER_INCH;
    const xPx = centreXPx - widthPx / 2;
    const yPx = centreYPx - heightPx / 2;

    // Page-level <Text> wins; otherwise fall back to the BpmnName Property
    // (Pools and Lanes carry their label only on the per-instance master,
    // not the page shape, so for those types BpmnName is the only source).
    const label = readText(r.block) || r.props.BpmnName || "";
    const properties: Record<string, unknown> = {};
    if (r.seed.subprocessType) properties.subprocessType = r.seed.subprocessType;
    if (r.seed.poolType) properties.poolType = r.seed.poolType;
    if (r.seed.role) properties.role = r.seed.role;
    if (r.seed.multiplicity) properties.multiplicity = r.seed.multiplicity;
    // Visio's "System Pool" master signals a system participant in BPMN —
    // surface that as the canvas's `isSystem` flag (Black-Box variant).
    if (r.nameU === "System Pool") properties.isSystem = true;

    const el: DiagramElement = {
      id: elId,
      type: r.seed.type,
      x: xPx,
      y: yPx,
      width: widthPx,
      height: heightPx,
      label,
      properties,
    };
    if (r.seed.taskType) el.taskType = r.seed.taskType;
    if (r.seed.gatewayType) el.gatewayType = r.seed.gatewayType;
    if (r.seed.eventType) el.eventType = r.seed.eventType;
    if (r.seed.flowType) el.flowType = r.seed.flowType;
    elements.push(el);
  }

  // Pool→Lane parentage from Pool Member sections (V3 round-trip).
  for (const [poolShapeId, laneShapeIds] of poolMembers) {
    const poolElId = shapeIdToElId.get(poolShapeId);
    if (!poolElId) continue;
    for (const laneShapeId of laneShapeIds) {
      const laneElId = shapeIdToElId.get(laneShapeId);
      if (!laneElId) continue;
      const lane = elements.find((e) => e.id === laneElId);
      if (lane && !lane.parentId) lane.parentId = poolElId;
    }
  }
  // Pool→Lane parentage from page nesting (native Visio): if a Lane was
  // nested inside a Pool in the source XML, set parentId from that.
  for (const r of raw) {
    if (r.seed?.type !== "lane" || !r.parentShapeId) continue;
    const parent = rawByShapeId.get(r.parentShapeId);
    if (parent?.seed?.type !== "pool") continue;
    const laneElId = shapeIdToElId.get(r.shapeId);
    const poolElId = shapeIdToElId.get(parent.shapeId);
    if (!laneElId || !poolElId) continue;
    const lane = elements.find((e) => e.id === laneElId);
    if (lane && !lane.parentId) lane.parentId = poolElId;
  }

  // Auto-detect poolType: any pool that has a Lane child becomes white-box;
  // any pool with NO lane children becomes black-box. This runs AFTER all
  // parentage has been resolved so lane-counts are accurate.
  const laneCountByPool = new Map<string, number>();
  for (const e of elements) {
    if (e.type === "lane" && e.parentId) {
      laneCountByPool.set(e.parentId, (laneCountByPool.get(e.parentId) ?? 0) + 1);
    }
  }
  for (const e of elements) {
    if (e.type !== "pool") continue;
    if (e.properties.poolType !== undefined) continue;   // explicit (System Pool / Pool + N Lanes / Black-Box etc.)
    e.properties.poolType = (laneCountByPool.get(e.id) ?? 0) > 0 ? "white-box" : "black-box";
  }

  // Connectors: page-level <Connects><Connect FromSheet=… ToSheet=… /></Connects>
  // gives source/target. FromCell='BeginX' → source; FromCell='EndX' → target.
  const connectsBlock = pageXml.match(/<Connects>([\s\S]*?)<\/Connects>/)?.[1] ?? "";
  // Collect connector glue from page-level <Connect> rows. Visio writes
  // attributes in a fixed order but be defensive — match either FromCell
  // before/after ToSheet, and accept both single and double quotes.
  const connSourceTarget = new Map<string, { source?: string; target?: string }>();
  // Reverse map for glue-target Black-Box pool detection: shape ID → set
  // of connector shape IDs that glue to it.
  const glueTargets = new Set<string>();
  const connectAttrRe = /<Connect\s+([^>]+?)\/?>/g;
  let cm;
  while ((cm = connectAttrRe.exec(connectsBlock)) !== null) {
    const attrs = cm[1];
    const fromSheet = attrs.match(/FromSheet=["'](\d+)["']/)?.[1];
    const fromCell  = attrs.match(/FromCell=["'](\w+)["']/)?.[1];
    const toSheet   = attrs.match(/ToSheet=["'](\d+)["']/)?.[1];
    if (!fromSheet || !fromCell || !toSheet) continue;
    const entry = connSourceTarget.get(fromSheet) ?? {};
    if (fromCell === "BeginX") entry.source = toSheet;
    else if (fromCell === "EndX") entry.target = toSheet;
    connSourceTarget.set(fromSheet, entry);
    glueTargets.add(toSheet);
  }
  // Also collect glue targets from BegTrigger/EndTrigger formulas for any
  // connector whose Connect rows we couldn't read.
  for (const r of raw) {
    if (!r.connectorBase) continue;
    const beg = r.block.match(/<Cell\s+N='BegTrigger'[^>]*F='[^']*Sheet\.(\d+)/)?.[1];
    const end = r.block.match(/<Cell\s+N='EndTrigger'[^>]*F='[^']*Sheet\.(\d+)/)?.[1];
    if (beg) glueTargets.add(beg);
    if (end) glueTargets.add(end);
  }

  // Glue-target promotion for Black-Box Pools: an unclassified shape that
  // is referenced by a connector's Begin/End AND has a non-empty text
  // label is almost always a labelled pool (no master attribute, common
  // in hand-built Visio BPMN files). Synthesise it as a Pool so the
  // connectors don't end up dangling.
  const blackBoxPoolsCreated: string[] = [];
  for (const targetShapeId of glueTargets) {
    if (rawByShapeId.has(targetShapeId)) continue;     // already classified
    const wp = walkedById.get(targetShapeId);
    if (!wp) continue;
    const text = readText(wp.block);
    const props = readPropValues(wp.block);
    const label = text || props.BpmnName || "";
    if (!label) continue;                              // no label → skip
    // Use read W/H if plausible; else fall back to a Black-Box Pool default.
    const widthIn = wp.width > 0.5 ? wp.width : 200 / PX_PER_INCH;     // ≥48px ish
    const heightIn = wp.height > 0.3 ? wp.height : 60 / PX_PER_INCH;
    const synthBox: RawShape = {
      shapeId: targetShapeId,
      parentShapeId: wp.parentShapeId,
      masterId: null,
      nameU: "(black-box pool)",
      block: wp.block,
      pageX: wp.pageX,
      pageY: wp.pageY,
      width: widthIn,
      height: heightIn,
      seed: { type: "pool", poolType: "black-box" },
      connectorBase: null,
      bpmnId: props.BpmnId,
      props,
    };
    raw.push(synthBox);
    rawByShapeId.set(targetShapeId, synthBox);
    blackBoxPoolsCreated.push(targetShapeId);
    // Add to elements directly (we've already left the element-build loop).
    const elId = props.BpmnId && props.BpmnId.length > 0 ? props.BpmnId : nano();
    shapeIdToElId.set(targetShapeId, elId);
    const widthPx = widthIn * PX_PER_INCH;
    const heightPx = heightIn * PX_PER_INCH;
    elements.push({
      id: elId,
      type: "pool",
      x: wp.pageX * PX_PER_INCH - widthPx / 2,
      y: (pageH - wp.pageY) * PX_PER_INCH - heightPx / 2,
      width: widthPx,
      height: heightPx,
      label,
      properties: { poolType: "black-box" },
    });
    // Update breakdown: add a separate row for the synthesised pool.
    masterBreakdown.set(`__synth_blackbox_${targetShapeId}`, {
      masterId: "-",
      nameU: `"${label.slice(0, 30)}"`,
      count: 1,
      classifiedAs: "element → pool (black-box, glue-target)",
    });
    // Decrement the "(no master)" skipped row.
    const origKey = `-|`;
    const orig = masterBreakdown.get(origKey);
    if (orig && orig.count > 0) orig.count--;
    if (orig && orig.count === 0) masterBreakdown.delete(origKey);
  }

  const connectors: Connector[] = [];
  let connectorsSkipped = 0;
  for (const r of raw) {
    if (!r.connectorBase) continue;

    let ends = connSourceTarget.get(r.shapeId);
    // Fallback: if the page-level <Connect> rows didn't resolve source
    // or target, parse the connector's BegTrigger/EndTrigger formulas.
    // V3 export emits `F='_XFTRIGGER(Sheet.${shapeId}!EventXFMod)'` on
    // both cells; native Visio uses similar formulas when shapes are
    // glued. Either way, the embedded `Sheet.N` reveals the linked shape.
    if (!ends?.source || !ends?.target) {
      const begCell = r.block.match(/<Cell\s+N='BegTrigger'[^>]*F='[^']*Sheet\.(\d+)/);
      const endCell = r.block.match(/<Cell\s+N='EndTrigger'[^>]*F='[^']*Sheet\.(\d+)/);
      const next = { ...(ends ?? {}) };
      if (!next.source && begCell) next.source = begCell[1];
      if (!next.target && endCell) next.target = endCell[1];
      ends = next;
    }
    const sourceShape = ends?.source;
    const targetShape = ends?.target;
    const sourceId = sourceShape ? shapeIdToElId.get(sourceShape) : undefined;
    const targetId = targetShape ? shapeIdToElId.get(targetShape) : undefined;
    if (!sourceId || !targetId) {
      const why = !sourceShape && !targetShape
        ? "no Connect row and no glue formula"
        : !sourceShape ? "no source glue"
        : !targetShape ? "no target glue"
        : !sourceId ? `source shape ${sourceShape} not in element list`
        : `target shape ${targetShape} not in element list`;
      warnings.push(`Skipped connector ${r.shapeId} (${r.nameU}) — ${why}.`);
      connectorsSkipped++;
      continue;
    }

    // Compute Begin/End in PAGE-ABSOLUTE Visio coords. The walker already
    // gives us r.pageX/pageY (the connector's centre in page coords). Begin
    // and End cells are in the connector's parent frame (same frame as the
    // PinX cell), so the offset between them and pageX is exactly the
    // parent-origin shift — works for top-level (offset=0) and any depth
    // of nesting.
    const head = outerHead(r.block);
    const cellPinX = readCellNum(head, "PinX") ?? 0;
    const cellPinY = readCellNum(head, "PinY") ?? 0;
    const cellLocPinX = readCellNum(head, "LocPinX") ?? 0;
    const cellLocPinY = readCellNum(head, "LocPinY") ?? 0;
    const offX = r.pageX - cellPinX;
    const offY = r.pageY - cellPinY;
    const beginX = (readCellNum(head, "BeginX") ?? 0) + offX;
    const beginY = (readCellNum(head, "BeginY") ?? 0) + offY;
    const endX = (readCellNum(head, "EndX") ?? 0) + offX;
    const endY = (readCellNum(head, "EndY") ?? 0) + offY;
    // Local origin (bottom-left of the connector's bounding box) in page
    // coords. Geometry MoveTo/LineTo rows are LOCAL-frame coords measured
    // from this origin (Visio Y-up).
    const localOrigX = r.pageX - cellLocPinX;
    const localOrigY = r.pageY - cellLocPinY;

    const geom = r.block.match(/<Section\s+N='Geometry'\s+IX='0'>([\s\S]*?)<\/Section>/)?.[1] ?? "";
    const rawWPs: Point[] = [];
    const rowRe = /<Row\s+T='(MoveTo|LineTo)'\s+IX='(\d+)'>([\s\S]*?)<\/Row>/g;
    let rr;
    while ((rr = rowRe.exec(geom)) !== null) {
      const inner = rr[3];
      const rx = parseFloat(readCellV(inner, "X") ?? "0");
      const ry = parseFloat(readCellV(inner, "Y") ?? "0");
      rawWPs.push({
        x: (localOrigX + rx) * PX_PER_INCH,
        y: (pageH - (localOrigY + ry)) * PX_PER_INCH,
      });
    }
    // No geometry section: synthesize Begin so we have at least one waypoint.
    if (rawWPs.length === 0) {
      rawWPs.push({
        x: beginX * PX_PER_INCH,
        y: (pageH - beginY) * PX_PER_INCH,
      });
    }
    // Append End if the last raw waypoint isn't already there.
    const finalX = endX * PX_PER_INCH;
    const finalY = (pageH - endY) * PX_PER_INCH;
    const tail = rawWPs[rawWPs.length - 1];
    if (Math.abs(tail.x - finalX) > 0.5 || Math.abs(tail.y - finalY) > 0.5) {
      rawWPs.push({ x: finalX, y: finalY });
    }
    // Dedupe near-duplicate consecutive waypoints (within 0.5 px).
    const waypoints: Point[] = [];
    for (const wp of rawWPs) {
      const last = waypoints[waypoints.length - 1];
      if (!last || Math.abs(last.x - wp.x) > 0.5 || Math.abs(last.y - wp.y) > 0.5) {
        waypoints.push(wp);
      }
    }

    // Snap the first/last waypoints to the nearest EDGE of source/target
    // shape (not the centre — large pools would have message connectors
    // visibly piercing into the middle). Compute the intersection of the
    // line from shape-centre toward the next/prev waypoint with the
    // shape's bounding rectangle.
    const sourceEl = elements.find((e) => e.id === sourceId);
    const targetEl = elements.find((e) => e.id === targetId);
    if (sourceEl && waypoints.length >= 2) {
      waypoints[0] = clipToRectEdge(sourceEl, waypoints[1]);
    }
    if (targetEl && waypoints.length >= 2) {
      waypoints[waypoints.length - 1] = clipToRectEdge(
        targetEl,
        waypoints[waypoints.length - 2],
      );
    }

    const connId = r.bpmnId && r.bpmnId.length > 0 ? r.bpmnId : nano();
    const label = readText(r.block);

    const connector: Connector = {
      id: connId,
      sourceId,
      targetId,
      sourceSide: "right",   // best-effort; canvas can re-route after import
      targetSide: "left",
      type: r.connectorBase,
      directionType: "directed",
      routingType: "rectilinear",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints,
      label: label || undefined,
    };
    connectors.push(connector);
  }

  // Drop any heuristic-promoted pool whose final label is empty (after
  // <pp/> stripping, BpmnName fallback etc.) — these are almost always
  // a wrapper container we shouldn't have classified.  Also drop any
  // connector that referenced one of these pruned pools.
  const droppedPoolIds = new Set<string>();
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.type !== "pool") continue;
    if (e.label && e.label.trim()) continue;
    droppedPoolIds.add(e.id);
    elements.splice(i, 1);
  }
  if (droppedPoolIds.size > 0) {
    for (let i = connectors.length - 1; i >= 0; i--) {
      const c = connectors[i];
      if (droppedPoolIds.has(c.sourceId) || droppedPoolIds.has(c.targetId)) {
        connectors.splice(i, 1);
      }
    }
    // Clear any lane.parentId that referenced a dropped pool.
    for (const e of elements) {
      if (e.parentId && droppedPoolIds.has(e.parentId)) e.parentId = undefined;
    }
  }

  // Normalise so the upper-left of the diagram sits near (0, 0) on the canvas.
  if (elements.length > 0) {
    const minX = Math.min(...elements.map((e) => e.x));
    const minY = Math.min(...elements.map((e) => e.y));
    // 40px padding so the leftmost/topmost shape isn't flush against the edge.
    const offX = -minX + 40;
    const offY = -minY + 40;
    for (const e of elements) {
      e.x += offX;
      e.y += offY;
    }
    for (const c of connectors) {
      for (const wp of c.waypoints) {
        wp.x += offX;
        wp.y += offY;
      }
    }
  }

  // Skipped-shape summary: lead with one aggregated warning that lists
  // each unrecognised master NameU and the count of shapes that used it,
  // followed by up to 20 individual per-shape entries for context.
  if (skippedByTag.size > 0) {
    const sorted = [...skippedByTag].sort((a, b) => b[1] - a[1]);
    const summary = sorted
      .map(([tag, count]) => `${count}× "${tag}"`)
      .join(", ");
    warnings.push(
      `Skipped ${[...skippedByTag.values()].reduce((a, b) => a + b, 0)} shape(s) ` +
      `with unrecognised masters: ${summary}.`,
    );
    warnings.push(...perShapeWarnings);
  }

  // Build the final stats payload — sorted by occurrence count desc.
  const totalShapes = walked.length;
  const elementsCreated = elements.length;
  const connectorsCreated = connectors.length;
  const shapesSkipped = [...skippedByTag.values()].reduce((a, b) => a + b, 0);
  const sortedMasters: MasterStat[] = [...masterBreakdown.values()]
    .sort((a, b) => b.count - a.count);

  return {
    data: {
      elements,
      connectors,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    warnings,
    stats: {
      totalShapesOnPage: totalShapes,
      elementsCreated,
      connectorsCreated,
      shapesSkipped,
      connectorsSkipped,
      implicitPools: implicitPoolCount,
      masters: sortedMasters,
    },
  };
}

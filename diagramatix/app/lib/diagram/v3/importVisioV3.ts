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
  /** Width/Height from the master's root Shape 5 (in inches). Used as a
   *  fallback when an instance shape has no Width/Height of its own —
   *  Visio inherits the dimensions from the master at render time, but
   *  the importer reads only instance cells unless we resolve up. */
  masterWidth?: number;
  masterHeight?: number;
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

/** Snap a connector endpoint to the MIDPOINT of the rectangle's closest
 *  edge — based on which side of the shape's centre the external point
 *  sits. Always lands ON the boundary (never inside), so connectors
 *  visually attach to the pool/element edge regardless of whether the
 *  source/target waypoints landed inside or outside. */
function clipToRectEdge(
  rect: { x: number; y: number; width: number; height: number },
  external: { x: number; y: number },
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = external.x - cx;
  const dy = external.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: rect.y };       // degenerate
  // Decide which edge faces `external` most directly using normalised
  // distance (so wide pools don't always pick top/bottom).
  const xDom = Math.abs(dx) / Math.max(1, rect.width)
             > Math.abs(dy) / Math.max(1, rect.height);
  if (xDom) {
    return dx > 0
      ? { x: rect.x + rect.width, y: cy }                     // right edge
      : { x: rect.x,              y: cy };                    // left edge
  }
  return dy > 0
    ? { x: cx, y: rect.y + rect.height }                       // bottom edge
    : { x: cx, y: rect.y };                                    // top edge
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
  // Walk every <Text>...</Text> block and return the first NON-EMPTY one
  // (after stripping Visio's inline formatting — `<cp/>` character props,
  // `<pp/>` paragraph props, `<tp/>` tab props, `<fld/>` field code).
  // Many Visio masters (Pool + 2 Lanes, CFF Container variants) put the
  // label on a NESTED sub-shape's <Text> while leaving the outer empty —
  // taking the first match unconditionally would lose the actual label.
  const re = /<Text>([\s\S]*?)<\/Text>/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const stripped = m[1]
      .replace(/<(?:cp|pp|tp|fld)\b[^/>]*\/?>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .trim();
    if (stripped) return stripped;
  }
  return "";
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

  // Second pass: open each master's XML file and read its root Shape 5
  // outer-head Width/Height. Container masters (Black-Box Pool, CFF
  // Container, Pool / Lane) define their natural dimensions at the master
  // level — the page-level instance frequently has only PinX/PinY and
  // inherits W/H. Without this, Black-Box Pool drops at the canvas-default
  // fallback size instead of its master-defined ~15.75 × 1.06 inches.
  for (const [id, info] of masters) {
    if (!info.fileName) continue;
    const masterXml = await zip.file(`visio/masters/${info.fileName}`)?.async("string");
    if (!masterXml) continue;
    const shape5Open = masterXml.match(/<Shape\s+ID='5'[^>]*>/);
    if (!shape5Open) continue;
    // Outer head of the master's Shape 5: cells before any nested <Shapes>
    // or <Shape ID=…>. Reuse the same logic as outerHead() for instances.
    const shape5Start = shape5Open.index! + shape5Open[0].length;
    const inner = masterXml.slice(shape5Start);
    const cut = (() => {
      let c = inner.length;
      const m1 = inner.indexOf("<Shapes>");
      const m2 = inner.search(/<Shape\s+ID=/);
      if (m1 >= 0 && m1 < c) c = m1;
      if (m2 >= 0 && m2 < c) c = m2;
      return c;
    })();
    const head5 = inner.slice(0, cut);
    const masterWidth = readCellNum(head5, "Width") ?? undefined;
    const masterHeight = readCellNum(head5, "Height") ?? undefined;
    if (masterWidth || masterHeight) {
      masters.set(id, { ...info, masterWidth, masterHeight });
    }
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

function walkAllShapes(pageXml: string, masters: Map<string, MasterInfo>): WalkedShape[] {
  const m = pageXml.match(/<Shapes>([\s\S]*?)<\/Shapes>(?=\s*(?:<Connects>|<\/PageContents>))/);
  if (!m) return [];
  const inner = m[1];

  // First pass: build the tree by ARRAY INDEX, not shape ID. Visio routinely
  // writes the sentinel ID `4294967295` (2^32-1, "no/duplicate ID") on many
  // sub-shapes; if we keyed parent lookups by shape ID those duplicates
  // would all collide on one map entry, and any nested shape descended
  // from one of them would inherit the wrong parent's dimensions →
  // wildly off-page pageX/pageY.
  type RawNode = {
    nodeIndex: number;
    shapeId: string;
    block: string;
    parentNodeIndex: number;       // -1 for top-level
  };
  const nodes: RawNode[] = [];
  type Frame = { nodeIndex: number; blockStart: number };
  const stack: Frame[] = [];
  let nextIndex = 0;
  const tagRe = /<(\/?)Shape(\s|>)/g;
  let t;
  while ((t = tagRe.exec(inner)) !== null) {
    if (t[1] === "/") {
      const frame = stack.pop();
      if (!frame) continue;
      const blockEnd = inner.indexOf(">", t.index) + 1;
      // Slot already pre-allocated at OPEN time (so nodeIndex is stable);
      // fill in block & parentNodeIndex now.
      const node = nodes[frame.nodeIndex];
      node.block = inner.slice(frame.blockStart, blockEnd);
      node.parentNodeIndex = stack.length > 0 ? stack[stack.length - 1].nodeIndex : -1;
      continue;
    }
    const tagEnd = inner.indexOf(">", t.index) + 1;
    const openTag = inner.slice(t.index, tagEnd);
    // Self-closing `<Shape Del='1' ID='X'/>` markers (Visio writes these
    // for deleted/internal shapes — typically with the sentinel
    // ID='4294967295'). They have NO content and NO matching </Shape>;
    // pushing a frame for them would corrupt the stack — every later
    // </Shape> would pop the wrong frame, and 16 unrelated real shapes
    // would lose their close-tag pairing. Skip them entirely.
    if (openTag.endsWith("/>")) continue;
    const shapeId = openTag.match(/ID='(\d+)'/)?.[1] ?? "?";
    const nodeIndex = nextIndex++;
    nodes[nodeIndex] = {
      nodeIndex,
      shapeId,
      block: "",                  // filled in at close
      parentNodeIndex: -1,
    };
    stack.push({ nodeIndex, blockStart: t.index });
  }

  // Second pass: read PinX/PinY/W/H from each shape's outer head (cells
  // before the first nested <Shapes>). Indexed by nodeIndex so duplicate
  // shape IDs don't collide.
  // Pools that wrap their body geometry in a sub-shape OR rely entirely
  // on master inheritance (e.g. Black-Box Pool whose page-level Shape
  // carries only PinX/PinY) get caught by:
  //   1. fall-through to the FIRST nested <Shape>'s W/H, then
  //   2. fall-through to the master file's Shape 5 W/H (read into
  //      MasterInfo.masterWidth / masterHeight at index-load time).
  type Geom = { localPinX: number; localPinY: number; width: number; height: number };
  const geom: Geom[] = new Array(nodes.length);
  for (const n of nodes) {
    const head = outerHead(n.block);
    let width = readCellNum(head, "Width") ?? 0;
    let height = readCellNum(head, "Height") ?? 0;
    if (width <= 0 || height <= 0) {
      const innerOpenIdx = n.block.search(/<Shape\s+ID=/g);
      // First match at index 0 IS the wrapper itself — find the SECOND.
      const secondOpenIdx = innerOpenIdx >= 0
        ? n.block.indexOf("<Shape ID=", innerOpenIdx + 1)
        : -1;
      if (secondOpenIdx > 0) {
        const innerBlock = n.block.slice(secondOpenIdx);
        const innerHead = outerHead(innerBlock);
        if (width <= 0) width = readCellNum(innerHead, "Width") ?? 0;
        if (height <= 0) height = readCellNum(innerHead, "Height") ?? 0;
      }
    }
    if (width <= 0 || height <= 0) {
      // Last fallback: master's own Shape 5 Width/Height. Visio inherits
      // these to instances at render time when the instance has none of
      // its own (typical for Black-Box Pool: instance carries only
      // PinX/PinY, all sizing inherited).
      const masterIdM = n.block.match(/Master='(\d+)'/);
      const masterId = masterIdM?.[1];
      const info = masterId ? masters.get(masterId) : undefined;
      if (info?.masterWidth && width <= 0) width = info.masterWidth;
      if (info?.masterHeight && height <= 0) height = info.masterHeight;
    }
    geom[n.nodeIndex] = {
      localPinX: readCellNum(head, "PinX") ?? 0,
      localPinY: readCellNum(head, "PinY") ?? 0,
      width,
      height,
    };
  }

  // Third pass: compute pageX/pageY in pre-order (parents-first). The
  // walker assigns nodeIndex monotonically at OPEN time, so iterating
  // 0..N-1 always sees a parent before its children.
  const pageX: number[] = new Array(nodes.length);
  const pageY: number[] = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const g = geom[i];
    if (n.parentNodeIndex < 0) {
      pageX[i] = g.localPinX;
      pageY[i] = g.localPinY;
      continue;
    }
    const parentG = geom[n.parentNodeIndex];
    const parentX = pageX[n.parentNodeIndex] ?? 0;
    const parentY = pageY[n.parentNodeIndex] ?? 0;
    pageX[i] = parentX - parentG.width / 2 + g.localPinX;
    pageY[i] = parentY - parentG.height / 2 + g.localPinY;
  }

  // Build a parent-shape-ID for each node by chasing parentNodeIndex →
  // nodes[parentNodeIndex].shapeId. This gives the right shape ID even
  // when duplicate IDs exist elsewhere in the tree.
  return nodes.map((n, i) => ({
    shapeId: n.shapeId,
    block: n.block,
    parentShapeId: n.parentNodeIndex >= 0 ? nodes[n.parentNodeIndex].shapeId : null,
    pageX: pageX[i],
    pageY: pageY[i],
    width: geom[i].width,
    height: geom[i].height,
  }));
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
    // BpmnBoundaryType is the authoritative source. The master name only
    // sets the *initial* default (e.g. dragging "Call Collapsed Sub-process"
    // seeds subprocessType="call"), but the user may have explicitly set
    // the property to "Default" afterwards — in which case it's actually
    // a normal subprocess. Re-derive from the property whenever it's set.
    if (props.BpmnBoundaryType === "Call") seed.subprocessType = "call";
    else if (props.BpmnBoundaryType === "Event") seed.subprocessType = "event";
    else if (props.BpmnBoundaryType === "Transaction") seed.subprocessType = "transaction";
    else if (props.BpmnBoundaryType === "Default") delete seed.subprocessType;
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

  const walked = walkAllShapes(pageXml, masters);
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
    // NameU resolution order: master's NameU (if shape has Master attr), else
    // the shape's OWN NameU on its open tag. The latter catches CFF Container
    // variants like shape 55 ("Online Modules") that have NameU='CFF Container.44'
    // in the open tag but no Master='...' attribute (only MasterShape='6').
    const inlineNameU = block.match(/<Shape\s+ID='\d+'[^>]*\sNameU='([^']*)'/)?.[1] ?? "";
    const nameU = normaliseNameU(masterInfo?.nameU || inlineNameU);
    const props = readPropValues(block);
    const bpmnId = props.BpmnId;

    // Skip sub-shapes (those that reference a parent master's shape via
    // `MasterShape='N'` and have no `Master='X'` of their own). Without
    // this guard, the body sub-shape of a Black-Box Pool — `Shape ID='299'
    // NameU='CFF Container.44' MasterShape='6'` — gets fuzzy-matched as
    // its own pool element, and the same goes for the Swimlane List
    // sub-shape. The result is phantom-pool inflation: 2 Black-Box Pools
    // multiply into 6 pool elements (2 real + 2 CFF Container body
    // duplicates + 2 Swimlane List body duplicates), and lanes end up
    // parented to the wrong (innermost) phantom pool which is why the
    // user sees "lanes linked together / not separately selectable."
    const hasMasterShapeAttr = /MasterShape='\d+'/.test(block.slice(0, block.indexOf(">") + 1));
    if (!masterId && hasMasterShapeAttr) {
      // Don't even record this in the master breakdown — these are
      // structural decorations of an already-classified parent.
      continue;
    }

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
  // Names where this disambiguation applies — only masters that genuinely
  // double as pool-vs-lane in different contexts. CFF Container and
  // Swimlane List are deliberately NOT here: in real-world Visio CFF
  // files each *named* CFF Container.NN is a sibling pool, and an outer
  // top-level CFF Container is just a transparent wrapper. Flipping nested
  // CFF Containers to lanes would silently turn every pool into a lane
  // whenever a wrapper is heuristically promoted.
  const POOL_OR_LANE_NAMES = new Set([
    "Pool / Lane", "Swimlane",
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
    "Message", "Phase",
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
    // If any ancestor's NameU is "Phase List", this shape is a Phase band
    // — those are vertical decorations within a swimlane, not pools.
    let phaseAncestor = false;
    {
      let cur: string | null = w.parentShapeId;
      while (cur) {
        const pw = walkedById.get(cur);
        if (!pw) break;
        const pmId = pw.block.match(/Master='(\d+)'/)?.[1];
        const pNameU = normaliseNameU(masters.get(pmId ?? "")?.nameU ?? "");
        if (pNameU === "Phase List" || pNameU === "Phase") { phaseAncestor = true; break; }
        cur = pw.parentShapeId ?? null;
      }
    }
    if (phaseAncestor) continue;

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
    // Widen the pool header strip for multi-line labels. Pool labels are
    // rendered rotated 90° in the left header — each `\n` becomes a
    // parallel column, so a 3-line label needs ~3× the default 36px.
    if (r.seed.type === "pool" && label) {
      const lineCount = label.split(/\r?\n/).length;
      if (lineCount > 1) {
        properties.poolHeaderWidth = Math.max(36, lineCount * 30 + 16);
      }
    }

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

  // Deduplicate overlapping pools. BPMN_M's Pool/Lane structure puts a
  // CFF Container, a Swimlane List, AND multiple Lanes as TOP-LEVEL
  // siblings (no nesting). Both CFF Container and Swimlane List map to
  // "pool" in ELEMENT_NAMEU_MAP because in some files they each ARE the
  // pool. In a CFF-style file with both, the user sees one logical pool
  // — but the importer creates two (e.g. Company CFF Container with
  // label, plus an unlabelled Swimlane List that fully overlaps it). The
  // unlabelled wrapper has no semantic role on the canvas and just makes
  // the lane parentage ambiguous. Drop pools that have an empty label
  // AND fully (or near-fully) overlap a labelled pool of similar size.
  {
    const pools = elements.filter((e) => e.type === "pool");
    const dropPoolIds = new Set<string>();
    for (const a of pools) {
      if (dropPoolIds.has(a.id)) continue;
      if (a.label && a.label.trim().length > 0) continue; // labelled — keep
      const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.width, ay2 = a.y + a.height;
      const aArea = a.width * a.height;
      const acx = a.x + a.width / 2;
      const acy = a.y + a.height / 2;
      if (aArea <= 0) continue;
      for (const b of pools) {
        if (b.id === a.id) continue;
        if (!b.label || b.label.trim().length === 0) continue; // need labelled twin
        if (dropPoolIds.has(b.id)) continue;
        const bx1 = b.x, by1 = b.y, bx2 = b.x + b.width, by2 = b.y + b.height;
        // Drop A if EITHER:
        //   (i)  ≥80% of A's bbox area is inside B (deep overlap), OR
        //   (ii) A's CENTRE is inside B AND their heights match within 30%
        //        (handles the off-screen Swimlane List case where missing
        //        LocPinX shifts the bbox left but the centre still lands
        //        inside the Company pool — e.g. Shape 210 Swimlane List
        //        vs Shape 207 CFF Container "Company" in BPMN_M files).
        const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
        const iy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
        const overlapFrac = (ix * iy) / aArea;
        const centreInside = acx >= bx1 && acx <= bx2 && acy >= by1 && acy <= by2;
        const similarHeight = b.height > 0 && Math.abs(a.height - b.height) / b.height < 0.3;
        if (overlapFrac >= 0.8 || (centreInside && similarHeight)) {
          dropPoolIds.add(a.id);
          break;
        }
      }
    }
    if (dropPoolIds.size > 0) {
      // Remap shapeIdToElId entries that pointed to a dropped pool to
      // null so downstream connector lookups don't keep stale refs.
      for (const [shapeId, elId] of shapeIdToElId.entries()) {
        if (dropPoolIds.has(elId)) shapeIdToElId.delete(shapeId);
      }
      for (let i = elements.length - 1; i >= 0; i--) {
        if (dropPoolIds.has(elements[i].id)) elements.splice(i, 1);
      }
    }
  }

  // Pool→Lane parentage by GEOMETRIC CONTAINMENT — final fallback for
  // BPMN_M-style pools where the page XML places the CFF Container and
  // Lane shapes as TOP-LEVEL siblings (no nesting and no Member section).
  // Each lane gets parented to whichever pool's bounding rectangle
  // contains its centre. Without this, lanes have no parentId and
  // Diagramatix's lane-stack rendering doesn't kick in — the user sees
  // "3 lanes linked together / not separately selectable" because
  // they're orphan elements in page space.
  const poolElements = elements.filter((e) => e.type === "pool");
  for (const lane of elements) {
    if (lane.type !== "lane" || lane.parentId) continue;
    const cx = lane.x + lane.width / 2;
    const cy = lane.y + lane.height / 2;
    let bestPool: DiagramElement | null = null;
    let bestArea = Infinity;
    for (const p of poolElements) {
      if (cx < p.x || cx > p.x + p.width || cy < p.y || cy > p.y + p.height) continue;
      const area = p.width * p.height;
      if (area < bestArea) { bestArea = area; bestPool = p; }
    }
    if (bestPool) lane.parentId = bestPool.id;
  }

  // LANE NORMALISATION — make every imported pool/lane structure look
  // exactly like a Diagramatix-native pool with manually-added lanes.
  // Diff source: a manual Pool + 3 lanes saved from the canvas had:
  //   pool.properties.poolHeaderWidth = 36           (always)
  //   pool.properties.poolType = "white-box"         (when has lanes)
  //   lane.properties.laneHeaderWidth = 37           (always)
  //   lane.x = pool.x + 36                           (snap to pool body)
  //   lane.width = pool.width - 36
  //   lane[i].y = pool.y + sum(lane[0..i-1].height)  (exact stacking, no gaps)
  //   sum(lane.height) = pool.height                 (last lane absorbs the residue)
  // Without this normalisation, Visio's raw geometry leaves lane.x off by
  // ~10 px, sub-pixel Y-stacking gaps, and missing properties — the
  // post-import MOVE_ELEMENT cascade reads these as inconsistent and
  // collapses the top + bottom lanes (only middle survives), exactly the
  // user-reported symptom.
  const POOL_HEADER_W = 36;
  const LANE_HEADER_W = 37;
  for (const pool of elements) {
    if (pool.type !== "pool") continue;
    const poolLanes = elements
      .filter((e) => e.type === "lane" && e.parentId === pool.id)
      .sort((a, b) => a.y - b.y);
    if (poolLanes.length === 0) continue;
    // Always set poolHeaderWidth (the one the manual flow always sets).
    pool.properties = pool.properties ?? {};
    if (pool.properties.poolHeaderWidth === undefined) {
      pool.properties.poolHeaderWidth = POOL_HEADER_W;
    }
    pool.properties.poolType = pool.properties.poolType ?? "white-box";
    // Snap lane geometry & stack contiguously. Preserve relative heights:
    // total lane height should equal pool height exactly. Distribute any
    // rounding residue to the LAST lane.
    const totalLaneH = poolLanes.reduce((s, e) => s + e.height, 0);
    const heightScale = totalLaneH > 0 ? pool.height / totalLaneH : 1;
    let runningY = pool.y;
    for (let i = 0; i < poolLanes.length; i++) {
      const lane = poolLanes[i];
      const isLast = i === poolLanes.length - 1;
      // Scale heights to fill the pool exactly; the last lane absorbs
      // any sub-pixel residue.
      const scaledH = lane.height * heightScale;
      const newH = isLast ? pool.y + pool.height - runningY : Math.round(scaledH);
      lane.x = pool.x + POOL_HEADER_W;
      lane.width = pool.width - POOL_HEADER_W;
      lane.y = runningY;
      lane.height = newH;
      lane.properties = lane.properties ?? {};
      if (lane.properties.laneHeaderWidth === undefined) {
        lane.properties.laneHeaderWidth = LANE_HEADER_W;
      }
      runningY += newH;
    }
  }

  // Auto-detect poolType. A pool is *white-box* if either (a) it has at
  // least one Lane child via parentId, or (b) its bounding box on canvas
  // geometrically contains another classified non-pool element. Otherwise
  // *black-box*. This catches TPB-Client-Services-style pools that hold
  // tasks/events directly without an explicit Lane band, which the
  // lane-count check alone would mis-classify as black-box.
  const laneCountByPool = new Map<string, number>();
  for (const e of elements) {
    if (e.type === "lane" && e.parentId) {
      laneCountByPool.set(e.parentId, (laneCountByPool.get(e.parentId) ?? 0) + 1);
    }
  }
  function geometricallyContainsAny(pool: DiagramElement): boolean {
    const px1 = pool.x;
    const py1 = pool.y;
    const px2 = pool.x + pool.width;
    const py2 = pool.y + pool.height;
    for (const e of elements) {
      if (e === pool) continue;
      if (e.type === "pool") continue;          // pools-in-pools handled by parentage
      const ex = e.x + e.width / 2;
      const ey = e.y + e.height / 2;
      if (ex >= px1 && ex <= px2 && ey >= py1 && ey <= py2) return true;
    }
    return false;
  }
  for (const e of elements) {
    if (e.type !== "pool") continue;
    if (e.properties.poolType !== undefined) continue;   // explicit (System Pool / Pool + N Lanes / Black-Box etc.)
    const hasLanes = (laneCountByPool.get(e.id) ?? 0) > 0;
    e.properties.poolType = (hasLanes || geometricallyContainsAny(e))
      ? "white-box"
      : "black-box";
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
    // Skip sub-shapes that reference a parent master via MasterShape — these
    // are decorations of an already-classified parent (e.g. Shape 299
    // `NameU='CFF Container.44'` `MasterShape='6'` inside the real Customer
    // Black-Box Pool). They carry the parent's BpmnName as a property
    // (e.g. "Customer"), so the label test passes and the importer would
    // synthesise a phantom black-box pool at the wrong (sub-shape) page
    // position. Same shape that we already skip in the classification
    // loop above — extend the skip here so the glue-target fallback
    // doesn't quietly resurrect it.
    const headForSub = outerHead(wp.block);
    const hasMasterAttr = /\sMaster='\d+'/.test(wp.block.slice(0, wp.block.indexOf(">") + 1));
    const hasMasterShape = /MasterShape='\d+'/.test(wp.block.slice(0, wp.block.indexOf(">") + 1));
    if (!hasMasterAttr && hasMasterShape) continue;
    void headForSub;
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
      const sFmt = sourceShape ? `src=shape ${sourceShape}` : "src=(no glue)";
      const tFmt = targetShape ? `tgt=shape ${targetShape}` : "tgt=(no glue)";
      const why = !sourceShape && !targetShape
        ? "no Connect row and no glue formula"
        : !sourceShape ? "no source glue"
        : !targetShape ? "no target glue"
        : !sourceId ? `source shape ${sourceShape} not in element list`
        : `target shape ${targetShape} not in element list`;
      warnings.push(
        `Skipped connector ${r.shapeId} (${r.nameU}) [${sFmt}, ${tFmt}] — ${why}.`,
      );
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

    // Determine sourceSide / targetSide / sourceOffsetAlong from the actual
    // begin/end positions relative to the source/target shapes. The default
    // hardcode of right/left is wrong for vertical message flows between
    // pools (which need top/bottom) and for any connector whose visible
    // endpoint sits on a non-right edge.
    let resolvedSourceSide: "top" | "right" | "bottom" | "left" = "right";
    let resolvedTargetSide: "top" | "right" | "bottom" | "left" = "left";
    let resolvedSourceOffset: number | undefined;
    let resolvedTargetOffset: number | undefined;
    function sideAndOffset(rect: { x: number; y: number; width: number; height: number }, p: Point) {
      // Pick the closest edge to p (in pixel space).
      const dLeft = Math.abs(p.x - rect.x);
      const dRight = Math.abs(p.x - (rect.x + rect.width));
      const dTop = Math.abs(p.y - rect.y);
      const dBot = Math.abs(p.y - (rect.y + rect.height));
      const min = Math.min(dLeft, dRight, dTop, dBot);
      let side: "top" | "right" | "bottom" | "left";
      let offset: number;
      if (min === dTop && rect.height > 0) {
        side = "top";
        offset = (p.x - rect.x) / rect.width;
      } else if (min === dBot && rect.height > 0) {
        side = "bottom";
        offset = (p.x - rect.x) / rect.width;
      } else if (min === dLeft && rect.width > 0) {
        side = "left";
        offset = (p.y - rect.y) / rect.height;
      } else {
        side = "right";
        offset = (p.y - rect.y) / Math.max(1, rect.height);
      }
      // Clamp to the same range Diagramatix uses internally so subsequent
      // nudges don't immediately re-clamp the imported value.
      offset = Math.max(0.02, Math.min(0.98, offset));
      return { side, offset };
    }
    if (sourceEl && waypoints.length >= 1) {
      const so = sideAndOffset(sourceEl, waypoints[0]);
      resolvedSourceSide = so.side;
      resolvedSourceOffset = so.offset;
    }
    if (targetEl && waypoints.length >= 1) {
      const to = sideAndOffset(targetEl, waypoints[waypoints.length - 1]);
      resolvedTargetSide = to.side;
      resolvedTargetOffset = to.offset;
    }

    // Read the original Visio label position (TxtPinX/TxtPinY, page-absolute
    // after the connector-frame transform) and convert to a Diagramatix
    // labelOffsetX/Y relative to the visual midpoint (or source endpoint
    // for "source"-anchored labels — but the importer always uses
    // "midpoint" anchor).
    const txtPinXLocal = readCellNum(head, "TxtPinX");
    const txtPinYLocal = readCellNum(head, "TxtPinY");
    let labelOffsetX = 0;
    let labelOffsetY = 0;
    if (label && txtPinXLocal != null && txtPinYLocal != null && waypoints.length >= 2) {
      // TxtPin is in the connector's local frame (same frame as the
      // Geometry MoveTo/LineTo rows: origin at bottom-left of the
      // connector's bounding box, Y up).
      const labelPageX = (localOrigX + txtPinXLocal) * PX_PER_INCH;
      const labelPageY = (pageH - (localOrigY + txtPinYLocal)) * PX_PER_INCH;
      const visStart = 0;
      const visEnd = waypoints.length - 1;
      const midX = (waypoints[visStart].x + waypoints[visEnd].x) / 2;
      const midY = (waypoints[visStart].y + waypoints[visEnd].y) / 2;
      labelOffsetX = labelPageX - midX;
      labelOffsetY = labelPageY - midY;
    }

    // For messageBPMN connectors, Diagramatix's drag-handle UI requires
    // exactly 4 waypoints with both invisibleLeader flags TRUE
    // (Canvas.tsx:4410 — `selectedConnector.waypoints.length === 4`).
    // Imported messages carry raw Visio waypoints (2-N points) with both
    // leader flags FALSE, so the drag handle never appears and the user
    // can't move the attachment point. Rewrite to canonical 4-point
    // format: [srcCentre, srcEdge, tgtEdge, tgtCentre].
    //
    // Important: pull srcEdge/tgtEdge X from the RAW Visio waypoints, NOT
    // from the clipped midpoint that `clipToRectEdge` produces. clipToRect-
    // Edge collapses every endpoint to its rectangle's edge midpoint, so
    // 3 different message connectors all targeting the same pool's top
    // edge would attach at identical (cx, top) — visually all three
    // overlap at the pool's centre-top. Visio messages preserve a
    // per-connector shared X (vertical line); we want to keep that.
    let finalWaypoints: Point[] = waypoints;
    let sourceInvisibleLeader = false;
    let targetInvisibleLeader = false;
    if (r.connectorBase === "messageBPMN" && sourceEl && targetEl && rawWPs.length >= 1) {
      // Shared vertical X from the raw connector geometry: average of the
      // first and last raw waypoint x coords (Visio messages are vertical,
      // so these match anyway — averaging is just defensive against
      // diagonal noise).
      const rawSrcX = rawWPs[0].x;
      const rawTgtX = rawWPs[rawWPs.length - 1].x;
      const sharedX = (rawSrcX + rawTgtX) / 2;
      // Determine which sides face the OTHER shape so we know top vs bot.
      // Source is "above" target (in screen coords) if sourceY < targetY;
      // then srcSide=bottom, tgtSide=top. Otherwise reversed.
      const srcAbove = sourceEl.y + sourceEl.height / 2 < targetEl.y + targetEl.height / 2;
      const srcEdgeY = srcAbove ? sourceEl.y + sourceEl.height : sourceEl.y;
      const tgtEdgeY = srcAbove ? targetEl.y : targetEl.y + targetEl.height;
      // Clamp the shared X to BOTH shapes' x-extents so the vertical line
      // actually lands inside both endpoints (Visio occasionally writes
      // BeginX slightly outside the source bbox; rejecting that prevents
      // the drag-handle from appearing outside the shape).
      const minX = Math.max(sourceEl.x, targetEl.x);
      const maxX = Math.min(sourceEl.x + sourceEl.width, targetEl.x + targetEl.width);
      const x = Math.max(minX, Math.min(maxX, sharedX));
      const srcEdge = { x, y: srcEdgeY };
      const tgtEdge = { x, y: tgtEdgeY };
      const srcCentre = { x: sourceEl.x + sourceEl.width / 2, y: sourceEl.y + sourceEl.height / 2 };
      const tgtCentre = { x: targetEl.x + targetEl.width / 2, y: targetEl.y + targetEl.height / 2 };
      finalWaypoints = [srcCentre, srcEdge, tgtEdge, tgtCentre];
      sourceInvisibleLeader = true;
      targetInvisibleLeader = true;
      // Recompute side+offset from the actual edge points we just picked,
      // so sourceOffsetAlong / targetOffsetAlong line up with the visible
      // attachment (the earlier sideAndOffset call used the clipped
      // midpoint and would now be inconsistent).
      resolvedSourceSide = srcAbove ? "bottom" : "top";
      resolvedTargetSide = srcAbove ? "top" : "bottom";
      resolvedSourceOffset = sourceEl.width > 0
        ? Math.max(0.02, Math.min(0.98, (x - sourceEl.x) / sourceEl.width))
        : 0.5;
      resolvedTargetOffset = targetEl.width > 0
        ? Math.max(0.02, Math.min(0.98, (x - targetEl.x) / targetEl.width))
        : 0.5;
    }

    const connector: Connector = {
      id: connId,
      sourceId,
      targetId,
      sourceSide: resolvedSourceSide,
      targetSide: resolvedTargetSide,
      type: r.connectorBase,
      directionType: "directed",
      routingType: "rectilinear",
      sourceInvisibleLeader,
      targetInvisibleLeader,
      waypoints: finalWaypoints,
      label: label || undefined,
      labelAnchor: "midpoint",
      labelOffsetX,
      labelOffsetY,
      sourceOffsetAlong: resolvedSourceOffset,
      targetOffsetAlong: resolvedTargetOffset,
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

  // Align lanes to their parent pool's body left edge. Visio CFF lanes
  // can land slightly offset from the pool body (often ~10 px gap or
  // overlap with the pool header). Snap each lane.x to pool.x +
  // headerWidth so the lane's left edge sits flush against the right
  // side of the pool's header strip — matching BPMN convention.
  for (const lane of elements) {
    if (lane.type !== "lane" || !lane.parentId) continue;
    const pool = elements.find((e) => e.id === lane.parentId);
    if (!pool || pool.type !== "pool") continue;
    const headerW = (pool.properties.poolHeaderWidth as number | undefined) ?? 36;
    const desiredX = pool.x + headerW;
    const desiredW = pool.width - headerW;
    if (Math.abs(lane.x - desiredX) > 0.5) lane.x = desiredX;
    if (Math.abs(lane.width - desiredW) > 0.5) lane.width = Math.max(lane.width, desiredW);
  }

  // Aggregate duplicate pools: when two or more pools share the same
  // (case-insensitive) label AND their bounding boxes overlap by ≥ 25 %
  // of the smaller pool, treat them as the SAME pool. This handles the
  // Microsoft CFF "layered template" structure where one logical pool
  // shows up as two visually-stacked shapes (e.g. an outer black-box +
  // an inner title band, both labelled "iMIS"). Keep the LARGEST pool;
  // redirect every connector that referenced any duplicate to the kept
  // one; drop the duplicates.
  function rectsOverlapFraction(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): number {
    const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const inter = ix * iy;
    if (inter === 0) return 0;
    const aArea = a.width * a.height;
    const bArea = b.width * b.height;
    return inter / Math.min(aArea, bArea);
  }
  const poolsByLabel = new Map<string, DiagramElement[]>();
  for (const e of elements) {
    if (e.type !== "pool") continue;
    const key = e.label.trim().toLowerCase();
    if (!key) continue;
    const list = poolsByLabel.get(key) ?? [];
    list.push(e);
    poolsByLabel.set(key, list);
  }
  const mergedAwayIds = new Map<string, string>();    // dropped poolId → kept poolId
  for (const [, list] of poolsByLabel) {
    if (list.length < 2) continue;
    // Pick the keeper as the LARGEST by area (most visually meaningful).
    list.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const keeper = list[0];
    for (let i = 1; i < list.length; i++) {
      const other = list[i];
      const overlap = rectsOverlapFraction(keeper, other);
      if (overlap < 0.25) continue;                   // not the same pool — leave alone
      mergedAwayIds.set(other.id, keeper.id);
    }
  }
  if (mergedAwayIds.size > 0) {
    // Redirect connectors.
    for (const c of connectors) {
      const newSrc = mergedAwayIds.get(c.sourceId);
      const newTgt = mergedAwayIds.get(c.targetId);
      if (newSrc) c.sourceId = newSrc;
      if (newTgt) c.targetId = newTgt;
    }
    // Drop the absorbed pools.
    for (let i = elements.length - 1; i >= 0; i--) {
      if (mergedAwayIds.has(elements[i].id)) elements.splice(i, 1);
    }
    // Clear any lane.parentId pointing at an absorbed pool — point at the keeper.
    for (const e of elements) {
      if (e.parentId && mergedAwayIds.has(e.parentId)) e.parentId = mergedAwayIds.get(e.parentId);
    }
  }

  // Re-snap connector endpoints to source/target edge midpoints AFTER
  // the pool merge (otherwise endpoints still pointed at the absorbed
  // pool's edges). Also drop any zero-length / degenerate connectors
  // that ended up collapsed onto a single point.
  for (const c of connectors) {
    const srcEl = elements.find((e) => e.id === c.sourceId);
    const tgtEl = elements.find((e) => e.id === c.targetId);
    if (!srcEl || !tgtEl || c.waypoints.length < 2) continue;
    const srcCentre = { x: srcEl.x + srcEl.width / 2, y: srcEl.y + srcEl.height / 2 };
    const tgtCentre = { x: tgtEl.x + tgtEl.width / 2, y: tgtEl.y + tgtEl.height / 2 };
    c.waypoints[0] = clipToRectEdge(srcEl, tgtCentre);
    c.waypoints[c.waypoints.length - 1] = clipToRectEdge(tgtEl, srcCentre);
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

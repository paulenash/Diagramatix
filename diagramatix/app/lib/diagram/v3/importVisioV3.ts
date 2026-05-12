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
import { recomputeAllConnectors } from "../routing";
import { wrapText as wrapTextShared } from "../textMetrics";
import { listVisioPages } from "./visioPages";

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
  /** First non-empty `<Text>` block from the master's content. Used as
   *  a last-resort fallback for the element label when the instance
   *  shape has no Text and no BpmnName property — covers the "user
   *  dropped a shape from the stencil and didn't rename it" pattern
   *  (concrete: v5.1 Exclusive Gateway master defaults to "Decision?").
   *  Empty string when the master has no default text. */
  defaultText?: string;
  /** Master's BPMN-property values (the `<Section N='Property'>` rows).
   *  Used as a fallback for property reads when an instance shape
   *  doesn't override the property locally — concrete v5.1 case: the
   *  Exclusive Gateway master sets `BpmnMarkerVisible="0"` to mean
   *  "default to plain diamond, no X marker"; instance shapes inherit
   *  this and don't carry their own copy. Without this fallback the
   *  classifier sees `props.BpmnMarkerVisible === undefined` and can't
   *  honour the master's intent. */
  bpmnProps?: Record<string, string>;
  /** Master's `TxtPinX` / `TxtPinY` cells from its root Shape 5. Used
   *  as a fallback when an instance shape doesn't override its text-
   *  block position. Visio stencil masters define a per-shape default
   *  label location (e.g. v5.1's Exclusive Gateway puts the label
   *  upper-left of the diamond; Parallel Gateway places it below) that
   *  instances inherit unless the user explicitly drags the label.
   *  Values are in inches, local to the shape's bottom-left corner,
   *  Y-axis pointing UP (Visio convention). */
  txtPinX?: number;
  txtPinY?: number;
  /** Master's `TxtWidth` cell. The width of the text block in inches.
   *  Used to derive the renderer's `labelWidth` so multi-line labels
   *  wrap the same way they do in Visio. v5.1 gateway masters set this
   *  to 0.8333 in (80 px) so labels like "Investigate Further?" wrap
   *  to two lines. */
  txtWidth?: number;
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
  repeatType?: "loop" | "mi-sequential" | "mi-parallel";
  interruptionType?: "interrupting" | "non-interrupting";
  /** Set when the master NameU itself declares the shape is meant to be
   *  edge-mounted on a subprocess (v5.1 stencil's "Edge Cancel Event",
   *  "Edge Start", etc.). Boundary-event detection uses this as a strong
   *  signal — far wider tolerance than the geometric heuristic — since
   *  the master name is unambiguous intent. */
  forceBoundary?: boolean;
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
  // Visio's built-in toolbar connector. Common in BPMN diagrams drawn
  // without using the stencil's Sequence Flow master — every line drawn
  // with the line tool from the toolbar gets master "Dynamic Connector".
  // Treat them as sequence flows so they import.
  "Dynamic Connector":          "sequence",
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
  // CRITICAL: row-bounded extraction. Visio rows often carry ONLY a
  // `<Cell N='Invisible'>` (no Value) — e.g. `BpmnTaskType` on a
  // Sub-Process. A cross-row lazy `[\s\S]*?` would silently consume the
  // NEXT row's Value cell, e.g. wrongly assigning BpmnIsCollapsed='1' to
  // BpmnTaskType. Match each `<Row>…</Row>` first, then pull the Value
  // cell from inside it.
  const propSec = block.match(/<Section N='Property'>([\s\S]*?)<\/Section>/);
  if (!propSec) return result;
  const rowRe = /<Row\s+N='(\w+)'>([\s\S]*?)<\/Row>/g;
  let m;
  while ((m = rowRe.exec(propSec[1])) !== null) {
    const v = m[2].match(/<Cell\s+N='Value'\s+V='([^']*)'/);
    if (v) result[m[1]] = v[1];
  }
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

/** Read a `User.<rowName>` cell's V= value from the OUTER head of a shape
 *  block. BPMN_M / CFF (Cross-Functional Flowchart) files use specific
 *  User-section rows as authoritative structural metadata:
 *
 *   `User.msvShapeCategories` — semicolon-separated tags. Contains
 *      "CFF Container" on outer pool wrappers and "Lane"/"Swimlane" on
 *      lane shapes. This is THE reliable Pool-vs-Lane signal — it's set
 *      by Visio's CFF machinery, not by guesswork on master names.
 *   `User.numLanes` — present on CFF Container outer pools; integer ≥ 1
 *      when the container holds at least one lane.
 *   `User.visHeadingText` — the lane's display label (rotated 90° in the
 *      sidebar of a horizontal pool). Often inherited from the lane's
 *      heading sub-shape's text.
 *
 *  Returns null when the row exists but Visio writes only an Inh formula
 *  with no cached V — caller should fall back to a Property cell.
 */
function readUserCellValue(block: string, rowName: string): string | null {
  const head = outerHead(block);
  const userSec = head.match(/<Section\s+N='User'>([\s\S]*?)<\/Section>/);
  if (!userSec) return null;
  const re = new RegExp(`<Row\\s+N='${rowName}'>\\s*<Cell\\s+N='Value'\\s+V='([^']*)'`);
  const m = userSec[1].match(re);
  return m?.[1] ?? null;
}

/** Find Sheet.N references in a shape block. BPMN_M lanes carry formulas
 *  like `Sheet.5!User.visCFFStyle` that point at their owning pool's
 *  master sheet — the N is the parent pool's shape ID. Returns each
 *  referenced sheet ID once, in order of first appearance. The shape's
 *  own sheet ID is filtered out by the caller.
 */
function readSheetRefs(block: string): string[] {
  const head = outerHead(block);
  const re = /Sheet\.(\d+)!/g;
  const seen = new Set<string>();
  const out: string[] = [];
  let m;
  while ((m = re.exec(head)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
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
      // Normalise Windows / classic-Mac line endings to plain "\n" — Visio
      // writes "\r\n" inside multi-line labels (e.g. "Data Entry\r\nTeam"),
      // but Diagramatix's lane / task renderer expects "\n" only. The
      // mismatch is harmless visually but makes JSON diffs noisy.
      .replace(/\r\n?/g, "\n")
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
    // Master's default text — the first non-empty `<Text>` block in the
    // master file (covers both the root Shape 5 and any nested
    // sub-shape carrying the visible label). `readText` does the same
    // stripping the instance walker uses, so the result is comparable
    // to what a user would see in Visio.
    const defaultText = readText(masterXml);
    // Master's BPMN-property values — feed forward to classifier as a
    // fallback when the instance shape doesn't override the property.
    // Reuse the same row-bounded reader that processes instance blocks.
    const bpmnProps = readPropValues(masterXml);
    // Master's TxtPinX / TxtPinY — default label position relative to
    // the shape (Visio local coords, inches, Y-up). Instances inherit
    // these unless the user explicitly repositioned the label.
    // TxtWidth — default text-block width in inches; drives label wrap.
    const txtPinX = readCellNum(head5, "TxtPinX") ?? undefined;
    const txtPinY = readCellNum(head5, "TxtPinY") ?? undefined;
    const txtWidth = readCellNum(head5, "TxtWidth") ?? undefined;
    if (masterWidth || masterHeight || defaultText
        || Object.keys(bpmnProps).length > 0
        || txtPinX !== undefined || txtPinY !== undefined
        || txtWidth !== undefined) {
      masters.set(id, { ...info, masterWidth, masterHeight, defaultText, bpmnProps, txtPinX, txtPinY, txtWidth });
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
  // Visio's generic toolbar connector — treat as sequence flow so
  // BPMN diagrams drawn without using a stencil's Sequence Flow
  // master still wire up correctly.
  if (n.includes("dynamic connector")) return "sequence";
  return null;
}

/** Last-ditch element classification by substring — for files using
 *  custom or localised stencils whose NameUs aren't in the exact-match
 *  table. Order matters: more specific terms before generic ones. */
function fuzzyClassifyElement(nameU: string): ElementSeed | null {
  const n = nameU.toLowerCase();
  // ── Diagramatix v5.1 Edge-event masters ────────────────────────────
  // v5.1 ships dedicated boundary-event masters with the prefix "Edge"
  // (e.g. "Edge Cancel Event", "Edge Time out Event"). The NameU itself
  // declares boundary intent, so we set forceBoundary and let the
  // boundary-detection pass mount them on the nearest subprocess.
  // Order matters — "Edge Start" must beat the generic " start" rule,
  // "Edge End" must beat " end", and the typed Edge intermediates must
  // beat the generic "Edge ... Event" rule.
  if (n.includes("edge cancel"))                              return { type: "intermediate-event", eventType: "cancel",   forceBoundary: true };
  if (n.includes("edge error") || n.includes("edge exception")) return { type: "intermediate-event", eventType: "error",    forceBoundary: true };
  if (n.includes("edge time") || n.includes("edge timer"))    return { type: "intermediate-event", eventType: "timer",    forceBoundary: true };
  if (n.includes("edge message"))                             return { type: "intermediate-event", eventType: "message",  forceBoundary: true };
  if (n.includes("edge signal"))                              return { type: "intermediate-event", eventType: "signal",   forceBoundary: true };
  if (n.includes("edge compensation"))                        return { type: "intermediate-event", eventType: "compensation", forceBoundary: true };
  if (n.includes("edge escalation"))                          return { type: "intermediate-event", eventType: "escalation",  forceBoundary: true };
  if (n.includes("edge conditional"))                         return { type: "intermediate-event", eventType: "conditional", forceBoundary: true };
  if (n.includes("edge link"))                                return { type: "intermediate-event", eventType: "link",     forceBoundary: true };
  if (n === "edge start" || n.startsWith("edge start"))       return { type: "start-event",        forceBoundary: true };
  if (n === "edge end" || n.startsWith("edge end"))           return { type: "end-event",          forceBoundary: true };
  if (n.includes("edge-mounted") || (n.includes("edge") && n.includes("intermediate")))
                                                              return { type: "intermediate-event", forceBoundary: true };

  // Pools and lanes — Visio cross-functional flowchart files often use
  // names like "Functional Band", "Swimlane" etc. for what we treat as
  // a Pool's lane stripe.
  if (n.includes("black-box") || n.includes("black box")) return { type: "pool", poolType: "black-box" };
  if (n.includes("pool")) return { type: "pool" };
  if (n.includes("swimlane") || n.includes("functional band")) return { type: "lane" };
  if (n.includes("lane")) return { type: "lane" };
  // Subprocesses (check before "process" so "Sub-Process" wins).
  if (n.includes("expanded sub")) return { type: "subprocess-expanded" };
  if (n.includes("call collapsed sub") || n.includes("call sub")) return { type: "subprocess", subprocessType: "call" };
  if (n.includes("collapsed sub") || n.includes("sub-process") || n.includes("subprocess")) return { type: "subprocess" };
  // Gateways
  if (n.includes("exclusive gateway")) return { type: "gateway", gatewayType: "exclusive" };
  if (n.includes("inclusive")) return { type: "gateway", gatewayType: "inclusive" };
  if (n.includes("parallel gateway")) return { type: "gateway", gatewayType: "parallel" };
  if (n.includes("event gateway") || n.includes("event-based")) return { type: "gateway", gatewayType: "event-based" };
  // v5.1's "Merge" master is the plain diamond (no X marker). Map it
  // explicitly to gatewayType "none" so the BPMN_M property-override
  // pass below (which reads BpmnGatewayType="Exclusive" from the Merge
  // master and would otherwise turn it into a gateway-with-X) doesn't
  // upgrade it.
  if (n === "merge" || n.endsWith(" merge")) return { type: "gateway", gatewayType: "none" };
  if (n.includes("gateway")) return { type: "gateway" };
  // Trigger-typed Start / Intermediate events — v5.1 names like
  // "Start with Timer", "Receive Message Start", "Send Message End Event"
  // carry the trigger directly in the master name. Match these BEFORE
  // the generic Start/End rules so the eventType isn't lost.
  if (n.includes("start with timer") || n === "timer start")         return { type: "start-event",        eventType: "timer" };
  if (n.includes("receive message start") || n.includes("message start") || n.includes("start with message"))
                                                                     return { type: "start-event",        eventType: "message" };
  if (n.includes("send message end") || n.includes("message end"))   return { type: "end-event",          eventType: "message", flowType: "throwing" };
  if (n === "send message" || n.endsWith(" send message"))           return { type: "intermediate-event", eventType: "message", flowType: "throwing" };
  if (n === "receive message" || n.endsWith(" receive message"))     return { type: "intermediate-event", eventType: "message" };
  if (n === "timer" || n.endsWith(" timer"))                         return { type: "intermediate-event", eventType: "timer" };
  if (n === "link out" || n.endsWith(" link out"))                   return { type: "intermediate-event", eventType: "link", flowType: "throwing" };
  if (n === "link in" || n.endsWith(" link in"))                     return { type: "intermediate-event", eventType: "link" };
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
  if (n.includes("input data object")) return { type: "data-object", role: "input" };
  if (n.includes("output data object")) return { type: "data-object", role: "output" };
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

  // BpmnActivityType property override — promote a Task master to a
  // Sub-Process when the BPMN property says so. Visio's BPMN_M template
  // uses ONE physical "Task" master for both Tasks AND Sub-Processes,
  // distinguishing them only via `BpmnActivityType` + `BpmnIsCollapsed`
  // (and adding a marker icon to the bottom edge for loops / MI). Without
  // this promotion every Sub-Process with a marker imports as a plain
  // Task — the user-reported "P07.01 Check and re-Check Application" case.
  if (seed.type === "task" && props.BpmnActivityType === "Sub-Process") {
    seed.type = props.BpmnIsCollapsed === "1" ? "subprocess" : "subprocess-expanded";
  }
  // V3 round-trip: the export uses the same template master (33,
  // "Collapsed Sub-Process") for BOTH collapsed and expanded SPs — so
  // every subprocess initially classifies as "subprocess" (collapsed)
  // via the master NameU. The BpmnIsCollapsed property is the
  // authoritative discriminator; flip to subprocess-expanded when it's
  // explicitly "0". (Empty/missing keeps whatever the master indicated.)
  if (
    (seed.type === "subprocess" || seed.type === "subprocess-expanded") &&
    props.BpmnIsCollapsed != null && props.BpmnIsCollapsed !== ""
  ) {
    seed.type = props.BpmnIsCollapsed === "1" ? "subprocess" : "subprocess-expanded";
  }

  // BpmnLoopType → Diagramatix repeatType. Visio's BPMN_M template stores
  // the loop / multi-instance variant as a separate property; the marker
  // icon is rendered from it. Mapping table mirrors the export side's
  // SUBPROCESS_REPEAT_ACTION ([exportVisioV3.ts:1636](./exportVisioV3.ts)).
  const LOOP_TYPE_MAP: Record<string, "loop" | "mi-sequential" | "mi-parallel"> = {
    "Standard": "loop",
    "SequentialMultiInstance": "mi-sequential",
    "ParallelMultiInstance": "mi-parallel",
    "Sequential": "mi-sequential",
    "Parallel": "mi-parallel",
  };
  if (props.BpmnLoopType && LOOP_TYPE_MAP[props.BpmnLoopType]) {
    seed.repeatType = LOOP_TYPE_MAP[props.BpmnLoopType];
  }

  // Bpmn property overrides
  if (props.BpmnTaskType && BPMN_TASK_TYPE[props.BpmnTaskType]) {
    seed.taskType = BPMN_TASK_TYPE[props.BpmnTaskType];
  }
  // Gateway classification — two-step:
  //
  //   1. BpmnGatewayType property override fires only when the fuzzy
  //      classifier didn't already pin down a gatewayType from the
  //      master NameU. Diagramatix-style stencils (v1.x, v5.1) often
  //      have SEPARATE masters for "Exclusive Gateway" vs "Merge" while
  //      both set `BpmnGatewayType="Exclusive"` on the master; the
  //      master NameU carries the visual signal and must win or every
  //      "Merge" would render with the X marker.
  //
  //   2. BpmnMarkerVisible="0" universally downgrades an "exclusive"
  //      gatewayType to "none" (plain diamond), regardless of how
  //      gatewayType was set. v5.1's "Exclusive Gateway" master is a
  //      universal gateway master whose marker sub-shape is gated by
  //      `NOT(Sheet.5!Actions.ExclusiveDataWithMarker.Checked)` — the
  //      master defaults to plain diamond and `BpmnMarkerVisible="0"`
  //      reflects this. Because the master's bpmnProps are merged into
  //      `props` at the call site, this check sees the master's "0"
  //      even when the instance doesn't override.
  const fuzzyPickedGatewayType = seed.type === "gateway" && !!seed.gatewayType;
  if (!fuzzyPickedGatewayType
      && props.BpmnGatewayType && BPMN_GATEWAY_TYPE[props.BpmnGatewayType]) {
    seed.gatewayType = BPMN_GATEWAY_TYPE[props.BpmnGatewayType];
  }
  if (seed.type === "gateway"
      && seed.gatewayType === "exclusive"
      && props.BpmnMarkerVisible === "0") {
    seed.gatewayType = "none";
  }
  if (props.BpmnTriggerOrResult && BPMN_EVENT_TRIGGER[props.BpmnTriggerOrResult]) {
    seed.eventType = BPMN_EVENT_TRIGGER[props.BpmnTriggerOrResult];
  }
  if (props.BpmnEventType?.includes("Throwing")) seed.flowType = "throwing";
  else if (props.BpmnEventType?.includes("Catching")) seed.flowType = "catching";

  // Visio's BpmnEventType carries the interruption mode in parentheses —
  // e.g. "Start (Non-Interrupting)" or "Intermediate (Non-Interrupting)".
  // Diagramatix represents this as `properties.interruptionType` (default
  // "interrupting"). Applies to start-event and intermediate-event only.
  if (
    (seed.type === "start-event" || seed.type === "intermediate-event") &&
    props.BpmnEventType?.includes("Non-Interrupting")
  ) {
    seed.interruptionType = "non-interrupting";
  }

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

export async function importVisioV3(
  buffer: ArrayBuffer,
  pageIndex: number = 0,
): Promise<ImportResult> {
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(buffer);

  const masters = await loadMasterIndex(zip);

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
  // Resolve the requested page index → physical file via the shared
  // page-enumeration helper. For pageIndex=0 (default), this matches the
  // legacy first-page behaviour.
  const pages = await listVisioPages(buffer);
  if (pages.length === 0) {
    return {
      data: { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } },
      warnings: ["No usable pages in pages.xml — nothing to import."],
      stats: emptyStats,
    };
  }
  if (pageIndex < 0 || pageIndex >= pages.length) {
    return {
      data: { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } },
      warnings: [`Page index ${pageIndex} out of range (file has ${pages.length} pages).`],
      stats: emptyStats,
    };
  }
  const targetPage = pages[pageIndex];
  const pageFile = targetPage.fileName;

  const pageXml = await zip.file(`visio/pages/${pageFile}`)?.async("string");
  if (!pageXml) {
    return {
      data: { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } },
      warnings: [...warnings, `Page file ${pageFile} not found.`],
      stats: emptyStats,
    };
  }

  // Page dimensions: pull from the N-th non-background <Page> block in
  // pages.xml. listVisioPages applies the same background filter, so
  // pageIndex maps 1:1 to the corresponding block.
  const allPageBlocks = pagesXml.match(/<Page\b[^>]*>[\s\S]*?<\/Page>/g) ?? [];
  let visibleIdx = 0;
  let pagePropsBlock = "";
  for (const block of allPageBlocks) {
    if (/\bBackground=["']1["']/.test(block)) continue;
    if (visibleIdx === pageIndex) { pagePropsBlock = block; break; }
    visibleIdx++;
  }
  const pageW = readCellNum(pagePropsBlock, "PageWidth") ?? 11.69;
  const pageH = readCellNum(pagePropsBlock, "PageHeight") ?? 8.27;
  void pageW; void targetPage; // pageW available for future centring; targetPage carries metadata for caller logging.

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
    // When the user has explicitly renamed a shape (Visio sets
    // `IsCustomNameU='1'` on the shape's opening tag), trust the inline
    // NameU over the master's name. Common Visio pattern: drop the
    // toolbar's Dynamic Connector, then rename it "Sequence Flow" — the
    // shape opens as `Master='36' NameU='Sequence Flow' IsCustomNameU='1'`.
    // Without this preference the importer reads the master's name
    // ("Dynamic Connector"), misses the connector classification, and
    // skips the shape.
    const isCustomInline = /<Shape\s+ID='\d+'[^>]*\sIsCustomNameU='1'/.test(block.slice(0, block.indexOf(">") + 1));
    const nameU = normaliseNameU(
      isCustomInline && inlineNameU
        ? inlineNameU
        : masterInfo?.nameU || inlineNameU,
    );
    const instanceProps = readPropValues(block);
    // Merge master defaults with instance overrides — instance wins.
    // This makes inherited BPMN properties (e.g. v5.1 Exclusive Gateway
    // master's `BpmnMarkerVisible="0"` which the instance doesn't carry)
    // visible to the classifier on a property read. Without this, the
    // classifier sees only instance-level properties and can't honour
    // master-level defaults.
    const props: Record<string, string> = {
      ...(masterInfo?.bpmnProps ?? {}),
      ...instanceProps,
    };
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

    let connectorBase = isConnectorMaster(nameU);
    let seed = connectorBase ? null : classifyElement(nameU, props);

    // FALLBACK to master NameU when the inline NameU was used (via
    // IsCustomNameU='1') but didn't classify. V3 round-trip writes the
    // shape's NameU as the user-visible LABEL (e.g. "General Process",
    // "Email Arrives") and marks IsCustomNameU='1' — the master still
    // carries the right BPMN type (Sub-Process, Start Event…). Without
    // this fallback, every shape from a V3-exported .vsdx skips because
    // its label isn't a recognised BPMN type name. The fallback only
    // fires when the inline route was actually taken AND it failed, so
    // the legitimate user-rename case (e.g. "Dynamic Connector" master →
    // user-renamed to "Sequence Flow") still wins.
    if (!connectorBase && !seed && isCustomInline && masterInfo?.nameU) {
      const masterNameU = normaliseNameU(masterInfo.nameU);
      if (masterNameU && masterNameU !== nameU) {
        connectorBase = isConnectorMaster(masterNameU);
        seed = connectorBase ? null : classifyElement(masterNameU, props);
      }
    }

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

  // ── BPMN_M structural metadata pass — RUNS BEFORE geometric heuristics.
  //
  // Visio's BPMN_M / CFF (Cross-Functional Flowchart) template stamps
  // every pool/lane with deliberate structural tags that are far more
  // reliable than name-based or bbox-based guessing:
  //
  //   • A shape's `User.msvShapeCategories` cell carries semicolon-
  //     separated structural roles. Lanes have "Swimlane;Lane" (with
  //     an optional ";DoNotContain"). The outer pool wrapper is a CFF
  //     Container, identified by its master rather than this cell.
  //   • A CFF Container with a `User.numLanes` value ≥ 1 IS a pool —
  //     the cell counts the lane children directly.
  //   • Each lane carries `Sheet.N!`-prefixed formula references
  //     pointing at its owning pool's sheet. e.g. a lane's
  //     `User.visCFFStyle` row reads `Sheet.5!User.visCFFStyle` →
  //     N=5 → the lane's parent pool is the shape with ID 5.
  //
  // Using these signals fixes a class of bugs the geometric heuristics
  // produced repeatedly: floating-point noise flipping pools to lanes
  // (the Customer pool case), single-lane pools getting absorbed into
  // a labelled twin (the Salesforce / Applicant case), and lanes mis-
  // parented to off-screen Swimlane List wrappers (the Bank case).
  // Geometric fall-backs further down the file still run for non-CFF
  // files (hand-built Visio without BPMN_M) but defer to this pass
  // when its signals fire.
  const bpmnMPoolByShapeId = new Map<string, RawShape>();   // pool shapeId → RawShape
  const bpmnMLaneToPoolId = new Map<string, string>();      // lane shapeId → pool shapeId
  for (const r of raw) {
    if (r.seed?.type !== "pool") continue;
    const numLanes = readUserCellValue(r.block, "numLanes");
    const cats = readUserCellValue(r.block, "msvShapeCategories") ?? "";
    // CFF Container with numLanes ≥ 1 OR explicit "CFF Container"
    // category tag is a Pool wrapper.
    const isCffContainer = cats.includes("CFF Container") ||
      (numLanes !== null && parseInt(numLanes, 10) >= 1);
    if (isCffContainer) bpmnMPoolByShapeId.set(r.shapeId, r);
  }
  for (const r of raw) {
    if (r.seed?.type !== "pool") continue;
    const cats = readUserCellValue(r.block, "msvShapeCategories") ?? "";
    if (!cats.includes("Lane") && !cats.includes("Swimlane")) continue;
    // Authoritative LANE tag. Find its parent pool from Sheet.N refs.
    const sheetRefs = readSheetRefs(r.block);
    let parentPoolShapeId: string | null = null;
    for (const sid of sheetRefs) {
      if (sid === r.shapeId) continue;          // self-ref
      if (bpmnMPoolByShapeId.has(sid)) { parentPoolShapeId = sid; break; }
    }
    // Flip the lane's classification and remember the parentage so the
    // post-element-build pass can wire parentId without geometric guessing.
    if (r.seed) r.seed.type = "lane";
    if (parentPoolShapeId) bpmnMLaneToPoolId.set(r.shapeId, parentPoolShapeId);
  }
  // Promote BPMN_M lanes' parentage to the existing laneShapeIds set the
  // member-section-based pass already populates — same downstream effect.
  for (const laneId of bpmnMLaneToPoolId.keys()) laneShapeIds.add(laneId);
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
  // Geometric containment check for sibling-layout BPMN_M files: when
  // the page XML places the outer CFF Container, the Swimlane List, and
  // the Pool/Lane shapes (one for the pool header, one per lane) all
  // as TOP-LEVEL siblings — which Visio's standard BPMN_M template does
  // by default — the page-tree-parent check above never fires. Detect
  // it here: a Pool/Lane shape whose bbox is fully inside ANOTHER
  // Pool/Lane shape's bbox (with some margin for sub-pixel rounding)
  // is a lane within that outer pool.
  function bboxContains(outer: RawShape, inner: RawShape, margin = 0.05): boolean {
    const ox1 = outer.pageX - outer.width / 2;
    const oy1 = outer.pageY - outer.height / 2;
    const ox2 = outer.pageX + outer.width / 2;
    const oy2 = outer.pageY + outer.height / 2;
    const ix1 = inner.pageX - inner.width / 2;
    const iy1 = inner.pageY - inner.height / 2;
    const ix2 = inner.pageX + inner.width / 2;
    const iy2 = inner.pageY + inner.height / 2;
    // Require the inner shape's area to be MEANINGFULLY smaller — at
    // least 5%. Without this, Visio's per-instance floating-point
    // precision noise (e.g. one shape's width 8.556061351706299 vs
    // another's 8.556061351706301 — a 2×10⁻¹⁵ delta from the same
    // master scaling formula) makes a strict `<` comparison wrongly
    // declare two visually-identical shapes "one contains the other"
    // and silently flip the inner one to a lane.
    const innerArea = inner.width * inner.height;
    const outerArea = outer.width * outer.height;
    if (innerArea >= outerArea * 0.95) return false;
    return ix1 >= ox1 - margin && iy1 >= oy1 - margin
      && ix2 <= ox2 + margin && iy2 <= oy2 + margin;
  }
  // Candidate outer containers for the geometric containment check —
  // ANY classified pool counts. A common BPMN_M case has the outer pool
  // come in as a CFF Container (master 20) named "Bank", with the lane
  // rows authored as Pool/Lane (master 19) shapes living inside the
  // CFF Container's bbox; restricting the candidate set to Pool/Lane
  // names alone misses the CFF Container parent and leaves Processing
  // Centre / Help Desk classified as sibling pools instead of lanes.
  const allPoolRaws = raw.filter((r) => r.seed?.type === "pool");
  for (const r of raw) {
    if (r.seed?.type !== "pool" || !POOL_OR_LANE_NAMES.has(r.nameU)) continue;
    let isLane = laneShapeIds.has(r.shapeId);
    if (!isLane && r.parentShapeId) {
      const parent = rawByShapeId.get(r.parentShapeId);
      if (parent?.seed?.type === "pool" || parent?.seed?.type === "lane") {
        isLane = true;
      }
    }
    // Sibling-layout fallback: if any other classified pool contains us,
    // we're a lane inside it.
    if (!isLane) {
      for (const other of allPoolRaws) {
        if (other === r) continue;
        if (bboxContains(other, r)) { isLane = true; break; }
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
  // Visio's BPMN_M template defaults BpmnId='0' on lane and other masters
  // when the user hasn't assigned one. Treating "0" as a real ID makes
  // every lane collide on the same Diagramatix element.id, which silently
  // breaks `find(e => e.id === ...)` lookups: move-cascade picks the
  // first lane found, the other two appear orphaned and get clobbered
  // (root cause of the "top + bottom lanes vanish" symptom).
  const isPlaceholderBpmnId = (s: string | undefined): boolean =>
    !s || s.length === 0 || s === "0" || /^0+$/.test(s);
  const usedIds = new Set<string>();
  const mintId = (raw: string | undefined): string => {
    let id = isPlaceholderBpmnId(raw) ? nano() : raw!;
    while (usedIds.has(id)) id = nano();   // collision-proof against duplicates anywhere
    usedIds.add(id);
    return id;
  };

  const shapeIdToElId = new Map<string, string>();
  // Tracks elements whose master NameU explicitly declared they should be
  // boundary-mounted (v5.1's "Edge ..." masters). Read by the third-pass
  // boundary detection which uses a very wide tolerance for these
  // because the master name is unambiguous intent.
  const forceBoundaryElIds = new Set<string>();
  const elements: DiagramElement[] = [];
  for (const r of raw) {
    if (!r.seed) continue;
    const elId = mintId(r.bpmnId);
    shapeIdToElId.set(r.shapeId, elId);
    if (r.seed.forceBoundary) forceBoundaryElIds.add(elId);

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

    // Page-level <Text> wins; otherwise fall back to the BpmnName
    // Property (Pools and Lanes carry their label only on the per-
    // instance master, not the page shape, so for those types BpmnName
    // is the only source). FINAL fallback: the master's own default
    // text — covers "user dropped a shape from the stencil and never
    // renamed it" (e.g. v5.1 Exclusive Gateway defaults to "Decision?").
    const elMasterId = r.block.match(/Master='(\d+)'/)?.[1];
    const elMasterInfo = elMasterId ? masters.get(elMasterId) : undefined;
    const label = readText(r.block) || r.props.BpmnName || elMasterInfo?.defaultText || "";
    const properties: Record<string, unknown> = {};
    if (r.seed.subprocessType) properties.subprocessType = r.seed.subprocessType;
    if (r.seed.poolType) properties.poolType = r.seed.poolType;
    if (r.seed.role) properties.role = r.seed.role;
    if (r.seed.multiplicity) properties.multiplicity = r.seed.multiplicity;
    if (r.seed.interruptionType) properties.interruptionType = r.seed.interruptionType;
    // Visio's "System Pool" master signals a system participant in BPMN —
    // surface that as the canvas's `isSystem` flag (Black-Box variant).
    if (r.nameU === "System Pool") properties.isSystem = true;

    // ── Label position from Visio TxtPinX / TxtPinY ────────────────────
    // Diagramatix's SymbolRenderer honours `properties.labelOffsetX/Y`
    // on gateways, events and data shapes — labels are centred + shifted
    // horizontally by labelOffsetX, and positioned at `element.bottom +
    // labelOffsetY` for the label TOP. Convert Visio's TxtPin (local
    // shape-bottom-left origin, Y-up, inches) to that convention so the
    // imported label appears where the .vsdx places it.
    //
    // The fallback chain mirrors `defaultText`: instance head wins;
    // otherwise master's value (from `MasterInfo.txtPinX/Y`). Skipped
    // entirely for shape types whose label position isn't user-
    // controllable in the renderer (pool/lane/subprocess/task — their
    // labels are auto-positioned per type semantics).
    const LABEL_POSITIONABLE_TYPES = new Set<string>([
      "gateway", "start-event", "intermediate-event", "end-event",
      "data-object", "data-store",
    ]);
    if (LABEL_POSITIONABLE_TYPES.has(r.seed.type)) {
      const head0 = outerHead(r.block);
      const tpxInst = readCellNum(head0, "TxtPinX");
      const tpyInst = readCellNum(head0, "TxtPinY");
      const twInst = readCellNum(head0, "TxtWidth");
      const txtPinX = tpxInst ?? elMasterInfo?.txtPinX;
      const txtPinY = tpyInst ?? elMasterInfo?.txtPinY;
      const txtWidth = twInst ?? elMasterInfo?.txtWidth;
      // Text-block width → labelWidth (px). Drives the renderer's
      // word-wrap so multi-line labels reflow exactly as in Visio.
      // Concrete v5.1 case: Exclusive Gateway master has
      // `TxtWidth=0.8333"` (80 px); "Investigate Further?" wraps to
      // "Investigate" + "Further?" at that width.
      if (txtWidth !== undefined && txtWidth > 0) {
        const labelWidth = Math.round(txtWidth * PX_PER_INCH);
        if (labelWidth !== 80) properties.labelWidth = labelWidth;   // skip if renderer's default
      }
      if (txtPinX !== undefined && txtPinY !== undefined) {
        // Convert Visio shape-local (bottom-left origin, Y-up) →
        // Diagramatix labelOffset (centred X offset, Y-down distance
        // from element bottom to label TOP).
        //
        //   labelCentre.x_diag  = element.x + TxtPinX * 96
        //   element.centre.x    = element.x + width / 2
        //   labelOffsetX        = labelCentre.x_diag − element.centre.x
        //                       = TxtPinX*96 − width/2
        //
        //   labelCentre.y_diag  = element.y + height − TxtPinY * 96
        //   labelTopY (renderer) = element.y + height + labelOffsetY
        //   so labelOffsetY     = labelCentre.y_diag − labelHalfH − (element.y + height)
        //                       = −TxtPinY*96 − labelHalfH
        // labelHalfH ≈ 7 px for a single-line 10pt label (matches the
        // renderer's `?? 7` default for the offset).
        const LABEL_HALF_H = 7;
        const labelOffsetX = Math.round(txtPinX * PX_PER_INCH - widthPx / 2);
        const labelOffsetY = Math.round(-txtPinY * PX_PER_INCH - LABEL_HALF_H);
        // Skip the write when the result is the renderer's default
        // (labelOffsetX=0, labelOffsetY=7) to avoid persisting noise.
        if (labelOffsetX !== 0) properties.labelOffsetX = labelOffsetX;
        if (labelOffsetY !== 7) properties.labelOffsetY = labelOffsetY;
      }
    }
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
    if (r.seed.repeatType) el.repeatType = r.seed.repeatType;
    // Task / Sub-Process: preserve the imported dimensions verbatim.
    // Only grow MINIMALLY if the imported size genuinely can't fit the
    // wrapped label — keep width, expand height just enough. Assumes the
    // Visio author chose deliberate sizes that should be honoured.
    if ((el.type === "task" || el.type === "subprocess") && el.label) {
      const PAD = 5;
      const lineH = 14;
      const innerW = Math.max(20, el.width - 2 * PAD);
      const lines = wrapTextShared(el.label, innerW, 12);
      const needsH = lines.length * lineH + 2 * PAD;
      if (needsH > el.height) {
        const dy = (needsH - el.height) / 2;
        el.y -= dy;
        el.height = needsH;
      }
    }
    elements.push(el);
  }

  // Pool→Lane parentage from BPMN_M `Sheet.N!` references (most reliable).
  // Set BEFORE the member-section / page-tree / geometric passes — when
  // the structural metadata fires, the heuristics never need to.
  for (const [laneShapeId, poolShapeId] of bpmnMLaneToPoolId) {
    const laneElId = shapeIdToElId.get(laneShapeId);
    const poolElId = shapeIdToElId.get(poolShapeId);
    if (!laneElId || !poolElId) continue;
    const lane = elements.find((e) => e.id === laneElId);
    if (lane && !lane.parentId) lane.parentId = poolElId;
  }

  // BPMN_M pool element-ID set — these are authoritative pools tagged with
  // `User.numLanes` ≥ 1 (or a "CFF Container" category). They must survive
  // every subsequent "drop unlabelled pool" prune, because BPMN_M's
  // single-lane convention puts the human-readable label on the LANE's
  // visHeadingText, not on the outer container — so the pool is genuinely
  // unlabelled at the page-shape level despite being a real pool.
  // Without this guard, Salesforce/Applicant-style single-lane pools get
  // dropped at line ~2089 and their lanes lose their parentId, rendering
  // as undraggable orphans on the canvas.
  const bpmnMPoolElIds = new Set<string>();
  for (const poolShapeId of bpmnMPoolByShapeId.keys()) {
    const elId = shapeIdToElId.get(poolShapeId);
    if (elId) bpmnMPoolElIds.add(elId);
  }
  // Promote child-lane visHeadingText to the parent pool when the pool is
  // unlabelled. Single-lane BPMN_M pools (Salesforce, Applicant…) have
  // their label only on the lane; copying it to the pool gives the canvas
  // a meaningful pool header and matches how BPMN typically displays a
  // pool-with-one-lane (pool named, no lane band). For the single-lane
  // case we also DELETE the lane element entirely — visually identical
  // to a no-lane pool, and it lets the post-import poolType detection
  // (line ~1593) classify the pool as `black-box` (default for empty
  // pools), which the canvas's message-misalignment check
  // ([Canvas.tsx:3127](../../components/canvas/Canvas.tsx)) requires:
  // messageBPMN connectors must touch black-box pools or flow elements,
  // not white-box pools. Without the delete, the leftover unlabelled
  // lane keeps the pool as white-box and every incoming/outgoing message
  // arrow renders red until the user manually deletes the lane.
  // Generic placeholder strings that Visio masters drop into pools when
  // the user hasn't typed a real name. Treat them as "unlabelled" so the
  // lane-name promotion below kicks in.
  const POOL_PLACEHOLDER_LABELS = new Set([
    "title", "pool", "black-box pool", "black box pool",
    "pool / lane", "pool/lane", "lane", "swimlane",
  ]);
  const isPoolLabelGeneric = (label: string | undefined | null) => {
    const t = (label ?? "").trim();
    if (!t) return true;
    return POOL_PLACEHOLDER_LABELS.has(t.toLowerCase());
  };
  const lanesToDelete = new Set<string>();
  for (const [poolShapeId, raw] of bpmnMPoolByShapeId) {
    const poolElId = shapeIdToElId.get(poolShapeId);
    if (!poolElId) continue;
    const pool = elements.find((e) => e.id === poolElId);
    if (!pool || !isPoolLabelGeneric(pool.label)) continue;
    const laneChildren = elements.filter((e) => e.type === "lane" && e.parentId === poolElId);
    if (laneChildren.length === 1) {
      const lane = laneChildren[0];
      if (lane.label && lane.label.trim()) pool.label = lane.label;
      // Re-parent any descendants from lane → pool before we delete it.
      for (const e of elements) if (e.parentId === lane.id) e.parentId = poolElId;
      lanesToDelete.add(lane.id);
    } else {
      // Multi-lane pool without its own label: fall back to the pool's
      // own visHeadingText (sometimes BPMN_M does set it).
      const heading = readUserCellValue(raw.block, "visHeadingText");
      if (heading) pool.label = heading;
    }
  }
  if (lanesToDelete.size > 0) {
    // REPOINT (don't delete) shapeIdToElId entries for the deleted lanes.
    // BPMN_M message connectors are often glued to the lane shape, not the
    // pool wrapper — when we delete the lane element, the lane's shape ID
    // is still referenced in <Connects> rows and Begin/EndTrigger formulas.
    // Repointing the map so the lane shape ID resolves to the parent pool's
    // element ID keeps every glued message arrow intact; without this,
    // single-lane-pool messages silently vanish (the connector loop's
    // resolveGlueId walks the page tree, but BPMN_M lanes are TOP-LEVEL
    // siblings of their pool — there's no parent-shape walk-up to follow).
    const laneElToPoolEl = new Map<string, string>();
    for (const [laneShapeId, poolShapeId] of bpmnMLaneToPoolId) {
      const laneElId = shapeIdToElId.get(laneShapeId);
      const poolElId = shapeIdToElId.get(poolShapeId);
      if (laneElId && poolElId && lanesToDelete.has(laneElId)) {
        laneElToPoolEl.set(laneElId, poolElId);
      }
    }
    for (let i = elements.length - 1; i >= 0; i--) {
      if (lanesToDelete.has(elements[i].id)) elements.splice(i, 1);
    }
    for (const [sId, elId] of shapeIdToElId.entries()) {
      if (!lanesToDelete.has(elId)) continue;
      const poolElId = laneElToPoolEl.get(elId);
      if (poolElId) shapeIdToElId.set(sId, poolElId);   // redirect to parent pool
      else shapeIdToElId.delete(sId);
    }
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
      if (bpmnMPoolElIds.has(a.id)) continue;             // authoritative BPMN_M pool — keep
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

  // Element→lane/pool parentage by GEOMETRIC CONTAINMENT. Without this,
  // imported tasks/events/gateways/etc. are top-level elements with no
  // parentId — they don't move when the user drags the pool, breaking
  // the natural "pool encloses its contents" affordance. Find the
  // SMALLEST containing classified container (lane preferred over pool)
  // for each non-container element.
  //
  // NESTED CONTAINERS: subprocess-expanded shapes can also be nested
  // inside other subprocess-expanded shapes (and inside lanes/pools). We
  // include them in the parentage loop — but exclude pools/lanes from
  // being parented this way (they're handled by the pool/lane passes
  // above and shouldn't ever sit "inside" something via geometry alone).
  // For a subprocess-expanded to be a child, the parent must be STRICTLY
  // larger; otherwise a shape can't be both the candidate and the parent.
  const CONTAINER_TYPES = new Set(["pool", "lane", "sublane", "subprocess-expanded", "group"]);
  const containerElements = elements.filter((e) => CONTAINER_TYPES.has(e.type));
  for (const el of elements) {
    // Pools and lanes are parented by earlier dedicated passes — never
    // reassign them here. Other container types (subprocess-expanded,
    // group, sublane) ARE eligible for geometric nesting.
    if (el.type === "pool" || el.type === "lane") continue;
    if (el.parentId) continue;                           // already set (e.g. by member section)
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const elArea = el.width * el.height;
    let bestContainer: DiagramElement | null = null;
    let bestArea = Infinity;
    for (const c of containerElements) {
      if (c.id === el.id) continue;                      // can't parent to self
      if (cx < c.x || cx > c.x + c.width || cy < c.y || cy > c.y + c.height) continue;
      const area = c.width * c.height;
      if (area <= elArea) continue;                      // container must be strictly larger
      if (area < bestArea) { bestArea = area; bestContainer = c; }
    }
    if (bestContainer) el.parentId = bestContainer.id;
  }

  // EDGE-MOUNTED EVENT DETECTION — BPMN events (start/intermediate/end)
  // positioned visually on a subprocess-expanded's boundary in Visio are
  // not "glued" there in the .vsdx file; they're just placed near the
  // edge. Diagramatix's boundary-event model uses `boundaryHostId` on
  // the event to render it sitting on the host's edge. Detect this by
  // looking for events whose CENTRE is within EDGE_TOL of one of the
  // four edges of a subprocess-expanded (or subprocess) element, with
  // the centre on the OPPOSITE axis inside the host's range. The first
  // host within tolerance wins.
  const BPMN_EVENT_TYPES = new Set(["start-event", "intermediate-event", "end-event"]);
  const EDGE_TOL = 24;   // px — half of the default 36px event icon plus a few px slack
  const boundaryCandidates = elements.filter(
    (e) => e.type === "subprocess-expanded" || e.type === "subprocess",
  );
  for (const ev of elements) {
    if (!BPMN_EVENT_TYPES.has(ev.type)) continue;
    if (ev.boundaryHostId) continue;
    const cx = ev.x + ev.width / 2;
    const cy = ev.y + ev.height / 2;
    let bestHost: DiagramElement | null = null;
    let bestDist = Infinity;
    for (const host of boundaryCandidates) {
      if (host.id === ev.id) continue;
      const left = host.x, right = host.x + host.width;
      const top = host.y,  bottom = host.y + host.height;
      const dL = Math.abs(cx - left),  inYL = cy >= top - EDGE_TOL && cy <= bottom + EDGE_TOL;
      const dR = Math.abs(cx - right), inYR = inYL;
      const dT = Math.abs(cy - top),   inXT = cx >= left - EDGE_TOL && cx <= right + EDGE_TOL;
      const dB = Math.abs(cy - bottom),inXB = inXT;
      // Closest edge distance, only if the event sits on that edge's span.
      const candidates = [
        inYL ? dL : Infinity,
        inYR ? dR : Infinity,
        inXT ? dT : Infinity,
        inXB ? dB : Infinity,
      ];
      const d = Math.min(...candidates);
      if (d <= EDGE_TOL && d < bestDist) { bestDist = d; bestHost = host; }
    }
    if (bestHost) ev.boundaryHostId = bestHost.id;
  }

  // FORCED-BOUNDARY pass — events whose master NameU explicitly declared
  // boundary intent (v5.1's "Edge Cancel Event", "Edge Start" etc.) get
  // a much wider geometric tolerance and the same-lane requirement is
  // skipped. Rationale: the master name IS the signal, so the geometric
  // proximity test is only used to pick WHICH subprocess to mount on
  // (the closest one) rather than to validate boundary intent. False
  // positives are not a concern — the only candidates are events that
  // were dropped from a stencil whose author explicitly chose an Edge
  // shape over a regular event.
  for (const ev of elements) {
    if (!BPMN_EVENT_TYPES.has(ev.type)) continue;
    if (ev.boundaryHostId) continue;
    if (!forceBoundaryElIds.has(ev.id)) continue;
    const cx = ev.x + ev.width / 2;
    const cy = ev.y + ev.height / 2;
    let bestHost: DiagramElement | null = null;
    let bestDist = Infinity;
    for (const host of boundaryCandidates) {
      if (host.id === ev.id) continue;
      const left = host.x, right = host.x + host.width;
      const top = host.y,  bottom = host.y + host.height;
      const dL = Math.abs(cx - left);
      const dR = Math.abs(cx - right);
      const dT = Math.abs(cy - top);
      const dB = Math.abs(cy - bottom);
      const d = Math.min(dL, dR, dT, dB);
      if (d < bestDist) { bestDist = d; bestHost = host; }
    }
    if (bestHost) ev.boundaryHostId = bestHost.id;
  }

  // Re-parent each boundary-mounted event from its HOST to the HOST'S parent.
  // Reason: a boundary event straddles the host's edge — half its bbox sits
  // OUTSIDE the host. If the event's parentId points at the host, then
  // `ensureContainersEncloseChildren` in the reducer sees the event as a
  // child overhanging the host's edge and grows the host's bbox on every
  // child move (the user-reported "EP grows upwards" symptom). By moving
  // the event to the HOST'S parent (typically the containing lane), the
  // host's grow-to-fit logic no longer counts the event, and the lane
  // contains it via geometry. boundaryHostId still drives the visual mount.
  for (const ev of elements) {
    if (!ev.boundaryHostId) continue;
    const host = elements.find((e) => e.id === ev.boundaryHostId);
    if (!host) continue;
    ev.parentId = host.parentId;     // may be undefined for top-level hosts — fine
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
    // REPAIR pass — detect lanes whose height came from the WRONG source.
    // The walker falls back to a nested sub-shape's height when the outer
    // shape has no Height cell (typical for BPMN_M Pool/Lane master 2 used
    // for the topmost lane). The nested sub-shape is the heading band
    // (~0.5 inch / 50 px tall), NOT the lane body. Symptom: the top lane
    // ends up disproportionately narrow after proportional scaling. Fix:
    // any lane whose height is suspiciously small relative to the pool
    // gets recomputed as the residue (pool height minus other lanes).
    // Threshold: < 60 px AND less than 1/3 of avg sibling height OR less
    // than 1/4 of pool height.
    if (poolLanes.length >= 2) {
      const totalRaw = poolLanes.reduce((s, e) => s + e.height, 0);
      const avg = totalRaw / poolLanes.length;
      const SUSPICIOUS_PX = 60;
      const brokenIdxs: number[] = [];
      for (let i = 0; i < poolLanes.length; i++) {
        const h = poolLanes[i].height;
        if (h < SUSPICIOUS_PX && (h < avg / 3 || h < pool.height / 4)) {
          brokenIdxs.push(i);
        }
      }
      // Only repair if SOME lanes have sensible heights — otherwise we
      // have nothing to subtract from.
      if (brokenIdxs.length > 0 && brokenIdxs.length < poolLanes.length) {
        const goodTotal = poolLanes
          .filter((_, i) => !brokenIdxs.includes(i))
          .reduce((s, e) => s + e.height, 0);
        const residue = Math.max(0, pool.height - goodTotal);
        const perBroken = residue / brokenIdxs.length;
        for (const i of brokenIdxs) poolLanes[i].height = perBroken;
      }
    }
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
    const elId = mintId(props.BpmnId);
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
    // glued. The embedded `Sheet.N` either reveals the linked shape OR
    // is a SELF-REFERENCE to the connector's own sheet — Visio writes a
    // self-ref as a placeholder when the endpoint is NOT actually glued
    // (free-floating). Filter self-references out, otherwise a free end
    // gets a bogus targetId pointing at the connector itself, which then
    // fails the element lookup ("target shape N not in element list") and
    // the connector is silently skipped instead of falling through to the
    // geometric fallback. Concrete case: `Application Process.vsdx`
    // shape 107 EndTrigger = `Sheet.107!…` (self-ref), shape 1039
    // BegTrigger = `Sheet.1039!…` (self-ref) — both correctly free-end.
    if (!ends?.source || !ends?.target) {
      const begCell = r.block.match(/<Cell\s+N='BegTrigger'[^>]*F='[^']*Sheet\.(\d+)/);
      const endCell = r.block.match(/<Cell\s+N='EndTrigger'[^>]*F='[^']*Sheet\.(\d+)/);
      const next = { ...(ends ?? {}) };
      if (!next.source && begCell && begCell[1] !== r.shapeId) next.source = begCell[1];
      if (!next.target && endCell && endCell[1] !== r.shapeId) next.target = endCell[1];
      ends = next;
    }
    const sourceShape = ends?.source;
    const targetShape = ends?.target;
    // Walk UP the page-tree until we hit a classified ancestor. A
    // connector's <Connect> row often glues to a SUB-shape inside a
    // pool (e.g. Visio writes `ToSheet='299' ToCell='Connections.X2'`
    // for an Email message glued to the Customer pool — shape 299 is
    // the CFF Container.44 body sub-shape of pool 298, which the
    // MasterShape-skip removes from the element list). Without this
    // walk-up the connector silently drops, which is exactly the
    // missing "Email" message in the user's import.
    function resolveGlueId(shapeId: string | undefined): string | undefined {
      if (!shapeId) return undefined;
      let cur: string | null = shapeId;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const elId = shapeIdToElId.get(cur);
        if (elId) return elId;
        const w = walkedById.get(cur);
        cur = w?.parentShapeId ?? null;
      }
      return undefined;
    }
    let sourceId = resolveGlueId(sourceShape);
    let targetId = resolveGlueId(targetShape);
    // Geometric fallback for Message Flow / association connectors with a
    // FREE END (one end glued, the other floating in space). BPMN message
    // flows from an "external participant" pool routinely originate at a
    // literal coordinate inside the pool's bbox without being glued to it
    // — the user-visible symptom is "no message connectors imported"
    // because the connector-build path skips when source OR target can't
    // be resolved. Recover by reading the unglued end's BeginX/Y or
    // EndX/Y from the connector's outer head and finding the smallest
    // pool whose bbox contains that point.
    if (r.connectorBase && (!sourceId || !targetId)) {
      const head0 = outerHead(r.block);
      // The free-end (Begin/End) cells are written ON THE CONNECTOR INSTANCE
      // (the outer head). But the connector's geometry can ALSO live on a
      // parent transform (a CFF Container holds the local PinX/PinY). For
      // page-space resolution, prefer the connector's RAW pageX/pageY when
      // available — it's already in absolute page coords after the walker's
      // transform stack, and the Begin/End cells are LOCAL offsets we'd
      // otherwise misinterpret if the connector lives inside a transformed
      // group. For free-floating connectors the local cell IS the page coord.
      const begXLocal = readCellNum(head0, "BeginX");
      const begYLocal = readCellNum(head0, "BeginY");
      const endXLocal = readCellNum(head0, "EndX");
      const endYLocal = readCellNum(head0, "EndY");
      // Page-relative coords: assume connector parent is the page itself
      // (top-level), so local == page for these connectors. Defensive: if
      // the connector instance was placed inside a transformed group, the
      // walker captured the transform on r.pageX/r.pageY but we still need
      // page-absolute begin/end. Use the page-X/Y delta as offset.
      const begX = begXLocal;
      const begY = begYLocal;
      const endX = endXLocal;
      const endY = endYLocal;
      // EPS tolerance for the inch-coord bbox test. 0.05 inch ≈ 5 px
      // at 96 DPI — absorbs float noise and the small visual gap that
      // sometimes exists between a Visio connector end and the pool
      // edge it "lit up" against without actually gluing. Larger
      // values risk a free end latching onto a neighbouring pool.
      const EPS = 0.05;
      // Restrict the candidate set to "real" pools — pools whose Diagramatix
      // element still has a non-empty label OR whose shape ID is in the
      // BPMN_M-authoritative map. Without this filter, free-end message
      // connectors can latch onto a ghost off-screen Swimlane-List wrapper
      // (LocPin-shifted unlabelled pool that gets dropped later by the
      // unlabelled-pool prune) — the prune then drops the connector along
      // with the ghost, silently losing the message arrow.
      //
      // Connector-type-aware candidate set:
      //   • messageBPMN / associationBPMN free end → pools only (these
      //     connectors typically attach at pool boundaries in BPMN).
      //   • sequence free end → pools AND subprocess-expanded / subprocess
      //     (sequence flows live inside a process and routinely attach to
      //     a subprocess's edge without being formally glued in Visio —
      //     concrete case: Customer Enquiry sequence 314, begin at
      //     (6.6457, 5.858) = exactly on GP's right edge but no glue row,
      //     so without subprocess candidates the begin fell through to
      //     the enclosing Telstra pool and the connector appeared to
      //     emerge from the pool instead of GP).
      // Smallest-area tiebreak picks the most-specific container: GP
      // wins over Telstra when both bboxes contain the point.
      const labelById = new Map<string, string>();
      for (const e of elements) if (e.type === "pool") labelById.set(e.id, e.label ?? "");
      const isSequence = r.connectorBase === "sequence";
      const findContainerAt = (xIn: number | null, yIn: number | null): string | undefined => {
        if (xIn == null || yIn == null) return undefined;
        let bestId: string | undefined;
        let bestArea = Infinity;
        for (const r2 of raw) {
          const t = r2.seed?.type;
          if (!t) continue;
          const isPool = t === "pool";
          const isSubprocess = t === "subprocess-expanded" || t === "subprocess";
          if (!isPool && !(isSequence && isSubprocess)) continue;
          const elId = shapeIdToElId.get(r2.shapeId);
          if (!elId) continue;
          if (isPool) {
            const isAuthoritative = bpmnMPoolByShapeId.has(r2.shapeId);
            const lbl = labelById.get(elId) ?? "";
            if (!isAuthoritative && !lbl.trim()) continue;   // skip ghost wrappers
          }
          const x1 = r2.pageX - r2.width / 2;
          const x2 = r2.pageX + r2.width / 2;
          const y1 = r2.pageY - r2.height / 2;
          const y2 = r2.pageY + r2.height / 2;
          if (xIn < x1 - EPS || xIn > x2 + EPS || yIn < y1 - EPS || yIn > y2 + EPS) continue;
          const area = r2.width * r2.height;
          if (area < bestArea) { bestArea = area; bestId = elId; }
        }
        return bestId;
      };
      if (!sourceId) sourceId = findContainerAt(begX, begY);
      if (!targetId) targetId = findContainerAt(endX, endY);
    }
    // Skip degenerate self-loops with zero geometric length. Visio
    // occasionally leaves behind a sequence-flow shape with Begin == End
    // and no glue — typically the residue of a deleted connector. The
    // geometric fallback above resolves both endpoints to whatever
    // shape's bbox contains that single point, producing a meaningless
    // "X → X" arrow. Drop them silently.
    if (sourceId && sourceId === targetId) {
      const headSelfLoop = outerHead(r.block);
      const bx = readCellNum(headSelfLoop, "BeginX");
      const by = readCellNum(headSelfLoop, "BeginY");
      const ex = readCellNum(headSelfLoop, "EndX");
      const ey = readCellNum(headSelfLoop, "EndY");
      if (bx != null && by != null && ex != null && ey != null
          && Math.abs(bx - ex) < 1e-6 && Math.abs(by - ey) < 1e-6) {
        continue;
      }
    }
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

    const connId = mintId(r.bpmnId);
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
    // after the connector-frame transform). The Diagramatix labelOffset is
    // relative to the VISIBLE midpoint of the connector path (not the
    // centre-leader endpoints), so we defer the actual offset computation
    // until after `finalWaypoints` is built — that way it doesn't matter
    // whether the connector got the messageBPMN 4-point reshuffle or the
    // [srcCentre, ...edges, tgtCentre] pass for sequence/association.
    const txtPinXLocal = readCellNum(head, "TxtPinX");
    const txtPinYLocal = readCellNum(head, "TxtPinY");
    const labelPagePos = (txtPinXLocal != null && txtPinYLocal != null)
      ? {
          x: (localOrigX + txtPinXLocal) * PX_PER_INCH,
          y: (pageH - (localOrigY + txtPinYLocal)) * PX_PER_INCH,
        }
      : null;
    // Read TxtWidth too so we can replicate Visio's word-wrap when the
    // text overflows its label box. Diagramatix's connector renderer
    // only splits on '\n' — it doesn't auto-wrap by labelWidth like
    // Visio does — so we PRE-WRAP the label here. e.g. Visio's
    // "Get Emails Details" with TxtWidth=0.615 inch (≈59 px) wraps to
    // "Get Emails / Details"; we insert the '\n' so Diagramatix
    // renders the same two lines.
    const txtWidthLocal = readCellNum(head, "TxtWidth");
    let wrappedLabel = label;
    if (label && txtWidthLocal != null && txtWidthLocal > 0) {
      const txtWidthPx = txtWidthLocal * PX_PER_INCH;
      // Match the renderer's char-width heuristic (10pt × 0.6 ≈ 6 px/char).
      // Subtract a small padding so we wrap at the SAME visible width
      // Visio rendered, not slightly past it.
      const FONT_PX = 10;
      const AVG_CHAR_W = FONT_PX * 0.6;
      const charsPerLine = Math.max(1, Math.floor((txtWidthPx - 4) / AVG_CHAR_W));
      const wrap = (segment: string): string => {
        const words = segment.split(" ");
        const out: string[] = [];
        let current = "";
        for (const word of words) {
          if (!current) current = word;
          else if (current.length + 1 + word.length <= charsPerLine) current += " " + word;
          else { out.push(current); current = word; }
        }
        if (current) out.push(current);
        return out.join("\n");
      };
      // Preserve any pre-existing line breaks the user typed in Visio.
      wrappedLabel = label.split(/\r?\n/).map(wrap).join("\n");
    }

    // Diagramatix's native convention (verified by diffing a manually-
    // corrected diagram) is leaders=TRUE for EVERY connector type with
    // the source-centre and target-centre as waypoints[0] and [N-1].
    // The "visible" portion of the connector is waypoints[1..N-2]; the
    // first and last segments are invisible leaders that let label
    // anchoring + endpoint-drag UIs find the shape centres without
    // calling out to the elements array. Applying this to imported
    // sequence / association / messageBPMN connectors uniformly closes
    // a class of bugs (drag-handle missing, second-clip-pass clobbering
    // edge attachments, label offset relative to wrong anchor).
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
    } else if (sourceEl && targetEl && waypoints.length >= 2) {
      // Sequence / association connectors: prepend src centre and append
      // tgt centre, set leaders=true. waypoints[0] (post-clip) and
      // waypoints[N-1] (post-clip) become the visible-edge points at
      // positions 1 and N-2 in the new array — matching the Diagramatix-
      // native format the user's manually-corrected diagram uses.
      const srcCentre = { x: sourceEl.x + sourceEl.width / 2, y: sourceEl.y + sourceEl.height / 2 };
      const tgtCentre = { x: targetEl.x + targetEl.width / 2, y: targetEl.y + targetEl.height / 2 };
      finalWaypoints = [srcCentre, ...waypoints, tgtCentre];
      sourceInvisibleLeader = true;
      targetInvisibleLeader = true;
    }

    // Now that finalWaypoints is settled, compute labelOffsetX/Y relative
    // to the connector's VISIBLE midpoint — the same anchor the renderer
    // uses ([ConnectorRenderer.tsx:323-326](../components/canvas/ConnectorRenderer.tsx)).
    let labelOffsetX = 0;
    let labelOffsetY = 0;
    if (labelPagePos && finalWaypoints.length >= 2) {
      const visStart = sourceInvisibleLeader ? 1 : 0;
      const visEnd = finalWaypoints.length - 1 - (targetInvisibleLeader ? 1 : 0);
      if (visEnd >= visStart) {
        const p0 = finalWaypoints[visStart];
        const pN = finalWaypoints[visEnd];
        const midX = (p0.x + pN.x) / 2;
        const midY = (p0.y + pN.y) / 2;
        labelOffsetX = labelPagePos.x - midX;
        labelOffsetY = labelPagePos.y - midY;
      }
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
      label: wrappedLabel || undefined,
      labelAnchor: "midpoint",
      labelOffsetX,
      labelOffsetY,
      sourceOffsetAlong: resolvedSourceOffset,
      targetOffsetAlong: resolvedTargetOffset,
    };
    connectors.push(connector);
  }

  // Black-box Pool with inner lane(s): the Visio author dropped a
  // Black-Box Pool master, and one or more lanes ended up parented to it
  // (either via geometric containment or master-shape inheritance). A
  // black-box pool is rendered as a solid rectangle with no visible lane
  // structure, so the lanes are visual artifacts. Remap any connector
  // whose endpoint touches a child lane → the pool boundary, re-parent
  // any non-lane descendants of those lanes to the pool, then remove the
  // lanes. If the pool itself carries only a generic placeholder label
  // ("Title", "Pool"…) and a single child lane carries the real name,
  // promote the lane's name up first.
  {
    const lanesToRemove = new Set<string>();
    const laneToParentPool = new Map<string, string>();
    for (const pool of elements) {
      if (pool.type !== "pool") continue;
      if (pool.properties.poolType !== "black-box") continue;
      const laneChildren = elements.filter(
        (e) => e.type === "lane" && e.parentId === pool.id,
      );
      if (laneChildren.length === 0) continue;
      if (isPoolLabelGeneric(pool.label) && laneChildren.length === 1) {
        const lane = laneChildren[0];
        if (lane.label && lane.label.trim()) pool.label = lane.label;
      }
      for (const lane of laneChildren) {
        lanesToRemove.add(lane.id);
        laneToParentPool.set(lane.id, pool.id);
      }
    }
    if (lanesToRemove.size > 0) {
      for (const c of connectors) {
        const newSrc = laneToParentPool.get(c.sourceId);
        const newTgt = laneToParentPool.get(c.targetId);
        if (newSrc) c.sourceId = newSrc;
        if (newTgt) c.targetId = newTgt;
      }
      // Re-parent any descendants of the removed lanes up to the pool.
      for (const e of elements) {
        if (!e.parentId) continue;
        const newParent = laneToParentPool.get(e.parentId);
        if (newParent) e.parentId = newParent;
      }
      // Remove the lanes themselves.
      for (let i = elements.length - 1; i >= 0; i--) {
        if (lanesToRemove.has(elements[i].id)) elements.splice(i, 1);
      }
      // Repoint shapeIdToElId entries that pointed at a removed lane
      // to the absorbing pool, so any later glue-target lookup still
      // resolves correctly.
      for (const [shapeId, elId] of shapeIdToElId.entries()) {
        if (!lanesToRemove.has(elId)) continue;
        const poolId = laneToParentPool.get(elId);
        if (poolId) shapeIdToElId.set(shapeId, poolId);
      }
    }
  }

  // Drop any heuristic-promoted pool whose final label is empty (after
  // <pp/> stripping, BpmnName fallback etc.) — these are almost always
  // a wrapper container we shouldn't have classified.  Also drop any
  // connector that referenced one of these pruned pools.
  // EXCEPTION: BPMN_M pools (authoritative `User.numLanes` ≥ 1 metadata)
  // are kept even when unlabelled — see the label-promotion pass above
  // for context. Without this guard, off-screen-LocPin Swimlane-List
  // ghost wrappers AND real single-lane pools both look "unlabelled" at
  // this point, and dropping the latter orphans their lanes.
  const droppedPoolIds = new Set<string>();
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.type !== "pool") continue;
    if (e.label && e.label.trim()) continue;
    if (bpmnMPoolElIds.has(e.id)) continue;            // authoritative — keep
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

  // Re-snap connector endpoints AFTER the pool merge — but ONLY for
  // connectors whose source or target was actually remapped (otherwise
  // we'd clobber the per-connector edge clipping the import loop just
  // computed, which the user-reported "U-shaped gateway connector
  // attaches to right/left edges instead of bottom" bug traced back to).
  // Connectors using the new [srcCentre, ...visible..., tgtCentre]
  // leader format need waypoints[0] and waypoints[N-1] preserved as
  // shape centres; only the visible-edge points (waypoints[1] and
  // [N-2]) are recomputed.
  if (mergedAwayIds.size > 0) {
    for (const c of connectors) {
      const srcRemapped = !!mergedAwayIds.has(c.sourceId);
      const tgtRemapped = !!mergedAwayIds.has(c.targetId);
      if (!srcRemapped && !tgtRemapped) continue;
      const srcEl = elements.find((e) => e.id === c.sourceId);
      const tgtEl = elements.find((e) => e.id === c.targetId);
      if (!srcEl || !tgtEl || c.waypoints.length < 2) continue;
      const srcCentre = { x: srcEl.x + srcEl.width / 2, y: srcEl.y + srcEl.height / 2 };
      const tgtCentre = { x: tgtEl.x + tgtEl.width / 2, y: tgtEl.y + tgtEl.height / 2 };
      const visStart = c.sourceInvisibleLeader ? 1 : 0;
      const visEnd = c.waypoints.length - 1 - (c.targetInvisibleLeader ? 1 : 0);
      if (srcRemapped) {
        if (c.sourceInvisibleLeader) c.waypoints[0] = srcCentre;
        c.waypoints[visStart] = clipToRectEdge(srcEl, c.waypoints[Math.min(visStart + 1, visEnd)]);
      }
      if (tgtRemapped) {
        if (c.targetInvisibleLeader) c.waypoints[c.waypoints.length - 1] = tgtCentre;
        c.waypoints[visEnd] = clipToRectEdge(tgtEl, c.waypoints[Math.max(visEnd - 1, visStart)]);
      }
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

  // Final pass: recompute every connector's waypoints from scratch using
  // the same routing helper that fires on MOVE_ELEMENT. The user-visible
  // symptom this fixes — "sequence connectors initially mis-routed,
  // moving any element fixes them" — is the imported raw Visio waypoints
  // not matching Diagramatix's expected routing rules. The MOVE cascade
  // already calls `recomputeAllConnectors`, which is why nudging an
  // element repairs them. Running the same call once at import-time
  // produces the correct routing immediately, before the user sees
  // anything broken. The function is pure (only depends on element
  // positions and connector source/target/sides), so it works the same
  // whether invoked from the reducer or the import API route.
  const recomputedConnectors = recomputeAllConnectors(connectors, elements);
  // Replace in-place to keep all the post-import logic that captured
  // `connectors` references operating on the same array.
  for (let i = 0; i < connectors.length; i++) {
    connectors[i] = recomputedConnectors[i] ?? connectors[i];
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

  // Element type breakdown for diagnostics — surfaces, for each imported
  // page, how many of each element type ended up in the diagram. Helpful
  // when investigating "no data-objects came across" style reports.
  {
    const byType = new Map<string, number>();
    for (const e of elements) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    if (byType.size > 0) {
      const summary = [...byType.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${n}× ${t}`)
        .join(", ");
      warnings.push(`Element types imported: ${summary}.`);
    }
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

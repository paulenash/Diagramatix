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

export interface ImportResult {
  data: DiagramData;
  warnings: string[];
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

  // Pool / Lane
  "Pool / Lane": { type: "pool" },
  "Pool":                { type: "pool" },
  "Pool with 2 Lanes":   { type: "pool", poolType: "white-box" },
  "Pool with 3 Lanes":   { type: "pool", poolType: "white-box" },
  "Pool with 4 Lanes":   { type: "pool", poolType: "white-box" },
  "Black-Box Pool":      { type: "pool", poolType: "black-box" },
  "Vertical Pool":       { type: "pool" },
  "Horizontal Pool":     { type: "pool" },
  "Swimlane":            { type: "lane" },
  "Additional Lane":     { type: "lane" },
  "Lane":                { type: "lane" },

  // Data
  "Data Object": { type: "data-object" },
  "Data Object with Associations": { type: "data-object" },
  "Input Data Object": { type: "data-object", role: "input" },
  "Output Data Object": { type: "data-object", role: "output" },
  "Data Object Collection": { type: "data-object", multiplicity: "collection" },
  "Data Store": { type: "data-store" },

  // Misc
  "Text Annotation": { type: "text-annotation" },
  "Group": { type: "group" },

  // Explicitly ignored (decorative shapes from BPMN_M)
  "Message": null,
  "CFF Container": null,
  "Swimlane List": null,
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
  // Strip the leading `<cp IX='0'/>` (V3's character-property hint) plus any
  // additional `<cp .../>` markers Visio sprinkles in mid-text.
  const m = block.match(/<Text>([\s\S]*?)<\/Text>/);
  if (!m) return "";
  return m[1]
    .replace(/<cp\s+IX='\d+'\s*\/>/g, "")
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
    geomById.set(n.shapeId, {
      localPinX: readCellNum(n.block, "PinX") ?? 0,
      localPinY: readCellNum(n.block, "PinY") ?? 0,
      width: readCellNum(n.block, "Width") ?? 0,
      height: readCellNum(n.block, "Height") ?? 0,
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
  return CONNECTOR_NAMEU_MAP[nameU] ?? null;
}

function classifyElement(nameU: string, props: Record<string, string>): ElementSeed | null {
  const base = ELEMENT_NAMEU_MAP[nameU];
  if (base === null) return null;        // explicitly ignored
  if (base === undefined) return null;   // unknown
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
  const pagesXml = await zip.file("visio/pages/pages.xml")?.async("string");
  if (!pagesXml) {
    return {
      data: { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } },
      warnings: ["No pages.xml in .vsdx — nothing to import."],
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
      const labelHint = readText(block).slice(0, 40);
      const labelSuffix = labelHint ? ` (text: "${labelHint}")` : "";
      if (nameU) {
        warnings.push(
          `Skipped shape ${w.shapeId} — unrecognised master "${nameU}" (master ID ${masterId})${labelSuffix}.`,
        );
      } else if (masterId) {
        warnings.push(
          `Skipped shape ${w.shapeId} — master ${masterId} has no NameU${labelSuffix}.`,
        );
      } else {
        warnings.push(`Skipped shape ${w.shapeId} — no Master attribute${labelSuffix}.`);
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
  for (const r of raw) {
    if (r.seed?.type !== "pool" || r.nameU !== "Pool / Lane") continue;
    let isLane = laneShapeIds.has(r.shapeId);
    if (!isLane && r.parentShapeId) {
      const parent = rawByShapeId.get(r.parentShapeId);
      if (parent?.seed?.type === "pool" || parent?.seed?.type === "lane") {
        isLane = true;
      }
    }
    if (isLane) r.seed.type = "lane";
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
        if (widthPx < 5) widthPx = fallback.w;
        if (heightPx < 5) heightPx = fallback.h;
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

  // Connectors: page-level <Connects><Connect FromSheet=… ToSheet=… /></Connects>
  // gives source/target. FromCell='BeginX' → source; FromCell='EndX' → target.
  const connectsBlock = pageXml.match(/<Connects>([\s\S]*?)<\/Connects>/)?.[1] ?? "";
  const connectRows: { connId: string; cell: string; toSheet: string }[] = [];
  const connectRe =
    /<Connect\s+FromSheet='(\d+)'\s+FromCell='(\w+)'[^>]*ToSheet='(\d+)'/g;
  let cm;
  while ((cm = connectRe.exec(connectsBlock)) !== null) {
    connectRows.push({ connId: cm[1], cell: cm[2], toSheet: cm[3] });
  }

  const connSourceTarget = new Map<string, { source?: string; target?: string }>();
  for (const row of connectRows) {
    const entry = connSourceTarget.get(row.connId) ?? {};
    if (row.cell === "BeginX") entry.source = row.toSheet;
    else if (row.cell === "EndX") entry.target = row.toSheet;
    connSourceTarget.set(row.connId, entry);
  }

  const connectors: Connector[] = [];
  for (const r of raw) {
    if (!r.connectorBase) continue;

    const ends = connSourceTarget.get(r.shapeId);
    const sourceShape = ends?.source;
    const targetShape = ends?.target;
    const sourceId = sourceShape ? shapeIdToElId.get(sourceShape) : undefined;
    const targetId = targetShape ? shapeIdToElId.get(targetShape) : undefined;
    if (!sourceId || !targetId) {
      warnings.push(`Skipped connector ${r.shapeId} — source or target unresolved.`);
      continue;
    }

    // Compute Begin/End in PAGE-ABSOLUTE Visio coords. The walker already
    // gives us r.pageX/pageY (the connector's centre in page coords). Begin
    // and End cells are in the connector's parent frame (same frame as the
    // PinX cell), so the offset between them and pageX is exactly the
    // parent-origin shift — works for top-level (offset=0) and any depth
    // of nesting.
    const cellPinX = readCellNum(r.block, "PinX") ?? 0;
    const cellPinY = readCellNum(r.block, "PinY") ?? 0;
    const cellLocPinX = readCellNum(r.block, "LocPinX") ?? 0;
    const cellLocPinY = readCellNum(r.block, "LocPinY") ?? 0;
    const offX = r.pageX - cellPinX;
    const offY = r.pageY - cellPinY;
    const beginX = (readCellNum(r.block, "BeginX") ?? 0) + offX;
    const beginY = (readCellNum(r.block, "BeginY") ?? 0) + offY;
    const endX = (readCellNum(r.block, "EndX") ?? 0) + offX;
    const endY = (readCellNum(r.block, "EndY") ?? 0) + offY;
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

  return {
    data: {
      elements,
      connectors,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    warnings,
  };
}

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
  "Pool with 2 Lanes": { type: "pool", poolType: "white-box" },
  "Black-Box Pool": { type: "pool", poolType: "black-box" },
  "Additional Lane": { type: "lane" },
  "Lane": { type: "lane" },

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
  "Sequence Flow": "sequence",
  "Default Sequence Flow": "sequence",
  "Conditional Sequence Flow": "sequence",
  "Message Flow": "messageBPMN",
  "Association": "associationBPMN",
  "Directed Association": "associationBPMN",
  "Data Association": "associationBPMN",
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
  /** PinX in page-absolute Visio inches (Y-up). */
  pageX: number;
  /** PinY in page-absolute Visio inches (Y-up). */
  pageY: number;
  width: number;
  height: number;
}

/** Read PinX/PinY/Width/Height cells from the *head* of a Shape — the
 *  cells/sections that appear before any nested `<Shapes>` block. Stops
 *  at the first `<Shapes>`, `</Shape>`, or next `<Shape ID=` so we don't
 *  pick up a child's PinX as if it were the outer's. */
function readShapeHeadCells(headXml: string): {
  pinX: number;
  pinY: number;
  width: number;
  height: number;
} {
  const stops = ["<Shapes>", "</Shape>", "<Shape "];
  let cut = headXml.length;
  for (const s of stops) {
    const i = headXml.indexOf(s);
    if (i >= 0 && i < cut) cut = i;
  }
  const head = headXml.slice(0, cut);
  return {
    pinX: parseFloat(head.match(/<Cell\s+N='PinX'\s+V='([^']*)'/)?.[1] ?? "0"),
    pinY: parseFloat(head.match(/<Cell\s+N='PinY'\s+V='([^']*)'/)?.[1] ?? "0"),
    width: parseFloat(head.match(/<Cell\s+N='Width'\s+V='([^']*)'/)?.[1] ?? "0"),
    height: parseFloat(head.match(/<Cell\s+N='Height'\s+V='([^']*)'/)?.[1] ?? "0"),
  };
}

function walkAllShapes(pageXml: string): WalkedShape[] {
  const m = pageXml.match(/<Shapes>([\s\S]*?)<\/Shapes>(?=\s*(?:<Connects>|<\/PageContents>))/);
  if (!m) return [];
  const inner = m[1];
  const out: WalkedShape[] = [];

  type Frame = {
    shapeId: string;
    blockStart: number;
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  };
  const stack: Frame[] = [];

  const tagRe = /<(\/?)Shape(\s|>)/g;
  let t;
  while ((t = tagRe.exec(inner)) !== null) {
    if (t[1] === "/") {
      // Closing tag → pop frame, emit record covering the full block.
      const frame = stack.pop();
      if (!frame) continue; // unbalanced; skip
      const blockEnd = inner.indexOf(">", t.index) + 1;
      out.push({
        shapeId: frame.shapeId,
        block: inner.slice(frame.blockStart, blockEnd),
        parentShapeId: stack.length > 0 ? stack[stack.length - 1].shapeId : null,
        pageX: frame.pageX,
        pageY: frame.pageY,
        width: frame.width,
        height: frame.height,
      });
      continue;
    }
    // Opening tag: read shape's local PinX/PinY/W/H from cells before
    // any nested <Shapes>, then transform local→page using parent frame.
    const tagEnd = inner.indexOf(">", t.index) + 1;
    const openTag = inner.slice(t.index, tagEnd);
    const shapeId = openTag.match(/ID='(\d+)'/)?.[1] ?? "?";
    // Slice an upper bound for the head — short slice for speed.
    const headSlice = inner.slice(tagEnd, Math.min(inner.length, tagEnd + 6000));
    const { pinX, pinY, width, height } = readShapeHeadCells(headSlice);
    let pageX = pinX;
    let pageY = pinY;
    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      pageX = (parent.pageX - parent.width / 2) + pinX;
      pageY = (parent.pageY - parent.height / 2) + pinY;
    }
    stack.push({
      shapeId,
      blockStart: t.index,
      pageX,
      pageY,
      width,
      height,
    });
  }
  return out;
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
    const widthPx = fixed ? fixed.w : w * PX_PER_INCH;
    const heightPx = fixed ? fixed.h : h * PX_PER_INCH;
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

    let beginX = readCellNum(r.block, "BeginX") ?? 0;
    let beginY = readCellNum(r.block, "BeginY") ?? 0;
    let endX = readCellNum(r.block, "EndX") ?? 0;
    let endY = readCellNum(r.block, "EndY") ?? 0;
    // Begin/End cells live in the connector's parent frame (same frame
    // as its PinX). For a nested connector inside a Pool/Group, lift
    // them to page-absolute Visio coords so canvas conversion is correct.
    if (r.parentShapeId) {
      const p = rawByShapeId.get(r.parentShapeId);
      if (p) {
        const offX = p.pageX - p.width / 2;
        const offY = p.pageY - p.height / 2;
        beginX += offX; endX += offX;
        beginY += offY; endY += offY;
      }
    }

    // Geometry IX='0' carries the connector path. MoveTo IX='1' marks
    // Begin (typically (0,0)); subsequent LineTo rows are offsets relative
    // to BeginX/BeginY in inches (Visio Y-up, so canvas Y is computed via
    // pageH - (BeginY + ry)).
    const geom = r.block.match(/<Section\s+N='Geometry'\s+IX='0'>([\s\S]*?)<\/Section>/)?.[1] ?? "";
    const rawWPs: Point[] = [];
    const rowRe = /<Row\s+T='(MoveTo|LineTo)'\s+IX='(\d+)'>([\s\S]*?)<\/Row>/g;
    let rr;
    while ((rr = rowRe.exec(geom)) !== null) {
      const inner = rr[3];
      const rx = parseFloat(readCellV(inner, "X") ?? "0");
      const ry = parseFloat(readCellV(inner, "Y") ?? "0");
      rawWPs.push({
        x: (beginX + rx) * PX_PER_INCH,
        y: (pageH - (beginY + ry)) * PX_PER_INCH,
      });
    }
    // No geometry section (some master-defined connectors): synthesize Begin.
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

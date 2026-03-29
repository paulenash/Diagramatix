/**
 * Export a Diagramatix BPMN diagram as a Microsoft Visio .vsdx file.
 *
 * The .vsdx format is a ZIP archive of XML files. Master shape definitions
 * are extracted from the bundled BPMN stencil (bpmn-stencil.vssx) and only
 * the masters actually used by the diagram are included in the output.
 */
import JSZip from "jszip";
import type { DiagramData, DiagramElement, Connector, Point } from "./types";
import { getElementMasterId, getConnectorMasterId } from "./visioMasterMap";

const VISIO_NS = "http://schemas.microsoft.com/office/visio/2012/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PX_PER_INCH = 96;
const MARGIN_INCHES = 0.5;

// Module-level cache for the parsed stencil
let cachedStencil: JSZip | null = null;

// ── Stencil loader ───────────────────────────────────────────────────

async function loadStencil(): Promise<JSZip> {
  if (cachedStencil) return cachedStencil;
  const resp = await fetch("/bpmn-stencil.vssx");
  if (!resp.ok) throw new Error(`Failed to fetch stencil: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  cachedStencil = await JSZip.loadAsync(buf);
  return cachedStencil;
}

// ── Helpers ──────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function px2in(px: number): number {
  return px / PX_PER_INCH;
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

function getDiagramBounds(data: DiagramData): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of data.elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  for (const c of data.connectors) {
    for (const pt of c.waypoints) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  return { minX, minY, maxX, maxY };
}

// ── Stencil parsing ──────────────────────────────────────────────────

interface MasterInfo {
  id: number;
  rId: string;
  filename: string;   // e.g. "master1.xml"
  masterXml: string;  // the <Master ...>...</Master> block from masters.xml
}

async function parseMasters(stencil: JSZip): Promise<Map<number, MasterInfo>> {
  const mastersXml = await stencil.file("visio/masters/masters.xml")!.async("string");
  const relsXml = await stencil.file("visio/masters/_rels/masters.xml.rels")!.async("string");

  // Parse rId → filename from .rels
  const rIdToFile = new Map<string, string>();
  const relRe = /Relationship\s+Id='(rId\d+)'[^>]*Target='([^']*)'/g;
  let m;
  while ((m = relRe.exec(relsXml)) !== null) {
    rIdToFile.set(m[1], m[2]);
  }

  // Parse each <Master> block
  const result = new Map<number, MasterInfo>();
  const masterRe = /<Master\s+ID='(\d+)'[^>]*>[\s\S]*?<\/Master>/g;
  while ((m = masterRe.exec(mastersXml)) !== null) {
    const id = parseInt(m[1], 10);
    const block = m[0];
    // Extract Rel r:id
    const relMatch = block.match(/<Rel\s+r:id='(rId\d+)'/);
    if (!relMatch) continue;
    const rId = relMatch[1];
    const filename = rIdToFile.get(rId);
    if (!filename) continue;
    result.set(id, { id, rId, filename, masterXml: block });
  }
  return result;
}

// ── Coordinate conversion ────────────────────────────────────────────
// Diagramatix: pixels, origin top-left
// Visio: inches, origin bottom-left

function toVisioX(px: number, bounds: Bounds): number {
  return px2in(px - bounds.minX) + MARGIN_INCHES;
}

function toVisioY(px: number, bounds: Bounds, pageH: number): number {
  return pageH - px2in(px - bounds.minY) - MARGIN_INCHES;
}

// ── page1.xml generation ─────────────────────────────────────────────

function generatePageShapes(
  data: DiagramData,
  bounds: Bounds,
  pageW: number,
  pageH: number,
  masterIds: Set<number>
): { shapesXml: string; connectsXml: string } {
  const elIdToShapeId = new Map<string, number>();
  let nextId = 1;
  const shapes: string[] = [];
  const connects: string[] = [];

  // Elements
  for (const el of data.elements) {
    const masterId = getElementMasterId(el);
    if (masterId == null) continue;
    masterIds.add(masterId);

    const shapeId = nextId++;
    elIdToShapeId.set(el.id, shapeId);

    const cx = toVisioX(el.x + el.width / 2, bounds);
    const cy = toVisioY(el.y + el.height / 2, bounds, pageH);
    const w = px2in(el.width);
    const h = px2in(el.height);

    shapes.push(
      `<Shape ID='${shapeId}' NameU='${escXml(el.label || el.type)}' Type='Shape' Master='${masterId}'>` +
      `<Cell N='PinX' V='${cx}'/>` +
      `<Cell N='PinY' V='${cy}'/>` +
      `<Cell N='Width' V='${w}'/>` +
      `<Cell N='Height' V='${h}'/>` +
      `<Cell N='LocPinX' V='${w / 2}' F='Width*0.5'/>` +
      `<Cell N='LocPinY' V='${h / 2}' F='Height*0.5'/>` +
      (el.label ? `<Text>${escXml(el.label)}</Text>` : "") +
      `</Shape>`
    );
  }

  // Connectors
  for (const conn of data.connectors) {
    const masterId = getConnectorMasterId(conn, data.elements);
    masterIds.add(masterId);

    const shapeId = nextId++;
    const srcShapeId = elIdToShapeId.get(conn.sourceId);
    const tgtShapeId = elIdToShapeId.get(conn.targetId);

    // Use visible edge waypoints (skip invisible leaders)
    const visStart = conn.sourceInvisibleLeader ? 1 : 0;
    const visEnd = conn.targetInvisibleLeader ? conn.waypoints.length - 2 : conn.waypoints.length - 1;
    const visPts = conn.waypoints.slice(visStart, visEnd + 1);
    if (visPts.length < 2) continue;

    const p0 = visPts[0];
    const pN = visPts[visPts.length - 1];
    const bx = toVisioX(p0.x, bounds);
    const by = toVisioY(p0.y, bounds, pageH);
    const ex = toVisioX(pN.x, bounds);
    const ey = toVisioY(pN.y, bounds, pageH);

    // Geometry section for multi-segment connectors
    let geomSection = "";
    if (visPts.length > 2) {
      const rows: string[] = [];
      rows.push(
        `<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>`
      );
      for (let i = 1; i < visPts.length; i++) {
        const rx = toVisioX(visPts[i].x, bounds) - bx;
        const ry = toVisioY(visPts[i].y, bounds, pageH) - by;
        rows.push(
          `<Row T='LineTo' IX='${i + 1}'><Cell N='X' V='${rx}'/><Cell N='Y' V='${ry}'/></Row>`
        );
      }
      geomSection =
        `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        rows.join("") +
        `</Section>`;
    }

    shapes.push(
      `<Shape ID='${shapeId}' NameU='${escXml(conn.label || conn.type)}' Type='Shape' Master='${masterId}'>` +
      `<Cell N='BeginX' V='${bx}'/>` +
      `<Cell N='BeginY' V='${by}'/>` +
      `<Cell N='EndX' V='${ex}'/>` +
      `<Cell N='EndY' V='${ey}'/>` +
      geomSection +
      (conn.label ? `<Text>${escXml(conn.label)}</Text>` : "") +
      `</Shape>`
    );

    if (srcShapeId != null) {
      connects.push(
        `<Connect FromSheet='${shapeId}' FromCell='BeginX' ToSheet='${srcShapeId}' ToCell='PinX'/>`
      );
    }
    if (tgtShapeId != null) {
      connects.push(
        `<Connect FromSheet='${shapeId}' FromCell='EndX' ToSheet='${tgtShapeId}' ToCell='PinX'/>`
      );
    }
  }

  return {
    shapesXml: shapes.join("\n"),
    connectsXml: connects.join("\n"),
  };
}

// ── Static XML templates ─────────────────────────────────────────────

function contentTypesXml(masterFiles: string[]): string {
  const masterOverrides = masterFiles.map(f =>
    `<Override PartName="/visio/masters/${f}" ContentType="application/vnd.ms-visio.master+xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>` +
    `<Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>` +
    masterOverrides +
    `<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>` +
    `<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;
}

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
  `</Relationships>`;

const DOC_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/masters" Target="masters/masters.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>` +
  `</Relationships>`;

function mastersIndexXml(masters: MasterInfo[]): string {
  // Rewrite Rel r:id references to be sequential in our output
  const entries = masters.map((m, i) => {
    const newRId = `rId${i + 1}`;
    // Replace the Rel r:id in the master XML block
    return m.masterXml.replace(/<Rel\s+r:id='rId\d+'/, `<Rel r:id='${newRId}'`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Masters xmlns='${VISIO_NS}' xmlns:r='${REL_NS}' xml:space='preserve'>` +
    entries.join("") +
    `</Masters>`;
}

function mastersRelsXml(masters: MasterInfo[]): string {
  const rels = masters.map((m, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="${m.filename}"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${REL_NS}">${rels}</Relationships>`;
}

function pagesXml(pageW: number, pageH: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Pages xmlns='${VISIO_NS}' xmlns:r='${REL_NS}' xml:space='preserve'>` +
    `<Page ID='0' NameU='Page-1' Name='Page-1'>` +
    `<PageSheet>` +
    `<Cell N='PageWidth' V='${pageW}'/>` +
    `<Cell N='PageHeight' V='${pageH}'/>` +
    `<Cell N='ShdwOffsetX' V='0.118'/>` +
    `<Cell N='ShdwOffsetY' V='-0.118'/>` +
    `<Cell N='PageScale' V='1'/>` +
    `<Cell N='DrawingScale' V='1'/>` +
    `<Cell N='DrawingSizeType' V='1'/>` +
    `<Cell N='DrawingScaleType' V='0'/>` +
    `<Cell N='InhibitSnap' V='0'/>` +
    `</PageSheet>` +
    `<Rel r:id='rId1'/>` +
    `</Page></Pages>`;
}

const PAGES_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>` +
  `</Relationships>`;

function pageContentXml(shapesXml: string, connectsXml: string, pageW: number, pageH: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<PageContents xmlns='${VISIO_NS}' xmlns:r='${REL_NS}' xml:space='preserve'>` +
    `<Shapes>${shapesXml}</Shapes>` +
    (connectsXml ? `<Connects>${connectsXml}</Connects>` : "") +
    `</PageContents>`;
}

function corePropsXml(title: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${escXml(title)}</dc:title>` +
    `<dc:creator>Diagramatix</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    `</cp:coreProperties>`;
}

const APP_PROPS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
  `<Application>Diagramatix</Application>` +
  `</Properties>`;

// ── Minimal document.xml ─────────────────────────────────────────────

function documentXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<VisioDocument xmlns='${VISIO_NS}' xmlns:r='${REL_NS}' xml:space='preserve'>` +
    `<DocumentSettings TopPage='0' DefaultTextStyle='0' DefaultLineStyle='0' DefaultFillStyle='0'>` +
    `<Cell N='GlueSettings' V='57'/>` +
    `<Cell N='SnapSettings' V='65847'/>` +
    `<Cell N='SnapExtensions' V='34'/>` +
    `<Cell N='DynamicGridEnabled' V='1'/>` +
    `</DocumentSettings>` +
    `<StyleSheets>` +
    `<StyleSheet ID='0' NameU='No Style' Name='No Style'>` +
    `<Cell N='LineWeight' V='0.01041666666666667'/>` +
    `<Cell N='LineColor' V='0'/>` +
    `<Cell N='LinePattern' V='1'/>` +
    `<Cell N='FillForegnd' V='1'/>` +
    `<Cell N='FillPattern' V='1'/>` +
    `<Cell N='VerticalAlign' V='1'/>` +
    `<Section N='Character'><Row IX='0'>` +
    `<Cell N='Font' V='Calibri'/><Cell N='Size' V='0.1111111111111111'/>` +
    `<Cell N='Color' V='0'/></Row></Section>` +
    `</StyleSheet>` +
    `</StyleSheets>` +
    `</VisioDocument>`;
}

// ── Main export function ─────────────────────────────────────────────

export async function exportVisio(
  data: DiagramData,
  diagramName: string
): Promise<void> {
  const stencil = await loadStencil();
  const allMasters = await parseMasters(stencil);

  // Compute page dimensions
  const bounds = getDiagramBounds(data);
  const pageW = px2in(bounds.maxX - bounds.minX) + MARGIN_INCHES * 2;
  const pageH = px2in(bounds.maxY - bounds.minY) + MARGIN_INCHES * 2;

  // Generate shapes and collect needed master IDs
  const neededMasterIds = new Set<number>();
  const { shapesXml, connectsXml } = generatePageShapes(data, bounds, pageW, pageH, neededMasterIds);

  // Resolve master info for needed IDs
  const neededMasters: MasterInfo[] = [];
  for (const id of neededMasterIds) {
    const info = allMasters.get(id);
    if (info) neededMasters.push(info);
  }

  // Build the .vsdx ZIP
  const zip = new JSZip();

  // Content types
  const masterFiles = neededMasters.map(m => m.filename);
  zip.file("[Content_Types].xml", contentTypesXml(masterFiles));

  // Root relationships
  zip.file("_rels/.rels", ROOT_RELS);

  // Document
  zip.file("visio/document.xml", documentXml());
  zip.file("visio/_rels/document.xml.rels", DOC_RELS);

  // Masters
  zip.file("visio/masters/masters.xml", mastersIndexXml(neededMasters));
  zip.file("visio/masters/_rels/masters.xml.rels", mastersRelsXml(neededMasters));

  // Copy each needed master XML from the stencil
  for (const master of neededMasters) {
    const path = `visio/masters/${master.filename}`;
    const content = await stencil.file(path)?.async("string");
    if (content) {
      zip.file(path, content);
    }
  }

  // Pages
  zip.file("visio/pages/pages.xml", pagesXml(pageW, pageH));
  zip.file("visio/pages/_rels/pages.xml.rels", PAGES_RELS);
  zip.file("visio/pages/page1.xml", pageContentXml(shapesXml, connectsXml, pageW, pageH));

  // Doc properties
  zip.file("docProps/core.xml", corePropsXml(diagramName));
  zip.file("docProps/app.xml", APP_PROPS_XML);

  // Generate and download
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.ms-visio.drawing",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${diagramName}.vsdx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

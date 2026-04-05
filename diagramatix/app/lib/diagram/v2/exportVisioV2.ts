/**
 * V2 Visio Export — Template base + BPMN_M masters merged in.
 * Uses template for infrastructure (document.xml, theme, styles).
 * Adds missing BPMN_M masters (Gateway, Intermediate Event, Data Object, etc.).
 * COMPLETELY INDEPENDENT from V1 export code.
 */
import JSZip from "jszip";
import type { DiagramData } from "../types";
import { getElementMappingV2, getConnectorMappingV2 } from "./visioMasterMapV2";

const VISIO_NS = "http://schemas.microsoft.com/office/visio/2012/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

function getDiagramBounds(data: DiagramData): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of data.elements) {
    minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width); maxY = Math.max(maxY, el.y + el.height);
  }
  for (const c of data.connectors) {
    for (const pt of c.waypoints) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
    }
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  return { minX, minY, maxX, maxY };
}

export async function exportVisioV2(
  data: DiagramData,
  diagramName: string,
  stencilBuffer: ArrayBuffer,
  templateBuffer: ArrayBuffer
): Promise<Uint8Array> {
  const base = await JSZip.loadAsync(templateBuffer);
  const bpmnM = await JSZip.loadAsync(stencilBuffer);

  const bounds = getDiagramBounds(data);
  const diagramW = (bounds.maxX - bounds.minX) / 96;
  const diagramH = (bounds.maxY - bounds.minY) / 96;
  const pageW = Math.max(11.69, diagramW + 2);
  const pageH = Math.max(8.27, diagramH + 2);
  const offsetX = (pageW - diagramW) / 2;
  const offsetY = (pageH - diagramH) / 2;

  // ── Step 1: Copy ALL template files ──
  const zip = new JSZip();
  for (const [fpath, entry] of Object.entries(base.files)) {
    if (!entry.dir) zip.file(fpath, await entry.async("uint8array"));
  }

  // ── Step 2: Add BPMN_M masters to the template ──
  // Parse BPMN_M masters.xml and rels
  const bpmnMastersXml = await bpmnM.file("visio/masters/masters.xml")!.async("string");
  const bpmnMRels = await bpmnM.file("visio/masters/_rels/masters.xml.rels")!.async("string");

  // Build BPMN_M ID → { rId, filename } map
  const bpmnRIdToFile: Record<string, string> = {};
  {
    let m;
    const re = /Id=["'](rId\d+)["'][^>]*Target=["']([^"']*)["']/g;
    while ((m = re.exec(bpmnMRels)) !== null) bpmnRIdToFile[m[1]] = m[2];
  }

  // Extract <Master> blocks from BPMN_M
  const bpmnMasterBlocks: Record<number, { block: string; rId: string; file: string }> = {};
  {
    let m;
    const re = /<Master\s+ID='(\d+)'[\s\S]*?<\/Master>/g;
    while ((m = re.exec(bpmnMastersXml)) !== null) {
      const id = parseInt(m[1]);
      const relMatch = m[0].match(/<Rel\s+r:id='(rId\d+)'/);
      if (relMatch && bpmnRIdToFile[relMatch[1]]) {
        bpmnMasterBlocks[id] = {
          block: m[0],
          rId: relMatch[1],
          file: bpmnRIdToFile[relMatch[1]],
        };
      }
    }
  }

  // Read template's masters.xml and rels
  let mastersXml = await base.file("visio/masters/masters.xml")!.async("string");
  let mastersRels = await base.file("visio/masters/_rels/masters.xml.rels")!.async("string");
  let contentTypes = await base.file("[Content_Types].xml")!.async("string");

  // Masters to add from BPMN_M (original ID → new ID in our file)
  const mastersToAdd: Array<{ origId: number; newId: number; name: string }> = [
    { origId: 4,  newId: 104, name: "Gateway" },
    { origId: 5,  newId: 105, name: "Intermediate Event" },
    { origId: 6,  newId: 106, name: "End Event BPMN" },
    { origId: 10, newId: 110, name: "Text Annotation" },
    { origId: 11, newId: 111, name: "Sequence Flow" },
    { origId: 12, newId: 112, name: "Association" },
    { origId: 15, newId: 115, name: "Data Object" },
    { origId: 16, newId: 116, name: "Data Store" },
    { origId: 17, newId: 117, name: "Group" },
  ];

  let nextRId = 50;
  let nextFileNum = 50;

  for (const entry of mastersToAdd) {
    const info = bpmnMasterBlocks[entry.origId];
    if (!info) { console.log(`[v2] BPMN_M master ${entry.origId} not found`); continue; }

    // Copy master content file with a new filename
    const newFileName = `master${nextFileNum++}.xml`;
    const masterContent = await bpmnM.file("visio/masters/" + info.file)?.async("string");
    if (!masterContent) { console.log(`[v2] Master file ${info.file} not found`); continue; }
    zip.file("visio/masters/" + newFileName, masterContent);

    // Create new <Master> entry with new ID and rId
    const newRId = `rId${nextRId++}`;
    let newBlock = info.block
      .replace(/ID='\d+'/, `ID='${entry.newId}'`)
      .replace(/<Rel\s+r:id='rId\d+'/, `<Rel r:id='${newRId}'`);

    // Add to masters.xml
    mastersXml = mastersXml.replace("</Masters>", newBlock + "</Masters>");

    // Add relationship
    mastersRels = mastersRels.replace("</Relationships>",
      `<Relationship Id="${newRId}" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="${newFileName}"/></Relationships>`);

    // Add content type
    contentTypes = contentTypes.replace("</Types>",
      `<Override PartName="/visio/masters/${newFileName}" ContentType="application/vnd.ms-visio.master+xml"/></Types>`);

    console.log(`[v2] Added master: ${entry.name} (${entry.origId} → ${entry.newId}) → ${newFileName}`);
  }

  // Write updated masters index and rels
  zip.file("visio/masters/masters.xml", mastersXml);
  zip.file("visio/masters/_rels/masters.xml.rels", mastersRels);
  zip.file("[Content_Types].xml", contentTypes);

  // Remove template's page1.xml.rels — it only references template masters,
  // not our added BPMN_M masters. Visio will use masters.xml instead.
  zip.remove("visio/pages/_rels/page1.xml.rels");

  // ── Step 3: Build shapes ──
  const shapes: string[] = [];
  const connects: string[] = [];
  const elIdToShapeId = new Map<string, number>();
  let nextId = 100;

  for (const el of data.elements) {
    const mapping = getElementMappingV2(el);
    if (!mapping) continue;

    const shapeId = nextId;
    nextId += 100;
    elIdToShapeId.set(el.id, shapeId);

    const cx = (el.x + el.width / 2 - bounds.minX) / 96 + offsetX;
    const cy = pageH - (el.y + el.height / 2 - bounds.minY) / 96 - offsetY;

    // Property overrides
    let propSection = "";
    const propEntries = Object.entries(mapping.properties);
    if (propEntries.length > 0) {
      propSection = `<Section N='Property'>` +
        propEntries.map(([name, value]) =>
          `<Row N='${name}'><Cell N='Value' V='${esc(value)}' U='STR'/></Row>`
        ).join("") +
        `</Section>`;
    }

    const textEl = el.label ? `<Text>${esc(el.label)}</Text>` : "";

    shapes.push(
      `<Shape ID='${shapeId}' NameU='${esc(el.label || el.type)}' Type='Group' Master='${mapping.masterId}'>` +
      `<Cell N='PinX' V='${cx}'/>` +
      `<Cell N='PinY' V='${cy}'/>` +
      propSection +
      textEl +
      `</Shape>`
    );
  }

  // ── Step 4: Connectors ──
  for (const conn of data.connectors) {
    const mapping = getConnectorMappingV2(conn);
    const shapeId = nextId;
    nextId += 100;

    const srcShapeId = elIdToShapeId.get(conn.sourceId);
    const tgtShapeId = elIdToShapeId.get(conn.targetId);
    if (srcShapeId == null || tgtShapeId == null) continue;

    const wp = conn.waypoints ?? [];
    const visStart = conn.sourceInvisibleLeader ? 1 : 0;
    const visEnd = conn.targetInvisibleLeader ? wp.length - 2 : wp.length - 1;
    const visPts = wp.slice(visStart, visEnd + 1);
    if (visPts.length < 2) continue;

    const p0 = visPts[0];
    const pN = visPts[visPts.length - 1];
    const bx = (p0.x - bounds.minX) / 96 + offsetX;
    const by = pageH - (p0.y - bounds.minY) / 96 - offsetY;
    const ex = (pN.x - bounds.minX) / 96 + offsetX;
    const ey = pageH - (pN.y - bounds.minY) / 96 - offsetY;
    const dx = ex - bx;
    const dy = ey - by;

    let geomRows = `<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>`;
    if (visPts.length > 2) {
      for (let i = 1; i < visPts.length; i++) {
        const rx = (visPts[i].x - visPts[0].x) / 96;
        const ry = -(visPts[i].y - visPts[0].y) / 96;
        geomRows += `<Row T='LineTo' IX='${i + 1}'><Cell N='X' V='${rx}'/><Cell N='Y' V='${ry}'/></Row>`;
      }
    } else {
      geomRows += `<Row T='LineTo' IX='2'><Cell N='X' V='${dx}'/><Cell N='Y' V='${dy}'/></Row>`;
    }

    const textEl = conn.label ? `<Text>${esc(conn.label)}</Text>` : "";

    shapes.push(
      `<Shape ID='${shapeId}' NameU='${esc(conn.label || conn.type)}' Type='Shape' Master='${mapping.masterId}'>` +
      `<Cell N='PinX' V='${(bx + ex) / 2}' F='GUARD((BeginX+EndX)/2)'/>` +
      `<Cell N='PinY' V='${(by + ey) / 2}' F='GUARD((BeginY+EndY)/2)'/>` +
      `<Cell N='Width' V='${dx}' F='GUARD(EndX-BeginX)'/>` +
      `<Cell N='Height' V='${dy}' F='GUARD(EndY-BeginY)'/>` +
      `<Cell N='LocPinX' V='${dx / 2}' F='GUARD(Width*0.5)'/>` +
      `<Cell N='LocPinY' V='${dy / 2}' F='GUARD(Height*0.5)'/>` +
      `<Cell N='Angle' V='0' F='GUARD(0DA)'/>` +
      `<Cell N='FlipX' V='0' F='GUARD(FALSE)'/>` +
      `<Cell N='FlipY' V='0' F='GUARD(FALSE)'/>` +
      `<Cell N='BeginX' V='${bx}' F='_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'/>` +
      `<Cell N='BeginY' V='${by}' F='_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'/>` +
      `<Cell N='EndX' V='${ex}' F='_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'/>` +
      `<Cell N='EndY' V='${ey}' F='_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'/>` +
      `<Cell N='ObjType' V='2'/>` +
      `<Cell N='LineWeight' V='0.01041666666666667'/>` +
      `<Cell N='EndArrowSize' V='2'/>` +
      `<Cell N='BeginArrowSize' V='2'/>` +
      `<Cell N='BegTrigger' V='2' F='_XFTRIGGER(Sheet.${srcShapeId}!EventXFMod)'/>` +
      `<Cell N='EndTrigger' V='2' F='_XFTRIGGER(Sheet.${tgtShapeId}!EventXFMod)'/>` +
      `<Cell N='ConFixedCode' V='6'/>` +
      `<Section N='Geometry' IX='0'>` +
      `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
      geomRows +
      `</Section>` +
      textEl +
      `</Shape>`
    );

    connects.push(
      `<Connect FromSheet='${shapeId}' FromCell='BeginX' FromPart='9' ToSheet='${srcShapeId}' ToCell='PinX' ToPart='3'/>` +
      `<Connect FromSheet='${shapeId}' FromCell='EndX' FromPart='12' ToSheet='${tgtShapeId}' ToCell='PinX' ToPart='3'/>`
    );
  }

  // ── Step 5: Write page content ──
  zip.file("visio/pages/page1.xml",
    `<?xml version='1.0' encoding='utf-8' ?>` +
    `<PageContents xmlns='${VISIO_NS}' xmlns:r='${REL_NS}' xml:space='preserve'>` +
    `<Shapes>${shapes.join("")}</Shapes>` +
    (connects.length > 0 ? `<Connects>${connects.join("")}</Connects>` : "") +
    `</PageContents>`);

  zip.file("visio/pages/pages.xml",
    `<?xml version='1.0' encoding='utf-8' ?>` +
    `<Pages xmlns='${VISIO_NS}' xmlns:r='${REL_NS}' xml:space='preserve'>` +
    `<Page ID='0' NameU='Page-1' Name='Page-1' ViewScale='-1' ViewCenterX='${pageW / 2}' ViewCenterY='${pageH / 2}'>` +
    `<PageSheet LineStyle='0' FillStyle='0' TextStyle='0'>` +
    `<Cell N='PageWidth' V='${pageW}'/>` +
    `<Cell N='PageHeight' V='${pageH}'/>` +
    `<Cell N='ShdwOffsetX' V='0.118'/>` +
    `<Cell N='ShdwOffsetY' V='-0.118'/>` +
    `<Cell N='PageScale' V='1' U='IN_F'/>` +
    `<Cell N='DrawingScale' V='1' U='IN_F'/>` +
    `<Cell N='DrawingSizeType' V='0'/>` +
    `<Cell N='DrawingScaleType' V='0'/>` +
    `<Cell N='InhibitSnap' V='0'/>` +
    `<Cell N='UIVisibility' V='0'/>` +
    `<Cell N='ShdwType' V='0'/>` +
    `<Cell N='ShdwObliqueAngle' V='0'/>` +
    `<Cell N='ShdwScaleFactor' V='1'/>` +
    `<Cell N='DrawingResizeType' V='1'/>` +
    `<Cell N='PageShapeSplit' V='1'/>` +
    `</PageSheet>` +
    `<Rel r:id='rId1'/>` +
    `</Page></Pages>`);

  // Doc properties
  const now = new Date().toISOString();
  zip.file("docProps/core.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${esc(diagramName)}</dc:title><dc:creator>Diagramatix</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    '</cp:coreProperties>');

  zip.file("docProps/app.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>Diagramatix</Application></Properties>');

  return await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

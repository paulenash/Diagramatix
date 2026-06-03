/**
 * V3 Visio Bulk Export — composes N single-page .vsdx files (each produced
 * by the existing `exportVisioV3`) into one multi-page .vsdx, deduplicating
 * masters by content so the file stays compact.
 *
 * Strategy: run `exportVisioV3` once per diagram, then merge:
 *   - Diagram 1's .vsdx is the base.
 *   - For each subsequent .vsdx:
 *       1. Hash every master_*.xml; identical-content masters reuse the base
 *          master ID, distinct ones get fresh IDs allocated in the base.
 *       2. Rewrite `Master='OLD'` references in that .vsdx's page1.xml
 *          per the remap, then drop it into the base as pageN.xml.
 *       3. Append a new <Page ID='N-1'> to pages.xml, a new Relationship to
 *          pages.xml.rels, and a new Override to [Content_Types].xml.
 *
 * Keeps `exportVisioV3` (3000+ lines) untouched — same code paths the
 * single-export route exercises, so the single-export contract is unchanged.
 */
import JSZip from "jszip";
import type { DiagramData } from "../types";
import type { StencilProfile } from "./stencilProfile";
import { DEFAULT_PROFILE } from "./stencilProfile";
import type { SymbolColorConfig } from "../colors";
import { exportVisioV3 } from "./exportVisioV3";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export interface BulkDiagramInput {
  data: DiagramData;
  name: string;
  /** Per-diagram effective colour config (project ← diagram overrides). */
  colorConfig?: SymbolColorConfig;
  /** Per-diagram displayMode ("normal" or "hand-drawn"). */
  displayMode?: string;
}

interface MasterEntry {
  /** Numeric master ID (matches `<Master ID='N'>`). */
  id: number;
  /** rId in masters.xml.rels (e.g. "rId50"). */
  rId: string;
  /** File name inside visio/masters/ (e.g. "master50.xml"). */
  file: string;
  /** Master XML file content — used for dedup. */
  content: string;
  /** The <Master>...</Master> block from masters.xml. */
  block: string;
}

/** Parse base masters.xml + rels and load every master file. */
async function parseMasters(
  zip: JSZip,
): Promise<{ masters: MasterEntry[]; mastersXml: string; mastersRels: string }> {
  const mastersXml = await zip.file("visio/masters/masters.xml")!.async("string");
  const mastersRels = await zip.file("visio/masters/_rels/masters.xml.rels")!.async("string");
  // rId → file name
  const rIdToFile: Record<string, string> = {};
  const relRe = /<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let r: RegExpExecArray | null;
  while ((r = relRe.exec(mastersRels)) !== null) rIdToFile[r[1]] = r[2];

  const masters: MasterEntry[] = [];
  const blockRe = /<Master\s+ID='(\d+)'[\s\S]*?<\/Master>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(mastersXml)) !== null) {
    const id = parseInt(m[1], 10);
    const block = m[0];
    const relMatch = block.match(/<Rel\s+r:id='([^']+)'/);
    if (!relMatch) continue;
    const rId = relMatch[1];
    const file = rIdToFile[rId];
    if (!file) continue;
    const entry = zip.file(`visio/masters/${file}`);
    if (!entry) continue;
    const content = await entry.async("string");
    masters.push({ id, rId, file, content, block });
  }
  return { masters, mastersXml, mastersRels };
}

/** Extract the highest numeric suffix from existing master*.xml entries
 *  so we can allocate fresh file names without collision. */
function maxMasterFileNum(zip: JSZip): number {
  let max = 0;
  for (const fp of Object.keys(zip.files)) {
    const m = fp.match(/^visio\/masters\/master(\d+)\.xml$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/** Highest rId number in a *.rels file (any prefix, returns the suffix int). */
function maxRId(relsXml: string): number {
  let max = 0;
  const re = /Id="rId(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml)) !== null) max = Math.max(max, parseInt(m[1], 10));
  return max;
}

/** Replace every `Master='OLD'` occurrence with `Master='NEW'` per remap,
 *  in a single pass to avoid double-substitution when ids share prefixes
 *  (e.g. remap 5→50 and 50→500 done sequentially would chain). */
function remapMasterRefs(pageXml: string, idRemap: Map<number, number>): string {
  if (idRemap.size === 0) return pageXml;
  const ids = [...idRemap.keys()];
  // Longer numeric strings first defends against literal substring overlap
  // even though the surrounding `'` quoting already disambiguates.
  ids.sort((a, b) => String(b).length - String(a).length);
  const re = new RegExp(`Master='(${ids.join("|")})'`, "g");
  return pageXml.replace(re, (_whole, idStr: string) => {
    const newId = idRemap.get(parseInt(idStr, 10));
    return newId !== undefined ? `Master='${newId}'` : _whole;
  });
}

/** Parse a single `<Page>...</Page>` block out of pages.xml and return its
 *  PageSheet, ViewCenterX, ViewCenterY. The wrapper `<Page>` is rebuilt by
 *  the caller with new ID / Name. */
function extractPageInternals(pagesXml: string): {
  pageSheet: string;
  viewCenterX: string;
  viewCenterY: string;
} {
  const sheetMatch = pagesXml.match(/<PageSheet[\s\S]*?<\/PageSheet>/);
  const vcx = pagesXml.match(/ViewCenterX='([^']+)'/)?.[1] ?? "5.85";
  const vcy = pagesXml.match(/ViewCenterY='([^']+)'/)?.[1] ?? "4.135";
  return { pageSheet: sheetMatch?.[0] ?? "", viewCenterX: vcx, viewCenterY: vcy };
}

/**
 * Render N diagrams into a single multi-page .vsdx. Caller is responsible
 * for ordering the input array — pages appear in that order.
 *
 * @param diagrams       Ordered list. Each becomes one Visio Page.
 * @param stencilBuffer  Stencil .vssx bytes (e.g. v1.5 modified stencil).
 * @param templateBuffer Template .vsdx bytes.
 * @param profile        StencilProfile (default = BPMN_M; pass v1.5 here).
 * @param projectTitle   Used as the .vsdx's dc:title in docProps/core.xml.
 */
export async function exportVisioV3Bulk(
  diagrams: BulkDiagramInput[],
  stencilBuffer: ArrayBuffer,
  templateBuffer: ArrayBuffer,
  profile: StencilProfile = DEFAULT_PROFILE,
  projectTitle: string = "Diagramatix Export",
  cffRefBuffer?: ArrayBuffer,
): Promise<Uint8Array> {
  if (diagrams.length === 0) throw new Error("exportVisioV3Bulk: no diagrams supplied");

  // 1. Render each diagram to its own .vsdx using the unchanged single exporter.
  const perDiagramBytes: Uint8Array[] = [];
  for (const d of diagrams) {
    const bytes = await exportVisioV3(
      d.data,
      d.name,
      stencilBuffer,
      templateBuffer,
      d.displayMode ?? "normal",
      d.colorConfig,
      profile,
      cffRefBuffer,
    );
    perDiagramBytes.push(bytes);
  }

  // 2. Base = diagram 1's .vsdx. Load mutable state.
  const base = await JSZip.loadAsync(perDiagramBytes[0]);
  let mastersXml = await base.file("visio/masters/masters.xml")!.async("string");
  let mastersRels = await base.file("visio/masters/_rels/masters.xml.rels")!.async("string");
  let contentTypes = await base.file("[Content_Types].xml")!.async("string");
  let pagesXml = await base.file("visio/pages/pages.xml")!.async("string");
  let pagesRels = await base.file("visio/pages/_rels/pages.xml.rels")!.async("string");

  // Inventory of base masters keyed by file-content (for cross-diagram dedup).
  const { masters: baseMasters } = await parseMasters(base);
  const contentToId = new Map<string, number>();
  let nextMasterId = 0;
  for (const m of baseMasters) {
    if (!contentToId.has(m.content)) contentToId.set(m.content, m.id);
    if (m.id > nextMasterId) nextMasterId = m.id;
  }
  let nextFileNum = maxMasterFileNum(base);
  let nextMastersRId = maxRId(mastersRels);
  let nextPagesRId = maxRId(pagesRels);

  // 3. Rewrite page 1's <Page ID='0' NameU='Page-1' Name='Page-1'> to use
  //    the actual diagram name. Page sheet (PageWidth etc.) is already correct.
  const firstName = esc(diagrams[0].name);
  pagesXml = pagesXml.replace(
    /<Page\s+ID='0'\s+NameU='Page-1'\s+Name='Page-1'/,
    `<Page ID='0' NameU='${firstName}' Name='${firstName}'`,
  );

  // 4. Graft pages 2..N from the remaining .vsdxs.
  for (let i = 1; i < perDiagramBytes.length; i++) {
    const other = await JSZip.loadAsync(perDiagramBytes[i]);
    const otherPage1 = await other.file("visio/pages/page1.xml")!.async("string");
    const otherPagesXml = await other.file("visio/pages/pages.xml")!.async("string");
    const { masters: otherMasters } = await parseMasters(other);

    // Build idRemap (old → new) by content-hashing every other master.
    const idRemap = new Map<number, number>();
    for (const om of otherMasters) {
      const existingId = contentToId.get(om.content);
      if (existingId !== undefined) {
        idRemap.set(om.id, existingId);
        continue;
      }
      // Fresh allocation in base.
      const newId = ++nextMasterId;
      const newRId = `rId${++nextMastersRId}`;
      const newFileName = `master${++nextFileNum}.xml`;
      contentToId.set(om.content, newId);
      idRemap.set(om.id, newId);

      base.file(`visio/masters/${newFileName}`, om.content);
      const newBlock = om.block
        .replace(/ID='\d+'/, `ID='${newId}'`)
        .replace(/<Rel\s+r:id='[^']+'/, `<Rel r:id='${newRId}'`);
      mastersXml = mastersXml.replace("</Masters>", newBlock + "</Masters>");
      mastersRels = mastersRels.replace(
        "</Relationships>",
        `<Relationship Id="${newRId}" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="${newFileName}"/></Relationships>`,
      );
      contentTypes = contentTypes.replace(
        "</Types>",
        `<Override PartName="/visio/masters/${newFileName}" ContentType="application/vnd.ms-visio.master+xml"/></Types>`,
      );
    }

    // Rewrite Master='OLD' refs in the other diagram's page contents.
    const remappedPage = remapMasterRefs(otherPage1, idRemap);

    // Drop in as pageN.xml.
    const pageFileNum = i + 1;
    base.file(`visio/pages/page${pageFileNum}.xml`, remappedPage);

    // Build a new <Page ID='i' ...> entry — page-scoped sheet copied verbatim.
    const { pageSheet, viewCenterX, viewCenterY } = extractPageInternals(otherPagesXml);
    const pageName = esc(diagrams[i].name);
    const pagesRelId = `rId${++nextPagesRId}`;
    const newPageEntry =
      `<Page ID='${i}' NameU='${pageName}' Name='${pageName}' ViewScale='-1' ` +
      `ViewCenterX='${viewCenterX}' ViewCenterY='${viewCenterY}'>` +
      pageSheet +
      `<Rel r:id='${pagesRelId}'/>` +
      `</Page>`;
    pagesXml = pagesXml.replace("</Pages>", newPageEntry + "</Pages>");
    pagesRels = pagesRels.replace(
      "</Relationships>",
      `<Relationship Id="${pagesRelId}" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page${pageFileNum}.xml"/></Relationships>`,
    );
    contentTypes = contentTypes.replace(
      "</Types>",
      `<Override PartName="/visio/pages/page${pageFileNum}.xml" ContentType="application/vnd.ms-visio.page+xml"/></Types>`,
    );
  }

  // 5. Write mutated index files back.
  base.file("visio/masters/masters.xml", mastersXml);
  base.file("visio/masters/_rels/masters.xml.rels", mastersRels);
  base.file("[Content_Types].xml", contentTypes);
  base.file("visio/pages/pages.xml", pagesXml);
  base.file("visio/pages/_rels/pages.xml.rels", pagesRels);

  // 6. Refresh docProps with the project title.
  const now = new Date().toISOString();
  base.file(
    "docProps/core.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${esc(projectTitle)}</dc:title><dc:creator>Diagramatix</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
      "</cp:coreProperties>",
  );

  return await base.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/**
 * V3 Visio Export — Template base + BPMN_M masters merged in.
 * Uses template for infrastructure (document.xml, theme, styles).
 * Adds missing BPMN_M masters (Gateway, Intermediate Event, Data Object, etc.).
 * COMPLETELY INDEPENDENT from V1 and V2 export code — modify freely.
 */
import JSZip from "jszip";
import type { DiagramData } from "../types";
import { getElementMappingV3, getConnectorMappingV3 } from "./visioMasterMapV3";
import { DEFAULT_SYMBOL_COLORS } from "../colors";
import type { SymbolColorConfig } from "../colors";
import { randomUUID } from "node:crypto";

/** Visio-style GUID `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`. Used so per-
 *  instance master copies don't share BaseID/UniqueID with anything in the
 *  user's locally-installed Microsoft stencil cache. */
function freshGuid(): string {
  return `{${randomUUID().toUpperCase()}}`;
}

const VISIO_NS = "http://schemas.microsoft.com/office/visio/2012/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Convert hex color like "#fef9c3" to Visio GUARD(RGB(r,g,b)) cell value */
function hexToVisioRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `GUARD(RGB(${r},${g},${b}))`;
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

export async function exportVisioV3(
  data: DiagramData,
  diagramName: string,
  stencilBuffer: ArrayBuffer,
  templateBuffer: ArrayBuffer,
  displayMode: string = "normal",
  colorConfig?: SymbolColorConfig
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

  // Colour setup — needed before master processing
  const isColor = displayMode !== "hand-drawn";
  const colorMap: Record<string, string> = isColor
    ? (colorConfig as Record<string, string>) ?? DEFAULT_SYMBOL_COLORS
    : {};

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
  // Note: Template "Start Event" (8) and "End Event" (15) are Phase markers,
  // not BPMN events. We import the real BPMN events from BPMN_M.
  const mastersToAdd: Array<{ origId: number; newId: number; name: string }> = [
    { origId: 4,  newId: 104, name: "Gateway" },
    { origId: 5,  newId: 105, name: "Intermediate Event" },
    { origId: 6,  newId: 106, name: "End Event" },
    { origId: 7,  newId: 107, name: "Start Event" },
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
    if (!info) { console.log(`[v3] BPMN_M master ${entry.origId} not found`); continue; }

    // Copy master content file with a new filename. Master fills are
    // PRE-COLOURED at build time by `scripts/buildVisioStencilV3.cjs`,
    // so the master XML is used verbatim — no per-export fill injection.
    // Project / diagram colour overrides and BW mode are applied per
    // shape instance via `fillCells()` further below.
    const newFileName = `master${nextFileNum++}.xml`;
    const masterContent = await bpmnM.file("visio/masters/" + info.file)?.async("string");
    if (!masterContent) { console.log(`[v3] Master file ${info.file} not found`); continue; }

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

  // Template masters (Task=9, Subprocess=33) are PRE-COLOURED at build
  // time by `scripts/buildVisioStencilV3.cjs`. No per-export injection.

  // ── Step 3: Build shapes ──
  // Font sizes from diagram settings (px → Visio inches: px / 96 * 72 / 72 = px / 96)
  // Visio Character.Size is in inches (e.g. 0.125 = 9pt)
  const elFontPx = data.fontSize ?? 12;
  const connFontPx = data.connectorFontSize ?? 10;
  const elFontIn = elFontPx / 96;        // px to inches
  const connFontIn = connFontPx / 96;
  const elCharSection = `<Section N='Character' IX='0'><Row IX='0'><Cell N='Size' V='${elFontIn}'/></Row></Section>`;
  const connCharSection = `<Section N='Character' IX='0'><Row IX='0'><Cell N='Size' V='${connFontIn}'/></Row></Section>`;

  function fillCells(elType: string): string {
    const hex = colorMap[elType];
    if (!hex || !isColor) return "";
    return `<Cell N='FillForegnd' V='${hex}' F='${hexToVisioRgb(hex)}'/>` +
      `<Cell N='FillPattern' V='1' F='GUARD(1)'/>`;
  }

  /** Bake `colour` into every body FillForegnd cell of a master XML, mirroring
   *  `scripts/buildVisioStencilV3.cjs`. Replaces white-with-formula-lock cells
   *  (`V='1' F='GUARD(...)'` and `V='#ffffff' F='THEMEGUARD(RGB(255,255,255))'`)
   *  with non-GUARDed RGB values. `V='0' F='GUARD(0)'` (intentional black
   *  marker strokes) is left alone. */
  function bakeColourIntoMaster(content: string, colour: string): string {
    const r = parseInt(colour.slice(1, 3), 16);
    const g = parseInt(colour.slice(3, 5), 16);
    const b = parseInt(colour.slice(5, 7), 16);
    // Only touch Shape ID='6' (the visible body). Earlier we replaced
    // `V='1' F='GUARD(...)'` cells globally, which painted over the master's
    // marker sub-shapes (task-type icons, event triggers) — those use the
    // same cell pattern legitimately to drive conditional visibility.
    const shape6 = content.match(/<Shape ID='6'[^>]*>/);
    if (!shape6) return content;
    const shapeStart = shape6.index!;
    const shapeOpenEnd = shapeStart + shape6[0].length;
    const nextShape = content.indexOf("<Shape ID=", shapeOpenEnd);
    const bodyEnd = nextShape === -1 ? content.length : nextShape;
    const bodyTextOriginal = content.slice(shapeOpenEnd, bodyEnd);

    // Drop any FillStyle on the opening tag — Pool/Lane's coloured shape
    // uses FillStyle='3' (no theme inheritance), template masters use '7'
    // (themed white). Force '3' so our cell-level FillForegnd wins.
    const newOpen = shape6[0].replace(/FillStyle='\d+'/, "FillStyle='3'");

    // Inside Shape 6's block, replace any V='1' GUARD or white THEMEGUARD
    // cells with our colour, AND inject FillForegnd + FillPattern if Shape 6
    // has none.
    const colourCell = `<Cell N='FillForegnd' V='${colour}' F='RGB(${r},${g},${b})'/>`;
    let bodyTextNew = bodyTextOriginal
      .replace(/<Cell N='FillForegnd' V='1' F='GUARD\([^']+\)'\/>/g, colourCell)
      .replace(
        /<Cell N='FillForegnd' V='#ffffff' F='THEMEGUARD\(RGB\(255,255,255\)\)'\/>/g,
        `<Cell N='FillForegnd' V='${colour}' F='THEMEGUARD(RGB(${r},${g},${b}))'/>`,
      );

    if (!/<Cell N='FillForegnd'/.test(bodyTextNew)) {
      bodyTextNew =
        `<Cell N='FillForegnd' V='${colour}' F='RGB(${r},${g},${b})'/>` +
        `<Cell N='FillPattern' V='1' F='RGB(0,0,0)*0+1'/>` +
        bodyTextNew;
    }

    return (
      content.slice(0, shapeStart) +
      newOpen +
      bodyTextNew +
      content.slice(bodyEnd)
    );
  }

  /** For each `<Shape ID='N'>` whose own Width formula references
   *  `Sheet.[57]!Width` (i.e. it was just rescaled), scale the cached V
   *  on every cell whose formula references the shape's local `Width` or
   *  `Height` (e.g. `Width*0.5`, `Width*1`, `Height*0.66`). Covers
   *  LocPinX/LocPinY *and* the X/Y cached V's inside Geometry-section
   *  Rows, which Visio uses for first paint of the body outline. Marker
   *  shapes and other sub-shapes whose Width/Height aren't tied to the
   *  body chain are skipped — their cached values remain correct.
   *
   *  Walks Shape openings and identifies the "direct body" of each shape
   *  (cells/sections before the first nested `<Shape ID='` or the
   *  shape's own `</Shape>`). */
  function scaleLocalLocPin(
    content: string,
    wRatio: number,
    hRatio: number,
  ): string {
    const openRe = /<Shape ID='(\d+)'[^>]*>/g;
    let result = "";
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = openRe.exec(content)) !== null) {
      const shapeId = m[1];
      const openEnd = m.index + m[0].length;
      result += content.slice(lastIdx, openEnd);
      const nextOpen = content.indexOf("<Shape ID='", openEnd);
      const nextClose = content.indexOf("</Shape>", openEnd);
      let bodyEnd: number;
      if (nextClose === -1) {
        result += content.slice(openEnd);
        lastIdx = content.length;
        break;
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        bodyEnd = nextOpen;
      } else {
        bodyEnd = nextClose;
      }
      let directBody = content.slice(openEnd, bodyEnd);
      // Shape 5 (the master root) is always rescaled — createInstanceMaster
      // explicitly rewrites its Width/Height/LocPin to instance dims. So
      // its Geometry rows (used by single-shape masters like Data Store /
      // Data Object that draw the body directly on the root) need scaling
      // too. For sub-shapes 6+, decide by inspecting their own Width/Height
      // formulas for body-chain refs.
      const isRoot = shapeId === "5";
      const widthF = directBody.match(
        /<Cell N='Width' V='[\d.]+'[^>]*F='([^']+)'/,
      )?.[1];
      const heightF = directBody.match(
        /<Cell N='Height' V='[\d.]+'[^>]*F='([^']+)'/,
      )?.[1];
      const widthScaled =
        isRoot || (!!widthF && /Sheet\.[57]!Width/.test(widthF));
      const heightScaled =
        isRoot || (!!heightF && /Sheet\.[57]!Height/.test(heightF));
      if (widthScaled || heightScaled) {
        directBody = directBody.replace(
          /<Cell N='([A-Za-z0-9]+)' V='([\d.]+)'([^>]*F='([^']+)')\s*\/>/g,
          (whole, cellName, vStr, rest, fStr) => {
            // Decide which dimension this cell scales with by inspecting
            // the formula. Matches:
            //   F='Width*X'         → wRatio
            //   F='Height*Y'        → hRatio
            //   F='GeometryN.XM'    → wRatio (Visio close-path refs)
            //   F='GeometryN.YM'    → hRatio
            // Cells with `Sheet.X!` refs are already handled by the earlier
            // pass; they're safe to skip here because Width|Height after a
            // `!` doesn't match the patterns below.
            let dim: "W" | "H" | null = null;
            if (/^Width\*/.test(fStr)) dim = "W";
            else if (/^Height\*/.test(fStr)) dim = "H";
            else if (/^Geometry\d+\.X\d+/.test(fStr)) dim = "W";
            else if (/^Geometry\d+\.Y\d+/.test(fStr)) dim = "H";
            if (!dim) return whole;
            if (dim === "W" && !widthScaled) return whole;
            if (dim === "H" && !heightScaled) return whole;
            const v = parseFloat(vStr);
            if (!isFinite(v) || v === 0) return whole;
            const ratio = dim === "W" ? wRatio : hRatio;
            return `<Cell N='${cellName}' V='${v * ratio}'${rest}/>`;
          },
        );
      }
      result += directBody;
      lastIdx = bodyEnd;
      openRe.lastIndex = bodyEnd;
    }
    result += content.slice(lastIdx);
    return result;
  }

  /** Apply the `3MM → 4.58MM` (X, +6px) and `3MM → 3.26MM` (Y, +1px)
   *  marker-icon nudge inside the `<Shape ID='${shapeId}'>...</Shape>`
   *  block only. Walks Shape opens/closes to find the correct matching
   *  close (Shape elements can nest, so a non-greedy regex would
   *  mis-match). Other Shape blocks in the same master are left
   *  untouched. */
  function nudgeMarkerShapeBlock(content: string, shapeId: number): string {
    const openRe = new RegExp(`<Shape ID='${shapeId}'[^>]*>`);
    const openMatch = content.match(openRe);
    if (!openMatch || openMatch.index === undefined) return content;
    const start = openMatch.index;
    let pos = start + openMatch[0].length;
    let depth = 1;
    while (depth > 0 && pos < content.length) {
      const nextOpen = content.indexOf("<Shape ", pos);
      const nextClose = content.indexOf("</Shape>", pos);
      if (nextClose === -1) return content;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + "<Shape ".length;
      } else {
        depth--;
        pos = nextClose + "</Shape>".length;
      }
    }
    const block = content.slice(start, pos);
    const nudged = block
      .replace(
        /GUARD\(3MM\*Sheet\.5!DropOnPageScale\)/g,
        "GUARD(4.58MM*Sheet.5!DropOnPageScale)",
      )
      .replace(
        /GUARD\(Sheet\.5!Height-3MM\*Sheet\.5!DropOnPageScale\)/g,
        "GUARD(Sheet.5!Height-3.26MM*Sheet.5!DropOnPageScale)",
      );
    return content.slice(0, start) + nudged + content.slice(pos);
  }

  /** Create a per-instance master copy of `sourceMasterId` with `colour` baked
   *  in and a fresh BaseID/UniqueID. Updates `mastersXml`, `mastersRels`,
   *  `contentTypes` (the local mutable strings, then re-writes them to the
   *  zip — same pattern Pool/Lane uses on line 422). Returns the new
   *  master ID, or `sourceMasterId` if the source can't be found.
   *
   *  This bypasses Visio's tendency to silently substitute a master with the
   *  user's locally-installed Microsoft BPMN_M version (which would discard
   *  our colour edits). */
  let nextInstanceMasterId = 1000;
  async function createInstanceMaster(
    sourceMasterId: number,
    colour: string,
    instanceW?: number,
    instanceH?: number,
  ): Promise<number> {
    const blockRe = new RegExp(`<Master\\s+ID='${sourceMasterId}'[\\s\\S]*?</Master>`);
    const blockMatch = mastersXml.match(blockRe);
    if (!blockMatch) return sourceMasterId;
    const sourceBlock = blockMatch[0];

    const relMatch = sourceBlock.match(/<Rel\s+r:id='(rId\d+)'/);
    if (!relMatch) return sourceMasterId;
    const fileMatch = mastersRels.match(
      new RegExp(`Id=["']${relMatch[1]}["'][^>]*Target=["']([^"']+)["']`),
    );
    if (!fileMatch) return sourceMasterId;
    const sourceFile = fileMatch[1];

    let masterContent = await zip.file(`visio/masters/${sourceFile}`)?.async("string");
    if (!masterContent) return sourceMasterId;

    masterContent = bakeColourIntoMaster(masterContent, colour);

    // Task task-type markers (User/Service/Send/Receive/Manual/Script/
    // BusinessRule) need to sit 6px to the right and ~1px below the
    // master's natural `3MM` icon-anchor position so they line up inside
    // the (corrected) visible body of the resized Task. Apply the nudge
    // by replacing `3MM` with `4.58MM` for X (3MM + 6px ≈ 1.59mm) and
    // `3MM` with `3.26MM` for Y (3MM + 1px) inside the marker shape
    // blocks only — the same `3MM` constant is reused by other task
    // sub-shapes for body-relative positioning, so a global replace would
    // break body alignment.
    if (sourceMasterId === 9) {
      const taskMarkerShapeIds = [18, 19, 20, 21, 22, 23, 25, 26];
      for (const msId of taskMarkerShapeIds) {
        masterContent = nudgeMarkerShapeBlock(masterContent, msId);
      }
    }

    // Resize the per-instance master to match the actual instance
    // dimensions. Visio uses cached `V=` on first paint, before evaluating
    // formulas — so master sub-shapes with `F='Sheet.5!Width*1'` paint at
    // the natural-size cached V even if the instance Width is different.
    //
    // Approach: rewrite cached V on every cell whose formula references the
    // body-chain sheets (`Sheet.5!Width|Height` or `Sheet.7!Width|Height`)
    // by scaling V proportionally to the resize ratio. This catches:
    //  - Shape 6/7 body cells (`Sheet.5!Width*1` / `*0.5`)
    //  - Shape 8 outline cells (`Sheet.7!Width*1` — Sheet.7 inherits 5)
    //  - Shape 9 inset body cells (`Sheet.7!Width-0.05*DropOnPageScale`)
    //  - Sub-shapes using non-trivial factors (e.g. DataObject Shape 7
    //    with `Sheet.5!Width*0.125` for the folded corner)
    // Marker shapes whose formulas use `Sheet.5!DropOnPageScale` or
    // `Sheet.5!User.BpmnIconHeight` are NOT matched (regex requires
    // `Width|Height` directly after `!`), so their offsets remain intact.
    if (instanceW !== undefined && instanceH !== undefined) {
      const root5 = masterContent.match(
        /<Shape ID='5'[^>]*>([\s\S]*?)<\/Shape>/,
      );
      if (root5) {
        const naturalW = root5[1].match(/<Cell N='Width' V='([\d.]+)'/)?.[1];
        const naturalH = root5[1].match(/<Cell N='Height' V='([\d.]+)'/)?.[1];
        if (naturalW && naturalH) {
          const nW = parseFloat(naturalW);
          const nH = parseFloat(naturalH);
          if (Math.abs(nW - instanceW) > 1e-9 || Math.abs(nH - instanceH) > 1e-9) {
            const W = instanceW.toString();
            const H = instanceH.toString();
            const HW = (instanceW / 2).toString();
            const HH = (instanceH / 2).toString();
            const wRatio = instanceW / nW;
            const hRatio = instanceH / nH;
            masterContent = masterContent.replace(
              /<Cell N='(\w+)' V='([\d.]+)'([^>]*F='[^']*Sheet\.[57]!(Width|Height)[^']*')\s*\/>/g,
              (whole, cellName, vStr, rest, dim) => {
                const v = parseFloat(vStr);
                if (!isFinite(v) || v === 0) return whole;
                const newV = dim === "Width" ? v * wRatio : v * hRatio;
                return `<Cell N='${cellName}' V='${newV}'${rest}/>`;
              },
            );
            // Per-shape pass: scale LocPinX/LocPinY (formulas like
            // `Width*0.5` / `Height*0.5`) for shapes whose Width/Height
            // were just rescaled. Without this, sub-shapes draw with their
            // pin point off-centre relative to their (now larger) Width —
            // visible bodies appear shifted off the selection rectangle.
            // Marker shapes whose Width is constant (`GUARD(10PT)…`) are
            // skipped by checking the Width F for a Sheet.[57]!Width ref.
            masterContent = scaleLocalLocPin(masterContent, wRatio, hRatio);
            // Root Shape 5's own Width/Height/LocPin cells don't reference
            // Sheet.5! (they ARE Sheet.5), so handle them explicitly.
            masterContent = masterContent.replace(
              /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='Width' V=')[\d.]+('[^>]*\/>)/,
              `$1${W}$2`,
            );
            masterContent = masterContent.replace(
              /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='Height' V=')[\d.]+('[^>]*\/>)/,
              `$1${H}$2`,
            );
            masterContent = masterContent.replace(
              /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='LocPinX' V=')[\d.]+('[^>]*\/>)/,
              `$1${HW}$2`,
            );
            masterContent = masterContent.replace(
              /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='LocPinY' V=')[\d.]+('[^>]*\/>)/,
              `$1${HH}$2`,
            );
          }
        }
      }
    }

    const newId = nextInstanceMasterId++;
    const newRId = `rId${newId}`;
    const newFileName = `master${newId}.xml`;

    const newBlock = sourceBlock
      .replace(/ID='\d+'/, `ID='${newId}'`)
      .replace(/UniqueID='\{[^}]+\}'/, `UniqueID='${freshGuid()}'`)
      .replace(/BaseID='\{[^}]+\}'/, `BaseID='${freshGuid()}'`)
      .replace(/<Rel\s+r:id='rId\d+'/, `<Rel r:id='${newRId}'`);

    mastersXml = mastersXml.replace("</Masters>", newBlock + "</Masters>");
    mastersRels = mastersRels.replace(
      "</Relationships>",
      `<Relationship Id="${newRId}" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="${newFileName}"/></Relationships>`,
    );
    contentTypes = contentTypes.replace(
      "</Types>",
      `<Override PartName="/visio/masters/${newFileName}" ContentType="application/vnd.ms-visio.master+xml"/></Types>`,
    );

    zip.file(`visio/masters/${newFileName}`, masterContent);
    zip.file("visio/masters/masters.xml", mastersXml);
    zip.file("visio/masters/_rels/masters.xml.rels", mastersRels);
    zip.file("[Content_Types].xml", contentTypes);

    return newId;
  }

  const shapes: string[] = [];
  const connects: string[] = [];
  const elIdToShapeId = new Map<string, number>();
  let nextId = 100;

  // Helper: generate sub-shapes with F='Inh' for BOTH width AND height scaling
  // MasterShapes 6 (outer rect — the visible body), 7 (border group containing
  // 8,9). MasterShape 6 paints the body fill: it inherits FillStyle='7' from
  // the master, which falls through to the document theme (white). We MUST
  // inject an explicit FillForegnd at the instance level so the body picks
  // up our Diagramatix colour instead of the theme default.
  function makeRectSubShapes(baseId: number, w: number, h: number, bodyFillCells: string = ""): string {
    const hw = w / 2;
    const hh = h / 2;
    const wi = w - 0.05; // inner border slightly smaller
    const hi = h - 0.05;
    return `<Shapes>` +
      // MasterShape 6: outer rect (body)
      `<Shape ID='${baseId}' Type='Shape' MasterShape='6'>` +
      `<Cell N='PinX' V='${hw}' F='Inh'/><Cell N='PinY' V='${hh}' F='Inh'/>` +
      `<Cell N='Width' V='${w}' F='Inh'/><Cell N='Height' V='${h}' F='Inh'/>` +
      `<Cell N='LocPinX' V='${hw}' F='Inh'/><Cell N='LocPinY' V='${hh}' F='Inh'/>` +
      `<Cell N='LayerMember' V='0'/>` +
      bodyFillCells +
      `<Section N='Geometry' IX='0'>` +
      `<Row T='LineTo' IX='2'><Cell N='X' V='${w}' F='Inh'/></Row>` +
      `<Row T='LineTo' IX='3'><Cell N='X' V='${w}' F='Inh'/><Cell N='Y' V='${h}' F='Inh'/></Row>` +
      `<Row T='LineTo' IX='4'><Cell N='Y' V='${h}' F='Inh'/></Row>` +
      `</Section></Shape>` +
      // MasterShape 7: inner border group
      `<Shape ID='${baseId + 1}' Type='Group' MasterShape='7'>` +
      `<Cell N='PinX' V='${hw}' F='Inh'/><Cell N='PinY' V='${hh}' F='Inh'/>` +
      `<Cell N='Width' V='${w}' F='Inh'/><Cell N='Height' V='${h}' F='Inh'/>` +
      `<Cell N='LocPinX' V='${hw}' F='Inh'/><Cell N='LocPinY' V='${hh}' F='Inh'/>` +
      `<Cell N='LayerMember' V='0'/>` +
      `<Shapes>` +
      // MasterShape 8: border rect
      `<Shape ID='${baseId + 2}' Type='Shape' MasterShape='8'>` +
      `<Cell N='PinX' V='${hw}' F='Inh'/><Cell N='PinY' V='${hh}' F='Inh'/>` +
      `<Cell N='Width' V='${w}' F='Inh'/><Cell N='Height' V='${h}' F='Inh'/>` +
      `<Cell N='LocPinX' V='${hw}' F='Inh'/><Cell N='LocPinY' V='${hh}' F='Inh'/>` +
      `<Cell N='LayerMember' V='0'/>` +
      `<Section N='Geometry' IX='0'>` +
      `<Row T='LineTo' IX='2'><Cell N='X' V='${w}' F='Inh'/></Row>` +
      `<Row T='LineTo' IX='3'><Cell N='X' V='${w}' F='Inh'/><Cell N='Y' V='${h}' F='Inh'/></Row>` +
      `<Row T='LineTo' IX='4'><Cell N='Y' V='${h}' F='Inh'/></Row>` +
      `</Section></Shape>` +
      // MasterShape 9: inner border (slightly smaller)
      `<Shape ID='${baseId + 3}' Type='Shape' MasterShape='9'>` +
      `<Cell N='PinX' V='${hw}' F='Inh'/><Cell N='PinY' V='${hh}' F='Inh'/>` +
      `<Cell N='Width' V='${wi}' F='Inh'/><Cell N='Height' V='${hi}' F='Inh'/>` +
      `<Cell N='LocPinX' V='${wi / 2}' F='Inh'/><Cell N='LocPinY' V='${hi / 2}' F='Inh'/>` +
      `<Cell N='LayerMember' V='0'/>` +
      `<Section N='Geometry' IX='0'>` +
      `<Row T='LineTo' IX='2'><Cell N='X' V='${wi}' F='Inh'/></Row>` +
      `<Row T='LineTo' IX='3'><Cell N='X' V='${wi}' F='Inh'/><Cell N='Y' V='${hi}' F='Inh'/></Row>` +
      `<Row T='LineTo' IX='4'><Cell N='Y' V='${hi}' F='Inh'/></Row>` +
      `</Section></Shape>` +
      `</Shapes></Shape>` +
      `</Shapes>`;
  }

  /** Minimal body-fill instance sub-shape for non-resizable types (events,
   *  gateway, data object/store). Sets only FillForegnd + FillPattern at
   *  instance level so the body picks up colour without overriding the
   *  master's geometry or marker positioning. */
  function makeBodyFillSubshape(
    baseId: number,
    colour: string,
    masterShapeId: number = 6,
  ): string {
    const r = parseInt(colour.slice(1, 3), 16);
    const g = parseInt(colour.slice(3, 5), 16);
    const b = parseInt(colour.slice(5, 7), 16);
    return `<Shapes>` +
      `<Shape ID='${baseId}' Type='Shape' MasterShape='${masterShapeId}'>` +
      `<Cell N='FillForegnd' V='${colour}' F='RGB(${r},${g},${b})'/>` +
      `<Cell N='FillPattern' V='1' F='RGB(0,0,0)*0+1'/>` +
      `</Shape></Shapes>`;
  }

  /** Element types that should get a Diagramatix body fill (excludes
   *  pool/lane which has its own colour path, and stroke-only types like
   *  text-annotation and group). */
  const BODY_FILL_TYPES = new Set([
    "task", "subprocess", "subprocess-expanded",
    "gateway",
    "start-event", "intermediate-event", "end-event",
    "data-object", "data-store",
  ]);

  for (const el of data.elements) {
    const mapping = getElementMappingV3(el);
    if (!mapping) continue;

    const shapeId = nextId;
    nextId += 100;
    elIdToShapeId.set(el.id, shapeId);

    const cx = (el.x + el.width / 2 - bounds.minX) / 96 + offsetX;
    const cy = pageH - (el.y + el.height / 2 - bounds.minY) / 96 - offsetY;
    const w = el.width / 96;
    const h = el.height / 96;

    // Property overrides — match Visio's re-saved baseline: F='Inh' so the
    // master's formula chain stays intact, with our V= acting as the cached
    // value. Combined with the Actions section below, this is what lets
    // Visio render the trigger marker on events.
    let propSection = "";
    const propEntries = Object.entries(mapping.properties);
    if (propEntries.length > 0) {
      propSection = `<Section N='Property'>` +
        propEntries.map(([name, value]) =>
          `<Row N='${name}'><Cell N='Value' V='${esc(String(value))}' U='STR' F='Inh'/></Row>`
        ).join("") +
        `</Section>`;
    }

    // Actions section — Visio's master uses `Actions.<Name>.Checked` to
    // drive marker visibility. Setting it explicitly at instance level is
    // what activates each marker (verified for Message Start Event).
    const EVENT_TRIGGER_ACTION: Record<string, string> = {
      "none": "NoTriggerResult",
      "message": "Message",
      "timer": "Timer",
      "error": "Error",
      "signal": "Signal",
      "terminate": "Terminate",
      "conditional": "Conditional",
      "escalation": "Escalation",
      "cancel": "Cancel",
      "compensation": "Compensation",
      "link": "Link",
    };
    const TASK_TYPE_ACTION: Record<string, string> = {
      "none":           "NoTaskType",
      "user":           "User",
      "service":        "Service",
      "send":           "Send",
      "receive":        "Receive",
      "manual":         "Manual",
      "script":         "Script",
      "business-rule":  "BusinessRule",
    };
    let actionsSection = "";
    let triggerAction: string | null = null;
    if (
      el.type === "start-event" ||
      el.type === "intermediate-event" ||
      el.type === "end-event"
    ) {
      const trig = EVENT_TRIGGER_ACTION[el.eventType ?? "none"] ?? "NoTriggerResult";
      const noTrig = trig === "NoTriggerResult" ? "1" : "0";
      actionsSection = `<Section N='Actions'>` +
        `<Row N='NoTriggerResult'><Cell N='Checked' V='${noTrig}' F='Inh'/></Row>` +
        (trig !== "NoTriggerResult"
          ? `<Row N='${trig}'><Cell N='Checked' V='1' F='Inh'/></Row>`
          : "") +
        `</Section>`;
      if (trig !== "NoTriggerResult") triggerAction = trig;
    } else if (el.type === "task") {
      const act = TASK_TYPE_ACTION[el.taskType ?? "none"] ?? "NoTaskType";
      const noAct = act === "NoTaskType" ? "1" : "0";
      actionsSection = `<Section N='Actions'>` +
        `<Row N='NoTaskType'><Cell N='Checked' V='${noAct}' F='Inh'/></Row>` +
        (act !== "NoTaskType"
          ? `<Row N='${act}'><Cell N='Checked' V='1' F='Inh'/></Row>`
          : "") +
        `</Section>`;
      if (act !== "NoTaskType") triggerAction = act;
    } else if (el.type === "gateway") {
      const GATEWAY_TYPE_ACTION: Record<string, string> = {
        "exclusive":   "ExclusiveDataWithMarker",
        "inclusive":   "Inclusive",
        "parallel":    "Parallel",
        "event-based": "ExclusiveEvent",
      };
      const act = GATEWAY_TYPE_ACTION[el.gatewayType ?? "exclusive"]
        ?? "ExclusiveDataWithMarker";
      actionsSection = `<Section N='Actions'>` +
        `<Row N='${act}'><Cell N='Checked' V='1' F='Inh'/></Row>` +
        `</Section>`;
      triggerAction = act;
    }

    // Each marker is one or more (shapeId, geomIxs) overrides — Geometry IX
    // values whose NoShow we force to '0'. Discovered by scanning the
    // master's `Actions.<Name>.Checked` references per sub-shape.
    type MarkerSpec = { shapeId: number; geomIxs: number[] };
    const TRIGGER_MARKER_MAP: Record<string, MarkerSpec[]> = {
      // Event triggers (BPMN_M Start/Intermediate/End Event masters)
      "Message":      [{ shapeId: 10, geomIxs: [0, 1, 2] }],
      "Link":         [{ shapeId: 11, geomIxs: [0] }],
      "Timer":        [{ shapeId: 12, geomIxs: [0,1,2,3,4,5,6,7,8,9,10,11,12,13] }],
      "Signal":       [{ shapeId: 13, geomIxs: [0] }],
      "Compensation": [{ shapeId: 15, geomIxs: [0, 1] }],
      "Escalation":   [{ shapeId: 16, geomIxs: [0] }],
      "Terminate":    [{ shapeId: 8,  geomIxs: [0] }],
      // Task type markers (Task template master). User and Script share
      // Shape 18 — User uses IX=0/1, Script uses IX=2.
      "User":         [{ shapeId: 18, geomIxs: [0, 1] }],
      "Script":       [{ shapeId: 18, geomIxs: [2] }],
      "Service":      [{ shapeId: 19, geomIxs: [0, 1, 2, 3, 4] }],
      // Send is two leaf shapes (21, 22) inside group Shape 20.
      "Send":         [{ shapeId: 21, geomIxs: [0] }, { shapeId: 22, geomIxs: [0] }],
      "Receive":      [{ shapeId: 23, geomIxs: [0, 1] }],
      "Manual":       [{ shapeId: 25, geomIxs: [0, 1] }],
      "BusinessRule": [{ shapeId: 26, geomIxs: [0, 1, 2, 3] }],
      // Error, Cancel, Conditional are drawn by geometry sections on the
      // master's root Shape 5 (no dedicated marker sub-shape). TBD.
      // Gateway markers (BPMN_M Gateway master 50, mapping.masterId=104).
      // Action names match the gateway master's Actions section
      // (ExclusiveDataWithMarker/Inclusive/Parallel/ExclusiveEvent).
      "ExclusiveDataWithMarker": [{ shapeId: 7,  geomIxs: [0] }],
      "Inclusive":               [{ shapeId: 11, geomIxs: [0] }],
      "Parallel":                [{ shapeId: 13, geomIxs: [0] }],
      "ExclusiveEvent":          [
        { shapeId: 9,  geomIxs: [0, 1] },
        { shapeId: 10, geomIxs: [0] },
      ],
    };
    const triggerMarkers: MarkerSpec[] = triggerAction
      ? (TRIGGER_MARKER_MAP[triggerAction] ?? [])
      : [];

    const isPool = mapping.masterId === 19;
    const textEl = el.label ? `<Text>${esc(el.label)}</Text>` : "";

    // For Tasks, Subprocesses, Pools: set Width/Height + sub-shapes with F='Inh'
    // so the visual matches the Diagramatix dimensions.
    //
    // Gateways are intentionally EXCLUDED from this list so the page instance
    // inherits the BPMN_M master's natural Width/Height. That keeps the
    // visible diamond and the selection boundary as the same shape (the
    // standard Visio gateway), and connectors attach to the master's sides.
    const isResizable = [9, 33, 19].includes(mapping.masterId); // Task, Subprocess, Pool
    const hw = w / 2;
    const hh = h / 2;

    let sizeCells = "";
    let subShapes = "";
    let userSection = "";

    if (isResizable) {
      sizeCells =
        `<Cell N='Width' V='${w}'/>` +
        `<Cell N='Height' V='${h}'/>` +
        `<Cell N='LocPinX' V='${hw}' F='Inh'/>` +
        `<Cell N='LocPinY' V='${hh}' F='Inh'/>` +
        `<Cell N='TxtPinX' V='${hw}' F='Inh'/>` +
        `<Cell N='TxtWidth' V='${w}' F='Inh'/>` +
        `<Cell N='TxtLocPinX' V='${hw}' F='Inh'/>`;
      userSection = `<Section N='User'><Row N='IsInstance'><Cell N='Value' V='1' U='BOOL' F='Inh'/></Row></Section>`;

      if (isPool) {
        // Pool/Lane: create a per-instance master with updated cached dimension values.
        // Sub-shapes have formulas (Sheet.5!Width*1, etc.) but Visio uses cached V= values
        // on file open, so ALL cached values must be updated.
        // Key: root Width/Height must be plain values (NO F= formula) for user resizability.
        const poolLabel = el.label ?? "Pool";

        // Find the Pool master file from the template
        const tRelsXml = await base.file("visio/masters/_rels/masters.xml.rels")!.async("string");
        const tMastersXml2 = await base.file("visio/masters/masters.xml")!.async("string");
        const poolMasterBlock = tMastersXml2.match(/<Master\s+ID='19'[\s\S]*?<\/Master>/);
        const poolRelMatch = poolMasterBlock?.[0].match(/<Rel\s+r:id='(rId\d+)'/);
        const poolFileMatch = poolRelMatch ? tRelsXml.match(new RegExp(`Id=["']${poolRelMatch[1]}["'][^>]*Target=["']([^"']*)["']`)) : null;

        if (poolFileMatch) {
          let poolMasterXml = await base.file("visio/masters/" + poolFileMatch[1])!.async("string");

          // Update all cached V= values for Width, Height, and their halves.
          // These appear on the root shape AND sub-shapes as cached formula results.
          // Formulas use symbolic refs (Sheet.5!Width*1) not literals, so this is safe.
          // Original cached values:
          //   Width       = 4.921259842519685
          //   Height      = 1.181102362204724
          //   Width*0.5   = 2.460629921259843
          //   Height*0.5  = 0.5905511811023622
          //   PinX (root) = 1.968503924805349  (master page center)
          //   PinY (root) = 1.968503920581397  (master page center)
          // Note: DropOnPageScale-dependent values (0.4724, 0.2362, 0.1181, 0.0590)
          //       must NOT be changed — they depend on scale ratio, not shape dimensions.
          poolMasterXml = poolMasterXml.split('4.921259842519685').join(String(w));
          poolMasterXml = poolMasterXml.split('1.181102362204724').join(String(h));
          poolMasterXml = poolMasterXml.split('2.460629921259843').join(String(hw));
          poolMasterXml = poolMasterXml.split('0.5905511811023622').join(String(hh));
          // Root PinX/PinY: position on master page (for icon preview only, not page rendering)
          poolMasterXml = poolMasterXml.split('1.968503924805349').join(String(hw));
          poolMasterXml = poolMasterXml.split('1.968503920581397').join(String(hh));

          // Enable resize handles — the master has NoObjHandles='1' which hides them.
          // Visio's CFF container addon normally manages resizing, but our export
          // doesn't trigger it, so we enable standard handles instead.
          poolMasterXml = poolMasterXml.replace(
            "N='NoObjHandles' V='1'",
            "N='NoObjHandles' V='0'"
          );

          // Add F='w*25.4MM' formula on root Width/Height (matches Visio's per-instance format)
          poolMasterXml = poolMasterXml.replace(
            `N='Width' V='${w}' U='MM'/>`,
            `N='Width' V='${w}' U='MM' F='${w}*25.4MM'/>`
          );
          poolMasterXml = poolMasterXml.replace(
            `N='Height' V='${h}' U='MM'/>`,
            `N='Height' V='${h}' U='MM' F='${h}*25.4MM'/>`
          );

          // Replace "Function" text in <Text> elements and property values only
          poolMasterXml = poolMasterXml.replace(
            /<Text>Function\s*<\/Text>/g,
            `<Text>${esc(poolLabel)}\n</Text>`
          );
          poolMasterXml = poolMasterXml.replace(
            "V='Function' U='STR' F='SHAPETEXT(Sheet.8!TheText)'",
            `V='${esc(poolLabel)}' U='STR' F='SHAPETEXT(Sheet.8!TheText)'`
          );
          poolMasterXml = poolMasterXml.replace(
            "N='BpmnName'><Cell N='Value' V='Function'",
            `N='BpmnName'><Cell N='Value' V='${esc(poolLabel)}'`
          );
          poolMasterXml = poolMasterXml.replace(
            "N='BpmnPoolName'><Cell N='Value' V='Function'",
            `N='BpmnPoolName'><Cell N='Value' V='${esc(poolLabel)}'`
          );

          // Apply colour to the header sidebar (Shape 8).
          // Shape 8's FillForegnd is immediately after ResizeMode in that sub-shape.
          // Replace from the last occurrence (Shape 8 is the last sub-shape).
          if (isColor) {
            const poolColor = colorMap[el.type] ?? "#e5e7eb";
            // Find the last FillForegnd with THEMEVAL("FillColor") — that's Shape 8's
            const lastFillIdx = poolMasterXml.lastIndexOf("N='FillForegnd' V='1' F='THEMEVAL(\"FillColor\",1)'");
            if (lastFillIdx >= 0) {
              const before = poolMasterXml.substring(0, lastFillIdx);
              const after = poolMasterXml.substring(lastFillIdx + "N='FillForegnd' V='1' F='THEMEVAL(\"FillColor\",1)'".length);
              poolMasterXml = before + `N='FillForegnd' V='${poolColor}' F='${hexToVisioRgb(poolColor)}'` + after;
            }
          }

          // Inject font size into Shape 8 header so text fits.
          // Calculate font that fits label single-line within pool height.
          // If it can't fit, just use the diagram font and let Visio wrap.
          const maxFitFontIn = poolLabel.length > 0 ? h / (poolLabel.length * 0.6) : elFontIn;
          const headerFontIn = Math.min(elFontIn, maxFitFontIn);
          const charSectionForHeader = `<Section N='Character' IX='0'><Row IX='0'>` +
            `<Cell N='Size' V='${headerFontIn}'/>` +
            `</Row></Section>`;
          poolMasterXml = poolMasterXml.replace(
            /<Text>([^<]*)<\/Text><\/Shape><\/Shapes><\/Shape>/,
            `${charSectionForHeader}<Text>$1</Text></Shape></Shapes></Shape>`
          );

          console.log(`[v2] Pool per-instance master: w=${w}, h=${h}, name=${poolLabel}`);

          // Write as new master file
          const poolInstanceId = 200 + shapeId;
          const poolFileName = `master${200 + shapeId}.xml`;
          const poolRId = `rId${200 + shapeId}`;
          zip.file("visio/masters/" + poolFileName, poolMasterXml);

          // Add master entry with Visio naming convention
          let newPoolBlock = poolMasterBlock![0]
            .replace(/ID='19'/, `ID='${poolInstanceId}'`)
            .replace(/NameU='Pool \/ Lane'/, `NameU='Pool / Lane.${poolInstanceId}'`)
            .replace(/Name='Pool \/ Lane'/, `Name='Pool / Lane.${poolInstanceId}'`)
            .replace(/<Rel\s+r:id='rId\d+'/, `<Rel r:id='${poolRId}'`);
          mastersXml = mastersXml.replace("</Masters>", newPoolBlock + "</Masters>");
          mastersRels = mastersRels.replace("</Relationships>",
            `<Relationship Id="${poolRId}" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="${poolFileName}"/></Relationships>`);
          contentTypes = contentTypes.replace("</Types>",
            `<Override PartName="/visio/masters/${poolFileName}" ContentType="application/vnd.ms-visio.master+xml"/></Types>`);

          // Update the zip files
          zip.file("visio/masters/masters.xml", mastersXml);
          zip.file("visio/masters/_rels/masters.xml.rels", mastersRels);
          zip.file("[Content_Types].xml", contentTypes);

          // Page instance must have explicit Width/Height for Visio to allow resizing.
          // LocPinX/LocPinY use F='Inh' to calculate from local Width/Height.
          // visHeadingText overrides the master's default label.
          const poolUserSection = `<Section N='User'>` +
            `<Row N='visHeadingText'><Cell N='Value' V='${esc(poolLabel)}' U='STR' F='Inh'/></Row>` +
            `</Section>`;
          shapes.push(
            `<Shape ID='${shapeId}' NameU='${esc(poolLabel)}' Type='Group' Master='${poolInstanceId}'>` +
            `<Cell N='PinX' V='${cx}'/>` +
            `<Cell N='PinY' V='${cy}'/>` +
            `<Cell N='Width' V='${w}'/>` +
            `<Cell N='Height' V='${h}'/>` +
            `<Cell N='LocPinX' V='${hw}' F='Inh'/>` +
            `<Cell N='LocPinY' V='${hh}' F='Inh'/>` +
            poolUserSection +
            propSection +
            elCharSection +
            `</Shape>`
          );
          continue; // skip the normal shape.push below
        }
        // Fallback: no sub-shapes, just position
        subShapes = "";
      } else {
        // Task, Subprocess: NO instance sub-shapes — they would override the
        // master's MasterShape 6 cells at instance level (including the
        // FillForegnd we just injected into the per-instance master). Body
        // colour and resize behaviour now come entirely from the per-instance
        // master, mirroring Pool/Lane's working pattern.
        subShapes = "";
      }
    }
    // Non-resizable types (events, gateway, data object/store) and
    // resizable Task/Subprocess all get body colour from their per-instance
    // master, so no instance-level body-fill sub-shape is needed.

    // Per-instance master copy with colour baked in for any body-fill type.
    // Pass the instance's actual dimensions so the master's cached natural-
    // size values are rewritten — that aligns the visible body geometry with
    // the instance selection rectangle.
    let effectiveMasterId = mapping.masterId;
    if (BODY_FILL_TYPES.has(el.type) && isColor && colorMap[el.type]) {
      effectiveMasterId = await createInstanceMaster(
        mapping.masterId,
        colorMap[el.type],
        w,
        h,
      );
    }

    // Stub sub-shape registrations for non-resizable body-fill types AND
    // resizable types that need markers (Tasks). Mirrors what Visio writes
    // when it re-saves a fixed reference file. The stubs preserve the
    // master's nested-group structure (Type='Group' for groups with nested
    // <Shapes> for their children, Type='Shape' for leaves).
    //
    // Special case: for events, the stub corresponding to the trigger
    // marker MasterShape carries Geometry sub-sections with `NoShow='0'
    // F='Inh'` to force the marker visible.
    if (BODY_FILL_TYPES.has(el.type) && subShapes === "") {
      const masterFileEntry = await zip
        .file(`visio/masters/master${effectiveMasterId}.xml`)
        ?.async("string");
      if (masterFileEntry) {
        const root = masterFileEntry.match(/<Shape ID='5'[^>]*>/);
        if (root) {
          // Walk the master, building a tree of {id, type, children}
          interface StubNode { id: number; type: string; children: StubNode[]; }
          const rootOpenEnd = root.index! + root[0].length;
          let rDepth = 0;
          const rRe = /<\/?Shape[^>]*>/g;
          rRe.lastIndex = root.index!;
          let rm, rootEnd = masterFileEntry.length;
          while ((rm = rRe.exec(masterFileEntry))) {
            if (rm[0].startsWith("</Shape")) {
              rDepth--;
              if (rDepth === 0) { rootEnd = rm.index; break; }
            } else rDepth++;
          }
          const inner = masterFileEntry.slice(rootOpenEnd, rootEnd);
          const childShapesStart = inner.indexOf("<Shapes>");
          if (childShapesStart !== -1) {
            // Recursive parse: walk Shapes/Shape tags with depth tracking,
            // building up a tree of direct children (and their grandchildren
            // for nested groups).
            const rootNode: StubNode = { id: 5, type: "Group", children: [] };
            const tagRe = /<Shape ID='(\d+)'[^>]*Type='([^']+)'[^>]*>|<Shapes>|<\/Shapes>|<\/Shape>/g;
            tagRe.lastIndex = childShapesStart + "<Shapes>".length;
            const stack: StubNode[] = [rootNode];
            let pendingGroup: StubNode | null = null;
            let m;
            while ((m = tagRe.exec(inner))) {
              if (m[0] === "<Shapes>") {
                if (pendingGroup) { stack.push(pendingGroup); pendingGroup = null; }
              } else if (m[0] === "</Shapes>") {
                if (stack.length > 1) stack.pop();
                else break;
              } else if (m[0].startsWith("<Shape ID=") && stack.length > 0) {
                const node: StubNode = { id: parseInt(m[1], 10), type: m[2], children: [] };
                stack[stack.length - 1].children.push(node);
                pendingGroup = node.type === "Group" ? node : null;
              } else if (m[0] === "</Shape>") {
                pendingGroup = null;
              }
            }

            // Emit stubs from the tree, assigning unique instance IDs. The
            // ID for a Group must be allocated BEFORE recursing into its
            // children so the counter advance from the recursion doesn't
            // collide back onto the Group's own ID.
            let stubIdCounter = shapeId;
            function emitStub(node: StubNode): string {
              const myId = ++stubIdCounter;
              // Find any marker spec(s) matching this MasterShape. For
              // markers split across multiple shapes (Send), each spec hits
              // its own shape independently.
              const matchingSpecs = triggerMarkers.filter((s) => s.shapeId === node.id);
              let extra = "";
              for (const spec of matchingSpecs) {
                for (const ix of spec.geomIxs) {
                  extra += `<Section N='Geometry' IX='${ix}'><Cell N='NoShow' V='0' F='Inh'/></Section>`;
                }
              }
              if (node.type === "Group" && node.children.length > 0) {
                const childStubs = node.children.map(emitStub).join("");
                return (
                  `<Shape ID='${myId}' Type='Group' MasterShape='${node.id}'>` +
                  `<Cell N='LayerMember' V=''/>` +
                  extra +
                  `<Shapes>${childStubs}</Shapes>` +
                  `</Shape>`
                );
              }
              return (
                `<Shape ID='${myId}' Type='Shape' MasterShape='${node.id}'>` +
                `<Cell N='LayerMember' V=''/>` +
                extra +
                `</Shape>`
              );
            }
            if (rootNode.children.length > 0) {
              subShapes = `<Shapes>${rootNode.children.map(emitStub).join("")}</Shapes>`;
            }
          }
        }
      }
    }

    // Text positioning cells with F='Inh' AND cached V values sized to the
    // actual label so the first render isn't truncated to the master's tiny
    // natural-size cache. Visio uses cached V on first paint before
    // evaluating F='Inh', so a too-small V wraps long labels prematurely.
    // The Control.Row_1 section is the source the master's `TxtPinY` formula
    // references — without it the inheritance chain has no anchor.
    let txtInhCells = "";
    if (!isResizable && BODY_FILL_TYPES.has(el.type)) {
      const lines = (el.label ?? "").split("\n");
      const longestLine = Math.max(1, ...lines.map((l) => l.length));
      // ~0.075 in per char at 12pt + small horizontal padding; cap to a
      // generous upper bound so very long labels don't blow up the page.
      const charWidth = 0.08;
      const horizPad = 0.08;
      const lineH = 0.18;
      const txtW = Math.max(0.4, longestLine * charWidth + horizPad);
      const txtH = Math.max(0.21, lines.length * lineH);
      const txtLocX = txtW / 2;
      const txtLocY = txtH / 2;
      const txtPinY = -txtLocY; // label sits below the body's local Y=0
      txtInhCells =
        `<Cell N='TxtPinY' V='${txtPinY}' F='Inh'/>` +
        `<Cell N='TxtWidth' V='${txtW}' F='Inh'/>` +
        `<Cell N='TxtHeight' V='${txtH}' F='Inh'/>` +
        `<Cell N='TxtLocPinX' V='${txtLocX}' F='Inh'/>` +
        `<Cell N='TxtLocPinY' V='${txtLocY}' F='Inh'/>` +
        `<Section N='Control'>` +
          `<Row N='Row_1'>` +
            `<Cell N='Y' V='${txtPinY}' F='Inh'/>` +
            `<Cell N='YDyn' V='${txtPinY}' F='Inh'/>` +
            `<Cell N='YCon' V='2' F='Inh'/>` +
          `</Row>` +
        `</Section>`;
    }

    // <cp IX='0'/> in Text links to Character section row 0 — required for
    // the master's character formatting (font size etc) to apply.
    const textElWithCp = el.label
      ? `<Text><cp IX='0'/>${esc(el.label)}</Text>`
      : "";

    const escLabel = esc(el.label || el.type);
    shapes.push(
      `<Shape ID='${shapeId}' NameU='${escLabel}'` +
      ` IsCustomNameU='1' Name='${escLabel}' IsCustomName='1'` +
      ` Type='Group' Master='${effectiveMasterId}'>` +
      `<Cell N='PinX' V='${cx}'/>` +
      `<Cell N='PinY' V='${cy}'/>` +
      `<Cell N='LayerMember' V=''/>` +
      fillCells(el.type) +
      sizeCells +
      txtInhCells +
      userSection +
      propSection +
      actionsSection +
      elCharSection +
      textElWithCp +
      subShapes +
      `</Shape>`
    );
  }

  // ── Step 4: Connectors ──
  for (const conn of data.connectors) {
    const mapping = getConnectorMappingV3(conn);
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

    // Connector label: measure offset from label centre to closest endpoint,
    // then place pin+text at that offset from the corresponding Visio endpoint.
    // Controls.TextPosition creates a draggable yellow pin handle.
    let txtCells = "";
    if (conn.label) {
      const wp = conn.waypoints ?? [];
      const visStart = conn.sourceInvisibleLeader ? 1 : 0;
      const visEnd = conn.targetInvisibleLeader ? wp.length - 2 : wp.length - 1;
      const visPtsL = wp.slice(visStart, visEnd + 1);
      const lp0 = visPtsL[0], lpN = visPtsL[visPtsL.length - 1];
      const midPxX = (lp0.x + lpN.x) / 2, midPxY = (lp0.y + lpN.y) / 2;
      const labelCX = midPxX + (conn.labelOffsetX ?? 0);
      const labelCY = midPxY + (conn.labelOffsetY ?? 0);

      // Find closest endpoint
      const distToStart = Math.hypot(labelCX - lp0.x, labelCY - lp0.y);
      const distToEnd = Math.hypot(labelCX - lpN.x, labelCY - lpN.y);
      const closestIsStart = distToStart < distToEnd;
      const closestPx = closestIsStart ? lp0 : lpN;

      // Offset from closest endpoint in pixels, then convert to inches
      const labelOffInX = (labelCX - closestPx.x) / 96;
      const labelOffInY = -(labelCY - closestPx.y) / 96; // Y inverted

      // Closest endpoint in Visio local coords (shape origin = BeginX,BeginY)
      // Begin = (0,0), End = (dx,dy)
      const anchorX = closestIsStart ? 0 : dx;
      const anchorY = closestIsStart ? 0 : dy;

      const ctrlX = anchorX + labelOffInX;
      const ctrlY = anchorY + labelOffInY;
      const labelW = (conn.labelWidth ?? 80) / 96;
      txtCells =
        `<Section N='Controls'><Row N='TextPosition'>` +
        `<Cell N='X' V='${ctrlX}' F='Controls.TextPosition.XDyn'/>` +
        `<Cell N='Y' V='${ctrlY}' F='Controls.TextPosition.YDyn'/>` +
        `<Cell N='XDyn' V='${ctrlX}'/>` +
        `<Cell N='YDyn' V='${ctrlY}'/>` +
        `<Cell N='XCon' V='0'/>` +
        `<Cell N='YCon' V='0'/>` +
        `<Cell N='CanGlue' V='0'/>` +
        `</Row></Section>` +
        `<Cell N='TxtPinX' V='${ctrlX}' F='SETATREF(Controls.TextPosition)'/>` +
        `<Cell N='TxtPinY' V='${ctrlY}' F='SETATREF(Controls.TextPosition.Y)'/>` +
        `<Cell N='TxtWidth' V='${labelW}' F='MAX(TEXTWIDTH(TheText),5*Char.Size)'/>` +
        `<Cell N='TxtHeight' V='0.2' F='TEXTHEIGHT(TheText,TxtWidth)'/>` +
        `<Cell N='TxtLocPinX' V='${labelW / 2}' F='TxtWidth*0.5'/>` +
        `<Cell N='TxtLocPinY' V='0.1' F='TxtHeight*0.5'/>` +
        `<Cell N='TxtAngle' V='0'/>`;
    }

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
      txtCells +
      `<Section N='Geometry' IX='0'>` +
      `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
      geomRows +
      `</Section>` +
      connCharSection +
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

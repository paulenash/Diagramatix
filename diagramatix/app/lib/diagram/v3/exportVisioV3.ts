/**
 * V3 Visio Export — Template base + BPMN_M masters merged in.
 * Uses template for infrastructure (document.xml, theme, styles).
 * Adds missing BPMN_M masters (Gateway, Intermediate Event, Data Object, etc.).
 * COMPLETELY INDEPENDENT from V1 and V2 export code — modify freely.
 */
import JSZip from "jszip";
import type { DiagramData } from "../types";
import { getElementMappingV3, getConnectorMappingV3 } from "./visioMasterMapV3";
import { DEFAULT_PROFILE } from "./stencilProfile";
import type { StencilProfile } from "./stencilProfile";
import { DEFAULT_SYMBOL_COLORS } from "../colors";
import type { SymbolColorConfig } from "../colors";
import { wrapText } from "../textMetrics";
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
  colorConfig?: SymbolColorConfig,
  profile: StencilProfile = DEFAULT_PROFILE,
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

  // Masters to add from the auxiliary stencil (original ID → new ID in
  // our file). Comes from the active profile.
  //
  // Note for BPMN_M: Template "Start Event" (8) and "End Event" (15) are
  // Phase markers, not BPMN events. We import the real BPMN events from
  // the BPMN_M stencil.
  const mastersToAdd = profile.mastersToAdd;

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
  function bakeColourIntoMaster(
    content: string,
    colour: string,
    elType?: string,
  ): string {
    const r = parseInt(colour.slice(1, 3), 16);
    const g = parseInt(colour.slice(3, 5), 16);
    const b = parseInt(colour.slice(5, 7), 16);
    // Decide which shape(s) get coloured:
    //   end-event           → Shape 9 only (Shape 6 is the BLACK ring,
    //                         keep it black; Shape 9 is the inner body)
    //   intermediate-event  → Shape 6 AND Shape 9 — Shape 6 fills the
    //                         outer ring area, Shape 9 the inner. Both
    //                         coloured so the area between the rings
    //                         AND inside the inner ring are coloured.
    //   everything else     → Shape 6 only
    const targetShapeIds: string[] =
      elType === "end-event" ? ["9"]
      : elType === "intermediate-event" ? ["6", "9"]
      : ["6"];
    const colourCell = `<Cell N='FillForegnd' V='${colour}' F='RGB(${r},${g},${b})'/>`;
    for (const targetShapeId of targetShapeIds) {
      const targetOpenRe = new RegExp(`<Shape ID='${targetShapeId}'[^>]*>`);
      const targetOpen = content.match(targetOpenRe);
      if (!targetOpen) continue;
      const shapeStart = targetOpen.index!;
      const shapeOpenEnd = shapeStart + targetOpen[0].length;
      const nextShape = content.indexOf("<Shape ID=", shapeOpenEnd);
      const bodyEnd = nextShape === -1 ? content.length : nextShape;
      const bodyTextOriginal = content.slice(shapeOpenEnd, bodyEnd);

      // Drop any FillStyle on the opening tag — Pool/Lane's coloured shape
      // uses FillStyle='3' (no theme inheritance), template masters use '7'
      // (themed white). Force '3' so our cell-level FillForegnd wins.
      const newOpen = targetOpen[0].replace(/FillStyle='\d+'/, "FillStyle='3'");

      // Replace any FillForegnd cell with our colour.
      let bodyTextNew = bodyTextOriginal.replace(
        /<Cell N='FillForegnd' V='[^']*' F='[^']*'\/>/g,
        colourCell,
      );

      if (!/<Cell N='FillForegnd'/.test(bodyTextNew)) {
        bodyTextNew =
          `<Cell N='FillForegnd' V='${colour}' F='RGB(${r},${g},${b})'/>` +
          `<Cell N='FillPattern' V='1' F='RGB(0,0,0)*0+1'/>` +
          bodyTextNew;
      }

      content =
        content.slice(0, shapeStart) +
        newOpen +
        bodyTextNew +
        content.slice(bodyEnd);
    }
    return content;
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

  /** Scale the cached V of dimension cells inside `<Shape ID='${shapeId}'>`
   *  by `scale`. Used to resize the Subprocess + marker (Shapes 11, 12,
   *  13 in master 33). `skipCells` lists cell names to leave untouched
   *  (e.g. Shape 11's PinX comes from the body-chain Sheet.5!Width
   *  rescale earlier; Shape 11's PinY is positioned explicitly to sit
   *  at the body bottom). */
  function scaleMarkerShape(
    content: string,
    shapeId: number,
    scale: number,
    skipCells: string[] = [],
  ): string {
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
    const skipSet = new Set(skipCells);
    const block = content.slice(start, pos);
    const scaled = block.replace(
      /<Cell N='(PinX|PinY|Width|Height|LocPinX|LocPinY|X|Y)' V='([\d.]+)'([^>]*)\/>/g,
      (_w, cellName, vStr, rest) => {
        if (skipSet.has(cellName)) return _w;
        const v = parseFloat(vStr);
        if (!isFinite(v) || v === 0) return _w;
        return `<Cell N='${cellName}' V='${v * scale}'${rest}/>`;
      },
    );
    return content.slice(0, start) + scaled + content.slice(pos);
  }

  /** Like `scaleMarkerShape` but with separate scale factors for the
   *  width-direction cells (X / PinX / LocPinX / Width) and the
   *  height-direction cells (Y / PinY / LocPinY / Height). Used when a
   *  shape's width and height come from different parents (e.g. event-
   *  based gateway pentagon at `Sheet.8!Width` × `Sheet.8!Height`, where
   *  Sheet.8 itself was rescaled by both Layer-1 and a shrink factor). */
  function scaleMarkerShapeXY(
    content: string,
    shapeId: number,
    wScale: number,
    hScale: number,
    skipCells: string[] = [],
  ): string {
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
    const skipSet = new Set(skipCells);
    const block = content.slice(start, pos);
    const W_CELLS = new Set(["PinX", "LocPinX", "Width", "X"]);
    const H_CELLS = new Set(["PinY", "LocPinY", "Height", "Y"]);
    const scaled = block.replace(
      /<Cell N='(PinX|PinY|Width|Height|LocPinX|LocPinY|X|Y|A|B|C|D)' V='([\d.]+)'([^>]*)\/>/g,
      (_w, cellName, vStr, rest) => {
        if (skipSet.has(cellName)) return _w;
        const v = parseFloat(vStr);
        if (!isFinite(v) || v === 0) return _w;
        // EllipticalArcTo / NURBSTo cells: A/C are X-axis, B/D are Y-axis.
        const dim = W_CELLS.has(cellName) || cellName === "A" || cellName === "C"
          ? "W"
          : H_CELLS.has(cellName) || cellName === "B" || cellName === "D"
          ? "H"
          : null;
        if (!dim) return _w;
        const factor = dim === "W" ? wScale : hScale;
        return `<Cell N='${cellName}' V='${v * factor}'${rest}/>`;
      },
    );
    return content.slice(0, start) + scaled + content.slice(pos);
  }

  /** Force the absolute Height of a shape to equal its absolute Width by
   *  reading the post-Layer-1 cached V's and scaling all H-direction
   *  cells (Height, LocPinY, Y, B, D) by W/H. PinY is skipped — we keep
   *  the shape's vertical centre wherever Layer 1 placed it.
   *
   *  Used to make gateway Inclusive marker (Shape 11) and event-based
   *  marker (Shapes 8, 9, 10) circular instead of elliptical when the
   *  template's W and H fractions differ. */
  function forceShapeSquare(content: string, shapeId: number): string {
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
    const wMatch = block.match(/<Cell N='Width' V='([\d.]+)'/);
    const hMatch = block.match(/<Cell N='Height' V='([\d.]+)'/);
    if (!wMatch || !hMatch) return content;
    const cachedW = parseFloat(wMatch[1]);
    const cachedH = parseFloat(hMatch[1]);
    if (!isFinite(cachedW) || !isFinite(cachedH) || cachedH === 0) return content;
    if (Math.abs(cachedW - cachedH) < 1e-9) return content;
    const hScale = cachedW / cachedH;
    return scaleMarkerShapeXY(content, shapeId, 1, hScale, ["PinX", "PinY"]);
  }

  /** Shift a collapsed Subprocess's label up 5px from the master's
   *  default centre-anchored position. Override `TxtPinY`'s cached V
   *  and formula so first paint and Visio recalc agree on the new
   *  position (`Sheet.5!Height*0.5 + 1.32MM`). 1.32MM = 5/96 inch
   *  matches Diagramatix's 96-DPI canvas. */
  function shiftSubprocessLabelUp(content: string, instanceH: number): string {
    const FIVE_PX_IN = 0.0520833333333333; // 5 / 96 inches
    const newV = instanceH / 2 + FIVE_PX_IN;
    return content.replace(
      /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='TxtPinY' V=')[\d.]+('[^>]*F=')[^']+(')/,
      `$1${newV}$2Sheet.5!Height*0.5+1.32MM$3`,
    );
  }

  /** Override Txt* cells in Shape 5 to pin the label near the top of
   *  the body. Visio shape coords are Y-up, so "near top" = high Y.
   *  Approach: 6MM-tall text block whose top edge sits at the body's
   *  top edge, with the text block's pin anchored at that top edge
   *  (LocPinY=TxtHeight) and VerticalAlign=0 (text top within block). */
  function positionExpandedSubprocessLabel(
    content: string,
    instanceH: number,
  ): string {
    const TXT_H = 0.23622047244094488; // 6MM in inches
    const txtPinY = instanceH; // top of body
    // TxtPinY: pin point sits at top of body; TxtLocPinY = TxtHeight so
    // the block's top edge is at the pin (block extends down into body).
    content = content.replace(
      /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='TxtPinY' V=')[\d.]+('[^>]*F=')[^']+(')/,
      `$1${txtPinY}$2Sheet.5!Height$3`,
    );
    content = content.replace(
      /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='TxtHeight' V=')[\d.]+('[^>]*F=')[^']+(')/,
      `$1${TXT_H}$26MM*Sheet.5!DropOnPageScale$3`,
    );
    content = content.replace(
      /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='TxtLocPinY' V=')[\d.]+('[^>]*F=')[^']+(')/,
      `$1${TXT_H}$2TxtHeight$3`,
    );
    content = content.replace(
      /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='VerticalAlign' V=')[\d.]+('[^>]*F=')[^']+(')/,
      `$10$20$3`,
    );
    return content;
  }

  /** Shrink the event-based-gateway marker (master 50, Shapes 8/9/10)
   *  so the pentagon fits inside the diamond. The template renders it
   *  at 46–58% of the body W/H — the wide vertical fraction makes the
   *  marker corners poke past the diamond's slanted edges. Shrinking
   *  Shape 8 by `SHRINK` (which Layer 1 has already pre-scaled to
   *  instance dims) and matching Shape 9/10 cached V's keeps the
   *  marker centred in the diamond and well inside its bounds. */
  function shrinkEventBasedMarker(
    content: string,
    instanceW: number,
    instanceH: number,
  ): string {
    // Match Diagramatix canvas marker design (SymbolRenderer.tsx
    // event-based): outer circle radius = s*0.95, inner = s*0.75,
    // pentagon = s*0.5 with s=11.7 in a typical 40px gateway. As
    // fractions of body: outer diam ≈ 0.556, inner ≈ 0.439, pentagon
    // ≈ 0.293. We override Shape 8 (container) to a square at outer
    // diameter, then Shape 9's cached V's (rings) and Shape 10's
    // cached V's (pentagon) so first paint matches Visio's recalc.
    const minBody = Math.min(instanceW, instanceH);
    const outerD = minBody * 0.556;
    const innerD = minBody * 0.439;
    // Pentagon: ~1/2 of the inner-ring diameter (= 1/3 × 1.5, 50%
    // bigger than the prior 1/3 sizing). Sits comfortably inside the
    // inner ring with a small visual margin.
    const pentD = innerD / 2; // = body * 0.220

    // Shape 8 — container, body-centred. Width/Height = Sheet.5!Width*0.556
    // so it's square (assuming square gateway, which Diagramatix's are).
    content = overrideShapeDirectCells(content, 8, {
      Width: { v: outerD, f: "Sheet.5!Width*0.556" },
      Height: { v: outerD, f: "Sheet.5!Width*0.556" },
      LocPinX: { v: outerD / 2, f: "Width*0.5" },
      LocPinY: { v: outerD / 2, f: "Height*0.5" },
      PinX: { v: instanceW / 2, f: "Sheet.5!Width*0.5" },
      PinY: { v: instanceH / 2, f: "Sheet.5!Height*0.5" },
    });

    // Shape 9 — full-size circle + smaller circle. The two ellipse
    // geometries fill the same bounding box; the Geom 1 ellipse is
    // sized smaller via its A and D fractions of the local Width/
    // Height. Override Shape 9's box to outer size, set Geom 1 ellipse
    // to innerD/outerD ratio of itself, set NoFill=1 + 1px LineWeight.
    const innerFrac = innerD / outerD;
    content = overrideShapeDirectCells(content, 9, {
      Width: { v: outerD, f: "Sheet.8!Width*1" },
      Height: { v: outerD, f: "Sheet.8!Height*1" },
      PinX: { v: outerD / 2, f: "Sheet.8!Width*0.5" },
      PinY: { v: outerD / 2, f: "Sheet.8!Height*0.5" },
      LocPinX: { v: outerD / 2, f: "Width*0.5" },
      LocPinY: { v: outerD / 2, f: "Height*0.5" },
    });
    // Replace Shape 9's two Geometry sections with clean concentric
    // ellipses (outer fills shape, inner is innerFrac smaller).
    content = rewriteShape9Rings(content, outerD, innerFrac);

    // Shape 10 — pentagon. Re-pin to centre of Shape 8, set size to
    // pentD, anchor at the pentagon's centroid (0.5W, 0.44H of its
    // bounding box) so the visual centre lands on Shape 8's centre.
    content = overrideShapeDirectCells(content, 10, {
      Width: { v: pentD, f: `Sheet.8!Width*${(pentD / outerD).toFixed(6)}` },
      Height: { v: pentD, f: "Width" },
      PinX: { v: outerD / 2, f: "Sheet.8!Width*0.5" },
      PinY: { v: outerD / 2, f: "Sheet.8!Height*0.5" },
      LocPinX: { v: pentD / 2, f: "Width*0.5" },
      LocPinY: { v: pentD * 0.44, f: "Height*0.44" },
    });
    // Replace Shape 10's Geometry section with one whose cached V's are
    // computed from the NEW pentD. Without this, Visio paints the
    // pentagon at the natural-template cached values (~0.27 × 0.24 in
    // template coords) on first frame, dwarfing the resized container.
    content = rewriteShape10Pentagon(content, pentD);

    content = setEventMarkerLineWeight(content);
    return content;
  }

  /** Replace Shape 10's pentagon Geometry section with cached V values
   *  computed from the new `pentD` size. The natural-template cached
   *  V's are at the master's natural Width/Height (~0.27 × 0.24 in
   *  template coords), and Visio uses cached V on first paint — so
   *  without this rewrite the pentagon paints at template size on
   *  first frame regardless of the resized Shape 10. */
  function rewriteShape10Pentagon(content: string, pentD: number): string {
    const W = pentD;
    // Pentagon point-up with vertices: top (0.5W, H), two side
    // vertices (W*0.18, 0.6H) and (W*0.82, 0.6H), two bottom vertices
    // (0.18W, 0) and (0.82W, 0). Drawn as 5-vertex closed polygon.
    // Master uses different ordering; stick with master's order so
    // formulas like `Geometry1.X1` keep referencing the right cell.
    //
    // Master order:
    //   1: MoveTo (0,            0.6H)        — left mid
    //   2: LineTo (0.5W,         H)           — top
    //   3: LineTo (W,            0.6H)        — right mid
    //   4: LineTo (0.82W,        0)           — bottom right
    //   5: LineTo (0.18W,        0)           — bottom left
    //   6: LineTo (Geometry1.X1, Geometry1.Y1) — close back to start
    const newGeom =
      `<Section N='Geometry' IX='0'>` +
      `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/>` +
      `<Cell N='NoShow' V='1' F='NOT(Sheet.5!Actions.ExclusiveEvent.Checked)'/>` +
      `<Cell N='NoSnap' V='0'/><Cell N='NoQuickDrag' V='0' F='No Formula'/>` +
      `<Row T='MoveTo' IX='1'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${W * 0.6}' F='Height*0.6'/></Row>` +
      `<Row T='LineTo' IX='2'><Cell N='X' V='${W * 0.5}' F='Width*0.5'/><Cell N='Y' V='${W}' F='Height*1'/></Row>` +
      `<Row T='LineTo' IX='3'><Cell N='X' V='${W}' F='Width*1'/><Cell N='Y' V='${W * 0.6}' F='Height*0.6'/></Row>` +
      `<Row T='LineTo' IX='4'><Cell N='X' V='${W * 0.82}' F='Width*0.82'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
      `<Row T='LineTo' IX='5'><Cell N='X' V='${W * 0.18}' F='Width*0.18'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
      `<Row T='LineTo' IX='6'><Cell N='X' V='0' F='Geometry1.X1'/><Cell N='Y' V='${W * 0.6}' F='Geometry1.Y1'/></Row>` +
      `</Section>`;
    return content.replace(
      /(<Shape ID='10'[\s\S]*?)<Section N='Geometry' IX='0'>[\s\S]*?<\/Section>/,
      `$1${newGeom}`,
    );
  }

  /** Make the parallel-gateway cross arms 25% longer while keeping the
   *  arm thickness the same. Approach: scale Shape 13 W and H by 1.25
   *  (so arms reach 25% further to the new bounding-box edges) and
   *  rewrite the Geometry section to use thinner thickness fractions
   *  (0.4375 / 0.5625 instead of 0.422 / 0.578) so the absolute arm
   *  width is preserved across the larger box. */
  function lengthenParallelArms(content: string, instanceW: number): string {
    const NEW_FRAC = 0.441 * 1.25; // = 0.55125
    const newW = instanceW * NEW_FRAC;
    const halfW = newW / 2;
    content = overrideShapeDirectCells(content, 13, {
      Width: { v: newW, f: `Sheet.5!Width*${NEW_FRAC.toFixed(6)}` },
      Height: { v: newW, f: "Width" },
      LocPinX: { v: halfW, f: "Width*0.5" },
      LocPinY: { v: halfW, f: "Height*0.5" },
    });
    // Rewrite Shape 13's Geometry section. Cross outline as a closed
    // 12-vertex path: vertical arm extends from Y=0 to Y=H,
    // horizontal arm from X=0 to X=W, both with thickness fraction
    // 0.125 (= 0.5 - 0.4375 each side of centre).
    const lo = 0.4375; // left/inner thickness fraction
    const hi = 0.5625; // right/outer thickness fraction
    const W = newW;
    const newGeom =
      `<Section N='Geometry' IX='0'>` +
      `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='0'/>` +
      `<Cell N='NoShow' V='1' F='NOT(Sheet.5!Actions.Parallel.Checked)'/>` +
      `<Cell N='NoSnap' V='0'/><Cell N='NoQuickDrag' V='0' F='No Formula'/>` +
      `<Row T='MoveTo' IX='1'><Cell N='X' V='${W * lo}' F='Width*${lo}'/><Cell N='Y' V='${W * lo}' F='Height*${lo}'/></Row>` +
      `<Row T='LineTo' IX='2'><Cell N='X' V='${W * lo}' F='Width*${lo}'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
      `<Row T='LineTo' IX='3'><Cell N='X' V='${W * hi}' F='Width*${hi}'/><Cell N='Y' V='0' F='Height*0'/></Row>` +
      `<Row T='LineTo' IX='4'><Cell N='X' V='${W * hi}' F='Width*${hi}'/><Cell N='Y' V='${W * lo}' F='Height*${lo}'/></Row>` +
      `<Row T='LineTo' IX='5'><Cell N='X' V='${W}' F='Width*1'/><Cell N='Y' V='${W * lo}' F='Height*${lo}'/></Row>` +
      `<Row T='LineTo' IX='6'><Cell N='X' V='${W}' F='Width*1'/><Cell N='Y' V='${W * hi}' F='Height*${hi}'/></Row>` +
      `<Row T='LineTo' IX='7'><Cell N='X' V='${W * hi}' F='Width*${hi}'/><Cell N='Y' V='${W * hi}' F='Height*${hi}'/></Row>` +
      `<Row T='LineTo' IX='8'><Cell N='X' V='${W * hi}' F='Width*${hi}'/><Cell N='Y' V='${W}' F='Height*1'/></Row>` +
      `<Row T='LineTo' IX='9'><Cell N='X' V='${W * lo}' F='Width*${lo}'/><Cell N='Y' V='${W}' F='Height*1'/></Row>` +
      `<Row T='LineTo' IX='10'><Cell N='X' V='${W * lo}' F='Width*${lo}'/><Cell N='Y' V='${W * hi}' F='Height*${hi}'/></Row>` +
      `<Row T='LineTo' IX='11'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${W * hi}' F='Height*${hi}'/></Row>` +
      `<Row T='LineTo' IX='12'><Cell N='X' V='0' F='Width*0'/><Cell N='Y' V='${W * lo}' F='Height*${lo}'/></Row>` +
      `<Row T='LineTo' IX='13'><Cell N='X' V='${W * lo}' F='Width*${lo}'/><Cell N='Y' V='${W * lo}' F='Height*${lo}'/></Row>` +
      `</Section>`;
    return content.replace(
      /(<Shape ID='13'[\s\S]*?)<Section N='Geometry' IX='0'>[\s\S]*?<\/Section>/,
      `$1${newGeom}`,
    );
  }

  /** Replace Shape 9's two Ellipse geometry sections with clean
   *  concentric circles. Outer ellipse fills Shape 9; inner ellipse
   *  is `innerFrac` smaller (centred). Both NoFill=1 (stroke only). */
  function rewriteShape9Rings(
    content: string,
    outerD: number,
    innerFrac: number,
  ): string {
    const halfO = outerD / 2;
    const innerR = (outerD * innerFrac) / 2;
    const outerSec =
      `<Section N='Geometry' IX='0'>` +
      `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/>` +
      `<Cell N='NoShow' V='1' F='NOT(Sheet.5!Actions.ExclusiveEvent.Checked)'/>` +
      `<Cell N='NoSnap' V='0'/><Cell N='NoQuickDrag' V='0' F='No Formula'/>` +
      `<Row T='Ellipse' IX='1'>` +
      `<Cell N='X' V='${halfO}' F='Width*0.5'/>` +
      `<Cell N='Y' V='${halfO}' F='Height*0.5'/>` +
      `<Cell N='A' V='${outerD}' F='Width*1'/>` +
      `<Cell N='B' V='${halfO}' F='Height*0.5'/>` +
      `<Cell N='C' V='${halfO}' F='Width*0.5'/>` +
      `<Cell N='D' V='${outerD}' F='Height*1'/>` +
      `</Row></Section>`;
    const innerSec =
      `<Section N='Geometry' IX='1'>` +
      `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/>` +
      `<Cell N='NoShow' V='1' F='Geometry1.NoShow'/>` +
      `<Cell N='NoSnap' V='0'/><Cell N='NoQuickDrag' V='0' F='No Formula'/>` +
      `<Row T='Ellipse' IX='1'>` +
      `<Cell N='X' V='${halfO}' F='Width*0.5'/>` +
      `<Cell N='Y' V='${halfO}' F='Height*0.5'/>` +
      `<Cell N='A' V='${halfO + innerR}' F='Width*${(0.5 + innerFrac / 2).toFixed(6)}'/>` +
      `<Cell N='B' V='${halfO}' F='Height*0.5'/>` +
      `<Cell N='C' V='${halfO}' F='Width*0.5'/>` +
      `<Cell N='D' V='${halfO + innerR}' F='Height*${(0.5 + innerFrac / 2).toFixed(6)}'/>` +
      `</Row></Section>`;
    return content.replace(
      /(<Shape ID='9'[^>]*>[\s\S]*?)<Section N='Geometry' IX='0'>[\s\S]*?<\/Section><Section N='Geometry' IX='1'>[\s\S]*?<\/Section>/,
      `$1${outerSec}${innerSec}`,
    );
  }

  /** Override the cached V (and optionally formula) of specific cells
   *  in a shape's DIRECT body — the cells that appear before the first
   *  nested `<Shape ID='`. Lets us rewrite a shape's Width/Height/
   *  PinX/PinY without inadvertently touching nested children's cells
   *  (which `scaleMarkerShape` does because it operates on the full
   *  shape block). */
  function overrideShapeDirectCells(
    content: string,
    shapeId: number,
    overrides: Record<string, { v: number; f?: string }>,
  ): string {
    const openRe = new RegExp(`<Shape ID='${shapeId}'[^>]*>`);
    const openMatch = content.match(openRe);
    if (!openMatch || openMatch.index === undefined) return content;
    const start = openMatch.index;
    const openEnd = start + openMatch[0].length;
    const nextOpen = content.indexOf("<Shape ID='", openEnd);
    const nextClose = content.indexOf("</Shape>", openEnd);
    let bodyEnd: number;
    if (nextClose === -1) return content;
    if (nextOpen !== -1 && nextOpen < nextClose) bodyEnd = nextOpen;
    else bodyEnd = nextClose;
    let directBody = content.slice(openEnd, bodyEnd);
    for (const [cellName, { v, f }] of Object.entries(overrides)) {
      const re = new RegExp(
        `(<Cell N='${cellName}' V=')[\\d.]+('[^>]*?)(?:F='[^']+')?(/>)`,
      );
      const replacement = f
        ? `$1${v}$2F='${f}'$3`
        : `$1${v}$2$3`;
      directBody = directBody.replace(re, replacement);
    }
    return content.slice(0, openEnd) + directBody + content.slice(bodyEnd);
  }

  /** Set LineWeight on Shapes 9 and 10 of the gateway master (event-
   *  based marker rings + pentagon) to 1px (= 0.75PT) so the marker
   *  draws with thin strokes matching the Diagramatix canvas style.
   *  V = 1/96 inch = 0.01041666… */
  function setEventMarkerLineWeight(content: string): string {
    const ONE_PX_IN = 0.010416666666666666; // 1 / 96 inches
    for (const shapeId of [9, 10]) {
      const re = new RegExp(
        `(<Shape ID='${shapeId}'[^>]*>[\\s\\S]*?<Cell N='LineWeight' V=')[\\d.]+('[^>]*F=')[^']+(')`,
      );
      content = content.replace(
        re,
        `$1${ONE_PX_IN}$2GUARD(0.75PT)$3`,
      );
    }
    return content;
  }

  /** For master 50 Shape 9 (event-based gateway concentric circles),
   *  set Geom 0 and Geom 1 NoFill='1' so they paint as thin outlines
   *  rather than filled ellipses. */
  function unfillEventBasedRings(content: string): string {
    const openRe = /<Shape ID='9'[^>]*>/;
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
    let block = content.slice(start, pos);
    // Set NoFill='1' on both Geometry sections (IX=0 outer, IX=1 inner).
    block = block.replace(
      /(<Section N='Geometry' IX='[01]'>)<Cell N='NoFill' V='[01]'\/>/g,
      `$1<Cell N='NoFill' V='1'/>`,
    );
    return content.slice(0, start) + block + content.slice(pos);
  }

  /** Make the Inclusive gateway marker (master 50, Shape 11) render as
   *  a thick unfilled circle instead of a filled oval. The template
   *  paints both Geom 0 (outer ellipse) and Geom 1 (inner ellipse)
   *  with FillForegnd=0, which on a coloured body stacks two filled
   *  ellipses and looks solid. Fix:
   *   - Geom 0: NoFill='1' so only the stroke shows.
   *   - Geom 1: NoShow forced (always hidden).
   *   - Shape 11 LineWeight: bumped to 3PT so the stroke reads as
   *     a thick ring at typical gateway sizes. */
  function drawInclusiveAsThickRing(content: string): string {
    const openRe = /<Shape ID='11'[^>]*>/;
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
    let block = content.slice(start, pos);
    // Geom 0 NoFill=1 (stroke only).
    block = block.replace(
      /(<Section N='Geometry' IX='0'>[\s\S]*?)<Cell N='NoFill' V='[01]'\/>/,
      `$1<Cell N='NoFill' V='1'/>`,
    );
    // Geom 1: force NoShow=1.
    block = block.replace(
      /(<Section N='Geometry' IX='1'>[\s\S]*?)<Cell N='NoShow' V='[01]'(?: F='[^']+')?\/>/,
      `$1<Cell N='NoShow' V='1' F='1'/>`,
    );
    // Thick line for the ring.
    block = block.replace(
      /<Cell N='LineWeight' V='[\d.]+'[^>]*\/>/,
      `<Cell N='LineWeight' V='0.04166666666666667' U='PT' F='GUARD(3PT)'/>`,
    );
    // Force absolute square: BPMN_M's Inclusive marker is taller than
    // wide (Shape 11 W frac 0.479 vs H frac 0.596). Equalising H to W
    // turns the ellipse into a circle.
    const result = content.slice(0, start) + block + content.slice(pos);
    return forceShapeSquare(result, 11);
  }

  /** Spread Data Store master's three top "depth" rings (Geometry IX 1,
   *  2, 3) by 2× the template's natural gap. Template positions the
   *  rings at Y fractions 0.893 (top, IX=1), 0.835 (middle, IX=3),
   *  0.777 (bottom, IX=2) — gaps of 0.058. Doubling shifts IX=3 to
   *  0.777 and IX=2 to 0.661 (pinning the topmost ring at 0.893).
   *  We rewrite both the formula (so Visio recalc agrees) and the
   *  cached V (so first paint matches). */
  function widenDataStoreRingSpacing(content: string, instanceH: number): string {
    const updates: Array<{
      ix: number;
      newY: number;
      newB: number;
      newYFraction: number;
      newBFraction: number;
    }> = [
      { ix: 1, newYFraction: 0.893, newBFraction: 0.786,
        newY: 0.893 * instanceH, newB: 0.786 * instanceH },
      { ix: 3, newYFraction: 0.777, newBFraction: 0.670,
        newY: 0.777 * instanceH, newB: 0.670 * instanceH },
      { ix: 2, newYFraction: 0.661, newBFraction: 0.554,
        newY: 0.661 * instanceH, newB: 0.554 * instanceH },
    ];
    for (const u of updates) {
      // Replace MoveTo Y, EllipticalArcTo Y, and B (the second ellipse
      // axis endpoint that sets arc curvature) inside the IX section.
      const sectRe = new RegExp(
        `(<Section N='Geometry' IX='${u.ix}'>[\\s\\S]*?<\\/Section>)`,
      );
      const sectMatch = content.match(sectRe);
      if (!sectMatch) continue;
      let sect = sectMatch[1];
      // Y cells in MoveTo and EllipticalArcTo rows
      sect = sect.replace(
        /(<Cell N='Y' V=')[\d.]+('[^>]*F=')Height\*[\d.]+(')/g,
        `$1${u.newY}$2Height*${u.newYFraction}$3`,
      );
      // B cells in EllipticalArcTo
      sect = sect.replace(
        /(<Cell N='B' V=')[\d.]+('[^>]*F=')Height\*[\d.]+(')/g,
        `$1${u.newB}$2Height*${u.newBFraction}$3`,
      );
      content = content.replace(sectRe, sect);
    }
    return content;
  }

  /** Override the NoShow cells in Shapes 12 and 13 of the Subprocess
   *  master so the + marker is always hidden. Used for Expanded
   *  Subprocess where the marker doesn't apply. */
  function hideCollapsedMarker(content: string): string {
    return content.replace(
      /(<Shape ID='1[23]'[^>]*>[\s\S]*?)<Cell N='NoShow' V='[01]' F='NOT\(Sheet\.5!Actions\.Collapsed\.Checked\)'\/>/g,
      `$1<Cell N='NoShow' V='1' F='1'/>`,
    );
  }

  /** Lay out the Subprocess bottom-row markers along the body's bottom
   *  centre by rewriting each visible marker shape's cached PinX V to
   *  match the master's `BpmnIconPosition` formula evaluation. Order
   *  (matching the master's per-shape position formulas):
   *
   *    Loop (1) → Compensation (2) → Collapsed (3) → AdHoc (4)
   *
   *  Master-derived constants:
   *    PinX = (W - IconW*N)/2 - IconW/2 + IconW*Position
   *         = W/2 + IconW*(Position - (N+1)/2)
   *  IconW ≈ 0.18in (User.BpmnIconWidth in master 33). Each marker's
   *  IconWidth varies slightly (0.18 vs 0.19) but using a single value
   *  matches the visual layout closely enough; the formula recalculation
   *  on Visio's first interaction will refine. */
  function layoutSubprocessMarkers(
    content: string,
    instanceW: number,
    opts: {
      loopShapeId: number | null;
      hasCollapsed: boolean;
      hasAdHoc: boolean;
    },
  ): string {
    const ICON_W = 0.18;
    const center = instanceW / 2;
    const ordered: number[] = [];
    if (opts.loopShapeId !== null) ordered.push(opts.loopShapeId);
    if (opts.hasCollapsed) ordered.push(11);
    if (opts.hasAdHoc) ordered.push(10);
    const N = ordered.length;
    if (N === 0) return content;
    let out = content;
    for (let i = 0; i < ordered.length; i++) {
      const shapeId = ordered[i];
      const position = i + 1;
      const pinX = center + ICON_W * (position - (N + 1) / 2);
      const re = new RegExp(
        `(<Shape ID='${shapeId}'[^>]*>[\\s\\S]*?<Cell N='PinX' V=')[\\d.]+(')`,
      );
      out = out.replace(re, `$1${pinX}$2`);
    }
    return out;
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
    elType?: string,
    elProps?: Record<string, unknown>,
    repeatType?: string,
    skipColourBake?: boolean,
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

    // BPMN_M-specific colour bake + task marker nudge. v1.5 callers pass
    // skipColourBake=true to reuse only the size-rescaling logic below —
    // v1.5 masters ship pre-styled and the BPMN_M task marker offsets
    // (3MM → 4.58MM) would mis-fire on v1.5's different marker layout.
    if (!skipColourBake) {
      masterContent = bakeColourIntoMaster(masterContent, colour, elType);

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

    // Subprocess bottom-row markers (master 33). Lay out whichever are
    // active (Loop / Compensation / Collapsed / AdHoc) along the body's
    // bottom centre, sized correctly, and with cached PinX values
    // matching the BPMN_M positioning formulas — otherwise multiple
    // active markers overlap at body centre on first paint until Visio
    // recalcs.
    if (sourceMasterId === 33 && instanceH !== undefined && instanceW !== undefined) {
      // Force IF(IsInstance,1,2) → 1.5 so Shape 11/12/13 size to 6MM
      // (50% bigger than 1× = the size that worked best in testing).
      masterContent = masterContent.replace(
        /IF\(Sheet\.5!User\.IsInstance,1,2\)/g,
        "1.5",
      );
      masterContent = masterContent.replace(
        /IF\(Sheet\.5!User\.IsInstance,0,0\.1\)/g,
        "0",
      );
      // Re-pin Shape 11 PinY to `3.5MM*DropOnPageScale` so the 6MM-tall
      // marker sits just above the body bottom (0.5MM gap).
      const pinYNew = 0.13779527559055118; // 3.5MM in inches
      masterContent = masterContent.replace(
        /(<Shape ID='11'[^>]*>[\s\S]*?<Cell N='PinY' V=')[\d.]+(' U='MM' F=')[^']+(')/,
        `$1${pinYNew}$2GUARD(3.5MM*Sheet.5!DropOnPageScale)$3`,
      );
      // Scale Shape 11/12/13 cached V's to match the 1.5× formula
      // (template natural is 2× → factor 1.5/2 = 0.75).
      masterContent = scaleMarkerShape(masterContent, 11, 0.75, ["PinX", "PinY"]);
      masterContent = scaleMarkerShape(masterContent, 12, 0.75);
      masterContent = scaleMarkerShape(masterContent, 13, 0.75);
      // Compute which markers are active and rewrite their PinX cached
      // V's to match where the master's `BpmnIconPosition` formulas
      // would place them with this combination active. Without this,
      // multiple active markers all paint at body centre on first frame
      // (overlapping) until Visio recalcs.
      const hasAdHoc = elProps?.adHoc === true;
      const hasCollapsed = elType === "subprocess";
      const loopShapeId =
        repeatType === "loop" ? 16
        : repeatType === "mi-sequential" ? 27
        : repeatType === "mi-parallel" ? 15
        : null;
      masterContent = layoutSubprocessMarkers(
        masterContent,
        instanceW,
        { loopShapeId, hasCollapsed, hasAdHoc },
      );
      if (elType === "subprocess-expanded") {
        masterContent = hideCollapsedMarker(masterContent);
        // Pin the label just below the top boundary instead of centred.
        // Use a 6MM-tall text block anchored at the top of the body, with
        // the text top-aligned within the block. Cached V's compute from
        // the instance height so first paint matches the formula.
        masterContent = positionExpandedSubprocessLabel(
          masterContent,
          instanceH,
        );
      } else {
        // Collapsed Subprocess: shift the centre-anchored label up 5px
        // (= 5/96" ≈ 1.32MM) so it doesn't crowd the bottom-row markers.
        // Visio shape coords are Y-up — "up" on screen = higher Y.
        masterContent = shiftSubprocessLabelUp(masterContent, instanceH);
      }
    }

    // v1.5 Sub-Process masters (ID 7 = Collapsed, ID 8 = Expanded). The
    // marker row at the bottom of the body has these slot-bearing shapes
    // (each is gated by its own Action.Checked formula):
    //
    //   Shape 16  StandardLoop group   (contains Shape 17 — the arrow)
    //   Shape 15  ParallelLoop          (leaf shape)
    //   Shape 27  SequentialLoop        (leaf shape)
    //   Shape 14  Compensation          (leaf shape)
    //   Shape 11  Collapsed indicator   (group with Shapes 12/13 +box)
    //   Shape 10  AdHoc                 (leaf shape)
    //
    // Each marker has its own cached PinX = master-natural body centre
    // (1.15 in the as-shipped master), so after the size rescale pass
    // every active marker overlaps at the instance centre on first
    // paint. The master's PinX formula correctly computes slot offsets
    // via `(W - IW*NumIconsVisible)/2 - IW/2 + IW*BpmnIconPosition` —
    // but Visio uses cached V on first paint before that formula runs.
    //
    // Fix per active marker:
    //   (a) Rewrite cached PinX to the slot's body-centre offset.
    //   (b) Bump the marker's `User.BpmnIconWidth` (cached + formula) to
    //       a wider value so the post-recalc spacing also has a visible
    //       gap. The shipped 0.18" pitch leaves only a ~0.02" gap between
    //       Shape 16 (0.157" wide) and Shape 10 (0.157" wide) — close
    //       enough to look overlapping. 0.27" gives a clean ~0.11" gap.
    if ((sourceMasterId === 7 || sourceMasterId === 8)
        && instanceW !== undefined) {
      const hasAdHocV15 = elProps?.adHoc === true;
      // The Collapsed-indicator slot (Shape 11) is only visible on the
      // Collapsed Sub-Process master (sourceMasterId === 7) AND only
      // when the Diagramatix element is a collapsed subprocess.
      const hasCollapsedIndicator = elType === "subprocess" && sourceMasterId === 7;
      const loopShapeIdV15 =
        repeatType === "loop"          ? 16
        : repeatType === "mi-parallel"   ? 15
        : repeatType === "mi-sequential" ? 27
        : null;

      // Build the active-marker slot order (left → right). Master's own
      // `BpmnIconPosition` formulas assume this order: Loop → Compensation
      // → Collapsed → AdHoc. We don't have Compensation in Diagramatix yet
      // so it never slots in.
      const orderedV15: number[] = [];
      if (loopShapeIdV15 !== null) orderedV15.push(loopShapeIdV15);
      if (hasCollapsedIndicator) orderedV15.push(11);
      if (hasAdHocV15) orderedV15.push(10);

      if (orderedV15.length > 0) {
        const ICON_W_V15 = 0.27; // master ships 0.18, too tight — widen
        const center = instanceW / 2;
        for (let i = 0; i < orderedV15.length; i++) {
          const shapeId = orderedV15[i];
          const position = i + 1;
          const pinX = center + ICON_W_V15 * (position - (orderedV15.length + 1) / 2);
          // (a) Override the marker's cached PinX V.
          const pinXRe = new RegExp(
            `(<Shape ID='${shapeId}'[^>]*>[\\s\\S]*?<Cell N='PinX' V=')[\\d.]+(')`,
          );
          masterContent = masterContent.replace(pinXRe, `$1${pinX}$2`);
          // (b) Bump BpmnIconWidth on this marker so post-recalc spacing
          //     also opens out. Master's row is
          //       <Row N='BpmnIconWidth'><Cell N='Value' V='0.18' U='PER'
          //         F='0.18*Sheet.5!DropOnPageScale'/></Row>
          //     — patch both V and F. (Some shapes use 0.19 instead of
          //     0.18; the regex covers either.)
          const iconWRe = new RegExp(
            `(<Shape ID='${shapeId}'[^>]*>[\\s\\S]*?<Row N='BpmnIconWidth'><Cell N='Value' V=')[\\d.]+(' U='PER' F=')[\\d.]+(\\*Sheet\\.5!DropOnPageScale')`,
          );
          masterContent = masterContent.replace(iconWRe, `$1${ICON_W_V15}$2${ICON_W_V15}$3`);
        }
      }
    }

    // v1.5 Task master (sourceMasterId === 6). Root Shape 5's TxtPinX /
    // TxtPinY cells reference `Controls.Text_Reposition` / `…Y` formulas
    // — but the master ships with NO `<Section N='Controls'>`, so the
    // formula is dangling. Visio falls back to the cached V (master-
    // natural 0.53125 / 0.3385) and the text NEVER re-centres when the
    // task is resized: a 2×-tall task shows the label at the master-
    // default vertical position instead of centred in the new bounding
    // box. Replace both the V and the F with `Width*0.5` / `Height*0.5`
    // on the cloned master so first paint AND post-recalc both agree on
    // a centred label scaled to the instance dimensions.
    if (sourceMasterId === 6 && instanceW !== undefined && instanceH !== undefined) {
      const halfW = instanceW / 2;
      const halfH = instanceH / 2;
      masterContent = masterContent.replace(
        /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='TxtPinX' V=')[\d.]+(' F=')[^']+(')/,
        `$1${halfW}$2Width*0.5$3`,
      );
      masterContent = masterContent.replace(
        /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='TxtPinY' V=')[\d.]+(' F=')[^']+(')/,
        `$1${halfH}$2Height*0.5$3`,
      );
    }

    // Non-interrupting events (master 105 = Intermediate, 107 = Start).
    // The body outline shapes (6, 7 for both, plus 9 for Intermediate)
    // have `LinePattern` formulas like:
    //   GUARD(IF(OR(StartNonInterrupting.Checked,IntermediateNonInterrupting.Checked),2,1))
    // → cached V=1 (solid) on first paint until Visio recalcs. Force the
    // cached V to 2 (dashed) directly so first paint matches.
    if (
      (sourceMasterId === 105 || sourceMasterId === 107) &&
      elProps?.interruptionType === "non-interrupting"
    ) {
      masterContent = masterContent.replace(
        /(<Cell N='LinePattern' V=')1('[^>]*F='[^']*Actions\.(?:Start|Intermediate)NonInterrupting[^']*'\/>)/g,
        `$12$2`,
      );
    }

    // Event Subprocess (master 33, subprocessType="event"). Body shape 6's
    // LinePattern gates on `(BoundaryEvent.Checked AND CollapsedSubProcess.Checked)`,
    // so the dashed border only fires for COLLAPSED event subprocesses by
    // default. Drop the CollapsedSubProcess clause so Expanded Event
    // Subprocess (BPMN convention) also draws with a dashed outline.
    // Cached V also forced to 3 (= dashed line pattern) so first paint
    // matches.
    if (sourceMasterId === 33 && elProps?.subprocessType === "event") {
      masterContent = masterContent.replace(
        /(<Shape ID='6'[^>]*>[\s\S]*?<Cell N='LinePattern' V=')\d('[^>]*F=')[^']+(')/,
        `$13$2GUARD(IF(Sheet.5!Actions.BoundaryEvent.Checked,3,1))$3`,
      );
    }

    // v1.5 Data Object (master 11) Collection marker — same mechanism as
    // BPMN_M master 115 but different sub-shape ID. Shape 7's THREE
    // Geometry sections each draw one of the collection bars; IX=0 is
    // gated directly on `NOT(BpmnCollection)`, IX=1 and IX=2 chain via
    // `Geometry1.NoShow`. The cached NoShow V on all three is 1 (hidden);
    // unless we flip every one of them, Visio paints only the IX=0 bar
    // on first frame (single-line marker) until a manual recalc kicks in.
    if (sourceMasterId === 11 && elProps?.multiplicity === "collection") {
      masterContent = masterContent.replace(
        /(<Row N='BpmnCollection'>[\s\S]*?<Cell N='Value' V=')0(' U='BOOL'[^/]*\/>)/,
        "$11$2",
      );
      masterContent = masterContent.replace(
        /<Shape ID='7'[\s\S]*?<\/Shape>/,
        (block) => block.replace(/<Cell N='NoShow' V='1'/g, "<Cell N='NoShow' V='0'"),
      );
    }

    // v1.5 Data Object (master 11) role=output → filled arrow. Shape 8 is
    // the input/output arrow marker — currently ALWAYS drawn outlined
    // (NoFill='1' on Geometry IX=0). For role=output, BPMN convention
    // calls for a filled arrow; flip NoFill to 0 AND set FillForegnd to
    // the LineColor (#374151) so the arrow body fills with the outline
    // colour rather than the master's default warm-orange. role=input
    // keeps the outlined default. (Role-none data-objects still show
    // the arrow today — out of scope for this change.)
    if (sourceMasterId === 11 && elProps?.role === "output") {
      masterContent = masterContent.replace(
        /<Shape ID='8'[\s\S]*?<\/Shape>/,
        (block) =>
          block
            // Flip the geometry's NoFill from 1 → 0
            .replace(
              /(<Section N='Geometry' IX='0'>[\s\S]*?<Cell N='NoFill' V=')1(')/,
              "$10$2",
            )
            // Repoint FillForegnd to the dark line color so the fill is
            // visible (the master defaults to #fed7aa themed-background).
            .replace(
              /<Cell N='FillForegnd' V='[^']+' F='GUARD\(THEMEGUARD\(THEME\("BackgroundColor"\)\+1\)\)'\/>/,
              "<Cell N='FillForegnd' V='#374151' F='GUARD(RGB(55,65,81))'/>",
            ),
      );
    }

    // v1.5 Sub-Process masters (7 = Collapsed, 8 = Expanded) carry the same
    // broken Shape 6 LinePattern formula as BPMN_M's master 33:
    //   GUARD(IF(AND(BoundaryEvent.Checked,CollapsedSubProcess.Checked),3,1))
    // The AND clause means an Expanded EP with BoundaryType="Event" never
    // gets a dashed outline (CollapsedSubProcess.Checked is FALSE for the
    // expanded variant). Apply the same formula simplification + cached V
    // override as BPMN_M does.
    if ((sourceMasterId === 7 || sourceMasterId === 8)
        && elProps?.subprocessType === "event") {
      masterContent = masterContent.replace(
        /(<Shape ID='6'[^>]*>[\s\S]*?<Cell N='LinePattern' V=')\d('[^>]*F=')[^']+(')/,
        `$13$2GUARD(IF(Sheet.5!Actions.BoundaryEvent.Checked,3,1))$3`,
      );
    }

    // Data Object Collection marker (master 57 = mapping.masterId 115).
    // Shape 7's three Geometry sections each carry a NoShow cell whose
    // formula is `NOT(Sheet.5!Prop.BpmnCollection)` (or chains off
    // Geometry1.NoShow). Flipping the BpmnCollection Prop's cached V to
    // '1' makes the formula evaluate to NoShow=0, BUT Visio paints the
    // first frame from cached V — so the three NoShow cached V's need
    // to be flipped from '1' to '0' as well or the bars stay hidden
    // until Visio recalcs. Scope the NoShow flip to Shape 7's block to
    // avoid touching other shapes' NoShow cells.
    if (sourceMasterId === 115 && elProps?.multiplicity === "collection") {
      masterContent = masterContent.replace(
        /(<Row N='BpmnCollection'>[\s\S]*?<Cell N='Value' V=')0(' U='BOOL'\/>)/,
        "$11$2",
      );
      masterContent = masterContent.replace(
        /<Shape ID='7'[\s\S]*?<\/Shape>/,
        (block) => block.replace(/<Cell N='NoShow' V='1'/g, "<Cell N='NoShow' V='0'"),
      );
    }

    // Data Object Input/Output role marker (master 115).
    // Master 115 has no native BpmnDataInput/BpmnDataOutput Prop, so inject a
    // 7-point arrow polygon as a new sub-shape (Shape 8) into Shape 5's
    // children group. Filled #374151 for "output", white with #374151 stroke
    // for "input". Matches the canvas glyph in `DataObjectShape`:
    //   arrowW = w * 0.28, arrowH = h * 0.18
    //   triW   = arrowW * 0.7, rectW = arrowW * 0.35, rectH = arrowH * 0.35
    //   anchored 3px from the body's left edge, 4px below its top
    if (
      sourceMasterId === 115 &&
      instanceW !== undefined &&
      instanceH !== undefined &&
      (elProps?.role === "input" || elProps?.role === "output")
    ) {
      const role = elProps.role as "input" | "output";
      const arrowW = instanceW * 0.28;
      const arrowH = instanceH * 0.18;
      const rectW  = arrowW * 0.35;
      const triW   = arrowW * 0.7;
      const markerW = rectW + triW;            // total horizontal extent
      const markerH = arrowH;
      // Master local coords are Y-up; canvas position "3px from left, 4px
      // from top" → master x=3/96 from left, y=H-4/96 at the marker's top.
      const inset = 3 / 96;
      const topInset = 4 / 96;
      const pinX = inset + markerW / 2;
      const pinY = instanceH - topInset - markerH / 2;
      // Polygon points in marker-local coords (Y-up, origin at bottom-left
      // of the marker bounding box).
      const xL = 0;
      const xM = rectW;
      const xR = markerW;
      const yShaftHi = (markerH + arrowH * 0.35) / 2; // shaft top (Y-up)
      const yShaftLo = (markerH - arrowH * 0.35) / 2; // shaft bottom
      const yHeadHi  = markerH;                       // arrowhead top
      const yHeadLo  = 0;                             // arrowhead bottom
      const yTip     = markerH / 2;                   // arrowhead tip
      const isFilled = role === "output";
      const fillColor = "#374151";
      const fillF     = hexToVisioRgb(fillColor);
      const noFill    = isFilled ? "0" : "1";
      const noLine    = isFilled ? "1" : "0";
      const lineColor = isFilled ? "#000000" : fillColor;
      const lineColorF = isFilled ? "GUARD(0)" : `${fillF}`;
      const lineWeight = isFilled ? "0" : "0.0166"; // ~1.2pt for the input outline
      const roleMarkerShape =
        `<Shape ID='8' Type='Shape' LineStyle='3' FillStyle='3' TextStyle='3'>` +
        `<Cell N='PinX' V='${pinX}'/>` +
        `<Cell N='PinY' V='${pinY}'/>` +
        `<Cell N='Width' V='${markerW}'/>` +
        `<Cell N='Height' V='${markerH}'/>` +
        `<Cell N='LocPinX' V='${markerW / 2}'/>` +
        `<Cell N='LocPinY' V='${markerH / 2}'/>` +
        `<Cell N='Angle' V='0'/>` +
        `<Cell N='LineWeight' V='${lineWeight}' U='PT'/>` +
        `<Cell N='LineColor' V='${lineColor}' F='${lineColorF}'/>` +
        `<Cell N='LinePattern' V='1' F='GUARD(1)'/>` +
        `<Cell N='FillForegnd' V='${isFilled ? fillColor : "#ffffff"}' F='${isFilled ? fillF : "GUARD(THEMEGUARD(THEME(\"BackgroundColor\")+1))"}'/>` +
        `<Cell N='FillPattern' V='1' F='GUARD(1)'/>` +
        `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='${noFill}'/>` +
        `<Cell N='NoLine' V='${noLine}'/>` +
        `<Cell N='NoShow' V='0'/>` +
        `<Cell N='NoSnap' V='0'/>` +
        `<Cell N='NoQuickDrag' V='0'/>` +
        `<Row T='MoveTo'  IX='1'><Cell N='X' V='${xL}'/><Cell N='Y' V='${yShaftHi}'/></Row>` +
        `<Row T='LineTo'  IX='2'><Cell N='X' V='${xM}'/><Cell N='Y' V='${yShaftHi}'/></Row>` +
        `<Row T='LineTo'  IX='3'><Cell N='X' V='${xM}'/><Cell N='Y' V='${yHeadHi}'/></Row>` +
        `<Row T='LineTo'  IX='4'><Cell N='X' V='${xR}'/><Cell N='Y' V='${yTip}'/></Row>` +
        `<Row T='LineTo'  IX='5'><Cell N='X' V='${xM}'/><Cell N='Y' V='${yHeadLo}'/></Row>` +
        `<Row T='LineTo'  IX='6'><Cell N='X' V='${xM}'/><Cell N='Y' V='${yShaftLo}'/></Row>` +
        `<Row T='LineTo'  IX='7'><Cell N='X' V='${xL}'/><Cell N='Y' V='${yShaftLo}'/></Row>` +
        `<Row T='LineTo'  IX='8'><Cell N='X' V='${xL}'/><Cell N='Y' V='${yShaftHi}'/></Row>` +
        `</Section>` +
        `</Shape>`;
      masterContent = masterContent.replace(
        /<\/Shapes><\/Shape><\/Shapes><\/MasterContents>/,
        `${roleMarkerShape}</Shapes></Shape></Shapes></MasterContents>`,
      );
    }

    // Data Store ring spacing. Master 58 has 3 horizontal arcs at the top
    // of the cylinder at Y fractions 0.893 / 0.835 / 0.777 (gap = 0.058
    // each). Doubling the gap to 0.116 spreads the rings out so they read
    // as a stacked cylinder rather than a single thick band.
    if (sourceMasterId === 116 && instanceH !== undefined) {
      masterContent = widenDataStoreRingSpacing(masterContent, instanceH);
    }

    // Gateway marker tweaks (master 50 = mapping.masterId 104).
    if (sourceMasterId === 104 && instanceW !== undefined && instanceH !== undefined) {
      const gwType = elProps?.gatewayType ?? "exclusive";
      // Master 50's Shape 5 natural Width=1in, Height=0.75in.
      // (kept for any callers that still need a ratio; helpers below
      // now take the instance dimensions directly.)
      // Event-based: clean rewrite of the marker — outer + inner
      // circles + pentagon — matching Diagramatix canvas proportions.
      if (gwType === "event-based") {
        masterContent = shrinkEventBasedMarker(masterContent, instanceW, instanceH);
      }
      // Inclusive: render as a thick unfilled ring instead of two
      // stacked filled ellipses.
      if (gwType === "inclusive") {
        masterContent = drawInclusiveAsThickRing(masterContent);
      }
      // Parallel: 25% longer cross arms, same arm thickness. Replace
      // Shape 13 with a square sized at body × 0.5513 (= 0.441 × 1.25)
      // and rewrite its Geometry section so the arm thickness fraction
      // shrinks by 1/1.25 = 0.8 — that keeps the absolute thickness the
      // same as the natural template while extending the arms to the
      // new (larger) bounding box edges.
      if (gwType === "parallel") {
        masterContent = lengthenParallelArms(masterContent, instanceW);
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
  // Edge-mounted (boundary) events are emitted into a separate bucket
  // and appended AFTER connectors, so Visio's draw-order (= declaration
  // order) paints them on TOP of any connector that crosses them.
  // Without this, sequence-flow lines slice through the small event
  // circle on a Subprocess/EP boundary and the event reads as broken.
  const edgeShapes: string[] = [];
  const connects: string[] = [];
  const elIdToShapeId = new Map<string, number>();
  let nextId = 100;

  // Pre-pass: assign shape IDs to every element BEFORE emission so that
  // when a Pool emits, it can list its child Lane IDs in a Visio
  // `<Section N='Member'>` block. Without that pre-pass, Pools (which
  // typically come before their Lanes in the iteration order) wouldn't
  // know the Lane IDs yet.
  for (const el of data.elements) {
    const m = getElementMappingV3(el, profile);
    if (!m) continue;
    elIdToShapeId.set(el.id, nextId);
    nextId += 100;
  }
  // Reset nextId so the actual emission loop reuses the same allocations.
  nextId = 100;

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

  // Per-export cache of v1.5 task per-instance master clones keyed by
  // (sourceMasterId, w, h). Diagrams commonly have many tasks at the same
  // size; cloning the Task master once per distinct size keeps the file
  // small while still fixing the cached-V first-paint issue. Sub-process
  // and data-object clones intentionally do NOT use this cache — their
  // per-instance content depends on additional element properties
  // (subprocessType, repeatType, adHoc, collection, role) so they need a
  // fresh clone per instance.
  const taskCloneCache = new Map<string, number>();

  for (const el of data.elements) {
    const mapping = getElementMappingV3(el, profile);
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
    const triggerActions: string[] = [];
    if (
      el.type === "start-event" ||
      el.type === "intermediate-event" ||
      el.type === "end-event"
    ) {
      const trig = EVENT_TRIGGER_ACTION[el.eventType ?? "none"] ?? "NoTriggerResult";
      const noTrig = trig === "NoTriggerResult" ? "1" : "0";
      const isNonInterrupting =
        (el.type === "start-event" || el.type === "intermediate-event") &&
        (el.properties as Record<string, unknown> | undefined)
          ?.interruptionType === "non-interrupting";
      const niAction = isNonInterrupting
        ? el.type === "start-event"
          ? "StartNonInterrupting"
          : "IntermediateNonInterrupting"
        : null;
      actionsSection = `<Section N='Actions'>` +
        `<Row N='NoTriggerResult'><Cell N='Checked' V='${noTrig}' F='Inh'/></Row>` +
        (trig !== "NoTriggerResult"
          ? `<Row N='${trig}'><Cell N='Checked' V='1' F='Inh'/></Row>`
          : "") +
        (niAction
          ? `<Row N='${niAction}'><Cell N='Checked' V='1' F='Inh'/></Row>`
          : "") +
        `</Section>`;
      if (trig !== "NoTriggerResult") triggerActions.push(trig);
    } else if (el.type === "task") {
      const act = TASK_TYPE_ACTION[el.taskType ?? "none"] ?? "NoTaskType";
      const noAct = act === "NoTaskType" ? "1" : "0";
      actionsSection = `<Section N='Actions'>` +
        `<Row N='NoTaskType'><Cell N='Checked' V='${noAct}' F='Inh'/></Row>` +
        (act !== "NoTaskType"
          ? `<Row N='${act}'><Cell N='Checked' V='1' F='Inh'/></Row>`
          : "") +
        `</Section>`;
      if (act !== "NoTaskType") triggerActions.push(act);
    } else if (el.type === "gateway") {
      const role = (el.properties as Record<string, unknown> | undefined)
        ?.gatewayRole ?? "decision";
      if (role !== "merge") {
        // Decision gateway: emit the action that matches gatewayType.
        // Diagramatix's `none` means "plain diamond, no inner marker" —
        // use `ExclusiveData` (Exclusive Gateway, no X) rather than
        // `ExclusiveDataWithMarker` (Exclusive Gateway with X).
        const GATEWAY_TYPE_ACTION: Record<string, string> = {
          "none":        "ExclusiveData",
          "exclusive":   "ExclusiveDataWithMarker",
          "inclusive":   "Inclusive",
          "parallel":    "Parallel",
          "event-based": "ExclusiveEvent",
        };
        const act = GATEWAY_TYPE_ACTION[el.gatewayType ?? "none"]
          ?? "ExclusiveData";
        actionsSection = `<Section N='Actions'>` +
          `<Row N='${act}'><Cell N='Checked' V='1' F='Inh'/></Row>` +
          `</Section>`;
        triggerActions.push(act);
      }
      // Merge gateways: no Actions section emitted → no inner marker
      // (the master's marker NoShow formulas all evaluate visible-only
      // when their Action.Checked = 1, so leaving them all unchecked
      // keeps the diamond clean).
    } else if (el.type === "subprocess" || el.type === "subprocess-expanded") {
      // Subprocesses can carry multiple bottom-row markers simultaneously:
      // a Loop / MI variant from `repeatType`, plus the AdHoc tilde from
      // `properties.adHoc`. The master's PinX formula uses
      // `BpmnNumIconsVisible` to space them out across the bottom centre.
      // Plus a boundary action (BoundaryEvent / BoundaryCall) when the
      // user has set `subprocessType` to "event" / "call" — which switches
      // the body outline to the appropriate dashed / double border.
      //
      // All FOUR loop Action rows (NoLoop / StandardLoop / SequentialLoop /
      // ParallelLoop) are emitted explicitly with cached Checked V matching
      // the selected repeat type. Without the explicit NoLoop=0 override,
      // the master's `NoLoop.Checked = STRSAME(Prop.BpmnLoopType,
      // INDEX(0,…))` formula keeps its cached V=1 on first paint, and Visio
      // shows BOTH "Normal" AND the active MI marker checked simultaneously
      // until a manual recalc kicks in.
      const SUBPROCESS_REPEAT_ACTION: Record<string, string> = {
        "loop":          "StandardLoop",
        "mi-sequential": "SequentialLoop",
        "mi-parallel":   "ParallelLoop",
      };
      const SUBPROCESS_BOUNDARY_ACTION: Record<string, string> = {
        "call":  "BoundaryCall",
        "event": "BoundaryEvent",
      };
      const props = el.properties as Record<string, unknown> | undefined;
      const repeatType = el.repeatType ?? "none";
      const repeatAct = SUBPROCESS_REPEAT_ACTION[repeatType];
      const boundaryAct = SUBPROCESS_BOUNDARY_ACTION[
        props?.subprocessType as string ?? "normal"
      ];
      const adHoc = props?.adHoc === true;

      // Build the full loop-action row set. Exactly one is V='1' at any time.
      const loopRows = [
        `<Row N='NoLoop'><Cell N='Checked' V='${repeatType === "none" ? "1" : "0"}' F='Inh'/></Row>`,
        `<Row N='StandardLoop'><Cell N='Checked' V='${repeatType === "loop" ? "1" : "0"}' F='Inh'/></Row>`,
        `<Row N='SequentialLoop'><Cell N='Checked' V='${repeatType === "mi-sequential" ? "1" : "0"}' F='Inh'/></Row>`,
        `<Row N='ParallelLoop'><Cell N='Checked' V='${repeatType === "mi-parallel" ? "1" : "0"}' F='Inh'/></Row>`,
      ];
      const extraRows: string[] = [];
      if (adHoc) extraRows.push(`<Row N='AdHoc'><Cell N='Checked' V='1' F='Inh'/></Row>`);
      if (boundaryAct) extraRows.push(`<Row N='${boundaryAct}'><Cell N='Checked' V='1' F='Inh'/></Row>`);
      actionsSection = `<Section N='Actions'>` + loopRows.join("") + extraRows.join("") + `</Section>`;
      // triggerActions drives the per-shape marker NoShow overrides via
      // TRIGGER_MARKER_MAP. We push only the SELECTED actions (not the
      // explicitly-unchecked ones) so unrelated marker sub-shapes stay
      // hidden as the master's NoShow formula intends.
      if (repeatAct) triggerActions.push(repeatAct);
      if (adHoc) triggerActions.push("AdHoc");
      if (boundaryAct) triggerActions.push(boundaryAct);
    }

    // Each marker is one or more (shapeId, geomIxs) overrides — Geometry IX
    // values whose NoShow we force to '0' (visible). A small number of
    // markers ALSO need to HIDE another sub-shape that would otherwise
    // paint over them at first paint — Terminate is the canonical case
    // (Shape 9 = End body, paints over Shape 8 = Terminate filled circle
    // because of master z-order). For those, the spec sets `noShow: "1"`.
    // The companion master-stencil patch in
    // `scripts/fix-terminate-marker.cjs` extends the master's NoShow
    // formula so Visio's recalc keeps the body hidden too.
    type MarkerSpec = { shapeId: number; geomIxs: number[]; noShow?: "0" | "1" };
    const TRIGGER_MARKER_MAP: Record<string, MarkerSpec[]> = {
      // Event triggers (BPMN_M Start/Intermediate/End Event masters)
      "Message":      [{ shapeId: 10, geomIxs: [0, 1, 2] }],
      "Link":         [{ shapeId: 11, geomIxs: [0] }],
      "Timer":        [{ shapeId: 12, geomIxs: [0,1,2,3,4,5,6,7,8,9,10,11,12,13] }],
      "Signal":       [{ shapeId: 13, geomIxs: [0] }],
      "Compensation": [{ shapeId: 15, geomIxs: [0, 1] }],
      "Escalation":   [{ shapeId: 16, geomIxs: [0] }],
      // Terminate: show Shape 8 (the smaller black filled disc). The
      // companion `scripts/fix-terminate-marker.cjs` moves Shape 8 to
      // render AFTER Shape 9 in master z-order so the disc paints on
      // top of the coloured End body, with a visible ring of body
      // colour showing around it.
      "Terminate":    [{ shapeId: 8, geomIxs: [0] }],
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
      // Subprocess bottom-row markers (BPMN_M Subprocess master 33).
      // Multiple markers can show simultaneously; the master's PinX
      // formula uses `BpmnNumIconsVisible` to lay them out side-by-side.
      "AdHoc":          [{ shapeId: 10, geomIxs: [0] }],
      "StandardLoop":   [{ shapeId: 17, geomIxs: [0] }],
      // MI markers draw three parallel lines via three Geometry sections
      // each — Geom 0 has the explicit `Actions.X.Checked` NoShow, while
      // Geom 1 and 2 chain via `GeometryN.NoShow` references. On first
      // paint Visio uses cached V, so each Geom needs its own NoShow=0
      // override or we only see one line.
      "SequentialLoop": [{ shapeId: 27, geomIxs: [0, 1, 2] }],
      "ParallelLoop":   [{ shapeId: 15, geomIxs: [0, 1, 2] }],
    };
    const triggerMarkers: MarkerSpec[] = triggerActions.flatMap(
      (a) => TRIGGER_MARKER_MAP[a] ?? [],
    );

    // Root-level marker geometries — drawn on the master ROOT (Shape 5)
    // rather than on a dedicated marker sub-shape. These need a Geometry
    // IX NoShow override on the INSTANCE shape itself (not as a sub-shape
    // stub). Common to start / intermediate / end event masters in the
    // BPMN_M template:
    //   IX=0 → Error    (visible when Actions.Error.Checked AND any of
    //                    Actions.Start/Intermediate/End is also checked)
    //   IX=1 → Cancel   (visible when Actions.Cancel.Checked AND Action.
    //                    Intermediate or End is also checked)
    //   IX=2 → Conditional
    // The instance overrides Actions.<Trigger>.Checked via the trigger
    // row above; the master's existing AND-clause re-evaluates correctly,
    // but Visio uses the cached V (=1, NoShow) on first paint. Forcing
    // V=0 here is what actually makes the marker visible.
    const ROOT_MARKER_IX_MAP: Record<string, number> = {
      "Error":       0,
      "Cancel":      1,
      "Conditional": 2,
    };
    const rootMarkerIxs: number[] = triggerActions
      .map((a) => ROOT_MARKER_IX_MAP[a])
      .filter((ix): ix is number => ix !== undefined);
    const rootMarkerSections = rootMarkerIxs
      .map((ix) => `<Section N='Geometry' IX='${ix}'><Cell N='NoShow' V='0' F='Inh'/></Section>`)
      .join("");

    // Identify shape categories by Diagramatix `el.type` rather than by
    // BPMN_M master IDs so the same logic works under every profile
    // (BPMN_M, v1.5, etc.). The previous `mapping.masterId === 19` check
    // accidentally classified v1.5's Gateway master (also ID 9) as a Task
    // because the same numeric ID is used for different masters across
    // profiles.
    const isPool = el.type === "pool" || el.type === "lane";
    const isMergeGateway = el.type === "gateway" &&
      ((el.properties as Record<string, unknown> | undefined)
        ?.gatewayRole === "merge");
    // Suppress the on-canvas label for gateway types that BPMN convention
    // draws unlabeled inside the diamond:
    //   • event-based gateways (the pentagon star is self-explanatory and
    //     the meaning sits on the events fanning out, not on the gateway).
    //   • parallel gateways (the `+` marker means "fork/join", no decision
    //     text applies).
    // Exclusive / Inclusive gateways keep their labels (often the
    // decision question, e.g. "Approved?"). Merge gateways already drop
    // labels via `isMergeGateway` above.
    const isLabellessGateway = el.type === "gateway" &&
      (el.gatewayType === "event-based" || el.gatewayType === "parallel");
    const hideLabel = isMergeGateway || isLabellessGateway;
    const textEl = el.label && !hideLabel
      ? `<Text>${esc(el.label)}</Text>` : "";

    // Setting Width/Height on the page shape only renders correctly when
    // the master's internal sub-shapes scale automatically via formulas
    // (Sheet.5!Width*0.5, etc.) AND their cached V values happen to match
    // the new size. For simple masters (Task, Collapsed Subprocess), the
    // internal shapes are minimal and the formulas re-evaluate cleanly on
    // first open. For complex masters (Expanded Subprocess, Pool, Lane),
    // the inner sub-shapes have cached values baked at the master's
    // natural size — overriding only the root W/H produces a shape whose
    // selection rectangle is the right size but whose inner content paints
    // at the master-natural size, mis-located inside the new bounding box.
    //
    // Until v1.5 has profile-aware per-instance cloning (sub-issue #5+),
    // restrict resize to the two safe types. Gateways and Events also stay
    // at master-natural size (deliberate — keeps standard look).
    // Pool/Lane are intentionally back in this list — the BPMN_M pool
    // branch below (gated on !disableBodyColourBake) needs to run, and the
    // v1.5 pool branch (gated on disableBodyColourBake) likewise. EPs are
    // included so v1.5 emits Width/Height cells on the page shape — the
    // v1.5 EP master (Shape 5 root: W=2.3, H=1.5625, no formula) inherits
    // the cached V cleanly via F='Inh', so the page shape's bounding box
    // matches the instance dims. Sub-shape geometry uses Sheet.5!Width*1
    // formulas that recalc to the right size on first interaction.
    const isResizable = [
      "task", "subprocess", "subprocess-expanded", "pool", "lane",
      // Group is a user-drawn bounding rect — without explicit
      // Width/Height the page shape falls back to the v1.5 Group
      // master's natural 6×4 inches (576×384 px), so user-sized
      // groups rendered ~5× too big.
      "group",
      // Text-annotation: master 13 is a CFF Callout with a Height
      // formula `MAX(IF(User.ResizeWithText, CEILING(TxtHeight, …)))`
      // that auto-grows with text — but only AFTER first recalc.
      // Without an explicit Width/Height on the page shape the first
      // paint uses the master-natural 1×0.3125 inches, far smaller
      // than the text needs, so the annotation looks crushed until
      // the user nudges its size to trigger recalc.
      "text-annotation",
    ].includes(el.type);
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

      // BPMN_M-specific Pool/Lane per-instance master rewriting. The
      // string replacements below target the BPMN_M template's exact
      // cached V values and "Function" placeholder text — v1.5's
      // Pool/Lane master has different numbers and a different layout,
      // so this branch would corrupt it. Gate on profile to skip.
      // (Sub-issue #5 will add v1.5-native Pool/Lane handling.)
      if (isPool && !profile.disableBodyColourBake) {
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

          // Pool header strip width — Visio template uses 12MM, but
          // Diagramatix's `POOL_HEADER_W` is 36px = 9.525MM. Mismatch
          // means Lane.x (set at Pool.x + 36px) sits INSIDE the wider
          // template header, producing the visible overlap. Override
          // the Pool master's header thickness to match Diagramatix.
          poolMasterXml = poolMasterXml
            .split("12MM*DropOnPageScale").join("9.525MM*DropOnPageScale")
            .split("0.4724409448818898").join("0.375")
            .split("0.2362204724409449").join("0.1875");

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

          // Black-Box Pool collection marker: 3 short vertical lines at the
          // bottom-centre of the body region (excluding the left header
          // strip), matching the canvas glyph. Pool master 19 has no
          // BpmnCollection Prop — inject three line shapes (IDs 9/10/11)
          // into Shape 5's Shapes group instead.
          const poolPropsRec = el.properties as Record<string, unknown> | undefined;
          const poolType = (poolPropsRec?.poolType as string | undefined) ?? "black-box";
          const poolIsCollection =
            el.type === "pool"
            && poolType === "black-box"
            && (poolPropsRec?.multiplicity as string | undefined) === "collection";
          if (poolIsCollection) {
            const HEADER_W = 0.375;        // matches the 9.525MM header substitution above
            const lineH    = 0.197;        // ≈ 5mm, ≈ 18px on canvas
            const halfH    = lineH / 2;
            const lineGap  = 0.0625;       // ≈ 1.6mm gap between adjacent line centres
            const bodyMidX = HEADER_W + (w - HEADER_W) / 2;
            const midY     = 0.06 + halfH; // 0.06 in above bottom, then up half a line
            const buildLine = (id: number, pinX: number) =>
              `<Shape ID='${id}' Type='Shape' LineStyle='3' FillStyle='3' TextStyle='3'>` +
              `<Cell N='PinX' V='${pinX}'/>` +
              `<Cell N='PinY' V='${midY}'/>` +
              `<Cell N='Width' V='0'/>` +
              `<Cell N='Height' V='${lineH}'/>` +
              `<Cell N='LocPinX' V='0'/>` +
              `<Cell N='LocPinY' V='${halfH}'/>` +
              `<Cell N='Angle' V='0'/>` +
              `<Cell N='LineWeight' V='0.0138' U='PT' F='GUARD(1PT)'/>` +
              `<Cell N='LineColor' V='0' F='GUARD(0)'/>` +
              `<Cell N='LinePattern' V='1' F='GUARD(1)'/>` +
              `<Cell N='FillForegnd' V='0' F='GUARD(0)'/>` +
              `<Cell N='FillPattern' V='0' F='GUARD(0)'/>` +
              `<Section N='Geometry' IX='0'>` +
              `<Cell N='NoFill' V='1'/>` +
              `<Cell N='NoLine' V='0'/>` +
              `<Cell N='NoShow' V='0'/>` +
              `<Cell N='NoSnap' V='0'/>` +
              `<Cell N='NoQuickDrag' V='0'/>` +
              `<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>` +
              `<Row T='LineTo' IX='2'><Cell N='X' V='0'/><Cell N='Y' V='${lineH}'/></Row>` +
              `</Section>` +
              `</Shape>`;
            const collectionLines =
              buildLine(9,  bodyMidX - lineGap) +
              buildLine(10, bodyMidX) +
              buildLine(11, bodyMidX + lineGap);
            // Inject just before the closing `</Shapes></Shape></Shapes></MasterContents>`.
            // The first `</Shapes>` closes Shape 5's child shapes group.
            poolMasterXml = poolMasterXml.replace(
              /<\/Shapes><\/Shape><\/Shapes><\/MasterContents>/,
              `${collectionLines}</Shapes></Shape></Shapes></MasterContents>`,
            );
          }

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
          // Member section (Visio Container framework): list the shape
          // IDs of every Lane whose `parentId === el.id` so Visio treats
          // them as members of this Pool's container. Result: moving the
          // Pool moves the Lanes; Lane boundary drags resize neighbours.
          // Only emitted on Pools (not Lanes).
          let memberSection = "";
          if (el.type === "pool") {
            const childLaneIds: number[] = [];
            for (const child of data.elements) {
              if (child.type === "lane" && child.parentId === el.id) {
                const cid = elIdToShapeId.get(child.id);
                if (cid !== undefined) childLaneIds.push(cid);
              }
            }
            if (childLaneIds.length > 0) {
              memberSection =
                `<Section N='Member'>` +
                childLaneIds
                  .map(
                    (cid, i) =>
                      `<Row IX='${i + 1}'>` +
                      `<Cell N='ID' V='${cid}'/>` +
                      `<Cell N='ContainerProperties' V='2'/>` +
                      `<Cell N='MemberFlags' V='0'/>` +
                      `</Row>`,
                  )
                  .join("") +
                `</Section>`;
            }
          }
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
            memberSection +
            `</Shape>`
          );
          continue; // skip the normal shape.push below
        }
        // Fallback: no sub-shapes, just position
        subShapes = "";
      } else if (isPool && profile.disableBodyColourBake) {
        // v1.5 Pool / Lane per-instance master.
        //
        // The v1.5 stencil's Pool/Lane master (ID 18 in the stencil,
        // copied to ID 118 in the output via mastersToAdd) has natural
        // cached W/H of 5"×1.25" and a "Function" placeholder in its
        // header text. Without per-instance rewriting every pool exports
        // at 5×1.25 with "Function" in the header, regardless of the
        // Diagramatix dimensions and label.
        //
        // This branch clones the master per-instance, splice-replaces:
        //   • cached W (5 → instance w), cached H (1.25 → instance h),
        //     and the half-values used in LocPin formulas
        //   • the "Function" placeholder in visHeadingText, BpmnName,
        //     BpmnPoolName, and the master's literal <Text>Function</Text>
        // and registers the clone in masters.xml + rels + content-types
        // the same way `createInstanceMaster` does. The page shape then
        // references the clone and supplies visHeadingText + a Member
        // section linking child Lanes.
        const poolLabel = el.label ?? "Pool";
        const stencilMastersXml = await bpmnM
          .file("visio/masters/masters.xml")!.async("string");
        const stencilMastersRels = await bpmnM
          .file("visio/masters/_rels/masters.xml.rels")!.async("string");
        const poolMasterBlock = stencilMastersXml.match(
          /<Master\s+ID='18'[\s\S]*?<\/Master>/,
        );
        const poolRelMatch = poolMasterBlock?.[0].match(
          /<Rel\s+r:id='(rId\d+)'/,
        );
        const poolFileMatch = poolRelMatch
          ? stencilMastersRels.match(
              new RegExp(
                `Id=["']${poolRelMatch[1]}["'][^>]*Target=["']([^"']+)["']`,
              ),
            )
          : null;

        if (poolFileMatch) {
          let poolMasterXml = await bpmnM
            .file("visio/masters/" + poolFileMatch[1])!
            .async("string");

          // Patch cached V values from v1.5 natural dims to instance dims.
          //
          // The natural pool master has THREE places that cache W=5 and
          // H=1.25, each with a DIFFERENT formula:
          //   • Shape 5 (root):   F='5*25.4MM'             /  F='1.25*25.4MM'
          //   • Shape 6 (body):   F='Sheet.5!Width*1'       /  F='Sheet.5!Height*1'
          //   • Shape 8 (header strip): a GUARD(IF...) formula that picks
          //     between Sheet.5!Height / Sheet.5!Width based on HSide
          // We patch only the V= cached value and leave each F= formula
          // untouched so Visio recalcs correctly when the user resizes
          // the pool interactively.
          const escapeFor = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const replaceV = (cellName: string, oldV: string, newV: string, formula: string) => {
            const pattern = new RegExp(
              `(<Cell N='${escapeFor(cellName)}' V=)'${escapeFor(oldV)}'( U='MM' F='${escapeFor(formula)}'\\/>)`,
              "g",
            );
            poolMasterXml = poolMasterXml.replace(pattern, `$1'${newV}'$2`);
          };
          // Shape 5 root W / H — update BOTH the cached V AND the formula.
          // The natural master uses `5*25.4MM` (= 5 inches as a constant) /
          // `1.25*25.4MM` as the formulas. If we only patch V, Visio's
          // recalc-on-open re-evaluates the formula and resets the cache
          // back to 5 / 1.25, undoing our V patch. Sub-shapes referencing
          // Sheet.5!Width then resolve to 5 (not the instance Width), and
          // the body renders at master-natural size even though the page
          // shape's bounding box is the right size.
          replaceV("Width",  "5",    String(w), "5*25.4MM");
          replaceV("Height", "1.25", String(h), "1.25*25.4MM");
          poolMasterXml = poolMasterXml
            .split("F='5*25.4MM'")
            .join(`F='${w}*25.4MM'`);
          poolMasterXml = poolMasterXml
            .split("F='1.25*25.4MM'")
            .join(`F='${h}*25.4MM'`);
          // Shape 6 body W / H — formulas reference Sheet.5
          replaceV("Width",  "5",    String(w), "Sheet.5!Width*1");
          replaceV("Height", "1.25", String(h), "Sheet.5!Height*1");
          // Shape 8 header strip W — special GUARD formula. h is the right
          // value when HSide=1 or HSide=3 (typical horizontal pool with
          // left-mounted header). Other configurations are uncommon.
          replaceV("Width", "1.25", String(h),
            "GUARD(IF(OR(User.HSide=1,User.HSide=3),Sheet.5!Height,Sheet.5!Width))");
          // Half-value pin cells (LocPin and child PinX/Y on body, etc.)
          poolMasterXml = poolMasterXml.split("V='2.5'").join(`V='${hw}'`);
          poolMasterXml = poolMasterXml.split("V='0.625'").join(`V='${hh}'`);

          // Geometry path coordinates — CRITICAL: Visio paints the first
          // frame from the cached V on Geometry rows, not from the formula.
          // The natural master's rectangle path traces (0,0)→(5,0)→(5,1.25)
          // →(0,1.25), cached at those literals. Even though our patched
          // Width/Height cells are now (w, h), if we leave the path's
          // cached coords at (5, 1.25) Visio renders the pool body as a
          // 5"×1.25" rectangle inside the (otherwise correctly-sized)
          // bounding box — i.e. the user sees "default size".
          //
          // Three patterns appear in the v1.5 pool master:
          //   • Shape 6 body, X cells: F='Width*1', V='5'  → patch V to w
          //   • Shape 6 body, Y cells: F='Height*1', V='1.25' → patch V to h
          //   • Shape 8 header strip (rotated, so its Width = Sheet.5!Height):
          //     X cells with V='1.25' and formulas referencing Width*1 or
          //     Geometry1.X2 → patch V to h
          // Shape 8's Y cells stay at V='0.5' (header thickness, untouched).
          poolMasterXml = poolMasterXml
            .split("V='5' U='MM' F='Width*1'")
            .join(`V='${w}' U='MM' F='Width*1'`);
          poolMasterXml = poolMasterXml
            .split("V='1.25' U='MM' F='Height*1'")
            .join(`V='${h}' U='MM' F='Height*1'`);
          poolMasterXml = poolMasterXml
            .split("V='1.25' U='MM' F='Width*1'")
            .join(`V='${h}' U='MM' F='Width*1'`);
          poolMasterXml = poolMasterXml
            .split("V='1.25' U='MM' F='Width*1-User.Inset-User.InsetX'")
            .join(`V='${h}' U='MM' F='Width*1-User.Inset-User.InsetX'`);
          poolMasterXml = poolMasterXml
            .split("V='1.25' U='MM' F='Geometry1.X2'")
            .join(`V='${h}' U='MM' F='Geometry1.X2'`);

          // Shape 8 header text region — TxtWidth controls the wrap width
          // of the label. Cached at 1.25 (master-natural Sheet.5!Height);
          // unless rewritten, "Collections Department" (and any longer
          // pool name) wraps onto multiple lines inside a 1.25"-wide text
          // region instead of using the full header strip length.
          poolMasterXml = poolMasterXml
            .split("V='1.25' U='MM' F='IF(Sheet.5!User.visRotateLabel,Height*1,Width*1)'")
            .join(`V='${h}' U='MM' F='IF(Sheet.5!User.visRotateLabel,Height*1,Width*1)'`);

          // Header strip fill — natural master is #c8956a (a generic
          // pool brown). Re-colour per element type so Pools get the
          // darker sidebar brown and Lanes get the lighter lane brown.
          // The body fill (#e8c4a0 on Shape 6) is left alone — both
          // pool and lane bodies render against the page background.
          const headerColor = el.type === "lane"
            ? (colorMap["lane"] ?? "#e8c4a0")
            : (colorMap["pool"] ?? "#d4a382");
          poolMasterXml = poolMasterXml
            .split("FillForegnd' V='#c8956a'")
            .join(`FillForegnd' V='${headerColor}'`);

          // Replace the "Function" placeholder text in every location.
          // Use regex with \s* so we catch both `>Function<` and
          // `>Function\n<` / `>Function\r\n<` variants from different
          // Visio writers.
          poolMasterXml = poolMasterXml.replace(
            />Function\s*</g,
            `>${esc(poolLabel)}<`,
          );
          poolMasterXml = poolMasterXml.replace(
            /V='Function'/g,
            `V='${esc(poolLabel)}'`,
          );

          // Collection / Multi-Instance marker — Diagramatix's "Collection"
          // checkbox maps to Visio's BpmnMultiInstance prop on Pool/Lane.
          // Shape 7 carries the three vertical strokes across three
          // Geometry sections (IX=0/1/2). IX=0 is gated directly on
          // `NOT(BpmnMultiInstance)`; IX=1 and IX=2 chain via
          // `Geometry1.NoShow`. All three cached NoShow V's are 1 (hidden)
          // — need to flip ALL of them or Visio paints only one bar on
          // first frame.
          //
          // The marker is also positioned BODY-CENTRE via a HeadingSide
          // formula on PinX: for HeadingSide=1 (typical left-mounted
          // header), PinX = `Sheet.8!Height + (Sheet.5!Width - Sheet.8!Height)/2`.
          // Master-natural cached V is 2.75 (= 0.5 + (5 − 0.5)/2), but
          // post-instance-clone with Sheet.5!Width = w, the cached V is
          // still 2.75, so the marker pins at master-natural x. Update
          // the cached PinX V to the instance-resolved value.
          const poolMult = (el.properties as Record<string, unknown> | undefined)
            ?.multiplicity as string | undefined;
          if (poolMult === "collection") {
            poolMasterXml = poolMasterXml.replace(
              /(<Row N='BpmnMultiInstance'>[\s\S]*?<Cell N='Value' V=')0(' U='BOOL'\/>)/,
              "$11$2",
            );
            // Flip every NoShow=1 in Shape 7 → 0 (covers all 3 bars).
            poolMasterXml = poolMasterXml.replace(
              /<Shape ID='7'[\s\S]*?<\/Shape>/,
              (block) => block.replace(/<Cell N='NoShow' V='1'/g, "<Cell N='NoShow' V='0'"),
            );
            // Recompute the marker's body-centre PinX. Sheet.8 (header
            // strip) Height stays 0.5" — Shape 8 is the rotated header,
            // its Height is the header thickness, not pool height. So
            // bodyCx = headerH/2 offset from left + remaining body width
            // centred. Match the HeadingSide=1 branch.
            const headerH = 0.5;
            const markerPinX = headerH + (w - headerH) / 2;
            poolMasterXml = poolMasterXml.replace(
              /(<Shape ID='7'[^>]*>[\s\S]*?<Cell N='PinX' V=')[\d.]+(' U='MM' F='IF\(Sheet\.5!User\.HeadingSide=1)/,
              `$1${markerPinX}$2`,
            );
          }

          // Register the clone in the output file.
          const poolInstanceId = 200 + shapeId;
          const poolFileName = `master${poolInstanceId}.xml`;
          const poolRId = `rId${poolInstanceId}`;
          zip.file("visio/masters/" + poolFileName, poolMasterXml);

          const newPoolBlock = poolMasterBlock![0]
            .replace(/ID='18'/, `ID='${poolInstanceId}'`)
            .replace(
              /NameU='Pool \/ Lane'/,
              `NameU='Pool / Lane.${poolInstanceId}'`,
            )
            .replace(
              /Name='Pool \/ Lane'/,
              `Name='Pool / Lane.${poolInstanceId}'`,
            )
            .replace(/<Rel\s+r:id='rId\d+'/, `<Rel r:id='${poolRId}'`);
          mastersXml = mastersXml.replace(
            "</Masters>",
            newPoolBlock + "</Masters>",
          );
          mastersRels = mastersRels.replace(
            "</Relationships>",
            `<Relationship Id="${poolRId}" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="${poolFileName}"/></Relationships>`,
          );
          contentTypes = contentTypes.replace(
            "</Types>",
            `<Override PartName="/visio/masters/${poolFileName}" ContentType="application/vnd.ms-visio.master+xml"/></Types>`,
          );
          zip.file("visio/masters/masters.xml", mastersXml);
          zip.file("visio/masters/_rels/masters.xml.rels", mastersRels);
          zip.file("[Content_Types].xml", contentTypes);

          // Page-shape additions: visHeadingText and (for pools) the
          // Member section linking child lanes.
          const poolUserSection =
            `<Section N='User'>` +
            `<Row N='visHeadingText'><Cell N='Value' V='${esc(poolLabel)}' U='STR' F='Inh'/></Row>` +
            `</Section>`;
          let memberSection = "";
          if (el.type === "pool") {
            const childLaneIds: number[] = [];
            for (const child of data.elements) {
              if (child.type === "lane" && child.parentId === el.id) {
                const cid = elIdToShapeId.get(child.id);
                if (cid !== undefined) childLaneIds.push(cid);
              }
            }
            if (childLaneIds.length > 0) {
              memberSection =
                `<Section N='Member'>` +
                childLaneIds
                  .map(
                    (cid, i) =>
                      `<Row IX='${i + 1}'>` +
                      `<Cell N='ID' V='${cid}'/>` +
                      `<Cell N='ContainerProperties' V='2'/>` +
                      `<Cell N='MemberFlags' V='0'/>` +
                      `</Row>`,
                  )
                  .join("") +
                `</Section>`;
            }
          }

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
            memberSection +
            `</Shape>`
          );
          continue;
        }
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
    // BPMN_M profile: full per-instance master clone (colour bake + size
    // rescale + marker layout) for every body-fill type.
    //
    // v1.5 profile: colour bake skipped (masters ship pre-styled and the
    // BPMN_M sub-shape IDs differ). Pool/Lane has its own dedicated v1.5
    // branch above. Subprocess + Expanded Subprocess still need the size
    // rescale though — without it, the master's Shape 6/7 body retains
    // cached V=2.3/1.5625 (natural EP dims) and Visio first-paints the
    // body at master-natural size inside a correctly-sized bounding box.
    // Tasks have the SAME issue when the diagram's task size differs from
    // the v1.5 Task master's natural 1.0625×0.677 — Visio paints the body
    // outline at master-natural size even though the page-shape box is
    // correct, so attachment hit-testing works but the visible Task
    // rectangle is wrong-sized. Cloning + size rescale baked into cached V
    // makes first paint match the bounding box. Tasks are deduped by
    // (w, h) below so identical tasks share one clone (instead of one
    // master per task — that would balloon the file).
    // Data Object with multiplicity=collection also clones — the master
    // ships with NoShow=1 on the collection-bars sub-shape, so without
    // a per-instance flip the marker never appears.
    const v15ElProps = el.properties as Record<string, unknown> | undefined;
    const v15Mult = v15ElProps?.multiplicity as string | undefined;
    const v15Role = v15ElProps?.role as string | undefined;
    const v15NeedsSizeOnly = profile.disableBodyColourBake
      && (el.type === "subprocess" || el.type === "subprocess-expanded"
          || el.type === "task"
          // Group: page-shape already carries explicit Width/Height (via
          // isResizable above) so the SELECTION bbox is right, but the
          // v1.5 Group master's Geometry section caches its dashed
          // rectangle path at master-natural 6x4 inches with bare
          // `Width*1` / `Height*1` formulas. Visio's first paint uses the
          // cached V's, so the visible dashed outline draws at 6x4
          // anchored at the bottom-left corner instead of filling the
          // user-drawn bounding box. The per-instance master clone
          // rescales those Geometry V's to match the instance size.
          || el.type === "group");
    const v15NeedsCollectionMarker = profile.disableBodyColourBake
      && el.type === "data-object"
      && v15Mult === "collection";
    const v15NeedsOutputMarker = profile.disableBodyColourBake
      && el.type === "data-object"
      && v15Role === "output";
    const v15NeedsClone =
      v15NeedsSizeOnly || v15NeedsCollectionMarker || v15NeedsOutputMarker;
    if ((!profile.disableBodyColourBake
          && BODY_FILL_TYPES.has(el.type) && isColor && colorMap[el.type])
        || v15NeedsClone) {
      // Merge the top-level `el.gatewayType` into elProps so the per-
      // instance master logic can read it from a single object. Diagramatix
      // sets both `el.gatewayType` and `el.properties.gatewayType`; we
      // prefer whichever is set (bpmnLayout writes properties).
      const mergedProps = {
        ...(el.properties as Record<string, unknown> | undefined),
        gatewayType: (el.properties as any)?.gatewayType ?? el.gatewayType,
      };
      // Task and Group clones are content-identical for the same
      // (sourceMasterId, w, h) — they carry only size rescaling, no
      // per-instance markers/properties. Reuse via taskCloneCache.
      // 4-decimal rounding so floating-point noise on the same logical
      // size still hits the cache.
      const isSizeOnlyClone = profile.disableBodyColourBake
        && (el.type === "task" || el.type === "group");
      const taskCacheKey = isSizeOnlyClone
        ? `${mapping.masterId}|${w.toFixed(4)}|${h.toFixed(4)}`
        : null;
      const cachedTaskId = taskCacheKey ? taskCloneCache.get(taskCacheKey) : undefined;
      if (cachedTaskId !== undefined) {
        effectiveMasterId = cachedTaskId;
      } else {
        effectiveMasterId = await createInstanceMaster(
          mapping.masterId,
          v15NeedsClone ? "" : colorMap[el.type],
          w,
          h,
          el.type,
          mergedProps,
          el.repeatType,
          v15NeedsClone, // skipColourBake
        );
        if (taskCacheKey) taskCloneCache.set(taskCacheKey, effectiveMasterId);
      }
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
    //
    // Master file lookup uses an in-memory rels resolution against the
    // CURRENT mastersXml/mastersRels so it works under any profile:
    //   • BPMN_M: clones are registered with rId → master${cloneId}.xml,
    //     so the resolver returns the same filename as the legacy
    //     `master${effectiveMasterId}.xml` path.
    //   • v1.5: no clones — effectiveMasterId is the template's master ID,
    //     and the resolver returns the template's actual filename
    //     (which is NOT the same as `master${id}.xml`, e.g. Task ID 6 lives
    //     in `master4.xml`).
    //
    // Sub-shape ID assumptions in `triggerMarkers` happen to match v1.5's
    // Task / Event / Gateway masters too (audited against bpmn-template-v15
    // which is v1.5's base), so the same map produces correct overrides on
    // both profiles.
    if (BODY_FILL_TYPES.has(el.type) && subShapes === "") {
      // Resolve the actual master XML filename via the in-memory rels.
      let masterFileName: string | null = null;
      const masterBlockMatch = mastersXml.match(
        new RegExp(`<Master\\s+ID='${effectiveMasterId}'[\\s\\S]*?</Master>`),
      );
      if (masterBlockMatch) {
        const relIdMatch = masterBlockMatch[0].match(/<Rel\s+r:id='(rId\d+)'/);
        if (relIdMatch) {
          const fileMatch = mastersRels.match(
            new RegExp(`Id=["']${relIdMatch[1]}["'][^>]*Target=["']([^"']+)["']`),
          );
          if (fileMatch) masterFileName = fileMatch[1];
        }
      }
      const masterFileEntry = masterFileName
        ? await zip.file(`visio/masters/${masterFileName}`)?.async("string")
        : undefined;
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
                const v = spec.noShow ?? "0";
                for (const ix of spec.geomIxs) {
                  extra += `<Section N='Geometry' IX='${ix}'><Cell N='NoShow' V='${v}' F='Inh'/></Section>`;
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
      // Match Diagramatix's on-canvas wrapping: events / gateways / data
      // shapes render their label below the body in a fixed-width strip
      // whose width is `properties.labelWidth` (default 80 px). Wrap the
      // label at that width using the same algorithm the renderer uses
      // (textMetrics.wrapText), then size TxtWidth / TxtHeight to match
      // so Visio's first paint wraps to the same line count.
      const elProps2 = el.properties as Record<string, unknown> | undefined;
      const labelWidthPx = (elProps2?.labelWidth as number | undefined) ?? 80;
      const lines = wrapText(el.label ?? "", labelWidthPx, 12);
      const horizPad = 0.08;
      const lineH = 0.18;
      // TxtWidth must be at least as wide as the longest wrapped line so
      // the line doesn't get re-wrapped by Visio under its own metric, but
      // is otherwise pegged to the Diagramatix labelWidth so multi-line
      // wrapping is preserved (e.g. "Account Becomes Overdue" at 80 px
      // wraps to 3 lines — set TxtWidth too wide and it collapses to one).
      const charWidthIn = 12 * 0.55 / 96; // matches textMetrics avgCharWidth
      const longestLineIn = Math.max(
        ...lines.map((l) => l.length * charWidthIn),
        0.32,
      );
      const txtW = Math.max(longestLineIn + horizPad, labelWidthPx / 96);
      const txtH = Math.max(0.21, lines.length * lineH);
      const txtLocX = txtW / 2;
      const txtLocY = txtH / 2;

      // Diagramatix lets the user drag the label anywhere; the offset is
      // stored as labelOffsetX / labelOffsetY (pixels, relative to the
      // element's bottom-CENTRE point — labelOffsetY=7 by default puts
      // the label TOP 7 px below the body bottom). Honour that placement
      // in Visio by computing TxtPinX / TxtPinY from the offsets rather
      // than letting them inherit the master's default (which always
      // pins the label dead centre or just below the body, with no
      // memory of where the user dragged it).
      //
      // TxtPinX/Y are in shape-LOCAL coords (origin at bottom-left of the
      // master's geometry, Y up). Need the master's natural width to
      // convert the page-coord offset back into shape-local. Use a
      // per-type lookup of master widths — same numbers Diagramatix's
      // master files expose; if a type ever falls outside this table we
      // fall back to the master's `Width*0.5` formula via F='Inh'.
      const MASTER_W_BY_TYPE: Record<string, number> = {
        "start-event":        0.375,
        "intermediate-event": 0.375,
        "end-event":          0.375,
        "gateway":            0.4166666666666667,
        "data-object":        0.6,
        "data-store":         0.6,
      };
      const masterW = MASTER_W_BY_TYPE[el.type] ?? 0;
      const labelOffsetX = (elProps2?.labelOffsetX as number | undefined) ?? 0;
      const labelOffsetY = (elProps2?.labelOffsetY as number | undefined) ?? 7;
      const txtPinX = masterW > 0
        ? masterW / 2 + labelOffsetX / 96
        : null;
      // Label CENTRE sits below the shape bottom (Y=0 in shape-local) by
      // labelOffsetY pixels + half the label height (because TxtPinY
      // names the centre, not the top). Y is up, so this is negative.
      const txtPinY = -(labelOffsetY / 96) - txtH / 2;
      // Override Width/Height/etc with F='Inh' so the master's pre-baked
      // text geometry is replaced by our sized values, but break the
      // inheritance chain on TxtPinX / TxtPinY by emitting no F= cell —
      // that anchors the label at our computed coords regardless of the
      // master's `Controls.Text_Reposition` formula. (Only emit TxtPinX
      // when we have a master-width lookup; otherwise let it inherit.)
      txtInhCells =
        (txtPinX !== null
          ? `<Cell N='TxtPinX' V='${txtPinX}'/>`
          : ``) +
        `<Cell N='TxtPinY' V='${txtPinY}'/>` +
        `<Cell N='TxtWidth' V='${txtW}' F='Inh'/>` +
        `<Cell N='TxtHeight' V='${txtH}' F='Inh'/>` +
        `<Cell N='TxtLocPinX' V='${txtLocX}' F='Inh'/>` +
        `<Cell N='TxtLocPinY' V='${txtLocY}' F='Inh'/>` +
        `<Section N='Control'>` +
          `<Row N='Row_1'>` +
            (txtPinX !== null
              ? `<Cell N='X' V='${txtPinX}'/><Cell N='XDyn' V='${txtPinX}'/>`
              : ``) +
            `<Cell N='Y' V='${txtPinY}'/>` +
            `<Cell N='YDyn' V='${txtPinY}'/>` +
            `<Cell N='YCon' V='2' F='Inh'/>` +
          `</Row>` +
        `</Section>`;
    }

    // <cp IX='0'/> in Text links to Character section row 0 — required for
    // the master's character formatting (font size etc) to apply.
    //
    // Cases:
    //   • hideLabel (merge / event-based / parallel gateways) → emit an
    //     EXPLICIT EMPTY <Text></Text>. Omitting `<Text>` causes Visio to
    //     fall back to the master's default text. v1.5's Gateway-Decision
    //     master (used for event-based + non-plain markers) carries the
    //     placeholder "Decision", and the event masters carry "Start" /
    //     "Event 1" / "End"; the empty element overrides those defaults.
    //   • Unlabeled event (start/intermediate/end) → same treatment: the
    //     event masters' default text ("Start" / "Event 1" / "End") shows
    //     through unless we explicitly empty it. Diagramatix lets the
    //     user leave events unlabeled, so emit empty to honour that.
    //   • Edge-mounted (boundary) Start / End event → suppress label
    //     unconditionally. These represent the host EP's entry / exit
    //     point on the boundary; their position carries the meaning, a
    //     label adds visual noise. Intermediate boundary events keep
    //     their label since "Timeout" etc. is the only signal of what
    //     the boundary catches.
    //   • Has a label → emit Text with the label.
    //   • No label, not in the above cases → omit Text and inherit master
    //     default (matches prior BPMN_M behaviour for non-event shapes).
    const isUnlabeledEvent = !el.label && (
      el.type === "start-event" ||
      el.type === "intermediate-event" ||
      el.type === "end-event"
    );
    const isEdgeMountedStartOrEnd = !!el.boundaryHostId && (
      el.type === "start-event" || el.type === "end-event"
    );

    // Data Object state → append "[state]" on a new line under the label
    // so Visio shows it the same way Diagramatix renders the state badge.
    // Round-trip: the import strips this suffix back into properties.state.
    let displayLabel = el.label ?? "";
    if (el.type === "data-object") {
      const elState = (el.properties as Record<string, unknown> | undefined)
        ?.state as string | undefined;
      if (elState && elState.trim()) {
        displayLabel = displayLabel
          ? `${displayLabel}\n[${elState.trim()}]`
          : `[${elState.trim()}]`;
      }
    }
    const textElWithCp = hideLabel || isUnlabeledEvent || isEdgeMountedStartOrEnd
      ? `<Text></Text>`
      : displayLabel
        ? `<Text><cp IX='0'/>${esc(displayLabel)}</Text>`
        : "";

    const escLabel = esc(el.label || el.type);
    const shapeXml =
      `<Shape ID='${shapeId}' NameU='${escLabel}'` +
      ` IsCustomNameU='1' Name='${escLabel}' IsCustomName='1'` +
      ` Type='Group' Master='${effectiveMasterId}'>` +
      `<Cell N='PinX' V='${cx}'/>` +
      `<Cell N='PinY' V='${cy}'/>` +
      `<Cell N='LayerMember' V=''/>` +
      // Only emit page-shape FillForegnd / FillPattern for body-fill
      // types (tasks, subprocesses, events, gateways, data shapes).
      // Group + text-annotation use their colorMap entry as the LINE
      // colour, not a fill — without this guard, fillCells would paint
      // a group as a solid dark-grey rectangle (the line colour piped
      // into FillForegnd) instead of the intended transparent dashed
      // outline. Pool/Lane already bake their colour into the per-
      // instance master clone, so this skips a redundant override.
      fillCells(BODY_FILL_TYPES.has(el.type) ? el.type : "") +
      sizeCells +
      txtInhCells +
      userSection +
      propSection +
      actionsSection +
      elCharSection +
      rootMarkerSections +
      textElWithCp +
      subShapes +
      `</Shape>`;
    // Edge-mounted (boundary) events go to the edgeShapes bucket and
    // are appended AFTER connectors in the final page write, so they
    // paint on top of any sequence-flow / message line that crosses
    // them. Non-edge elements go in the main shapes bucket as before.
    if (el.boundaryHostId) edgeShapes.push(shapeXml);
    else shapes.push(shapeXml);
  }

  // ── Step 4: Connectors ──
  for (const conn of data.connectors) {
    const mapping = getConnectorMappingV3(conn, profile);
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
      // Round-trip metadata: stash the Diagramatix connector ID so re-import
      // can recover the original ID (mirrors the BpmnId added to elements
      // via getElementMappingV3).
      `<Section N='Property'>` +
        `<Row N='BpmnId'><Cell N='Value' V='${esc(conn.id)}' U='STR'/></Row>` +
      `</Section>` +
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

  // Append edge-mounted boundary events LAST so Visio's declaration-
  // order paint puts them on top of any sequence-flow / message-flow
  // lines that pass through them.
  for (const x of edgeShapes) shapes.push(x);

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

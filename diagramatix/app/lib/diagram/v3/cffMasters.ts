/**
 * CFF (Cross-Functional Flowchart) master cloning for Visio V3 export.
 *
 * Visio's CFF engine recognises a Pool/Lane "container" via a constellation
 * of three master families:
 *   1. CFF Container — invisible structural wrapper; carries
 *      `User.msvSDContainerLocked=1`, `User.numLanes`, theme info.
 *   2. Swimlane List — invisible list sibling; carries the
 *      `SETF(GetRef(CONTAINERSHEETREF(1)!User.NUMLANES),LISTMEMBERCOUNT())`
 *      formula that keeps `numLanes` in sync with member count.
 *   3. Pool / Lane — visible per-lane shape; references the Swimlane List
 *      via `User.SwimlaneListGUID`.
 *
 * This module clones the first two from the reference VSDX
 * (`public/Pools and Lanes Master using BPMN Basic Shapes.vsdx`) and
 * registers the clones in the output's masters.xml / rels / content types.
 *
 * Phase 3 commit 1 — Foundations: emit CFF Container + Swimlane List per
 * pool. Lanes stay as Phase 1.5 (visible Pool/Lane shapes). Commit 2 will
 * rewire lanes as proper CFF list members.
 */

import type JSZip from "jszip";

const CFF_CONTAINER_MASTER_ID_IN_REF = 4;
const SWIMLANE_LIST_MASTER_ID_IN_REF = 5;

export interface CffMasterSource {
  containerWrapper: string; // <Master ID='4' ...>...</Master> from masters.xml
  containerContent: string; // contents of master4.xml
  listWrapper: string;
  listContent: string;
}

/**
 * Pull the CFF Container + Swimlane List master wrappers (from masters.xml)
 * and their content XMLs (from master4.xml / master5.xml) out of the
 * reference VSDX.
 */
export async function loadCffMasterSource(refZip: JSZip): Promise<CffMasterSource | null> {
  const refMastersXml = await refZip.file("visio/masters/masters.xml")?.async("string");
  const refRels = await refZip.file("visio/masters/_rels/masters.xml.rels")?.async("string");
  if (!refMastersXml || !refRels) return null;

  const grab = (id: number) => {
    const re = new RegExp(`<Master\\s+ID='${id}'[\\s\\S]*?</Master>`);
    const m = refMastersXml.match(re);
    if (!m) return null;
    const relMatch = m[0].match(/<Rel\s+r:id='(rId\d+)'/);
    if (!relMatch) return null;
    const fileMatch = refRels.match(new RegExp(`Id=["']${relMatch[1]}["'][^>]*Target=["']([^"']+)["']`));
    if (!fileMatch) return null;
    return { wrapper: m[0], file: fileMatch[1] };
  };

  const container = grab(CFF_CONTAINER_MASTER_ID_IN_REF);
  const list = grab(SWIMLANE_LIST_MASTER_ID_IN_REF);
  if (!container || !list) return null;

  const containerContent = await refZip.file("visio/masters/" + container.file)?.async("string");
  const listContent = await refZip.file("visio/masters/" + list.file)?.async("string");
  if (!containerContent || !listContent) return null;

  return {
    containerWrapper: container.wrapper,
    containerContent,
    listWrapper: list.wrapper,
    listContent,
  };
}

interface CloneSpec {
  masterIdOut: number;
  relIdOut: string;
  fileNameOut: string;
}

interface ContainerCloneOpts extends CloneSpec {
  poolLabel: string;
  w: number;
  h: number;
  headerColor: string;
}

interface ListCloneOpts extends CloneSpec {
  w: number;
  h: number;
}

/**
 * Clone the CFF Container master with per-pool dimensions + colours baked
 * into cached V values + the literal pool label substituted.
 *
 * Returns the patched master content XML (write to master<N>.xml) and the
 * patched wrapper (insert into masters.xml).
 */
export function cloneCffContainer(
  source: CffMasterSource,
  opts: ContainerCloneOpts,
): { content: string; wrapper: string } {
  let content = source.containerContent;
  const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/</g, "&lt;");

  // Rewrite cached V values for cell + Geometry-row coordinates.
  //
  // CRITICAL: the master uses three shapes (5 = root group, 6 = body,
  // 7 = rotated header strip) and formulas like `Width*1` /
  // `Height*0.5` resolve to DIFFERENT things in each shape's sheet:
  //
  //   * Shape 5 / Shape 6: `Width` = pool width (opts.w),
  //                        `Height` = pool height (opts.h).
  //   * Shape 7 (rotated 90°): `Width` = pool height (opts.h),
  //                            `Height` = header thickness (0.375).
  //
  // A global split-replace on the formula would corrupt Shape 7
  // (e.g. patching `F='Width*1'` to opts.w would set its rotated
  // Width to pool W instead of pool H). Patch each shape's V cells
  // and Geometry rows in isolation.
  const HEADER_THICKNESS = 0.375;
  const patchShape = (
    id: number,
    formulaToV: Record<string, number>,
    geomXVal: number,
    geomYVal: number,
  ) => {
    const re = new RegExp(`(<Shape ID='${id}'[\\s\\S]*?</Shape>)`);
    content = content.replace(re, (block) => {
      let s = block;
      for (const [f, v] of Object.entries(formulaToV)) {
        const escF = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const cellRe = new RegExp(
          `(<Cell N='[^']+' )V='[^']+'( U='[A-Z]+' F='${escF}'\\/>)`,
          "g",
        );
        s = s.replace(cellRe, `$1V='${v}'$2`);
      }
      // Geometry-row X / Y. Cells inside Geometry rows are
      // `<Cell N='X' V='...' U='IN' F='...'/>`. Rewrite the cached
      // V for X cells whose F= resolves to the shape's max-X, and
      // for Y cells whose F= resolves to the shape's max-Y. Leave
      // X=0 / Y=0 (origin) and negative offsets alone.
      const geomXRe = /(<Cell N='X' )V='[^']+'( U='IN' F='(?:Width\*1|Width\*1-User\.Inset-User\.InsetX|Geometry1\.X2|Geometry1\.X3)'\/>)/g;
      s = s.replace(geomXRe, `$1V='${geomXVal}'$2`);
      const geomYRe = /(<Cell N='Y' )V='[^']+'( U='IN' F='(?:Height\*1|Height\*1-User\.Inset-User\.InsetY|Geometry1\.Y3)'\/>)/g;
      s = s.replace(geomYRe, `$1V='${geomYVal}'$2`);
      return s;
    });
  };

  // Shape 5 root group — bare Width / Height + LocPin cells. No
  // Geometry section visible (rendered as transparent).
  content = content.replace(
    /(<Shape ID='5'[\s\S]*?)<Cell N='Width' V='[^']+' U='IN'\/>/,
    `$1<Cell N='Width' V='${opts.w}' U='IN'/>`,
  );
  content = content.replace(
    /(<Shape ID='5'[\s\S]*?)<Cell N='Height' V='[^']+' U='IN'\/>/,
    `$1<Cell N='Height' V='${opts.h}' U='IN'/>`,
  );
  patchShape(5, {
    "Width*0.5": opts.w / 2,
    "Height*0.5": opts.h / 2,
  }, opts.w, opts.h);

  // Shape 6 (body) — references Sheet.5 dims.
  patchShape(6, {
    "Sheet.5!Width*0.5": opts.w / 2,
    "Sheet.5!Height*0.5": opts.h / 2,
    "Sheet.5!Width*1": opts.w,
    "Sheet.5!Height*1": opts.h,
    "Width*0.5": opts.w / 2,
    "Height*0.5": opts.h / 2,
    "Width*1": opts.w,
    "Height*1": opts.h,
    "Width*1-User.Inset-User.InsetX": opts.w,
    "Height*1-User.Inset-User.InsetY": opts.h,
  }, opts.w, opts.h);

  // Shape 7 (rotated header) — Width = opts.h (rotated, = pool H),
  // Height = HEADER_THICKNESS. Geometry traces the strip's rectangle
  // in the shape's local (pre-rotation) coords: X 0..opts.h,
  // Y 0..HEADER_THICKNESS.
  patchShape(7, {
    // PinX uses HeadingPos branch. HeadingPos=3 (left header) →
    // Height*0.5 = HEADER_THICKNESS/2.
    "GUARD(IF(User.HeadingPos=1,Sheet.5!Width-Height*0.5,IF(User.HeadingPos=3,Height*0.5,Sheet.5!Width*0.5)))": HEADER_THICKNESS / 2,
    // PinY HeadingPos=NONE → Sheet.5!Height*0.5 = opts.h/2.
    "GUARD(IF(User.HeadingPos=2,Sheet.5!Height-Height*0.5,IF(User.HeadingPos=4,Height*0.5,Sheet.5!Height*0.5)))": opts.h / 2,
    // Width — HSide=1 (typical) → Sheet.5!Height = opts.h.
    "GUARD(IF(OR(User.HSide=1,User.HSide=3),Sheet.5!Height,Sheet.5!Width))": opts.h,
    // Height — visShowTitle=1 → MAX(0.375IN*scale, text). At scale 1
    // and short text, = 0.375.
    "GUARD(IF(Sheet.5!User.visShowTitle,MAX(0.5IN*Sheet.5!DropOnPageScale,Scratch.Y1),0))": HEADER_THICKNESS,
    // LocPin: relative to the shape's own (pre-rotation) dims.
    "GUARD(Width*0.5)": opts.h / 2,
    "GUARD(Height*0.5)": HEADER_THICKNESS / 2,
    // Inside Shape 7, Width = opts.h, Height = HEADER_THICKNESS.
    "Width*0.5": opts.h / 2,
    "Height*0.5": HEADER_THICKNESS / 2,
    "Width*1": opts.h,
    "Height*1": HEADER_THICKNESS,
    "Width*1-User.Inset-User.InsetX": opts.h,
    "Height*1-User.Inset-User.InsetY": HEADER_THICKNESS,
    "TxtWidth*0.5": opts.h / 2,
    "TxtHeight*0.5": HEADER_THICKNESS / 2,
    "Sheet.7!Height": HEADER_THICKNESS,
    "MAX(TEXTHEIGHT(TheText,TxtWidth),Height)": HEADER_THICKNESS,
  }, opts.h, HEADER_THICKNESS);

  // Also patch the embedded `0.5IN` literal inside the Shape 7
  // Height formula so Visio re-evaluates against the right value.
  content = content.replace(
    /MAX\(0\.5IN\*Sheet\.5!DropOnPageScale,Scratch\.Y1\)/g,
    `MAX(${HEADER_THICKNESS}IN*Sheet.5!DropOnPageScale,Scratch.Y1)`,
  );


  // Body + header fill — the master ships with V='1' F='THEMEVAL("FillColor",1)'
  // on every FillForegnd, which paints whatever the document theme
  // resolves "FillColor" to (typically pale or white). Replace with
  // the pool colour baked in so the body + header paint Diagramatix
  // colours instead. Three cells: Shape 5 (group root — affects
  // grouped selection only), Shape 6 (visible body), Shape 7 (visible
  // header). Patch all three: body gets a light tint, header gets the
  // pool colour. Done in document order — first occurrence = Shape 5,
  // second = Shape 6 (body, lighter), third = Shape 7 (header).
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `RGB(${r},${g},${b})`;
  };
  // Lighten the pool colour for the body so the header stands out.
  // Simple +30% lightness approximation: average with white.
  const lightenHex = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const mix = (c: number) => Math.round(c + (255 - c) * 0.5);
    return `#${mix(r).toString(16).padStart(2, "0")}${mix(g).toString(16).padStart(2, "0")}${mix(b).toString(16).padStart(2, "0")}`;
  };
  const bodyColor = lightenHex(opts.headerColor);
  // Skip Shape 5 (root group) — doesn't visibly paint. Patch only
  // Shape 6 + Shape 7 by walking the FillForegnd occurrences in
  // document order. Shape 5 is first; we leave it. Shape 6 is second
  // (body); Shape 7 is third (header).
  let cellIdx = 0;
  content = content.replace(
    /<Cell N='FillForegnd' V='1' F='THEMEVAL\("FillColor",1\)'\/>/g,
    () => {
      cellIdx++;
      if (cellIdx === 2) return `<Cell N='FillForegnd' V='${bodyColor}' F='${hexToRgb(bodyColor)}'/>`;
      if (cellIdx === 3) return `<Cell N='FillForegnd' V='${opts.headerColor}' F='${hexToRgb(opts.headerColor)}'/>`;
      return `<Cell N='FillForegnd' V='1' F='THEMEVAL("FillColor",1)'/>`;
    },
  );

  // Phase 3 commit 2 follow-on — substitute "Title" (master placeholder
  // text) with the actual pool label. The header sub-shape paints
  // visHeadingText via `GUARD(SHAPETEXT(Sheet.5!visHeadingText))`; the
  // cached V on that cell + the literal text block in the master both
  // need the pool label so first-paint shows the right text.
  //
  // Previously (commit 1 / hotfix 5b2ce1b / 5b2ce1b follow-up) we emptied
  // these to suppress double-painting with the Phase 1.5 visible Pool.
  // Now that the visible Pool is removed when cffSource is on, restore
  // the substitution so the CFF Container is the visible pool header.
  //
  // The master's painted block is `<Text><pp IX='0'/>Title\r\n</Text>`;
  // the `[\s\S]*?` pattern catches it including the `<pp/>` marker.
  content = content.replace(/<Text>[\s\S]*?<\/Text>/g, `<Text>${escAttr(opts.poolLabel)}\n</Text>`);
  content = content.replace(
    /<Cell N='Value' V='Title' U='STR'/g,
    `<Cell N='Value' V='${escAttr(opts.poolLabel)}' U='STR'`,
  );

  // Wrapper — substitute the master ID, the NameU and Name, swap rId.
  let wrapper = source.containerWrapper
    .replace(/ID='\d+'/, `ID='${opts.masterIdOut}'`)
    .replace(/NameU='CFF Container'/, `NameU='CFF Container.${opts.masterIdOut}'`)
    .replace(/Name='CFF Container'/, `Name='CFF Container.${opts.masterIdOut}'`)
    .replace(/<Rel\s+r:id='rId\d+'/, `<Rel r:id='${opts.relIdOut}'`);
  if (!/IsCustomNameU=/.test(wrapper)) {
    wrapper = wrapper.replace(/(NameU='CFF Container\.\d+')/, `$1 IsCustomNameU='1'`);
    wrapper = wrapper.replace(/(Name='CFF Container\.\d+')/, `$1 IsCustomName='1'`);
  }

  return { content, wrapper };
}

/**
 * Clone the Swimlane List master with per-pool dimensions baked in.
 */
export function cloneSwimlaneList(
  source: CffMasterSource,
  opts: ListCloneOpts,
): { content: string; wrapper: string } {
  let content = source.listContent;

  // Cached W / H — natural 5×4 IN.
  content = content
    .split("V='5' U='IN'").join(`V='${opts.w}' U='IN'`)
    .split("V='5'").join(`V='${opts.w}'`)
    .split("V='4' U='IN'").join(`V='${opts.h}' U='IN'`)
    .split("V='4'").join(`V='${opts.h}'`);

  let wrapper = source.listWrapper
    .replace(/ID='\d+'/, `ID='${opts.masterIdOut}'`)
    .replace(/NameU='Swimlane List'/, `NameU='Swimlane List.${opts.masterIdOut}'`)
    .replace(/Name='Swimlane List'/, `Name='Swimlane List.${opts.masterIdOut}'`)
    .replace(/<Rel\s+r:id='rId\d+'/, `<Rel r:id='${opts.relIdOut}'`);
  if (!/IsCustomNameU=/.test(wrapper)) {
    wrapper = wrapper.replace(/(NameU='Swimlane List\.\d+')/, `$1 IsCustomNameU='1'`);
    wrapper = wrapper.replace(/(Name='Swimlane List\.\d+')/, `$1 IsCustomName='1'`);
  }

  return { content, wrapper };
}

/**
 * Build the page-level <Shape> for a CFF Container instance at the given
 * pool position + dimensions. The CFF Container master draws its own
 * visible body + header sub-shapes — no extra sub-shapes needed at the
 * instance level.
 */
export function emitCffContainerShape(opts: {
  shapeId: number;
  uniqueGuid: string;
  masterIdOut: number;
  poolLabel: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  numLanes: number;
  /** Page-shape IDs to register as container members — the Swimlane
   *  List shape + every lane shape. Required for Visio's CFF engine
   *  to resolve `CONTAINERSHEETREF(1)` on the list and the lanes back
   *  to this container's sheet. Without the Member section, Visio
   *  silently fails the parent lookup and the lanes don't track the
   *  container on resize. */
  memberShapeIds: number[];
}): string {
  const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/</g, "&lt;");
  const hw = opts.w / 2;
  const hh = opts.h / 2;
  const memberSection = opts.memberShapeIds.length > 0
    ? `<Section N='Member'>` +
      opts.memberShapeIds
        .map(
          (mid, i) =>
            `<Row IX='${i + 1}'>` +
            `<Cell N='ID' V='${mid}'/>` +
            `<Cell N='ContainerProperties' V='2'/>` +
            `<Cell N='MemberFlags' V='0'/>` +
            `</Row>`,
        )
        .join("") +
      `</Section>`
    : "";
  return (
    `<Shape ID='${opts.shapeId}' NameU='${escAttr(opts.poolLabel)}' Name='${escAttr(opts.poolLabel)}' ` +
    `IsCustomNameU='1' IsCustomName='1' Type='Group' Master='${opts.masterIdOut}' UniqueID='${opts.uniqueGuid}'>` +
    `<Cell N='PinX' V='${opts.cx}'/>` +
    `<Cell N='PinY' V='${opts.cy}'/>` +
    `<Cell N='Width' V='${opts.w}'/>` +
    `<Cell N='Height' V='${opts.h}'/>` +
    `<Cell N='LocPinX' V='${hw}' F='Inh'/>` +
    `<Cell N='LocPinY' V='${hh}' F='Inh'/>` +
    `<Section N='User'>` +
    `<Row N='msvSDContainerLocked'><Cell N='Value' V='1' U='BOOL'/></Row>` +
    `<Row N='numLanes'><Cell N='Value' V='${opts.numLanes}'/></Row>` +
    `<Row N='visShowTitle'><Cell N='Value' V='1' F='1+DEPENDSON(User.numLanes)'/></Row>` +
    `</Section>` +
    `<Section N='Property'>` +
    `<Row N='BpmnName'><Cell N='Value' V='${escAttr(opts.poolLabel)}' U='STR' F='Inh'/></Row>` +
    `<Row N='BPMNLanes'><Cell N='Value' V='${opts.numLanes}' F='Inh'/></Row>` +
    `</Section>` +
    memberSection +
    `</Shape>`
  );
}

/**
 * Build the page-level <Shape> for a Swimlane List instance. Sized to the
 * lane area (= pool width minus header strip width). Invisible
 * structural shape.
 */
export function emitSwimlaneListShape(opts: {
  shapeId: number;
  uniqueGuid: string;
  masterIdOut: number;
  containerShapeId: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}): string {
  return (
    `<Shape ID='${opts.shapeId}' NameU='Swimlane List' Name='Swimlane List' ` +
    `Type='Shape' Master='${opts.masterIdOut}' UniqueID='${opts.uniqueGuid}'>` +
    `<Cell N='PinX' V='${opts.cx}'/>` +
    `<Cell N='PinY' V='${opts.cy}'/>` +
    `<Cell N='Width' V='${opts.w}'/>` +
    `<Cell N='Height' V='${opts.h}'/>` +
    // CENTRE pin — override the master's LocPin=(0, H) (top-left
    // convention) so the math is unambiguous. With LocPin=(W/2, H/2)
    // and PinX/PinY = pool centre, the list bbox equals the pool
    // bbox exactly, independent of any Y-up/Y-down or master Pin
    // offset interpretation.
    `<Cell N='LocPinX' V='${opts.w / 2}'/>` +
    `<Cell N='LocPinY' V='${opts.h / 2}'/>` +
    `<Section N='User'>` +
    `<Row N='msvSDContainerStyle'><Cell N='Value' V='7' F='IFERROR(CONTAINERSHEETREF(1)!User.VISCFFSTYLE,1)'/></Row>` +
    `<Row N='visHeadingHeight'><Cell N='Value' V='0.5' U='IN'/></Row>` +
    `</Section>` +
    `<Section N='Scratch'>` +
    `<Row IX='0'><Cell N='A' V='0' F='IFERROR(SETF(GetRef(CONTAINERSHEETREF(1)!User.NUMLANES),LISTMEMBERCOUNT()),0)'/></Row>` +
    `</Section>` +
    `</Shape>`
  );
}

/**
 * Generate a deterministic GUID from a string seed. Used so the CFF
 * Container + Swimlane List GUIDs are stable per pool — needed because
 * lanes (in commit 2) will reference the Swimlane List by GUID.
 */
export function deterministicGuid(seed: string): string {
  // Simple FNV-1a 32-bit hash, expanded to 128 bits via repeated mixing.
  // Sufficient for uniqueness within a single VSDX file. The canonical
  // Visio GUID layout is 8-4-4-4-12 hex digits = 32 chars total. The
  // last group MUST be 12 chars — a malformed GUID makes Visio's CFF
  // engine silently reject the lane↔list pairing (lanes don't follow
  // pool resize, Add Lane stays greyed).
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0").toUpperCase();
  const h2 = Math.imul(h, 2654435761);
  const h3 = Math.imul(h2, 2246822519);
  const h4 = Math.imul(h3, 3266489917);
  const h5 = Math.imul(h4, 374761393);
  // Layout: 8 (h) - 4 (h2[0..4]) - 4 (h3[0..4]) - 4 (h4[0..4])
  //         - 12 (h2[4..8] + h3[4..8] + h5[0..4]) = 32 hex chars.
  const fifth = hex(h2).slice(4) + hex(h3).slice(4) + hex(h5).slice(0, 4);
  return `{${hex(h)}-${hex(h2).slice(0, 4)}-${hex(h3).slice(0, 4)}-${hex(h4).slice(0, 4)}-${fifth}}`;
}

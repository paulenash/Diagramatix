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

  // Rewrite cached W / H from natural (4×4 IN) to instance dims.
  // The master mixes Width-derived and Height-derived cells, both
  // naturally cached at V='4' (because natural is square). Distinguish
  // them by their F= formula — patch Height-derived cells FIRST so the
  // remaining V='4' U='IN' cells are all Width-derived, then a default
  // sweep catches them.
  //
  // Height-derived V='4' patterns:
  //   • F='Height*1'                                       (Shape 6 body height + similar)
  //   • F='IF(User.CFFVertical,Height*N/16,Height*1)'      (lane-fraction Y guides, N=2..15)
  content = content
    .split("V='4' U='IN' F='Height*1'")
    .join(`V='${opts.h}' U='IN' F='Height*1'`);
  for (let i = 1; i < 16; i++) {
    const pat = `V='4' U='IN' F='IF(User.CFFVertical,Height*${i}/16,Height*1)'`;
    content = content.split(pat).join(`V='${opts.h}' U='IN' F='IF(User.CFFVertical,Height*${i}/16,Height*1)'`);
  }
  // Default (remaining) → Width.
  content = content.split("V='4' U='IN'").join(`V='${opts.w}' U='IN'`);

  // Half values: V='2' similarly split between Width/2 and Height/2.
  // Patch Height-derived first.
  content = content
    .split("V='2' U='IN' F='Height*0.5'")
    .join(`V='${opts.h / 2}' U='IN' F='Height*0.5'`)
    .split("V='2' U='IN' F='Sheet.5!Height*0.5'")
    .join(`V='${opts.h / 2}' U='IN' F='Sheet.5!Height*0.5'`)
    .split("V='2' U='IN' F='GUARD(IF(User.HeadingPos=2,Sheet.5!Height-Height*0.5,IF(User.HeadingPos=4,Height*0.5,Sheet.5!Height*0.5)))'")
    .join(`V='${opts.h / 2}' U='IN' F='GUARD(IF(User.HeadingPos=2,Sheet.5!Height-Height*0.5,IF(User.HeadingPos=4,Height*0.5,Sheet.5!Height*0.5)))'`);
  // Default V='2' → Width/2.
  content = content.split("V='2' U='IN'").join(`V='${opts.w / 2}' U='IN'`);

  // Header fill — the master's header strip carries
  // `FillForegnd V='#92cddc' F='THEMEGUARD(MSOTINT(THEMEVAL("AccentColor4"),40))'`.
  // Replace the cached V so first-paint matches the Diagramatix lane colour
  // map instead of Visio's default light blue.
  content = content.replace(
    /FillForegnd' V='#[0-9a-fA-F]{6}' F='THEMEGUARD\(MSOTINT/g,
    `FillForegnd' V='${opts.headerColor}' F='THEMEGUARD(MSOTINT`,
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
    `<Cell N='LocPinX' V='0' F='Inh'/>` +
    `<Cell N='LocPinY' V='${opts.h}' F='Inh'/>` +
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

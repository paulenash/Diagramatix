#!/usr/bin/env node
/**
 * Fix the End-event Terminate marker rendering in Microsoft's BPMN_M
 * + Diagramatix v1.5 stencils.
 *
 * Two problems with the shipped masters:
 *
 *   1. Z-order — Shape 8 (the solid black Terminate fill circle) is
 *      declared BEFORE Shape 9 (the End event's coloured inner body,
 *      `#fca5a5` red, 0.3"×0.3"). Visio renders in declaration order,
 *      so Shape 9 ALWAYS paints over Shape 8 — even when Shape 8's
 *      NoShow override forces it visible, the body covers the marker.
 *
 *   2. Size — Shape 8 is 0.576 of the master width while Shape 9 is
 *      0.8. The red gap between the outer thick ring and the Terminate
 *      marker is only ~0.112 of master width on each side, barely
 *      visible. BPMN convention is a noticeably-smaller black disc
 *      with a visible coloured ring around it.
 *
 * Fix (per-master, idempotent):
 *
 *   a. Move Shape 8's entire <Shape> block to AFTER Shape 9 in the
 *      master XML so z-order is body → terminate (terminate on top).
 *
 *   b. Shrink Shape 8 to 0.4 × master Width / Height (from 0.576 ×).
 *      Patches both the cached V and the `Sheet.5!Width*X` formula so
 *      first paint and post-recalc agree.
 *
 *   c. Revert any previous `NoShow` formula patch on Shape 9 (an
 *      earlier iteration of this script extended the OR(...) clause
 *      with `Terminate.Checked` to hide the body when Terminate was
 *      active — that approach is abandoned, the body should remain
 *      visible behind the Terminate marker).
 *
 * Targets:
 *   - public/bpmn-template-v15.vsdx                  (v1.5 template)
 *   - public/BPMN Diagramatix Shapes v1.5.vssx       (v1.5 stencil)
 *   - public/bpmn-stencil-v3.vssx                    (BPMN_M stencil)
 *
 * Re-running is idempotent: each transformation checks if it's
 * already been applied.
 *
 * Run from the diagramatix/ directory:
 *   node scripts/fix-terminate-marker.cjs
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const TARGETS = [
  { file: "public/bpmn-template-v15.vsdx",            label: "v1.5 template",   nameRe: /^End Event$/ },
  { file: "public/BPMN Diagramatix Shapes v1.5.vssx", label: "v1.5 stencil",    nameRe: /^End Event$/ },
  { file: "public/bpmn-stencil-v3.vssx",              label: "BPMN_M stencil",  nameRe: /^End Event$/ },
];

async function findMaster(zip, nameRe) {
  const mastersXml = await zip.file("visio/masters/masters.xml")?.async("string");
  if (!mastersXml) return null;
  const relsXml = await zip.file("visio/masters/_rels/masters.xml.rels")?.async("string");
  if (!relsXml) return null;
  const re = /<Master\s+ID='(\d+)'[^>]*?\sNameU='([^']+)'[\s\S]*?<\/Master>/g;
  let m;
  while ((m = re.exec(mastersXml))) {
    if (!nameRe.test(m[2])) continue;
    const rel = m[0].match(/<Rel\s+r:id='([^']+)'/);
    if (!rel) continue;
    const target = relsXml.match(new RegExp(`Id=["']${rel[1]}["'][^>]*Target=["']([^"']+)["']`));
    if (target) return { id: m[1], name: m[2], file: target[1] };
  }
  return null;
}

/** Locate `<Shape ID='N'>…</Shape>` and return [startIdx, endIdx)
 *  bracketing the full block, including the closing tag. Returns null
 *  if not found. Handles nested Shape tags via depth tracking. */
function findShapeBlock(xml, id) {
  const openRe = new RegExp(`<Shape ID='${id}'[^>]*>`);
  const open = xml.match(openRe);
  if (!open || open.index === undefined) return null;
  const start = open.index;
  let pos = start + open[0].length;
  let depth = 1;
  while (depth > 0 && pos < xml.length) {
    const nextOpen = xml.indexOf("<Shape ", pos);
    const nextClose = xml.indexOf("</Shape>", pos);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + "<Shape ".length;
    } else {
      depth--;
      pos = nextClose + "</Shape>".length;
    }
  }
  return [start, pos];
}

function patchMaster(xml) {
  const log = [];

  // ── (c) Revert Shape 9 NoShow formula if a previous run extended it
  //        with Terminate.Checked. Match BOTH the original 2-clause OR
  //        and the 3-clause version; we want to end up at 2-clause.
  const s9 = findShapeBlock(xml, "9");
  if (s9) {
    const before9 = xml.slice(s9[0], s9[1]);
    const after9 = before9.replace(
      /(<Cell N='NoShow' V='[^']+' F=')OR\(Sheet\.5!Actions\.Start\.Checked,Sheet\.5!Actions\.StartNonInterrupting\.Checked,Sheet\.5!Actions\.Terminate\.Checked\)('\/>)/,
      `$1OR(Sheet.5!Actions.Start.Checked,Sheet.5!Actions.StartNonInterrupting.Checked)$2`,
    );
    if (after9 !== before9) {
      xml = xml.slice(0, s9[0]) + after9 + xml.slice(s9[1]);
      log.push("Shape 9 NoShow reverted to 2-clause OR");
    }
  }

  // ── (b) Shrink Shape 8 to 0.4 × master Width / Height (was 0.576).
  //        Patch the cached V (0.216 = 0.576 × 0.375 master W) AND the
  //        `Sheet.5!Width*0.576` formula. Same for Height. Also the
  //        LocPin half-values (0.108 → 0.075). Idempotent: only patches
  //        when the OLD 0.576 / 0.216 / 0.108 numbers are still present.
  const s8 = findShapeBlock(xml, "8");
  if (s8) {
    const oldBlock = xml.slice(s8[0], s8[1]);
    let newBlock = oldBlock;
    // Width / Height cells + their Sheet.5! formulas.
    newBlock = newBlock.replace(
      /<Cell N='Width' V='0\.216' F='Sheet\.5!Width\*0\.576'\/>/,
      `<Cell N='Width' V='0.15' F='Sheet.5!Width*0.4'/>`,
    );
    newBlock = newBlock.replace(
      /<Cell N='Height' V='0\.216' F='Sheet\.5!Height\*0\.576'\/>/,
      `<Cell N='Height' V='0.15' F='Sheet.5!Height*0.4'/>`,
    );
    // LocPinX / LocPinY at half of (new) Width / Height.
    newBlock = newBlock.replace(
      /<Cell N='LocPinX' V='0\.108' F='Width\*0\.5'\/>/,
      `<Cell N='LocPinX' V='0.075' F='Width*0.5'/>`,
    );
    newBlock = newBlock.replace(
      /<Cell N='LocPinY' V='0\.108' F='Height\*0\.5'\/>/,
      `<Cell N='LocPinY' V='0.075' F='Height*0.5'/>`,
    );
    // Geometry IX=0 Ellipse cells reference the SAME 0.108 / 0.216
    // constants (cached V's). These ALSO need to shrink.
    // Pattern: <Row T='Ellipse' IX='1'><Cell N='X' V='0.108'…><Cell N='Y' V='0.108'…>
    // <Cell N='A' V='0.216'…><Cell N='B' V='0.108'…><Cell N='C' V='0.108'…><Cell N='D' V='0.216'…>
    newBlock = newBlock
      .replace(/<Cell N='X' V='0\.108' F='Width\*0\.5'\/>/g, `<Cell N='X' V='0.075' F='Width*0.5'/>`)
      .replace(/<Cell N='Y' V='0\.108' F='Height\*0\.5'\/>/g, `<Cell N='Y' V='0.075' F='Height*0.5'/>`)
      .replace(/<Cell N='A' V='0\.216' U='DL' F='Width\*1'\/>/g, `<Cell N='A' V='0.15' U='DL' F='Width*1'/>`)
      .replace(/<Cell N='B' V='0\.108' U='DL' F='Height\*0\.5'\/>/g, `<Cell N='B' V='0.075' U='DL' F='Height*0.5'/>`)
      .replace(/<Cell N='C' V='0\.108' U='DL' F='Width\*0\.5'\/>/g, `<Cell N='C' V='0.075' U='DL' F='Width*0.5'/>`)
      .replace(/<Cell N='D' V='0\.216' U='DL' F='Height\*1'\/>/g, `<Cell N='D' V='0.15' U='DL' F='Height*1'/>`);
    if (newBlock !== oldBlock) {
      xml = xml.slice(0, s8[0]) + newBlock + xml.slice(s8[1]);
      log.push("Shape 8 resized to 0.4 × master (was 0.576 ×)");
    }
  }

  // ── (a) Move Shape 8 to AFTER Shape 9 so z-order paints body first,
  //        then the Terminate marker on top. Idempotent: if Shape 8
  //        already appears AFTER Shape 9, skip.
  const s8b = findShapeBlock(xml, "8");
  const s9b = findShapeBlock(xml, "9");
  if (s8b && s9b && s8b[0] < s9b[0]) {
    // Cut Shape 8's block out and re-insert it immediately after Shape 9.
    const shape8Block = xml.slice(s8b[0], s8b[1]);
    // Re-compute Shape 9's position in the post-removal XML.
    const xmlWithoutShape8 = xml.slice(0, s8b[0]) + xml.slice(s8b[1]);
    const s9after = findShapeBlock(xmlWithoutShape8, "9");
    if (s9after) {
      xml = xmlWithoutShape8.slice(0, s9after[1]) + shape8Block + xmlWithoutShape8.slice(s9after[1]);
      log.push("Shape 8 moved after Shape 9 in declaration order");
    }
  }

  return { xml, log };
}

async function main() {
  const cwd = process.cwd();
  for (const target of TARGETS) {
    const filePath = path.resolve(cwd, target.file);
    if (!fs.existsSync(filePath)) {
      console.log(`SKIP ${target.label}: ${target.file} not found`);
      continue;
    }
    const bytes = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(bytes);
    const m = await findMaster(zip, target.nameRe);
    if (!m) {
      console.log(`${target.label}: End Event master not found`);
      continue;
    }
    const entryPath = `visio/masters/${m.file}`;
    const entry = zip.file(entryPath);
    if (!entry) {
      console.log(`${target.label}: file ${m.file} missing`);
      continue;
    }
    const xml = await entry.async("string");
    const { xml: newXml, log } = patchMaster(xml);
    if (log.length === 0) {
      console.log(`${target.label}: nothing to patch (already up to date)`);
      continue;
    }
    zip.file(entryPath, newXml);
    const out = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    fs.writeFileSync(filePath, out);
    console.log(`${target.label}: patched ${m.name} (${m.file})`);
    for (const l of log) console.log(`  - ${l}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

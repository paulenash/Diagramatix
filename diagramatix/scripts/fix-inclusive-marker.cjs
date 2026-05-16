#!/usr/bin/env node
/**
 * Fix the Inclusive Gateway marker in Microsoft's BPMN_M + Diagramatix
 * v1.5 stencils.
 *
 * BPMN convention: the inclusive gateway's inner marker is a thick
 * stroked ring ("O"). Both stencils ship Shape 11 (the marker sub-shape
 * on the Gateway master) with `NoFill='0'` and a thin `LineWeight ~0.72PT`
 * — Visio renders it as a solid black filled disc.
 *
 * This script flips the marker to a ring:
 *   • NoFill V='1' (was '0') — don't fill the ellipse
 *   • LineWeight V='0.02777…' U='PT' F='GUARD(2PT)' — visible stroke
 *
 * Targets:
 *   - public/bpmn-template-v14.vsdx        Master ID 9 (Gateway - Decision)
 *   - public/BPMN Diagramatix Shapes v1.5.vssx  matching gateway master
 *   - public/bpmn-stencil-v3.vssx               BPMN_M Gateway master
 *
 * Re-running is idempotent: each master's Shape 11 NoFill is checked
 * before any patch; rows already at NoFill='1' are skipped.
 *
 * Run from the diagramatix/ directory:
 *   node scripts/fix-inclusive-marker.cjs
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const TARGETS = [
  { file: "public/bpmn-template-v14.vsdx",                    label: "v1.5 template",   match: /Gateway - Decision/ },
  { file: "public/BPMN Diagramatix Shapes v1.5.vssx",         label: "v1.5 stencil",    match: /Gateway/ },
  { file: "public/bpmn-stencil-v3.vssx",                      label: "BPMN_M stencil",  match: /Gateway/ },
];

/** Find every master file in the .vsdx whose name matches the regex and
 *  whose Shape 11 controls the Inclusive marker. The match-by-name is
 *  defensive — the Decision and Merge gateway masters share Shape IDs
 *  but only Decision has a visible Inclusive marker; patching Merge is
 *  harmless because that marker is gated by `Actions.Inclusive.Checked`
 *  which is FALSE for the merge variant. */
async function findGatewayMasters(zip, nameRe) {
  const mastersXml = await zip.file("visio/masters/masters.xml")?.async("string");
  if (!mastersXml) return [];
  const relsXml = await zip.file("visio/masters/_rels/masters.xml.rels")?.async("string");
  if (!relsXml) return [];
  const results = [];
  // Word-boundary `\s` before NameU= so we don't accidentally match the
  // `IsCustomNameU='1'` attribute that comes after the real NameU=.
  const re = /<Master\s+ID='(\d+)'[^>]*?\sNameU='([^']+)'[\s\S]*?<\/Master>/g;
  let m;
  while ((m = re.exec(mastersXml))) {
    if (!nameRe.test(m[2])) continue;
    const rel = m[0].match(/<Rel\s+r:id='([^']+)'/);
    if (!rel) continue;
    const target = relsXml.match(new RegExp(`Id=["']${rel[1]}["'][^>]*Target=["']([^"']+)["']`));
    if (target) results.push({ id: m[1], name: m[2], file: target[1] });
  }
  return results;
}

/** Patch Shape 11 of a gateway master's content to render the Inclusive
 *  marker as a thick stroked ring instead of a filled disc.
 *
 *  Strategy: locate Shape 11's block via balanced Shape open/close walk
 *  (Shape elements can nest under <Shapes> groups), then replace inside
 *  it ONLY:
 *    1. The shape's `LineWeight V='…' U='PT' F='GUARD(0.72PT)'` →
 *       V='0.027777…' F='GUARD(2PT)' (2pt stroke).
 *    2. The Geometry IX=0 `NoFill V='0'` → V='1'.
 *  Returns the new content and whether anything changed. */
function patchInclusiveMarker(masterXml) {
  const openRe = /<Shape ID='11'[^>]*>/;
  const open = masterXml.match(openRe);
  if (!open || open.index === undefined) {
    return { xml: masterXml, changed: false, reason: "no Shape 11" };
  }
  // Walk forward, balancing <Shape …> / </Shape> to find Shape 11's close.
  const start = open.index;
  let pos = start + open[0].length;
  let depth = 1;
  while (depth > 0 && pos < masterXml.length) {
    const nextOpen = masterXml.indexOf("<Shape ", pos);
    const nextClose = masterXml.indexOf("</Shape>", pos);
    if (nextClose === -1) return { xml: masterXml, changed: false, reason: "Shape 11 unbalanced" };
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + "<Shape ".length;
    } else {
      depth--;
      pos = nextClose + "</Shape>".length;
    }
  }
  const block = masterXml.slice(start, pos);

  // Idempotency check — already patched if NoFill is 1 in any Geometry block.
  if (/<Section N='Geometry'[\s\S]*?<Cell N='NoFill' V='1'/.test(block)) {
    return { xml: masterXml, changed: false, reason: "already patched" };
  }

  // 1. Bump LineWeight to 2pt with a GUARD formula that survives recalc.
  let newBlock = block.replace(
    /(<Cell N='LineWeight' V=')[^']+(' U='PT' F='GUARD\()[^)]+(\)'\/>)/,
    `$10.02777777777777778$22PT$3`,
  );
  // 2. Flip NoFill on Geometry IX=0 from 0 → 1.
  newBlock = newBlock.replace(
    /(<Section N='Geometry' IX='0'><Cell N='NoFill' V=')0(')/,
    `$11$2`,
  );

  if (newBlock === block) {
    return { xml: masterXml, changed: false, reason: "patterns didn't match" };
  }
  return {
    xml: masterXml.slice(0, start) + newBlock + masterXml.slice(pos),
    changed: true,
    reason: "LineWeight → 2pt, NoFill → 1",
  };
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
    const masters = await findGatewayMasters(zip, target.match);
    if (masters.length === 0) {
      console.log(`${target.label}: no gateway master found`);
      continue;
    }
    let changes = 0;
    for (const mInfo of masters) {
      const entryPath = `visio/masters/${mInfo.file}`;
      const entry = zip.file(entryPath);
      if (!entry) continue;
      const xml = await entry.async("string");
      const { xml: newXml, changed, reason } = patchInclusiveMarker(xml);
      if (changed) {
        zip.file(entryPath, newXml);
        changes++;
        console.log(`  + ${mInfo.name} (${mInfo.file}): ${reason}`);
      } else {
        console.log(`  = ${mInfo.name} (${mInfo.file}): ${reason}`);
      }
    }
    if (changes === 0) {
      console.log(`${target.label}: no changes`);
      continue;
    }
    const out = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    fs.writeFileSync(filePath, out);
    console.log(`${target.label}: patched ${changes} master(s) → ${target.file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

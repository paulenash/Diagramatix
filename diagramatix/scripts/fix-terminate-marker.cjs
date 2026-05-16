#!/usr/bin/env node
/**
 * Fix the End-event Terminate marker visibility in Microsoft's BPMN_M
 * + Diagramatix v1.5 stencils.
 *
 * The shipped End event master has Shape 8 (the solid black Terminate
 * fill circle) declared BEFORE Shape 9 (the End event's coloured inner
 * body, 0.3"×0.3"). Z-order = declaration order, so Shape 9 always
 * paints OVER Shape 8 — even when Shape 8's own NoShow override forces
 * it visible, the body covers the marker entirely. Shape 9's NoShow
 * formula only hides for Start / StartNonInterrupting:
 *   OR(Sheet.5!Actions.Start.Checked, Sheet.5!Actions.StartNonInterrupting.Checked)
 *
 * This script extends Shape 9's NoShow formula to ALSO hide when
 * Terminate is active:
 *   OR(Start.Checked, StartNonInterrupting.Checked, Terminate.Checked)
 *
 * That alone fixes the recalc behaviour. The cached V on the page
 * shape's instance still needs a per-instance V=1 override (handled in
 * exportVisioV3.ts) so the FIRST paint also matches the formula.
 *
 * Re-running is idempotent: detects an existing "Terminate.Checked"
 * reference in the formula and skips.
 *
 * Run from the diagramatix/ directory:
 *   node scripts/fix-terminate-marker.cjs
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const TARGETS = [
  // v1.5 path: End event master is in the .vsdx template (ID 5).
  { file: "public/bpmn-template-v14.vsdx",            label: "v1.5 template",   nameRe: /^End Event$/ },
  // v1.5 stencil also has the End Event master for drag-from-stencil use.
  { file: "public/BPMN Diagramatix Shapes v1.5.vssx", label: "v1.5 stencil",    nameRe: /^End Event$/ },
  // BPMN_M event masters live in the auxiliary stencil.
  { file: "public/bpmn-stencil-v3.vssx",              label: "BPMN_M stencil",  nameRe: /^End Event$/ },
];

async function findMaster(zip, nameRe) {
  const mastersXml = await zip.file("visio/masters/masters.xml")?.async("string");
  if (!mastersXml) return null;
  const relsXml = await zip.file("visio/masters/_rels/masters.xml.rels")?.async("string");
  if (!relsXml) return null;
  // Word-boundary `\s` before NameU= so we don't match IsCustomNameU.
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

/** Within the End event master file, find Shape 9 and append
 *  `,Sheet.5!Actions.Terminate.Checked` inside the existing
 *  `OR(...)` of its Geometry NoShow formula. */
function patchShape9NoShow(masterXml) {
  const openRe = /<Shape ID='9'[^>]*>/;
  const open = masterXml.match(openRe);
  if (!open || open.index === undefined) {
    return { xml: masterXml, changed: false, reason: "no Shape 9" };
  }
  // Balanced walk to Shape 9's closing tag.
  const start = open.index;
  let pos = start + open[0].length;
  let depth = 1;
  while (depth > 0 && pos < masterXml.length) {
    const nextOpen = masterXml.indexOf("<Shape ", pos);
    const nextClose = masterXml.indexOf("</Shape>", pos);
    if (nextClose === -1) return { xml: masterXml, changed: false, reason: "unbalanced" };
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + "<Shape ".length;
    } else {
      depth--;
      pos = nextClose + "</Shape>".length;
    }
  }
  const block = masterXml.slice(start, pos);

  if (/Terminate\.Checked/.test(block)) {
    return { xml: masterXml, changed: false, reason: "already patched" };
  }

  // Replace the OR(Start.Checked, StartNonInterrupting.Checked) inside
  // the NoShow formula with the three-clause variant. Use a tight
  // pattern so we don't accidentally touch a different OR(...) elsewhere
  // in Shape 9.
  const newBlock = block.replace(
    /(<Cell N='NoShow' V='[^']+' F=')OR\(Sheet\.5!Actions\.Start\.Checked,Sheet\.5!Actions\.StartNonInterrupting\.Checked\)('\/>)/,
    `$1OR(Sheet.5!Actions.Start.Checked,Sheet.5!Actions.StartNonInterrupting.Checked,Sheet.5!Actions.Terminate.Checked)$2`,
  );
  if (newBlock === block) {
    return { xml: masterXml, changed: false, reason: "NoShow pattern didn't match" };
  }
  return {
    xml: masterXml.slice(0, start) + newBlock + masterXml.slice(pos),
    changed: true,
    reason: "NoShow OR(...) extended with Terminate.Checked",
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
    const { xml: newXml, changed, reason } = patchShape9NoShow(xml);
    if (!changed) {
      console.log(`${target.label}: ${reason}`);
      continue;
    }
    zip.file(entryPath, newXml);
    const out = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    fs.writeFileSync(filePath, out);
    console.log(`${target.label}: patched ${m.name} (${m.file}) — ${reason}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

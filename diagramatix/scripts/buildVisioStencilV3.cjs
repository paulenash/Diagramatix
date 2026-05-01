/**
 * V3 stencil/template pre-colour build step.
 *
 * Reads `public/bpmn-stencil-v3.vssx` and `public/bpmn-template-v3.vsdx`,
 * walks each BPMN master we care about, and rewrites its root
 * `Shape ID='5'` FillForegnd cell to a non-GUARDed Diagramatix default
 * colour. Sub-shapes that reference `Sheet.5!FillForegnd` inherit it
 * automatically; sub-shapes with their own explicit `THEMEGUARD(RGB(...))`
 * (Task and Collapsed Sub-Process) get rewritten too so the body fill is
 * actually visible.
 *
 * Run from the diagramatix directory:
 *   node scripts/buildVisioStencilV3.cjs
 *
 * Idempotent: re-running just rewrites the same cells. Backups are NOT
 * made — the V3 binaries are version-controlled, so use `git restore` to
 * roll back.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const JSZip = require("jszip");

/**
 * Generate a fresh GUID in Visio's `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`
 * format. We rewrite every master's `BaseID` and `UniqueID` so Visio can't
 * silently substitute one of our masters with the user's locally-installed
 * Microsoft BPMN_M stencil version (which would discard our colour edits).
 */
function freshGuid() {
  return `{${crypto.randomUUID().toUpperCase()}}`;
}

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const STENCIL_PATH = path.join(PUBLIC_DIR, "bpmn-stencil-v3.vssx");
const TEMPLATE_PATH = path.join(PUBLIC_DIR, "bpmn-template-v3.vsdx");

// Diagramatix default fills (from app/lib/diagram/colors.ts).
// Only the masters that get a body fill are listed here.
const COLORS = {
  "task":               "#fef9c3",
  "subprocess":         "#fef08a",
  "subprocess-expanded":"#fef4a7",
  "gateway":            "#f3e8ff",
  "start-event":        "#dcfce7",
  "intermediate-event": "#fed7aa",
  "end-event":          "#fca5a5",
  "data-object":        "#bfdbfe",
  "data-store":         "#60a5fa",
  "group":              "#374151",
  "text-annotation":    "#374151",
};

// Stencil masters (BPMN_M) → element type. We resolve the master file
// dynamically from masters.xml + masters.xml.rels so the script doesn't
// rely on rId numbering.
const STENCIL_MASTERS = {
  4:  "gateway",
  5:  "intermediate-event",
  6:  "end-event",
  7:  "start-event",
  10: "text-annotation",
  15: "data-object",
  16: "data-store",
  17: "group",
};

// Template masters → element type.
const TEMPLATE_MASTERS = {
  9:  "task",
  33: "subprocess",
};

/** Convert "#rrggbb" to a Visio RGB() formula string. */
function rgbFormula(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `RGB(${r},${g},${b})`;
}

/** Resolve master ID → master file name from masters.xml + rels. */
async function buildMasterFileMap(zip) {
  const mastersXml = await zip.file("visio/masters/masters.xml").async("string");
  const relsXml = await zip
    .file("visio/masters/_rels/masters.xml.rels")
    .async("string");
  const relMap = new Map();
  for (const m of relsXml.matchAll(/Id="(rId\d+)"[^>]+Target="([^"]+)"/g)) {
    relMap.set(m[1], m[2]);
  }
  const idToFile = new Map();
  for (const m of mastersXml.matchAll(
    /<Master ID='(\d+)'[^>]*>([\s\S]*?)<\/Master>/g,
  )) {
    const rel = m[2].match(/<Rel r:id='(rId\d+)'/);
    if (rel) idToFile.set(parseInt(m[1], 10), relMap.get(rel[1]));
  }
  return idToFile;
}

/** Locate the root `<Shape ID='5'>` opening tag and return its end index
 *  (position right after the `>`). Used so we can splice cells in/out at
 *  the start of the root's cell list. */
function rootShapeOpenEnd(xml) {
  const m = xml.match(/<Shape ID='5'[^>]*>/);
  if (!m) return -1;
  return m.index + m[0].length;
}

/** Find Shape ID=N's full block (open tag → matching </Shape>). */
function findShapeBlock(xml, id) {
  const startMatch = xml.match(new RegExp(`<Shape ID='${id}'[^>]*>`));
  if (!startMatch) return null;
  const start = startMatch.index;
  let depth = 0;
  const re = /<\/?Shape[^>]*>/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith("</Shape")) {
      depth--;
      if (depth === 0) return { start, end: m.index + m[0].length };
    } else {
      depth++;
    }
  }
  return null;
}

/** Inside a shape block, replace the FIRST FillForegnd cell. If none
 *  exists, inject a fresh one immediately after the shape's opening tag. */
function setFillForegnd(blockXml, hex) {
  const cell = `<Cell N='FillForegnd' V='${hex}' F='${rgbFormula(hex)}'/>`;
  const fillRe = /<Cell N='FillForegnd'[^/]*\/>/;
  if (fillRe.test(blockXml)) {
    return blockXml.replace(fillRe, cell);
  }
  // Inject after `<Shape ...>`
  return blockXml.replace(/(<Shape [^>]*>)/, `$1${cell}`);
}

/** Force FillPattern='1' (solid) so the colour actually paints. Replaces
 *  the existing FillPattern cell if present, leaves the shape alone if not. */
function ensureSolidFillPattern(blockXml) {
  const cell = `<Cell N='FillPattern' V='1' F='RGB(0,0,0)*0+1'/>`;
  // Avoid breaking GUARD'd FillPatterns that drive icon visibility — only
  // replace when the existing pattern is the simple `GUARD(1)` or `V='1'`.
  return blockXml.replace(
    /<Cell N='FillPattern' V='1' F='GUARD\(1\)'\/>/g,
    cell,
  );
}

/** Apply colour to a single master file inside `zip`. */
async function colourMaster(zip, file, elType, label) {
  const colour = COLORS[elType];
  if (!colour) {
    console.log(`  ${label}: no colour for type "${elType}", skipping`);
    return;
  }
  const original = await zip.file(`visio/masters/${file}`).async("string");
  if (!original) {
    console.log(`  ${label}: file ${file} missing, skipping`);
    return;
  }

  let updated = original;
  let rewriteCount = 0;

  // 1. Rewrite root Shape ID='5' FillForegnd (cleans up the `GUARD(IF(...))`
  //    chain on the root group so instance-level overrides can flow down).
  const root = findShapeBlock(updated, 5);
  if (root) {
    const rootBlockOriginal = updated.slice(root.start, root.end);
    let rootBlockNew = setFillForegnd(rootBlockOriginal, colour);
    rootBlockNew = ensureSolidFillPattern(rootBlockNew);
    if (rootBlockNew !== rootBlockOriginal) rewriteCount++;
    updated = updated.slice(0, root.start) + rootBlockNew + updated.slice(root.end);
  }

  // 2. Body sub-shapes with `V='1' F='GUARD(IF(...))'` or `V='1' F='GUARD(1)'`
  //    paint white-with-formula-lock over the inherited root colour. Replace
  //    those cells with our colour. `V='0' F='GUARD(0)'` cells are inner
  //    marker/icon strokes and stay as-is.
  const colourCell = `<Cell N='FillForegnd' V='${colour}' F='${rgbFormula(colour)}'/>`;
  const whiteGuardRe = /<Cell N='FillForegnd' V='1' F='GUARD\([^']+\)'\/>/g;
  updated = updated.replace(whiteGuardRe, () => {
    rewriteCount++;
    return colourCell;
  });

  // 3. THEMEGUARD(RGB(255,255,255)) explicit-white cells (Task/Subprocess
  //    body squares; some BPMN_M masters too) get the same treatment.
  const themeGuardWhiteRe =
    /<Cell N='FillForegnd' V='#ffffff' F='THEMEGUARD\(RGB\(255,255,255\)\)'\/>/g;
  updated = updated.replace(themeGuardWhiteRe, () => {
    rewriteCount++;
    return `<Cell N='FillForegnd' V='${colour}' F='THEMEGUARD(${rgbFormula(colour)})'/>`;
  });

  zip.file(`visio/masters/${file}`, updated);
  console.log(`  ${label} (${file}): coloured → ${colour}  (${rewriteCount} cells rewritten)`);
}

/** Rewrite every `<Master>` block's `BaseID` and `UniqueID` GUIDs to fresh
 *  values. This stops Visio from silently substituting our edited master
 *  with a locally-installed Microsoft BPMN_M master that has the same GUIDs. */
async function regenerateMasterGuids(zip) {
  let mastersXml = await zip.file("visio/masters/masters.xml").async("string");
  let count = 0;
  mastersXml = mastersXml.replace(
    /<Master ([^>]*)>/g,
    (full, attrs) => {
      let next = attrs;
      next = next.replace(/UniqueID='\{[^}]+\}'/, () => `UniqueID='${freshGuid()}'`);
      next = next.replace(/BaseID='\{[^}]+\}'/, () => `BaseID='${freshGuid()}'`);
      if (next !== attrs) count++;
      return `<Master ${next}>`;
    },
  );
  zip.file("visio/masters/masters.xml", mastersXml);
  return count;
}

async function processFile(filePath, masterMap, label) {
  console.log(`\n${label}: ${path.basename(filePath)}`);
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const idToFile = await buildMasterFileMap(zip);
  for (const [id, elType] of Object.entries(masterMap)) {
    const file = idToFile.get(parseInt(id, 10));
    if (!file) {
      console.log(`  Master ID=${id} (${elType}): not found`);
      continue;
    }
    await colourMaster(zip, file, elType, `Master ID=${id} (${elType})`);
  }
  const guidCount = await regenerateMasterGuids(zip);
  console.log(`  Regenerated GUIDs on ${guidCount} masters`);
  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  fs.writeFileSync(filePath, out);
  console.log(`  → wrote ${path.basename(filePath)} (${out.length} bytes)`);
}

(async () => {
  await processFile(STENCIL_PATH, STENCIL_MASTERS, "Stencil");
  await processFile(TEMPLATE_PATH, TEMPLATE_MASTERS, "Template");
  console.log("\nDone.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Fix the BPMN Conditional event marker in Microsoft's BPMN stencils.
 *
 * Both BPMN_M and Diagramatix v1.5 stencils ship with Geometry IX=2
 * (the Conditional marker on the Start / Intermediate / End event master's
 * root Shape 5) drawing ONLY the outer rectangle — 5 path rows tracing the
 * corners, no internal lines. The standard BPMN Conditional icon needs
 * three internal horizontal lines (representing "lined paper / business
 * rules"); without them the marker looks like an empty box.
 *
 * This script patches the offending masters inside each stencil/template
 * .vsdx / .vssx in `public/`, appending six new rows (3 MoveTo + 3 LineTo
 * pairs) for the missing horizontal lines. Cached V values are derived
 * from each master's natural Width / Height so first-paint also looks
 * right.
 *
 * Re-run is idempotent: if the section already has more than 5 rows the
 * master is skipped.
 *
 * Run from the diagramatix/ directory: `node scripts/fix-conditional-icon.cjs`
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

// Files to patch. Each entry lists the auxiliary stencil / template path
// and an array of master files (relative to the file's visio/masters/
// directory) that have a Conditional Geometry IX=2 to fix.
const TARGETS = [
  {
    file: "public/bpmn-template-v14.vsdx",
    masters: ["master1.xml", "master2.xml", "master3.xml"],
    label: "v1.5 template",
  },
  {
    file: "public/BPMN Diagramatix Shapes v1.5.vssx",
    masters: null, // auto-detect
    label: "v1.5 stencil",
  },
  {
    file: "public/bpmn-stencil-v3.vssx",
    masters: null, // auto-detect
    label: "BPMN_M stencil",
  },
];

/** Locate every master XML file inside the .vsdx whose root Shape 5 has
 *  a Geometry IX=2 controlled by Actions.Conditional.Checked. Returns
 *  the list of filenames relative to visio/masters/. */
function findConditionalMasters(zip) {
  const result = [];
  const masterDir = zip.folder("visio/masters");
  if (!masterDir) return result;
  zip.forEach((relPath, entry) => {
    if (!relPath.startsWith("visio/masters/")) return;
    if (!relPath.endsWith(".xml")) return;
    if (relPath.endsWith("/masters.xml")) return;
    if (entry.dir) return;
    // We can't await inside forEach — collect names and inspect later.
    result.push(relPath.replace("visio/masters/", ""));
  });
  return result;
}

/** Inject 6 horizontal-line rows into Geometry IX=2 of Shape 5 if the
 *  section currently has exactly 5 rows (the empty-rectangle bug).
 *  Returns the new XML string and whether a change was made. */
function patchMasterXml(xml) {
  // Find Shape 5 root block — match until next <Shape ID=' or end.
  const shape5Re = /<Shape ID='5'[\s\S]*?(?=<Shape ID='6'|<\/Shapes>)/;
  const shape5Match = xml.match(shape5Re);
  if (!shape5Match) return { xml, changed: false, reason: "no Shape 5 root" };

  const shape5 = shape5Match[0];
  // Get Width and Height cached V values from Shape 5's own cells.
  const widthMatch = shape5.match(/<Cell N='Width' V='([\d.]+)'/);
  const heightMatch = shape5.match(/<Cell N='Height' V='([\d.]+)'/);
  if (!widthMatch || !heightMatch) {
    return { xml, changed: false, reason: "no Width/Height on Shape 5" };
  }
  const W = parseFloat(widthMatch[1]);
  const H = parseFloat(heightMatch[1]);

  // Find Geometry IX=2 inside Shape 5.
  const geomIdx = shape5.indexOf("<Section N='Geometry' IX='2'>");
  if (geomIdx < 0) {
    return { xml, changed: false, reason: "no Geometry IX=2" };
  }
  const geomEnd = shape5.indexOf("</Section>", geomIdx);
  const geomBlock = shape5.slice(geomIdx, geomEnd + 10);
  if (!geomBlock.includes("Actions.Conditional.Checked")) {
    return { xml, changed: false, reason: "IX=2 is not Conditional" };
  }
  // Count existing rows. 5 = unpatched (empty rectangle).
  const rowCount = (geomBlock.match(/<Row T='/g) || []).length;
  if (rowCount > 5) {
    return { xml, changed: false, reason: `already patched (${rowCount} rows)` };
  }

  // New horizontal-line rows. The rectangle outline spans (0.25W, 0.25H)
  // to (0.75W, 0.75H). Three lines at y=0.36H, 0.50H, 0.64H, each from
  // x=0.32W to x=0.68W. MoveTo lifts the pen; LineTo draws.
  const lineYs = [0.36, 0.5, 0.64];
  const x1 = 0.32, x2 = 0.68;
  let nextIx = 6;
  const newRows = lineYs.map((yFrac) => {
    const moveTo = `<Row T='MoveTo' IX='${nextIx++}'>` +
      `<Cell N='X' V='${(W * x1).toFixed(6)}' F='Width*${x1}'/>` +
      `<Cell N='Y' V='${(H * yFrac).toFixed(6)}' F='Height*${yFrac}'/>` +
      `</Row>`;
    const lineTo = `<Row T='LineTo' IX='${nextIx++}'>` +
      `<Cell N='X' V='${(W * x2).toFixed(6)}' F='Width*${x2}'/>` +
      `<Cell N='Y' V='${(H * yFrac).toFixed(6)}' F='Height*${yFrac}'/>` +
      `</Row>`;
    return moveTo + lineTo;
  }).join("");

  // Insert before </Section>. Operate on the absolute offset within xml.
  const absGeomEnd = shape5Match.index + geomEnd;
  const patched = xml.slice(0, absGeomEnd) + newRows + xml.slice(absGeomEnd);
  return { xml: patched, changed: true, reason: `added 6 rows (W=${W}, H=${H})` };
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
    const masters = target.masters ?? findConditionalMasters(zip);

    let totalChanges = 0;
    for (const master of masters) {
      const entryPath = `visio/masters/${master}`;
      const entry = zip.file(entryPath);
      if (!entry) {
        console.log(`  - ${master}: not in archive`);
        continue;
      }
      const xml = await entry.async("string");
      const { xml: newXml, changed, reason } = patchMasterXml(xml);
      if (changed) {
        zip.file(entryPath, newXml);
        totalChanges++;
        console.log(`  + ${master}: ${reason}`);
      } else if (reason !== "no Shape 5 root" && reason !== "no Geometry IX=2" && reason !== "IX=2 is not Conditional") {
        console.log(`  = ${master}: ${reason}`);
      }
    }

    if (totalChanges === 0) {
      console.log(`${target.label}: no changes`);
      continue;
    }
    // Save back. Use STORE for the XML compression — DEFLATE works but
    // JSZip's defaults preserve binary structure better.
    const out = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    fs.writeFileSync(filePath, out);
    console.log(`${target.label}: patched ${totalChanges} master(s) → ${target.file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

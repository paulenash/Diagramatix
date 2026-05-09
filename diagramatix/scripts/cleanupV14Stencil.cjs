/**
 * Clean up the user-authored BPMN Diagramatix Shapes v1.4.vssx in place.
 *
 *   1. Rename every master's NameU / Name (in masters.xml AND on the root
 *      Shape inside each master's XML file) to a canonical string the
 *      Visio import recognises.  Visio's auto-naming left "- Master.NN"
 *      suffixes and a few typos (Intermendiate, Subprocewss).  The import
 *      at app/lib/diagram/v3/importVisioV3.ts is NameU-driven (exact
 *      ELEMENT_NAMEU_MAP first, then fuzzy substring fallback) — without
 *      cleanup, Start/End/Intermediate/Collapsed-Sub-Process/Sequence/
 *      Message connectors all silently fail to classify.
 *
 *   2. Rewrite docProps title to "BPMN Diagramatix Shapes v1.4".
 *
 * Source (overwrite): public/BPMN Diagramatix Shapes v1.4.vssx
 *
 *   node scripts/cleanupV14Stencil.cjs
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const FILE = path.join(
  __dirname,
  "..",
  "public",
  "BPMN Diagramatix Shapes v1.4.vssx",
);

// Master ID → { canonical NameU, canonical Name (displayed in stencil pane) }.
// Same string for both — Visio shows `Name`, import reads `NameU`.
// IDs come from masters.xml in v1.4 (renumbered from BPMN_M during the
// runtime export → re-save round-trip the user did).
const RENAMES = {
  "24": "Start Event",
  "26": "Intermediate Event",
  "30": "End Event",
  "32": "Task",
  "34": "Collapsed Sub-Process",
  "36": "Expanded Sub-Process",
  "53": "Gateway - Decision",
  "55": "Gateway - Merge",
  "42": "Data Object",
  "44": "Data Store",
  "46": "Sequence Flow",
  "47": "Message Flow",
  "49": "Message Flow (Reverse)",
  "52": "Association",
  // Pool / Lane (18), Text Annotation (10), Group (17), CFF Container (19),
  // Swimlane List (20), Phase List (21), Separator (22), Separator vertical (23)
  // are already canonically named — leave them untouched.
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Return master rId → master*.xml filename map by reading the rels file. */
function buildRelsMap(relsXml) {
  const map = {};
  const re = /Id="(rId\d+)"\s+Type="[^"]+"\s+Target="([^"]+)"/g;
  let m;
  while ((m = re.exec(relsXml)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

/** Return master ID → rId map by scanning masters.xml. */
function buildMasterRidMap(mastersXml) {
  const map = {};
  const re = /<Master\s+ID='(\d+)'[\s\S]*?<Rel\s+r:id='(rId\d+)'/g;
  let m;
  while ((m = re.exec(mastersXml)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

(async () => {
  if (!fs.existsSync(FILE)) {
    console.error(`Stencil not found: ${FILE}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(FILE);
  const zip = await JSZip.loadAsync(buf);

  // ── docProps: relabel ────────────────────────────────────────────
  let core = await zip.file("docProps/core.xml").async("string");
  core = core
    .replace(
      /<dc:title>[^<]*<\/dc:title>/,
      "<dc:title>BPMN Diagramatix Shapes v1.4</dc:title>",
    )
    .replace(
      /<dc:description>[^<]*<\/dc:description>/,
      "<dc:description>BPMN shapes for Diagramatix v1.4 — author or edit BPMN diagrams in Visio that import cleanly back into Diagramatix.</dc:description>",
    );
  zip.file("docProps/core.xml", core);

  let app = await zip.file("docProps/app.xml").async("string");
  if (app.includes("<Template>")) {
    app = app.replace(
      /<Template>[^<]*<\/Template>/,
      "<Template>BPMN Diagramatix Shapes v1.4.vssx</Template>",
    );
    zip.file("docProps/app.xml", app);
  }

  // ── Cleanup names ────────────────────────────────────────────────
  let mastersXml = await zip.file("visio/masters/masters.xml").async("string");
  const relsXml = await zip.file("visio/masters/_rels/masters.xml.rels").async("string");
  const rIdToFile = buildRelsMap(relsXml);
  const masterIdToRid = buildMasterRidMap(mastersXml);

  let renamedCount = 0;
  const summary = [];
  for (const [id, canonical] of Object.entries(RENAMES)) {
    // 1. Rewrite the <Master ID='${id}'> entry's NameU and Name in masters.xml.
    //    The original attribute pair is `NameU='X' IsCustomNameU='1' Name='X' IsCustomName='1'`;
    //    keep IsCustomNameU/IsCustomName flags so Visio respects our names.
    const masterRe = new RegExp(
      `(<Master\\s+ID='${id}'\\s+)NameU='[^']*'(\\s+IsCustomNameU='\\d+')?\\s*Name='[^']*'(\\s+IsCustomName='\\d+')?`,
    );
    const matched = mastersXml.match(masterRe);
    if (!matched) {
      summary.push(`  ✗ Master ID ${id} — no NameU/Name pair matched in masters.xml`);
      continue;
    }
    mastersXml = mastersXml.replace(
      masterRe,
      `$1NameU='${canonical}' IsCustomNameU='1' Name='${canonical}' IsCustomName='1'`,
    );

    // 2. Rewrite the root Shape ID='5' opening tag's NameU/Name in the per-
    //    master XML file (master*.xml).  The runtime export and the Visio
    //    UI both surface this on dropped instances.
    const rid = masterIdToRid[id];
    const masterFile = rid ? rIdToFile[rid] : null;
    if (masterFile) {
      const masterPath = `visio/masters/${masterFile}`;
      const file = zip.file(masterPath);
      if (file) {
        let xml = await file.async("string");
        // The Shape 5 opening tag may carry its own NameU="Task 1" /
        // Name="Task 1" (or be missing them entirely).  Normalise both.
        const shape5Re = /<Shape\s+ID='5'([^>]*?)>/;
        const m5 = xml.match(shape5Re);
        if (m5) {
          let attrs = m5[1];
          attrs = attrs.replace(/\s+NameU='[^']*'/, "");
          attrs = attrs.replace(/\s+IsCustomNameU='\d+'/, "");
          attrs = attrs.replace(/\s+Name='[^']*'/, "");
          attrs = attrs.replace(/\s+IsCustomName='\d+'/, "");
          // Re-insert the canonical attrs right after `ID='5'`.
          attrs = ` NameU='${canonical}' IsCustomNameU='1' Name='${canonical}' IsCustomName='1'` + attrs;
          xml = xml.replace(shape5Re, `<Shape ID='5'${attrs}>`);
          zip.file(masterPath, xml);
        }
      }
    }

    summary.push(`  ✓ Master ID ${id} → "${canonical}"`);
    renamedCount++;
  }

  zip.file("visio/masters/masters.xml", mastersXml);

  // ── Write back ───────────────────────────────────────────────────
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(FILE, out);

  console.log(`Cleaned ${FILE} (${(out.length / 1024).toFixed(1)} KiB)`);
  console.log(`Renamed ${renamedCount} masters:`);
  for (const line of summary) console.log(line);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

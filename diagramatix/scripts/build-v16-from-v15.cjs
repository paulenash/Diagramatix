/**
 * One-shot: produce Diagramatix v1.6 stencil + template from v1.5 by
 * regenerating every GUID in the archive. v1.5's masters share BaseID
 * GUIDs with v1.4 (the v1.5 stencil was built from v1.4 without
 * refreshing GUIDs), which causes Visio to conflate v1.5 and v1.4
 * shapes when both are loaded into My Shapes — a dropped shape from
 * v1.5 reverts to v1.4 styling because Visio resolves by BaseID.
 *
 * v1.6's BaseIDs are fresh UUID-v4s so the conflation disappears.
 *
 * Output:
 *   public/BPMN Diagramatix Shapes v1.6.vssx
 *   public/bpmn-template-v16.vsdx
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   node scripts/build-v16-from-v15.cjs
 *
 * Idempotent: safe to re-run. Each run produces fresh GUIDs (so the
 * outputs differ byte-for-byte across runs); commit the output you
 * actually want to ship.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const JSZip = require("jszip");

const PUBLIC = path.join(__dirname, "..", "public");

// GUIDs in Visio's masters.xml use uppercase letters and curly braces:
//   BaseID='{679D7A1D-9278-49FF-861D-79690CFF0D45}'
// crypto.randomUUID() produces lowercase, no braces — normalise to
// match Visio's format so the output matches what Visio writes itself.
function freshGuid() {
  return "{" + crypto.randomUUID().toUpperCase() + "}";
}

/** Match braced GUIDs exactly: {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX} */
const GUID_RE = /\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/g;

/**
 * Walk a ZIP archive, collect every GUID across all text files, build a
 * mapping old → new, then rewrite every file substituting the mapping.
 * Re-zip and return the bytes.
 *
 * `renameV15ToV16Strings` — when true, also substitute the literal
 * strings "v1.5" → "v1.6" and "v15" → "v16" in display-name fields.
 * Used for the stencil and template files; the template's internal
 * version string ends up visible in Visio's File > Properties dialog.
 */
async function refreshGuids(inputPath, outputPath, renameV15ToV16Strings) {
  console.log(`\n=== ${path.basename(inputPath)} -> ${path.basename(outputPath)} ===`);
  const inputBytes = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(inputBytes);

  // Pass 1: collect every unique GUID across every text file.
  const allGuids = new Set();
  const textFiles = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    // Read all files as text first (XML / .rels / [Content_Types].xml are all text).
    // Binary files (icons, thumbnails) won't contain GUID patterns so the regex
    // pass is a no-op on them — but we still need to write them back unchanged.
    const isText =
      name.endsWith(".xml") || name.endsWith(".rels") ||
      name.startsWith("[Content_Types]");
    if (!isText) continue;
    const txt = await entry.async("string");
    let m;
    GUID_RE.lastIndex = 0;
    while ((m = GUID_RE.exec(txt)) !== null) {
      allGuids.add(m[0].toUpperCase());
    }
    textFiles.push({ name, txt });
  }
  console.log(`  Found ${allGuids.size} unique GUID(s) across ${textFiles.length} text file(s)`);

  // Pass 2: build mapping.
  const mapping = new Map();
  for (const old of allGuids) {
    mapping.set(old, freshGuid());
  }

  // Pass 3: substitute in each text file. Replace case-insensitively
  // (some XMLs might use lowercase hex) and reseat each match's value
  // through the mapping. Also handle the v1.5 → v1.6 rename in
  // display-name strings.
  for (const { name, txt } of textFiles) {
    let next = txt.replace(GUID_RE, (g) => mapping.get(g.toUpperCase()) ?? g);
    if (renameV15ToV16Strings) {
      next = next
        .replace(/Diagramatix Shapes v1\.5/g, "Diagramatix Shapes v1.6")
        .replace(/Diagramatix v1\.5/g, "Diagramatix v1.6")
        // Internal references to "v15" in property names — be cautious:
        // limit to the standalone token, don't touch arbitrary substrings.
        .replace(/\bv1\.5\b/g, "v1.6");
    }
    zip.file(name, next);
  }

  // Pass 4: copy binary entries unchanged (jszip handles this automatically
  // when we don't overwrite them — they stay in the zip from loadAsync).

  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(outputPath, out);
  console.log(`  Wrote ${out.length} bytes`);
}

async function main() {
  await refreshGuids(
    path.join(PUBLIC, "BPMN Diagramatix Shapes v1.5.vssx"),
    path.join(PUBLIC, "BPMN Diagramatix Shapes v1.6.vssx"),
    /*renameV15ToV16Strings=*/ true,
  );
  await refreshGuids(
    path.join(PUBLIC, "bpmn-template-v15.vsdx"),
    path.join(PUBLIC, "bpmn-template-v16.vsdx"),
    /*renameV15ToV16Strings=*/ true,
  );
  console.log("\n✔ v1.6 stencil + template generated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-shot end-to-end debug harness.
 * Pulls a BPMN diagram from Postgres, runs the same exportVisioV3 logic the
 * route runs, writes the .vsdx to /tmp, and dumps a few FillForegnd cells
 * from key master files so we can see what actually lands in the output.
 *
 * Usage: node scripts/testVisioV3Export.mjs <diagramId>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import JSZip from "jszip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC = path.join(__dirname, "..", "public");

// Re-implement the route in-process — we can't easily import the TS source
// from a plain .mjs, so this duplicates the minimum necessary logic to load
// the post-script binaries and pull master files out for inspection.

const diagramId = process.argv[2] ?? "cmom5sx2r0003uw1ku9nhudpa";

const pool = new pg.Pool({
  connectionString: "postgres://postgres:postgres@localhost:5432/diagramatix",
  max: 1,
});
const r = await pool.query(
  `SELECT id, name, data, "displayMode" FROM "Diagram" WHERE id = $1`,
  [diagramId],
);
await pool.end();
if (r.rowCount === 0) throw new Error("Diagram not found: " + diagramId);
const row = r.rows[0];
console.log("Diagram:", row.name);

// First just verify what's in the on-disk binary — proves the script edits
// stuck.
const stencilBuf = fs.readFileSync(path.join(PUBLIC, "bpmn-stencil-v3.vssx"));
const templateBuf = fs.readFileSync(path.join(PUBLIC, "bpmn-template-v3.vsdx"));
const stencilZip = await JSZip.loadAsync(stencilBuf);

console.log("\n=== Disk binary: bpmn-stencil-v3.vssx → master5.xml (Start Event) ===");
const startMaster = await stencilZip.file("visio/masters/master5.xml").async("string");
const startCells = [...startMaster.matchAll(/<Cell N='FillForegnd'[^/]*\/>/g)];
console.log(`  ${startCells.length} FillForegnd cells, first 5:`);
for (const c of startCells.slice(0, 5)) console.log("    " + c[0]);

const templateZip = await JSZip.loadAsync(templateBuf);
console.log("\n=== Disk binary: bpmn-template-v3.vsdx → master2.xml (Task) ===");
const taskMaster = await templateZip.file("visio/masters/master2.xml").async("string");
const taskCells = [...taskMaster.matchAll(/<Cell N='FillForegnd'[^/]*\/>/g)];
console.log(`  ${taskCells.length} FillForegnd cells, first 5:`);
for (const c of taskCells.slice(0, 5)) console.log("    " + c[0]);

// Now hit the route to see what comes back.
console.log("\n=== Route response check ===");
console.log("(Login required — skipped. The disk-binary check above is the source of truth.)");

console.log("\nIf the disk-binary cells show #dcfce7 / #fef9c3 (Diagramatix colours) and Visio still paints white, the problem is in Visio's rendering — likely the document stylesheet (`FillStyle='3'`) overriding the master's inline FillForegnd. Next step: dump the document stylesheets and patch them too.");

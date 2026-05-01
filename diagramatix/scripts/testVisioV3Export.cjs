/* eslint-disable */
// One-shot debug harness: pulls a BPMN diagram from PG, runs exportVisioV3
// against the live stencil/template files, writes the .vsdx to /tmp, and
// extracts master files so we can see what actually lands in the output.
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const JSZip = require("jszip");

(async () => {
  const pool = new Pool({
    connectionString: "postgres://postgres:postgres@localhost:5432/diagramatix",
    max: 1,
  });
  const diagramId = process.argv[2] ?? "cmom5sx2r0003uw1ku9nhudpa";
  const r = await pool.query(
    `SELECT id, name, data, "displayMode" FROM "Diagram" WHERE id = $1`,
    [diagramId],
  );
  await pool.end();
  if (r.rowCount === 0) {
    console.error("Diagram not found:", diagramId);
    process.exit(1);
  }
  const row = r.rows[0];
  console.log("Diagram:", row.name);

  // Dynamically import the ESM module (Next.js compiles to ESM)
  const exportPath = path.join(__dirname, "..", ".next", "server", "chunks");
  console.log("Looking for compiled exportVisioV3 in", exportPath);

  // Easier path: import the TS source via tsx
  // But to avoid tsx, just shell out to a small node loader using ts-node? No.
  // Instead, compile a one-off test by directly using the TS source via require.

  // Actually simplest: replicate the route.ts file-reading logic and invoke
  // via the loose-typed `exportVisioV3` from the TS source compiled at runtime.
  // The TS file uses ESM import. Use `tsx` if available.
  console.log(
    "Run: npx tsx scripts/testVisioV3Export.ts " + diagramId +
    " (this script is just a placeholder)",
  );
})();

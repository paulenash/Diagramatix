/**
 * Debug script for Phase 3 commit 2: directly invoke exportVisioV3 with a
 * 1-pool-2-lane fixture and dump the lane shape XML so we can verify the
 * CFF wiring lands in the export bytes (bypasses Next.js build cache).
 *
 * Run:   cd diagramatix && node scripts/debugPhase3Commit2.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Run via:  npx tsx scripts/debugPhase3Commit2.mjs
// tsx transpiles the .ts imports on the fly.
const { exportVisioV3 } = await import("../app/lib/diagram/v3/exportVisioV3.ts");
const { profileByName } = await import("../app/lib/diagram/v3/stencilProfile.ts");

const data = {
  version: "1.17",
  diagramType: "bpmn",
  elements: [
    { id: "pool-1", type: "pool", label: "Test Pool", x: 0, y: 0, width: 800, height: 400 },
    { id: "lane-A", type: "lane", label: "Lane A", x: 36, y: 0, width: 764, height: 200, parentId: "pool-1" },
    { id: "lane-B", type: "lane", label: "Lane B", x: 36, y: 200, width: 764, height: 200, parentId: "pool-1" },
  ],
  connectors: [],
};

const profile = profileByName("v1.5");
const tmpl = readFileSync(resolve("public", profile.templateFile));
const stencil = readFileSync(resolve("public", profile.stencilFile));
const cffRef = readFileSync(resolve("public", "Pools and Lanes Master using BPMN Basic Shapes.vsdx"));

const out = await exportVisioV3(
  data,
  "debug-phase3-commit2",
  stencil.buffer.slice(stencil.byteOffset, stencil.byteOffset + stencil.byteLength),
  tmpl.buffer.slice(tmpl.byteOffset, tmpl.byteOffset + tmpl.byteLength),
  "normal",
  undefined,
  profile,
  cffRef.buffer.slice(cffRef.byteOffset, cffRef.byteOffset + cffRef.byteLength),
);

import { tmpdir } from "node:os";
const outPath = resolve(tmpdir(), "debug-commit2.vsdx");
writeFileSync(outPath, out);

const JSZip = (await import("jszip")).default;
const zip = await JSZip.loadAsync(out);
const page1 = await zip.file("visio/pages/page1.xml").async("string");

// Pull out each lane's <Shape ...> ... </Shape> block.
const laneRe = /<Shape ID='\d+' NameU='Lane [AB]'[\s\S]*?<\/Shape>/g;
let m;
const laneBlocks = [];
while ((m = laneRe.exec(page1)) !== null) laneBlocks.push(m[0]);

console.log(`Output: ${outPath} (${out.length} bytes)`);
console.log(`Lane shape blocks found: ${laneBlocks.length}`);
for (const block of laneBlocks) {
  console.log("\n----- LANE SHAPE -----");
  console.log(block.slice(0, 4000));
  console.log("----- END LANE SHAPE -----\n");
}

const cffWiringChecks = {
  "SwimlaneListGUID": /SwimlaneListGUID'><Cell N='Value' V='\{[A-F0-9-]+\}'/.test(page1),
  "msvShapeCategories=Swimlane;Lane;DoNotContain": /msvShapeCategories'><Cell N='Value' V='Swimlane;Lane;DoNotContain'/.test(page1),
  "visCFFSettings": /visCFFSettings'><Cell N='Value' V='\/stg1=/.test(page1),
  "Relationships cell": /<Cell N='Relationships' V='0' F='SUM\(DEPENDSON\(5,Sheet\.\d+/.test(page1),
};
console.log("\n----- CFF WIRING PRESENCE CHECKS -----");
for (const [k, v] of Object.entries(cffWiringChecks)) console.log(`  ${v ? "OK" : "MISS"}: ${k}`);

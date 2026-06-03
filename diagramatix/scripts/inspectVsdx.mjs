import { readFileSync } from "node:fs";
import JSZip from "jszip";

const path = process.argv[2];
if (!path) { console.error("usage: tsx scripts/inspectVsdx.mjs <vsdx-path>"); process.exit(1); }

const buf = readFileSync(path);
const zip = await JSZip.loadAsync(buf);
const page1 = await zip.file("visio/pages/page1.xml").async("string");

const opens = [...page1.matchAll(/<Shape ID='[^']+'[^>]*>/g)].map(m => m[0]);
console.log(`Top-level shapes: ${opens.length}`);
for (const o of opens) console.log(" ", o.slice(0, 220));

console.log("\nShape geometry:");
const shapeBlocks = [...page1.matchAll(/<Shape ID='([^']+)'[\s\S]*?<\/Shape>/g)];
for (const b of shapeBlocks) {
  const id = b[1];
  const block = b[0];
  const cells = ["PinX", "PinY", "Width", "Height", "LocPinX", "LocPinY"];
  const vals = cells.map(c => {
    const re = new RegExp(`<Cell N='${c}' V='([^']+)'`);
    const m = block.match(re);
    return `${c}=${m ? m[1] : "?"}`;
  });
  const nameU = block.match(/NameU='([^']+)'/);
  console.log(`  ID=${id} (${nameU ? nameU[1] : "?"}) ` + vals.join(" "));
}

// Look at the CFF Container master
const masters = await zip.file("visio/masters/masters.xml").async("string");
const cff = masters.match(/<Master ID='1000'[\s\S]*?<\/Master>/);
if (cff) {
  const rels = await zip.file("visio/masters/_rels/masters.xml.rels").async("string");
  const relId = cff[0].match(/<Rel r:id='(rId\d+)'/)?.[1];
  const target = rels.match(new RegExp(`Id="${relId}"[^>]*Target="([^"]+)"`))?.[1];
  console.log(`\nCFF Container master file: ${target}`);
  const content = await zip.file("visio/masters/" + target).async("string");
  // Print the root shape's W/H + Shape 6 (body) W/H + FillForegnd
  const root = content.match(/<Shape ID='5'[^>]*>([\s\S]*?<\/Shape>)/);
  const s6 = content.match(/<Shape ID='6'[\s\S]*?<\/Shape>/);
  const s7 = content.match(/<Shape ID='7'[\s\S]*?<\/Shape>/);
  for (const [name, m] of [["Root S5", root], ["Body S6", s6], ["Header S7", s7]]) {
    if (!m) { console.log(`  ${name}: not found`); continue; }
    const wm = m[0].match(/<Cell N='Width' V='([^']+)'/);
    const hm = m[0].match(/<Cell N='Height' V='([^']+)'/);
    const fm = m[0].match(/<Cell N='FillForegnd' V='([^']+)'/);
    const fp = m[0].match(/<Cell N='FillPattern' V='([^']+)'/);
    console.log(`  ${name}: W=${wm?.[1]} H=${hm?.[1]} FillForegnd=${fm?.[1] ?? "(none)"} FillPattern=${fp?.[1] ?? "(none)"}`);
  }
}

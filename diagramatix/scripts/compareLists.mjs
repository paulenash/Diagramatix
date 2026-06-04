import { readFileSync } from "node:fs";
import JSZip from "jszip";

const files = [
  "public/bpmn files/Pools and Lanes Test for Visio Export (v1.6) (1).vsdx",
  process.argv[2] ?? "C:/Users/paul/Downloads/Pools and Lanes Test 2 - no elements (local) (v1.6) (7).vsdx",
];

for (const f of files) {
  const buf = readFileSync(f);
  const zip = await JSZip.loadAsync(buf);
  const page1 = await zip.file("visio/pages/page1.xml").async("string");
  console.log(`\n=== ${f} ===`);
  const ids = [...page1.matchAll(/<Shape ID='([^']+)'/g)].map(m => m[1]).slice(0, 10);
  for (const id of ids) {
    const re = new RegExp(`<Shape ID='${id}'[\\s\\S]*?</Shape>`);
    const m = page1.match(re);
    if (!m) continue;
    const get = (k) => {
      const cm = m[0].match(new RegExp(`<Cell N='${k}' V='([^']+)'`));
      return cm ? Number(cm[1]).toFixed(3) : "?";
    };
    const nameU = m[0].match(/NameU='([^']+)'/);
    console.log(`  ID=${id} (${nameU ? nameU[1] : "?"}) Pin=(${get("PinX")},${get("PinY")}) W=${get("Width")} H=${get("Height")} LocPin=(${get("LocPinX")},${get("LocPinY")})`);
  }
}

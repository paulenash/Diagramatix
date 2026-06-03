import { readFileSync } from "node:fs";
import JSZip from "jszip";

const path = process.argv[2];
const masterFile = process.argv[3] ?? "visio/masters/master54.xml";

const zip = await JSZip.loadAsync(readFileSync(path));
const c = await zip.file(masterFile).async("string");

for (const id of ["5", "6", "7"]) {
  const re = new RegExp(`<Shape ID='${id}'[\\s\\S]*?</Shape>`);
  const s = c.match(re);
  if (!s) continue;
  console.log(`\n=== Shape ${id} ===`);
  const keys = ["PinX","PinY","Width","Height","LocPinX","LocPinY","Angle","TxtPinX","TxtPinY","TxtWidth","TxtHeight","TxtLocPinX","TxtLocPinY","FillForegnd"];
  for (const k of keys) {
    const re2 = new RegExp(`<Cell N='${k}' V='([^']+)'([^/]*)/>`);
    const m = s[0].match(re2);
    if (m) console.log(`  ${k}=${m[1]}  attrs=${m[2].trim()}`);
  }
  console.log("  -- Geometry --");
  const geos = [...s[0].matchAll(/<Section N='Geometry'[\s\S]*?<\/Section>/g)];
  geos.forEach((g, gi) => {
    const rows = [...g[0].matchAll(/<Row T='([^']+)' IX='[^']+'>([\s\S]*?)<\/Row>/g)];
    rows.forEach(r => {
      const xm = r[2].match(/<Cell N='X' V='([^']+)'/);
      const ym = r[2].match(/<Cell N='Y' V='([^']+)'/);
      console.log(`  G${gi} ${r[1]} X=${xm?.[1] ?? "?"} Y=${ym?.[1] ?? "?"}`);
    });
  });
}

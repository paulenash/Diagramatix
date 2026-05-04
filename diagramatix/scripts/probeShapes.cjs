const JSZip = require("jszip");
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
const ids = process.argv.slice(3);
if (!file || ids.length === 0) {
  console.error("usage: node probeShapes.cjs <vsdx> <id1> <id2> ...");
  process.exit(1);
}

(async () => {
  const buf = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(buf);
  const page1 = await zip.file("visio/pages/page1.xml").async("string");
  const mxml = await zip.file("visio/masters/masters.xml").async("string");
  const masters = new Map();
  const mre = /<Master\s+ID='(\d+)'[^>]*?NameU='([^']*)'/g;
  let mm;
  while ((mm = mre.exec(mxml)) !== null) masters.set(mm[1], mm[2]);

  for (const id of ids) {
    const re = new RegExp(`<Shape\\s+ID='${id}'`, "g");
    let m;
    let count = 0;
    while ((m = re.exec(page1)) !== null) {
      const start = m.index;
      let d = 1;
      const tre = /<(\/?)Shape(\s|>)/g;
      tre.lastIndex = page1.indexOf(">", start) + 1;
      let t;
      let end = page1.length;
      while ((t = tre.exec(page1)) !== null) {
        if (t[1] === "/") { d--; if (d === 0) { end = page1.indexOf(">", t.index) + 1; break; } }
        else d++;
      }
      const block = page1.slice(start, end);
      const masterId = block.match(/<Shape\s+ID='\d+'[^>]*Master='(\d+)'/)?.[1];
      const nameU    = block.match(/<Shape\s+ID='\d+'[^>]*NameU='([^']*)'/)?.[1];
      const w  = block.match(/<Cell N='Width' V='([\d.]+)'/)?.[1];
      const h  = block.match(/<Cell N='Height' V='([\d.]+)'/)?.[1];
      const px = block.match(/<Cell N='PinX' V='([\d.]+)'/)?.[1];
      const py = block.match(/<Cell N='PinY' V='([\d.]+)'/)?.[1];
      const text = (block.match(/<Text>([\s\S]*?)<\/Text>/)?.[1] || "")
        .replace(/<(?:cp|pp|tp|fld)[^>]*\/?>/g, "")
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 80);
      // Find this shape's parent shape ID by scanning back
      let parentId = "(none/top-level)";
      let depth = 0;
      const scanRe = /<(\/?)Shape\s+(?:ID='(\d+)'|[^>])/g;
      let s;
      let lastOpenBeforeStart = null;
      while ((s = scanRe.exec(page1)) !== null) {
        if (s.index >= start) break;
        if (s[1] === "/") depth--;
        else { depth++; if (s[2] && depth >= 1) lastOpenBeforeStart = { id: s[2], depth }; }
      }
      // Walk back to find the immediate ancestor open at depth = my-depth -1
      // (simpler: find all open shapes whose close hasn't fired by `start`)
      // For now, just record what we got
      console.log(`Shape ${id} (occ ${count+1}) @${start}:`);
      console.log(`    NameU=${nameU||'(none)'} Master=${masterId||'(none)'}/${masters.get(masterId)||'?'}`);
      console.log(`    W=${w} H=${h} Pin=(${px},${py}) text="${text}"`);
      count++;
      if (count >= 3) break;
    }
    if (count === 0) console.log(`Shape ${id}: NOT FOUND on page1`);
  }
})();

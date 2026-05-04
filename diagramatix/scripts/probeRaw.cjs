// Print the raw open tag of a shape ID at its first occurrence
const JSZip = require("jszip");
const fs = require("fs");
const file = process.argv[2];
const ids = process.argv.slice(3);
(async () => {
  const buf = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(buf);
  const page = await zip.file("visio/pages/page1.xml").async("string");
  for (const id of ids) {
    const re = new RegExp(`<Shape\\s+ID='${id}'[^>]*>`);
    const m = page.match(re);
    if (m) {
      console.log(`Shape ${id} open tag (${m[0].length} chars):`);
      console.log(`  ${m[0]}`);
    } else {
      console.log(`Shape ${id}: not found`);
    }
  }
  // Also find the shape whose text contains "Online Modules"
  const idx = page.indexOf("Online Modules");
  if (idx >= 0) {
    // Walk back to enclosing <Shape ID='N'>
    const re = /<Shape\s+ID='(\d+)'[^>]*>/g;
    let last = null;
    let mm;
    while ((mm = re.exec(page)) !== null && mm.index < idx) last = mm;
    if (last) {
      console.log();
      console.log(`Shape enclosing first "Online Modules" (id ${last[1]}):`);
      console.log(`  ${last[0]}`);
    }
  }
})();

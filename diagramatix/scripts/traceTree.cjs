// Print the full ancestor chain for given shape IDs.
const JSZip = require("jszip");
const fs = require("fs");

const file = process.argv[2];
const ids = process.argv.slice(3);
if (!file || ids.length === 0) {
  console.error("usage: node traceTree.cjs <vsdx> <id1> ...");
  process.exit(1);
}

(async () => {
  const buf = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(buf);
  const page = await zip.file("visio/pages/page1.xml").async("string");
  const mxml = await zip.file("visio/masters/masters.xml").async("string");
  const masters = new Map();
  const mre = /<Master\s+ID='(\d+)'[^>]*?NameU='([^']*)'/g;
  let mm;
  while ((mm = mre.exec(mxml)) !== null) masters.set(mm[1], mm[2]);

  // Walk the entire shape tree, recording each shape's parent + depth + cells.
  const innerMatch = page.match(/<Shapes>([\s\S]*?)<\/Shapes>(?=\s*(?:<Connects>|<\/PageContents>))/);
  if (!innerMatch) { console.error("no top <Shapes>"); return; }
  const inner = innerMatch[1];
  const tagRe = /<(\/?)Shape(\s|>)/g;
  const stack = [];
  const records = new Map();   // shapeId → { parentId, depth, openIdx, closeIdx }
  const order = [];
  let t;
  while ((t = tagRe.exec(inner)) !== null) {
    if (t[1] === "/") {
      const f = stack.pop();
      if (!f) continue;
      const close = inner.indexOf(">", t.index) + 1;
      const r = records.get(f.shapeId);
      if (r) r.closeIdx = close;
      continue;
    }
    const tagEnd = inner.indexOf(">", t.index) + 1;
    const open = inner.slice(t.index, tagEnd);
    const id = open.match(/ID='(\d+)'/)?.[1];
    const masterId = open.match(/Master='(\d+)'/)?.[1];
    const parentId = stack.length > 0 ? stack[stack.length - 1].shapeId : null;
    if (id) {
      records.set(id, { parentId, depth: stack.length, openIdx: t.index, closeIdx: -1, masterId });
      order.push(id);
      stack.push({ shapeId: id });
    }
  }

  for (const id of ids) {
    console.log(`\n=== Trace chain for shape ${id} ===`);
    let cur = id;
    while (cur) {
      const r = records.get(cur);
      if (!r) { console.log(`  ${cur}: NOT FOUND`); break; }
      const block = inner.slice(r.openIdx, r.closeIdx);
      const px = block.match(/<Cell N='PinX' V='([\d.]+)'/)?.[1];
      const py = block.match(/<Cell N='PinY' V='([\d.]+)'/)?.[1];
      const w  = block.match(/<Cell N='Width' V='([\d.]+)'/)?.[1];
      const h  = block.match(/<Cell N='Height' V='([\d.]+)'/)?.[1];
      const text = (block.match(/<Text>([\s\S]*?)<\/Text>/)?.[1] || "")
        .replace(/<(?:cp|pp|tp|fld)[^>]*\/?>/g, "")
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 50);
      const masterName = masters.get(r.masterId) || "(no master)";
      console.log(`  d${r.depth} ID=${cur} master=${r.masterId || '-'}/${masterName} Pin=(${px},${py}) W=${w} H=${h} text="${text}"`);
      cur = r.parentId;
    }
  }
})();

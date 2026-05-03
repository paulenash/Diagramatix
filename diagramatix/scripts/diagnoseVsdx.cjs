/**
 * Diagnose a .vsdx file's structure — what masters it carries, how many
 * shapes are on page 1 (top-level vs nested), and what NameU each
 * top-level shape resolves to.
 *
 * Use this when an import fails or skips most shapes. The output reveals
 * which masters are present and whether the import parser's NameU map
 * needs new entries, or whether the shape tree is deeply nested
 * (requiring recursion in the parser).
 *
 *   node scripts/diagnoseVsdx.cjs path/to/file.vsdx
 *
 * Output is printed to stdout — copy/paste into a chat or PR comment.
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/diagnoseVsdx.cjs <file.vsdx>");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);

  console.log(`=== ${path.basename(filePath)} (${(buf.length / 1024).toFixed(1)} KiB) ===\n`);

  // ── Masters ───────────────────────────────────────────────────────
  const mastersXml = await zip.file("visio/masters/masters.xml")?.async("string");
  if (!mastersXml) {
    console.log("No visio/masters/masters.xml — not a normal .vsdx?");
    return;
  }
  const masters = new Map();
  const mre = /<Master\s+ID='(\d+)'[^>]*?(?:NameU='([^']*)')?[^>]*>/g;
  let mm;
  while ((mm = mre.exec(mastersXml)) !== null) {
    masters.set(mm[1], mm[2] || "(no NameU)");
  }
  console.log(`Masters (${masters.size}):`);
  for (const [id, name] of [...masters].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${id.padStart(4)}  ${name}`);
  }
  console.log();

  // ── Pages ─────────────────────────────────────────────────────────
  const pagesXml = await zip.file("visio/pages/pages.xml")?.async("string");
  if (!pagesXml) {
    console.log("No visio/pages/pages.xml.");
    return;
  }
  const pageCount = (pagesXml.match(/<Page\s+ID='/g) ?? []).length;
  console.log(`Pages: ${pageCount}\n`);

  const pageRels = await zip.file("visio/pages/_rels/pages.xml.rels")?.async("string") || "";
  const firstPageRId = pagesXml.match(/<Page\s+ID='\d+'[\s\S]*?<Rel\s+r:id='(rId\d+)'/)?.[1];
  const firstPageFile = firstPageRId
    ? pageRels.match(new RegExp(`Id=["']${firstPageRId}["'][^>]*Target=["']([^"']+)["']`))?.[1] || "page1.xml"
    : "page1.xml";
  const pageXml = await zip.file(`visio/pages/${firstPageFile}`)?.async("string");
  if (!pageXml) {
    console.log(`Cannot read visio/pages/${firstPageFile}.`);
    return;
  }
  console.log(`First page: ${firstPageFile}`);

  // ── Shape tree on page 1: walk depth-first, count by depth ────────
  // Use a tag scanner that respects Shape open/close balance to compute
  // each Shape's depth in the page-level Shapes tree.
  const tagRe = /<(\/?)Shape(\s|>)/g;
  let depth = 0;
  let tag;
  let topLevel = 0;
  let nested = 0;
  /** @type {Array<{id: string, master: string, nameU: string, depth: number, hasText: boolean}>} */
  const samples = [];
  while ((tag = tagRe.exec(pageXml)) !== null) {
    if (tag[1] === "/") {
      depth--;
      continue;
    }
    if (depth === 0) topLevel++;
    else nested++;
    // Record details for the first ~20 shapes so the user can see what's there.
    if (samples.length < 30) {
      const openEnd = pageXml.indexOf(">", tag.index);
      const openTag = pageXml.slice(tag.index, openEnd + 1);
      const id = openTag.match(/ID='(\d+)'/)?.[1] ?? "?";
      const master = openTag.match(/Master='(\d+)'/)?.[1] ?? "(none)";
      const nameU = master !== "(none)" ? (masters.get(master) ?? "(unknown)") : "—";
      // Find the body of this shape up to its matching </Shape> to detect <Text>.
      // Cheap version: scan ahead for "<Text>" before "</Shape>" at this depth.
      const textIdx = pageXml.indexOf("<Text>", openEnd);
      const closeIdx = (() => {
        // Match a balanced </Shape> from here.
        let d = 1;
        const r = /<(\/?)Shape(\s|>)/g;
        r.lastIndex = openEnd + 1;
        let t;
        while ((t = r.exec(pageXml)) !== null) {
          if (t[1] === "/") {
            d--;
            if (d === 0) return t.index;
          } else d++;
        }
        return pageXml.length;
      })();
      const hasText = textIdx > 0 && textIdx < closeIdx;
      samples.push({ id, master, nameU, depth, hasText });
    }
    depth++;
  }
  console.log(`  Top-level shapes: ${topLevel}`);
  console.log(`  Nested shapes:    ${nested}`);
  console.log(`  Total:            ${topLevel + nested}\n`);

  console.log("First shapes (up to 30):");
  console.log("  shapeID  depth  master  hasText  NameU");
  for (const s of samples) {
    const indent = "  " + "·".repeat(s.depth) + (s.depth > 0 ? " " : "");
    console.log(
      `${indent}${s.id.padEnd(7)}  ${String(s.depth).padStart(2)}    ${s.master.padEnd(6)}  ${s.hasText ? "yes" : "no "}     ${s.nameU}`,
    );
  }
  console.log();

  // ── Connects ──────────────────────────────────────────────────────
  const connects = (pageXml.match(/<Connect\s+/g) ?? []).length;
  console.log(`Connect rows on first page: ${connects}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

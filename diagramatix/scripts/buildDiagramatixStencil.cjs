/**
 * One-shot rebrand + recolour of `public/bpmn-stencil-v3.vssx` →
 * `public/BPMN Diagramatix v1.0.vssx`.
 *
 * Steps:
 *   1. Relabel docProps so Visio shows "BPMN Diagramatix v1.0" instead
 *      of "BPMN Shapes" by Microsoft.
 *   2. Bake the Diagramatix default colour palette into each body-fill
 *      master so dragging a Task / Gateway / Event / etc. onto a Visio
 *      canvas produces a shape in Diagramatix's signature colour rather
 *      than the BPMN_M themed white.
 *
 * Colour-baking mirrors the runtime `bakeColourIntoMaster` in
 * exportVisioV3.ts (same shape-targeting rules: end-event Shape 9 only
 * because Shape 6 is the black outer ring; intermediate-event Shapes 6
 * AND 9; everything else Shape 6) plus a Pool-specific path for the
 * header sidebar (Shape 8's THEMEVAL FillColor).
 *
 * Run once. Commit the produced `.vssx` to public/.
 *
 *   node scripts/buildDiagramatixStencil.cjs
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const SRC = path.join(__dirname, "..", "public", "bpmn-stencil-v3.vssx");
const DST = path.join(__dirname, "..", "public", "BPMN Diagramatix v1.0.vssx");

// Mirrors DEFAULT_SYMBOL_COLORS in app/lib/diagram/colors.ts.
const COLOURS = {
  task:                "#fef9c3",
  gateway:             "#f3e8ff",
  "start-event":       "#dcfce7",
  "intermediate-event":"#fed7aa",
  "end-event":         "#fca5a5",
  subprocess:          "#fef08a",
  "subprocess-expanded":"#fef4a7",
  "data-object":       "#bfdbfe",
  "data-store":        "#60a5fa",
  pool:                "#c8956a",
};

// Master IDs in bpmn-stencil-v3.vssx (verified by inspecting the stencil).
const STENCIL_MASTERS = [
  { id: "2",  type: "task" },
  { id: "4",  type: "gateway" },
  { id: "5",  type: "intermediate-event" },
  { id: "6",  type: "end-event" },
  { id: "7",  type: "start-event" },
  { id: "8",  type: "subprocess" },
  { id: "9",  type: "subprocess-expanded" },
  { id: "15", type: "data-object" },
  { id: "16", type: "data-store" },
  { id: "18", type: "pool" },
];

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Port of `bakeColourIntoMaster` from exportVisioV3.ts. */
function bakeColourIntoMaster(content, colour, elType) {
  const { r, g, b } = hexToRgb(colour);
  const targetShapeIds =
    elType === "end-event" ? ["9"] :
    elType === "intermediate-event" ? ["6", "9"] :
    ["6"];
  const colourCell = `<Cell N='FillForegnd' V='${colour}' F='RGB(${r},${g},${b})'/>`;
  for (const targetShapeId of targetShapeIds) {
    const targetOpenRe = new RegExp(`<Shape ID='${targetShapeId}'[^>]*>`);
    const targetOpen = content.match(targetOpenRe);
    if (!targetOpen) continue;
    const shapeStart = targetOpen.index;
    const shapeOpenEnd = shapeStart + targetOpen[0].length;
    const nextShape = content.indexOf("<Shape ID=", shapeOpenEnd);
    const bodyEnd = nextShape === -1 ? content.length : nextShape;
    const bodyOriginal = content.slice(shapeOpenEnd, bodyEnd);
    const newOpen = targetOpen[0].replace(/FillStyle='\d+'/, "FillStyle='3'");
    let bodyNew = bodyOriginal.replace(
      /<Cell N='FillForegnd' V='[^']*' F='[^']*'\/>/g,
      colourCell,
    );
    if (!/<Cell N='FillForegnd'/.test(bodyNew)) {
      bodyNew =
        `<Cell N='FillForegnd' V='${colour}' F='RGB(${r},${g},${b})'/>` +
        `<Cell N='FillPattern' V='1' F='RGB(0,0,0)*0+1'/>` +
        bodyNew;
    }
    content = content.slice(0, shapeStart) + newOpen + bodyNew + content.slice(bodyEnd);
  }
  return content;
}

/** Pool-specific recolour: replace the last `THEMEVAL("FillColor",1)` cell
 *  (Shape 8 / sidebar header) with our pool colour. Mirrors the runtime
 *  pool-master code in exportVisioV3.ts:1830-1841. */
function bakePoolColour(content, colour) {
  const { r, g, b } = hexToRgb(colour);
  const target = `N='FillForegnd' V='1' F='THEMEVAL("FillColor",1)'`;
  const idx = content.lastIndexOf(target);
  if (idx < 0) return content;
  return (
    content.slice(0, idx) +
    `N='FillForegnd' V='${colour}' F='GUARD(RGB(${r},${g},${b}))'` +
    content.slice(idx + target.length)
  );
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`Source stencil not found: ${SRC}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(SRC);
  const zip = await JSZip.loadAsync(buf);

  // ── docProps: relabel ─────────────────────────────────────────────
  let core = await zip.file("docProps/core.xml").async("string");
  core = core
    .replace(/<dc:title>[^<]*<\/dc:title>/, "<dc:title>BPMN Diagramatix v1.0</dc:title>")
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, "<dc:creator>Diagramatix</dc:creator>")
    .replace(
      /<dc:description>[^<]*<\/dc:description>/,
      "<dc:description>BPMN shapes for Diagramatix — author or edit BPMN diagrams in Visio that import cleanly back into Diagramatix.</dc:description>",
    );
  zip.file("docProps/core.xml", core);

  let app = await zip.file("docProps/app.xml").async("string");
  app = app
    .replace(/<Application>[^<]*<\/Application>/, "<Application>Diagramatix</Application>")
    .replace(/<Company>[^<]*<\/Company>/, "<Company>Diagramatix</Company>")
    .replace(/<Manager>[^<]*<\/Manager>/, "<Manager>Diagramatix</Manager>")
    .replace(/<Template>[^<]*<\/Template>/, "<Template>BPMN Diagramatix v1.0.vssx</Template>");
  zip.file("docProps/app.xml", app);

  // ── Master colour bake ────────────────────────────────────────────
  const mastersXml = await zip.file("visio/masters/masters.xml").async("string");
  const relsXml =
    (await zip.file("visio/masters/_rels/masters.xml.rels").async("string")) || "";

  const recoloured = [];
  for (const m of STENCIL_MASTERS) {
    const block = mastersXml.match(new RegExp(`<Master\\s+ID='${m.id}'[\\s\\S]*?<\\/Master>`));
    if (!block) {
      console.warn(`Master ID ${m.id} (${m.type}) not in masters.xml — skipped.`);
      continue;
    }
    const rIdMatch = block[0].match(/<Rel\s+r:id='(rId\d+)'/);
    if (!rIdMatch) continue;
    const fileMatch = relsXml.match(
      new RegExp(`Id=["']${rIdMatch[1]}["'][^>]*Target=["']([^"']+)["']`),
    );
    if (!fileMatch) continue;
    const fileName = fileMatch[1];
    const masterPath = `visio/masters/${fileName}`;
    const file = zip.file(masterPath);
    if (!file) continue;

    let xml = await file.async("string");
    const colour = COLOURS[m.type];
    if (!colour) continue;
    if (m.type === "pool") {
      xml = bakePoolColour(xml, colour);
    } else {
      xml = bakeColourIntoMaster(xml, colour, m.type);
    }
    zip.file(masterPath, xml);
    recoloured.push(`${m.type} (${colour})`);
  }

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(DST, out);

  console.log(`Wrote ${DST} (${(out.length / 1024).toFixed(1)} KiB)`);
  console.log(`Recoloured ${recoloured.length} masters:`);
  for (const r of recoloured) console.log(`  · ${r}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

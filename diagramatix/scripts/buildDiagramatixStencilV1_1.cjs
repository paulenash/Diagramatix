/**
 * Build BPMN Diagramatix Shapes v1.1.vssx — incremental fixes over v1.0:
 *
 *   1. Cancel / Error / Conditional event marker visibility — these are
 *      drawn by Geometry sections on the EVENT MASTER ROOT (Shape 5)
 *      rather than dedicated marker sub-shapes. The runtime now emits
 *      a Geometry IX NoShow override on the instance for these (see
 *      ROOT_MARKER_IX_MAP in `exportVisioV3.ts`). No stencil change
 *      needed for runtime export — but for stencil DROP, the master's
 *      cached NoShow V remains '1' (hidden) until the Action.X.Checked
 *      formula re-evaluates. That's a Visio runtime concern; the
 *      stencil itself doesn't need the marker visible at drop time.
 *
 *   2. GUARD-wrap every coloured shape's FillForegnd formula. The v1.0
 *      bake left the formula as `RGB(...)` which lets the document
 *      theme override the cell-level fill. `GUARD(RGB(...))` locks
 *      the colour so Visio's theme machinery can't repaint a dropped
 *      gateway / event / data-object back to white-on-theme.
 *
 *   3. Bake the Data Store body (Master ID 16, file master14.xml,
 *      Shape 5 — the cylinder geometry). Master 16 has no Shape 6,
 *      so the v1.0 generic bake silently skipped it.
 *
 *   4. Resize the Gateway master (Master ID 4, master2.xml) to 40×40 px
 *      so dropping it produces a Diagramatix-sized diamond instead of
 *      Microsoft's 1×0.75 inch BPMN_M default.
 *
 *   5. Relabel docProps so the file shows "BPMN Diagramatix Shapes v1.1"
 *      in Visio's stencil pane.
 *
 * Source: public/BPMN Diagramatix v1.0.vssx (already coloured per v1.0).
 * Output: public/BPMN Diagramatix Shapes v1.1.vssx.
 *
 *   node scripts/buildDiagramatixStencilV1_1.cjs
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const SRC = path.join(__dirname, "..", "public", "BPMN Diagramatix v1.0.vssx");
const DST = path.join(__dirname, "..", "public", "BPMN Diagramatix Shapes v1.1.vssx");

// Mirrors DEFAULT_SYMBOL_COLORS in app/lib/diagram/colors.ts.
const COLOURS = {
  task:                 "#fef9c3",
  gateway:              "#f3e8ff",
  "start-event":        "#dcfce7",
  "intermediate-event": "#fed7aa",
  "end-event":          "#fca5a5",
  subprocess:           "#fef08a",
  "subprocess-expanded":"#fef4a7",
  "data-object":        "#bfdbfe",
  "data-store":         "#60a5fa",
  pool:                 "#c8956a",
};

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function guardCell(colour) {
  const { r, g, b } = hexToRgb(colour);
  return `<Cell N='FillForegnd' V='${colour}' F='GUARD(RGB(${r},${g},${b}))'/>`;
}

/** Force the FillForegnd of every targeted shape inside a master to a
 *  GUARD-wrapped RGB so the document theme can't repaint the cell. */
function guardWrapColour(content, shapeIds) {
  // Replace any existing FillForegnd cell in each target shape's body
  // with the GUARD-wrapped form. Match shape by ID; replace only the
  // FIRST FillForegnd inside the shape body (the body fill — leaves
  // marker / outline FillForegnd cells in nested sub-shapes alone).
  for (const { id, colour } of shapeIds) {
    const targetOpenRe = new RegExp(`<Shape ID='${id}'[^>]*>`);
    const openMatch = content.match(targetOpenRe);
    if (!openMatch) continue;
    const shapeStart = openMatch.index;
    const shapeOpenEnd = shapeStart + openMatch[0].length;
    const nextShape = content.indexOf("<Shape ID=", shapeOpenEnd);
    const bodyEnd = nextShape === -1 ? content.length : nextShape;
    const bodyOriginal = content.slice(shapeOpenEnd, bodyEnd);

    // FillStyle='3' on the opening tag — same as v1.0 bake; no theme
    // inheritance for the fill cell.
    const newOpen = openMatch[0].replace(/FillStyle='\d+'/, "FillStyle='3'");

    let bodyNew = bodyOriginal.replace(
      /<Cell N='FillForegnd' V='[^']*' F='[^']*'\/>/,
      guardCell(colour),
    );
    if (!/<Cell N='FillForegnd'/.test(bodyNew)) {
      bodyNew =
        guardCell(colour) +
        `<Cell N='FillPattern' V='1' F='GUARD(1)'/>` +
        bodyNew;
    }
    content = content.slice(0, shapeStart) + newOpen + bodyNew + content.slice(bodyEnd);
  }
  return content;
}

/** Resize the Gateway master to 40×40 px (= 0.41666… inch at 96 dpi).
 *  Updates User.DefaultWidth, User.DefaultHeight, the root Shape 5's
 *  Width/Height cached V (formula uses inches × 25.4 MM), and the
 *  ResizeTxtHeight floor so a label can't push the shape past 40 px. */
function resizeGateway(content) {
  const SIZE = 40 / 96; // = 0.4166666666666667 inch

  // 1. User.DefaultWidth / User.DefaultHeight — affect the drop size.
  content = content.replace(
    /<Row N='DefaultWidth'><Cell N='Value' V='[^']*' U='MM' F='[^']*'\/>/,
    `<Row N='DefaultWidth'><Cell N='Value' V='${SIZE}' U='MM' F='${SIZE}*25.4MM*DropOnPageScale'/>`,
  );
  content = content.replace(
    /<Row N='DefaultHeight'><Cell N='Value' V='[^']*' U='MM' F='[^']*'\/>/,
    `<Row N='DefaultHeight'><Cell N='Value' V='${SIZE}' U='MM' F='${SIZE}*25.4MM*DropOnPageScale'/>`,
  );
  // ResizeTxtHeight floors at User.DefaultHeight, so updating Default is
  // enough — but also reset the cached V so first paint uses the new size.
  content = content.replace(
    /<Row N='ResizeTxtHeight'><Cell N='Value' V='[^']*'/,
    `<Row N='ResizeTxtHeight'><Cell N='Value' V='${SIZE}'`,
  );

  // 2. Root Shape 5 Width / Height cached values + formulas.
  // Master format: `<Cell N='Width' V='1' U='MM' F='1*25.4MM'/>`.
  content = content.replace(
    /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='Width' V=')[^']*(' U='MM' F=')[^']*('\/>)/,
    `$1${SIZE}$2${SIZE}*25.4MM$3`,
  );
  content = content.replace(
    /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='Height' V=')[^']*(' U='MM' F=')[^']*('\/>)/,
    `$1${SIZE}$2User.ResizeTxtHeight$3`,
  );
  // Root LocPin = Width*0.5 / Height*0.5; cached V needs updating too.
  content = content.replace(
    /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='LocPinX' V=')[^']*(' U='MM' F='Width\*0\.5'\/>)/,
    `$1${SIZE / 2}$2`,
  );
  content = content.replace(
    /(<Shape ID='5'[^>]*>[\s\S]*?<Cell N='LocPinY' V=')[^']*(' U='MM' F='Height\*0\.5'\/>)/,
    `$1${SIZE / 2}$2`,
  );
  return content;
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`Source stencil not found: ${SRC}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(SRC);
  const zip = await JSZip.loadAsync(buf);

  // ── docProps: relabel ────────────────────────────────────────────
  let core = await zip.file("docProps/core.xml").async("string");
  core = core
    .replace(/<dc:title>[^<]*<\/dc:title>/, "<dc:title>BPMN Diagramatix Shapes v1.1</dc:title>")
    .replace(
      /<dc:description>[^<]*<\/dc:description>/,
      "<dc:description>BPMN shapes for Diagramatix v1.1 — author or edit BPMN diagrams in Visio that import cleanly back into Diagramatix.</dc:description>",
    );
  zip.file("docProps/core.xml", core);

  let app = await zip.file("docProps/app.xml").async("string");
  app = app.replace(
    /<Template>[^<]*<\/Template>/,
    "<Template>BPMN Diagramatix Shapes v1.1.vssx</Template>",
  );
  zip.file("docProps/app.xml", app);

  // ── Master colour bake (GUARD-wrapped) + Gateway resize ─────────────
  const mastersXml = await zip.file("visio/masters/masters.xml").async("string");
  const relsXml = await zip.file("visio/masters/_rels/masters.xml.rels").async("string");

  // Master ID → element type, target Shape ID(s) to recolour.
  // Shape IDs verified by inspecting the actual master*.xml files in v1.0.
  // - Most masters have a Shape 6 (body fill).
  // - End-event has Shape 9 (inner ring); Shape 6 is the BLACK outer ring.
  // - Intermediate-event has Shape 6 AND Shape 9 (concentric rings).
  // - Data Store has only Shape 5 (the cylinder geometry).
  // - Pool / Lane is handled by the existing Shape 8 THEMEVAL bake.
  const STENCIL_MASTERS = [
    { id: "2",  type: "task",                 shapes: ["6"] },
    { id: "4",  type: "gateway",              shapes: ["6"] },
    { id: "5",  type: "intermediate-event",   shapes: ["6", "9"] },
    { id: "6",  type: "end-event",            shapes: ["9"] },
    { id: "7",  type: "start-event",          shapes: ["6"] },
    { id: "8",  type: "subprocess",           shapes: ["6"] },
    { id: "9",  type: "subprocess-expanded",  shapes: ["6"] },
    { id: "15", type: "data-object",          shapes: ["6"] },
    { id: "16", type: "data-store",           shapes: ["5"] }, // Shape 5: the cylinder
  ];

  const recoloured = [];
  for (const m of STENCIL_MASTERS) {
    const block = mastersXml.match(new RegExp(`<Master\\s+ID='${m.id}'[\\s\\S]*?<\\/Master>`));
    if (!block) {
      console.warn(`Master ID ${m.id} (${m.type}) not in masters.xml — skipped.`);
      continue;
    }
    const rIdMatch = block[0].match(/<Rel\s+r:id='(rId\d+)'/);
    if (!rIdMatch) continue;
    const fileMatch = relsXml.match(new RegExp(`Id=["']${rIdMatch[1]}["'][^>]*Target=["']([^"']+)["']`));
    if (!fileMatch) continue;
    const masterPath = `visio/masters/${fileMatch[1]}`;
    const file = zip.file(masterPath);
    if (!file) continue;

    let xml = await file.async("string");
    const colour = COLOURS[m.type];
    if (!colour) continue;

    // Guard-wrap the fill on every target shape in this master.
    xml = guardWrapColour(xml, m.shapes.map((id) => ({ id, colour })));

    // Gateway master: resize to 40×40 px (Diagramatix dimensions).
    if (m.type === "gateway") {
      xml = resizeGateway(xml);
    }

    zip.file(masterPath, xml);
    recoloured.push(`${m.type} (${colour}) shapes [${m.shapes.join(",")}]`);
  }

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(DST, out);

  console.log(`Wrote ${DST} (${(out.length / 1024).toFixed(1)} KiB)`);
  console.log(`Updated ${recoloured.length} masters:`);
  for (const r of recoloured) console.log(`  · ${r}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

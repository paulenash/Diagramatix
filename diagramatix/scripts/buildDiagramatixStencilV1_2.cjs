/**
 * Build BPMN Diagramatix Shapes v1.2.vssx — incremental fixes over v1.1:
 *
 *   1. Cancel marker geometry on the intermediate / end / start event
 *      masters (master3, master4, master5) — Geometry IX='1'. The
 *      original BPMN_M coordinates produce a non-symmetric X. Replace
 *      with the 12-vertex symmetric X used by Diagramatix's runtime
 *      Cancel renderer (see SymbolRenderer.tsx case "cancel").
 *      Coordinates centred at (Width*0.5, Height*0.5) with half-extent
 *      cs = 0.255 (= 0.5 - 0.245, matches the original X's bounding box).
 *
 *   2. Body fill that survives Visio's theme inheritance for shapes
 *      whose v1.1 GUARD-wrapped fill still rendered as white when
 *      dragged from the stencil. Strategy:
 *        a. Set FillStyle='0' on the body shape's opening tag (No Style)
 *           so the cell-level FillForegnd is the only source — nothing
 *           inherits from the document's Theme style chain.
 *        b. Also write FillBkgnd / FillForegndTrans so the BPMN_M
 *           template's themed background can't peek through the solid
 *           fill (Visio's pattern 1 is solid foreground, but some
 *           themed brushes draw both foreground and background).
 *
 *   3. Source: public/BPMN Diagramatix Shapes v1.1.vssx.
 *      Output: public/BPMN Diagramatix Shapes v1.2.vssx.
 *
 *   node scripts/buildDiagramatixStencilV1_2.cjs
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const SRC = path.join(__dirname, "..", "public", "BPMN Diagramatix Shapes v1.1.vssx");
const DST = path.join(__dirname, "..", "public", "BPMN Diagramatix Shapes v1.2.vssx");

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
};

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function fillCells(colour) {
  const { r, g, b } = hexToRgb(colour);
  // FillStyle='0' on the OPENING tag of the body shape forces No Style
  // — nothing inherits from the document's Theme chain. Cell-level
  // FillForegnd is the only fill source.
  return (
    `<Cell N='FillForegnd' V='${colour}' F='GUARD(RGB(${r},${g},${b}))'/>` +
    `<Cell N='FillBkgnd' V='${colour}' F='GUARD(RGB(${r},${g},${b}))'/>` +
    `<Cell N='FillPattern' V='1' F='GUARD(1)'/>` +
    `<Cell N='FillForegndTrans' V='0' F='GUARD(0)'/>` +
    `<Cell N='FillBkgndTrans' V='0' F='GUARD(0)'/>`
  );
}

/** Replace every targeted shape's FILL block with a fresh fillCells()
 *  using FillStyle='0' on the opening so the cell-level fill wins. */
function bakeBodyFill(content, shapeIds, colour) {
  for (const id of shapeIds) {
    const targetOpenRe = new RegExp(`<Shape ID='${id}'[^>]*>`);
    const openMatch = content.match(targetOpenRe);
    if (!openMatch) continue;
    const shapeStart = openMatch.index;
    const shapeOpenEnd = shapeStart + openMatch[0].length;
    const nextShape = content.indexOf("<Shape ID=", shapeOpenEnd);
    const bodyEnd = nextShape === -1 ? content.length : nextShape;
    const bodyOriginal = content.slice(shapeOpenEnd, bodyEnd);

    // FillStyle='0' = No Style — breaks the Theme inheritance chain.
    const newOpen = openMatch[0].replace(/FillStyle='\d+'/, "FillStyle='0'");

    // Strip every existing fill cell so our fresh block is the
    // authoritative source.
    let bodyNew = bodyOriginal
      .replace(/<Cell N='FillForegnd' V='[^']*' F='[^']*'\/>/g, "")
      .replace(/<Cell N='FillBkgnd' V='[^']*' F='[^']*'\/>/g, "")
      .replace(/<Cell N='FillPattern' V='[^']*' F='[^']*'\/>/g, "")
      .replace(/<Cell N='FillForegndTrans' V='[^']*' F='[^']*'\/>/g, "")
      .replace(/<Cell N='FillBkgndTrans' V='[^']*' F='[^']*'\/>/g, "");
    bodyNew = fillCells(colour) + bodyNew;

    content = content.slice(0, shapeStart) + newOpen + bodyNew + content.slice(bodyEnd);
  }
  return content;
}

/** Symmetric 12-vertex X polygon in master fractional coords, centred
 *  at (0.5, 0.5) with half-extent `cs`. Mirrors Diagramatix's runtime
 *  Cancel marker (SymbolRenderer.tsx case "cancel"). Vertices are
 *  enumerated clockwise starting at the top inner notch.
 *
 *  Y is inverted compared with screen coords: Visio uses bottom-up Y,
 *  so vertex 1 (top inner notch) has the LARGEST Y value. */
function buildCancelXGeometry(cs, masterW, masterH) {
  const c = 0.5;
  const verts = [
    { x: c,            y: c + 0.3 * cs },  // top inner notch
    { x: c + 0.7 * cs, y: c + cs },        // top-right tip
    { x: c + cs,       y: c + 0.7 * cs },  // top-right outer notch
    { x: c + 0.3 * cs, y: c },             // right inner notch
    { x: c + cs,       y: c - 0.7 * cs },  // bottom-right outer notch
    { x: c + 0.7 * cs, y: c - cs },        // bottom-right tip
    { x: c,            y: c - 0.3 * cs },  // bottom inner notch
    { x: c - 0.7 * cs, y: c - cs },        // bottom-left tip
    { x: c - cs,       y: c - 0.7 * cs },  // bottom-left outer notch
    { x: c - 0.3 * cs, y: c },             // left inner notch
    { x: c - cs,       y: c + 0.7 * cs },  // top-left outer notch
    { x: c - 0.7 * cs, y: c + cs },        // top-left tip
  ];
  // Cell V=cached; F=formula. V uses the master's current W/H in inches.
  const rows = verts.map((v, i) => {
    const tag = i === 0 ? "MoveTo" : "LineTo";
    return (
      `<Row T='${tag}' IX='${i + 1}'>` +
      `<Cell N='X' V='${(v.x * masterW).toFixed(7)}' F='Width*${v.x.toFixed(4)}'/>` +
      `<Cell N='Y' V='${(v.y * masterH).toFixed(7)}' F='Height*${v.y.toFixed(4)}'/>` +
      `</Row>`
    );
  });
  return rows.join("");
}

/** Replace the existing Cancel marker (Geometry IX='1') in an event
 *  master with a regular symmetric X. Preserves NoFill / NoLine / NoShow
 *  cells so the marker's visibility logic still triggers off
 *  Actions.Cancel.Checked. */
function fixCancelMarker(content, masterW, masterH) {
  const cs = 0.255; // matches the original X's half-extent (0.5 - 0.245)
  // Find the Cancel Geometry section by its NoShow formula signature.
  const re = /<Section N='Geometry' IX='1'[^>]*>([\s\S]*?)<\/Section>/;
  const m = content.match(re);
  if (!m) return content;
  if (!m[1].includes("Actions.Cancel.Checked")) return content; // wrong section
  const noFill   = m[1].match(/<Cell N='NoFill'[^/]*\/>/)?.[0] ?? "<Cell N='NoFill' V='0'/>";
  const noLine   = m[1].match(/<Cell N='NoLine'[^/]*\/>/)?.[0] ?? "<Cell N='NoLine' V='0'/>";
  const noShow   = m[1].match(/<Cell N='NoShow'[^/]*\/>/)?.[0] ?? "<Cell N='NoShow' V='1'/>";
  const noSnap   = m[1].match(/<Cell N='NoSnap'[^/]*\/>/)?.[0] ?? "<Cell N='NoSnap' V='0'/>";
  const noQDrag  = m[1].match(/<Cell N='NoQuickDrag'[^/]*\/>/)?.[0] ?? "<Cell N='NoQuickDrag' V='0' F='No Formula'/>";
  const newGeom =
    `<Section N='Geometry' IX='1'>` +
    noFill + noLine + noShow + noSnap + noQDrag +
    buildCancelXGeometry(cs, masterW, masterH) +
    `</Section>`;
  return content.replace(re, newGeom);
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
  core = core.replace(
    /<dc:title>[^<]*<\/dc:title>/,
    "<dc:title>BPMN Diagramatix Shapes v1.2</dc:title>",
  );
  zip.file("docProps/core.xml", core);

  let app = await zip.file("docProps/app.xml").async("string");
  app = app.replace(
    /<Template>[^<]*<\/Template>/,
    "<Template>BPMN Diagramatix Shapes v1.2.vssx</Template>",
  );
  zip.file("docProps/app.xml", app);

  // ── Body fill: theme-proof bake + Cancel marker fix ─────────────
  const mastersXml = await zip.file("visio/masters/masters.xml").async("string");
  const relsXml = await zip.file("visio/masters/_rels/masters.xml.rels").async("string");

  const STENCIL_MASTERS = [
    { id: "2",  type: "task",                shapes: ["6"], cancelFix: false },
    { id: "4",  type: "gateway",             shapes: ["6"], cancelFix: false },
    { id: "5",  type: "intermediate-event",  shapes: ["6", "9"], cancelFix: true,  W: 0.3125, H: 0.3125 },
    { id: "6",  type: "end-event",           shapes: ["9"],      cancelFix: true,  W: 0.3125, H: 0.3125 },
    { id: "7",  type: "start-event",         shapes: ["6"],      cancelFix: true,  W: 0.3125, H: 0.3125 },
    { id: "8",  type: "subprocess",          shapes: ["6"], cancelFix: false },
    { id: "9",  type: "subprocess-expanded", shapes: ["6"], cancelFix: false },
    { id: "15", type: "data-object",         shapes: ["6"], cancelFix: false },
    { id: "16", type: "data-store",          shapes: ["5"], cancelFix: false },
  ];

  const updated = [];
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
    if (colour) {
      xml = bakeBodyFill(xml, m.shapes, colour);
    }
    if (m.cancelFix) {
      xml = fixCancelMarker(xml, m.W, m.H);
    }
    zip.file(masterPath, xml);
    updated.push(`${m.type} (${colour}) shapes [${m.shapes.join(",")}]${m.cancelFix ? " + Cancel-X fix" : ""}`);
  }

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(DST, out);

  console.log(`Wrote ${DST} (${(out.length / 1024).toFixed(1)} KiB)`);
  console.log(`Updated ${updated.length} masters:`);
  for (const u of updated) console.log(`  · ${u}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

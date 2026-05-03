/**
 * One-shot rebrand of `public/bpmn-stencil-v3.vssx` →
 * `public/BPMN Diagramatix v1.0.vssx`.
 *
 * The internal V3 stencil is structurally already what we want for
 * end-user authoring (21 BPMN masters, canonical NameU strings that the
 * import parser recognises). We only need to relabel `docProps/*.xml`
 * so Visio displays "BPMN Diagramatix v1.0" as the stencil's title
 * instead of "BPMN Shapes" by Microsoft.
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

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`Source stencil not found: ${SRC}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(SRC);
  const zip = await JSZip.loadAsync(buf);

  // ── docProps/core.xml: replace title and creator ───────────────────
  let core = await zip.file("docProps/core.xml").async("string");
  core = core
    .replace(/<dc:title>[^<]*<\/dc:title>/, "<dc:title>BPMN Diagramatix v1.0</dc:title>")
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, "<dc:creator>Diagramatix</dc:creator>")
    .replace(
      /<dc:description>[^<]*<\/dc:description>/,
      "<dc:description>BPMN shapes for Diagramatix — author or edit BPMN diagrams in Visio that import cleanly back into Diagramatix.</dc:description>",
    );
  zip.file("docProps/core.xml", core);

  // ── docProps/app.xml: branded Application/Company ─────────────────
  let app = await zip.file("docProps/app.xml").async("string");
  app = app
    .replace(/<Application>[^<]*<\/Application>/, "<Application>Diagramatix</Application>")
    .replace(/<Company>[^<]*<\/Company>/, "<Company>Diagramatix</Company>")
    .replace(/<Manager>[^<]*<\/Manager>/, "<Manager>Diagramatix</Manager>")
    .replace(/<Template>[^<]*<\/Template>/, "<Template>BPMN Diagramatix v1.0.vssx</Template>");
  zip.file("docProps/app.xml", app);

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(DST, out);

  console.log(`Wrote ${DST} (${(out.length / 1024).toFixed(1)} KiB)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

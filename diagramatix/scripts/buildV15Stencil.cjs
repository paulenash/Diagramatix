/**
 * V1.5 stencil build step — derive a "BPMN Diagramatix Shapes v1.5.vssx"
 * from the v1.4 file by extending the Data Object master with a right-
 * click Type chooser (None / Input / Output) and a second marker shape
 * (Output) to match the existing Input marker.
 *
 * Pattern follows the existing Task master in v1.4 which uses a parent
 * Action row as a fly-out menu header plus FlyoutChild='1' rows for each
 * option. Each option's Action SETF rewrites a property cell, its
 * Checked formula shows the tick mark when the property currently
 * matches that option, and per-marker NoShow formulas read the same
 * property to show / hide markers.
 *
 * Idempotent — re-running just rewrites the same cells.
 *
 * Run from the diagramatix directory:
 *   node scripts/buildV15Stencil.cjs
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const JSZip = require("jszip");

function freshGuid() {
  return `{${crypto.randomUUID().toUpperCase()}}`;
}

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const SRC_PATH = path.join(PUBLIC_DIR, "BPMN Diagramatix Shapes v1.4.vssx");
const DST_PATH = path.join(PUBLIC_DIR, "BPMN Diagramatix Shapes v1.5.vssx");

// ── Data Object master payload patches ──────────────────────────────────

// Replace the existing `BpmnRole` property row with a formatted enum:
//   Format "None;Input;Output", Type=1 (formatted), default "None".
// The Action chooser below writes one of those three literal strings to
// this cell. Marker shapes read it to decide visibility.
const NEW_BPMN_ROLE_ROW =
  `<Row N='BpmnRole'>` +
  `<Cell N='Value' V='None' U='STR'/>` +
  `<Cell N='Prompt' V=''/>` +
  `<Cell N='Label' V='Data Object Type'/>` +
  `<Cell N='Format' V='None;Input;Output'/>` +
  `<Cell N='SortKey' V=''/>` +
  `<Cell N='Type' V='1'/>` +
  `<Cell N='Invisible' V='0'/>` +
  `<Cell N='Verify' V='0'/>` +
  `<Cell N='DataLinked' V='0' F='No Formula'/>` +
  `<Cell N='LangID' V='en-US'/>` +
  `<Cell N='Calendar' V='0'/>` +
  `</Row>`;

// Right-click menu rows: header + three FlyoutChild options.
// Mirrors the Task master's `TriggerResult` / `NoTaskType` / `Service` /
// etc. pattern — the parent row has Action='No Formula' and serves as a
// menu header; the children carry SortKey='DT1','DT2','DT3' so Visio
// orders them after the parent (SortKey='DT0').
const NEW_ACTION_ROWS =
  // Parent: "Data Object Type" header (groups the three child rows)
  `<Row N='DataObjectType'>` +
    `<Cell N='Menu' V='&amp;Data Object Type'/>` +
    `<Cell N='Action' V='0' F='No Formula'/>` +
    `<Cell N='Checked' V='0'/>` +
    `<Cell N='Disabled' V='0'/>` +
    `<Cell N='ReadOnly' V='0'/>` +
    `<Cell N='Invisible' V='0'/>` +
    `<Cell N='BeginGroup' V='1'/>` +
    `<Cell N='FlyoutChild' V='0'/>` +
    `<Cell N='TagName' V=''/>` +
    `<Cell N='ButtonFace' V=''/>` +
    `<Cell N='SortKey' V='DT0'/>` +
  `</Row>` +
  // Child: None — index 0 in the BpmnRole format
  `<Row N='DataObjectNone'>` +
    `<Cell N='Menu' V='&amp;None'/>` +
    `<Cell N='Action' V='0' F='SETF(GetRef(Prop.BpmnRole),"INDEX(0,Prop.BpmnRole.Format)")'/>` +
    `<Cell N='Checked' V='1' F='STRSAME(Prop.BpmnRole,INDEX(0,Prop.BpmnRole.Format))'/>` +
    `<Cell N='Disabled' V='0'/>` +
    `<Cell N='ReadOnly' V='0'/>` +
    `<Cell N='Invisible' V='0'/>` +
    `<Cell N='BeginGroup' V='0'/>` +
    `<Cell N='FlyoutChild' V='1'/>` +
    `<Cell N='TagName' V=''/>` +
    `<Cell N='ButtonFace' V=''/>` +
    `<Cell N='SortKey' V='DT1'/>` +
  `</Row>` +
  // Child: Input — index 1
  `<Row N='DataObjectInput'>` +
    `<Cell N='Menu' V='&amp;Input'/>` +
    `<Cell N='Action' V='0' F='SETF(GetRef(Prop.BpmnRole),"INDEX(1,Prop.BpmnRole.Format)")'/>` +
    `<Cell N='Checked' V='0' F='STRSAME(Prop.BpmnRole,INDEX(1,Prop.BpmnRole.Format))'/>` +
    `<Cell N='Disabled' V='0'/>` +
    `<Cell N='ReadOnly' V='0'/>` +
    `<Cell N='Invisible' V='0'/>` +
    `<Cell N='BeginGroup' V='0'/>` +
    `<Cell N='FlyoutChild' V='1'/>` +
    `<Cell N='TagName' V=''/>` +
    `<Cell N='ButtonFace' V=''/>` +
    `<Cell N='SortKey' V='DT2'/>` +
  `</Row>` +
  // Child: Output — index 2
  `<Row N='DataObjectOutput'>` +
    `<Cell N='Menu' V='&amp;Output'/>` +
    `<Cell N='Action' V='0' F='SETF(GetRef(Prop.BpmnRole),"INDEX(2,Prop.BpmnRole.Format)")'/>` +
    `<Cell N='Checked' V='0' F='STRSAME(Prop.BpmnRole,INDEX(2,Prop.BpmnRole.Format))'/>` +
    `<Cell N='Disabled' V='0'/>` +
    `<Cell N='ReadOnly' V='0'/>` +
    `<Cell N='Invisible' V='0'/>` +
    `<Cell N='BeginGroup' V='0'/>` +
    `<Cell N='FlyoutChild' V='1'/>` +
    `<Cell N='TagName' V=''/>` +
    `<Cell N='ButtonFace' V=''/>` +
    `<Cell N='SortKey' V='DT3'/>` +
  `</Row>`;

// Shape 9 — Output marker: same geometry as the existing Shape 8 (Input
// marker) but with NoFill=0 and FillForegnd=#374151 to render as a filled
// arrow (BPMN 2.0 convention: clear arrow = input, filled = output).
// NoShow formula reads Sheet.5!Prop.BpmnRole; visible only when "Output".
// Initial V='1' so first paint is correct before the formula evaluates.
const SHAPE_9_OUTPUT_MARKER =
  `<Shape ID='9' Type='Shape' LineStyle='3' FillStyle='3' TextStyle='3'>` +
  `<Cell N='PinX' V='0.086375' F='Sheet.5!Width*0.23033333333333'/>` +
  `<Cell N='PinY' V='0.394375' F='Sheet.5!Height*0.82304347826087'/>` +
  `<Cell N='Width' V='0.11025' F='Sheet.5!Width*0.294'/>` +
  `<Cell N='Height' V='0.08625' F='Sheet.5!Height*0.18'/>` +
  `<Cell N='LocPinX' V='0.055125' F='Width*0.5'/>` +
  `<Cell N='LocPinY' V='0.043125' F='Height*0.5'/>` +
  `<Cell N='Angle' V='0'/>` +
  `<Cell N='FlipX' V='0' F='No Formula'/>` +
  `<Cell N='FlipY' V='0' F='No Formula'/>` +
  `<Cell N='ResizeMode' V='0' F='No Formula'/>` +
  `<Cell N='LayerMember' V=''/>` +
  `<Cell N='LineWeight' V='0.0166' U='PT'/>` +
  `<Cell N='LineColor' V='#374151' F='GUARD(RGB(55,65,81))'/>` +
  `<Cell N='LinePattern' V='1' F='GUARD(1)'/>` +
  `<Cell N='FillForegnd' V='#374151' F='GUARD(RGB(55,65,81))'/>` +
  `<Cell N='FillPattern' V='1' F='GUARD(1)'/>` +
  `<Section N='Geometry' IX='0'>` +
  `<Cell N='NoFill' V='0'/>` +
  `<Cell N='NoLine' V='0'/>` +
  `<Cell N='NoShow' V='1' F='NOT(STRSAME(Sheet.5!Prop.BpmnRole,"Output"))'/>` +
  `<Cell N='NoSnap' V='0'/>` +
  `<Cell N='NoQuickDrag' V='0'/>` +
  `<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0.05821875'/></Row>` +
  `<Row T='LineTo' IX='2'><Cell N='X' V='0.03675'/><Cell N='Y' V='0.05821875'/></Row>` +
  `<Row T='LineTo' IX='3'><Cell N='X' V='0.03675'/><Cell N='Y' V='0.08625'/></Row>` +
  `<Row T='LineTo' IX='4'><Cell N='X' V='0.11025'/><Cell N='Y' V='0.043125'/></Row>` +
  `<Row T='LineTo' IX='5'><Cell N='X' V='0.03675'/><Cell N='Y' V='0'/></Row>` +
  `<Row T='LineTo' IX='6'><Cell N='X' V='0.03675'/><Cell N='Y' V='0.02803125'/></Row>` +
  `<Row T='LineTo' IX='7'><Cell N='X' V='0'/><Cell N='Y' V='0.02803125'/></Row>` +
  `<Row T='LineTo' IX='8'><Cell N='X' V='0'/><Cell N='Y' V='0.05821875'/></Row>` +
  `</Section>` +
  `</Shape>`;

(async () => {
  console.log("Reading", SRC_PATH);
  const buf = fs.readFileSync(SRC_PATH);
  const zip = await JSZip.loadAsync(buf);

  // ── Locate Data Object's master file via masters.xml ──
  const mastersXml = await zip.file("visio/masters/masters.xml").async("string");
  const mastersRels = await zip.file("visio/masters/_rels/masters.xml.rels").async("string");
  const dataObjMatch = mastersXml.match(
    /<Master\s+ID='(\d+)'[^>]*?NameU='Data Object'[\s\S]*?<Rel\s+r:id='(rId\d+)'/,
  );
  if (!dataObjMatch) throw new Error("Data Object master not found in v1.4 stencil");
  const dataObjId = dataObjMatch[1];
  const dataObjRId = dataObjMatch[2];
  const relMatch = mastersRels.match(new RegExp(`Id=["']${dataObjRId}["'][^>]*Target=["']([^"']+)["']`));
  if (!relMatch) throw new Error("Data Object master rel target not found");
  const dataObjFile = `visio/masters/${relMatch[1]}`;
  console.log(`Data Object → master ID ${dataObjId}, file ${dataObjFile}`);

  // ── Patch the master XML ──
  let content = await zip.file(dataObjFile).async("string");

  // 1. Replace the existing BpmnRole row with the formatted-enum version
  const beforeRoleRow = content;
  content = content.replace(/<Row\s+N='BpmnRole'>[\s\S]*?<\/Row>/, NEW_BPMN_ROLE_ROW);
  if (content === beforeRoleRow) {
    console.warn("  ⚠ BpmnRole row not found — inserting new one before </Section> in Property");
    content = content.replace(
      /(<Section\s+N='Property'>[\s\S]*?)(<\/Section>)/,
      `$1${NEW_BPMN_ROLE_ROW}$2`,
    );
  } else {
    console.log("  ✓ BpmnRole row replaced with formatted-enum version");
  }

  // 2. Inject the four action rows at the top of the Actions section
  //    (just after the opening `<Section N='Actions'>` tag).
  const beforeActions = content;
  content = content.replace(
    /(<Section\s+N='Actions'>)/,
    `$1${NEW_ACTION_ROWS}`,
  );
  if (content === beforeActions) {
    throw new Error("Could not find Actions section to inject menu rows");
  }
  console.log("  ✓ Right-click menu rows injected (None / Input / Output)");

  // 3. Make Shape 8 (existing Input marker) conditional on BpmnRole='Input'
  //    Original cell is `<Cell N='NoShow' V='0'/>` with no formula.
  //    The replacement scopes Shape 8's body to the section between the
  //    Shape 8 open tag and the next `<Shape ID='` (or the end).
  const beforeShape8 = content;
  // Use a narrowly-targeted replace: find the FIRST NoShow=V='0'/> after
  // the Shape 8 opening tag and rewrite it. Shape 8's Geometry section
  // is the first child cell-section after the body cells.
  content = content.replace(
    /(<Shape\s+ID='8'[\s\S]*?<Section\s+N='Geometry'\s+IX='0'>[\s\S]*?<Cell\s+N='NoLine'\s+V='0'\/>)<Cell\s+N='NoShow'\s+V='0'\/>/,
    `$1<Cell N='NoShow' V='1' F='NOT(STRSAME(Sheet.5!Prop.BpmnRole,"Input"))'/>`,
  );
  if (content === beforeShape8) {
    throw new Error("Could not patch Shape 8 NoShow cell");
  }
  console.log("  ✓ Shape 8 (Input marker) now hidden unless BpmnRole='Input'");

  // 4. Inject Shape 9 (new Output marker) right before the Shape 5 group's
  //    inner `</Shapes>` (which lives just before the `</Shape>` that
  //    closes Shape 5 itself). The master file structure ends with:
  //      ... </Shape></Shapes></Shape></Shapes></MasterContents>
  //    (Two </Shapes>: inner closes Shape 5's children, outer closes
  //    the MasterContents top-level Shapes collection.) We insert before
  //    the FIRST </Shapes> so Shape 9 becomes the last child of Shape 5.
  const beforeShape9 = content;
  content = content.replace(
    /(<\/Shape>)(<\/Shapes><\/Shape><\/Shapes><\/MasterContents>)/,
    `$1${SHAPE_9_OUTPUT_MARKER}$2`,
  );
  if (content === beforeShape9) {
    throw new Error("Could not find insertion point for Shape 9");
  }
  console.log("  ✓ Shape 9 (Output marker) appended");

  // 5. Bump the master's BaseID / UniqueID so Visio doesn't silently
  //    substitute the cached v1.4 version on first load.
  const masterBlockRe = new RegExp(`<Master\\s+ID='${dataObjId}'[^>]*?>`);
  const masterBlockMatch = mastersXml.match(masterBlockRe);
  if (masterBlockMatch) {
    const oldOpen = masterBlockMatch[0];
    const newOpen = oldOpen
      .replace(/UniqueID='\{[^}]+\}'/, `UniqueID='${freshGuid()}'`)
      .replace(/BaseID='\{[^}]+\}'/, `BaseID='${freshGuid()}'`);
    const newMastersXml = mastersXml.replace(masterBlockRe, newOpen);
    zip.file("visio/masters/masters.xml", newMastersXml);
    console.log("  ✓ Master UniqueID / BaseID refreshed");
  }

  zip.file(dataObjFile, content);

  console.log("Writing", DST_PATH);
  const out = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(DST_PATH, out);
  console.log("\nDone — v1.5 stencil written.");
})();

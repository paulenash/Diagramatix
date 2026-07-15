/**
 * V3 Visio Export — Domain (UML class) diagrams → STANDARD Visio UML stencil.
 *
 * Targets Microsoft's standard UML Class shapes, embedded in the base template
 * `public/domain-template-uml.vsdx` (derived from a real standard-UML file, so
 * its theme/styles/fonts/masters are exactly what those masters expect). The
 * emitter replicates the standard structure observed in that file:
 *
 *   • Class  (Master "Class")  — a list-container GROUP; Text = class name.
 *   • Member (Master "Member") — a standalone sibling shape per attribute /
 *     operation; Text = the formatted row; linked to its class via a
 *     `Relationships` DEPENDSON back-reference and stacked by PinY.
 *   • Separator (Master "Separator") — divides the attribute / operation bands.
 *   • Association / Aggregation / Composition — GROUP connectors glued to the
 *     two classes via BeginX/EndX + <Connect ... ToCell='PinX'>.
 *
 * No master merging: every master already lives in the template. We read the
 * NameU→ID map from the template's masters.xml at export time (robust to
 * Visio's renumbering) and rewrite ONLY page1.xml, preserving all document
 * infrastructure (theme, styles, page setup, rels).
 *
 * COMPLETELY INDEPENDENT from the BPMN export — modify freely.
 */
import JSZip from "jszip";
import type { DiagramData, DiagramElement, Connector, UmlAttribute, UmlOperation } from "../types";

const VISIO_NS = "http://schemas.microsoft.com/office/visio/2012/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// Layout constants (inches), measured EXACTLY from the standard-UML reference
// file's Class/Enumeration list-container geometry so first-paint matches.
const FIRST_CENTER = 0.558891;      // class top → first member's centre
const ENUM_FIRST_CENTER = 0.7187;   // enum top → first value (taller «enumeration» header)
const ROW_STEP = 0.166717;          // pitch between adjacent member rows
const SEP_STEP = 0.103044;          // pitch from a row to an adjacent separator
const HALF_ROW = 0.0833;            // half a member row (member centre → its edge)
const BOTTOM_PAD = 0.0392;          // last member edge → class bottom
const SEP_HEIGHT = 0.03937;         // the separator line's own height
const MEMBER_INSET = 0.07874;       // class width − member width
const CLASS_DEFAULT_W = 2.559055118110236; // the master's default width (every reference class uses it)
const TITLE_ONLY_H = 0.5;           // height of a class/enum with no members
// Title-band height (top of the box → the divider under the name/stereotype),
// measured from the reference MS6 body geometry (divider Y = Height − titleH).
const TITLE_H_CLASS = 0.436163;
const TITLE_H_ENUM = 0.595935;
const MIN_W = 1.6;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
function getDiagramBounds(data: DiagramData): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of data.elements) {
    minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width); maxY = Math.max(maxY, el.y + el.height);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  return { minX, minY, maxX, maxY };
}

function formatUmlAttribute(a: UmlAttribute): string {
  const vis = a.visibility ?? "-";
  const derived = a.isDerived ? "/" : "";
  const type = a.type ? `: ${a.type}` : "";
  const mult = a.notNull ? " [1]" : a.multiplicity ? ` [${a.multiplicity}]` : "";
  const cons: string[] = [];
  if (a.primaryKey) cons.push("PK");
  if (a.foreignKey) cons.push(a.fkTable ? `FK ${a.fkTable}${a.fkColumn ? "." + a.fkColumn : ""}` : "FK");
  const c = cons.length ? ` {${cons.join(", ")}}` : "";
  return `${vis}${derived}${a.name}${type}${mult}${c}`.trim();
}
function formatUmlOperation(o: UmlOperation): string {
  return `${o.visibility ?? "+"}${o.name}()`;
}

/** Round-trip blobs (lossless re-import). */
function dgxUml(el: DiagramElement): string {
  return JSON.stringify({
    kind: el.type, stereotype: el.properties.stereotype,
    showAttributes: el.properties.showAttributes ?? false,
    showOperations: el.properties.showOperations ?? false,
    attributes: el.properties.attributes ?? [], operations: el.properties.operations ?? [],
    values: el.properties.values ?? [], parentId: el.parentId,
  });
}
function dgxUmlRel(c: Connector): string {
  return JSON.stringify({
    type: c.type, directionType: c.directionType, routingType: c.routingType,
    sourceRole: c.sourceRole, sourceMultiplicity: c.sourceMultiplicity,
    targetRole: c.targetRole, targetMultiplicity: c.targetMultiplicity,
    associationName: c.label, arrowAtSource: c.arrowAtSource,
    containmentSwapEnd: c.containmentSwapEnd,
    readingDirection: c.readingDirection, weight: c.weight, dashed: c.dashed,
  });
}
const propRows = (rows: Array<[string, string]>) =>
  `<Section N='Property'>${rows.map(([n, v]) => `<Row N='${n}'><Cell N='Value' V='${esc(v)}' U='STR'/></Row>`).join("")}</Section>`;

/** Parse the template's masters.xml → { NameU: id }. */
function readMasterMap(mastersXml: string): Record<string, number> {
  const map: Record<string, number> = {};
  const re = /<Master\s+ID='(\d+)'[^>]*?NameU='([^']*)'/g;
  let m;
  while ((m = re.exec(mastersXml)) !== null) map[m[2]] = parseInt(m[1]);
  return map;
}

export async function exportVisioDomainV3(
  data: DiagramData,
  diagramName: string,
  templateBuffer: ArrayBuffer,
): Promise<Uint8Array> {
  const base = await JSZip.loadAsync(templateBuffer);
  const mastersXml = await base.file("visio/masters/masters.xml")!.async("string");
  const M = readMasterMap(mastersXml);
  const pagesXml = await base.file("visio/pages/pages.xml")!.async("string");
  const pageH = parseFloat((pagesXml.match(/PageHeight' V='([^']*)'/) || [])[1] ?? "8.2677");

  const bounds = getDiagramBounds(data);
  const marginX = 0.6, marginY = 0.6;
  const toX = (px: number) => (px - bounds.minX) / 96 + marginX;      // left edge, inches
  const toYtop = (px: number) => pageH - (px - bounds.minY) / 96 - marginY; // top edge, Visio Y-up

  // Copy every template part verbatim; we replace ONLY page1.xml below.
  const zip = new JSZip();
  for (const [fpath, entry] of Object.entries(base.files)) {
    if (!entry.dir && fpath !== "visio/pages/page1.xml") {
      zip.file(fpath, await entry.async("uint8array"));
    }
  }

  const shapes: string[] = [];
  const connects: string[] = [];
  const elIdToSheet = new Map<string, number>();
  // The ACTUAL rendered box (inches) of each element, so connectors glue to
  // where the shape really is — not to el.width/el.height (which differ from
  // the default class width + member-based class height).
  const elIdToBox = new Map<string, { cx: number; cy: number; hw: number; hh: number }>();
  /** Point on a box's edge in the direction of (tx,ty). */
  const edgePoint = (b: { cx: number; cy: number; hw: number; hh: number }, tx: number, ty: number) => {
    const ddx = tx - b.cx, ddy = ty - b.cy;
    const scale = Math.min(b.hw / (Math.abs(ddx) || 1e-9), b.hh / (Math.abs(ddy) || 1e-9));
    return { x: b.cx + ddx * scale, y: b.cy + ddy * scale };
  };
  let sid = 1000;
  const allocId = () => (sid += 1);

  const n = (v: number) => (Math.round(v * 1e6) / 1e6).toString();

  // A Class/Enumeration list-container GROUP faithful to the reference: the 4
  // geometry sub-shapes (MS 6=body, 7/8=title band, 9) + the list
  // Connection/Control sections. Cached V is REQUIRED — Visio renders the
  // header/list from these on open (formula-only mangles the header).
  function listContainer(masterName: string, sheetId: number, W: number, H: number, cx: number, cy: number, name: string, memberIds: number[], extraProps: string, stereo?: string): string {
    const sub6 = allocId(), sub7 = allocId(), sub8 = allocId(), sub9 = allocId();
    // Title divider sits titleH below the top → at height (H − titleH). The
    // stereotype text is pre-loaded on MS8 but toggled OFF (User.StereoType
    // defaults false), so the header keeps its normal height and nothing
    // detaches on open; "Show Stereotype" reveals «...» with a correct recalc.
    const divY = n(H - (masterName === "Enumeration" ? TITLE_H_ENUM : TITLE_H_CLASS));
    const dep = memberIds.length
      ? `SUM(DEPENDSON(1),DEPENDSON(2,${memberIds.map(i => `Sheet.${i}!SheetRef()`).join(",")}))`
      : `SUM(DEPENDSON(1))`;
    const roleUser = masterName === "Class" ? `<Section N='User'><Row N='UmlRole'><Cell N='Value' V='${esc(name)}' U='STR' F='Inh'/></Row></Section>` : "";
    return (
      `<Shape ID='${sheetId}' NameU='${masterName}' Type='Group' Master='${M[masterName]}'>` +
      `<Cell N='PinX' V='${n(cx)}'/><Cell N='PinY' V='${n(cy)}'/>` +
      `<Cell N='Width' V='${n(W)}'/><Cell N='Height' V='${n(H)}'/>` +
      `<Cell N='LocPinX' V='${n(W / 2)}' F='Inh'/><Cell N='LocPinY' V='${n(H / 2)}' F='Inh'/>` +
      `<Cell N='Relationships' V='0' F='${dep}'/>` +
      `<Cell N='TxtPinX' V='${n(W / 2)}' F='Inh'/><Cell N='TxtPinY' V='${n(H - 0.22)}' F='Inh'/>` +
      `<Cell N='TxtWidth' V='${n(W)}' F='Inh'/><Cell N='TxtLocPinX' V='${n(W / 2)}' F='Inh'/>` +
      `<Cell N='ShapeShdwShow' V='2'/><Cell N='SelectMode' V='0'/>` +
      `<Section N='User'>` +
        (masterName === "Class" ? `<Row N='EntityName'><Cell N='Value' V='${esc(name)}' U='STR' F='Inh'/></Row>` : "") +
        `<Row N='WidthMin'><Cell N='Value' V='${n(Math.max(1, W * 0.6))}' U='DL'/></Row>` +
        `<Row N='BackGrndLine'><Cell N='Value' V='#06306f' U='COLOR' F='Inh'/></Row>` +
      `</Section>` +
      `<Section N='Control'><Row N='Row_1'><Cell N='Y' V='${n(H / 2)}' F='Inh'/><Cell N='YDyn' V='${n(H / 2)}' F='Inh'/></Row></Section>` +
      `<Section N='Connection'>` +
        `<Row T='Connection' IX='0'><Cell N='Y' V='${n(H / 2)}' F='Inh'/></Row>` +
        `<Row T='Connection' IX='1'><Cell N='X' V='${n(W)}' F='Inh'/><Cell N='Y' V='${n(H / 2)}' F='Inh'/></Row>` +
        `<Row T='Connection' IX='2'><Cell N='X' V='${n(W / 2)}' F='Inh'/></Row>` +
        `<Row T='Connection' IX='3'><Cell N='X' V='${n(W / 2)}' F='Inh'/><Cell N='Y' V='${n(H)}' F='Inh'/></Row>` +
      `</Section>` +
      extraProps +
      `<Text>${esc(name)}</Text>` +
      `<Shapes>` +
        // MS6 = the rounded body box; its geometry carries the title divider at Y=divY.
        `<Shape ID='${sub6}' Type='Shape' MasterShape='6'><Cell N='PinX' V='${n(W / 2)}' F='Inh'/><Cell N='PinY' V='${n(H / 2)}' F='Inh'/><Cell N='Width' V='${n(W)}' F='Inh'/><Cell N='Height' V='${n(H)}' F='Inh'/><Cell N='LocPinX' V='${n(W / 2)}' F='Inh'/><Cell N='LocPinY' V='${n(H / 2)}' F='Inh'/>` +
          `<Section N='Geometry' IX='0'>` +
            `<Row T='LineTo' IX='2'><Cell N='X' V='${n(W)}' F='Inh'/></Row>` +
            `<Row T='LineTo' IX='3'><Cell N='X' V='${n(W)}' F='Inh'/><Cell N='Y' V='${divY}' F='Inh'/></Row>` +
            `<Row T='LineTo' IX='4'><Cell N='Y' V='${divY}' F='Inh'/></Row>` +
            `<Row T='EllipticalArcTo' IX='5'><Cell N='Y' V='${divY}' F='Inh'/><Cell N='B' V='${divY}' U='DL' F='Inh'/></Row>` +
            `<Row T='EllipticalArcTo' IX='6'><Cell N='Y' V='${divY}' F='Inh'/><Cell N='B' V='${divY}' U='DL' F='Inh'/></Row>` +
          `</Section></Shape>` +
        // MS7 = the coloured title band; its geometry spans the full width.
        `<Shape ID='${sub7}' Type='Shape' MasterShape='7'><Cell N='PinX' V='${n(W / 2)}' F='Inh'/><Cell N='PinY' V='${n(H)}' F='Inh'/><Cell N='Width' V='${n(W)}' F='Inh'/><Cell N='LocPinX' V='${n(W / 2)}' F='Inh'/>${roleUser}` +
          `<Section N='Geometry' IX='0'><Row T='LineTo' IX='4'><Cell N='X' V='${n(W)}' F='Inh'/></Row><Row T='LineTo' IX='5'><Cell N='X' V='${n(W)}' F='Inh'/></Row></Section></Shape>` +
        // MS8 = the «stereotype» text line (shown when User.StereoType=1).
        `<Shape ID='${sub8}' Type='Shape' MasterShape='8'><Cell N='PinX' V='${n(W / 2)}' F='Inh'/><Cell N='PinY' V='${n(H)}' F='Inh'/><Cell N='Width' V='${n(W)}' F='Inh'/><Cell N='LocPinX' V='${n(W / 2)}' F='Inh'/>${stereo ? `<Text>&lt;&lt;${esc(stereo)}&gt;&gt;</Text>` : ""}</Shape>` +
        `<Shape ID='${sub9}' Type='Shape' MasterShape='9'><Cell N='PinX' V='${n(W - 0.1181)}' F='Inh'/><Cell N='PinY' V='${n(H)}' F='Inh'/></Shape>` +
      `</Shapes>` +
      `</Shape>`
    );
  }

  function memberShape(id: number, classId: number, text: string, cx: number, py: number, mw: number): string {
    return (
      `<Shape ID='${id}' NameU='Member' Type='Shape' Master='${M["Member"]}'>` +
      `<Cell N='PinX' V='${n(cx)}'/><Cell N='PinY' V='${n(py)}'/><Cell N='Width' V='${n(mw)}'/>` +
      `<Cell N='LocPinX' V='${n(mw / 2)}' F='Inh'/>` +
      `<Cell N='Relationships' V='0' F='SUM(DEPENDSON(5,Sheet.${classId}!SheetRef()))'/>` +
      `<Cell N='ShapeFixedCode' V='1'/><Cell N='ObjType' V='1'/><Cell N='TxtWidth' V='${n(mw)}' F='Inh'/><Cell N='ShapeShdwShow' V='2'/>` +
      `<Section N='User'>` +
        `<Row N='MemberName'><Cell N='Value' V='${esc(text)}' U='STR' F='Inh'/></Row>` +
        `<Row N='ContainerMargin'><Cell N='Value' V='0.03937007874015748' U='MM'/></Row>` +
        `<Row N='WidthMin'><Cell N='Value' V='0'/></Row>` +
        `<Row N='IsInstance'><Cell N='Value' V='1' U='BOOL' F='Inh'/></Row>` +
      `</Section>` +
      `<Section N='Geometry' IX='0'><Cell N='NoLine' V='1' F='Inh'/>` +
        `<Row T='LineTo' IX='2'><Cell N='X' V='${n(mw)}' F='Inh'/></Row>` +
        `<Row T='LineTo' IX='3'><Cell N='X' V='${n(mw)}' F='Inh'/></Row>` +
      `</Section>` +
      `<Text>${esc(text)}</Text></Shape>`
    );
  }

  function separatorShape(id: number, classId: number, cx: number, py: number, mw: number, itemIndex: number): string {
    return (
      `<Shape ID='${id}' NameU='Separator' Type='Shape' Master='${M["Separator"]}'>` +
      `<Cell N='PinX' V='${n(cx)}'/><Cell N='PinY' V='${n(py)}'/><Cell N='Width' V='${n(mw)}'/><Cell N='Height' V='${SEP_HEIGHT}'/>` +
      `<Cell N='LocPinX' V='${n(mw / 2)}' F='Inh'/>` +
      `<Cell N='Relationships' V='0' F='SUM(DEPENDSON(5,Sheet.${classId}!SheetRef()))'/>` +
      `<Cell N='ShapeFixedCode' V='1'/><Cell N='ShapeShdwShow' V='2'/>` +
      `<Section N='User'><Row N='ContainerMargin'><Cell N='Value' V='0.03937007874015748' U='MM'/></Row><Row N='ItemIndex'><Cell N='Value' V='${itemIndex}' F='Inh'/></Row></Section>` +
      `<Section N='Geometry' IX='0'><Row T='LineTo' IX='2'><Cell N='X' V='${n(mw)}' F='Inh'/></Row></Section></Shape>`
    );
  }

  // ── Elements ──
  for (const el of data.elements) {
    if (el.type === "uml-class" || el.type === "uml-enumeration") {
      const isEnum = el.type === "uml-enumeration";
      const containerMaster = isEnum ? "Enumeration" : "Class";
      const classId = allocId();
      elIdToSheet.set(el.id, classId);

      // Member rows (Enumeration values, or class attributes + operations).
      const rows: { text: string; sep?: boolean }[] = [];
      if (isEnum) {
        for (const v of (el.properties.values as string[] | undefined) ?? []) rows.push({ text: v });
      } else {
        const attrs = (el.properties.showAttributes ?? false) ? ((el.properties.attributes as UmlAttribute[]) ?? []) : [];
        const ops = (el.properties.showOperations ?? false) ? ((el.properties.operations as UmlOperation[]) ?? []) : [];
        for (const a of attrs) rows.push({ text: formatUmlAttribute(a) });
        if (ops.length) rows.push({ text: "", sep: true });
        for (const o of ops) rows.push({ text: formatUmlOperation(o) });
      }

      // The stereotype text is pre-loaded on the class (so "Show Stereotype"
      // reveals the right text) but NOT shown on open — showing it grows the
      // header, which only Visio's recalc can do cleanly. Default to Diagramatix's
      // own default ("entity") when unset, matching what the app displays.
      // (Enumerations keep the master's built-in «Enumeration» line.)
      const stereo = isEnum ? undefined : String(el.properties.stereotype ?? "entity");

      // Assign each row a centre offset from the top (Visio Y-down here).
      const first = isEnum ? ENUM_FIRST_CENTER : FIRST_CENTER;
      const centres: number[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (i === 0) centres.push(first);
        else centres.push(centres[i - 1] + ((rows[i].sep || rows[i - 1].sep) ? SEP_STEP : ROW_STEP));
      }
      const height = rows.length ? centres[centres.length - 1] + HALF_ROW + BOTTOM_PAD : TITLE_ONLY_H;
      // Use the master's DEFAULT width (the value every reference class carries)
      // so the painted box and the selection box are identical — the reference
      // keeps a fixed width and only grows for very long text.
      const width = CLASS_DEFAULT_W;
      const mw = width - MEMBER_INSET;
      const topY = toYtop(el.y);
      const cx = toX(el.x) + width / 2;
      const cy = topY - height / 2;
      elIdToBox.set(el.id, { cx, cy, hw: width / 2, hh: height / 2 });

      const memberIds: number[] = [];
      const memberXml: string[] = [];
      rows.forEach((r, i) => {
        const mid = allocId();
        memberIds.push(mid);
        const py = topY - centres[i];
        // Separator ItemIndex is 1-based (the item's 1-based list position).
        memberXml.push(r.sep ? separatorShape(mid, classId, cx, py, mw, i + 1) : memberShape(mid, classId, r.text, cx, py, mw));
      });

      shapes.push(
        listContainer(containerMaster, classId, width, height, cx, cy, el.label ?? containerMaster, memberIds,
          propRows([["BpmnId", el.id], ["DgxUml", dgxUml(el)]]), stereo),
        ...memberXml,
      );
    } else if (el.type === "uml-package" || el.type === "uml-note") {
      // Dedicated standard-UML masters: Package (expanded), Note.
      // These carry self-contained geometry in the master; a minimal instance
      // (Master + size + text) inherits the sub-shapes. Package is sized to the
      // element; Note keeps a compact default.
      const masterName = el.type === "uml-package" ? "Package (expanded)" : "Note";
      const master = M[masterName] ?? M["Rounded Rectangle"];
      if (master === undefined) continue;
      const id = allocId();
      elIdToSheet.set(el.id, id);
      const width = Math.max(MIN_W, el.width / 96), height = Math.max(0.6, el.height / 96);
      const cx = toX(el.x) + width / 2, cy = toYtop(el.y) - height / 2;
      elIdToBox.set(el.id, { cx, cy, hw: width / 2, hh: height / 2 });
      shapes.push(
        `<Shape ID='${id}' NameU='${masterName}' Type='Group' Master='${master}'>` +
        `<Cell N='PinX' V='${n(cx)}'/><Cell N='PinY' V='${n(cy)}'/><Cell N='Width' V='${n(width)}'/><Cell N='Height' V='${n(height)}'/>` +
        `<Cell N='LocPinX' V='${n(width / 2)}' F='Inh'/><Cell N='LocPinY' V='${n(height / 2)}' F='Inh'/>` +
        propRows([["BpmnId", el.id], ["DgxUml", dgxUml(el)]]) +
        `<Text>${esc(el.label ?? "")}</Text></Shape>`
      );
    }
    // uml-pain-point: no standard-UML equivalent — skipped.
  }

  // ── Relationships ──
  // Every connector maps to a real UML master in the merged template.
  const CONN_MASTER: Record<string, string> = {
    "uml-association": "Association", "uml-aggregation": "Aggregation", "uml-composition": "Composition",
    "uml-dependency": "Dependency", "uml-realisation": "Interface Realization",
    "uml-generalisation": "Inheritance",
    // No standard-UML master for containment (⊕) or a note anchor — map both to
    // the dashed Dependency master for foreign viewing. The DgxUmlRel blob
    // restores the true Diagramatix type on re-import (lossless round-trip).
    "uml-containment": "Dependency", "uml-note-anchor": "Dependency",
  };
  // Connectors whose masters carry the 4 multiplicity/role sub-shapes (6/7/8/9)
  // and a ShowMulti toggle. Others (dependency/realisation/generalisation) don't.
  const ASSOC_FAMILY = new Set<Connector["type"]>(["uml-association", "uml-aggregation", "uml-composition"]);
  // Per-type arrowheads (Visio arrow indices from the UML masters) + dashed flag,
  // rendered inline on a self-contained connector Shape. begin/end already align
  // with the diamond-swap so the diamond/triangle lands on the right element.
  const CONN_ARROWS: Record<string, { begin: number; end: number; dash: boolean }> = {
    "uml-association": { begin: 0, end: 0, dash: false },
    "uml-aggregation": { begin: 22, end: 0, dash: false },   // hollow diamond
    "uml-composition": { begin: 254, end: 0, dash: false },  // filled diamond
    "uml-generalisation": { begin: 0, end: 14, dash: false },// hollow triangle
    "uml-realisation": { begin: 0, end: 14, dash: true },    // hollow triangle, dashed
    "uml-dependency": { begin: 0, end: 12, dash: true },     // open arrow, dashed
    "uml-containment": { begin: 0, end: 0, dash: false },
    "uml-note-anchor": { begin: 0, end: 0, dash: true },
  };
  for (const conn of data.connectors) {
    // Visio's Aggregation/Composition masters draw the diamond at the BEGIN end,
    // whereas Diagramatix renders that shared-diamond at the TARGET. For those two
    // types glue Begin to the Diagramatix TARGET so the diamond appears on the
    // correct element in Visio (the mirror of the import-side swap). DgxUmlRel
    // still records the true source/target, so a re-import round-trips losslessly.
    const diamondSwap = conn.type === "uml-aggregation" || conn.type === "uml-composition";
    const beginId = diamondSwap ? conn.targetId : conn.sourceId;
    const endId = diamondSwap ? conn.sourceId : conn.targetId;
    const srcSheet = elIdToSheet.get(beginId), tgtSheet = elIdToSheet.get(endId);
    if (srcSheet === undefined || tgtSheet === undefined) continue;
    const masterName = CONN_MASTER[conn.type] ?? "Association";
    const master = M[masterName];
    if (master === undefined) continue;
    const id = allocId();

    // Attach Begin/End to the SAME sides the Diagramatix diagram uses (so the
    // connector meets the correct edges), then route an ORTHOGONAL path — like
    // the original, not a diagonal. Visio re-routes on interaction; this fixes
    // the FIRST-paint endpoints + rectilinear shape.
    const s = elIdToBox.get(beginId), t = elIdToBox.get(endId);
    if (!s || !t) continue;
    const beginSide = diamondSwap ? conn.targetSide : conn.sourceSide;
    const endSide = diamondSwap ? conn.sourceSide : conn.targetSide;
    const sidePt = (b: { cx: number; cy: number; hw: number; hh: number }, side: string | undefined, ox: number, oy: number) => {
      switch (side) {
        case "right": return { x: b.cx + b.hw, y: b.cy };
        case "left": return { x: b.cx - b.hw, y: b.cy };
        case "top": return { x: b.cx, y: b.cy + b.hh };     // Visio Y-up: screen-top = higher Y
        case "bottom": return { x: b.cx, y: b.cy - b.hh };
        default: return edgePoint(b, ox, oy);
      }
    };
    const be = sidePt(s, beginSide, t.cx, t.cy), en = sidePt(t, endSide, s.cx, s.cy);
    const bx = be.x, by = be.y, ex = en.x, ey = en.y;
    const dx = ex - bx, dy = ey - by;
    const pinx = (bx + ex) / 2, piny = (by + ey) / 2, locx = dx / 2, locy = dy / 2;
    const arrows = CONN_ARROWS[conn.type] ?? { begin: 0, end: 0, dash: false };

    // Orthogonal route in LOCAL coords (origin=Begin). Prefer the Diagramatix
    // waypoints (rectilinear, matching the original) with endpoints snapped to
    // the rendered side-points; fall back to a simple Z/L path.
    const bHoriz = beginSide === "left" || beginSide === "right";
    const wpAll = conn.waypoints ?? [];
    const vs = conn.sourceInvisibleLeader ? 1 : 0;
    const ve = conn.targetInvisibleLeader ? wpAll.length - 2 : wpAll.length - 1;
    const vis = wpAll.slice(vs, Math.max(vs, ve) + 1).map(p => ({ x: toX(p.x), y: toYtop(p.y) }));
    if (diamondSwap) vis.reverse();
    let pathLocal: Array<{ x: number; y: number }>;
    if (vis.length >= 3) {
      const m = vis.length;
      const h01 = Math.abs(vis[1].y - vis[0].y) < Math.abs(vis[1].x - vis[0].x);
      vis[1] = h01 ? { x: vis[1].x, y: by } : { x: bx, y: vis[1].y };
      const hL = Math.abs(vis[m - 1].y - vis[m - 2].y) < Math.abs(vis[m - 1].x - vis[m - 2].x);
      vis[m - 2] = hL ? { x: vis[m - 2].x, y: ey } : { x: ex, y: vis[m - 2].y };
      vis[0] = { x: bx, y: by }; vis[m - 1] = { x: ex, y: ey };
      pathLocal = vis.map(p => ({ x: p.x - bx, y: p.y - by }));
    } else if (Math.abs(dx) < 0.03 || Math.abs(dy) < 0.03) {
      pathLocal = [{ x: 0, y: 0 }, { x: dx, y: dy }];
    } else {
      pathLocal = bHoriz
        ? [{ x: 0, y: 0 }, { x: dx / 2, y: 0 }, { x: dx / 2, y: dy }, { x: dx, y: dy }]
        : [{ x: 0, y: 0 }, { x: 0, y: dy / 2 }, { x: dx, y: dy / 2 }, { x: dx, y: dy }];
    }
    const geomRows = pathLocal.map((p, i) =>
      i === 0 ? `<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>`
        : `<Row T='LineTo' IX='${i + 1}'><Cell N='X' V='${n(p.x)}'/><Cell N='Y' V='${n(p.y)}'/></Row>`
    ).join("");
    const dir = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const ddx = b.x - a.x, ddy = b.y - a.y, l = Math.hypot(ddx, ddy) || 1;
      return { ux: ddx / l, uy: ddy / l };
    };
    const bDir = dir(pathLocal[0], pathLocal[1]);                                   // into the path from Begin
    const eDir = dir(pathLocal[pathLocal.length - 1], pathLocal[pathLocal.length - 2]); // into the path from End

    // Multiplicities/roles + name. Map begin/end back to Diagramatix source/target
    // (diamondSwap already flipped begin↔end for aggregation/composition).
    const beginIsSource = !diamondSwap;
    const beginMult = beginIsSource ? conn.sourceMultiplicity : conn.targetMultiplicity;
    const beginRole = beginIsSource ? conn.sourceRole : conn.targetRole;
    const endMult = beginIsSource ? conn.targetMultiplicity : conn.sourceMultiplicity;
    const endRole = beginIsSource ? conn.targetRole : conn.sourceRole;
    const hasMult = ASSOC_FAMILY.has(conn.type);

    const nameText = conn.label ? esc(conn.label) : "";

    // Emit the connector as a self-contained 1-D Shape — the SAME recipe the BPMN
    // export uses (ObjType=2 + explicit LineWeight + explicit Geometry visibility
    // cells + _WALKGLUE + centre glue), which is proven to render on first open.
    // The UML group masters only render in Visio-native re-saves, so we skip them
    // and draw the arrowheads inline via BeginArrow/EndArrow. NameU keeps the type
    // for foreign re-import; DgxUmlRel keeps everything for a lossless round-trip.
    shapes.push(
      `<Shape ID='${id}' NameU='${masterName}' Name='${masterName}' Type='Shape'>` +
      `<Cell N='PinX' V='${n(pinx)}' F='GUARD((BeginX+EndX)/2)'/>` +
      `<Cell N='PinY' V='${n(piny)}' F='GUARD((BeginY+EndY)/2)'/>` +
      `<Cell N='Width' V='${n(dx)}' F='GUARD(EndX-BeginX)'/>` +
      `<Cell N='Height' V='${n(dy)}' F='GUARD(EndY-BeginY)'/>` +
      `<Cell N='LocPinX' V='${n(locx)}' F='GUARD(Width*0.5)'/>` +
      `<Cell N='LocPinY' V='${n(locy)}' F='GUARD(Height*0.5)'/>` +
      `<Cell N='Angle' V='0' F='GUARD(0DA)'/><Cell N='FlipX' V='0' F='GUARD(FALSE)'/><Cell N='FlipY' V='0' F='GUARD(FALSE)'/>` +
      `<Cell N='BeginX' V='${n(bx)}' F='_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'/>` +
      `<Cell N='BeginY' V='${n(by)}' F='_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'/>` +
      `<Cell N='EndX' V='${n(ex)}' F='_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'/>` +
      `<Cell N='EndY' V='${n(ey)}' F='_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'/>` +
      `<Cell N='ObjType' V='2'/>` +
      `<Cell N='LineWeight' V='0.01041666666666667'/>` +
      `<Cell N='LinePattern' V='${arrows.dash ? 2 : 1}'/>` +
      `<Cell N='BeginArrow' V='${arrows.begin}'/><Cell N='EndArrow' V='${arrows.end}'/>` +
      `<Cell N='BeginArrowSize' V='2'/><Cell N='EndArrowSize' V='2'/>` +
      `<Cell N='BegTrigger' V='2' F='_XFTRIGGER(Sheet.${srcSheet}!EventXFMod)'/>` +
      `<Cell N='EndTrigger' V='2' F='_XFTRIGGER(Sheet.${tgtSheet}!EventXFMod)'/>` +
      `<Cell N='ConFixedCode' V='6'/>` +
      // Association name = the connector's own text, made DRAGGABLE via a
      // Controls.TextPosition handle (BPMN mechanism); TxtPin follows it and the
      // box auto-sizes to the text. Emitted ALWAYS (even with no name) so that
      // double-clicking to add a name gives a small, well-placed box rather than
      // one spanning the whole diagonal.
      `<Section N='Controls'><Row N='TextPosition'>` +
        `<Cell N='X' V='${n(locx)}' F='Controls.TextPosition.XDyn'/>` +
        `<Cell N='Y' V='${n(locy + 0.14)}' F='Controls.TextPosition.YDyn'/>` +
        `<Cell N='XDyn' V='${n(locx)}'/><Cell N='YDyn' V='${n(locy + 0.14)}'/>` +
        `<Cell N='XCon' V='0'/><Cell N='YCon' V='0'/><Cell N='CanGlue' V='0'/>` +
      `</Row></Section>` +
      `<Cell N='TxtPinX' V='${n(locx)}' F='SETATREF(Controls.TextPosition)'/>` +
      `<Cell N='TxtPinY' V='${n(locy + 0.14)}' F='SETATREF(Controls.TextPosition.Y)'/>` +
      `<Cell N='TxtWidth' V='0.6' F='MAX(TEXTWIDTH(TheText),2*Char.Size)'/>` +
      `<Cell N='TxtHeight' V='0.2' F='TEXTHEIGHT(TheText,TxtWidth)'/>` +
      `<Cell N='TxtLocPinX' V='0.3' F='TxtWidth*0.5'/>` +
      `<Cell N='TxtLocPinY' V='0.1' F='TxtHeight*0.5'/>` +
      propRows([["BpmnId", conn.id], ["DgxUmlRel", dgxUmlRel(conn)]]) +
      `<Section N='Geometry' IX='0'>` +
        `<Cell N='NoFill' V='1'/><Cell N='NoLine' V='0'/><Cell N='NoShow' V='0'/><Cell N='NoSnap' V='0'/>` +
        geomRows +
      `</Section>` +
      (nameText ? `<Text>${nameText}</Text>` : "") +
      `</Shape>`
    );

    // Multiplicities/roles = small borderless text Shapes near each endpoint,
    // offset along the connector's first/last SEGMENT (so they sit beside the
    // line, not across a diagonal). PinX/PinY track the connector's Begin/End
    // cell via a formula but WITHOUT GUARD, so the user can still drag them in
    // Visio (a drag overwrites the formula). Round-trip is via the DgxUmlRel blob.
    if (hasMult) {
      const along = 0.28, perp = 0.13;
      const label = (end: "Begin" | "End", d: { ux: number; uy: number }, side: number, txt?: string) => {
        if (!txt) return;
        const ax = end === "Begin" ? bx : ex, ay = end === "Begin" ? by : ey;
        const ox = along * d.ux + side * perp * -d.uy;
        const oy = along * d.uy + side * perp * d.ux;
        shapes.push(
          `<Shape ID='${allocId()}' NameU='UmlLabel' Type='Shape'>` +
          `<Cell N='PinX' V='${n(ax + ox)}' F='Sheet.${id}!${end}X+${n(ox)}'/>` +
          `<Cell N='PinY' V='${n(ay + oy)}' F='Sheet.${id}!${end}Y+${n(oy)}'/>` +
          `<Cell N='Width' V='0.5'/><Cell N='Height' V='0.18'/>` +
          `<Cell N='LocPinX' V='0.25'/><Cell N='LocPinY' V='0.09'/>` +
          `<Cell N='LinePattern' V='0'/><Cell N='FillPattern' V='0'/>` +
          `<Text>${esc(txt)}</Text></Shape>`);
      };
      label("Begin", bDir, +1, beginMult);
      label("Begin", bDir, -1, beginRole);
      label("End", eDir, +1, endMult);
      label("End", eDir, -1, endRole);
    }

    // Reading-direction arrowhead: a small filled triangle beside the name,
    // pointing toward the source/target element (matching the Diagramatix
    // original). Glued to the connector's PinX/PinY so it tracks the line.
    if (conn.readingDirection === "to-target" || conn.readingDirection === "to-source") {
      const toward = (conn.readingDirection === "to-target"
        ? elIdToBox.get(conn.targetId) : elIdToBox.get(conn.sourceId));
      if (toward) {
        // Point ORTHOGONALLY (horizontal OR vertical) toward the element so the
        // arrow aligns with a rectilinear segment and can be dragged onto one.
        let tdx = toward.cx - pinx, tdy = toward.cy - piny;
        if (Math.abs(tdx) >= Math.abs(tdy)) { tdx = Math.sign(tdx) || 1; tdy = 0; }
        else { tdy = Math.sign(tdy) || 1; tdx = 0; }
        const ang = Math.atan2(tdy, tdx);        // Visio Y-up, CCW radians
        const offX = tdx * 0.3, offY = tdy * 0.3; // sit just ahead of the name
        shapes.push(
          `<Shape ID='${allocId()}' NameU='UmlReadingDir' Type='Shape'>` +
          `<Cell N='PinX' V='${n(pinx + offX)}' F='Sheet.${id}!PinX+${n(offX)}'/>` +
          `<Cell N='PinY' V='${n(piny + offY)}' F='Sheet.${id}!PinY+${n(offY)}'/>` +
          `<Cell N='Width' V='0.13'/><Cell N='Height' V='0.1'/>` +
          `<Cell N='LocPinX' V='0.065'/><Cell N='LocPinY' V='0.05'/>` +
          `<Cell N='Angle' V='${n(ang)}'/>` +
          `<Cell N='FillForegnd' V='#374151'/><Cell N='FillPattern' V='1'/><Cell N='LinePattern' V='0'/>` +
          `<Section N='Geometry' IX='0'>` +
            `<Cell N='NoFill' V='0'/><Cell N='NoLine' V='1'/>` +
            `<Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>` +
            `<Row T='LineTo' IX='2'><Cell N='X' V='0.13'/><Cell N='Y' V='0.05'/></Row>` +
            `<Row T='LineTo' IX='3'><Cell N='X' V='0'/><Cell N='Y' V='0.1'/></Row>` +
            `<Row T='LineTo' IX='4'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row>` +
          `</Section></Shape>`);
      }
    }

    connects.push(
      `<Connect FromSheet='${id}' FromCell='BeginX' FromPart='9' ToSheet='${srcSheet}' ToCell='PinX' ToPart='3'/>` +
      `<Connect FromSheet='${id}' FromCell='EndX' FromPart='12' ToSheet='${tgtSheet}' ToCell='PinX' ToPart='3'/>`
    );
  }

  zip.file("visio/pages/page1.xml",
    `<?xml version='1.0' encoding='utf-8' ?>` +
    `<PageContents xmlns='${VISIO_NS}' xmlns:r='${REL_NS}' xml:space='preserve'>` +
    `<Shapes>${shapes.join("")}</Shapes>` +
    (connects.length ? `<Connects>${connects.join("")}</Connects>` : "") +
    `</PageContents>`);

  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

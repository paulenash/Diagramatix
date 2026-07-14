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
  for (const conn of data.connectors) {
    const srcSheet = elIdToSheet.get(conn.sourceId), tgtSheet = elIdToSheet.get(conn.targetId);
    if (srcSheet === undefined || tgtSheet === undefined) continue;
    const src = data.elements.find(e => e.id === conn.sourceId)!;
    const tgt = data.elements.find(e => e.id === conn.targetId)!;
    const masterName = CONN_MASTER[conn.type] ?? "Association";
    const master = M[masterName];
    if (master === undefined) continue;
    const id = allocId();

    // Cache Begin/End on the shape EDGES facing each other (Visio re-routes via
    // _WALKGLUE on recalc, but the cached endpoints must already sit on the
    // real shape boundaries or the connector floats until moved).
    const s = elIdToBox.get(conn.sourceId), t = elIdToBox.get(conn.targetId);
    if (!s || !t) continue;
    const be = edgePoint(s, t.cx, t.cy), en = edgePoint(t, s.cx, s.cy);
    const bx = be.x, by = be.y, ex = en.x, ey = en.y;
    const dx = ex - bx, dy = ey - by;
    const isRel = masterName !== "Dynamic connector";

    shapes.push(
      `<Shape ID='${id}' NameU='${masterName}' Type='${isRel ? "Group" : "Shape"}' Master='${master}'>` +
      `<Cell N='PinX' V='${n((bx + ex) / 2)}' F='GUARD((BeginX+EndX)/2)'/>` +
      `<Cell N='PinY' V='${n((by + ey) / 2)}' F='GUARD((BeginY+EndY)/2)'/>` +
      `<Cell N='Width' V='${n(dx)}' F='GUARD(EndX-BeginX)'/><Cell N='Height' V='${n(dy)}' F='GUARD(EndY-BeginY)'/>` +
      // Local pin at the connector's own centre (Width/2, Height/2) so its
      // geometry is placed relative to Begin/End instead of floating.
      `<Cell N='LocPinX' V='${n(dx / 2)}' F='GUARD(Width*0.5)'/><Cell N='LocPinY' V='${n(dy / 2)}' F='GUARD(Height*0.5)'/>` +
      `<Cell N='LayerMember' V='0'/>` +
      `<Cell N='BeginX' V='${n(bx)}' F='_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'/>` +
      `<Cell N='BeginY' V='${by}' F='_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'/>` +
      `<Cell N='EndX' V='${ex}' F='_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'/>` +
      `<Cell N='EndY' V='${ey}' F='_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'/>` +
      `<Cell N='ObjType' V='2'/>` +
      `<Cell N='BegTrigger' V='2' F='_XFTRIGGER(Sheet.${srcSheet}!EventXFMod)'/>` +
      `<Cell N='EndTrigger' V='2' F='_XFTRIGGER(Sheet.${tgtSheet}!EventXFMod)'/>` +
      propRows([["BpmnId", conn.id], ["DgxUmlRel", dgxUmlRel(conn)]]) +
      // Make the line visible on open: the master's group Geometry IX0 draws a
      // multi-segment path cached at authoring size. Match how Visio SAVES a
      // routed connector — override the LineTo ROWS (inherit NoFill/NoLine/
      // MoveTo + line style) so they trace a STRAIGHT Begin(0,0)→End(dx,dy)
      // line via collinear points (no Del — deleting rows kills the render).
      (isRel
        ? `<Section N='Geometry' IX='0'>` +
            `<Row T='LineTo' IX='2'><Cell N='X' V='${n(dx / 3)}'/><Cell N='Y' V='${n(dy / 3)}'/></Row>` +
            `<Row T='LineTo' IX='3'><Cell N='X' V='${n(2 * dx / 3)}'/><Cell N='Y' V='${n(2 * dy / 3)}'/></Row>` +
            `<Row T='LineTo' IX='4'><Cell N='X' V='${n(dx)}'/><Cell N='Y' V='${n(dy)}'/></Row>` +
          `</Section>`
        : "") +
      (conn.label ? `<Text>${esc(conn.label)}</Text>` : "") +
      `</Shape>`
    );
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

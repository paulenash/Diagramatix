/**
 * V3 Visio Import — Domain (UML class) diagrams ← STANDARD Visio UML stencil.
 *
 * Separate from the BPMN `importVisioV3` (which stays untouched). The export
 * (`exportVisioDomainV3`) embeds a `DgxUml` / `DgxUmlRel` shape-data blob on
 * every shape, so a Diagramatix-originated file round-trips LOSSLESSLY. For
 * foreign standard-UML files (no blob) we reconstruct from the master NameU +
 * the Class list-container's Member/Separator child rows.
 */
import JSZip from "jszip";
import type { DiagramData, DiagramElement, Connector, ConnectorType, UmlAttribute, UmlOperation } from "../types";
import type { ImportResult } from "./importVisioV3";

const PX = 96;

/** Same shape as the BPMN importer's ImportResult so the route can treat both uniformly. */
export type DomainImportResult = ImportResult;

/** True if the .vsdx looks like a standard-UML class diagram (our export or foreign). */
export async function isDomainVisio(buffer: ArrayBuffer): Promise<boolean> {
  const zip = await JSZip.loadAsync(buffer);
  const masters = await zip.file("visio/masters/masters.xml")?.async("string");
  if (masters && /NameU='(Class|Enumeration|Package \(expanded\)|Interface)'/.test(masters)) {
    // Ensure it's UML, not a BPMN file that happens to contain "Class".
    if (!/NameU='(Pool|Lane|Sequence Flow|Task)'/.test(masters)) return true;
  }
  const page = await zip.file("visio/pages/page1.xml")?.async("string");
  return !!page && page.includes("<Row N='DgxUml'");
}

/* ── XML helpers ── */
function splitTopShapes(pageXml: string): string[] {
  const start = pageXml.indexOf("<Shapes>") + 8;
  let end = pageXml.indexOf("</Shapes><Connects");
  if (end < 0) end = pageXml.lastIndexOf("</Shapes>");
  const body = pageXml.slice(start, end < 0 ? undefined : end);
  const re = /<Shape\b[^>]*?(\/?)>|<\/Shape>/g;
  let depth = 0, cur = 0, m: RegExpExecArray | null;
  const out: string[] = [];
  while ((m = re.exec(body)) !== null) {
    if (m[0] === "</Shape>") { depth--; if (depth === 0) out.push(body.slice(cur, m.index + 8)); }
    else if (m[1] === "/") { if (depth === 0) out.push(m[0]); }
    else { if (depth === 0) cur = m.index; depth++; }
  }
  return out;
}
const attr = (s: string, n: string) => (s.match(new RegExp(`\\b${n}='([^']*)'`)) || [])[1];
const cellV = (s: string, n: string) => { const m = s.match(new RegExp(`<Cell N='${n}' V='([^']*)'`)); return m ? parseFloat(m[1]) : undefined; };
function propVal(s: string, name: string): string | undefined {
  const m = s.match(new RegExp(`<Row N='${name}'><Cell N='Value' V='([^']*)'`));
  return m ? m[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : undefined;
}
function firstText(s: string): string {
  // Text on THIS shape only (not nested) — take the first <Text> before any child <Shape>.
  const childIdx = s.indexOf("<Shape ", 1);
  const scope = childIdx > 0 ? s.slice(0, childIdx) : s;
  const m = scope.match(/<Text[^>]*>([\s\S]*?)<\/Text>/);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

/** Parse a Member row string back into a UML attribute/operation. */
function parseAttribute(text: string): UmlAttribute {
  const t = text.trim();
  const vis = (["+", "-", "#"].includes(t[0]) ? t[0] : undefined) as UmlAttribute["visibility"];
  let rest = vis ? t.slice(1).trim() : t;
  const isDerived = rest.startsWith("/"); if (isDerived) rest = rest.slice(1);
  const mult = (rest.match(/\[([^\]]*)\]/) || [])[1];
  rest = rest.replace(/\s*\[[^\]]*\]/, "");
  const [namePart, typePart] = rest.split(":").map(x => x.trim());
  return { visibility: vis, name: namePart, type: typePart || undefined, multiplicity: mult, isDerived: isDerived || undefined };
}
function parseOperation(text: string): UmlOperation {
  const t = text.trim();
  const vis = (["+", "-", "#"].includes(t[0]) ? t[0] : undefined) as UmlOperation["visibility"];
  const name = (vis ? t.slice(1) : t).replace(/\(\s*\)\s*$/, "").trim();
  return { visibility: vis, name };
}

export async function importVisioDomainV3(buffer: ArrayBuffer): Promise<DomainImportResult> {
  const zip = await JSZip.loadAsync(buffer);
  const page = await zip.file("visio/pages/page1.xml")!.async("string");
  const mastersXml = (await zip.file("visio/masters/masters.xml")?.async("string")) ?? "";
  const pagesXml = (await zip.file("visio/pages/pages.xml")?.async("string")) ?? "";
  const pageH = parseFloat((pagesXml.match(/PageHeight' V='([^']*)'/) || [])[1] ?? "8.2677");

  // Master ID → NameU.
  const id2name: Record<string, string> = {};
  for (const m of mastersXml.matchAll(/<Master\s+ID='(\d+)'[^>]*?NameU='([^']*)'/g)) id2name[m[1]] = m[2];

  const warnings: string[] = [];
  const masterAgg = new Map<string, { masterId: string; nameU: string; count: number }>();
  const shapes = splitTopShapes(page);

  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];
  const sheetToElId = new Map<string, string>();     // Visio sheet ID → element id
  const membersByClassSheet = new Map<string, { text: string; sep: boolean; py: number }[]>();

  const ELEMENT_NAMES = new Set(["Class", "Enumeration", "Package (expanded)", "Package (collapsed)", "Note", "Composite", "Interface"]);
  const CONN_TYPE: Record<string, ConnectorType> = {
    "Association": "uml-association", "Directed Association": "uml-association",
    "Aggregation": "uml-aggregation", "Composition": "uml-composition",
    "Dependency": "uml-dependency", "Interface Realization": "uml-realisation", "Inheritance": "uml-generalisation",
  };

  let shapesSkipped = 0, connectorsSkipped = 0;

  // First pass: elements + collect member rows keyed by owning class sheet.
  for (const s of shapes) {
    const sheetId = attr(s, "ID");
    const masterId = attr(s, "Master");
    const nameU = masterId ? (id2name[masterId] ?? attr(s, "NameU") ?? "") : (attr(s, "NameU") ?? "");
    if (nameU) {
      const agg = masterAgg.get(nameU) ?? { masterId: masterId ?? "", nameU, count: 0 };
      agg.count++; masterAgg.set(nameU, agg);
    }

    if (nameU === "Member" || nameU === "Separator") {
      // Belongs to a Class/Enumeration via DEPENDSON(5,Sheet.<id>!...).
      const owner = (s.match(/DEPENDSON\(5,Sheet\.(\d+)!/) || [])[1];
      if (owner) {
        const list = membersByClassSheet.get(owner) ?? [];
        list.push({ text: firstText(s), sep: nameU === "Separator", py: cellV(s, "PinY") ?? 0 });
        membersByClassSheet.set(owner, list);
      }
      continue;
    }

    if (CONN_TYPE[nameU]) continue; // handled in the connector pass

    if (!ELEMENT_NAMES.has(nameU)) { if (sheetId) shapesSkipped++; continue; }

    // Geometry (inches, group center) → px (top-left).
    const pinX = cellV(s, "PinX") ?? 0, pinY = cellV(s, "PinY") ?? 0;
    const w = (cellV(s, "Width") ?? 2) * PX, h = (cellV(s, "Height") ?? 1) * PX;
    const x = pinX * PX - w / 2;
    const y = (pageH - pinY) * PX - h / 2;

    const blob = propVal(s, "DgxUml");
    const id = propVal(s, "BpmnId") ?? `el-${sheetId}`;
    const label = firstText(s) || nameU;

    let type: DiagramElement["type"] = "uml-class";
    const properties: Record<string, unknown> = {};
    if (blob) {
      try {
        const d = JSON.parse(blob);
        type = d.kind ?? "uml-class";
        if (d.stereotype) properties.stereotype = d.stereotype;
        if (d.showAttributes) properties.showAttributes = true;
        if (d.showOperations) properties.showOperations = true;
        if (Array.isArray(d.attributes) && d.attributes.length) properties.attributes = d.attributes;
        if (Array.isArray(d.operations) && d.operations.length) properties.operations = d.operations;
        if (Array.isArray(d.values) && d.values.length) properties.values = d.values;
        if (d.parentId) (properties as any).__parentId = d.parentId;
      } catch { warnings.push(`Bad DgxUml on shape ${sheetId}`); }
    } else {
      // Foreign file — infer type from master, rows filled in the member pass below.
      type = nameU === "Enumeration" ? "uml-enumeration"
        : nameU.startsWith("Package") ? "uml-package"
        : nameU === "Note" ? "uml-note" : "uml-class";
    }

    const el: DiagramElement = { id, type, x, y, width: w, height: h, label, properties };
    sheetToElId.set(sheetId!, id);
    // Stash the sheet id so the member pass can fill foreign rows.
    (el as any).__sheet = sheetId;
    elements.push(el);
  }

  // Foreign member rows → attributes/operations/values (only when no DgxUml blob filled them).
  for (const el of elements) {
    const sheet = (el as any).__sheet as string | undefined;
    const rows = sheet ? membersByClassSheet.get(sheet) : undefined;
    if (rows && !el.properties.attributes && !el.properties.operations && !el.properties.values) {
      rows.sort((a, b) => b.py - a.py); // top → bottom (Visio Y-up)
      if (el.type === "uml-enumeration") {
        el.properties.values = rows.filter(r => !r.sep).map(r => r.text);
      } else {
        const sepIdx = rows.findIndex(r => r.sep);
        const attrRows = (sepIdx >= 0 ? rows.slice(0, sepIdx) : rows).filter(r => !r.sep);
        const opRows = sepIdx >= 0 ? rows.slice(sepIdx + 1).filter(r => !r.sep) : [];
        if (attrRows.length) { el.properties.attributes = attrRows.map(r => parseAttribute(r.text)); el.properties.showAttributes = true; }
        if (opRows.length) { el.properties.operations = opRows.map(r => parseOperation(r.text)); el.properties.showOperations = true; }
      }
    }
    delete (el as any).__sheet;
  }

  // Resolve package membership from the round-trip parentId.
  for (const el of elements) {
    const pid = (el.properties as any).__parentId as string | undefined;
    if (pid && elements.some(e => e.id === pid)) el.parentId = pid;
    delete (el.properties as any).__parentId;
  }

  // Connector pass: <Connects> maps FromSheet(connector) → ToSheet(endpoint).
  const connectsBlock = page.slice(page.indexOf("<Connects>"), page.indexOf("</Connects>") + 11);
  const endpoints = new Map<string, { begin?: string; end?: string }>();
  for (const c of connectsBlock.matchAll(/<Connect FromSheet='(\d+)' FromCell='(BeginX|EndX)'[^>]*ToSheet='(\d+)'/g)) {
    const e = endpoints.get(c[1]) ?? {};
    if (c[2] === "BeginX") e.begin = c[3]; else e.end = c[3];
    endpoints.set(c[1], e);
  }

  for (const s of shapes) {
    const sheetId = attr(s, "ID");
    const masterId = attr(s, "Master");
    const nameU = masterId ? (id2name[masterId] ?? "") : "";
    if (!CONN_TYPE[nameU]) continue;
    const ep = endpoints.get(sheetId!);
    const srcEl = ep?.begin ? sheetToElId.get(ep.begin) : undefined;
    const tgtEl = ep?.end ? sheetToElId.get(ep.end) : undefined;
    if (!srcEl || !tgtEl) { connectorsSkipped++; continue; }

    const blob = propVal(s, "DgxUmlRel");
    let type: ConnectorType = CONN_TYPE[nameU];
    let sourceMultiplicity: string | undefined, targetMultiplicity: string | undefined, label: string | undefined;
    if (blob) {
      try { const d = JSON.parse(blob); type = d.type ?? type; sourceMultiplicity = d.sourceMultiplicity; targetMultiplicity = d.targetMultiplicity; label = d.associationName; } catch { /* keep NameU type */ }
    }
    connectors.push({
      id: propVal(s, "BpmnId") ?? `conn-${sheetId}`,
      sourceId: srcEl, targetId: tgtEl, sourceSide: "right", targetSide: "left",
      type, directionType: "non-directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
      sourceMultiplicity, targetMultiplicity, label,
    });
  }

  const classifyMaster = (nameU: string): string =>
    CONN_TYPE[nameU] ? `(connector) ${CONN_TYPE[nameU]}`
    : ELEMENT_NAMES.has(nameU) ? "element"
    : (nameU === "Member" || nameU === "Separator") ? "member row"
    : "skipped";

  const data: DiagramData = { elements, connectors, viewport: { x: 0, y: 0, zoom: 1 } };
  return {
    data, warnings,
    stats: {
      totalShapesOnPage: shapes.length, elementsCreated: elements.length, connectorsCreated: connectors.length,
      shapesSkipped, connectorsSkipped, implicitPools: 0,
      masters: [...masterAgg.values()]
        .sort((a, b) => b.count - a.count)
        .map(m => ({ masterId: m.masterId, nameU: m.nameU, count: m.count, classifiedAs: classifyMaster(m.nameU) })),
    },
  };
}

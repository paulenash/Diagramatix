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
import type { DiagramData, DiagramElement, Connector, ConnectorType } from "../types";
import type { ImportResult } from "./importVisioV3";
import { parseUmlAttribute as parseAttribute, parseUmlOperation as parseOperation } from "../umlParse";
import { recomputeAllConnectors } from "../routing";

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

// Member-row parsing reuses the shared parser in `../umlParse`
// (`parseUmlAttribute` / `parseUmlOperation`), aliased above.

/** Strip Visio's per-instance ".NNN" master-clone suffix → base NameU
 *  (e.g. "Attribute.328" → "Attribute", "Package.5" → "Package"). */
function baseNameU(n: string): string {
  return n.replace(/\.\d+$/, "");
}

/** A multiplicity token (`1`, `*`, `0..1`, `1..*`, `0..n`) as opposed to a role
 *  name — used to tell the two label sub-shapes at each connector end apart. */
const MULT_RE = /^\s*(\*|\d+|\d+\.\.(\d+|\*|n)|n)\s*$/;
const isMult = (t: string) => MULT_RE.test(t);

/** Foreign standard-UML connectors (no DgxUmlRel blob) carry their multiplicities,
 *  role names and the association name as text sub-shapes inside the connector
 *  group. Locate each along the Begin→End axis via the projection parameter
 *  `t = (p·v)/|v|²` (v = End−Begin in the group's LOCAL frame, so no page/flip
 *  transform is needed): t≈0 → begin end, t≈1 → far end, t≈0.5 → the association
 *  name centred on the line. Within an end, split multiplicity (regex) from role
 *  (a non-multiplicity name). Empty/duplicate-multiplicity slots are dropped. */
function foreignRelLabels(groupXml: string): {
  begin: { mult?: string; role?: string };
  end: { mult?: string; role?: string };
  name?: string;
} {
  const W = cellV(groupXml, "Width") ?? 0;
  const H = cellV(groupXml, "Height") ?? 0;
  const v2 = W * W + H * H;
  const beginLbls: string[] = [], endLbls: string[] = [], midLbls: string[] = [];
  const re = /<Shape\b/g;
  let m: RegExpExecArray | null; let first = true;
  while ((m = re.exec(groupXml)) !== null) {
    if (first) { first = false; continue; } // the connector group shape itself
    const scope = groupXml.slice(m.index);
    const txt = firstText(scope);
    if (!txt.trim()) continue;
    const px = parseFloat((scope.match(/<Cell N='PinX' V='([^']*)'/) || [])[1] ?? "NaN");
    const py = parseFloat((scope.match(/<Cell N='PinY' V='([^']*)'/) || [])[1] ?? "NaN");
    if (Number.isNaN(px) || Number.isNaN(py) || v2 === 0) continue;
    const t = (px * W + py * H) / v2;
    (t < 0.33 ? beginLbls : t > 0.66 ? endLbls : midLbls).push(txt);
  }
  const pick = (arr: string[]) => ({
    mult: arr.find(t => isMult(t)),
    role: arr.find(t => !isMult(t)),
  });
  // A centred label that isn't a multiplicity is the association name.
  const name = midLbls.find(t => !isMult(t));
  return { begin: pick(beginLbls), end: pick(endLbls), name };
}

/** Rows nested INSIDE a class/enum group (Microsoft standard-UML stencil stores
 *  attribute/operation/value rows as child sub-shapes, unlike our export which
 *  uses top-level Member shapes glued via DEPENDSON). Reads each row's INLINE
 *  text (present when the user edited it; blank when purely inherited from the
 *  master — those become placeholders/warnings, not real data). */
function nestedRows(groupXml: string): { text: string; sep: boolean; py: number }[] {
  const rows: { text: string; sep: boolean; py: number }[] = [];
  const re = /<Shape\b([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null; let first = true;
  while ((m = re.exec(groupXml)) !== null) {
    if (first) { first = false; continue; } // the outer group shape itself
    const nu = baseNameU((m[1].match(/NameU='([^']*)'/) || [])[1] ?? "");
    if (nu === "Attribute" || nu === "Member" || nu === "Operation" || nu === "Separator") {
      const scope = groupXml.slice(m.index);
      rows.push({
        text: firstText(scope),
        sep: nu === "Separator",
        py: parseFloat((scope.match(/<Cell N='PinY' V='([^']*)'/) || [])[1] ?? "0"),
      });
    }
  }
  return rows;
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

  // Keyed by BASE NameU (per-instance ".NNN" suffix stripped). Broadened to the
  // Microsoft standard-UML masters (Class with Attributes/Operations, plain
  // Package, Interface) as well as our own stencil.
  const ELEMENT_NAMES = new Set([
    "Class", "Class with Attributes", "Class with Operations",
    "Enumeration", "Package", "Package (expanded)", "Package (collapsed)",
    "Note", "Composite", "Interface",
  ]);
  const CONN_TYPE: Record<string, ConnectorType> = {
    "Association": "uml-association", "Directed Association": "uml-association",
    "Association with Name and Multipicities": "uml-association",
    "Aggregation": "uml-aggregation", "Composition": "uml-composition",
    "Dependency": "uml-dependency", "Interface Realization": "uml-realisation", "Inheritance": "uml-generalisation",
  };

  let shapesSkipped = 0, connectorsSkipped = 0;

  // First pass: elements + collect member rows keyed by owning class sheet.
  for (const s of shapes) {
    const sheetId = attr(s, "ID");
    const masterId = attr(s, "Master");
    const rawNameU = masterId ? (id2name[masterId] ?? attr(s, "NameU") ?? "") : (attr(s, "NameU") ?? "");
    const nameU = baseNameU(rawNameU);
    if (rawNameU) {
      const agg = masterAgg.get(nameU) ?? { masterId: masterId ?? "", nameU, count: 0 };
      agg.count++; masterAgg.set(nameU, agg);
    }

    if (nameU === "Member" || nameU === "Separator") {
      // Top-level Member/Separator glued to a Class/Enumeration via
      // DEPENDSON(5,Sheet.<id>!...) — our own export's list-container layout.
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
      // Foreign file — infer type from the (base) master NameU.
      type = nameU === "Enumeration" ? "uml-enumeration"
        : nameU.startsWith("Package") ? "uml-package"
        : nameU === "Note" ? "uml-note" : "uml-class";
      if (nameU === "Interface") properties.stereotype = "interface";
      // Microsoft stencil nests attribute/operation rows inside the class group
      // rather than gluing top-level Member shapes — collect them here.
      (properties as any).__nrows = nestedRows(s);
    }

    // Every imported class shows its stereotype header (Diagramatix hides it on
    // non-DB diagrams by default, and neither the DgxUml blob nor a foreign file
    // records visibility) — defaulting a plain class to «Class».
    if (type === "uml-class") {
      if (!properties.stereotype) properties.stereotype = "Class";
      properties.showStereotype = true;
    }

    const el: DiagramElement = { id, type, x, y, width: w, height: h, label, properties };
    sheetToElId.set(sheetId!, id);
    // Stash the sheet id so the member pass can fill foreign rows.
    (el as any).__sheet = sheetId;
    elements.push(el);
  }

  // Foreign rows → attributes/operations/values (only when no DgxUml blob filled
  // them). Prefer top-level Member rows glued via DEPENDSON (our export); fall
  // back to rows nested inside the group (Microsoft stencil).
  for (const el of elements) {
    const sheet = (el as any).__sheet as string | undefined;
    const dependsRows = sheet ? membersByClassSheet.get(sheet) : undefined;
    const nrows = (el.properties as any).__nrows as { text: string; sep: boolean; py: number }[] | undefined;
    const rows = (dependsRows && dependsRows.length) ? dependsRows : nrows;
    if (rows && rows.length && !el.properties.attributes && !el.properties.operations && !el.properties.values) {
      rows.sort((a, b) => b.py - a.py); // top → bottom (Visio Y-up)
      // Rows with no inline text are unedited stencil placeholders (text lives
      // only in the master) — note them so we don't silently import blanks.
      const blank = rows.filter(r => !r.sep && !r.text.trim()).length;
      if (blank) warnings.push(`${el.label || el.id}: ${blank} row(s) had no editable text (Visio stencil placeholders)`);
      if (el.type === "uml-enumeration") {
        el.properties.values = rows.filter(r => !r.sep && r.text.trim()).map(r => r.text);
      } else {
        const sepIdx = rows.findIndex(r => r.sep);
        const attrRows = (sepIdx >= 0 ? rows.slice(0, sepIdx) : rows).filter(r => !r.sep && r.text.trim());
        const opRows = sepIdx >= 0 ? rows.slice(sepIdx + 1).filter(r => !r.sep && r.text.trim()) : [];
        if (attrRows.length) { el.properties.attributes = attrRows.map(r => parseAttribute(r.text)); el.properties.showAttributes = true; }
        if (opRows.length) { el.properties.operations = opRows.map(r => parseOperation(r.text)); el.properties.showOperations = true; }
      }
    }
    delete (el as any).__sheet;
    delete (el.properties as any).__nrows;
  }

  // Package membership: round-trip `__parentId` first, else infer geometrically
  // for foreign files (an element whose centre sits inside a package's bounds).
  const packages = elements.filter(e => e.type === "uml-package");
  for (const el of elements) {
    if (el.type === "uml-package" || (el.properties as any).__parentId) continue;
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    let best: DiagramElement | undefined, bestArea = Infinity;
    for (const p of packages) {
      if (p.id === el.id) continue;
      if (cx >= p.x && cx <= p.x + p.width && cy >= p.y && cy <= p.y + p.height) {
        const area = p.width * p.height;
        if (area < bestArea) { bestArea = area; best = p; } // innermost package wins
      }
    }
    if (best) el.parentId = best.id;
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

  // Geometric fallback for an endpoint Visio left UNGLUED — e.g. the user moved
  // a shape in Visio and one end of a connector detached from <Connects>. Resolve
  // it from the connector's cached Begin/End page point to the nearest element.
  const nearestEl = (inchX?: number, inchY?: number): string | undefined => {
    if (inchX === undefined || inchY === undefined) return undefined;
    const px = inchX * PX, py = (pageH - inchY) * PX;
    let bestId: string | undefined, bestD = Infinity;
    for (const el of elements) {
      const ox = Math.max(el.x - px, 0, px - (el.x + el.width));
      const oy = Math.max(el.y - py, 0, py - (el.y + el.height));
      const dd = ox * ox + oy * oy;
      if (dd < bestD) { bestD = dd; bestId = el.id; }
    }
    return bestD <= (PX * 1.5) ** 2 ? bestId : undefined; // within ~1.5" of a shape
  };

  for (const s of shapes) {
    const sheetId = attr(s, "ID");
    const masterId = attr(s, "Master");
    const nameU = baseNameU(masterId ? (id2name[masterId] ?? "") : (attr(s, "NameU") ?? ""));
    if (!CONN_TYPE[nameU]) continue;
    const ep = endpoints.get(sheetId!);
    let srcEl = ep?.begin ? sheetToElId.get(ep.begin) : undefined;
    let tgtEl = ep?.end ? sheetToElId.get(ep.end) : undefined;
    if (!srcEl) srcEl = nearestEl(cellV(s, "BeginX"), cellV(s, "BeginY"));
    if (!tgtEl) tgtEl = nearestEl(cellV(s, "EndX"), cellV(s, "EndY"));
    if (!srcEl || !tgtEl) { connectorsSkipped++; continue; }

    const blob = propVal(s, "DgxUmlRel");
    let type: ConnectorType = CONN_TYPE[nameU];
    // Read back EVERY field the export blob carries (lossless round-trip).
    let d: Record<string, unknown> = {};
    if (blob) {
      try { d = JSON.parse(blob); type = (d.type as ConnectorType) ?? type; } catch { /* keep NameU type */ }
    }
    let routingType: Connector["routingType"] = (d.routingType as Connector["routingType"]) ?? "rectilinear";
    // Containment / note-anchor are always direct even if the blob lacked it.
    if (type === "uml-containment" || type === "uml-note-anchor") routingType = "direct";

    // Endpoint + multiplicity/role resolution. Aggregation/composition draw the
    // shared-diamond at the Visio BEGIN end (both foreign files AND our own
    // exports, which glue Begin→target to render the diamond correctly), whereas
    // Diagramatix renders it at the TARGET — so we swap begin↔end for those two
    // types in BOTH paths (source = Visio end, target = Visio begin/diamond).
    // Blob multiplicities are already in Diagramatix source/target terms and
    // must NOT be re-swapped; foreign labels are in Visio begin/end terms and are
    // swapped alongside the endpoints.
    const diamondSwap = type === "uml-aggregation" || type === "uml-composition";
    let srcId = srcEl, tgtId = tgtEl;
    let sMult = d.sourceMultiplicity as string | undefined;
    let tMult = d.targetMultiplicity as string | undefined;
    let sRole = d.sourceRole as string | undefined;
    let tRole = d.targetRole as string | undefined;
    let label = d.associationName as string | undefined;
    if (!blob) {
      const L = foreignRelLabels(s);
      sMult = L.begin.mult; tMult = L.end.mult; sRole = L.begin.role; tRole = L.end.role;
      // The Microsoft UML Association master stores the relationship name in a
      // User cell (`User.RelationshipName`). Our own export (a self-contained
      // Type='Shape' connector) instead puts it in the connector's OWN <Text>.
      // Prefer RelationshipName, then a centred text sub-shape, then the
      // connector's own text — the latter only if it isn't a multiplicity token
      // (a foreign MS connector's own text is often a stray "1").
      const relName = propVal(s, "RelationshipName");
      const ownText = firstText(s);
      const ownName = ownText.trim() && !isMult(ownText.replace(/\s*[▶◀]$/, "").trim())
        ? ownText.trim() : undefined;
      const rawName = (relName && relName.trim()) ? relName.trim() : (L.name || ownName);
      if (rawName) {
        // We export reading direction as a ▶/◀ glyph appended to the name
        // (option 1). Strip it back into readingDirection on re-import.
        const rd = /\s*▶$/.test(rawName) ? "to-target" : /\s*◀$/.test(rawName) ? "to-source" : undefined;
        label = rawName.replace(/\s*[▶◀]$/, "").trim() || undefined;
        if (rd) (d as Record<string, unknown>).readingDirection = rd;
      }
      if (diamondSwap) {
        [sMult, tMult] = [tMult, sMult];
        [sRole, tRole] = [tRole, sRole];
      }
    }
    if (diamondSwap) [srcId, tgtId] = [tgtId, srcId];

    // Reading direction encoded as a leading/trailing directional char in the
    // label (`< > ^ v` or the ◄►▲▼ variants), space-separated so real names
    // aren't mis-parsed. Translate to readingDirection by which element the char
    // points at, then strip it. (A blob-set direction already won.)
    if (label && !(d as Record<string, unknown>).readingDirection) {
      const t0 = label.trim();
      let ch = "", clean = t0;
      let mm = t0.match(/^([<>^v◄►▶▲▼])\s+(.+)$/i) || t0.match(/^([<>^v◄►▶▲▼])$/i);
      if (mm) { ch = mm[1]; clean = mm[2] ?? ""; }
      else if ((mm = t0.match(/^(.+?)\s+([<>^v◄►▶▲▼])$/i))) { ch = mm[2]; clean = mm[1]; }
      if (ch) {
        const DIRV: Record<string, { x: number; y: number }> = {
          "<": { x: -1, y: 0 }, "◄": { x: -1, y: 0 },
          ">": { x: 1, y: 0 }, "►": { x: 1, y: 0 }, "▶": { x: 1, y: 0 },
          "^": { x: 0, y: -1 }, "▲": { x: 0, y: -1 },
          "v": { x: 0, y: 1 }, "▼": { x: 0, y: 1 },
        };
        const v = DIRV[ch.toLowerCase()] ?? DIRV[ch];
        const se = elements.find(e => e.id === srcId), te = elements.find(e => e.id === tgtId);
        if (v && se && te) {
          const mx = (se.x + se.width / 2 + te.x + te.width / 2) / 2;
          const my = (se.y + se.height / 2 + te.y + te.height / 2) / 2;
          const dotT = v.x * (te.x + te.width / 2 - mx) + v.y * (te.y + te.height / 2 - my);
          const dotS = v.x * (se.x + se.width / 2 - mx) + v.y * (se.y + se.height / 2 - my);
          (d as Record<string, unknown>).readingDirection = dotT >= dotS ? "to-target" : "to-source";
          label = clean || undefined;
        }
      }
    }
    connectors.push({
      id: propVal(s, "BpmnId") ?? `conn-${sheetId}`,
      sourceId: srcId, targetId: tgtId, sourceSide: "right", targetSide: "left",
      type,
      directionType: (d.directionType as Connector["directionType"]) ?? "non-directed",
      routingType,
      sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
      sourceMultiplicity: sMult,
      targetMultiplicity: tMult,
      sourceRole: sRole,
      targetRole: tRole,
      label,
      ...(d.arrowAtSource ? { arrowAtSource: true } : {}),
      ...(d.readingDirection ? { readingDirection: d.readingDirection as Connector["readingDirection"] } : {}),
      ...(d.weight ? { weight: d.weight as number } : {}),
      ...(d.dashed ? { dashed: true } : {}),
      ...(d.containmentSwapEnd ? { containmentSwapEnd: true } : {}),
    });
  }

  // Reading-direction arrowheads: our export emits a `UmlReadingDir` filled
  // triangle glued near a connector's midpoint, pointing toward the source/target
  // element. Our own files recover readingDirection from the blob (which wins);
  // for a blob-stripped/foreign re-import, recover it from where the triangle
  // points (assigned to the nearest connector by midpoint).
  for (const s of shapes) {
    if (baseNameU(attr(s, "NameU") ?? "") !== "UmlReadingDir") continue;
    const px = (cellV(s, "PinX") ?? 0) * PX;
    const py = (pageH - (cellV(s, "PinY") ?? 0)) * PX;
    const ang = cellV(s, "Angle") ?? 0;
    const dirx = Math.cos(ang), diry = -Math.sin(ang); // Visio Y-up CCW → screen Y-down
    let best: Connector | undefined, bestD = Infinity;
    for (const c of connectors) {
      const se = elements.find(e => e.id === c.sourceId), te = elements.find(e => e.id === c.targetId);
      if (!se || !te) continue;
      const mx = (se.x + se.width / 2 + te.x + te.width / 2) / 2;
      const my = (se.y + se.height / 2 + te.y + te.height / 2) / 2;
      const dd = (mx - px) ** 2 + (my - py) ** 2;
      if (dd < bestD) { bestD = dd; best = c; }
    }
    if (!best || best.readingDirection) continue; // blob-set direction wins
    const se = elements.find(e => e.id === best!.sourceId)!;
    const te = elements.find(e => e.id === best!.targetId)!;
    const dotT = dirx * (te.x + te.width / 2 - px) + diry * (te.y + te.height / 2 - py);
    const dotS = dirx * (se.x + se.width / 2 - px) + diry * (se.y + se.height / 2 - py);
    best.readingDirection = dotT >= dotS ? "to-target" : "to-source";
  }

  const classifyMaster = (nameU: string): string =>
    CONN_TYPE[nameU] ? `(connector) ${CONN_TYPE[nameU]}`
    : ELEMENT_NAMES.has(nameU) ? "element"
    : (nameU === "Member" || nameU === "Separator") ? "member row"
    : "skipped";

  // The connectors carry stub sides + empty waypoints — route them against the
  // imported element bounds so they render correctly on first open.
  const routedConnectors = recomputeAllConnectors(connectors, elements);
  const data: DiagramData = { elements, connectors: routedConnectors, viewport: { x: 0, y: 0, zoom: 1 } };
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

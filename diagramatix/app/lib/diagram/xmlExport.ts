/**
 * Diagramatix XML export helpers — shared by project-level and single-diagram exports.
 * The XML schema is documented in public/diagramatix-export.xsd
 * (namespace: http://diagramatix.com/export/1.0).
 */
import type { DiagramData } from "./types";

export const NS = "http://diagramatix.com/export/1.0";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function attr(name: string, val: string | number | boolean | undefined | null): string {
  if (val === undefined || val === null) return "";
  return ` ${name}="${esc(String(val))}"`;
}

export function pointXml(
  tag: string,
  p: { x: number; y: number } | undefined | null,
  indent: string,
): string {
  if (!p) return "";
  return `${indent}<${tag}${attr("x", p.x)}${attr("y", p.y)}/>\n`;
}

export function diagramDataXml(dd: DiagramData, ind: string): string {
  let x = `${ind}<dgx:data${attr("fontSize", dd.fontSize)}${attr("connectorFontSize", dd.connectorFontSize)}${attr("titleFontSize", dd.titleFontSize)}>\n`;

  // Elements
  x += `${ind}  <dgx:elements>\n`;
  for (const el of dd.elements) {
    x += `${ind}    <dgx:element${attr("id", el.id)}${attr("type", el.type)}${attr("x", el.x)}${attr("y", el.y)}${attr("width", el.width)}${attr("height", el.height)}`;
    x += `${attr("parentId", el.parentId)}${attr("boundaryHostId", el.boundaryHostId)}${attr("taskType", el.taskType)}${attr("gatewayType", el.gatewayType)}`;
    x += `${attr("eventType", el.eventType)}${attr("repeatType", el.repeatType)}${attr("flowType", el.flowType)}>\n`;
    x += `${ind}      <dgx:label>${esc(el.label)}</dgx:label>\n`;
    if (el.properties && Object.keys(el.properties).length > 0) {
      x += propertiesXml(el.properties, `${ind}      `);
    }
    x += `${ind}    </dgx:element>\n`;
  }
  x += `${ind}  </dgx:elements>\n`;

  // Connectors
  x += `${ind}  <dgx:connectors>\n`;
  for (const c of dd.connectors) {
    x += connectorXml(c, `${ind}    `);
  }
  x += `${ind}  </dgx:connectors>\n`;

  // Viewport
  x += `${ind}  <dgx:viewport${attr("x", dd.viewport.x)}${attr("y", dd.viewport.y)}${attr("zoom", dd.viewport.zoom)}/>\n`;

  // Title
  if (dd.title) {
    x += `${ind}  <dgx:title${attr("version", dd.title.version)}${attr("authors", dd.title.authors)}${attr("status", dd.title.status)}${attr("showTitle", dd.title.showTitle)}/>\n`;
  }

  x += `${ind}</dgx:data>\n`;
  return x;
}

export function propertiesXml(props: Record<string, unknown>, ind: string): string {
  let x = `${ind}<dgx:properties>\n`;
  for (const [key, val] of Object.entries(props)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      x += `${ind}  <dgx:property${attr("name", key)}${attr("type", "array")}>\n`;
      for (const item of val) {
        if (typeof item === "object" && item !== null) {
          x += `${ind}    <dgx:item>\n`;
          for (const [fk, fv] of Object.entries(item as Record<string, unknown>)) {
            if (fv !== undefined && fv !== null) {
              x += `${ind}      <dgx:field${attr("name", fk)}>${esc(String(fv))}</dgx:field>\n`;
            }
          }
          x += `${ind}    </dgx:item>\n`;
        } else {
          x += `${ind}    <dgx:item><dgx:field${attr("name", "value")}>${esc(String(item))}</dgx:field></dgx:item>\n`;
        }
      }
      x += `${ind}  </dgx:property>\n`;
    } else if (typeof val === "object") {
      x += `${ind}  <dgx:property${attr("name", key)}>${esc(JSON.stringify(val))}</dgx:property>\n`;
    } else {
      x += `${ind}  <dgx:property${attr("name", key)}>${esc(String(val))}</dgx:property>\n`;
    }
  }
  x += `${ind}</dgx:properties>\n`;
  return x;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function connectorXml(c: any, ind: string): string {
  let x = `${ind}<dgx:connector${attr("id", c.id)}${attr("sourceId", c.sourceId)}${attr("targetId", c.targetId)}`;
  x += `${attr("type", c.type)}${attr("sourceSide", c.sourceSide)}${attr("targetSide", c.targetSide)}`;
  x += `${attr("directionType", c.directionType)}${attr("routingType", c.routingType)}`;
  x += `${attr("sourceInvisibleLeader", c.sourceInvisibleLeader || undefined)}${attr("targetInvisibleLeader", c.targetInvisibleLeader || undefined)}`;
  x += `${attr("labelOffsetX", c.labelOffsetX)}${attr("labelOffsetY", c.labelOffsetY)}${attr("labelWidth", c.labelWidth)}`;
  x += `${attr("sourceOffsetAlong", c.sourceOffsetAlong)}${attr("targetOffsetAlong", c.targetOffsetAlong)}`;
  x += `${attr("labelAnchor", c.labelAnchor)}${attr("arrowAtSource", c.arrowAtSource || undefined)}>\n`;

  if (c.waypoints && c.waypoints.length > 0) {
    x += `${ind}  <dgx:waypoints>\n`;
    for (const wp of c.waypoints) x += `${ind}    <dgx:point${attr("x", wp.x)}${attr("y", wp.y)}/>\n`;
    x += `${ind}  </dgx:waypoints>\n`;
  }

  if (c.label) x += `${ind}  <dgx:label>${esc(c.label)}</dgx:label>\n`;

  x += pointXml("dgx:cp1RelOffset", c.cp1RelOffset as { x: number; y: number } | undefined, `${ind}  `);
  x += pointXml("dgx:cp2RelOffset", c.cp2RelOffset as { x: number; y: number } | undefined, `${ind}  `);

  if (c.labelMode || c.transitionEvent || c.transitionGuard || c.transitionActions) {
    x += `${ind}  <dgx:transition${attr("labelMode", c.labelMode as string)}${attr("event", c.transitionEvent as string)}${attr("guard", c.transitionGuard as string)}${attr("actions", c.transitionActions as string)}/>\n`;
  }

  const ends = [["sourceEnd", "source"], ["targetEnd", "target"]] as const;
  for (const [tag, prefix] of ends) {
    const role = c[`${prefix}Role`] as string | undefined;
    const mult = c[`${prefix}Multiplicity`] as string | undefined;
    const vis = c[`${prefix}Visibility`] as string | undefined;
    const ordered = c[`${prefix}Ordered`] as boolean | undefined;
    const unique = c[`${prefix}Unique`] as boolean | undefined;
    const qualifier = c[`${prefix}Qualifier`] as string | undefined;
    const propStr = c[`${prefix}PropertyString`] as string | undefined;
    if (role || mult || vis || ordered || unique || qualifier || propStr) {
      x += `${ind}  <dgx:${tag}${attr("role", role)}${attr("multiplicity", mult)}${attr("visibility", vis)}${attr("ordered", ordered)}${attr("unique", unique)}${attr("qualifier", qualifier)}${attr("propertyString", propStr)}>\n`;
      x += pointXml(`dgx:roleOffset`, c[`${prefix}RoleOffset`] as { x: number; y: number } | undefined, `${ind}    `);
      x += pointXml(`dgx:multOffset`, c[`${prefix}MultOffset`] as { x: number; y: number } | undefined, `${ind}    `);
      x += pointXml(`dgx:constraintOffset`, c[`${prefix}ConstraintOffset`] as { x: number; y: number } | undefined, `${ind}    `);
      x += pointXml(`dgx:uniqueOffset`, c[`${prefix}UniqueOffset`] as { x: number; y: number } | undefined, `${ind}    `);
      x += `${ind}  </dgx:${tag}>\n`;
    }
  }

  if (c.associationName) {
    x += `${ind}  <dgx:associationName${attr("name", c.associationName)}${attr("readingDirection", c.readingDirection as string)}>\n`;
    x += pointXml("dgx:offset", c.associationNameOffset as { x: number; y: number } | undefined, `${ind}    `);
    x += `${ind}  </dgx:associationName>\n`;
  }

  x += `${ind}</dgx:connector>\n`;
  return x;
}

/**
 * Parse a Diagramatix XML export back into the JSON shape that the importer
 * already understands. Throws on malformed input.
 *
 * The result mirrors what `JSON.parse(<exported .json>)` would yield, so it
 * can be fed directly into the existing import flow:
 *   {
 *     schemaVersion, appVersion, exportedAt,
 *     project:    { name, description?, ownerName?, colorConfig? },
 *     diagrams:   [{ originalId, name, type, data, colorConfig?, displayMode? }],
 *     folderTree?: { folders, diagramFolderMap, diagramOrder, folderOrder }
 *   }
 *
 * No XSD validation is performed — the importer trusts the file. Bad input
 * raises an Error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseDiagramatixXml(xmlText: string): any {
  if (typeof DOMParser === "undefined") {
    throw new Error("XML import requires a browser environment (DOMParser)");
  }
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid XML: " + (parserError.textContent ?? "parse error"));
  }
  const root = doc.documentElement;
  if (!root || root.localName !== "diagramatix-export") {
    throw new Error("Not a Diagramatix XML export (root element is not <diagramatix-export>)");
  }

  const getChild = (parent: Element, name: string): Element | null => {
    for (const c of Array.from(parent.children)) {
      if (c.localName === name) return c;
    }
    return null;
  };
  const getChildren = (parent: Element, name: string): Element[] => {
    const out: Element[] = [];
    for (const c of Array.from(parent.children)) {
      if (c.localName === name) out.push(c);
    }
    return out;
  };
  const txt = (parent: Element | null, name: string): string | undefined => {
    if (!parent) return undefined;
    const el = getChild(parent, name);
    return el?.textContent ?? undefined;
  };
  const num = (s: string | null): number | undefined => {
    if (s == null || s === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };
  const bool = (s: string | null): boolean | undefined => {
    if (s == null || s === "") return undefined;
    return s === "true" || s === "1";
  };
  const json = (s: string | undefined): unknown => {
    if (!s) return undefined;
    try { return JSON.parse(s); } catch { return undefined; }
  };

  // ---- Envelope attributes ----
  const schemaVersion = root.getAttribute("schemaVersion") ?? "";
  const appVersion = root.getAttribute("appVersion") ?? "";
  const exportedAt = root.getAttribute("exportedAt") ?? "";

  // ---- Project ----
  const projectEl = getChild(root, "project");
  const project = {
    name: txt(projectEl, "name") ?? "",
    description: txt(projectEl, "description") ?? "",
    ownerName: txt(projectEl, "ownerName") ?? "",
    colorConfig: json(txt(projectEl, "colorConfig")) ?? {},
  };

  // ---- Diagrams ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diagrams: any[] = [];
  const diagramsEl = getChild(root, "diagrams");
  if (diagramsEl) {
    for (const dEl of getChildren(diagramsEl, "diagram")) {
      const originalId = dEl.getAttribute("originalId") ?? "";
      const type = dEl.getAttribute("type") ?? "context";
      const displayMode = dEl.getAttribute("displayMode") ?? undefined;
      const name = txt(dEl, "name") ?? "(unnamed)";
      const dataEl = getChild(dEl, "data");
      const data = dataEl ? parseDiagramData(dataEl) : { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } };
      const colorConfig = json(txt(dEl, "colorConfig"));
      diagrams.push({ originalId, name, type, data, colorConfig, displayMode });
    }
  }

  // ---- Folder tree ----
  let folderTree: unknown = undefined;
  const ftEl = getChild(root, "folderTree");
  if (ftEl) {
    const folders: Array<{ id: string; name: string; parentId: string | null; collapsed?: boolean }> = [];
    const foldersEl = getChild(ftEl, "folders");
    if (foldersEl) {
      for (const f of getChildren(foldersEl, "folder")) {
        folders.push({
          id: f.getAttribute("id") ?? "",
          name: f.getAttribute("name") ?? "",
          parentId: f.getAttribute("parentId") || null,
          collapsed: bool(f.getAttribute("collapsed")),
        });
      }
    }
    const diagramFolderMap: Record<string, string> = {};
    const dfmEl = getChild(ftEl, "diagramFolderMap");
    if (dfmEl) {
      for (const e of getChildren(dfmEl, "entry")) {
        const k = e.getAttribute("key");
        const v = e.getAttribute("value");
        if (k && v) diagramFolderMap[k] = v;
      }
    }
    const parseGroup = (containerName: string): Record<string, string[]> => {
      const out: Record<string, string[]> = {};
      const containerEl = getChild(ftEl, containerName);
      if (!containerEl) return out;
      for (const g of getChildren(containerEl, "group")) {
        const k = g.getAttribute("key");
        if (!k) continue;
        out[k] = getChildren(g, "ref")
          .map(r => r.getAttribute("id") ?? "")
          .filter(Boolean);
      }
      return out;
    };
    folderTree = {
      folders,
      diagramFolderMap,
      diagramOrder: parseGroup("diagramOrder"),
      folderOrder: parseGroup("folderOrder"),
    };
  }

  return {
    schemaVersion,
    appVersion,
    exportedAt,
    project,
    diagrams,
    ...(folderTree ? { folderTree } : {}),
  };

  // ---- Helpers ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function parseDiagramData(dataEl: Element): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
      elements: [],
      connectors: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const fontSize = num(dataEl.getAttribute("fontSize"));
    const connectorFontSize = num(dataEl.getAttribute("connectorFontSize"));
    const titleFontSize = num(dataEl.getAttribute("titleFontSize"));
    if (fontSize !== undefined) data.fontSize = fontSize;
    if (connectorFontSize !== undefined) data.connectorFontSize = connectorFontSize;
    if (titleFontSize !== undefined) data.titleFontSize = titleFontSize;

    // Elements
    const elementsEl = getChild(dataEl, "elements");
    if (elementsEl) {
      for (const eEl of getChildren(elementsEl, "element")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el: any = {
          id: eEl.getAttribute("id") ?? "",
          type: eEl.getAttribute("type") ?? "",
          x: num(eEl.getAttribute("x")) ?? 0,
          y: num(eEl.getAttribute("y")) ?? 0,
          width: num(eEl.getAttribute("width")) ?? 0,
          height: num(eEl.getAttribute("height")) ?? 0,
          label: txt(eEl, "label") ?? "",
          properties: {},
        };
        const optionalAttrs = ["parentId", "boundaryHostId", "taskType", "gatewayType", "eventType", "repeatType", "flowType"];
        for (const a of optionalAttrs) {
          const v = eEl.getAttribute(a);
          if (v != null && v !== "") el[a] = v;
        }
        const propsEl = getChild(eEl, "properties");
        if (propsEl) el.properties = parseProperties(propsEl);
        data.elements.push(el);
      }
    }

    // Connectors
    const connectorsEl = getChild(dataEl, "connectors");
    if (connectorsEl) {
      for (const cEl of getChildren(connectorsEl, "connector")) {
        data.connectors.push(parseConnector(cEl));
      }
    }

    // Viewport
    const vpEl = getChild(dataEl, "viewport");
    if (vpEl) {
      data.viewport = {
        x: num(vpEl.getAttribute("x")) ?? 0,
        y: num(vpEl.getAttribute("y")) ?? 0,
        zoom: num(vpEl.getAttribute("zoom")) ?? 1,
      };
    }

    // Title
    const titleEl = getChild(dataEl, "title");
    if (titleEl) {
      data.title = {
        version: titleEl.getAttribute("version") ?? "",
        authors: titleEl.getAttribute("authors") ?? "",
        status: titleEl.getAttribute("status") ?? "",
        showTitle: bool(titleEl.getAttribute("showTitle")) ?? false,
      };
    }

    return data;
  }

  function parseProperties(propsEl: Element): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const p of getChildren(propsEl, "property")) {
      const name = p.getAttribute("name");
      if (!name) continue;
      const type = p.getAttribute("type");
      if (type === "array") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const arr: any[] = [];
        for (const item of getChildren(p, "item")) {
          // Plain value-only items
          const fields = getChildren(item, "field");
          if (fields.length === 1 && fields[0].getAttribute("name") === "value") {
            arr.push(fields[0].textContent ?? "");
          } else {
            const obj: Record<string, unknown> = {};
            for (const f of fields) {
              const fname = f.getAttribute("name");
              if (fname) obj[fname] = f.textContent ?? "";
            }
            arr.push(obj);
          }
        }
        out[name] = arr;
      } else {
        // Try to parse as JSON object first (mixed content), else string
        const text = p.textContent ?? "";
        if (text.startsWith("{") || text.startsWith("[")) {
          try { out[name] = JSON.parse(text); continue; } catch { /* fallthrough */ }
        }
        // Coerce booleans/numbers when obvious
        if (text === "true") out[name] = true;
        else if (text === "false") out[name] = false;
        else if (/^-?\d+(?:\.\d+)?$/.test(text)) out[name] = Number(text);
        else out[name] = text;
      }
    }
    return out;
  }

  function parseConnector(cEl: Element): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      id: cEl.getAttribute("id") ?? "",
      sourceId: cEl.getAttribute("sourceId") ?? "",
      targetId: cEl.getAttribute("targetId") ?? "",
      type: cEl.getAttribute("type") ?? "sequence",
      sourceSide: cEl.getAttribute("sourceSide") ?? undefined,
      targetSide: cEl.getAttribute("targetSide") ?? undefined,
      directionType: cEl.getAttribute("directionType") ?? undefined,
      routingType: cEl.getAttribute("routingType") ?? undefined,
      waypoints: [],
    };
    const numAttrs = ["labelOffsetX", "labelOffsetY", "labelWidth", "sourceOffsetAlong", "targetOffsetAlong"];
    for (const a of numAttrs) {
      const v = num(cEl.getAttribute(a));
      if (v !== undefined) c[a] = v;
    }
    const boolAttrs = ["sourceInvisibleLeader", "targetInvisibleLeader", "arrowAtSource"];
    for (const a of boolAttrs) {
      const v = bool(cEl.getAttribute(a));
      if (v !== undefined) c[a] = v;
    }
    const strAttrs = ["labelAnchor"];
    for (const a of strAttrs) {
      const v = cEl.getAttribute(a);
      if (v != null && v !== "") c[a] = v;
    }

    // Waypoints
    const wpsEl = getChild(cEl, "waypoints");
    if (wpsEl) {
      for (const p of getChildren(wpsEl, "point")) {
        c.waypoints.push({
          x: num(p.getAttribute("x")) ?? 0,
          y: num(p.getAttribute("y")) ?? 0,
        });
      }
    }
    // Label
    const labelEl = getChild(cEl, "label");
    if (labelEl) c.label = labelEl.textContent ?? "";
    // Curve control points
    for (const tag of ["cp1RelOffset", "cp2RelOffset"]) {
      const e = getChild(cEl, tag);
      if (e) c[tag] = { x: num(e.getAttribute("x")) ?? 0, y: num(e.getAttribute("y")) ?? 0 };
    }
    // Transition
    const tEl = getChild(cEl, "transition");
    if (tEl) {
      const lm = tEl.getAttribute("labelMode"); if (lm) c.labelMode = lm;
      const ev = tEl.getAttribute("event"); if (ev) c.transitionEvent = ev;
      const gd = tEl.getAttribute("guard"); if (gd) c.transitionGuard = gd;
      const ac = tEl.getAttribute("actions"); if (ac) c.transitionActions = ac;
    }
    // UML association ends
    for (const [tag, prefix] of [["sourceEnd", "source"], ["targetEnd", "target"]] as const) {
      const e = getChild(cEl, tag);
      if (!e) continue;
      const role = e.getAttribute("role"); if (role) c[`${prefix}Role`] = role;
      const mult = e.getAttribute("multiplicity"); if (mult) c[`${prefix}Multiplicity`] = mult;
      const vis = e.getAttribute("visibility"); if (vis) c[`${prefix}Visibility`] = vis;
      const ord = bool(e.getAttribute("ordered")); if (ord !== undefined) c[`${prefix}Ordered`] = ord;
      const uniq = bool(e.getAttribute("unique")); if (uniq !== undefined) c[`${prefix}Unique`] = uniq;
      const qual = e.getAttribute("qualifier"); if (qual) c[`${prefix}Qualifier`] = qual;
      const propStr = e.getAttribute("propertyString"); if (propStr) c[`${prefix}PropertyString`] = propStr;
      for (const off of ["roleOffset", "multOffset", "constraintOffset", "uniqueOffset"]) {
        const ofEl = getChild(e, off);
        if (ofEl) c[`${prefix}${off[0].toUpperCase()}${off.slice(1)}`] = { x: num(ofEl.getAttribute("x")) ?? 0, y: num(ofEl.getAttribute("y")) ?? 0 };
      }
    }
    // Association name
    const anEl = getChild(cEl, "associationName");
    if (anEl) {
      const nm = anEl.getAttribute("name"); if (nm) c.associationName = nm;
      const rd = anEl.getAttribute("readingDirection"); if (rd) c.readingDirection = rd;
      const ofEl = getChild(anEl, "offset");
      if (ofEl) c.associationNameOffset = { x: num(ofEl.getAttribute("x")) ?? 0, y: num(ofEl.getAttribute("y")) ?? 0 };
    }

    return c;
  }
}

/**
 * Build a single-diagram XML export wrapped in the same diagramatix-export
 * envelope used for project exports. The `diagrams` block contains exactly
 * one entry; project metadata is set to a minimal placeholder; folderTree
 * is omitted.
 */
export function buildSingleDiagramXml(args: {
  schemaVersion: string;
  appVersion: string;
  diagramName: string;
  diagramType: string;
  diagramData: DiagramData;
  diagramId: string;
  displayMode?: string;
  diagramColorConfig?: unknown;
  projectName?: string;
}): string {
  const exportedAt = new Date().toISOString();
  let x = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  x += `<dgx:diagramatix-export xmlns:dgx="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} /api/schema"${attr("schemaVersion", args.schemaVersion)}${attr("appVersion", args.appVersion)}${attr("exportedAt", exportedAt)}>\n`;

  // Project (minimal — single-diagram exports don't have a real project context)
  x += `  <dgx:project>\n`;
  x += `    <dgx:name>${esc(args.projectName ?? "(single diagram)")}</dgx:name>\n`;
  x += `  </dgx:project>\n`;

  // One diagram
  x += `  <dgx:diagrams>\n`;
  x += `    <dgx:diagram${attr("originalId", args.diagramId)}${attr("type", args.diagramType)}${attr("displayMode", args.displayMode)}>\n`;
  x += `      <dgx:name>${esc(args.diagramName)}</dgx:name>\n`;
  x += diagramDataXml(args.diagramData, "      ");
  if (args.diagramColorConfig && Object.keys(args.diagramColorConfig as Record<string, unknown>).length > 0) {
    x += `      <dgx:colorConfig>${esc(JSON.stringify(args.diagramColorConfig))}</dgx:colorConfig>\n`;
  }
  x += `    </dgx:diagram>\n`;
  x += `  </dgx:diagrams>\n`;

  x += `</dgx:diagramatix-export>\n`;
  return x;
}

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

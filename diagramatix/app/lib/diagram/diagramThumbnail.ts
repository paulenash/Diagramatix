/**
 * The small picture on a Project-screen diagram tile, as a list of plain SVG
 * primitives. Pure (no React, no DOM), so it is testable and cheap: one pass
 * over the elements, memoised by the tile.
 *
 * Paul, 2026-09-27: "Redo the diagram images displayed on the Diagram tiles in
 * more realistic colour matching the actual diagram colours better. In BPMN
 * diagrams the pool and lane background colours are shown too dark. Archimate
 * diagrams are all washed out. Improve them for all diagram types."
 *
 * EVERY colour here comes from canvasPaint.ts — the module the canvas itself
 * paints with — and every nesting depth from nestingDepth.ts, which the canvas
 * uses too. This file decides only GEOMETRY (simplified: no labels, no
 * markers, no arrowheads) and the painting ORDER, which follows the canvas's
 * layers: pools, lanes, containers, expanded subprocesses, connectors, flow
 * elements, data artifacts, boundary events, groups, problem markers, review
 * notes.
 */
import type { Connector, DiagramData, DiagramElement, Point } from "./types";
import type { SymbolColorConfig } from "./colors";
import {
  elementFill, nestedContainerFill, poolPaint, lanePaint, headedContainerPaint, archimatePaint,
  annotationColor, connectorStroke, connectorDash, visibleWaypoints, painPointStarPoints,
  SHAPE_STROKE, FLOWCHART_STROKE, PAIN_POINT_STROKE, ISSUE_STROKE, REVIEW_COMMENT_PALETTE,
  UML_PACKAGE_BODY_OPACITY, ARCHI_GROUPING_STROKE, ARCHI_GROUPING_DASH, ARCHI_STROKE_WIDTH, CONTAINER_HEADER_H,
  ANNOTATION_BOX_FILL, FORK_JOIN_FILL, GROUP_DASH,
} from "./canvasPaint";
import { sublaneIdsOf, laneDepths, sameTypeAncestorDepths, archimateDescendantDepths } from "./nestingDepth";
import { getLaneHeaderWidth, getPoolHeaderWidth, getVSwimlaneHeaderHeight } from "./containerMetrics";
import { computePackageTab } from "./textMetrics";

/** One SVG primitive. Coordinates are diagram (world) units. */
export type ThumbShape =
  | { k: "rect"; x: number; y: number; w: number; h: number; rx?: number; fill: string; fillOpacity?: number; stroke?: string; sw?: number; dash?: string }
  | { k: "circle"; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number }
  | { k: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: string; stroke?: string; sw?: number }
  | { k: "polygon"; points: string; fill: string; stroke?: string; sw?: number }
  | { k: "path"; d: string; fill: string; fillOpacity?: number; stroke?: string; sw?: number; dash?: string }
  | { k: "polyline"; points: string; stroke: string; sw: number; dash?: string };

export interface Thumbnail {
  viewBox: string;
  shapes: ThumbShape[];
}

/** Padding (world units) around the diagram in the picture. */
export const THUMB_PAD = 10;
/**
 * Strokes are drawn as if the picture were zoomed out no further than this.
 * A wide diagram squeezed into a 168px tile is at ~10% zoom, where the canvas's
 * 1.5px outline would be 0.15px — gone, and every shape reads as a pale smudge.
 * Holding strokes at a third of their canvas width keeps the outlines (and the
 * ArchiMate layer borders, which are what make those shapes read) honest
 * without letting them swamp the fills.
 */
export const THUMB_MIN_STROKE_ZOOM = 1 / 3;

const DATA_ARTIFACTS = new Set(["data-object", "data-store", "text-annotation"]);
const CONTAINERS = new Set(["system-boundary", "composite-state", "process-group", "uml-package"]);

function isHidden(el: DiagramElement, data: DiagramData): boolean {
  if (el.type === "subprocess" && el.properties?.isReturnLink) return true; // never drawn on the canvas
  if (el.type === "uml-pain-point" && data.showPainPoints === false) return true;
  if (el.type === "uml-issue" && data.showIssues === false) return true;
  if (el.type === "review-comment" && data.showReviewComments === false) return true;
  return false;
}

/** Canvas layer an element paints in (lower = further back). */
function layerOf(el: DiagramElement): number {
  if (el.type === "pool") return 0;
  if (el.type === "lane" || el.type === "flowchart-vswimlane") return 1;
  if (CONTAINERS.has(el.type)) return 2;
  if (el.type === "subprocess-expanded") return 3;
  if (el.type === "group") return 7;
  if (el.type === "uml-pain-point" || el.type === "uml-issue") return 8;
  if (el.type === "review-comment") return 9;
  if (el.boundaryHostId) return 6;
  if (DATA_ARTIFACTS.has(el.type)) return 5;
  return 4;
}
/** Layers painted BEFORE the connectors. */
const BEHIND_CONNECTORS = 3;

const pts = (p: Array<[number, number]>) => p.map(([a, b]) => `${a},${b}`).join(" ");

/**
 * Build the tile picture for `data`, drawn in `colors` (already the diagram's
 * effective config — effectiveSymbolColors), for a picture box of
 * `boxW` × `boxH` CSS pixels. Null when there is nothing to draw.
 */
export function buildDiagramThumbnail(
  data: unknown,
  colors: SymbolColorConfig | undefined,
  boxW: number,
  boxH: number,
): Thumbnail | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as DiagramData;
  const all = Array.isArray(d.elements) ? d.elements : [];
  const els = all.filter((el) => el && typeof el.x === "number" && !isHidden(el, d));
  if (!els.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of els) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  const vw = maxX - minX + THUMB_PAD * 2;
  const vh = maxY - minY + THUMB_PAD * 2;
  // The picture is fitted ("meet") into the box; this is its zoom.
  const zoom = Math.min(boxW / vw, boxH / vh);
  const strokeScale = zoom > 0 && zoom < THUMB_MIN_STROKE_ZOOM ? THUMB_MIN_STROKE_ZOOM / zoom : 1;
  /** A canvas stroke width → the world width that draws it at thumbnail scale. */
  const sw = (canvasWidth: number) => canvasWidth * strokeScale;
  /** A canvas dash pattern → the same pattern at thumbnail scale. */
  const dash = (pattern: string | undefined) =>
    pattern ? pattern.trim().split(/[\s,]+/).map((s) => +(Number(s) * strokeScale).toFixed(2)).join(" ") : undefined;

  // The same depths the canvas shades by.
  const sublanes = sublaneIdsOf(all);
  const laneDepth = laneDepths(all);
  const groupDepth = sameTypeAncestorDepths(all, ["process-group", "subprocess-expanded"]);
  const packageDepth = sameTypeAncestorDepths(all, ["uml-package"]);
  const archiDepth = archimateDescendantDepths(all);

  // Paint order: canvas layer, then (within a layer) parents before children.
  const byId = new Map(all.map((e) => [e.id, e] as const));
  const parentDepth = (el: DiagramElement): number => {
    let n = 0;
    let cur: DiagramElement | undefined = el;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
      if (!cur) break;
      n++;
    }
    return n;
  };
  const ordered = els
    .map((el, i) => ({ el, i, layer: layerOf(el), depth: parentDepth(el), area: el.width * el.height }))
    .sort((a, b) =>
      a.layer - b.layer
      // Expanded subprocesses: bigger behind smaller (as the canvas does).
      || (a.layer === 3 ? b.area - a.area : 0)
      || a.depth - b.depth
      || a.i - b.i);

  const shapes: ThumbShape[] = [];
  const S = SHAPE_STROKE;

  const drawElement = (el: DiagramElement) => {
    const { x, y, width: w, height: h } = el;
    const cx = x + w / 2, cy = y + h / 2;
    const fill = () => elementFill(el, colors);
    switch (el.type) {
      case "pool": {
        const { header, body } = poolPaint(colors);
        shapes.push({ k: "rect", x, y, w, h, fill: body, stroke: S, sw: sw(1.5) });
        shapes.push({ k: "rect", x, y, w: getPoolHeaderWidth(el), h, fill: header, stroke: S, sw: sw(1.5) });
        return;
      }
      case "lane": {
        const { header, body } = lanePaint(laneDepth.get(el.id) ?? 0, sublanes.has(el.id) ? "sublane" : "lane", colors);
        shapes.push({ k: "rect", x, y, w, h, fill: body, stroke: S, sw: sw(1) });
        shapes.push({ k: "rect", x, y, w: getLaneHeaderWidth(el), h, fill: header, stroke: S, sw: sw(1) });
        return;
      }
      case "system-boundary":
      case "composite-state": {
        const p = headedContainerPaint(el.type, colors);
        const rx = el.type === "composite-state" ? 12 : 2;
        const hh = Math.min(CONTAINER_HEADER_H, h);
        shapes.push({ k: "rect", x, y, w, h, rx, fill: p.body, fillOpacity: p.bodyOpacity, stroke: S, sw: sw(1.5) });
        shapes.push({ k: "path", d: `M ${x} ${y + hh} V ${y + rx} Q ${x} ${y} ${x + rx} ${y} H ${x + w - rx} Q ${x + w} ${y} ${x + w} ${y + rx} V ${y + hh} Z`, fill: p.header, stroke: S, sw: sw(1) });
        return;
      }
      case "uml-package": {
        const f = nestedContainerFill(el, colors, packageDepth.get(el.id) ?? 0);
        const { tabW, tabH } = computePackageTab(el);
        shapes.push({ k: "rect", x, y: y + tabH, w, h: h - tabH, fill: f, fillOpacity: UML_PACKAGE_BODY_OPACITY, stroke: S, sw: sw(1.5) });
        shapes.push({ k: "rect", x, y, w: tabW, h: tabH, fill: f, stroke: S, sw: sw(1.5) });
        return;
      }
      case "process-group":
      case "subprocess-expanded": {
        const call = el.properties?.subprocessType === "call";
        shapes.push({ k: "rect", x, y, w, h, rx: 4, fill: nestedContainerFill(el, colors, groupDepth.get(el.id) ?? 0), stroke: S, sw: sw(call ? 4 : 1.5) });
        return;
      }
      case "flowchart-vswimlane": {
        const hh = getVSwimlaneHeaderHeight(el);
        shapes.push({ k: "rect", x, y, w, h, fill: fill(), stroke: FLOWCHART_STROKE, sw: sw(1.6) });
        shapes.push({ k: "rect", x, y, w, h: Math.min(hh, h), fill: fill(), stroke: FLOWCHART_STROKE, sw: sw(1.6) });
        return;
      }
      case "group":
        shapes.push({ k: "rect", x, y, w, h, rx: 8, fill: "none", stroke: fill(), sw: sw(1.5), dash: dash(GROUP_DASH) });
        return;
      case "text-annotation": {
        const c = annotationColor(el);
        if (el.properties?.boxed === true) {
          shapes.push({ k: "rect", x, y, w, h, rx: 3, fill: ANNOTATION_BOX_FILL, stroke: c, sw: sw(1) });
        } else {
          const cap = Math.min(24, w);
          shapes.push({ k: "polyline", points: pts([[x + cap, y], [x, y], [x, y + h], [x + cap, y + h]]), stroke: c, sw: sw(1.5) });
        }
        return;
      }
      case "gateway":
      case "flowchart-decision":
        shapes.push({ k: "polygon", points: pts([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]), fill: fill(), stroke: el.type === "gateway" ? S : FLOWCHART_STROKE, sw: sw(1.5) });
        return;
      case "start-event":
        shapes.push({ k: "circle", cx, cy, r: w / 2, fill: fill(), stroke: S, sw: sw(1.2) });
        return;
      case "intermediate-event":
        shapes.push({ k: "circle", cx, cy, r: w / 2, fill: fill(), stroke: S, sw: sw(2) });
        shapes.push({ k: "circle", cx, cy, r: Math.max(0, w / 2 - 3), fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      case "end-event":
        shapes.push({ k: "circle", cx, cy, r: w / 2, fill: fill(), stroke: S, sw: sw(3.5) });
        return;
      case "initial-state":
        shapes.push({ k: "circle", cx, cy, r: w / 2, fill: fill() });
        return;
      case "final-state":
        shapes.push({ k: "circle", cx, cy, r: w / 2, fill: "#ffffff", stroke: S, sw: sw(2) });
        shapes.push({ k: "circle", cx, cy, r: Math.max(0, w / 2 - 5), fill: fill() });
        return;
      case "history-state":
      case "deep-history-state":
        shapes.push({ k: "circle", cx, cy, r: w / 2, fill: "#ffffff", stroke: S, sw: sw(2) });
        return;
      case "fork-join":
        shapes.push({ k: "rect", x, y, w, h, rx: 2, fill: FORK_JOIN_FILL });
        return;
      case "use-case":
        shapes.push({ k: "ellipse", cx, cy, rx: w / 2, ry: h / 2, fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      case "process-system":
        shapes.push({ k: "circle", cx, cy, r: Math.min(w, h) / 2, fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      case "hourglass":
        shapes.push({ k: "polygon", points: pts([[x, y], [x + w, y], [cx, cy], [x + w, y + h], [x, y + h], [cx, cy]]), fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      case "actor":
      case "team":
        stickFigure(shapes, cx, y, w, h, fill(), sw(1.5));
        return;
      case "chevron":
      case "chevron-collapsed": {
        const n = Math.min(20, w * 0.15);
        shapes.push({ k: "polygon", points: pts([[x, y], [x + w - n, y], [x + w, cy], [x + w - n, y + h], [x, y + h], [x + n, cy]]), fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      }
      case "data-object": {
        const fold = Math.round(w * 0.28);
        shapes.push({ k: "polygon", points: pts([[x, y], [x + w - fold, y], [x + w, y + fold], [x + w, y + h], [x, y + h]]), fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      }
      case "data-store":
      case "flowchart-database": {
        const ry = Math.max(4, Math.round(h * 0.15));
        const stroke = el.type === "data-store" ? S : FLOWCHART_STROKE;
        shapes.push({ k: "path", d: `M ${x} ${y + ry} L ${x} ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} L ${x + w} ${y + ry}`, fill: fill(), stroke, sw: sw(1.5) });
        shapes.push({ k: "ellipse", cx, cy: y + ry, rx: w / 2, ry, fill: fill(), stroke, sw: sw(1.5) });
        return;
      }
      case "uml-note":
      case "review-comment": {
        const f = Math.min(16, w * 0.25, h * 0.4);
        const pal = REVIEW_COMMENT_PALETTE[0];
        const isNote = el.type === "uml-note";
        shapes.push({ k: "path", d: `M ${x} ${y} L ${x + w - f} ${y} L ${x + w} ${y + f} L ${x + w} ${y + h} L ${x} ${y + h} Z`, fill: isNote ? fill() : pal.fill, stroke: isNote ? S : pal.stroke, sw: sw(1.5) });
        return;
      }
      case "uml-pain-point":
      case "uml-issue":
        shapes.push({ k: "polygon", points: painPointStarPoints(cx, cy, w / 2, h / 2), fill: fill(), stroke: el.type === "uml-pain-point" ? PAIN_POINT_STROKE : ISSUE_STROKE, sw: sw(1.5) });
        return;
      case "state":
      case "submachine":
        shapes.push({ k: "rect", x, y, w, h, rx: 12, fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      case "archimate-shape": {
        drawArchimate(shapes, el, archiDepth.get(el.id) ?? 0, sw, dash);
        return;
      }
      // ── EPC — the palette colours ARE the notation, so they are kept.
      case "epc-event": {
        const n = Math.min(h * 0.34, w / 3);
        shapes.push({ k: "polygon", points: pts([[x + n, y], [x + w - n, y], [x + w, cy], [x + w - n, y + h], [x + n, y + h], [x, cy]]), fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      }
      case "epc-xor":
      case "epc-and":
      case "epc-or":
        shapes.push({ k: "circle", cx, cy, r: Math.min(w, h) / 2, fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      case "epc-interface": {
        const n = Math.min(h * 0.4, w / 4);
        shapes.push({ k: "polygon", points: pts([[x, y], [x + w - n, y], [x + w, cy], [x + w - n, y + h], [x, y + h], [x + n, cy]]), fill: fill(), stroke: S, sw: sw(1.5) });
        return;
      }
      // ── Standard Flowchart — monochrome.
      case "flowchart-terminator":
        shapes.push({ k: "rect", x, y, w, h, rx: h / 2, fill: fill(), stroke: FLOWCHART_STROKE, sw: sw(1.6) });
        return;
      case "flowchart-io": {
        const s = w * 0.2;
        shapes.push({ k: "polygon", points: pts([[x + s, y], [x + w, y], [x + w - s, y + h], [x, y + h]]), fill: fill(), stroke: FLOWCHART_STROKE, sw: sw(1.6) });
        return;
      }
      case "flowchart-onpage":
        shapes.push({ k: "circle", cx, cy, r: Math.min(w, h) / 2, fill: fill(), stroke: FLOWCHART_STROKE, sw: sw(1.6) });
        return;
      case "flowchart-merge":
        shapes.push({ k: "polygon", points: pts([[x, y], [x + w, y], [cx, y + h]]), fill: fill(), stroke: FLOWCHART_STROKE, sw: sw(1.6) });
        return;
      case "flowchart-parallel":
        shapes.push({ k: "rect", x, y, w, h, rx: 2, fill: FLOWCHART_STROKE });
        return;
      default: {
        if (el.type.startsWith("flowchart-")) {
          shapes.push({ k: "rect", x, y, w, h, rx: el.type === "flowchart-comment" ? 8 : 0, fill: fill(), stroke: FLOWCHART_STROKE, sw: sw(1.6) });
          return;
        }
        // Task, subprocess, UML class/enumeration, EPC function + objects,
        // external entity, system — a (rounded) box in the element's colour.
        const rx = el.type === "epc-function" ? 12 : el.type === "system" ? 3
          : el.type === "uml-class" || el.type === "uml-enumeration" || el.type === "external-entity" || el.type === "epc-data" || el.type === "epc-application" ? 0
          : 4;
        const call = el.type === "subprocess" && el.properties?.subprocessType === "call";
        shapes.push({ k: "rect", x, y, w, h, rx, fill: fill(), stroke: S, sw: sw(call ? 4 : 1.5) });
      }
    }
  };

  let connectorsDrawn = false;
  const drawConnectors = () => {
    connectorsDrawn = true;
    for (const c of (d.connectors ?? []) as Connector[]) {
      if (!Array.isArray(c?.waypoints) || c.waypoints.length < 2) continue;
      if (c.type === "review-comment-link" && d.showReviewComments === false) continue;
      const vis = visibleWaypoints(c) as Point[];
      if (vis.length < 2) continue;
      const width = c.type.startsWith("archi-") ? 1.4 : c.type === "associationBPMN" ? 2 : 1.5;
      shapes.push({ k: "polyline", points: vis.map((p) => `${p.x},${p.y}`).join(" "), stroke: connectorStroke(c.type), sw: sw(width), dash: dash(connectorDash(c)) });
    }
  };

  for (const o of ordered) {
    if (!connectorsDrawn && o.layer > BEHIND_CONNECTORS) drawConnectors();
    drawElement(o.el);
  }
  if (!connectorsDrawn) drawConnectors();

  return { viewBox: `${minX - THUMB_PAD} ${minY - THUMB_PAD} ${vw} ${vh}`, shapes };
}

/** A stick figure in the element's line colour (Process Context actor/team). */
function stickFigure(shapes: ThumbShape[], cx: number, top: number, w: number, h: number, colour: string, width: number) {
  const r = Math.max(2, Math.min(10, h * 0.18));
  const headCy = top + 2 + r;
  const bodyTop = headCy + r, bodyBot = Math.min(top + h - 2, bodyTop + h * 0.35);
  const arm = Math.max(4, w / 2 - 4), leg = Math.max(3, w / 2 - 6);
  const armY = bodyTop + (bodyBot - bodyTop) * 0.5;
  const footY = Math.min(top + h, bodyBot + h * 0.22);
  shapes.push({ k: "circle", cx, cy: headCy, r, fill: "#ffffff", stroke: colour, sw: width });
  shapes.push({ k: "path", d: `M ${cx} ${bodyTop} V ${bodyBot} M ${cx - arm} ${armY} H ${cx + arm} M ${cx - leg} ${footY} L ${cx} ${bodyBot} L ${cx + leg} ${footY}`, fill: "none", stroke: colour, sw: width });
}

/** An ArchiMate element in its layer colours (archimatePaint), with the
 *  canvas's heavier outline. */
function drawArchimate(shapes: ThumbShape[], el: DiagramElement, depth: number, sw: (w: number) => number, dash: (pattern: string) => string | undefined) {
  const { x, y, width: w, height: h } = el;
  const p = archimatePaint(el, undefined, depth);
  if (p.isJunction) {
    // And-junction filled, Or-junction an open ring — as the canvas draws them.
    const filled = p.iconType === "junction-and" || p.iconType === "junction";
    shapes.push({ k: "circle", cx: x + w / 2, cy: y + h / 2, r: Math.max(2, Math.min(w, h) / 2 - 1), fill: filled ? "#000000" : "#ffffff", stroke: "#000000", sw: sw(filled ? 1 : 1.5) });
    return;
  }
  if (p.isGrouping) {
    shapes.push({ k: "rect", x, y, w, h, fill: "none", stroke: ARCHI_GROUPING_STROKE, sw: sw(ARCHI_STROKE_WIDTH), dash: dash(ARCHI_GROUPING_DASH) });
    return;
  }
  if (el.properties?.archimateIconOnly && p.iconType === "actor") {
    // Icon-only Actor: the stick figure IS the shape, in the layer's line colour.
    stickFigure(shapes, x + w / 2, y, w, h, p.stroke, sw(1.5));
    return;
  }
  shapes.push({ k: "rect", x, y, w, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: sw(ARCHI_STROKE_WIDTH) });
}

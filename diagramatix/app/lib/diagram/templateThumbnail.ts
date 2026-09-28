/**
 * Generate a compact, self-contained SVG preview of a template fragment. Pure
 * (no React / DOM), so it runs both in the browser at save/update time and in
 * the built-in seed script. SVG = crisp at any size — the NL "suggest a template"
 * popup can blow it up without pixelation. Simplified shapes (recognisable, not
 * pixel-perfect) keyed by element type.
 */
import type { TemplateData, DiagramElement, Connector, Point } from "./types";
import { isUmlConnType } from "./types";
import type { SymbolColorConfig } from "./colors";
import {
  CONTAINER_HEADER_H, GROUP_DASH, SHAPE_STROKE, connectorDash, connectorStroke, elementFill,
  headedContainerPaint, lanePaint, poolPaint, visibleWaypoints,
} from "./canvasPaint";
import { connectorLabelSize, wrapText } from "./textMetrics";
import { containerHeaderWidth } from "./containerHeader";
import { laneDepths, sublaneIdsOf } from "./nestingDepth";
import { compositeRegions } from "./compositeRegions";
import { isHiddenOnCanvas } from "./diagramThumbnail";
import { connectorLabelBox } from "./checks/layoutViolations";
import { waypointsToSvgPath } from "./routing";
import {
  branchLabelAdrift, branchPercentPlacement, connectorPathD, connectorShowsLabel, flowMarkerShape,
  humpOthersById, isBranchLabelSuppressed, labelTetherLine, tetherPointOf,
} from "./connectorPath";

/**
 * Options for a higher-fidelity render (used by the mobile viewer): the diagram's
 * REAL colours (per-element `properties.fillColor`, else the project colorConfig)
 * and FULL, untruncated labels — including pool/lane/sublane names and connector /
 * message labels — so zooming in reveals them. Omitted → the compact simplified
 * preview used by the template menu + mining (unchanged).
 */
export interface ThumbnailOpts {
  trueColors?: boolean;
  colorConfig?: SymbolColorConfig;
  fullLabels?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const short = (s: string, n = 16) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const cx = (e: DiagramElement) => e.x + e.width / 2;
const cy = (e: DiagramElement) => e.y + e.height / 2;

// Vivid BPMN-semantic palette — kept in lockstep with the live fallback
// renderer (TemplateThumbnail.tsx `ElementShape`) so a stored SVG and a
// freshly-fetched preview look identical: green start, red end, yellow
// gateway, blue task, amber intermediate, grey data/containers.
const PAL: Record<string, { fill: string; stroke: string }> = {
  task: { fill: "#dbeafe", stroke: "#3b82f6" },
  subprocess: { fill: "#dbeafe", stroke: "#3b82f6" },
  "subprocess-expanded": { fill: "#dbeafe", stroke: "#3b82f6" },
  "process-group": { fill: "#dbeafe", stroke: "#3b82f6" },
  gateway: { fill: "#fef9c3", stroke: "#ca8a04" },
  "fork-join": { fill: "#fef9c3", stroke: "#ca8a04" },
  "flowchart-parallel": { fill: "#fef9c3", stroke: "#ca8a04" },
  "start-event": { fill: "#dcfce7", stroke: "#16a34a" },
  "intermediate-event": { fill: "#fff7ed", stroke: "#ca8a04" },
  "end-event": { fill: "#fee2e2", stroke: "#dc2626" },
  "data-object": { fill: "#f3f4f6", stroke: "#6b7280" },
  "data-store": { fill: "#f3f4f6", stroke: "#6b7280" },
  pool: { fill: "#f9fafb", stroke: "#9ca3af" },
  lane: { fill: "#ffffff", stroke: "#9ca3af" },
  sublane: { fill: "#ffffff", stroke: "#9ca3af" },
};
const DEFAULT_PAL = { fill: "#eef2ff", stroke: "#818cf8" };
const palFor = (t: string) => PAL[t] ?? DEFAULT_PAL;

// Keep every stroke a crisp 1px regardless of how far the viewBox is scaled
// (the menu shrinks a wide diagram into ~64px; without this the outlines
// become sub-pixel hairlines and the whole preview looks washed-out/dim).
// Mirrors the live fallback renderer (TemplateThumbnail.tsx `ElementShape`).
const VE = ' vector-effect="non-scaling-stroke"';

// Fill/stroke — the diagram's REAL colours when opts.trueColors, else the
// compact preview palette. The real fill is elementFill — the rule the canvas
// itself paints with (canvasPaint.ts): per-element override → colorConfig →
// type default, and an ArchiMate element's layer colour.
function fillFor(e: DiagramElement, opts?: ThumbnailOpts): string {
  if (opts?.trueColors) return elementFill(e, opts.colorConfig);
  return palFor(e.type as string).fill;
}
function strokeFor(e: DiagramElement, opts?: ThumbnailOpts): string {
  if (opts?.trueColors) return (e.properties?.strokeColor as string | undefined) ?? "#374151";
  return palFor(e.type as string).stroke;
}

function label(e: DiagramElement, tx: number, ty: number, dy = 4, full = false): string {
  const t = (e.label ?? "").trim();
  if (!t) return "";
  const mx = (cx(e) + tx).toFixed(1);
  if (!full) {
    return `<text x="${mx}" y="${(cy(e) + ty + dy).toFixed(1)}" text-anchor="middle" font-size="11" fill="#0f172a" font-family="sans-serif">${esc(short(t))}</text>`;
  }
  // Wrap to the element width, matching the desktop (same wrapText util), so long
  // task/element labels are readable instead of overflowing on one line.
  const fs = 11, lineH = fs * 1.2;
  const lines = wrapText(t, Math.max(12, e.width - 8), fs);
  const startY = cy(e) + ty - ((lines.length - 1) * lineH) / 2 + fs * 0.34;
  return lines.map((ln, i) =>
    `<text x="${mx}" y="${(startY + i * lineH).toFixed(1)}" text-anchor="middle" font-size="${fs}" fill="#0f172a" font-family="sans-serif">${esc(ln)}</text>`,
  ).join("");
}

// Label placed just BELOW a small shape (events / gateways) — BPMN convention,
// since the glyph fills the diamond/circle. Wrapped like the desktop external label.
function belowLabel(e: DiagramElement, tx: number, ty: number, full: boolean): string {
  const t = (e.label ?? "").trim();
  if (!t) return "";
  const fs = 10, lineH = fs * 1.2;
  const lines = (full ? wrapText(t, Math.max(48, e.width + 30), fs) : [short(t)]).slice(0, 3);
  const mx = (cx(e) + tx).toFixed(1);
  const startY = e.y + ty + e.height + fs + 1;
  return lines.map((ln, i) =>
    `<text x="${mx}" y="${(startY + i * lineH).toFixed(1)}" text-anchor="middle" font-size="${fs}" fill="#0f172a" font-family="sans-serif">${esc(ln)}</text>`,
  ).join("");
}

/**
 * Pool / lane NAME — rotated to read bottom-to-top, centred in the header strip,
 * as the desktop draws it (SymbolRenderer PoolShape / LaneShape): the pool and
 * lane font sizes, the same line spacing and the same column position. Only
 * drawn for the fuller (mobile / partner) render.
 *
 * The name's own lines (its line breaks) are the desktop's, and the strip is
 * sized for them. One difference, kept on purpose: a one-line name longer than
 * its band — which the desktop lets run past the band's ends — is wrapped along
 * the band into the columns the strip has room for, and shortened with "…" only
 * if even those are not enough. A name with line breaks of its own is never
 * re-wrapped or cut.
 */
export function stripLabelLines(label: string, bandLength: number, headerW: number, fs: number, colW: number): string[] {
  const own = label.split("\n").map((l) => l.trim()).filter(Boolean);
  if (own.length !== 1) return own;
  const maxCols = Math.max(1, Math.floor((headerW - 4) / colW));
  const wrapped = wrapText(own[0], Math.max(12, bandLength - 8), fs);
  if (wrapped.length <= maxCols) return wrapped;
  const kept = wrapped.slice(0, maxCols);
  kept[maxCols - 1] = kept[maxCols - 1].replace(/\s*\S?$/, "") + "…";
  return kept;
}

function stripLabel(e: DiagramElement, tx: number, ty: number, headerW: number, fontSizes: HeaderFonts): string {
  const t = (e.label ?? "").trim();
  if (!t) return "";
  const pool = e.type === "pool";
  const fs = Math.round((pool ? fontSizes.pool : fontSizes.lane) * 10) / 10;
  const colW = Math.round((pool ? fontSizes.pool * 1.18 : fontSizes.lane * 1.2));
  const lines = stripLabelLines(t, e.height, headerW, fs, colW);
  const midY = e.y + ty + e.height / 2;
  const startX = e.x + tx + headerW / 2 + 3 - ((lines.length - 1) * colW) / 2;
  return lines.map((ln, i) => {
    const lx = startX + i * colW;
    return `<text x="${lx.toFixed(1)}" y="${midY.toFixed(1)}" transform="rotate(-90 ${lx.toFixed(1)} ${midY.toFixed(1)})" text-anchor="middle" font-size="${fs}" fill="#3b1a08" font-family="sans-serif">${esc(ln)}</text>`;
  }).join("");
}

/** The pool and lane name font sizes the desktop uses (Canvas: data.poolFontSize ?? 16, data.laneFontSize ?? 14),
 *  and the element font (data.fontSize ?? 12) that a container's title is set in. */
interface HeaderFonts { pool: number; lane: number; element?: number }

/** What a pool / lane needs from the rest of the diagram to be painted like the desktop. */
interface RenderCtx {
  fonts: HeaderFonts;
  /** Lanes whose parent is a lane (they take the sub-lane colour). */
  sublanes: Set<string>;
  /** Lane ancestors per lane (each level past a sub-lane lightens). */
  laneDepth: Map<string, number>;
}

// A composite state's / system boundary's / group's name, as the desktop sets
// it: one line (line breaks read as spaces), centred, in the middle of the
// 28px header band, at the element font size.
function containerTitle(e: DiagramElement, tx: number, ty: number, fs: number): string {
  const t = (e.label ?? "").replace(/\s*\n\s*/g, " ").trim();
  if (!t) return "";
  return `<text x="${(cx(e) + tx).toFixed(1)}" y="${(e.y + ty + CONTAINER_HEADER_H / 2 + fs * 0.35).toFixed(1)}" text-anchor="middle" font-size="${fs}" fill="#111827" font-family="sans-serif">${esc(t)}</text>`;
}

// Label anchored to the TOP of an element (expanded subprocess / value-chain
// container) so it doesn't sit over the child elements + connectors inside it.
function topLabel(e: DiagramElement, tx: number, ty: number, full: boolean): string {
  const t = (e.label ?? "").trim();
  if (!t) return "";
  const fs = 11, lineH = fs * 1.2;
  const lines = (full ? wrapText(t, Math.max(12, e.width - 10), fs) : [short(t)]).slice(0, 3);
  const mx = (cx(e) + tx).toFixed(1);
  const startY = e.y + ty + fs + 2;
  return lines.map((ln, i) =>
    `<text x="${mx}" y="${(startY + i * lineH).toFixed(1)}" text-anchor="middle" font-size="${fs}" fill="#0f172a" font-family="sans-serif">${esc(ln)}</text>`,
  ).join("");
}

// Inner marker (glyph) for a gateway, keyed by gatewayType. `k` ≈ half the marker.
function gatewayMarker(e: DiagramElement, mx: number, my: number, s: number, stroke: string): string {
  const g = e.gatewayType;
  if (!g || g === "none") return "";
  const k = s * 0.42, sw = 1.4;
  const line = (d: string) => `<path d="${d}" stroke="${stroke}" stroke-width="${sw}" fill="none"${VE}/>`;
  if (g === "exclusive") return line(`M${(mx - k).toFixed(1)},${(my - k).toFixed(1)} L${(mx + k).toFixed(1)},${(my + k).toFixed(1)} M${(mx + k).toFixed(1)},${(my - k).toFixed(1)} L${(mx - k).toFixed(1)},${(my + k).toFixed(1)}`);
  if (g === "parallel") return line(`M${mx},${(my - k).toFixed(1)} L${mx},${(my + k).toFixed(1)} M${(mx - k).toFixed(1)},${my} L${(mx + k).toFixed(1)},${my}`);
  if (g === "inclusive") return `<circle cx="${mx}" cy="${my}" r="${k.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"${VE}/>`;
  if (g === "event-based") return `<circle cx="${mx}" cy="${my}" r="${k.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1"${VE}/><circle cx="${mx}" cy="${my}" r="${(k * 0.6).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1"${VE}/>`;
  if (g === "complex") { const q = k * 0.7; return line(`M${mx},${(my - k).toFixed(1)} L${mx},${(my + k).toFixed(1)} M${(mx - k).toFixed(1)},${my} L${(mx + k).toFixed(1)},${my} M${(mx - q).toFixed(1)},${(my - q).toFixed(1)} L${(mx + q).toFixed(1)},${(my + q).toFixed(1)} M${(mx + q).toFixed(1)},${(my - q).toFixed(1)} L${(mx - q).toFixed(1)},${(my + q).toFixed(1)}`); }
  return "";
}

// Inner marker (glyph) for an event, keyed by eventType. `r` = event radius.
function eventMarker(e: DiagramElement, cxp: number, cyp: number, r: number, stroke: string): string {
  const ev = e.eventType;
  if (!ev || ev === "none") return "";
  const sw = 1.2;
  if (ev === "message") {
    const w = r * 1.0, hh = r * 0.66, x0 = cxp - w / 2, y0 = cyp - hh / 2;
    return `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"${VE}/>`
      + `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} L${cxp.toFixed(1)},${cyp.toFixed(1)} L${(x0 + w).toFixed(1)},${y0.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"${VE}/>`;
  }
  if (ev === "timer") {
    const rr = r * 0.72;
    return `<circle cx="${cxp}" cy="${cyp}" r="${rr.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"${VE}/>`
      + `<path d="M${cxp},${cyp} L${cxp},${(cyp - rr * 0.7).toFixed(1)} M${cxp},${cyp} L${(cxp + rr * 0.55).toFixed(1)},${cyp}" stroke="${stroke}" stroke-width="${sw}" fill="none"${VE}/>`;
  }
  if (ev === "signal") { const k = r * 0.62; return `<path d="M${cxp},${(cyp - k).toFixed(1)} L${(cxp + k * 0.87).toFixed(1)},${(cyp + k * 0.5).toFixed(1)} L${(cxp - k * 0.87).toFixed(1)},${(cyp + k * 0.5).toFixed(1)} z" fill="none" stroke="${stroke}" stroke-width="${sw}"${VE}/>`; }
  if (ev === "error") { const k = r * 0.68; return `<path d="M${(cxp - k).toFixed(1)},${(cyp + k * 0.6).toFixed(1)} L${(cxp - k * 0.2).toFixed(1)},${(cyp - k * 0.6).toFixed(1)} L${(cxp + k * 0.2).toFixed(1)},${(cyp + k * 0.3).toFixed(1)} L${(cxp + k).toFixed(1)},${(cyp - k * 0.6).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"${VE}/>`; }
  if (ev === "terminate") return `<circle cx="${cxp}" cy="${cyp}" r="${(r * 0.5).toFixed(1)}" fill="${stroke}"${VE}/>`;
  // escalation / link / conditional / compensation / multiple / … → a small dot (has a trigger)
  return `<circle cx="${cxp}" cy="${cyp}" r="1.6" fill="${stroke}"${VE}/>`;
}

/** Point where the ray from a box centre toward (tx0,ty0) exits the box — used to
 *  land a connector on an element's boundary (e.g. a message flow on a pool edge). */
function boxEdge(cxp: number, cyp: number, hw: number, hh: number, tx0: number, ty0: number): { x: number; y: number } {
  const dx = tx0 - cxp, dy = ty0 - cyp;
  if (dx === 0 && dy === 0) return { x: cxp, y: cyp };
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cxp + dx * s, y: cyp + dy * s };
}

function shapeFor(e: DiagramElement, tx: number, ty: number, opts?: ThumbnailOpts, ctx?: RenderCtx): string {
  const x = e.x + tx, y = e.y + ty, w = e.width, h = e.height;
  const t = e.type as string;
  const fill = fillFor(e, opts), stroke = strokeFor(e, opts);
  const full = !!opts?.fullLabels;

  if (t === "pool" || t === "lane" || t === "sublane") {
    // A body with its header strip down the left, the strip as wide as the
    // desktop draws it: the container's own header width (36 unless resized).
    // A lane starts exactly where its pool's strip ends, so the strips meet.
    // It used to be a fixed 18px, which left a white gap between the pool's
    // strip and its lanes' (Paul, 2026-09-28: "the pool header and lane headers
    // are too narrow and are separated by a gap").
    const hw = Math.min(containerHeaderWidth(e), w);
    if (opts?.trueColors) {
      // The desktop's own paint (canvasPaint): header colour, a light tint of it
      // for the body, the sub-lane colour for a lane inside a lane.
      const kind: "lane" | "sublane" = t === "sublane" || ctx?.sublanes.has(e.id) ? "sublane" : "lane";
      const paint = t === "pool"
        ? poolPaint(opts.colorConfig)
        : lanePaint(ctx?.laneDepth.get(e.id) ?? (kind === "sublane" ? 1 : 0), kind, opts.colorConfig);
      const sw = t === "pool" ? 1.5 : 1;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${paint.body}" stroke="${SHAPE_STROKE}" stroke-width="${sw}"${VE}/>`
        + `<rect x="${x}" y="${y}" width="${hw}" height="${h}" fill="${paint.header}" stroke="${SHAPE_STROKE}" stroke-width="${sw}"${VE}/>`
        + (full ? stripLabel(e, tx, ty, hw, ctx?.fonts ?? { pool: 16, lane: 14 }) : "");
    }
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"${VE}/>`
      + `<rect x="${x}" y="${y}" width="${hw}" height="${h}" fill="#e2e8f0" stroke="${stroke}" stroke-width="1"${VE}/>`
      + (full ? stripLabel(e, tx, ty, hw, ctx?.fonts ?? { pool: 16, lane: 14 }) : "");
  }
  if (t === "subprocess-expanded" || t === "process-group") {
    // Container — drawn in the BACK pass so its child elements + connectors render
    // ON TOP (not hidden behind its fill); name anchored at the TOP.
    const bg = opts?.trueColors ? fill : "#f8fafc";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${bg}" stroke="${stroke}" stroke-width="1.4"${VE}/>` + topLabel(e, tx, ty, full);
  }
  if (t === "task" || t === "subprocess") {
    const call = (e.properties?.subprocessType as string) === "call";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${call ? 3 : 1.4}"${VE}/>` + label(e, tx, ty, 4, full);
  }
  if (t === "gateway" || t === "fork-join" || t === "flowchart-parallel") {
    const s = Math.min(w, h) / 2;
    const mx = cx(e) + tx, my = cy(e) + ty;
    return `<polygon points="${mx},${my - s} ${mx + s},${my} ${mx},${my + s} ${mx - s},${my}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"${VE}/>` + gatewayMarker(e, mx, my, s, stroke) + belowLabel(e, tx, ty, full);
  }
  if (t === "start-event" || t === "intermediate-event" || t === "end-event") {
    const r = Math.min(w, h) / 2;
    const [ecx, ecy] = [cx(e) + tx, cy(e) + ty];
    const dbl = t !== "start-event";
    const sw = t === "end-event" ? 2.6 : 1.4;
    let out = `<circle cx="${ecx.toFixed(1)}" cy="${ecy.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${VE}/>`;
    if (dbl) out += `<circle cx="${ecx.toFixed(1)}" cy="${ecy.toFixed(1)}" r="${(r - 3).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1"${VE}/>`;
    return out + eventMarker(e, ecx, ecy, r, stroke) + belowLabel(e, tx, ty, full);
  }
  if (t === "chevron" || t === "chevron-collapsed") {
    // Value-chain "Process" — a right-pointing chevron with a matching left notch
    // so they tile. Geometry mirrors the desktop SymbolRenderer chevron exactly.
    const notch = Math.min(20, w * 0.15);
    const pts = `${x},${y} ${(x + w - notch).toFixed(1)},${y} ${(x + w).toFixed(1)},${(y + h / 2).toFixed(1)} ${(x + w - notch).toFixed(1)},${(y + h).toFixed(1)} ${x},${(y + h).toFixed(1)} ${(x + notch).toFixed(1)},${(y + h / 2).toFixed(1)}`;
    let out = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${VE}/>` + label(e, tx, ty, 4, full);
    if (t === "chevron-collapsed") {
      // small [+] drill marker (bottom-centre) — a collapsed process links to detail
      const bx = cx(e) + tx - 5, by = y + h - 13;
      out += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="10" height="10" rx="1.5" fill="#ffffff" stroke="${stroke}" stroke-width="1"${VE}/>`
        + `<path d="M${(bx + 5).toFixed(1)},${(by + 2.5).toFixed(1)} L${(bx + 5).toFixed(1)},${(by + 7.5).toFixed(1)} M${(bx + 2.5).toFixed(1)},${(by + 5).toFixed(1)} L${(bx + 7.5).toFixed(1)},${(by + 5).toFixed(1)}" stroke="${stroke}" stroke-width="1"${VE}/>`;
    }
    return out;
  }
  if (t === "data-object") {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"${VE}/>`;
  }
  if (t === "data-store") {
    return `<ellipse cx="${cx(e) + tx}" cy="${y + 6}" rx="${w / 2}" ry="5" fill="${fill}" stroke="${stroke}" stroke-width="1"${VE}/>`
      + `<rect x="${x}" y="${y + 6}" width="${w}" height="${h - 6}" fill="${fill}" stroke="${stroke}" stroke-width="1"${VE}/>`;
  }
  if (t === "composite-state" || t === "system-boundary") {
    // A HEADED container, as the desktop draws it (CompositeStateShape): a
    // see-through body — the states and transitions inside show through — a
    // solid header band with a rounded top, the line under it, a composite
    // state's dashed region dividers, and the outline last so nothing covers it.
    // Drawn BEHIND the connectors (paintOrder). It used to be an opaque box
    // drawn over its own transitions.
    const rx = t === "composite-state" ? 12 : 2;
    const hh = Math.min(CONTAINER_HEADER_H, h);
    const paint = opts?.trueColors
      ? headedContainerPaint(t, opts.colorConfig)
      : { header: fill, body: fill, bodyOpacity: 0.4 };
    let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${paint.body}" fill-opacity="${paint.bodyOpacity}" stroke="none"/>`
      + `<path d="M ${x} ${y + hh} V ${y + rx} Q ${x} ${y} ${x + rx} ${y} H ${x + w - rx} Q ${x + w} ${y} ${x + w} ${y + rx} V ${y + hh} Z" fill="${paint.header}" stroke="none"/>`
      + `<line x1="${x}" y1="${y + hh}" x2="${x + w}" y2="${y + hh}" stroke="${SHAPE_STROKE}" stroke-width="1"${VE}/>`;
    if (t === "composite-state") {
      const { orientation, fracs } = compositeRegions(e);
      const top = y + hh, bodyH = h - hh;
      for (const f of fracs) {
        out += orientation === "vertical"
          ? `<line x1="${(x + f * w).toFixed(1)}" y1="${top}" x2="${(x + f * w).toFixed(1)}" y2="${y + h}" stroke="${SHAPE_STROKE}" stroke-width="1" stroke-dasharray="6 4"${VE}/>`
          : `<line x1="${x}" y1="${(top + f * bodyH).toFixed(1)}" x2="${x + w}" y2="${(top + f * bodyH).toFixed(1)}" stroke="${SHAPE_STROKE}" stroke-width="1" stroke-dasharray="6 4"${VE}/>`;
      }
    }
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${opts?.trueColors ? SHAPE_STROKE : stroke}" stroke-width="1.5"${VE}/>`;
    return out + (full ? containerTitle(e, tx, ty, ctx?.fonts.element ?? 12) : "");
  }
  if (t === "group") {
    // A BPMN group is an OUTLINE (dashed, the group colour) around what it
    // groups, with the faintest wash — never a filled box over its contents,
    // which it used to be.
    const line = opts?.trueColors ? elementFill(e, opts.colorConfig) : stroke;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#f9fafb" fill-opacity="${opts?.trueColors ? 0.15 : 0}" stroke="${line}" stroke-width="1.5" stroke-dasharray="${GROUP_DASH}"${VE}/>`
      + (full ? containerTitle(e, tx, ty, ctx?.fonts.element ?? 12) : "");
  }
  // fallback
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1"${VE}/>` + label(e, tx, ty, 4, full);
}

function connFor(c: Connector, els: DiagramElement[], tx: number, ty: number, opts?: ThumbnailOpts): string {
  const type = c.type as string;
  const isMessage = type === "messageBPMN" || type === "message";
  const isAssoc = type === "associationBPMN" || type === "association" || type === "flowchart-association" || type === "text-annotation";
  const dashed = isMessage || isAssoc;

  const wps = Array.isArray(c.waypoints) && c.waypoints.length >= 2 ? c.waypoints : null;
  let pts: { x: number; y: number }[];
  if (wps) {
    // Drop the INVISIBLE-LEADER segments (the hidden bits from an element's CENTRE
    // to its boundary) so a message flow doesn't show a spurious line to the pool
    // centre — same trim the desktop router does (routing.ts).
    const s = c.sourceInvisibleLeader ? 1 : 0;
    const e = c.targetInvisibleLeader ? wps.length - 2 : wps.length - 1;
    const vis = e >= s + 1 ? wps.slice(s, e + 1) : wps;
    pts = vis.map((p) => ({ x: p.x + tx, y: p.y + ty }));
  } else {
    const s = els.find((e) => e.id === c.sourceId), t = els.find((e) => e.id === c.targetId);
    if (!s || !t) return "";
    // No stored route: land each end on the ELEMENT BOUNDARY (not the centre) so a
    // message flow meets the pool edge.
    const sC = { x: cx(s) + tx, y: cy(s) + ty }, tC = { x: cx(t) + tx, y: cy(t) + ty };
    pts = [
      boxEdge(sC.x, sC.y, s.width / 2, s.height / 2, tC.x, tC.y),
      boxEdge(tC.x, tC.y, t.width / 2, t.height / 2, sC.x, sC.y),
    ];
  }
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  // Message flow: dashed, dark grey, hollow circle at source + open arrow at target.
  // Association: dashed, no arrowhead. Everything else (sequence/flow/transition):
  // solid filled arrowhead.
  const markers = isMessage ? ' marker-start="url(#tmcirc)" marker-end="url(#tmopen)"'
    : isAssoc ? ""
    : ' marker-end="url(#tmarr)"';
  let out = `<path d="${d}" fill="none" stroke="#475569" stroke-width="1.2"${VE} ${dashed ? 'stroke-dasharray="4 3"' : ""}${markers}/>`;
  // Connector / message label at the polyline midpoint (white halo for legibility).
  const lbl = (c.label ?? "").trim();
  if (opts?.fullLabels && lbl) {
    const m = (pts.length - 1) / 2;
    const a = pts[Math.floor(m)], b = pts[Math.ceil(m)];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    out += `<text x="${mx.toFixed(1)}" y="${(my - 2).toFixed(1)}" text-anchor="middle" font-size="9" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round" fill="#334155">${esc(lbl)}</text>`;
  }
  return out;
}

/** Arrowheads and ends, exactly as the canvas's markers (ConnectorRenderer), one per kind and colour. */
type MarkerKind = "arrow" | "open" | "openStart" | "thin" | "thinStart" | "msgEnd" | "msgStart";

function markerDef(id: string, kind: MarkerKind, color: string): string {
  const open = `<polyline points="0,0 10,3.5 0,7" fill="none" stroke="${color}" stroke-width="1.5"/>`;
  const thin = `<polyline points="1.05,0.8 7,2.5 1.05,4.2" fill="none" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (kind) {
    case "arrow": return `<marker id="${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto" overflow="visible"><polygon points="0 0, 10 3.5, 0 7" fill="${color}"/></marker>`;
    case "open": return `<marker id="${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto" overflow="visible">${open}</marker>`;
    case "openStart": return `<marker id="${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto-start-reverse" overflow="visible">${open}</marker>`;
    case "thin": return `<marker id="${id}" markerWidth="8" markerHeight="5" refX="7" refY="2.5" orient="auto" overflow="visible">${thin}</marker>`;
    case "thinStart": return `<marker id="${id}" markerWidth="8" markerHeight="5" refX="7" refY="2.5" orient="auto-start-reverse" overflow="visible">${thin}</marker>`;
    case "msgEnd": return `<marker id="${id}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" overflow="visible"><polygon points="0,0.5 0,9.5 7.8,5" fill="white" stroke="${color}" stroke-width="1.5"/></marker>`;
    case "msgStart": return `<marker id="${id}" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse" overflow="visible"><circle cx="4" cy="4" r="3" fill="white" stroke="${color}" stroke-width="1.5"/></marker>`;
  }
}

/** Everything a connector needs to be drawn as the canvas draws it. */
interface ConnCtx {
  tx: number; ty: number;
  els: DiagramElement[];
  byId: Map<string, DiagramElement>;
  /** For each hump-taking connector, the routes it jumps over. */
  humps: Map<string, Point[][]>;
  /** Marker ids used → their definitions. */
  markers: Map<string, string>;
  labelFs: number;
  full: boolean;
}

function markerRef(k: ConnCtx, kind: MarkerKind, color: string): string {
  const id = `dgxm-${kind}-${color.replace(/[^0-9a-z]/gi, "")}`;
  if (!k.markers.has(id)) k.markers.set(id, markerDef(id, kind, color));
  return `url(#${id})`;
}

/**
 * One connector, drawn as the canvas draws it (ConnectorRenderer), with the
 * shared rules in connectorPath.ts: the route's visible waypoints; the curve,
 * the rounded corners and the humps over earlier connectors; the stroke, width
 * and dash of its type; the canvas's arrowheads and message-flow ends; the
 * default / conditional marks at the source; the label where the canvas puts
 * it, with its tether when a gateway branch's label has drifted.
 */
function connTrue(c: Connector, k: ConnCtx): string {
  const T = (p: Point): Point => ({ x: p.x + k.tx, y: p.y + k.ty });
  const vis = Array.isArray(c.waypoints) && c.waypoints.length >= 2 ? visibleWaypoints(c) : [];
  let visT: Point[];
  let d: string;
  if (vis.length >= 2) {
    visT = vis.map(T);
    d = connectorPathD(c, visT, k.humps.get(c.id)?.map((route) => route.map(T)));
  } else {
    // No stored route: boundary to boundary.
    const s = k.byId.get(c.sourceId), t = k.byId.get(c.targetId);
    if (!s || !t) return "";
    const sC = T({ x: cx(s), y: cy(s) }), tC = T({ x: cx(t), y: cy(t) });
    visT = [boxEdge(sC.x, sC.y, s.width / 2, s.height / 2, tC.x, tC.y), boxEdge(tC.x, tC.y, t.width / 2, t.height / 2, sC.x, sC.y)];
    d = waypointsToSvgPath(visT);
  }
  const type = c.type as string;
  const isAssocBPMN = type === "associationBPMN";
  const stroke = connectorStroke(type);
  const weighted = (type === "uml-association" || type === "sequence") ? Number(c.weight) || 0 : 0;
  const width = weighted > 0 ? weighted : isAssocBPMN ? 2 : 1.5;
  const dash = connectorDash(c);
  const cap = isAssocBPMN || type === "flowchart-association" ? ' stroke-linecap="round"' : "";
  let start = "", end = "";
  if (type === "messageBPMN") {
    start = markerRef(k, "msgStart", stroke);
    end = markerRef(k, "msgEnd", stroke);
  } else if (!isUmlConnType(c.type) && c.directionType !== "non-directed") {
    const both = c.directionType === "both";
    const open = c.directionType === "open-directed" || both
      || (isAssocBPMN && c.directionType === "directed")
      || (type === "review-comment-link" && c.directionType === "directed");
    end = markerRef(k, isAssocBPMN ? "thin" : open ? "open" : "arrow", stroke);
    if (both) start = markerRef(k, isAssocBPMN ? "thinStart" : "openStart", stroke);
  }

  const source = k.byId.get(c.sourceId);
  let out = "";
  // Default / conditional mark, drawn first so the line runs through it.
  const fm = flowMarkerShape(c, visT, source?.type);
  if (fm?.kind === "slash") out += `<line x1="${fm.x1}" y1="${fm.y1}" x2="${fm.x2}" y2="${fm.y2}" stroke="#374151" stroke-width="1.5" stroke-linecap="round"${VE}/>`;
  if (fm?.kind === "diamond") out += `<polygon points="${fm.points}" fill="white" stroke="#374151" stroke-width="1.2"${VE}/>`;
  out += `<path data-id="${esc(c.id)}" d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}${cap}${VE}`
    + `${start ? ` marker-start="${start}"` : ""}${end ? ` marker-end="${end}"` : ""}/>`;
  if (!k.full) return out;

  const pct = branchPercentPlacement(c, visT);
  if (pct) out += `<text x="${pct.x.toFixed(1)}" y="${(pct.y + 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#6b7280" font-family="sans-serif">${esc(pct.text)}</text>`;

  // The label, where the canvas puts it (connectorLabelBox: stored offsets,
  // source-anchored branches, a message's pool-end rule).
  const text = c.label ?? "";
  if (!connectorShowsLabel(c) || !text.trim()) return out;
  const gwType = source?.type === "gateway" ? (source.gatewayType ?? "exclusive") : undefined;
  if (isBranchLabelSuppressed(c, gwType)) return out;
  const box = connectorLabelBox(c, k.els, k.labelFs);
  if (!box) return out;
  const { lines } = connectorLabelSize(text, k.labelFs);
  const lCx = box.x + box.w / 2 + k.tx, lTy = box.y + k.ty, lh = box.h;
  if (source?.type === "gateway") {
    const tp = tetherPointOf(visT);
    if (tp && branchLabelAdrift({
      hasLabel: true, sourceIsGateway: true, mode: c.labelTether,
      tetherPoint: tp, lCx, lMidY: lTy + lh / 2, lWidth: box.w, lHeight: lh,
    })) {
      const L = labelTetherLine(tp, lines, k.labelFs, lCx, lTy, lh);
      out += `<line x1="${L.x1.toFixed(1)}" y1="${L.y1.toFixed(1)}" x2="${L.x2.toFixed(1)}" y2="${L.y2.toFixed(1)}" stroke="#6b7280" stroke-width="1" stroke-dasharray="4 3"${VE}/>`;
    }
  }
  out += `<text text-anchor="middle" font-size="${k.labelFs}" fill="#374151" paint-order="stroke" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round" font-family="sans-serif">`
    + lines.map((ln, i) => `<tspan x="${lCx.toFixed(1)}" y="${(lTy + i * 14 + 14 * 0.85).toFixed(1)}">${esc(ln)}</tspan>`).join("")
    + `</text>`;
  return out;
}

/**
 * The canvas's layers, back to front (Canvas.tsx): pools; headed containers
 * (system boundary, composite state, process group, UML package); lanes,
 * parents first; expanded subprocesses, largest first; — the ordinary
 * connectors go here —; flow elements; boundary events; data artifacts;
 * groups; pain points and issues; — message flows and data associations go
 * here, above every element —; review notes. Painting containers by size
 * alone hid an expanded subprocess that spans lanes under the lanes' bodies.
 */
const HEADED_CONTAINERS = new Set(["system-boundary", "composite-state", "process-group", "uml-package"]);
const DATA_ARTIFACTS = new Set(["data-object", "data-store", "text-annotation"]);
function layerOf(e: DiagramElement): number {
  const t = e.type as string;
  if (t === "pool" || t === "flowchart-vswimlane") return 0;
  if (HEADED_CONTAINERS.has(t)) return 1;
  if (t === "lane" || t === "sublane") return 2;
  if (t === "subprocess-expanded") return 3;
  if (t === "group") return 7;
  if (t === "uml-pain-point" || t === "uml-issue") return 8;
  if (t === "review-comment") return 10;
  if (e.boundaryHostId) return 5;
  if (DATA_ARTIFACTS.has(t)) return 6;
  return 4;
}
/** The last layer drawn BEHIND the ordinary connectors. */
const LAST_BACK_LAYER = 3;
/** The first layer drawn above the message flows and data associations. */
const FIRST_TOP_LAYER = 10;

function paintOrder(els: DiagramElement[], ctx: RenderCtx): { el: DiagramElement; layer: number }[] {
  const byId = new Map(els.map((e) => [e.id, e] as const));
  const depthOf = (e: DiagramElement): number => {
    let n = 0;
    let cur: DiagramElement | undefined = e;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
      if (!cur) break;
      n++;
    }
    return n;
  };
  const laneDepth = (e: DiagramElement) => ctx.laneDepth.get(e.id) ?? (e.type === "sublane" ? 1 : 0);
  return els
    .map((el, i) => ({ el, i, layer: layerOf(el), depth: depthOf(el), area: el.width * el.height }))
    .sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      if (a.layer === 2) return laneDepth(a.el) - laneDepth(b.el) || a.i - b.i;
      if (a.layer === 3 && Math.abs(a.area - b.area) > 1) return b.area - a.area;
      return a.depth - b.depth || a.i - b.i;
    })
    .map(({ el, layer }) => ({ el, layer }));
}

/** Padding (px) around the diagram bounds in the thumbnail SVG. */
export const THUMBNAIL_PAD = 14;

/**
 * The coordinate mapping from diagram space → thumbnail-SVG space (viewBox 0 0 w h).
 * A diagram point (x, y) is drawn at (x + tx, y + ty). Exported so an interactive
 * overlay (e.g. the mobile review layer) can position itself in the SAME space as
 * `renderTemplateThumbnailSvg`. Returns a zero transform for an empty element set.
 */
export function thumbnailTransform(els: { x: number; y: number; width: number; height: number }[]): { tx: number; ty: number; w: number; h: number } {
  if (!els.length) return { tx: 0, ty: 0, w: 1, h: 1 };
  const minX = Math.min(...els.map((e) => e.x));
  const minY = Math.min(...els.map((e) => e.y));
  const maxX = Math.max(...els.map((e) => e.x + e.width));
  const maxY = Math.max(...els.map((e) => e.y + e.height));
  const pad = THUMBNAIL_PAD;
  return {
    tx: pad - minX,
    ty: pad - minY,
    w: Math.max(1, maxX - minX + pad * 2),
    h: Math.max(1, maxY - minY + pad * 2),
  };
}

/** The connector-label font the canvas uses: round(10 × (connectorFontSize ?? 10) / 10, 1dp). */
function connectorLabelFontSize(data: { connectorFontSize?: unknown }): number {
  const v = data.connectorFontSize;
  return Math.round(10 * ((typeof v === "number" && v > 0 ? v : 10) / 10) * 10) / 10;
}

/**
 * The frame renderTemplateThumbnailSvg draws in, for the same options.
 *
 * The compact template preview is framed on its elements (thumbnailTransform).
 * The full render (the phone viewer, the partner PDF) also takes in every
 * connector's route and every label where the canvas puts it: since labels sit
 * at their stored offsets (2026-09-28), a label dragged away from its line —
 * above the top row, say — fell outside an elements-only frame and was not
 * drawn at all. Anything that must line up with the picture — the phone's
 * review pins and taps, its pan/zoom size, the PDF page — takes its frame from
 * here, with the options the picture was drawn with.
 */
export function thumbnailFrameFor(
  data: { elements?: DiagramElement[]; connectors?: Connector[]; connectorFontSize?: unknown },
  opts?: ThumbnailOpts,
): { tx: number; ty: number; w: number; h: number } {
  const els = data.elements ?? [];
  if (!opts?.trueColors || els.length === 0) return thumbnailTransform(els);
  const boxes: { x: number; y: number; width: number; height: number }[] = els.map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
  const fs = connectorLabelFontSize(data);
  for (const c of data.connectors ?? []) {
    if (Array.isArray(c.waypoints)) {
      for (const p of visibleWaypoints(c)) {
        if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) boxes.push({ x: p.x, y: p.y, width: 0, height: 0 });
      }
    }
    if (opts.fullLabels && connectorShowsLabel(c) && (c.label ?? "").trim()) {
      const b = connectorLabelBox(c, els, fs);
      if (b) boxes.push({ x: b.x, y: b.y, width: b.w, height: b.h });
    }
  }
  return thumbnailTransform(boxes);
}

export function renderTemplateThumbnailSvg(data: TemplateData, opts?: ThumbnailOpts): string {
  const all = data.elements ?? [];
  if (all.length === 0) return "";
  // Framed on everything it was given (thumbnailFrameFor), so an overlay using
  // the same frame (the phone's review pins) lines up.
  const { tx, ty, w, h } = thumbnailFrameFor(data as never, opts);
  const flags = data as { showPainPoints?: boolean; showIssues?: boolean; showReviewComments?: boolean };
  const els = all.filter((e) => !isHiddenOnCanvas(e, flags));

  const fontData = data as { poolFontSize?: unknown; laneFontSize?: unknown; fontSize?: unknown; connectorFontSize?: unknown };
  const num = (v: unknown, dflt: number) => (typeof v === "number" && v > 0 ? v : dflt);
  const ctx: RenderCtx = {
    fonts: {
      pool: num(fontData.poolFontSize, 16),
      lane: num(fontData.laneFontSize, 14),
      element: num(fontData.fontSize, 12),
    },
    sublanes: sublaneIdsOf(els),
    laneDepth: laneDepths(els),
  };
  const order = paintOrder(els, ctx);
  const shapes = (from: number, to: number) =>
    order.filter((o) => o.layer >= from && o.layer <= to).map((o) => shapeFor(o.el, tx, ty, opts, ctx)).join("");

  const conns = data.connectors ?? [];
  const onTop = (c: Connector) => c.type === "messageBPMN" || c.type === "associationBPMN";
  const isLink = (c: Connector) => c.type === "review-comment-link";
  // A note's tether hides with the notes, as on the canvas.
  const linksShown = flags.showReviewComments !== false;
  let draw: (c: Connector) => string;
  let defs: string;
  if (opts?.trueColors) {
    const k: ConnCtx = {
      tx, ty, els: all,
      byId: new Map(all.map((e) => [e.id, e] as const)),
      humps: humpOthersById(conns),
      markers: new Map(),
      labelFs: connectorLabelFontSize(fontData),
      full: !!opts.fullLabels,
    };
    draw = (c) => connTrue(c, k);
    defs = ""; // filled below, once every connector has asked for its markers
    const body = shapes(0, LAST_BACK_LAYER)
      + conns.filter((c) => !onTop(c) && !isLink(c)).map(draw).join("")
      + shapes(LAST_BACK_LAYER + 1, FIRST_TOP_LAYER - 1)
      + conns.filter(onTop).map(draw).join("")
      + (linksShown ? conns.filter(isLink).map(draw).join("") : "")
      + shapes(FIRST_TOP_LAYER, Infinity);
    defs = [...k.markers.values()].join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" preserveAspectRatio="xMidYMid meet">`
      + `<defs>${defs}</defs>`
      + body
      + `</svg>`;
  }
  // The compact template preview keeps its own simple connectors (in step with
  // TemplateThumbnail.tsx's live fallback); it takes the canvas's layers.
  draw = (c) => connFor(c, els, tx, ty, opts);
  const body = shapes(0, LAST_BACK_LAYER)
    + conns.filter((c) => !onTop(c) && !isLink(c)).map(draw).join("")
    + shapes(LAST_BACK_LAYER + 1, FIRST_TOP_LAYER - 1)
    + conns.filter(onTop).map(draw).join("")
    + (linksShown ? conns.filter(isLink).map(draw).join("") : "")
    + shapes(FIRST_TOP_LAYER, Infinity);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" preserveAspectRatio="xMidYMid meet">`
    + `<defs>`
    + `<marker id="tmarr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#475569"/></marker>`
    + `<marker id="tmopen" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#475569" stroke-width="1"/></marker>`
    + `<marker id="tmcirc" markerWidth="7" markerHeight="7" refX="3.2" refY="3" orient="auto"><circle cx="3" cy="3" r="2" fill="#ffffff" stroke="#475569" stroke-width="1"/></marker>`
    + `</defs>`
    + body
    + `</svg>`;
}

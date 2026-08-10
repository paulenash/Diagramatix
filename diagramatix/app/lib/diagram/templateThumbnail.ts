/**
 * Generate a compact, self-contained SVG preview of a template fragment. Pure
 * (no React / DOM), so it runs both in the browser at save/update time and in
 * the built-in seed script. SVG = crisp at any size — the NL "suggest a template"
 * popup can blow it up without pixelation. Simplified shapes (recognisable, not
 * pixel-perfect) keyed by element type.
 */
import type { TemplateData, DiagramElement, Connector, SymbolType } from "./types";
import { resolveColor, type SymbolColorConfig } from "./colors";
import { wrapText } from "./textMetrics";

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
// compact preview palette. Real fill = per-element override → project colorConfig
// → type default (mirrors SymbolRenderer: `properties.fillColor ?? resolveColor`).
function fillFor(e: DiagramElement, opts?: ThumbnailOpts): string {
  if (opts?.trueColors) return (e.properties?.fillColor as string | undefined) ?? resolveColor(e.type as SymbolType, opts.colorConfig);
  return palFor(e.type as string).fill;
}
function strokeFor(e: DiagramElement, opts?: ThumbnailOpts): string {
  return opts?.trueColors ? "#374151" : palFor(e.type as string).stroke;
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

// Pool / lane / sublane NAME — rotated vertically inside the left header strip,
// like the desktop. Only drawn for the fuller (mobile) render.
function stripLabel(e: DiagramElement, tx: number, ty: number): string {
  const t = (e.label ?? "").trim();
  if (!t) return "";
  // Rotated name; wrap along the element HEIGHT into vertical columns for readability.
  const fs = 10, colW = fs * 1.15;
  const lines = wrapText(t, Math.max(12, e.height - 8), fs);
  const midY = e.y + ty + e.height / 2;
  const startX = e.x + tx + 9 - ((lines.length - 1) * colW) / 2;
  return lines.map((ln, i) => {
    const lx = startX + i * colW;
    return `<text x="${lx.toFixed(1)}" y="${midY.toFixed(1)}" transform="rotate(-90 ${lx.toFixed(1)} ${midY.toFixed(1)})" text-anchor="middle" font-size="${fs}" fill="#0f172a" font-family="sans-serif">${esc(ln)}</text>`;
  }).join("");
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

function shapeFor(e: DiagramElement, tx: number, ty: number, opts?: ThumbnailOpts): string {
  const x = e.x + tx, y = e.y + ty, w = e.width, h = e.height;
  const t = e.type as string;
  const fill = fillFor(e, opts), stroke = strokeFor(e, opts);
  const full = !!opts?.fullLabels;
  const emid = `${(cx(e) + tx).toFixed(1)} ${(cy(e) + ty).toFixed(1)}`;

  if (t === "pool" || t === "lane" || t === "sublane") {
    // rect with a header strip on the left; the strip is tinted with the real
    // pool/lane colour when available (that's what colorConfig drives on desktop).
    const stripFill = opts?.trueColors ? fill : "#e2e8f0";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${opts?.trueColors ? "#ffffff" : fill}" stroke="${stroke}" stroke-width="1"${VE}/>`
      + `<rect x="${x}" y="${y}" width="18" height="${h}" fill="${stripFill}" stroke="${stroke}" stroke-width="1"${VE}/>`
      + (full ? stripLabel(e, tx, ty) : "");
  }
  if (t === "task" || t === "subprocess" || t === "subprocess-expanded" || t === "process-group") {
    const call = (e.properties?.subprocessType as string) === "call";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${call ? 3 : 1.4}"${VE}/>` + label(e, tx, ty, 4, full);
  }
  if (t === "gateway" || t === "fork-join" || t === "flowchart-parallel") {
    const s = Math.min(w, h) / 2;
    const mx = cx(e) + tx, my = cy(e) + ty;
    return `<polygon points="${mx},${my - s} ${mx + s},${my} ${mx},${my + s} ${mx - s},${my}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"${VE}/>`;
  }
  if (t === "start-event" || t === "intermediate-event" || t === "end-event") {
    const r = Math.min(w, h) / 2;
    const dbl = t !== "start-event";
    const sw = t === "end-event" ? 2.6 : 1.4;
    let out = `<circle cx="${emid.split(" ")[0]}" cy="${emid.split(" ")[1]}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${VE}/>`;
    if (dbl) out += `<circle cx="${emid.split(" ")[0]}" cy="${emid.split(" ")[1]}" r="${(r - 3).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1"${VE}/>`;
    return out;
  }
  if (t === "data-object") {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"${VE}/>`;
  }
  if (t === "data-store") {
    return `<ellipse cx="${cx(e) + tx}" cy="${y + 6}" rx="${w / 2}" ry="5" fill="${fill}" stroke="${stroke}" stroke-width="1"${VE}/>`
      + `<rect x="${x}" y="${y + 6}" width="${w}" height="${h - 6}" fill="${fill}" stroke="${stroke}" stroke-width="1"${VE}/>`;
  }
  // fallback
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1"${VE}/>` + label(e, tx, ty, 4, full);
}

function connFor(c: Connector, els: DiagramElement[], tx: number, ty: number, opts?: ThumbnailOpts): string {
  const dashed = c.type === "associationBPMN" || c.type === "messageBPMN" || c.type === "message";
  const wps = Array.isArray(c.waypoints) && c.waypoints.length >= 2 ? c.waypoints : null;
  let pts: { x: number; y: number }[];
  if (wps) {
    pts = wps.map((p) => ({ x: p.x + tx, y: p.y + ty }));
  } else {
    const s = els.find((e) => e.id === c.sourceId), t = els.find((e) => e.id === c.targetId);
    if (!s || !t) return "";
    // No stored route: land each end on the ELEMENT BOUNDARY (not the centre) so a
    // message flow meets the pool edge, with a clear direction arrow at the target.
    const sC = { x: cx(s) + tx, y: cy(s) + ty }, tC = { x: cx(t) + tx, y: cy(t) + ty };
    pts = [
      boxEdge(sC.x, sC.y, s.width / 2, s.height / 2, tC.x, tC.y),
      boxEdge(tC.x, tC.y, t.width / 2, t.height / 2, sC.x, sC.y),
    ];
  }
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  let out = `<path d="${d}" fill="none" stroke="#475569" stroke-width="1.2"${VE} ${dashed ? 'stroke-dasharray="4 3"' : ""} marker-end="url(#tmarr)"/>`;
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

export function renderTemplateThumbnailSvg(data: TemplateData, opts?: ThumbnailOpts): string {
  const els = data.elements ?? [];
  if (els.length === 0) return "";
  const { tx, ty, w, h } = thumbnailTransform(els);

  // containers (pools/lanes) behind, then connectors, then everything else on top
  const isContainer = (e: DiagramElement) => e.type === "pool" || e.type === "lane" || e.type === "sublane";
  const back = els.filter(isContainer).map((e) => shapeFor(e, tx, ty, opts)).join("");
  const conns = (data.connectors ?? []).map((c) => connFor(c, els, tx, ty, opts)).join("");
  const front = els.filter((e) => !isContainer(e)).map((e) => shapeFor(e, tx, ty, opts)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" preserveAspectRatio="xMidYMid meet">`
    + `<defs><marker id="tmarr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#475569"/></marker></defs>`
    + back + conns + front
    + `</svg>`;
}

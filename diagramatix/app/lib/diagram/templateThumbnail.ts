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

function shapeFor(e: DiagramElement, tx: number, ty: number, opts?: ThumbnailOpts): string {
  const x = e.x + tx, y = e.y + ty, w = e.width, h = e.height;
  const t = e.type as string;
  const fill = fillFor(e, opts), stroke = strokeFor(e, opts);
  const full = !!opts?.fullLabels;

  if (t === "pool" || t === "lane" || t === "sublane") {
    // rect with a header strip on the left; the strip is tinted with the real
    // pool/lane colour when available (that's what colorConfig drives on desktop).
    const stripFill = opts?.trueColors ? fill : "#e2e8f0";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${opts?.trueColors ? "#ffffff" : fill}" stroke="${stroke}" stroke-width="1"${VE}/>`
      + `<rect x="${x}" y="${y}" width="18" height="${h}" fill="${stripFill}" stroke="${stroke}" stroke-width="1"${VE}/>`
      + (full ? stripLabel(e, tx, ty) : "");
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

  // Containers (pools/lanes AND expanded subprocesses / value-chain groups) draw
  // BEHIND — largest first — so connectors + child elements render on top of them
  // (previously a subprocess-expanded fill hid the connectors inside it). Then
  // connectors, then leaf shapes on top.
  const isContainer = (e: DiagramElement) =>
    e.type === "pool" || e.type === "lane" || e.type === "sublane" ||
    e.type === "subprocess-expanded" || e.type === "process-group";
  const containers = els.filter(isContainer).slice().sort((a, b) => b.width * b.height - a.width * a.height);
  const back = containers.map((e) => shapeFor(e, tx, ty, opts)).join("");
  const conns = (data.connectors ?? []).map((c) => connFor(c, els, tx, ty, opts)).join("");
  const front = els.filter((e) => !isContainer(e)).map((e) => shapeFor(e, tx, ty, opts)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" preserveAspectRatio="xMidYMid meet">`
    + `<defs>`
    + `<marker id="tmarr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#475569"/></marker>`
    + `<marker id="tmopen" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#475569" stroke-width="1"/></marker>`
    + `<marker id="tmcirc" markerWidth="7" markerHeight="7" refX="3.2" refY="3" orient="auto"><circle cx="3" cy="3" r="2" fill="#ffffff" stroke="#475569" stroke-width="1"/></marker>`
    + `</defs>`
    + back + conns + front
    + `</svg>`;
}

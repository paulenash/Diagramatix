/**
 * Generate a compact, self-contained SVG preview of a template fragment. Pure
 * (no React / DOM), so it runs both in the browser at save/update time and in
 * the built-in seed script. SVG = crisp at any size — the NL "suggest a template"
 * popup can blow it up without pixelation. Simplified shapes (recognisable, not
 * pixel-perfect) keyed by element type.
 */
import type { TemplateData, DiagramElement, Connector } from "./types";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const short = (s: string, n = 16) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const cx = (e: DiagramElement) => e.x + e.width / 2;
const cy = (e: DiagramElement) => e.y + e.height / 2;

const FILL: Record<string, string> = {
  task: "#eff6ff", "subprocess": "#eef2ff", "subprocess-expanded": "#eef2ff",
  pool: "#f9fafb", lane: "#ffffff", "process-group": "#ecfeff",
  "data-object": "#fefce8", "data-store": "#fefce8", "text-annotation": "#ffffff",
};
const STROKE = "#334155";

function label(e: DiagramElement, tx: number, ty: number, dy = 4): string {
  const t = (e.label ?? "").trim();
  if (!t) return "";
  return `<text x="${(cx(e) + tx).toFixed(1)}" y="${(cy(e) + ty + dy).toFixed(1)}" text-anchor="middle" font-size="11" fill="#0f172a" font-family="sans-serif">${esc(short(t))}</text>`;
}

function shapeFor(e: DiagramElement, tx: number, ty: number): string {
  const x = e.x + tx, y = e.y + ty, w = e.width, h = e.height;
  const t = e.type as string;
  const fill = FILL[t] ?? "#ffffff";
  const emid = `${(cx(e) + tx).toFixed(1)} ${(cy(e) + ty).toFixed(1)}`;

  if (t === "pool" || t === "lane" || t === "sublane") {
    // rect with a header strip on the left
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${STROKE}" stroke-width="1"/>`
      + `<rect x="${x}" y="${y}" width="18" height="${h}" fill="#e2e8f0" stroke="${STROKE}" stroke-width="1"/>`;
  }
  if (t === "task" || t === "subprocess" || t === "subprocess-expanded" || t === "process-group") {
    const call = (e.properties?.subprocessType as string) === "call";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${STROKE}" stroke-width="${call ? 3 : 1.2}"/>` + label(e, tx, ty);
  }
  if (t === "gateway" || t === "fork-join" || t === "flowchart-parallel") {
    const s = Math.min(w, h) / 2;
    const mx = cx(e) + tx, my = cy(e) + ty;
    return `<polygon points="${mx},${my - s} ${mx + s},${my} ${mx},${my + s} ${mx - s},${my}" fill="#ffffff" stroke="${STROKE}" stroke-width="1.2"/>`;
  }
  if (t === "start-event" || t === "intermediate-event" || t === "end-event") {
    const r = Math.min(w, h) / 2;
    const dbl = t !== "start-event";
    const sw = t === "end-event" ? 2.6 : 1.2;
    let out = `<circle cx="${emid.split(" ")[0]}" cy="${emid.split(" ")[1]}" r="${r}" fill="#ffffff" stroke="${STROKE}" stroke-width="${sw}"/>`;
    if (dbl) out += `<circle cx="${emid.split(" ")[0]}" cy="${emid.split(" ")[1]}" r="${(r - 3).toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1"/>`;
    return out;
  }
  if (t === "data-object") {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${STROKE}" stroke-width="1"/>`;
  }
  if (t === "data-store") {
    return `<ellipse cx="${cx(e) + tx}" cy="${y + 6}" rx="${w / 2}" ry="5" fill="${fill}" stroke="${STROKE}" stroke-width="1"/>`
      + `<rect x="${x}" y="${y + 6}" width="${w}" height="${h - 6}" fill="${fill}" stroke="${STROKE}" stroke-width="1"/>`;
  }
  // fallback
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${STROKE}" stroke-width="1"/>` + label(e, tx, ty);
}

function connFor(c: Connector, els: DiagramElement[], tx: number, ty: number): string {
  const dashed = c.type === "associationBPMN" || c.type === "messageBPMN" || c.type === "message";
  const wps = Array.isArray(c.waypoints) && c.waypoints.length >= 2 ? c.waypoints : null;
  let pts: { x: number; y: number }[];
  if (wps) {
    pts = wps.map((p) => ({ x: p.x + tx, y: p.y + ty }));
  } else {
    const s = els.find((e) => e.id === c.sourceId), t = els.find((e) => e.id === c.targetId);
    if (!s || !t) return "";
    pts = [{ x: cx(s) + tx, y: cy(s) + ty }, { x: cx(t) + tx, y: cy(t) + ty }];
  }
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return `<path d="${d}" fill="none" stroke="#475569" stroke-width="1.2" ${dashed ? 'stroke-dasharray="4 3"' : ""} marker-end="url(#tmarr)"/>`;
}

export function renderTemplateThumbnailSvg(data: TemplateData): string {
  const els = data.elements ?? [];
  if (els.length === 0) return "";
  const minX = Math.min(...els.map((e) => e.x));
  const minY = Math.min(...els.map((e) => e.y));
  const maxX = Math.max(...els.map((e) => e.x + e.width));
  const maxY = Math.max(...els.map((e) => e.y + e.height));
  const pad = 14;
  const w = Math.max(1, maxX - minX + pad * 2);
  const h = Math.max(1, maxY - minY + pad * 2);
  const tx = pad - minX, ty = pad - minY;

  // containers (pools/lanes) behind, then connectors, then everything else on top
  const isContainer = (e: DiagramElement) => e.type === "pool" || e.type === "lane" || e.type === "sublane";
  const back = els.filter(isContainer).map((e) => shapeFor(e, tx, ty)).join("");
  const conns = (data.connectors ?? []).map((c) => connFor(c, els, tx, ty)).join("");
  const front = els.filter((e) => !isContainer(e)).map((e) => shapeFor(e, tx, ty)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" preserveAspectRatio="xMidYMid meet">`
    + `<defs><marker id="tmarr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#475569"/></marker></defs>`
    + back + conns + front
    + `</svg>`;
}

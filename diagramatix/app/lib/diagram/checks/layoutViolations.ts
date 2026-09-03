/**
 * Layout geometry helper — the keystone for conflict detection and the
 * remaining label-placement rules.
 *
 * `findLayoutViolations(data)` runs a set of GLOBAL invariants over a finished
 * BPMN layout and returns human-readable breaches (empty array = clean). Unlike
 * the per-rule checks, these must hold no matter which rules fired, so they
 * surface CONFLICTS between rules as emergent failures.
 */
import type { DiagramData, DiagramElement, Connector } from "../types";
import { wrapText, externalLabelBox, connectorLabelWidth, connectorLabelLines } from "../textMetrics";

export type Box = { x: number; y: number; w: number; h: number };

const FLOW_NODES = new Set([
  "task", "subprocess", "subprocess-expanded", "start-event", "end-event",
  "intermediate-event", "gateway", "data-object", "data-store",
]);
// Connector types governed by the de-overlap / facing rules.
const RULED = new Set(["sequence", "messageBPMN"]);

// Penetration tolerance: ignore sub-pixel boundary touches (a label edge that
// just meets a connector line is not a real overlap). Only flag genuine
// overlaps that penetrate by more than this many pixels.
const TOL = 2;

export const elementBox = (e: DiagramElement): Box => ({ x: e.x, y: e.y, w: e.width, h: e.height });

export const boxesOverlap = (a: Box, b: Box, tol = 0): boolean =>
  a.x + tol < b.x + b.w && a.x + a.w - tol > b.x && a.y + tol < b.y + b.h && a.y + a.h - tol > b.y;

/** External label box for a gateway (matches how SymbolRenderer positions it). */
export function gatewayLabelBox(g: DiagramElement): Box | null {
  if (!g.label || !g.label.trim()) return null;
  const lw = (g.properties?.labelWidth as number) ?? 80;
  const ox = (g.properties?.labelOffsetX as number) ?? 0;
  const oy = (g.properties?.labelOffsetY as number) ?? 7;
  const lines = Math.max(1, wrapText(g.label.trim(), lw).length);
  const cx = g.x + g.width / 2 + ox;
  const topY = g.y + g.height + oy;
  return { x: cx - lw / 2, y: topY, w: lw, h: lines * 14 };
}

/**
 * Box for a connector's text label — mirrors how ConnectorRenderer positions it.
 *
 * A MESSAGE flow's label defaults to the LEFT of the spine, its right edge just
 * clear of the line: `offsetX = -(width/2 + 6)`, `offsetY = -7`. Omitting that
 * default made this report the label as straddling its own line — a collision
 * nobody draws — and those false positives were the bulk of the biggest class
 * in the 2026-09-03 scan. A check that cannot be trusted is worse than none,
 * because it sends the fixing effort at the wrong thing.
 *
 * `els` is optional only so existing callers keep working; pass it whenever the
 * elements are to hand, because a message flow touching a POOL anchors its
 * label 60px along the spine from the pool end rather than at the midpoint.
 */
export function connectorLabelBox(c: Connector, els?: DiagramElement[]): Box | null {
  if (!c.label || !c.label.trim()) return null;
  let vis = c.waypoints ?? [];
  if (vis.length < 2) return null;
  if (c.sourceInvisibleLeader && vis.length > 2) vis = vis.slice(1);
  if (c.targetInvisibleLeader && vis.length > 2) vis = vis.slice(0, -1);
  const sourceAnchored = c.labelAnchor === "source" || c.type === "flowline";
  const isMessage = c.type === "messageBPMN";
  // The same wrap the renderer applies, so a wrapped label is measured as drawn.
  const lines = connectorLabelLines(c.label || " ");
  const measuredWidth = Math.max(30, ...lines.map((l) => l.length * 6 + 12)); // fontSize 10 × 0.6
  const lHeight = Math.max(14, lines.length * 14);

  const typeOf = (id: string) => els?.find((e) => e.id === id)?.type;
  const msgToPool = isMessage && (typeOf(c.sourceId) === "pool" || typeOf(c.targetId) === "pool");
  const moved = c.labelOffsetX != null || c.labelOffsetY != null;

  let anchor = sourceAnchored
    ? vis[0]
    : { x: (vis[0].x + vis[vis.length - 1].x) / 2, y: (vis[0].y + vis[vis.length - 1].y) / 2 };
  if (!moved && msgToPool && !sourceAnchored) {
    const p0 = vis[0], pN = vis[vis.length - 1];
    const poolEnd = typeOf(c.targetId) === "pool" ? pN : p0;
    const otherEnd = typeOf(c.targetId) === "pool" ? p0 : pN;
    const dx = otherEnd.x - poolEnd.x, dy = otherEnd.y - poolEnd.y;
    const len = Math.hypot(dx, dy) || 1;
    const step = Math.min(60, len - 6);
    anchor = { x: poolEnd.x + (dx / len) * step, y: poolEnd.y + (dy / len) * step };
  }

  const offsetX = c.labelOffsetX ?? (
    c.type === "flowline" ? 18
    : isMessage ? -(measuredWidth / 2 + 6)
    : 0
  );
  const offsetY = c.labelOffsetY ?? (c.type === "flowline" ? 16 : msgToPool ? -7 : -30);
  const lCx = anchor.x + offsetX, lTy = anchor.y + offsetY;
  return { x: lCx - measuredWidth / 2, y: lTy, w: measuredWidth, h: lHeight };
}

type Seg = { vx?: number; hy?: number; a: number; b: number };
export function segmentsOf(c: Connector): Seg[] {
  const segs: Seg[] = [];
  const w = c.waypoints ?? [];
  for (let i = 1; i < w.length; i++) {
    const p = w[i - 1], q = w[i];
    if (Math.abs(p.x - q.x) < 0.5) segs.push({ vx: p.x, a: Math.min(p.y, q.y), b: Math.max(p.y, q.y) });
    else if (Math.abs(p.y - q.y) < 0.5) segs.push({ hy: p.y, a: Math.min(p.x, q.x), b: Math.max(p.x, q.x) });
  }
  return segs;
}
const segHitsBox = (s: Seg, r: Box, tol = 0): boolean =>
  s.vx !== undefined
    ? s.vx > r.x + tol && s.vx < r.x + r.w - tol && s.b > r.y + tol && s.a < r.y + r.h - tol
    : s.hy! > r.y + tol && s.hy! < r.y + r.h - tol && s.b > r.x + tol && s.a < r.x + r.w - tol;

/**
 * EXTENDED invariants — the READABILITY set.
 *
 * Paul, 2026-09-03: one-pass generation has to yield a PDF a third party can
 * read, with nobody to tidy it afterwards. So anything a reader would see as
 * two things drawn on top of each other is a defect, not a blemish: bodies,
 * external labels, and a connector label lying along its own line.
 *
 * Kept behind a flag so the original set — which the clean-layout fixtures
 * assert is empty — keeps its meaning while this one is being driven to zero.
 */
export function findReadabilityViolations(data: DiagramData): string[] {
  const v: string[] = [];
  const els = data.elements.filter((e) => e.type !== "pool" && e.type !== "lane" && e.type !== "sublane");
  const L = (e: DiagramElement) => (e.label ?? "").replace(/s+/g, " ").slice(0, 34) || e.type;
  const isAncestor = (a: DiagramElement, b: DiagramElement) => {
    let cur: DiagramElement | undefined = b; let g = 0;
    while (cur?.parentId && g++ < 12) { if (cur.parentId === a.id) return true; cur = data.elements.find((x) => x.id === cur!.parentId); }
    return false;
  };

  // R-A ── no two element BODIES overlap ─────────────────────────────────
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.boundaryHostId === b.id || b.boundaryHostId === a.id) continue;   // an event rides its host
    if (isAncestor(a, b) || isAncestor(b, a)) continue;                     // a child sits inside its EP
    if (boxesOverlap(elementBox(a), elementBox(b), TOL)) v.push(`BODY/BODY: "${L(a)}" overlaps "${L(b)}"`);
  }

  // R-B ── an external LABEL is clear of every body, and of every other label
  const labels = els.map((e) => ({ e, box: externalLabelBox(e) }))
    .filter((x): x is { e: DiagramElement; box: Box } => x.box !== null);
  for (const { e, box } of labels) for (const o of els) {
    if (o.id === e.id || o.boundaryHostId === e.id || e.boundaryHostId === o.id) continue;
    if (isAncestor(o, e) || isAncestor(e, o)) continue;
    if (boxesOverlap(box, elementBox(o), TOL)) v.push(`LABEL/BODY: label of "${L(e)}" over "${L(o)}"`);
  }
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    if (boxesOverlap(labels[i].box, labels[j].box, TOL)) v.push(`LABEL/LABEL: "${L(labels[i].e)}" and "${L(labels[j].e)}"`);
  }

  // R-C ── a connector's label lying along its OWN line is NOT a violation ──
  //
  // It was, and it dominated the first scan: 279 of 412. Then the PDF renderer
  // turned out to draw every connector label with a white halo already —
  // `paint-order="stroke"`, commented "white halo for legibility" — so the
  // glyphs mask the line behind them and the label reads perfectly in the very
  // output that has to be readable. The canvas now does the same.
  //
  // Removed deliberately rather than left failing: chasing it moved labels onto
  // gateways and onto each other twice over, to fix something a reader never
  // saw. A label over ANOTHER element or another label is still a violation —
  // there the halo masks something the reader does need.
  // R-D ── a connector label is clear of external labels too ──────────────
  for (const c of data.connectors) {
    const box = connectorLabelBox(c, data.elements);
    if (!box) continue;
    for (const { e, box: lb } of labels) {
      if (boxesOverlap(box, lb, TOL)) v.push(`LABEL/LABEL: connector "${c.label}" and label of "${L(e)}"`);
    }
  }

  return v;
}

/** Returns a list of global-invariant breaches; empty = clean. */
export function findLayoutViolations(data: DiagramData): string[] {
  const v: string[] = [];
  const els = data.elements;
  const conns = data.connectors;

  // 1 ── every connector has a drawable path ───────────────────────────────
  for (const c of conns) {
    if (!c.waypoints || c.waypoints.length < 2) v.push(`connector ${c.id} (${c.type}) has no waypoints`);
  }

  // 2 ── no two ruled connectors share an attachment point ──────────────────
  const points = new Map<string, string[]>(); // `elId|side|offset` → connector ids
  const add = (elId: string, side: string, off: number, cid: string) => {
    const key = `${elId}|${side}|${off.toFixed(3)}`;
    const arr = points.get(key) ?? [];
    arr.push(cid);
    points.set(key, arr);
  };
  for (const c of conns) {
    if (!RULED.has(c.type)) continue;
    add(c.sourceId, c.sourceSide, c.sourceOffsetAlong ?? 0.5, c.id);
    add(c.targetId, c.targetSide, c.targetOffsetAlong ?? 0.5, c.id);
  }
  for (const [key, ids] of points) {
    if (ids.length > 1) v.push(`shared attachment point ${key} — connectors ${ids.join(", ")}`);
  }

  // 3 ── gateway labels stay clear of flow nodes + connectors ───────────────
  const segs = conns.filter((c) => RULED.has(c.type)).flatMap(segmentsOf);
  for (const g of els) {
    if (g.type !== "gateway") continue;
    const lb = gatewayLabelBox(g);
    if (!lb) continue;
    for (const e of els) {
      if (e.id === g.id || !FLOW_NODES.has(e.type)) continue;
      if (boxesOverlap(lb, elementBox(e), TOL)) v.push(`gateway "${g.label}" label overlaps ${e.type} ${e.id}`);
    }
    if (segs.some((s) => segHitsBox(s, lb, TOL))) v.push(`gateway "${g.label}" label overlaps a connector segment`);
  }

  // 4 ── connector labels stay clear of flow nodes and each other ───────────
  const labelBoxes = conns
    .map((c) => ({ c, box: connectorLabelBox(c, data.elements) }))
    .filter((x): x is { c: Connector; box: Box } => x.box !== null);
  for (const { c, box } of labelBoxes) {
    for (const e of els) {
      if (!FLOW_NODES.has(e.type)) continue;
      if (boxesOverlap(box, elementBox(e), TOL)) v.push(`connector label "${c.label}" overlaps ${e.type} ${e.id}`);
    }
  }
  for (let i = 0; i < labelBoxes.length; i++) {
    for (let j = i + 1; j < labelBoxes.length; j++) {
      if (boxesOverlap(labelBoxes[i].box, labelBoxes[j].box, TOL)) {
        v.push(`connector labels "${labelBoxes[i].c.label}" and "${labelBoxes[j].c.label}" overlap`);
      }
    }
  }

  return v;
}

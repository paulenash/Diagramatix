/**
 * Layout geometry helper — the keystone for conflict detection and the
 * remaining label-placement rules.
 *
 * `findLayoutViolations(data)` runs a set of GLOBAL invariants over a finished
 * BPMN layout and returns human-readable breaches (empty array = clean). Unlike
 * the per-rule checks, these must hold no matter which rules fired, so they
 * surface CONFLICTS between rules as emergent failures.
 */
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";
import { wrapText } from "@/app/lib/diagram/textMetrics";

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

  return v;
}

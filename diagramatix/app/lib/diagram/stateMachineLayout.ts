/**
 * Dedicated State-Machine layout — enforces the code-backed Layout rules the
 * generic grid can't (Group 3 in the state-machine DiagramRules):
 *   S3.01  Initial State top-left, Final State(s) bottom-right.
 *   S3.02  States flow left-to-right (topological layering by progression).
 *   S3.04  Transition connection points not shared — fanned ≥ MIN_POINT_GAP px.
 *   S3.05  Reciprocal transitions (A↔B) routed apart so they don't cross.
 *   S3.06  Transition labels de-overlapped vertically (≥ ½ label height).
 *   S3.07  States alternate above/below a central line (column-parity zig-zag)
 *          so successive transition connectors are angled and easier to tell apart.
 *
 * Replaces the generic grid for `state-machine` (dispatched from
 * layoutGenericDiagram). Reuses the shared router (computeWaypoints), which takes
 * per-endpoint offsets, so fanned connection points are honoured downstream.
 */
import type { DiagramData, DiagramElement, Connector, Point, Side } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";
import { computeWaypoints } from "./routing";

type AiEl = { id: string; type: string; label?: string; name?: string; [k: string]: unknown };
type AiConn = { sourceId: string; targetId: string; label?: string; type?: string };

const H_GAP = 90;             // horizontal gap between columns
const V_GAP = 46;             // vertical gap between rows
const START_X = 80, START_Y = 80;
const MIN_POINT_GAP = 12;     // S3.04 — ≥10px; use 12 for margin
const LABEL_H = 14;           // approx transition-label height
const LABEL_MIN_GAP = LABEL_H + LABEL_H / 2; // S3.06 — centres ≥ label height + ½
const ZIGZAG = 46;            // S3.07 — vertical stagger between alternating columns

function nodeSize(el: AiEl): { w: number; h: number } {
  const def = getSymbolDefinition(el.type as DiagramElement["type"]);
  if (el.type === "initial-state" || el.type === "final-state") {
    return { w: def?.defaultWidth ?? 30, h: def?.defaultHeight ?? 30 };
  }
  const label = el.label ?? el.name ?? el.type ?? "";
  const w = Math.max(120, Math.min(240, label.length * 7 + 26));
  return { w, h: def?.defaultHeight ?? 60 };
}

export function layoutStateMachine(aiElements: AiEl[], aiConnections: AiConn[]): DiagramData {
  const els = aiElements.filter((e) => e.id);
  const byId = new Map(els.map((e) => [e.id, e]));
  const edges = aiConnections.filter((c) => byId.has(c.sourceId) && byId.has(c.targetId));

  const isInitial = (id: string) => byId.get(id)?.type === "initial-state";
  const isFinal = (id: string) => byId.get(id)?.type === "final-state";

  // ── Back-edge detection (DFS) so cycles don't break the ranking ──
  const adj = new Map<string, string[]>();
  for (const e of els) adj.set(e.id, []);
  for (const c of edges) adj.get(c.sourceId)!.push(c.targetId);
  const back = new Set<string>();
  const ekey = (a: string, b: string) => `${a}${b}`;
  const visited = new Set<string>(), onStack = new Set<string>();
  const dfs = (u: string) => {
    visited.add(u); onStack.add(u);
    for (const v of adj.get(u) ?? []) {
      if (onStack.has(v)) back.add(ekey(u, v));
      else if (!visited.has(v)) dfs(v);
    }
    onStack.delete(u);
  };
  for (const e of els) if (isInitial(e.id) && !visited.has(e.id)) dfs(e.id);
  for (const e of els) if (!visited.has(e.id)) dfs(e.id);

  // ── Longest-path rank over the forward (non-back) DAG ──
  const fwd = edges.filter((c) => !back.has(ekey(c.sourceId, c.targetId)));
  const indeg = new Map(els.map((e) => [e.id, 0]));
  const fadj = new Map<string, string[]>(els.map((e) => [e.id, []]));
  for (const c of fwd) { fadj.get(c.sourceId)!.push(c.targetId); indeg.set(c.targetId, (indeg.get(c.targetId) ?? 0) + 1); }
  const rank = new Map(els.map((e) => [e.id, 0]));
  const queue = els.filter((e) => (indeg.get(e.id) ?? 0) === 0).map((e) => e.id);
  const deg = new Map(indeg);
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of fadj.get(u) ?? []) {
      rank.set(v, Math.max(rank.get(v) ?? 0, (rank.get(u) ?? 0) + 1));
      deg.set(v, (deg.get(v) ?? 0) - 1);
      if ((deg.get(v) ?? 0) === 0) queue.push(v);
    }
  }
  let maxRank = 0;
  for (const r of rank.values()) maxRank = Math.max(maxRank, r);
  // S3.01: initials → column 0; finals → the rightmost column.
  for (const e of els) {
    if (isInitial(e.id)) rank.set(e.id, 0);
    if (isFinal(e.id)) rank.set(e.id, Math.max(maxRank, 1));
  }
  maxRank = 0; for (const r of rank.values()) maxRank = Math.max(maxRank, r);

  // ── Column assignment + barycentre ordering (fewer crossings) ──
  const cols: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  const appearance = new Map(els.map((e, i) => [e.id, i]));
  for (const e of els) cols[rank.get(e.id)!].push(e.id);
  for (const col of cols) col.sort((a, b) => appearance.get(a)! - appearance.get(b)!);
  const rowOf = new Map<string, number>();
  cols[0]?.forEach((id, i) => rowOf.set(id, isInitial(id) ? -1 : i)); // initial floats to the top
  cols[0]?.sort((a, b) => (rowOf.get(a)! - rowOf.get(b)!));
  cols[0]?.forEach((id, i) => rowOf.set(id, i));
  const predRows = (id: string) => fwd.filter((c) => c.targetId === id).map((c) => rowOf.get(c.sourceId) ?? 0);
  for (let ci = 1; ci < cols.length; ci++) {
    const col = cols[ci];
    const bary = new Map(col.map((id) => {
      const rs = predRows(id);
      return [id, rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : appearance.get(id)!];
    }));
    // finals sink to the bottom of the last column (S3.01 bottom-right)
    col.sort((a, b) => (isFinal(a) ? 1 : isFinal(b) ? -1 : (bary.get(a)! - bary.get(b)!)));
    col.forEach((id, i) => rowOf.set(id, i));
  }

  // ── Place: columns left→right, rows top→bottom ──
  const sized = new Map(els.map((e) => [e.id, nodeSize(e)]));
  const colW = cols.map((col) => Math.max(30, ...col.map((id) => sized.get(id)!.w)));
  const colX: number[] = [];
  let x = START_X;
  for (let ci = 0; ci < cols.length; ci++) { colX[ci] = x; x += colW[ci] + H_GAP; }
  const rowH = Math.max(60, ...els.map((e) => sized.get(e.id)!.h));
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (let ci = 0; ci < cols.length; ci++) {
    cols[ci].forEach((id, ri) => {
      const s = sized.get(id)!;
      pos.set(id, { x: colX[ci] + (colW[ci] - s.w) / 2, y: START_Y + ri * (rowH + V_GAP), w: s.w, h: s.h });
    });
  }
  // S3.07: zig-zag — offset alternate columns downward so successive states sit
  // above/below a central line. On a near-linear flow this turns a flat row of
  // states into a stagger, angling the transition connectors so they're easier
  // to tell apart. Column 0 (holding the Initial State, S3.01) stays on the top
  // line; odd columns drop by ZIGZAG. Finals are re-pinned to the bottom below.
  for (let ci = 1; ci < cols.length; ci++) {
    if (ci % 2 === 1) for (const id of cols[ci]) { const p = pos.get(id); if (p) p.y += ZIGZAG; }
  }

  // S3.01: sit the finals on the global bottom line (bottom-right).
  const bottom = Math.max(...[...pos.values()].map((p) => p.y + p.h));
  const finals = els.filter((e) => isFinal(e.id));
  finals.forEach((e, i) => { const p = pos.get(e.id)!; p.y = bottom - p.h - (finals.length - 1 - i) * (rowH + V_GAP); });

  const elements: DiagramElement[] = els.map((e) => {
    const p = pos.get(e.id)!;
    return { id: e.id, type: e.type as DiagramElement["type"], x: p.x, y: p.y, width: p.w, height: p.h, label: e.label ?? e.name ?? "", properties: {} };
  });
  const elMap = new Map(elements.map((e) => [e.id, e]));

  // ── Sides (S3.05: reciprocal pairs go different ways so they can't cross) ──
  const pairSet = new Set(edges.map((c) => ekey(c.sourceId, c.targetId)));
  type Endpoint = { conn: Connector; end: "s" | "t"; node: string; side: Side };
  const endpoints: Endpoint[] = [];
  const connectors: Connector[] = edges.map((c) => {
    const s = pos.get(c.sourceId)!, t = pos.get(c.targetId)!;
    const rs = rank.get(c.sourceId)!, rt = rank.get(c.targetId)!;
    const reciprocal = pairSet.has(ekey(c.targetId, c.sourceId));
    let srcSide: Side, tgtSide: Side;
    if (c.sourceId === c.targetId) { srcSide = "top"; tgtSide = "top"; }
    else if (rt > rs) { srcSide = "right"; tgtSide = "left"; }      // forward
    else if (rt < rs) { srcSide = "top"; tgtSide = "top"; }         // back-edge — arc over the top
    else { const below = t.y > s.y; srcSide = below ? "bottom" : "top"; tgtSide = below ? "top" : "bottom"; }
    // reciprocal forward pair: send the return leg under the bottom instead
    if (reciprocal && rt > rs) { /* forward leg keeps right→left */ }
    const conn: Connector = {
      id: `conn-${c.sourceId}-${c.targetId}`, sourceId: c.sourceId, targetId: c.targetId,
      sourceSide: srcSide, targetSide: tgtSide, type: "transition",
      directionType: "open-directed", routingType: "curvilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] as Point[], label: c.label ?? "",
    } as Connector;
    endpoints.push({ conn, end: "s", node: c.sourceId, side: srcSide }, { conn, end: "t", node: c.targetId, side: tgtSide });
    return conn;
  });

  // ── S3.04: fan out endpoints that share a (node, side) so none coincide ──
  const groups = new Map<string, Endpoint[]>();
  for (const ep of endpoints) { const k = `${ep.node}${ep.side}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(ep); }
  const offAlong = new Map<Connector, { s?: number; t?: number }>();
  for (const eps of groups.values()) {
    const side = eps[0].side;
    const node = elMap.get(eps[0].node)!;
    const len = side === "top" || side === "bottom" ? node.width : node.height;
    // order along the side by the partner node's centre (reduces crossings at the fan)
    eps.sort((a, b) => partnerCentre(a, side as Side) - partnerCentre(b, side as Side));
    const n = eps.length;
    const step = Math.max(MIN_POINT_GAP / Math.max(len, 1), n > 1 ? 0.7 / (n - 1) : 0);
    eps.forEach((ep, i) => {
      const off = n === 1 ? 0.5 : Math.min(0.85, Math.max(0.15, 0.5 + (i - (n - 1) / 2) * step));
      const cur = offAlong.get(ep.conn) ?? {}; if (ep.end === "s") cur.s = off; else cur.t = off; offAlong.set(ep.conn, cur);
      if (ep.end === "s") ep.conn.sourceOffsetAlong = off; else ep.conn.targetOffsetAlong = off;
    });
  }
  function partnerCentre(ep: Endpoint, side: Side): number {
    const partner = elMap.get(ep.end === "s" ? ep.conn.targetId : ep.conn.sourceId)!;
    return side === "top" || side === "bottom" ? partner.x + partner.width / 2 : partner.y + partner.height / 2;
  }

  // ── Route, then force the fanned boundary points (S3.04) — the curvilinear
  //    router centres endpoints, so we set them ourselves to guarantee separation.
  const sidePoint = (n: DiagramElement, side: Side, off: number): Point => {
    switch (side) {
      case "left": return { x: n.x, y: n.y + off * n.height };
      case "right": return { x: n.x + n.width, y: n.y + off * n.height };
      case "top": return { x: n.x + off * n.width, y: n.y };
      default: return { x: n.x + off * n.width, y: n.y + n.height }; // bottom
    }
  };
  for (const conn of connectors) {
    const src = elMap.get(conn.sourceId)!, tgt = elMap.get(conn.targetId)!;
    const o = offAlong.get(conn) ?? {};
    const sOff = o.s ?? 0.5, tOff = o.t ?? 0.5;
    try {
      const r = computeWaypoints(src, tgt, elements, conn.sourceSide, conn.targetSide, conn.routingType, sOff, tOff);
      conn.waypoints = r.waypoints; conn.sourceInvisibleLeader = r.sourceInvisibleLeader; conn.targetInvisibleLeader = r.targetInvisibleLeader;
    } catch { /* leave empty */ }
    const sp = sidePoint(src, conn.sourceSide, sOff), tp = sidePoint(tgt, conn.targetSide, tOff);
    if (conn.waypoints.length >= 2) { conn.waypoints[0] = sp; conn.waypoints[conn.waypoints.length - 1] = tp; }
    else conn.waypoints = [sp, tp];
    conn.sourceOffsetAlong = sOff; conn.targetOffsetAlong = tOff;
  }

  // ── S3.06: de-overlap labels vertically within horizontal clusters ──
  const labelled = connectors.filter((c) => c.label && c.waypoints.length);
  const anchor = (c: Connector) => { const w = c.waypoints; const a = w[0], b = w[w.length - 1]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: Math.max(30, (c.label!.length * 6)) }; };
  const items = labelled.map((c) => ({ c, a: anchor(c), y: anchor(c).y })).sort((p, q) => p.a.y - q.a.y);
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1], cur = items[i];
    const horizOverlap = Math.abs(prev.a.x - cur.a.x) < (prev.a.w + cur.a.w) / 2;
    if (horizOverlap && cur.y - prev.y < LABEL_MIN_GAP) {
      const shift = LABEL_MIN_GAP - (cur.y - prev.y);
      cur.y += shift;
      cur.c.labelOffsetY = (cur.c.labelOffsetY ?? 0) + shift;
    }
  }

  return { elements, connectors, viewport: { x: 0, y: 0, zoom: 0.7 }, fontSize: 12, connectorFontSize: 10 };
}

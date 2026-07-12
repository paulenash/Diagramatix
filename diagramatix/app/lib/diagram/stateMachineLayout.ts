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

type AiBounds = { x: number; y: number; w: number; h: number };
type AiEl = { id: string; type: string; label?: string; name?: string; bounds?: AiBounds; parent?: string; [k: string]: unknown };
type AiConn = { sourceId: string; targetId: string; label?: string; type?: string; sourceSide?: string; targetSide?: string };

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

// ─────────────────────────────────────────────────────────────────────────────
// Preserved layout — reproduce a state machine FROM AN IMAGE.
//
// When the AI transcribes an image it emits, per element, a normalised `bounds`
// {x,y,w,h} (0..1 of the whole image) and a `parent` (the composite-state /
// submachine it sits inside), and per transition a `sourceSide`/`targetSide`
// (which boundary FACE the arrow leaves / enters). This honours all three:
// original placement, Composite-State nesting, and connector attachment faces —
// instead of re-flowing everything through the auto-layout above.
//
// Returns null when too few elements carry usable bounds, so the caller falls
// back to the auto-layout (layoutStateMachine / generic grid).
// ─────────────────────────────────────────────────────────────────────────────

const SM_CONTAINER_TYPES = new Set(["composite-state", "submachine"]);
const SIDES = new Set<Side>(["top", "right", "bottom", "left"]);

function validBounds(b: unknown): b is AiBounds {
  if (!b || typeof b !== "object") return false;
  const { x, y, w, h } = b as AiBounds;
  return [x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n)) && w > 0 && h > 0;
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Side of `a` facing `b`'s centre — fallback when the AI omits a transition side. */
function facingSide(a: DiagramElement, b: DiagramElement): Side {
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  const dx = bx - ax, dy = by - ay;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

export function layoutStateMachinePreserved(
  aiElements: AiEl[],
  aiConnections: AiConn[],
  imageAspect?: { w: number; h: number },
): DiagramData | null {
  const ided = aiElements.filter((e) => e.id);
  const withBounds = ided.filter((e) => validBounds(e.bounds));
  // Need most elements to carry geometry, else the reproduction would be a
  // mix of image positions and (0,0) fallbacks — bail so the caller auto-lays.
  if (ided.length === 0 || withBounds.length < Math.ceil(ided.length * 0.6)) return null;

  const byId = new Map(ided.map((e) => [e.id, e]));

  // Normalised → px. Aspect-preserving so the reproduction keeps the source
  // diagram's proportions (mirrors bpmnLayout's layoutBpmnPreserved).
  const TARGET_W = 1400;
  const aspect = imageAspect && imageAspect.w > 0 ? imageAspect.h / imageAspect.w : 0.66;
  const TARGET_H = TARGET_W * (Number.isFinite(aspect) && aspect > 0 ? aspect : 0.66);
  const OX = 60, OY = 60;

  const elements: DiagramElement[] = [];
  for (const e of ided) {
    const def = getSymbolDefinition(e.type as DiagramElement["type"]);
    let x = OX, y = OY, w = def?.defaultWidth ?? 120, h = def?.defaultHeight ?? 60;
    if (validBounds(e.bounds)) {
      const b = e.bounds;
      x = OX + clamp01(b.x) * TARGET_W;
      y = OY + clamp01(b.y) * TARGET_H;
      w = Math.max(0.01, b.w) * TARGET_W;
      h = Math.max(0.01, b.h) * TARGET_H;
    }
    if (e.type === "initial-state" || e.type === "final-state") {
      // Pseudostates are fixed-size dots — keep the catalogue size, centre on bounds.
      const cw = def?.defaultWidth ?? 30, ch = def?.defaultHeight ?? 30;
      x = x + w / 2 - cw / 2; y = y + h / 2 - ch / 2; w = cw; h = ch;
    } else if (SM_CONTAINER_TYPES.has(e.type)) {
      w = Math.max(160, w); h = Math.max(90, h);
    } else {
      w = Math.max(90, w); h = Math.max(40, h);
    }
    const parent = e.parent && byId.has(e.parent) && SM_CONTAINER_TYPES.has(byId.get(e.parent)!.type)
      ? e.parent : undefined;
    elements.push({
      id: e.id, type: e.type as DiagramElement["type"],
      label: e.label ?? e.name ?? "", x: Math.round(x), y: Math.round(y),
      width: Math.round(w), height: Math.round(h),
      ...(parent ? { parentId: parent } : {}),
      properties: {},
    } as DiagramElement);
  }

  // Grow each container to enclose its children (image bounds are approximate,
  // and pseudostate re-sizing above can poke a child past the drawn box).
  const HEADER = 22, PAD = 14;
  const elMap = new Map(elements.map((e) => [e.id, e]));
  for (const c of elements) {
    if (!SM_CONTAINER_TYPES.has(c.type)) continue;
    const kids = elements.filter((k) => k.parentId === c.id);
    if (!kids.length) continue;
    const minX = Math.min(...kids.map((k) => k.x)) - PAD;
    const minY = Math.min(...kids.map((k) => k.y)) - PAD - HEADER;
    const maxX = Math.max(...kids.map((k) => k.x + k.width)) + PAD;
    const maxY = Math.max(...kids.map((k) => k.y + k.height)) + PAD;
    const nx = Math.min(c.x, minX), ny = Math.min(c.y, minY);
    c.width = Math.max(c.x + c.width, maxX) - nx;
    c.height = Math.max(c.y + c.height, maxY) - ny;
    c.x = nx; c.y = ny;
  }

  // Containers first so they render UNDER their children.
  elements.sort((a, b) => Number(SM_CONTAINER_TYPES.has(b.type)) - Number(SM_CONTAINER_TYPES.has(a.type)));

  // ── Connectors — honour the AI-declared boundary faces; fall back to the
  //    facing side when omitted. Then fan endpoints that share a (node, side)
  //    so multiple transitions on one face don't coincide (S3.04).
  const edges = aiConnections.filter((c) => elMap.has(c.sourceId) && elMap.has(c.targetId));
  type Endpoint = { conn: Connector; end: "s" | "t"; node: string; side: Side };
  const endpoints: Endpoint[] = [];
  const connectors: Connector[] = edges.map((c) => {
    const src = elMap.get(c.sourceId)!, tgt = elMap.get(c.targetId)!;
    let srcSide: Side = SIDES.has(c.sourceSide as Side) ? (c.sourceSide as Side) : facingSide(src, tgt);
    let tgtSide: Side = SIDES.has(c.targetSide as Side) ? (c.targetSide as Side) : facingSide(tgt, src);
    if (c.sourceId === c.targetId) { srcSide = "top"; tgtSide = "top"; }
    const conn: Connector = {
      id: `conn-${c.sourceId}-${c.targetId}`, sourceId: c.sourceId, targetId: c.targetId,
      sourceSide: srcSide, targetSide: tgtSide, type: "transition",
      directionType: "open-directed", routingType: "curvilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] as Point[], label: c.label ?? "",
    } as Connector;
    endpoints.push({ conn, end: "s", node: c.sourceId, side: srcSide }, { conn, end: "t", node: c.targetId, side: tgtSide });
    return conn;
  });

  const groups = new Map<string, Endpoint[]>();
  for (const ep of endpoints) { const k = `${ep.node}${ep.side}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(ep); }
  const partnerCentre = (ep: Endpoint, side: Side): number => {
    const partner = elMap.get(ep.end === "s" ? ep.conn.targetId : ep.conn.sourceId)!;
    return side === "top" || side === "bottom" ? partner.x + partner.width / 2 : partner.y + partner.height / 2;
  };
  for (const eps of groups.values()) {
    const side = eps[0].side;
    const node = elMap.get(eps[0].node)!;
    const len = side === "top" || side === "bottom" ? node.width : node.height;
    eps.sort((a, b) => partnerCentre(a, side) - partnerCentre(b, side));
    const n = eps.length;
    const step = Math.max(MIN_POINT_GAP / Math.max(len, 1), n > 1 ? 0.7 / (n - 1) : 0);
    eps.forEach((ep, i) => {
      const off = n === 1 ? 0.5 : Math.min(0.85, Math.max(0.15, 0.5 + (i - (n - 1) / 2) * step));
      if (ep.end === "s") ep.conn.sourceOffsetAlong = off; else ep.conn.targetOffsetAlong = off;
    });
  }

  const sidePoint = (nEl: DiagramElement, side: Side, off: number): Point => {
    switch (side) {
      case "left": return { x: nEl.x, y: nEl.y + off * nEl.height };
      case "right": return { x: nEl.x + nEl.width, y: nEl.y + off * nEl.height };
      case "top": return { x: nEl.x + off * nEl.width, y: nEl.y };
      default: return { x: nEl.x + off * nEl.width, y: nEl.y + nEl.height };
    }
  };
  for (const conn of connectors) {
    const src = elMap.get(conn.sourceId)!, tgt = elMap.get(conn.targetId)!;
    const sOff = conn.sourceOffsetAlong ?? 0.5, tOff = conn.targetOffsetAlong ?? 0.5;
    try {
      const r = computeWaypoints(src, tgt, elements, conn.sourceSide, conn.targetSide, conn.routingType, sOff, tOff);
      conn.waypoints = r.waypoints; conn.sourceInvisibleLeader = r.sourceInvisibleLeader; conn.targetInvisibleLeader = r.targetInvisibleLeader;
    } catch { /* leave empty */ }
    const sp = sidePoint(src, conn.sourceSide, sOff), tp = sidePoint(tgt, conn.targetSide, tOff);
    if (conn.waypoints.length >= 2) { conn.waypoints[0] = sp; conn.waypoints[conn.waypoints.length - 1] = tp; }
    else conn.waypoints = [sp, tp];
    conn.sourceOffsetAlong = sOff; conn.targetOffsetAlong = tOff;
  }

  return { elements, connectors, viewport: { x: 0, y: 0, zoom: 0.7 }, fontSize: 12, connectorFontSize: 10 };
}

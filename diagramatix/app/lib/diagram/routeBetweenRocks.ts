import type { DiagramElement, Point } from "./types";

/**
 * "Navigate between the rocks" (Paul, 2026-10-10, V01.07): the shortest orthogonal path that threads through the GAPS between
 * obstacles instead of going round the whole cluster.
 *
 * The router's detour for a blocked straight run is to go around the obstacles' overall extent. In V01.07 the "otherwise" branch of
 * "Invoice accepted by Customer?" had its way down blocked by one task and ran 5,000px left, down, and 5,000px back — 10,630px for a
 * 437px job — when a 60px gap between two tasks was right there. This finds that gap.
 *
 * Method: a grid built from the obstacles' edges (inflated by a clearance) plus the middle of every gap between neighbouring edges,
 * and a shortest-path search over it where every bend costs extra, so the answer is short AND has few corners. The path leaves the
 * source along its outward normal and arrives at the target along its inward normal, like every other connector.
 *
 * Pure geometry: no DOM, no element ids, easy to test.
 */
export interface Rect { x: number; y: number; width: number; height: number }
export type Dir = "right" | "left" | "top" | "bottom";

const STEP: Record<Dir, Point> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };
const DIRS: Dir[] = ["right", "left", "top", "bottom"];
const OPPOSITE: Record<Dir, Dir> = { right: "left", left: "right", top: "bottom", bottom: "top" };

export interface RockOptions {
  /** Clearance kept from every obstacle, px. */
  clearance?: number;
  /** Length of the straight lead-out/lead-in at each end, px. */
  stub?: number;
  /** Extra cost of each bend, in px of path. */
  bend?: number;
  /** Only obstacles within this margin of the start–end box matter. */
  window?: number;
}

/**
 * The shortest few-bend orthogonal route from `a` (leaving along `aDir`) to `b` (arriving along the inverse of `bDir`, i.e. `bDir` is
 * the outward normal of the face it lands on). Returns the points INCLUDING `a` and `b`, or null when no route exists.
 */
export function routeBetweenRocks(a: Point, aDir: Dir, b: Point, bDir: Dir, obstacles: Rect[], opts: RockOptions = {}): Point[] | null {
  const M = opts.clearance ?? 12, STUBLEN = opts.stub ?? 24, BEND = opts.bend ?? 30, WIN = opts.window ?? 300;
  const s0: Point = { x: a.x + STEP[aDir].x * STUBLEN, y: a.y + STEP[aDir].y * STUBLEN };
  const e0: Point = { x: b.x + STEP[bDir].x * STUBLEN, y: b.y + STEP[bDir].y * STUBLEN };

  const minX = Math.min(a.x, b.x, s0.x, e0.x) - WIN, maxX = Math.max(a.x, b.x, s0.x, e0.x) + WIN;
  const minY = Math.min(a.y, b.y, s0.y, e0.y) - WIN, maxY = Math.max(a.y, b.y, s0.y, e0.y) + WIN;
  const rects = obstacles
    .filter(o => o.x < maxX && o.x + o.width > minX && o.y < maxY && o.y + o.height > minY)
    .map(o => ({ x0: o.x - M, y0: o.y - M, x1: o.x + o.width + M, y1: o.y + o.height + M }));

  const inside = (p: Point) => rects.some(r => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1);
  // A lead-out that starts or ends inside another obstacle's clearance (a walled-in face) has no route from here.
  if (inside(s0) || inside(e0)) return null;

  // Grid lines: both ends, every obstacle edge, and the middle of every gap between neighbouring lines (the channels between rocks).
  const lines = (vals: number[], lo: number, hi: number) => {
    const u = [...new Set(vals.map(v => Math.round(v * 2) / 2))].filter(v => v >= lo && v <= hi).sort((p, q) => p - q);
    const out = [...u];
    for (let i = 0; i + 1 < u.length; i++) if (u[i + 1] - u[i] > 2 * M) out.push((u[i] + u[i + 1]) / 2);
    return [...new Set(out)].sort((p, q) => p - q);
  };
  const xs = lines([a.x, b.x, s0.x, e0.x, ...rects.flatMap(r => [r.x0, r.x1])], minX, maxX);
  const ys = lines([a.y, b.y, s0.y, e0.y, ...rects.flatMap(r => [r.y0, r.y1])], minY, maxY);
  const nx = xs.length, ny = ys.length;
  const xi = new Map(xs.map((v, i) => [v, i])), yi = new Map(ys.map((v, i) => [v, i]));
  const si = xi.get(Math.round(s0.x * 2) / 2), sj = yi.get(Math.round(s0.y * 2) / 2);
  const ei = xi.get(Math.round(e0.x * 2) / 2), ej = yi.get(Math.round(e0.y * 2) / 2);
  if (si === undefined || sj === undefined || ei === undefined || ej === undefined) return null;

  // Does the open segment between two adjacent grid nodes pass through an obstacle's clearance zone?
  const blockedH = (i: number, j: number) => { const y = ys[j], xa = xs[i], xb = xs[i + 1]; return rects.some(r => y > r.y0 && y < r.y1 && xb > r.x0 && xa < r.x1); };
  const blockedV = (i: number, j: number) => { const x = xs[i], ya = ys[j], yb = ys[j + 1]; return rects.some(r => x > r.x0 && x < r.x1 && yb > r.y0 && ya < r.y1); };

  // Dijkstra over (node, heading); binary heap.
  const N = nx * ny * 4;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const idx = (i: number, j: number, d: number) => (i * ny + j) * 4 + d;
  const heap: [number, number][] = [];
  const push = (c: number, s: number) => { heap.push([c, s]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };

  const startState = idx(si, sj, DIRS.indexOf(aDir));
  dist[startState] = 0;
  push(0, startState);
  const arriveDir = DIRS.indexOf(OPPOSITE[bDir]);       // the heading with which the last leg runs into the face
  let goal = -1;
  while (heap.length) {
    const [c, st]: [number, number] = pop();
    if (c > dist[st]) continue;
    const d: number = st % 4, cell: number = (st - d) / 4, j: number = cell % ny, i: number = (cell - j) / ny;
    if (i === ei && j === ej) { goal = st; break; }
    for (let nd = 0; nd < 4; nd++) {
      if (DIRS[nd] === OPPOSITE[DIRS[d]]) continue;     // never double back
      const step = STEP[DIRS[nd]];
      const ni: number = i + step.x, nj: number = j + step.y;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      if (step.x !== 0 ? blockedH(Math.min(i, ni), j) : blockedV(i, Math.min(j, nj))) continue;
      const len = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]);
      let cost = c + len + (nd === d ? 0 : BEND);
      if (ni === ei && nj === ej && nd !== arriveDir) cost += BEND;      // the final turn into the face
      const ns = idx(ni, nj, nd);
      if (cost < dist[ns]) { dist[ns] = cost; prev[ns] = st; push(cost, ns); }
    }
  }
  if (goal < 0) return null;

  const nodes: Point[] = [];
  for (let st = goal; st >= 0; st = prev[st]) {
    const d: number = st % 4, cell: number = (st - d) / 4, j: number = cell % ny, i: number = (cell - j) / ny;
    nodes.push({ x: xs[i], y: ys[j] });
  }
  nodes.reverse();
  const poly: Point[] = [a, ...nodes, b];
  // Drop repeated points and the middle of every straight run.
  const out: Point[] = [];
  for (const p of poly) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 0.01 && Math.abs(out[out.length - 1].y - p.y) < 0.01) continue;
    out.push(p);
    while (out.length >= 3) {
      const [p0, p1, p2] = out.slice(-3);
      const collinear = (Math.abs(p0.x - p1.x) < 0.01 && Math.abs(p1.x - p2.x) < 0.01) || (Math.abs(p0.y - p1.y) < 0.01 && Math.abs(p1.y - p2.y) < 0.01);
      if (!collinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** The obstacles a flow connector must keep clear of (everything it is not connected to or inside). */
export function rockObstacles(elements: DiagramElement[], sourceId: string, targetId: string): Rect[] {
  const byId = new Map(elements.map(e => [e.id, e]));
  const ancestors = (id: string) => { const s = new Set<string>(); let cur = byId.get(id); for (let i = 0; i < 16 && cur; i++) { const n = cur.boundaryHostId ?? cur.parentId; if (!n) break; s.add(n); cur = byId.get(n); } return s; };
  const sa = ancestors(sourceId), ta = ancestors(targetId);
  const KINDS = new Set(["task", "subprocess", "subprocess-expanded", "gateway", "start-event", "intermediate-event", "end-event"]);
  return elements
    .filter(e => KINDS.has(e.type) && e.id !== sourceId && e.id !== targetId && !e.boundaryHostId
      && !sa.has(e.id) && !ta.has(e.id)                                    // a container holding an end is not an obstacle
      && byId.get(e.boundaryHostId ?? "")?.id !== sourceId)
    .map(e => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
}

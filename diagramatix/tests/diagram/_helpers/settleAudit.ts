/**
 * What a settled template insert (or any growth) must leave true — issue 6's
 * "stronger verification" (verdict-6: "both ends within 1px of a fresh route"
 * passed stale interiors and routes through shapes):
 *
 *   • every connector end is ON its element (unless it was not before);
 *   • a flow whose two ends moved by the same (dx, dy) is that flow translated,
 *     point for point;
 *   • no flow crosses a flow element it did not cross before;
 *   • no two pools overlap (that did not before);
 *   • every template element lies inside its parent (a boundary event: its
 *     centre), and a boundary event's whole box inside the lane that holds its
 *     host;
 *   • no unowned template FLOW element lies over a pool (a note is unowned by
 *     design — containment.ts `isLaneUnowned` — and may sit anywhere).
 *
 * Each check returns human-readable lines, empty when it holds. Independent of
 * the router: it reads only the geometry.
 */
import type { Connector, DiagramData, DiagramElement, Point } from "@/app/lib/diagram/types";
import { isLaneUnowned } from "@/app/lib/diagram/containment";

const nm = (e?: DiagramElement) => (e ? (e.label || e.type).split("\n").join(" ") : "?");
const byId = (d: { elements: DiagramElement[] }) => new Map(d.elements.map((e) => [e.id, e] as const));

function visibleEnds(c: Connector): [Point, Point] | null {
  const w = c.waypoints;
  if (w.length < 2) return null;
  const a = c.sourceInvisibleLeader && w.length > 2 ? w[1] : w[0];
  const b = c.targetInvisibleLeader && w.length > 2 ? w[w.length - 2] : w[w.length - 1];
  return [a, b];
}
const distToBox = (p: Point, e: DiagramElement) =>
  Math.hypot(Math.max(e.x - p.x, 0, p.x - (e.x + e.width)), Math.max(e.y - p.y, 0, p.y - (e.y + e.height)));

/** Connectors with a visible end more than 2px off its element. */
export function endsOff(d: DiagramData): string[] {
  const M = byId(d);
  const out: string[] = [];
  for (const c of d.connectors) {
    const s = M.get(c.sourceId), t = M.get(c.targetId), ends = visibleEnds(c);
    if (!s || !t || !ends) continue;
    const ds = distToBox(ends[0], s), dt = distToBox(ends[1], t);
    if (ds > 2 || dt > 2) out.push(`${c.id} ${nm(s)}→${nm(t)} off by ${ds.toFixed(1)}/${dt.toFixed(1)}`);
  }
  return out;
}

/** Ends off after the change that were on before (`before` holds the payload's own flows as given). */
export function newlyDetached(before: DiagramData, after: DiagramData): string[] {
  const was = new Set(endsOff(before).map((l) => l.split(" ")[0]));
  return endsOff(after).filter((l) => !was.has(l.split(" ")[0]));
}

/** Flows whose ends moved rigidly together but whose route is not the old one translated. */
export function rigidNotTranslated(before: DiagramData, after: DiagramData): string[] {
  const B = byId(before), A = byId(after);
  const was = new Map(before.connectors.map((c) => [c.id, c] as const));
  const out: string[] = [];
  const motion = (id: string) => {
    const b = B.get(id), a = A.get(id);
    if (!b || !a) return null;
    return { dx: a.x - b.x, dy: a.y - b.y, same: Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01 };
  };
  for (const c of after.connectors) {
    const o = was.get(c.id);
    if (!o) continue;
    const s = motion(c.sourceId), t = motion(c.targetId);
    if (!s || !t || !s.same || !t.same) continue;
    if (Math.abs(s.dx - t.dx) > 0.01 || Math.abs(s.dy - t.dy) > 0.01) continue;
    if (Math.abs(s.dx) < 0.01 && Math.abs(s.dy) < 0.01) continue;
    const ok = o.waypoints.length === c.waypoints.length
      && o.waypoints.every((p, i) => Math.abs(p.x + s.dx - c.waypoints[i].x) < 0.01 && Math.abs(p.y + s.dy - c.waypoints[i].y) < 0.01);
    if (!ok) out.push(`${c.id} ${nm(A.get(c.sourceId))}→${nm(A.get(c.targetId))} moved (${s.dx.toFixed(1)},${s.dy.toFixed(1)}) but was not translated`);
  }
  return out;
}

const FLOW = new Set(["task", "subprocess", "subprocess-expanded", "gateway", "start-event", "end-event", "intermediate-event", "data-object", "data-store"]);

/** Every (flow, element) pair whose visible route runs through the element's inside. */
export function crossings(d: DiagramData): Set<string> {
  const M = byId(d);
  const chain = (id: string) => {
    const s = new Set<string>();
    let cur = M.get(id);
    for (let i = 0; cur && i < 24; i++) {
      s.add(cur.id);
      if (cur.boundaryHostId) s.add(cur.boundaryHostId);
      cur = cur.parentId ? M.get(cur.parentId) : undefined;
    }
    for (const e of d.elements) if (e.boundaryHostId === id) s.add(e.id);
    return s;
  };
  const out = new Set<string>();
  for (const c of d.connectors) {
    if (c.type === "messageBPMN" || c.type === "associationBPMN") continue;
    const skip = new Set([...chain(c.sourceId), ...chain(c.targetId)]);
    const w = c.waypoints;
    const a = c.sourceInvisibleLeader ? 1 : 0, b = c.targetInvisibleLeader ? w.length - 2 : w.length - 1;
    for (const e of d.elements) {
      if (skip.has(e.id) || !FLOW.has(e.type)) continue;
      const x0 = e.x + 2, x1 = e.x + e.width - 2, y0 = e.y + 2, y1 = e.y + e.height - 2;
      for (let i = a; i < b; i++) {
        const p = w[i], q = w[i + 1];
        const hit = Math.abs(p.y - q.y) < 0.5
          ? p.y > y0 && p.y < y1 && Math.max(p.x, q.x) > x0 && Math.min(p.x, q.x) < x1
          : Math.abs(p.x - q.x) < 0.5 && p.x > x0 && p.x < x1 && Math.max(p.y, q.y) > y0 && Math.min(p.y, q.y) < y1;
        if (hit) { out.add(`${c.id}|${e.id}`); break; }
      }
    }
  }
  return out;
}

/** Crossings after that were not there before. */
export function newCrossings(before: DiagramData, after: DiagramData): string[] {
  const was = crossings(before);
  const A = byId(after);
  const conn = new Map(after.connectors.map((c) => [c.id, c] as const));
  return [...crossings(after)].filter((k) => !was.has(k)).map((k) => {
    const [cid, eid] = k.split("|");
    const c = conn.get(cid)!;
    return `${cid} ${nm(A.get(c.sourceId))}→${nm(A.get(c.targetId))} through ${nm(A.get(eid))}`;
  });
}

/** Pairs of pools that overlap (and did not before, when `before` is given). */
export function poolOverlaps(d: DiagramData, before?: DiagramData): string[] {
  const pools = d.elements.filter((e) => e.type === "pool");
  const was = before ? new Set(poolOverlaps(before)) : new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < pools.length; i++) for (let j = i + 1; j < pools.length; j++) {
    const p = pools[i], q = pools[j];
    const ov = Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y);
    const ox = Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x);
    const key = `${p.id}/${q.id}`;
    if (ov > 0.5 && ox > 0.5 && !was.has(key)) out.push(key);
  }
  return out;
}

/** Template elements that are not inside their parent (boundary events: their centre). */
export function outsideParent(d: DiagramData, ids: Set<string>): string[] {
  const M = byId(d);
  const out: string[] = [];
  for (const id of ids) {
    const e = M.get(id);
    if (!e?.parentId) continue;
    const p = M.get(e.parentId);
    if (!p) { out.push(`${nm(e)}: parent missing`); continue; }
    if (e.boundaryHostId) {
      const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
      if (cx < p.x - 0.5 || cy < p.y - 0.5 || cx > p.x + p.width + 0.5 || cy > p.y + p.height + 0.5) out.push(`${nm(e)} (boundary) centre outside ${nm(p)}`);
      continue;
    }
    if (e.x < p.x - 0.5 || e.y < p.y - 0.5 || e.x + e.width > p.x + p.width + 0.5 || e.y + e.height > p.y + p.height + 0.5) {
      out.push(`${nm(e)} outside ${nm(p)}`);
    }
  }
  return out;
}

/**
 * Boundary events of the template whose WHOLE drawn box is not inside the band
 * (lane, or lane-less pool) that holds their host. `outsideParent` judges a
 * boundary event by its centre, which sits on its host's edge — an event on an
 * EP's bottom rim hung 10px below the lane and still passed (review of 6a).
 */
export function boundaryOutsideBand(d: DiagramData, ids: Set<string>): string[] {
  const M = byId(d);
  const out: string[] = [];
  for (const id of ids) {
    const e = M.get(id);
    if (!e?.boundaryHostId) continue;
    let band = M.get(e.boundaryHostId);
    for (let i = 0; band && band.type !== "lane" && band.type !== "pool" && i < 24; i++) band = band.parentId ? M.get(band.parentId) : undefined;
    if (!band || band.type !== "lane" && band.type !== "pool") continue;
    if (e.x < band.x - 0.5 || e.y < band.y - 0.5 || e.x + e.width > band.x + band.width + 0.5 || e.y + e.height > band.y + band.height + 0.5) {
      out.push(`${nm(e)} (boundary) pokes out of ${nm(band)} by T${(band.y - e.y).toFixed(1)} B${(e.y + e.height - band.y - band.height).toFixed(1)}`);
    }
  }
  return out;
}

/** Unowned template flow elements lying over a pool the template did not bring. */
export function unownedOverPool(d: DiagramData, ids: Set<string>): string[] {
  const M = byId(d);
  const pools = d.elements.filter((e) => e.type === "pool" && !ids.has(e.id));
  const out: string[] = [];
  for (const id of ids) {
    const e = M.get(id);
    if (!e || e.parentId || e.boundaryHostId || e.type === "pool" || e.type === "lane" || isLaneUnowned(e)) continue;
    const hit = pools.filter((q) => Math.min(e.x + e.width, q.x + q.width) > Math.max(e.x, q.x) && Math.min(e.y + e.height, q.y + q.height) > Math.max(e.y, q.y));
    if (hit.length) out.push(`${nm(e)} over ${hit.map(nm).join(", ")}`);
  }
  return out;
}

/** The template's elements, compared with where it was dropped: one common offset, or TORN. */
export function pieceOffsets(payload: readonly DiagramElement[], d: DiagramData): string[] {
  const M = byId(d);
  return [...new Set(payload.map((e) => {
    const a = M.get(e.id)!;
    return `${(a.x - e.x).toFixed(2)},${(a.y - e.y).toFixed(2)}`;
  }))];
}

/**
 * All of the above for one template insert: `base` before, `after` the reducer's
 * answer, `payload` what was handed to APPLY_TEMPLATE.
 */
export function auditInsert(
  base: DiagramData,
  payload: { elements: DiagramElement[]; connectors: Connector[] },
  after: DiagramData,
): string[] {
  const ids = new Set(payload.elements.map((e) => e.id));
  const naive: DiagramData = { ...base, elements: [...base.elements, ...payload.elements], connectors: [...base.connectors, ...payload.connectors] };
  const offsets = pieceOffsets(payload.elements, after);
  return [
    ...newlyDetached(naive, after).map((l) => `DETACHED ${l}`),
    ...rigidNotTranslated(naive, after).map((l) => `NOT-TRANSLATED ${l}`),
    ...newCrossings(naive, after).map((l) => `NEW-CROSSING ${l}`),
    ...poolOverlaps(after, base).map((l) => `POOL-OVERLAP ${l}`),
    ...outsideParent(after, ids).map((l) => `OUTSIDE ${l}`),
    ...boundaryOutsideBand(after, ids).map((l) => `BOUNDARY-OUT ${l}`),
    ...unownedOverPool(after, ids).map((l) => `UNOWNED-OVER-POOL ${l}`),
    ...(offsets.length > 1 ? [`TORN ${offsets.join(" | ")}`] : []),
  ];
}

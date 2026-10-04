/**
 * One connector per attachment point — the allocator (slice 1 of new features/connector-endpoints-plan-2026-10-03.md).
 *
 * THE RULE (Paul, 2026-10-03). On a BPMN diagram, never let two sequence or message connectors attach at the same point
 * of an Activity or an Event (whether both leave, both arrive, or one of each); spread them a little — Activities 8 px
 * (5–10), Events 3 px (2–3), messages 24 px on an Activity — in the order that avoids crossings; and touch nothing else:
 * a lone connector, and a point the user placed that does not collide, are never moved.
 *
 * Decisions that shape it (plan §12): GATEWAYS ARE OUT OF SCOPE (their ends are neither moved nor counted); associations
 * are left alone; messages keep a 24 px step; fewest crossings beats target order.
 *
 * What it does and does not do:
 *   • PURE. It returns connectors whose `sourceOffsetAlong` / `targetOffsetAlong` have been changed (and the ids it
 *     changed) — it does not recompute routes. The caller re-routes the changed connectors (recomputeAllConnectors).
 *   • IDEMPOTENT: a second run on its own output changes nothing. That is what lets a heal-on-load be silent on a diagram
 *     that is already right, and what the tests pin.
 *   • A message's SPINE is one world x shared by both ends (routing.ts / useDiagram.ts messageBpmnWaypoints), so a message
 *     is moved at ONE end — the Activity / Event, never the pool — and the other end follows. (Today the router ignores a
 *     message's offset when an Event is an end and uses the Event's centre; honouring the offset there is slice 3's job.
 *     This module only decides what the offsets should be.)
 *   • Not here: the editor post-pass, generation, heal-on-load, and the carve-outs that today force offset 0.5 (A3, R7.02,
 *     the obstacle reset). Those are slices 2–5.
 */
import type { Connector, DiagramElement, Point, Side } from "./types";
import { computeWaypoints } from "./routing";

/** The connector types the rule covers. */
const RULED = new Set<string>(["sequence", "messageBPMN"]);

type Cls = "activity" | "event" | "pool";
const ACTIVITY = new Set(["task", "subprocess", "subprocess-expanded"]);
const EVENT = new Set(["start-event", "end-event", "intermediate-event"]);
const classOf = (e: DiagramElement): Cls | null =>
  ACTIVITY.has(e.type) ? "activity" : EVENT.has(e.type) ? "event" : e.type === "pool" ? "pool" : null;

/** Spacing, px. `gap`: two sequence ends closer than this collide. `step`: where a colliding group is spread to. */
export const SPREAD = {
  activity: { gap: 5, step: 8, margin: 6 },
  event: { gap: 2, step: 3, margin: 4 },
  pool: { gap: 24, step: 26, margin: 10 },
  /** A message beside anything on an Activity; on an Event the fan is the event's 3 px. */
  messageActivity: 24,
  messageEvent: 3,
} as const;

/** Rounding slack: a spread that lands exactly one gap apart must not read as a collision on the next run. */
const EPS = 0.05;
const MAX_PASSES = 8;
/** Up to this many ends in a group, every order is tried for fewest crossings (4! = 24). */
const MAX_PERMUTE = 4;

const horizontal = (side: Side) => side === "top" || side === "bottom";
const faceLength = (el: DiagramElement, side: Side) => (horizontal(side) ? el.width : el.height);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export interface SpreadResult {
  connectors: Connector[];
  /** Connectors whose offsets changed — re-route these. */
  changedIds: string[];
  /** `elementId|side` faces that still hold a collision this module could not resolve (no room). */
  unresolved: string[];
}

// ── crossings ──────────────────────────────────────────────────────────────────
const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
/** A proper crossing: the two segments meet strictly inside both. Touching at an end, or running along each other, is not one. */
function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
  const T = 1e-6;
  return ((d1 > T && d2 < -T) || (d1 < -T && d2 > T)) && ((d3 > T && d4 < -T) || (d3 < -T && d4 > T));
}
function crossingsBetween(a: Point[], b: Point[]): number {
  let n = 0;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) if (segmentsCross(a[i - 1], a[i], b[j - 1], b[j])) n++;
  return n;
}
function bbox(r: Point[]) {
  return { x0: Math.min(...r.map((p) => p.x)), x1: Math.max(...r.map((p) => p.x)), y0: Math.min(...r.map((p) => p.y)), y1: Math.max(...r.map((p) => p.y)) };
}
function permutations(n: number): number[][] {
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]) => {
    if (!rest.length) { out.push(cur); return; }
    rest.forEach((v, i) => rec([...cur, v], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], Array.from({ length: n }, (_, i) => i));
  return out;                                   // identity first
}

export function spreadEndpoints(
  elements: readonly DiagramElement[],
  connectors: readonly Connector[],
  opts: { /** Free-form / imported layout: messages are not vertical there, so they are left alone. */ relaxed?: boolean } = {},
): SpreadResult {
  const elementList = elements as DiagramElement[];
  const els = new Map(elements.map((e) => [e.id, e] as const));
  const work = new Map<string, Connector>();
  for (const c of connectors) work.set(c.id, c);
  const changed = new Set<string>();

  // ── which connectors are in play ───────────────────────────────────────────
  const inPlay = (c: Connector): boolean => {
    if (!RULED.has(c.type)) return false;
    if (!els.get(c.sourceId) || !els.get(c.targetId)) return false;
    if (c.type === "messageBPMN") {
      if (opts.relaxed) return false;
      if (!horizontal(c.sourceSide) || !horizontal(c.targetSide)) return false;       // a message is vertical
    }
    return true;
  };
  const play = connectors.filter(inPlay).map((c) => c.id);

  // A message is MOVED at one end: the non-pool element (the source when both are).
  const ctrlRole = (c: Connector): "source" | "target" =>
    els.get(c.sourceId)!.type !== "pool" ? "source" : els.get(c.targetId)!.type !== "pool" ? "target" : "source";
  const offOf = (c: Connector, role: "source" | "target") => (role === "source" ? c.sourceOffsetAlong : c.targetOffsetAlong) ?? 0.5;
  const withOff = (c: Connector, role: "source" | "target", off: number): Connector =>
    role === "source" ? { ...c, sourceOffsetAlong: off } : { ...c, targetOffsetAlong: off };

  /** A message's spine: one world x. */
  const spineX = (c: Connector): number => {
    const r = ctrlRole(c);
    const e = els.get(r === "source" ? c.sourceId : c.targetId)!;
    return e.x + offOf(c, r) * e.width;
  };
  /** Move a message's spine to world x, at both ends (the pool end follows). False when it would not fit on an end. */
  const setSpine = (id: string, x: number): boolean => {
    const c = work.get(id)!;
    const s = els.get(c.sourceId)!, t = els.get(c.targetId)!;
    const fits = (e: DiagramElement) => {
      const cl = classOf(e);
      const m = Math.min(cl ? SPREAD[cl].margin : 0, e.width / 2);
      return x >= e.x + m - EPS && x <= e.x + e.width - m + EPS;
    };
    if (!fits(s) || !fits(t)) return false;
    const so = round4((x - s.x) / s.width), to = round4((x - t.x) / t.width);
    if (Math.abs(so - offOf(c, "source")) < 1e-6 && Math.abs(to - offOf(c, "target")) < 1e-6) return true;
    work.set(id, { ...c, sourceOffsetAlong: so, targetOffsetAlong: to });
    changed.add(id);
    return true;
  };

  // ── an end: where it sits on its face, and how to move it ──────────────────
  interface End { id: string; role: "source" | "target"; el: DiagramElement; side: Side; isMessage: boolean; movableHere: boolean }
  const endsByFace = (): Map<string, End[]> => {
    const faces = new Map<string, End[]>();
    for (const id of play) {
      const c = work.get(id)!;
      for (const role of ["source", "target"] as const) {
        const el = els.get(role === "source" ? c.sourceId : c.targetId)!;
        const cl = classOf(el);
        if (!cl) continue;                                         // a gateway, a data object …: not in scope
        const side = role === "source" ? c.sourceSide : c.targetSide;
        const isMessage = c.type === "messageBPMN";
        const movableHere = isMessage ? ctrlRole(c) === role && cl !== "pool" : cl !== "pool";
        const key = `${el.id}|${side}`;
        (faces.get(key) ?? faces.set(key, []).get(key)!).push({ id, role, el, side, isMessage, movableHere });
      }
    }
    return faces;
  };
  const posOf = (e: End): number => {
    const c = work.get(e.id)!;
    return e.isMessage ? spineX(c) - e.el.x : offOf(c, e.role) * faceLength(e.el, e.side);
  };
  const setPos = (e: End, px: number): boolean => {
    const c = work.get(e.id)!;
    if (e.isMessage) return setSpine(e.id, e.el.x + px);
    const off = round4(px / faceLength(e.el, e.side));
    if (Math.abs(off - offOf(c, e.role)) < 1e-6) return true;
    work.set(e.id, withOff(c, e.role, off));
    changed.add(e.id);
    return true;
  };
  const pairGap = (a: End, b: End): number => {
    const cl = classOf(a.el)!;
    if (a.isMessage || b.isMessage) return cl === "activity" ? SPREAD.messageActivity : cl === "event" ? SPREAD.messageEvent : SPREAD.pool.gap;
    return SPREAD[cl].gap;
  };
  /** Where the OTHER end of this connector is, along the face's axis — the order that does not cross. */
  const otherCoord = (e: End): number => {
    const c = work.get(e.id)!;
    const o = els.get(e.role === "source" ? c.targetId : c.sourceId)!;
    return horizontal(e.side) ? o.x + o.width / 2 : o.y + o.height / 2;
  };

  // ── routes, for counting crossings ─────────────────────────────────────────
  /** The visible line of a connector, with one end trial-placed at `px` along its face (or as it stands). */
  const routeOf = (c: Connector, trial?: { e: End; px: number }): Point[] | null => {
    const s = els.get(c.sourceId)!, t = els.get(c.targetId)!;
    if (c.type === "messageBPMN") {
      const x = trial && trial.e.id === c.id ? trial.e.el.x + trial.px : spineX(c);
      const y = (e: DiagramElement, side: Side) => (side === "top" ? e.y : e.y + e.height);
      return [{ x, y: y(s, c.sourceSide) }, { x, y: y(t, c.targetSide) }];
    }
    let so = offOf(c, "source"), to = offOf(c, "target");
    if (trial && trial.e.id === c.id) {
      const off = trial.px / faceLength(trial.e.el, trial.e.side);
      if (trial.e.role === "source") so = off; else to = off;
    }
    try {
      const w = computeWaypoints(s, t, elementList, c.sourceSide, c.targetSide, c.routingType, so, to);
      const pts = w.waypoints;
      const from = w.sourceInvisibleLeader ? 1 : 0, upto = w.targetInvisibleLeader ? pts.length - 1 : pts.length;
      const vis = pts.slice(from, upto);
      return vis.length >= 2 ? vis : null;
    } catch { return null; }
  };

  /** Fewest-crossings assignment of `slots` to the cluster's movable ends (already in the order that normally avoids crossings). */
  function bestOrder(movables: End[], slots: number[]): number[] {
    const identity = movables.map((_, i) => i);
    if (movables.length < 2 || movables.length > MAX_PERMUTE) return identity;
    const ids = new Set(movables.map((m) => m.id));
    // Others that could cross: any other connector whose line meets the cluster's neighbourhood.
    const baseRoutes = movables.map((m) => routeOf(work.get(m.id)!)).filter((r): r is Point[] => !!r);
    if (!baseRoutes.length) return identity;
    const all = baseRoutes.flat();
    const area = { x0: Math.min(...all.map((p) => p.x)) - 60, x1: Math.max(...all.map((p) => p.x)) + 60, y0: Math.min(...all.map((p) => p.y)) - 60, y1: Math.max(...all.map((p) => p.y)) + 60 };
    const others: Point[][] = [];
    for (const id of play) {
      if (ids.has(id)) continue;
      const r = routeOf(work.get(id)!);
      if (!r) continue;
      const b = bbox(r);
      if (b.x1 >= area.x0 && b.x0 <= area.x1 && b.y1 >= area.y0 && b.y0 <= area.y1) others.push(r);
    }
    let best = identity, bestN = Infinity;
    for (const perm of permutations(movables.length)) {
      const routes: Point[][] = [];
      let ok = true;
      for (let k = 0; k < movables.length; k++) {
        const r = routeOf(work.get(movables[k].id)!, { e: movables[k], px: slots[perm[k]] });
        if (!r) { ok = false; break; }
        routes.push(r);
      }
      if (!ok) continue;
      let n = 0;
      for (let i = 0; i < routes.length; i++) {
        for (let j = i + 1; j < routes.length; j++) n += crossingsBetween(routes[i], routes[j]);
        for (const o of others) n += crossingsBetween(routes[i], o);
      }
      if (n < bestN) { bestN = n; best = perm; }        // strictly fewer: ties keep the order by target position
    }
    return best;
  }

  const unresolvedFaces = new Set<string>();

  /** A face on an Activity or an Event: spread the colliding ends. */
  function resolveFace(key: string, ends: End[], cl: "activity" | "event"): boolean {
    const L = faceLength(ends[0].el, ends[0].side);
    const spec = SPREAD[cl];
    const sorted = ends.map((e) => ({ e, pos: posOf(e) })).sort((a, b) => a.pos - b.pos || a.e.id.localeCompare(b.e.id));
    const clusters: { e: End; pos: number }[][] = [];
    for (const it of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && it.pos - last[last.length - 1].pos < pairGap(last[last.length - 1].e, it.e) - EPS) last.push(it);
      else clusters.push([it]);
    }
    let moved = false;
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;                          // a lone end, or one that collides with nothing: never touched
      const movables = cluster.filter((x) => x.e.movableHere);
      const fixed = cluster.filter((x) => !x.e.movableHere);
      if (!movables.length) { unresolvedFaces.add(key); continue; }
      const hasMsg = cluster.some((x) => x.e.isMessage);
      const lo = spec.margin, hi = L - spec.margin;
      const minGap = hasMsg ? (cl === "activity" ? SPREAD.messageActivity : SPREAD.messageEvent) : spec.gap;

      if (fixed.length) {
        // Some ends cannot move here (a message whose other end is the one that moves): place the movable ends round them.
        const taken = fixed.map((f) => f.pos);
        const base = hasMsg ? (cl === "activity" ? SPREAD.messageActivity : SPREAD.messageEvent) : spec.step;
        for (const m of [...movables].sort((a, b) => otherCoord(a.e) - otherCoord(b.e) || a.e.id.localeCompare(b.e.id))) {
          let placed = false;
          for (let k = 0; k <= 12 && !placed; k++) {
            for (const sign of k === 0 ? [0] : [1, -1]) {
              const p = clamp(m.pos + sign * k * base, lo, hi);
              if (taken.every((q) => Math.abs(q - p) >= minGap - EPS) && setPos(m.e, p)) { taken.push(p); placed = true; moved = true; break; }
            }
          }
          if (!placed) unresolvedFaces.add(key);
        }
        continue;
      }

      const m = movables.length;
      let step = hasMsg ? minGap : spec.step;
      if ((m - 1) * step > hi - lo) step = (hi - lo) / (m - 1);
      if (step < minGap - EPS) unresolvedFaces.add(key);          // no room for the full gap: spread as far as the face allows
      const mean = movables.reduce((s, x) => s + x.pos, 0) / m;
      const start = clamp(mean - ((m - 1) * step) / 2, lo, hi - (m - 1) * step);
      const slots = Array.from({ length: m }, (_, k) => start + k * step);
      // The order along the face follows the order of the elements the connectors go to; flipped only to cross less.
      const ordered = [...movables].sort((a, b) => otherCoord(a.e) - otherCoord(b.e) || a.e.id.localeCompare(b.e.id));
      const perm = bestOrder(ordered.map((x) => x.e), slots);
      ordered.forEach((x, k) => {
        if (Math.abs(posOf(x.e) - slots[perm[k]]) > 1e-6 && setPos(x.e, slots[perm[k]])) moved = true;
      });
    }
    return moved;
  }

  /** A pool's face holds only message ends (a sequence flow never attaches to a pool): separate the spines by 24 px. */
  function resolvePoolFace(key: string, ends: End[]): boolean {
    const sorted = ends.map((e) => ({ e, pos: posOf(e) })).sort((a, b) => a.pos - b.pos || a.e.id.localeCompare(b.e.id));
    const gap = SPREAD.pool.gap;
    let moved = false;
    let prev = sorted[0]?.pos ?? 0;
    for (let i = 1; i < sorted.length; i++) {
      const it = sorted[i];
      const pos = posOf(it.e);
      if (pos - prev >= gap - EPS) { prev = pos; continue; }
      const poolX = it.e.el.x;
      if (setSpine(it.e.id, poolX + prev + gap)) { prev = prev + gap; moved = true; continue; }
      // No room to the right: try to the left of the first one.
      if (setSpine(it.e.id, poolX + sorted[0].pos - gap * i)) { moved = true; continue; }
      unresolvedFaces.add(key);
      prev = pos;
    }
    return moved;
  }

  // ── passes until nothing moves ─────────────────────────────────────────────
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    unresolvedFaces.clear();
    let moved = false;
    const faces = endsByFace();
    // Activity and Event faces first, pool faces after: a message is moved at its Activity / Event, so spreading there
    // first (symmetrically) usually settles the pool face too.
    const isPoolFace = (k: string) => classOf(faces.get(k)![0].el) === "pool";
    for (const key of [...faces.keys()].sort((a, b) => Number(isPoolFace(a)) - Number(isPoolFace(b)) || (a < b ? -1 : a > b ? 1 : 0))) {
      const ends = faces.get(key)!;
      if (ends.length < 2) continue;
      const cl = classOf(ends[0].el)!;
      moved = (cl === "pool" ? resolvePoolFace(key, ends) : resolveFace(key, ends, cl)) || moved;
    }
    if (!moved) break;
  }

  // Anything still colliding after the last pass is reported, not hidden.
  const unresolved = new Set<string>(unresolvedFaces);
  for (const [key, ends] of endsByFace()) {
    const sorted = ends.map((e) => ({ e, pos: posOf(e) })).sort((a, b) => a.pos - b.pos);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].pos - sorted[i - 1].pos < pairGap(sorted[i - 1].e, sorted[i].e) - EPS) unresolved.add(key);
  }

  return { connectors: connectors.map((c) => work.get(c.id) ?? c), changedIds: [...changed], unresolved: [...unresolved].sort() };
}

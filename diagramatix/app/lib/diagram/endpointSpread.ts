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

/**
 * Rounding slack, px: a spread that lands one gap apart must not read as a collision on the next run, and neither must the
 * sub-pixel drift of later passes that recompute an offset from a world x (generation does: 23.9 px for a 24 px gap).
 */
const EPS = 0.25;
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
/**
 * Where two segments meet, or null. Closed segments, so a line that passes THROUGH a corner of the other route counts —
 * the corner is where one segment of that route ends and the next begins, and a strict "inside both" test saw neither
 * (Paul, 2026-10-05: a loop-back leaving an event's face climbed through the corner of the flow arriving on the same face,
 * a real crossing the allocator could not see, so it put them the wrong way round). Parallel / collinear runs are not a
 * crossing here (the 3 px spread keeps them apart; overlap is what the spread exists to prevent).
 */
function meetAt(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const rx = p2.x - p1.x, ry = p2.y - p1.y, sx = p4.x - p3.x, sy = p4.y - p3.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;                                   // parallel or collinear
  const t = ((p3.x - p1.x) * sy - (p3.y - p1.y) * sx) / den;
  const u = ((p3.x - p1.x) * ry - (p3.y - p1.y) * rx) / den;
  const E = 1e-6;
  if (t < -E || t > 1 + E || u < -E || u > 1 + E) return null;
  return { x: p1.x + t * rx, y: p1.y + t * ry };
}
/** The number of distinct points where two routes cross. A meeting at either route's own two ends (an attachment) is not a crossing. */
function crossingsBetween(a: Point[], b: Point[]): number {
  const ends = [a[0], a[a.length - 1], b[0], b[b.length - 1]];
  const seen = new Set<string>();
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const m = meetAt(a[i - 1], a[i], b[j - 1], b[j]);
    if (!m) continue;
    if (ends.some((e) => Math.abs(e.x - m.x) < 0.75 && Math.abs(e.y - m.y) < 0.75)) continue;
    seen.add(`${Math.round(m.x * 2)}|${Math.round(m.y * 2)}`);
  }
  return seen.size;
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
  opts: {
    /** Free-form / imported layout: messages are not vertical there, so they are left alone. */
    relaxed?: boolean;
    /** Connectors that must NOT move (the editor freezes everything an action did not touch). Their ends still count as occupied. */
    frozen?: ReadonlySet<string>;
  } = {},
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
    // Already there (at both ends, to a quarter of a pixel — offsets are stored rounded, and a pool end can differ from the
    // spine by that rounding): not a change, or a second run over its own output would report it moved.
    if (Math.abs(s.x + offOf(c, "source") * s.width - x) < EPS && Math.abs(t.x + offOf(c, "target") * t.width - x) < EPS) return true;
    work.set(id, { ...c, sourceOffsetAlong: so, targetOffsetAlong: to });
    changed.add(id);
    return true;
  };

  // ── an end: where it sits on its face, and how to move it ──────────────────
  interface End { id: string; role: "source" | "target"; el: DiagramElement; side: Side; isMessage: boolean; movableHere: boolean; frozen: boolean }
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
        const frozen = opts.frozen?.has(id) === true;
        const movableHere = !frozen && (isMessage ? ctrlRole(c) === role && cl !== "pool" : cl !== "pool");
        const key = `${el.id}|${side}`;
        (faces.get(key) ?? faces.set(key, []).get(key)!).push({ id, role, el, side, isMessage, movableHere, frozen });
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
  /** The class of the element a message is MOVED at (its Task / Event), whichever face it is being measured on. */
  const ctrlCls = (id: string): Cls | null => {
    const c = work.get(id)!;
    const e = els.get(ctrlRole(c) === "source" ? c.sourceId : c.targetId);
    return e ? classOf(e) : null;
  };
  /** How far apart two ends on one face must be. On a POOL's face it is what the messages can give: 24 px from Tasks, 3 px from Events. */
  const pairGap = (a: End, b: End): number => {
    const cl = classOf(a.el)!;
    if (cl === "pool") return ctrlCls(a.id) === "event" || ctrlCls(b.id) === "event" ? SPREAD.messageEvent : SPREAD.pool.gap;
    if (a.isMessage || b.isMessage) return cl === "activity" ? SPREAD.messageActivity : SPREAD.messageEvent;
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

  /**
   * KEEP-OUT ZONES (rule R8.42, Paul, 2026-10-05): along a face, the stretches an edge-mounted intermediate event (EMIE)
   * sits on. A MESSAGE never attaches inside one — its line would start under the event. Each zone is the event's extent
   * along the face plus a clearance, in px from the face's start.
   */
  const KEEP_OUT_CLEARANCE = 3;
  const keepOutZones = (host: DiagramElement, side: Side): { lo: number; hi: number }[] => {
    const zones: { lo: number; hi: number }[] = [];
    for (const b of elementList) {
      if (b.boundaryHostId !== host.id) continue;
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const onFace = side === "top" ? Math.abs(cy - host.y) <= b.height
        : side === "bottom" ? Math.abs(cy - (host.y + host.height)) <= b.height
        : side === "left" ? Math.abs(cx - host.x) <= b.width
        : Math.abs(cx - (host.x + host.width)) <= b.width;
      if (!onFace) continue;
      const start = horizontal(side) ? b.x - host.x : b.y - host.y;
      const len = horizontal(side) ? b.width : b.height;
      zones.push({ lo: start - KEEP_OUT_CLEARANCE, hi: start + len + KEEP_OUT_CLEARANCE });
    }
    return zones;
  };

  /** Move every movable message on this face that sits inside a keep-out zone to the nearest legal point. */
  function clearOfEvents(key: string, ends: End[], zones: { lo: number; hi: number }[]): boolean {
    let moved = false;
    const L = faceLength(ends[0].el, ends[0].side);
    const margin = SPREAD.activity.margin;
    // A point placed ON a zone's edge is stored rounded to 4 places of the offset, so allow that much slop (0.05 px) or a
    // second pass would see it "inside" and move it again — generated layouts must be a fixed point of this allocator.
    const inside = (v: number) => zones.some((z) => v > z.lo + 0.05 && v < z.hi - 0.05);
    for (const e of ends) {
      if (!e.isMessage || !e.movableHere) continue;
      const pos = posOf(e);
      if (!inside(pos)) continue;
      const candidates: number[] = [];
      for (const z of zones) candidates.push(z.lo, z.hi);
      const legal = candidates.filter((v) => v >= margin - 1e-6 && v <= L - margin + 1e-6 && !inside(v)).sort((a, b) => Math.abs(a - pos) - Math.abs(b - pos));
      if (!legal.length || !setPos(e, legal[0])) { unresolvedFaces.add(key); continue; }
      moved = true;
    }
    return moved;
  }

  /**
   * Evenly spaced slots, none inside a keep-out zone (R8.42): walk right from the first slot hopping over any zone; if that
   * runs off the face walk left from the last; if neither fits, keep the plain slots (the face is reported unresolved).
   * Without this the spread would put a message back under the event that clearing had just moved it out from.
   */
  function slotsClearOf(plain: number[], step: number, lo: number, hi: number, zones: { lo: number; hi: number }[]): number[] {
    const inZone = (v: number) => zones.find((z) => v > z.lo + 0.05 && v < z.hi - 0.05);
    const right: number[] = [];
    for (let k = 0; k < plain.length; k++) {
      let v = k === 0 ? plain[0] : Math.max(plain[k], right[k - 1] + step);
      for (let guard = 0; guard < 8; guard++) { const z = inZone(v); if (!z) break; v = z.hi; }
      right.push(v);
    }
    if (right[right.length - 1] <= hi + EPS) return right;
    const left: number[] = new Array(plain.length);
    for (let k = plain.length - 1; k >= 0; k--) {
      let v = k === plain.length - 1 ? plain[k] : Math.min(plain[k], left[k + 1] - step);
      for (let guard = 0; guard < 8; guard++) { const z = inZone(v); if (!z) break; v = z.lo; }
      left[k] = v;
    }
    return left[0] >= lo - EPS ? left : plain;
  }

  /** A face on an Activity or an Event: spread the colliding ends. */
  function resolveFace(key: string, ends: End[], cl: "activity" | "event"): boolean {
    const L = faceLength(ends[0].el, ends[0].side);
    const spec = SPREAD[cl];
    // A message never attaches inside an edge-mounted event on this face (R8.42): clear those first, then spread.
    const zones = cl === "activity" ? keepOutZones(ends[0].el, ends[0].side) : [];
    const clearedAny = zones.length ? clearOfEvents(key, ends, zones) : false;
    if (ends.length < 2) return clearedAny;
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
      // On a face with an edge-mounted event a message is doubly held (the zone here, its neighbours at the pool), so a
      // sequence flow in its cluster gives way instead; otherwise the pool pass pulls the message straight back and the
      // two passes never agree (a generated layout must be a fixed point of this allocator).
      const pinMsgs = zones.length > 0 && cluster.some((x) => !x.e.isMessage && x.e.movableHere);
      const isMovable = (x: { e: End }) => x.e.movableHere && !(pinMsgs && x.e.isMessage);
      const movables = cluster.filter(isMovable);
      const fixed = cluster.filter((x) => !isMovable(x));
      if (!movables.length) { if (fixed.some((f) => !f.e.frozen)) unresolvedFaces.add(key); continue; }   // all frozen: left as it was
      const hasMsg = cluster.some((x) => x.e.isMessage);
      const lo = spec.margin, hi = L - spec.margin;
      const minGap = hasMsg ? (cl === "activity" ? SPREAD.messageActivity : SPREAD.messageEvent) : spec.gap;

      if (fixed.length) {
        // Some ends cannot move here (frozen by the editor, or a message whose other end is the one that moves): place the
        // movable ends round EVERY other end on the face — not just the ones in this cluster, or a placement can land on a
        // neighbour just outside it (and which one wins would depend on nothing but the order the ids sort in).
        const placed = sorted.filter((x) => !movables.some((m) => m.e.id === x.e.id)).map((x) => ({ e: x.e, pos: x.pos }));
        const base = zones.length ? 1 : hasMsg ? (cl === "activity" ? SPREAD.messageActivity : SPREAD.messageEvent) : spec.step;   // beside an event the gaps are tight: search by the pixel
        const maxK = zones.length ? Math.ceil(L) : 12;
        for (const m of [...movables].sort((x, y) => otherCoord(x.e) - otherCoord(y.e) || x.e.id.localeCompare(y.e.id))) {
          let done = false;
          // Which way to step off first: the side the connector's OTHER end lies on, relative to the end it is stepping round —
          // else a flow from the left is placed right of a frozen flow from the right and the two cross (Paul, 2026-10-05,
          // MCMO ECOM-57: "Enter Mobile Service# you want to recontract").
          const near = placed.filter((q) => Math.abs(q.pos - m.pos) < pairGap(m.e, q.e)).sort((a, b) => Math.abs(a.pos - m.pos) - Math.abs(b.pos - m.pos))[0];
          const signs = near && otherCoord(m.e) < otherCoord(near.e) ? [-1, 1] : [1, -1];
          for (let k = 0; k <= maxK && !done; k++) {
            for (const sign of k === 0 ? [0] : signs) {
              const px = clamp(m.pos + sign * k * base, lo, hi);
              if (zones.length && !m.e.isMessage && zones.some((z) => px > z.lo + 0.05 && px < z.hi - 0.05)) continue;     // nothing else sits under the event either
              if (placed.every((q) => Math.abs(q.pos - px) >= pairGap(m.e, q.e) - EPS) && setPos(m.e, px)) {
                if (Math.abs(px - m.pos) > 1e-6) moved = true;
                placed.push({ e: m.e, pos: px });
                done = true;
                break;
              }
            }
          }
          if (!done) unresolvedFaces.add(key);
        }
        continue;
      }

      const m = movables.length;
      let step = hasMsg ? minGap : spec.step;
      if ((m - 1) * step > hi - lo) step = (hi - lo) / (m - 1);
      if (step < minGap - EPS) unresolvedFaces.add(key);          // no room for the full gap: spread as far as the face allows
      const mean = movables.reduce((s, x) => s + x.pos, 0) / m;
      const start = clamp(mean - ((m - 1) * step) / 2, lo, hi - (m - 1) * step);
      let slots = Array.from({ length: m }, (_, k) => start + k * step);
      if (zones.length && hasMsg) slots = slotsClearOf(slots, step, lo, hi, zones);
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
    const sorted = ends.map((e) => ({ e, x: spineX(work.get(e.id)!) })).sort((a, b) => a.x - b.x || a.e.id.localeCompare(b.e.id));
    const gaps = sorted.map((it, k) => (k === 0 ? 0 : pairGap(sorted[k - 1].e, it.e)));      // the gap to the one before
    if (!sorted.some((it, i) => i > 0 && it.x - sorted[i - 1].x < gaps[i] - EPS && !(it.e.frozen && sorted[i - 1].e.frozen))) return false;   // nothing (movable) collides
    // Each message can slide only as far as BOTH its ends allow: the Task / Event it leaves (margins), and the pool.
    const range = (id: string) => {
      const c = work.get(id)!;
      if (opts.frozen?.has(id)) { const fx = spineX(c); return { lo: fx, hi: fx }; }     // frozen: it stays where it is
      let lo = -Infinity, hi = Infinity;
      for (const eid of [c.sourceId, c.targetId]) {
        const el = els.get(eid)!, cl = classOf(el);
        const m = Math.min(cl ? SPREAD[cl].margin : 0, el.width / 2);
        lo = Math.max(lo, el.x + m); hi = Math.min(hi, el.x + el.width - m);
      }
      // R8.42: a message must not be pushed INTO an edge-mounted event's keep-out zone on its Task. It stays on the side of
      // the zone it is on, so its neighbours give way instead (else this pass and the keep-out clearing undo each other).
      const role = ctrlRole(c), host = els.get(role === "source" ? c.sourceId : c.targetId)!;
      if (classOf(host) === "activity") {
        const local = spineX(c) - host.x;
        for (const z of keepOutZones(host, role === "source" ? c.sourceSide : c.targetSide)) {
          if (local <= z.lo + 0.05) hi = Math.min(hi, host.x + z.lo);
          else if (local >= z.hi - 0.05) lo = Math.max(lo, host.x + z.hi);
        }
      }
      return { lo, hi };
    };
    const lo = sorted.map((it) => range(it.e.id).lo), hi = sorted.map((it) => range(it.e.id).hi);
    const n = sorted.length;
    // Minimal movement, in order: push right where too close, then pull back left where a bound stops it; repeat.
    const x = sorted.map((it, k) => clamp(it.x, lo[k], hi[k]));
    for (let round = 0; round < 4; round++) {
      for (let k = 1; k < n; k++) x[k] = Math.max(x[k], x[k - 1] + gaps[k]);
      for (let k = n - 1; k >= 0; k--) {
        x[k] = Math.min(x[k], hi[k]);
        if (k > 0) x[k - 1] = Math.min(x[k - 1], x[k] - gaps[k]);
      }
      for (let k = 0; k < n; k++) x[k] = Math.max(x[k], lo[k]);
    }
    let moved = false;
    for (let k = 0; k < n; k++) {
      if (Math.abs(x[k] - sorted[k].x) < 1e-6) continue;
      if (setSpine(sorted[k].e.id, x[k])) moved = true;
    }
    // Feasible only if every gap is held and every message is inside its bounds; otherwise report it, do not hide it.
    const ok = x.every((v, k) => v >= lo[k] - EPS && v <= hi[k] + EPS && (k === 0 || v - x[k - 1] >= gaps[k] - EPS));
    if (!ok) unresolvedFaces.add(key);
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
      const cl = classOf(ends[0].el)!;
      // A lone message can still be under an edge-mounted event (R8.42), so such a face is visited too.
      if (ends.length < 2 && !(cl === "activity" && ends.some((e) => e.isMessage) && keepOutZones(ends[0].el, ends[0].side).length)) continue;
      moved = (cl === "pool" ? resolvePoolFace(key, ends) : resolveFace(key, ends, cl)) || moved;
    }
    if (!moved) break;
  }

  // Anything still colliding after the last pass is reported, not hidden.
  const unresolved = new Set<string>(unresolvedFaces);
  for (const [key, ends] of endsByFace()) {
    const sorted = ends.map((e) => ({ e, pos: posOf(e) })).sort((a, b) => a.pos - b.pos);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].e.frozen && sorted[i - 1].e.frozen) continue;               // legacy, left as it was
      if (sorted[i].pos - sorted[i - 1].pos < pairGap(sorted[i - 1].e, sorted[i].e) - EPS) unresolved.add(key);
    }
  }

  return { connectors: connectors.map((c) => work.get(c.id) ?? c), changedIds: [...changed], unresolved: [...unresolved].sort() };
}

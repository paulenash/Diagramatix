/**
 * Where a message flow's label goes, and how it keeps its place.
 *
 * ── PLACING IT: `placeMessageLabel` is THE rule ──────────────────────────────
 *
 * Paul, 2026-09-25: "The message lable should always be in the air gap between
 * pools and attached closest to the Pool meesage endpoint diagonally to the
 * left or right." And, asked whether that covers generated diagrams: "Always —
 * generated too".
 *
 * It is the only rule. A new message (mouse or voice), a message whose NAME
 * changes (voice rename, the Properties panel, the canvas editor — they all
 * reach UPDATE_CONNECTOR_LABEL), a generated diagram (bpmnLayout, replacing the
 * June R05.05/R05.09 "centred on the line" placement, which it supersedes) and
 * a label that was never placed at all (the load heal) are all placed here.
 *
 * "Attached" means: the label's corner nearest the pool end sits
 * MESSAGE_LABEL_EDGE_GAP (10px) off the pool edge and MESSAGE_LABEL_LINE_GAP
 * (6px) off its own line. Paul's hand-placed labels sat about 17px off the
 * edge; 10 keeps the TEXT clear of an arrowhead or a start circle at that end
 * and still reads as attached (an arrowhead's base can touch the box's empty
 * padding corner by a pixel or two). 6px is the gap the renderer's default
 * already kept from the line. The near corner is fixed, so a longer name grows
 * AWAY from the line, never across it.
 *
 * Left by default (Paul's standing default for message labels); right when the
 * left is taken; then a row further into the gap, while the box stays in the
 * gap and beside the line's own vertical run. When every attached spot is
 * taken, the same rows stepped out along the row (up to 80px, never past
 * another message's line); when nothing is clear at all, the spot that
 * overlaps least. Never outside the pools' shared
 * x-range, and never out of the gap — generation's general label mover leaves
 * message labels alone for that reason.
 *
 * Known limits: the label is sized at the diagram's connector font, but
 * hand-drawn view draws it 1.3× wider, so there a long name can reach its line
 * (the halo keeps it legible); a gap thinner than the label centres it and it
 * spills into both pools; moving pools closer together, or resizing one by
 * hand, can still squeeze a placed label out of the gap — nothing re-places it
 * then. A pool that GROWS to make room (a template, a lane that grows, the pools
 * pushed below it) does re-place it: `followMessageLabel`, below.
 *
 * ── KEEPING IT: preserve / settle, when a pool moves ────────────────────────
 *
 * A messageBPMN label is stored as an offset from the MIDPOINT of the line. Move
 * one end and the midpoint moves, so the label slides somewhere the user never
 * put it — which is what Paul saw after a pool swap (2026-09-18): the connectors
 * re-attached correctly and "the message labels loose their relative positions
 * with respect to their message connector's attachment point".
 *
 * THE RULE (established the hard way — see the memory note "messageBPMN label
 * preservation across pool cross-over", where several other formulas were tried
 * and rejected):
 *
 *     oldOff  = oldLabelCentre − oldAttach     // attach = the MOVING end
 *     normal  : newLabelCentre = newAttach + oldOff
 *     flipped : newLabelCentre = newAttach − oldOff   // mirror in Y
 *
 * Anchoring to the moving end is the whole trick. It makes the offset invariant
 * while the pool and its label travel together, so a flip becomes a sign change
 * and nothing else. Do NOT reintroduce nearest-endpoint tracking: "nearest"
 * switches ends part-way through a move, and by the time it matters the stored
 * offset no longer means what it should.
 *
 * `useDiagram.ts` CASE A2 implements the same rule inline for the black-box pool
 * drag. It predates this module and should be migrated onto it; until then, a
 * change to the rule belongs in both.
 *
 * Both measure the label's height from its WRAPPED lines. They used to count
 * only hard newlines, which the old 50px-into-the-gap placement hid in slack;
 * with the label attached 10px off the edge, a two-line label mirrored by a
 * one-line height landed inside the pool on any flip.
 */
import type { Connector, DiagramData, DiagramElement, Point } from "./types";
import { baseLabelAnchor, connectorLabelBox, type Box } from "./checks/layoutViolations";
import { connectorLabelSize, externalLabelBox } from "./textMetrics";
import { isBlackBoxPool } from "./blackBoxPoolMenu";

export interface LabelOffsets {
  labelOffsetX: number;
  labelOffsetY: number;
}

/** The label's corner nearest the pool end sits this far off the pool edge… */
export const MESSAGE_LABEL_EDGE_GAP = 10;
/** …and its near side this far off its own line. */
export const MESSAGE_LABEL_LINE_GAP = 6;
/** Between one row and the next, further into the gap. */
const ROW_GAP = 2;
/** A line through a label costs this much per pixel, against overlap area. */
const LINE_COST = 10;
/** When every attached spot is taken, how far out along its row a label may step, and by how much at a time. */
const MAX_SLIDE = 80;
const SLIDE_STEP = 10;

export type MessageLabelSide = "left" | "right";

export interface PlacedMessageLabel extends LabelOffsets {
  side: MessageLabelSide;
  /** Where the label is drawn — what `connectorLabelBox` reports once stored. */
  box: Box;
}

const MESSAGE_TYPES = new Set(["messageBPMN", "message"]);
/** Containers a message label may sit over; everything else is in the way. */
const NOT_IN_THE_WAY = new Set(["pool", "lane", "sublane"]);

/** The drawn part of a route — the invisible leaders into the shapes cut off. */
function visiblePoints(c: Connector): Point[] {
  let vis = c.waypoints ?? [];
  if (c.sourceInvisibleLeader && vis.length > 2) vis = vis.slice(1);
  if (c.targetInvisibleLeader && vis.length > 2) vis = vis.slice(0, -1);
  return vis;
}

function poolOf(el: DiagramElement, byId: Map<string, DiagramElement>, elements: DiagramElement[]): DiagramElement | undefined {
  if (el.type === "pool") return el;
  let cur: DiagramElement | undefined = el;
  for (let i = 0; i < 16 && cur?.parentId; i++) {
    cur = byId.get(cur.parentId);
    if (cur?.type === "pool") return cur;
  }
  // An element whose parent link was lost is still drawn inside its pool.
  return elements.find((p) => p.type === "pool"
    && el.x >= p.x && el.x + el.width <= p.x + p.width
    && el.y >= p.y && el.y + el.height <= p.y + p.height);
}

/**
 * The vertical run of the line that reaches the pool edge, collinear pieces
 * merged — the part of the line the label is "attached" beside. Walks from the
 * pool end, so it is the run at THAT end, not whichever run spans the gap: a
 * free-form route jogs part-way across, and a user can drag a segment.
 */
function verticalRunAt(path: Point[], edgeY: number, dir: 1 | -1): { x: number; to: number } | null {
  let i = 0;
  while (i < path.length - 1) {
    const a = path[i], b = path[i + 1];
    if (Math.abs(a.x - b.x) >= 0.5 || Math.abs(a.y - b.y) < 0.5) { i++; continue; }
    let j = i + 1;
    while (j < path.length - 1 && Math.abs(path[j + 1].x - a.x) < 0.5) j++;
    const ys = path.slice(i, j + 1).map((p) => p.y);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    const reachesEdge = edgeY >= top - 0.5 && edgeY <= bottom + 0.5;
    const intoGap = dir === 1 ? bottom > edgeY + 0.5 : top < edgeY - 0.5;
    if (reachesEdge && intoGap) return { x: a.x, to: dir === 1 ? bottom : top };
    i = j;
  }
  return null;
}

/** Where the line crosses the pool edge, when it does not cross it vertically. */
function crossingX(path: Point[], y: number): number | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (Math.abs(a.y - b.y) < 0.5) continue;
    if (y < Math.min(a.y, b.y) - 0.5 || y > Math.max(a.y, b.y) + 0.5) continue;
    return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
  }
  return null;
}

interface AirGap {
  /** The x of the line the label sits beside. */
  lineX: number;
  /** The pool edge the label is attached to. */
  edgeY: number;
  /** +1: the gap lies below that edge; −1: above it. */
  dir: 1 | -1;
  lo: number;
  hi: number;
  /** How far rows after the first may reach: the end of the line's run, inside the gap. */
  rowLimit: number;
  /** The pools' shared x-range. */
  xMin: number;
  xMax: number;
}

/**
 * The air gap a message label belongs in, or null when there is none — no
 * pool at either end, pools side by side or overlapping.
 *
 * The POOL END is the end whose element is a pool (both: the black-box one,
 * else the source). With no pool at either end — a task messaging a task in
 * another pool — the sender's pool (else the receiver's) is the one the line
 * leaves. The gap runs from that pool's edge facing the other end to the first
 * pool edge the line meets beyond it (which may belong to a pool between the
 * two ends), or to the other end itself when it is in no pool.
 */
function messageAirGap(conn: Connector, elements: DiagramElement[]): AirGap | null {
  if (!MESSAGE_TYPES.has(conn.type)) return null;
  const vis = visiblePoints(conn);
  if (vis.length < 2) return null;
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  const src = byId.get(conn.sourceId), tgt = byId.get(conn.targetId);
  if (!src || !tgt) return null;
  let end: "source" | "target";
  if (src.type === "pool" && tgt.type === "pool") end = isBlackBoxPool(tgt) && !isBlackBoxPool(src) ? "target" : "source";
  else if (tgt.type === "pool") end = "target";
  else if (src.type === "pool") end = "source";
  else end = poolOf(src, byId, elements) ? "source" : "target";
  const near = poolOf(end === "source" ? src : tgt, byId, elements);
  if (!near) return null;
  const farPt = end === "source" ? vis[vis.length - 1] : vis[0];
  let dir: 1 | -1;
  if (farPt.y >= near.y + near.height - 0.5) dir = 1;
  else if (farPt.y <= near.y + 0.5) dir = -1;
  else return null;
  const edgeY = dir === 1 ? near.y + near.height : near.y;
  const path = end === "source" ? vis : [...vis].reverse();
  const run = verticalRunAt(path, edgeY, dir);
  const lineX = run ? run.x : (crossingX(path, edgeY) ?? path[0].x);

  let far: number | null = null;
  let farPool: DiagramElement | undefined;
  for (const p of elements) {
    if (p.type !== "pool" || p.id === near.id) continue;
    if (lineX < p.x - 0.5 || lineX > p.x + p.width + 0.5) continue;
    const face = dir === 1 ? p.y : p.y + p.height;
    if (dir === 1 ? face < edgeY - 0.5 : face > edgeY + 0.5) continue;
    if (far === null || (dir === 1 ? face < far : face > far)) { far = face; farPool = p; }
  }
  // No pool beyond: the other end, in no pool, bounds the gap.
  if (far === null) far = farPt.y;
  const lo = Math.min(edgeY, far), hi = Math.max(edgeY, far);
  if (hi - lo < 1) return null;
  // Overlapping pools leave no AIR between them to put the label in.
  const intrudes = elements.some((p) => p.type === "pool" && p.id !== near.id
    && lineX >= p.x - 0.5 && lineX <= p.x + p.width + 0.5
    && p.y < hi - 0.5 && p.y + p.height > lo + 0.5);
  if (intrudes) return null;
  const rowLimit = run ? (dir === 1 ? Math.min(hi, run.to) : Math.max(lo, run.to)) : (dir === 1 ? hi : lo);
  return {
    lineX, edgeY, dir, lo, hi, rowLimit,
    xMin: farPool ? Math.max(near.x, farPool.x) : near.x,
    xMax: farPool ? Math.min(near.x + near.width, farPool.x + farPool.width) : near.x + near.width,
  };
}

const overlapArea = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** How much of segment a→b runs through the INSIDE of r (a line along its edge does not). */
function lengthInside(a: Point, b: Point, r: Box): number {
  const EPS = 0.01;
  const x0 = r.x + EPS, x1 = r.x + r.w - EPS, y0 = r.y + EPS, y1 = r.y + r.h - EPS;
  if (x1 <= x0 || y1 <= y0) return 0;
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (clip(-dx, a.x - x0) && clip(dx, x1 - a.x) && clip(-dy, a.y - y0) && clip(dy, y1 - a.y) && t1 > t0) {
    return (t1 - t0) * Math.hypot(dx, dy);
  }
  return 0;
}

/**
 * What a placed label must keep clear of, as a cost (0 = clear): every other
 * connector's label, every drawn line — its own included, for a route that
 * turns across the gap — and every element except the pools and lanes it sits
 * between, with the external names of events, gateways and data.
 */
function obstacleCost(conn: Connector, elements: DiagramElement[], connectors: Connector[], fontSize: number): (b: Box) => number {
  const boxes: Box[] = [];
  const segments: [Point, Point][] = [];
  const addSegments = (c: Connector) => {
    const v = visiblePoints(c);
    for (let i = 1; i < v.length; i++) segments.push([v[i - 1], v[i]]);
  };
  for (const o of connectors) {
    if (o.id === conn.id) continue;
    const lb = connectorLabelBox(o, elements, fontSize);
    if (lb) boxes.push(lb);
    addSegments(o);
  }
  addSegments(conn);
  for (const e of elements) {
    if (NOT_IN_THE_WAY.has(e.type)) continue;
    boxes.push({ x: e.x, y: e.y, w: e.width, h: e.height });
    const ext = externalLabelBox(e);
    if (ext) boxes.push(ext);
  }
  return (b) => {
    let cost = 0;
    for (const o of boxes) cost += overlapArea(b, o);
    for (const [p, q] of segments) cost += lengthInside(p, q, b) * LINE_COST;
    return cost;
  };
}

/**
 * THE placement rule for a message flow's label (see the header): where it
 * goes, as the offsets to store, or null when there is nothing to place — no
 * label, not a message, or no air gap (pools side by side or overlapping). A
 * caller given null keeps the position it has.
 *
 * `connectors` is the rest of the diagram (the message itself, if in it, is
 * skipped). `prefer` is the side tried first — the side the label is drawn on
 * now, for a rename, so a label the user sees on the right stays there when it
 * can. `fontSize` is the diagram's connector font (`connectorFontSize`).
 */
export function placeMessageLabel(
  conn: Connector,
  elements: DiagramElement[],
  connectors: Connector[],
  opts: { prefer?: MessageLabelSide; fontSize?: number } = {},
): PlacedMessageLabel | null {
  const label = conn.label ?? "";
  if (!label.trim()) return null;
  const gap = messageAirGap(conn, elements);
  if (!gap) return null;
  const anchor = baseLabelAnchor(conn);
  if (!anchor) return null;
  const fontSize = opts.fontSize ?? 10;
  const { w, h } = connectorLabelSize(label, fontSize);
  const prefer = opts.prefer ?? "left";
  const sides: MessageLabelSide[] = prefer === "left" ? ["left", "right"] : ["right", "left"];

  const tops: number[] = [];
  if (gap.hi - gap.lo < MESSAGE_LABEL_EDGE_GAP + h) {
    // Too thin to attach: centred, one row — and spilling into both pools when
    // the gap is thinner than the label itself.
    tops.push((gap.lo + gap.hi) / 2 - h / 2);
  } else {
    for (let r = 0; ; r++) {
      const top = gap.dir === 1
        ? gap.edgeY + MESSAGE_LABEL_EDGE_GAP + r * (h + ROW_GAP)
        : gap.edgeY - MESSAGE_LABEL_EDGE_GAP - h - r * (h + ROW_GAP);
      const inGap = top >= gap.lo - 0.01 && top + h <= gap.hi + 0.01;
      const besideRun = r === 0 || (gap.dir === 1 ? top + h <= gap.rowLimit + 0.01 : top >= gap.rowLimit - 0.01);
      if (!inGap || !besideRun) break;
      tops.push(top);
    }
  }
  const xOf = (side: MessageLabelSide, slide = 0) =>
    side === "left" ? gap.lineX - MESSAGE_LABEL_LINE_GAP - slide - w : gap.lineX + MESSAGE_LABEL_LINE_GAP + slide;
  const at = (slide: number) => tops.flatMap((y) => sides.map((side) => ({ side, box: { x: xOf(side, slide), y, w, h } })))
    .filter((c) => c.box.x >= gap.xMin - 0.5 && c.box.x + w <= gap.xMax + 0.5);
  let attached = at(0);
  if (attached.length === 0) {
    // Neither side fits between the pools' ends: stay in the gap and inside
    // the pools' reach, even across the line.
    const x = Math.max(gap.xMin, Math.min(gap.xMax - w, xOf(prefer)));
    attached = [{ side: prefer, box: { x, y: tops[0], w, h } }];
  }
  // Every attached spot taken — in a generated diagram, typically by an
  // event's long name hanging into the gap beside the line: the same rows,
  // stepped out along the row, still in the gap and still to the left or right
  // of the pool end. Only then the least overlap, over all of them.
  //
  // A step out may not pass another message's line. Past it, the label sits
  // beside THAT message and reads as its name, which is not "attached closest
  // to the Pool meesage endpoint": its own line must stay the nearest message
  // line within its rows. When every step out passes one, the least overlap
  // over the attached spots decides.
  const otherLines: [Point, Point][] = [];
  for (const o of connectors) {
    if (o.id === conn.id || !MESSAGE_TYPES.has(o.type)) continue;
    const v = visiblePoints(o);
    for (let i = 1; i < v.length; i++) otherLines.push([v[i - 1], v[i]]);
  }
  const passesAnotherLine = ({ side, box }: { side: MessageLabelSide; box: Box }): boolean => {
    const x0 = side === "left" ? box.x : gap.lineX;
    const x1 = side === "left" ? gap.lineX : box.x + box.w;
    const between: Box = { x: x0, y: box.y, w: x1 - x0, h: box.h };
    return otherLines.some(([p, q]) => lengthInside(p, q, between) > 0);
  };
  const slid: typeof attached = [];
  for (let s = SLIDE_STEP; s <= MAX_SLIDE; s += SLIDE_STEP) slid.push(...at(s).filter((c) => !passesAnotherLine(c)));

  const cost = obstacleCost(conn, elements, connectors, fontSize);
  let best = attached[0];
  let bestCost = Infinity;
  for (const c of [...attached, ...slid]) {
    const k = cost(c.box);
    if (k === 0) { best = c; break; }
    if (k < bestCost) { best = c; bestCost = k; }
  }
  return {
    side: best.side,
    box: best.box,
    labelOffsetX: best.box.x + w / 2 - anchor.x,
    labelOffsetY: best.box.y - anchor.y,
  };
}

/** Is the drawn box between the gap's two pool edges? */
function inAirGap(box: Box, gap: AirGap): boolean {
  return box.y >= gap.lo - 0.5 && box.y + box.h <= gap.hi + 0.5;
}

/**
 * A message label when the geometry round it changes — a pool grows or is
 * pushed, an end is re-routed — and nothing has asked for it by name.
 *
 * Paul's rule above says where the label BELONGS: "in the air gap between pools
 * and attached closest to the Pool meesage endpoint". Growth breaks it in two
 * ways, both seen on 2026-09-26: a pool that grows by more than the 10px the
 * label sits off its edge swallows the label, and the old shift code kept a
 * label with whichever end it took for the "black-box end" (an absent poolType
 * counted as black-box), so between two white-box pools it moved half the
 * growth and drifted off its end.
 *
 * So the label keeps its place against the SAME pool end the placement rule
 * uses (`messageAirGap`): it moves exactly as far as that end's edge crossing
 * moved. Only when that leaves the drawn box out of the gap it was in is it
 * placed again, by `placeMessageLabel`, on the side it was drawn on. One never
 * placed (no stored offsets) is left to the load heal.
 *
 * A message with no air gap before or after the change (pools side by side, or
 * overlapping as a template's own pools do where they are dropped, before they
 * are stacked) has no pool end to keep: its label keeps the offsets it already
 * has, i.e. its place on its line — rigidly translated with the line, or where
 * the re-route put it. Measured against its old ABSOLUTE box instead, it stayed
 * behind: 23 labels of the templates that bring their own pools lay over
 * Company up to 966px from their lines, and a side-by-side message's label was
 * left 164px above its line (review of 6a, 2026-09-26).
 *
 * `before` / `beforeElements` are the message and the diagram before the change,
 * `after` / `afterElements` / `afterConnectors` after it. Null when nothing
 * changes.
 */
export function followMessageLabel(
  before: Connector,
  beforeElements: DiagramElement[],
  after: Connector,
  afterElements: DiagramElement[],
  afterConnectors: Connector[],
  fontSize = 10,
): LabelOffsets | null {
  if (!MESSAGE_TYPES.has(after.type) || !(after.label ?? "").trim()) return null;
  if (before.labelOffsetX == null && before.labelOffsetY == null) return null;
  const oldBox = connectorLabelBox(before, beforeElements, fontSize);
  const anchor = baseLabelAnchor(after);
  if (!oldBox || !anchor) return null;
  const oldGap = messageAirGap(before, beforeElements);
  const newGap = messageAirGap(after, afterElements);
  if (!oldGap || !newGap || oldGap.dir !== newGap.dir) return null;
  const box: Box = { ...oldBox, x: oldBox.x + (newGap.lineX - oldGap.lineX), y: oldBox.y + (newGap.edgeY - oldGap.edgeY) };
  let offsets: LabelOffsets = { labelOffsetX: box.x + box.w / 2 - anchor.x, labelOffsetY: box.y - anchor.y };
  if (inAirGap(oldBox, oldGap) && !inAirGap(box, newGap)) {
    const prefer = messageLabelSide(before, beforeElements, fontSize);
    const placed = placeMessageLabel({ ...after, ...offsets }, afterElements, afterConnectors, { prefer, fontSize });
    if (placed) offsets = { labelOffsetX: placed.labelOffsetX, labelOffsetY: placed.labelOffsetY };
  }
  const same = (a: number | undefined, b: number) => a != null && Math.abs(a - b) < 0.01;
  return same(after.labelOffsetX, offsets.labelOffsetX) && same(after.labelOffsetY, offsets.labelOffsetY) ? null : offsets;
}

/**
 * The side of its line a message label is drawn on now, or undefined when it
 * straddles the line or there is no gap to judge by. A rename keeps it.
 */
export function messageLabelSide(conn: Connector, elements: DiagramElement[], fontSize = 10): MessageLabelSide | undefined {
  const gap = messageAirGap(conn, elements);
  const box = connectorLabelBox(conn, elements, fontSize);
  if (!gap || !box) return undefined;
  const cx = box.x + box.w / 2;
  if (cx < gap.lineX - 1) return "left";
  if (cx > gap.lineX + 1) return "right";
  return undefined;
}

/**
 * Place the chosen message labels one after another, each keeping clear of
 * those already placed. A label still waiting its turn is not yet anywhere, so
 * nothing dodges the spot it would default to. Returns the same array when
 * nothing moved.
 */
export function placeMessageLabels(
  connectors: Connector[],
  elements: DiagramElement[],
  which: (c: Connector) => boolean,
  fontSize = 10,
): Connector[] {
  const pending = new Set(connectors
    .filter((c) => MESSAGE_TYPES.has(c.type) && (c.label ?? "").trim() && which(c))
    .map((c) => c.id));
  if (pending.size === 0) return connectors;
  const out = connectors.slice();
  let changed = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (!pending.has(c.id)) continue;
    pending.delete(c.id);
    const seen = out.map((o) => (pending.has(o.id) ? { ...o, label: "" } : o));
    const p = placeMessageLabel(c, elements, seen, { fontSize });
    if (!p) continue;
    out[i] = { ...c, labelOffsetX: p.labelOffsetX, labelOffsetY: p.labelOffsetY };
    changed = true;
  }
  return changed ? out : connectors;
}

/**
 * Load heal: a labelled message that has never been placed — no stored offset
 * at all — is placed by the rule when the diagram opens. That is what a label
 * whose position a rename erased (Paul's "Request", saved 2026-09-25) looks
 * like, and what a message imported without positions looks like. A label the
 * user or the rule has ever placed is left exactly where it is.
 */
export function healMessageLabels(d: DiagramData): DiagramData {
  const connectors = placeMessageLabels(
    d.connectors, d.elements,
    (c) => c.labelOffsetX == null && c.labelOffsetY == null,
    d.connectorFontSize ?? 10,
  );
  return connectors === d.connectors ? d : { ...d, connectors };
}

/** The indices of the two attachment waypoints, allowing for invisible leaders. */
function endIndices(conn: Connector): [number, number] {
  const src = conn.sourceInvisibleLeader ? 1 : 0;
  const tgt = conn.targetInvisibleLeader ? conn.waypoints.length - 2 : conn.waypoints.length - 1;
  return [src, tgt];
}

/**
 * New label offsets after one end of a message flow has moved, or null when
 * there is nothing to preserve (no label, or not enough waypoints to measure).
 *
 * `movedEnd` says which end belongs to the thing that moved — the pool.
 */
export function preserveMessageLabel(
  conn: Connector,
  before: Connector,
  movedEnd: "source" | "target",
): LabelOffsets | null {
  if (!conn.label) return null;
  if (before.waypoints.length < 2 || conn.waypoints.length < 2) return null;
  if (before.labelOffsetX == null && before.labelOffsetY == null) return null;

  const [bs, bt] = endIndices(before);
  const [ns, nt] = endIndices(conn);
  const oldSrc = before.waypoints[bs];
  const oldTgt = before.waypoints[bt];
  const newSrc = conn.waypoints[ns];
  const newTgt = conn.waypoints[nt];
  if (!oldSrc || !oldTgt || !newSrc || !newTgt) return null;

  // The DRAWN height — wrapped lines, the renderer's own measure.
  const halfLabelH = connectorLabelSize(conn.label).h / 2;

  const oldMidX = (oldSrc.x + oldTgt.x) / 2;
  const oldMidY = (oldSrc.y + oldTgt.y) / 2;
  const oldLabelCentreX = oldMidX + (before.labelOffsetX ?? 0);
  const oldLabelCentreY = oldMidY + (before.labelOffsetY ?? 0) + halfLabelH;

  const oldAttach = movedEnd === "source" ? oldSrc : oldTgt;
  const newAttach = movedEnd === "source" ? newSrc : newTgt;
  const oldOffsetX = oldLabelCentreX - oldAttach.x;
  const oldOffsetY = oldLabelCentreY - oldAttach.y;

  // A flip is the moving end changing which side of the other end it sits on.
  const wasBelow = oldAttach.y > (movedEnd === "source" ? oldTgt.y : oldSrc.y);
  const isBelow = newAttach.y > (movedEnd === "source" ? newTgt.y : newSrc.y);
  const flipped = wasBelow !== isBelow;

  const newMidX = (newSrc.x + newTgt.x) / 2;
  const newMidY = (newSrc.y + newTgt.y) / 2;
  const newLabelCentreX = newAttach.x + oldOffsetX;
  const newLabelCentreY = flipped ? newAttach.y - oldOffsetY : newAttach.y + oldOffsetY;

  return {
    labelOffsetX: newLabelCentreX - newMidX,
    labelOffsetY: (newLabelCentreY - halfLabelH) - newMidY,
  };
}

/**
 * Settle every message label ONCE, at the end of a gesture, against the state
 * the gesture started from.
 *
 * This is the answer to Paul's 2026-09-19 question — "can you devise a way so
 * that these labels on moved pools are more reliably placed and in the case of
 * the Pool returned to its starting position are back where they used to be?".
 *
 * `preserveMessageLabel` above is correct for ONE move, and a one-step drag
 * round-tripped exactly. A real drag is one reducer action per mouse sample,
 * and applying the rule at every sample is what broke it: the crossing from one
 * side of the partner to the other lands on whichever sample it lands on, and
 * while the pool overlaps its partner the attachment can sit on the old face
 * while the geometry already says otherwise. A seven-step drag there and back
 * left the label 213px from where it started, below the returned pool; a
 * thirty-step drag left it somewhere else again.
 *
 * Settling once removes the whole class of problem. The result is a function of
 * where the pool STARTED and where it ENDED UP — nothing in between — so it
 * cannot depend on the mouse, and dragging back reverses the same function and
 * restores the offsets exactly.
 *
 * `movedIds` is the set of elements the gesture actually moved, worked out by
 * comparing positions rather than trusting a travelling list, so an element
 * that came along for the ride is counted too.
 */
export function settleMessageLabels(
  connectors: Connector[],
  beforeConnectors: Connector[],
  movedIds: Set<string>,
  /**
   * Which of the moved things are POOLS. A label travels with a pool and with
   * nothing else — see below.
   */
  movedPoolIds: Set<string> = movedIds,
): Connector[] {
  if (movedIds.size === 0) return connectors;
  const before = new Map(beforeConnectors.map((c) => [c.id, c]));
  let changed = false;
  const out = connectors.map((conn) => {
    if (conn.type !== "messageBPMN" && conn.type !== "message") return conn;
    const prev = before.get(conn.id);
    if (!prev) return conn;                       // created during the gesture
    const srcMoved = movedIds.has(conn.sourceId);
    const tgtMoved = movedIds.has(conn.targetId);
    if (!srcMoved && !tgtMoved) return conn;
    // A LABEL TRAVELS WITH A POOL, AND WITH NOTHING ELSE.
    //
    // Paul, 2026-09-24: "Moving a Task up or down, in a white-box pool, that
    // has messages attached to it causes the message labels to move up or
    // down. In either of these circumstances the message labels should not
    // move at all."
    //
    // The rule below anchors the label to the end that MOVED, which is right
    // when the whole participant moves — the pool, its lane, its contents and
    // the label all travel together, and the label keeps its place on the
    // pool. It is wrong when a task inside the pool moves: the pool has not
    // gone anywhere, the label is placed against the pool, and following the
    // task drags it off the position the modeller chose.
    //
    // So the anchor is a moved POOL if there is one, and otherwise the label
    // holds its world position.
    const srcPool = movedPoolIds.has(conn.sourceId);
    const tgtPool = movedPoolIds.has(conn.targetId);
    const offsets = srcPool || tgtPool
      ? preserveMessageLabel(conn, prev, srcPool ? "source" : "target")
      : holdMessageLabel(conn, prev);
    if (!offsets) return conn;
    if (offsets.labelOffsetX === conn.labelOffsetX && offsets.labelOffsetY === conn.labelOffsetY) return conn;
    changed = true;
    return { ...conn, ...offsets };
  });
  return changed ? out : connectors;
}

/**
 * Keep a label exactly where it is on the canvas while the line under it
 * changes — the offset is re-expressed against the new midpoint so the world
 * position is unchanged.
 *
 * This is what a message label does when something OTHER than its pool moves
 * (Paul, 2026-09-24): a task sliding up or down inside its lane redraws the
 * message, and the words naming it stay put.
 */
export function holdMessageLabel(conn: Connector, before: Connector): LabelOffsets | null {
  if (!conn.label) return null;
  if (before.waypoints.length < 2 || conn.waypoints.length < 2) return null;
  const [bs, bt] = endIndices(before);
  const [ns, nt] = endIndices(conn);
  const oldSrc = before.waypoints[bs], oldTgt = before.waypoints[bt];
  const newSrc = conn.waypoints[ns], newTgt = conn.waypoints[nt];
  if (!oldSrc || !oldTgt || !newSrc || !newTgt) return null;
  const oldMidX = (oldSrc.x + oldTgt.x) / 2;
  const oldMidY = (oldSrc.y + oldTgt.y) / 2;
  const newMidX = (newSrc.x + newTgt.x) / 2;
  const newMidY = (newSrc.y + newTgt.y) / 2;
  return {
    labelOffsetX: (oldMidX + (before.labelOffsetX ?? 0)) - newMidX,
    labelOffsetY: (oldMidY + (before.labelOffsetY ?? 0)) - newMidY,
  };
}

/** Which elements a gesture actually moved, by comparing before and after. */
export function movedElementIds(
  before: { id: string; x: number; y: number }[],
  after: { id: string; x: number; y: number }[],
): Set<string> {
  const was = new Map(before.map((e) => [e.id, e]));
  const ids = new Set<string>();
  for (const e of after) {
    const b = was.get(e.id);
    if (!b) continue;
    if (Math.abs(b.x - e.x) > 0.01 || Math.abs(b.y - e.y) > 0.01) ids.add(e.id);
  }
  return ids;
}

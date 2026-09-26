/**
 * A lane's height, changed at its BOTTOM edge — the geometry of "expand lane
 * X" and "compress lane X", and of every path that grows a lane to fit
 * something (a template dropped in, a long name).
 *
 * Paul, 2026-09-26: "Add commands Compress Lane <lane_name>, and, Expand Lane
 * <lane_name>" — and, asked what should move, THE BOTTOM EDGE MOVES:
 *
 *   • COMPRESS — the top stays. The content slides up to ½ Task under the
 *     top, the bottom comes up to ½ Task under the lowest content, never below
 *     what the name needs (the lane's, and the pool's own). The lanes below
 *     close up, the pool shrinks, the pools below stay put. A lane with
 *     sub-lanes is fitted one sub-lane at a time. A second compress changes
 *     nothing.
 *   • EXPAND — one Task row (64 px) or "by N" at the bottom. The last sub-lane
 *     takes it, the lanes below move down, and the pools below are pushed by
 *     the 100-px rule (the caller's `settleGrowth`).
 *
 * GEOMETRY ONLY, as `growLaneToHeight` always was: connectors, free notes and
 * the pools below are the caller's one `settleGrowth` afterwards.
 *
 * Both shapes of a sub-lane count everywhere (laneKind.ts): a lane nested in a
 * lane, and one stamped `type: "sublane"` by the AI converter or an import.
 *
 * Pure.
 */
import type { Connector, DiagramElement } from "./types";
import type { StackEdge } from "./laneBands";
import { isAnyLane } from "./laneKind";
import { refitStackAtEdge } from "./laneStack";
import { laneMetrics, minHeightForContainer, poolMetrics } from "./containerMetrics";
import { getAllDescendantIds, isLaneUnowned } from "./containment";
import { HALF_TASK_H } from "./assistPlacement";

/** The font sizes the name floors are measured at — the diagram's own. */
export interface LaneFonts { poolFs: number; laneFs: number }
/** What the reducer falls back to when a diagram sets none (`poolFontSize ?? 16`, `laneFontSize ?? 14`). */
export const DEFAULT_LANE_FONTS: LaneFonts = { poolFs: 16, laneFs: 14 };

/** "Expand lane X" with no number: one Task row (a Task is 64 tall). */
export const LANE_EXPAND_STEP = 2 * HALF_TASK_H;

const EPS = 0.01;

/** A band's own lanes, top to bottom, in both shapes. */
export function childBands(els: readonly DiagramElement[], id: string | undefined): DiagramElement[] {
  if (!id) return [];
  return els.filter((e) => isAnyLane(e) && e.parentId === id).sort((a, b) => a.y - b.y);
}

const centreIn = (e: DiagramElement, b: DiagramElement) => {
  const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
  return cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height;
};

/** A free note: a text annotation or review comment nobody owns (containment.ts). */
const isFreeNote = (e: DiagramElement) => isLaneUnowned(e) && !e.parentId;

/**
 * EVERYTHING IN A BAND — what moves with it: its descendants, and the free
 * notes lying in it. A note is deliberately unowned (adopted into a lane it
 * would travel with the lane for good), so without the second half a note
 * beside a task stays behind when the task's band moves.
 */
export function bandContentIds(els: DiagramElement[], bandId: string): Set<string> {
  const ids = getAllDescendantIds(els, bandId);
  const band = els.find((e) => e.id === bandId);
  if (band) for (const e of els) if (isFreeNote(e) && centreIn(e, band)) ids.add(e.id);
  return ids;
}

/**
 * Set a lane's height, the change taken at its BOTTOM edge.
 *
 * `growLaneToHeight`'s body, without its grow-only early return: the lanes
 * after it (and everything in them) move by the change, each ancestor lane and
 * the pool change by it too, and each ancestor's later lanes move. Its own
 * contents stay where they are.
 *
 * AND ITS OWN STACK STILL FILLS IT. One sub-lane takes the change and every
 * other divider stays put (laneBands.ts, Paul 2026-09-21: "Only the boundary
 * should move"). Which one is `edge`:
 *   • "last" (the default) — the bottom edge moved: expand, compress, a long
 *     name. Growing a lane without this left its sub-lanes short of its
 *     bottom: renaming a lane with sub-lanes to a long name left a strip no
 *     sub-lane covered.
 *   • "first" — the room is for the TOP of the band (`growLaneAtTop`, whose
 *     caller then moves the band's content down by the same amount). With
 *     "last" there, the last sub-lane grew AND was carried down, into the
 *     lane below.
 *
 * A shrink past the edge sub-lane's own floor leaves the stack taller than the
 * lane (absorbAtEdge floors the band); `fitLaneToContent` never asks for one,
 * because it fits the sub-lanes themselves.
 *
 * Returns the same array when the height is already `height`.
 */
export function setBandHeightAtBottom(
  base: DiagramElement[],
  laneId: string,
  height: number,
  opts: { fonts?: LaneFonts; edge?: StackEdge } = {},
): DiagramElement[] {
  const { fonts = DEFAULT_LANE_FONTS, edge = "last" } = opts;
  const lane = base.find((e) => e.id === laneId && isAnyLane(e));
  if (!lane) return base;
  const delta = height - lane.height;
  if (Math.abs(delta) < EPS) return base;
  let elements = base;

  // The lanes after this one — and everything in them — move by the change.
  const siblings = childBands(elements, lane.parentId);
  const idx = siblings.findIndex((s) => s.id === laneId);
  const moveIds = new Set<string>();
  for (const sib of siblings.slice(idx + 1)) {
    moveIds.add(sib.id);
    for (const d of getAllDescendantIds(elements, sib.id)) moveIds.add(d);
  }
  elements = elements.map((e) => {
    if (e.id === lane.id) return { ...e, height };
    if (moveIds.has(e.id)) return { ...e, y: e.y + delta };
    return e;
  });

  // Up the tree: each ancestor lane and the pool change by the same amount,
  // and each ancestor's later lanes move so none is overlapped or left apart.
  let cur = elements.find((e) => e.id === lane.parentId);
  for (let hops = 0; cur && hops < 16; hops++) {
    if (cur.type === "pool" || isAnyLane(cur)) {
      const changedId = cur.id;
      const shiftIds = new Set<string>();
      if (cur.parentId) {
        const ancestorSibs = childBands(elements, cur.parentId);
        const ai = ancestorSibs.findIndex((s) => s.id === changedId);
        for (const sib of ancestorSibs.slice(ai + 1)) {
          shiftIds.add(sib.id);
          for (const d of getAllDescendantIds(elements, sib.id)) shiftIds.add(d);
        }
      }
      elements = elements.map((e) => {
        if (e.id === changedId) return { ...e, height: e.height + delta };
        if (shiftIds.has(e.id)) return { ...e, y: e.y + delta };
        return e;
      });
    }
    const parentId: string | undefined = cur.parentId;
    cur = parentId ? elements.find((e) => e.id === parentId) : undefined;
  }

  if (childBands(elements, laneId).length) {
    elements = refitStackAtEdge(elements, laneId, lane.y, height, lane.x, lane.width, edge, fonts.poolFs, fonts.laneFs);
  }
  return elements;
}

/** The pool a band is in (walking up), or undefined for a band in no pool. */
function poolOfBand(els: readonly DiagramElement[], band: DiagramElement): DiagramElement | undefined {
  let cur: DiagramElement | undefined = band;
  for (let hops = 0; cur && hops < 16; hops++) {
    if (cur.type === "pool") return cur;
    const parentId: string | undefined = cur.parentId;
    cur = parentId ? els.find((e) => e.id === parentId) : undefined;
  }
  return undefined;
}

/** The least a container's OWN NAME needs — the lanes inside it are theirs to answer for. */
function nameFloor(e: DiagramElement, fonts: LaneFonts): number {
  return e.type === "pool"
    ? poolMetrics(e.label ?? "", fonts.poolFs).minHeight
    : laneMetrics(e.label ?? "", fonts.laneFs).minHeight;
}

/** The band at the bottom of a lane's stack, however deep — the one that takes a change at the bottom edge. */
function lastLeaf(els: readonly DiagramElement[], id: string): DiagramElement | undefined {
  let cur = els.find((e) => e.id === id);
  for (let hops = 0; cur && hops < 16; hops++) {
    const kids = childBands(els, cur.id);
    if (!kids.length) return cur;
    cur = kids[kids.length - 1];
  }
  return cur;
}

/** Grow the bottom band of `id`'s stack by `by` — `id` and every ancestor grow with it. */
function growAtBottomEdge(els: DiagramElement[], id: string, by: number, fonts: LaneFonts): DiagramElement[] {
  const leaf = lastLeaf(els, id);
  return leaf ? setBandHeightAtBottom(els, leaf.id, leaf.height + by, { fonts }) : els;
}

/**
 * A drawn route — how far its waypoints reach above and below its SOURCE. When
 * both its ends are in one band they slide together, the caller's
 * `settleGrowth` translates the route exactly (connectorsFollow), and it stays
 * this far from its source wherever the fit moves it.
 */
interface RouteReach { sourceId: string; targetId: string; above: number; below: number }

function routeReaches(els: readonly DiagramElement[], connectors: readonly Connector[]): RouteReach[] {
  const out: RouteReach[] = [];
  for (const c of connectors) {
    const src = els.find((e) => e.id === c.sourceId);
    if (!src || !c.waypoints?.length) continue;
    const ys = c.waypoints.map((p) => p.y);
    out.push({ sourceId: c.sourceId, targetId: c.targetId, above: Math.min(...ys) - src.y, below: Math.max(...ys) - src.y });
  }
  return out;
}

interface FitCtx { fonts: LaneFonts; heightWas: ReadonlyMap<string, number>; routes: readonly RouteReach[] }

/**
 * One band with no sub-lanes: its content slides UP to ½ Task under its top
 * (never down — content already closer stays), and its bottom comes up to ½
 * Task under the lowest content. Never below what its name needs, never taller
 * than it was. An empty band fits its name.
 *
 * ITS CONTENT IS ITS SHAPES AND THE ROUTES BETWEEN THEM. A rework loop dragged
 * under the row belongs to the band as much as the two tasks it joins: fitted
 * to the shapes alone, the band's bottom came up through the loop and left it
 * lying in the lane below.
 */
function fitLeaf(els: DiagramElement[], id: string, ctx: FitCtx): DiagramElement[] {
  const band = els.find((e) => e.id === id)!;
  const inside = getAllDescendantIds(els, id);
  const tops: number[] = [], bottoms: number[] = [];
  for (const e of els) if (inside.has(e.id)) { tops.push(e.y); bottoms.push(e.y + e.height); }
  for (const r of ctx.routes) {
    if (!inside.has(r.sourceId) || !inside.has(r.targetId)) continue;
    const src = els.find((e) => e.id === r.sourceId)!;
    tops.push(src.y + r.above);
    bottoms.push(src.y + r.below);
  }
  const floor = minHeightForContainer(band, els, ctx.fonts.poolFs, ctx.fonts.laneFs);
  let slide = 0;
  let want = floor;
  if (tops.length) {
    slide = Math.max(0, Math.min(...tops) - (band.y + HALF_TASK_H));
    want = Math.max(floor, Math.max(...bottoms) - slide + HALF_TASK_H - band.y);
  }
  let out = els;
  if (slide > EPS) out = out.map((e) => (inside.has(e.id) ? { ...e, y: e.y - slide } : e));
  return setBandHeightAtBottom(out, id, Math.min(band.height, want), { fonts: ctx.fonts });
}

/**
 * Fit a band: a leaf directly; a band with sub-lanes one sub-lane at a time,
 * top to bottom, each read AFTER the ones above it have closed up. Then its own
 * name: if the fitted sub-lanes leave it shorter than that, its bottom band
 * keeps the extra — never more than it had.
 */
function fitBand(els: DiagramElement[], id: string, ctx: FitCtx): DiagramElement[] {
  const subs = childBands(els, id).map((s) => s.id);
  if (!subs.length) return fitLeaf(els, id, ctx);
  let out = els;
  for (const s of subs) out = fitBand(out, s, ctx);
  const band = out.find((e) => e.id === id)!;
  const want = Math.min(nameFloor(band, ctx.fonts), ctx.heightWas.get(id) ?? band.height);
  return band.height < want - EPS ? growAtBottomEdge(out, id, want - band.height, ctx.fonts) : out;
}

/**
 * What rides in a band without being its child, LENT to the innermost band its
 * centre lies in for the length of the fit — so it slides with the content
 * beside it, moves with the lanes below, and counts as that band's content,
 * exactly as a child would. Handed back afterwards (`handBack`).
 *
 *   • A FREE NOTE of the pool. The band it lies in decides, not the element it
 *     is associated to (`unownedNotesFollow`'s first choice): a fit asks what
 *     each band SHOWS, and a note is part of what the band it sits in shows. A
 *     note lying in its partner's band — the usual case — goes the same way
 *     under either rule.
 *   • A STEP PARENTED TO A LANE THAT HAS SUB-LANES, lying in one of them. The
 *     membership pass re-homes it when the sub-lanes are nested lanes, not
 *     when they are stamped `type: "sublane"`; fitted as nobody's content it
 *     was left behind, clipped, and then re-homed into the lane below.
 *
 * An event on a boundary follows its host, never a band.
 */
function lendToBands(els: DiagramElement[], pool: DiagramElement): { elements: DiagramElement[]; lent: Map<string, string | undefined> } {
  const inPool = getAllDescendantIds(els, pool.id);
  const bands = els
    .filter((e) => e.id === pool.id || (isAnyLane(e) && inPool.has(e.id)))
    .sort((a, b) => a.width * a.height - b.width * b.height);
  const hasSubLanes = new Set(bands.filter((b) => isAnyLane(b) && childBands(els, b.id).length).map((b) => b.id));
  const lent = new Map<string, string | undefined>();
  const elements = els.map((e) => {
    const free = isFreeNote(e);
    const stranded = !free && !isAnyLane(e) && !e.boundaryHostId && !!e.parentId && hasSubLanes.has(e.parentId);
    if (!free && !stranded) return e;
    const band = bands.find((b) => centreIn(e, b));
    if (!band || band.id === e.parentId) return e;
    lent.set(e.id, e.parentId);
    return { ...e, parentId: band.id };
  });
  return { elements, lent };
}

function handBack(els: DiagramElement[], lent: ReadonlyMap<string, string | undefined>): DiagramElement[] {
  if (!lent.size) return els;
  return els.map((e) => {
    if (!lent.has(e.id)) return e;
    const owner = lent.get(e.id);
    if (owner) return { ...e, parentId: owner };
    const { parentId: _lentBand, ...note } = e;
    return note as DiagramElement;
  });
}

/**
 * COMPRESS A LANE TO ITS CONTENT (Paul's ruling, 2026-09-26: the bottom edge
 * moves). See the module comment for the rule; the floors, in full:
 *   • each band: what its own name needs (a leaf: `minHeightForContainer`);
 *   • every container above it — its parent lane, the POOL: what their own
 *     names need. The prototype of this left a single-lane pool 128 px tall
 *     under a 280 px name; the lane's bottom band keeps what they need;
 *   • and never taller than it was.
 *
 * `connectors` are read, never changed: a route with both ends in one band is
 * part of that band's content (`fitLeaf`).
 *
 * Returns the same array when the lane is already fitted, so the caller can say
 * so rather than report a change that did not happen.
 */
export function fitLaneToContent(
  base: DiagramElement[],
  laneId: string,
  opts: { fonts?: LaneFonts; connectors?: readonly Connector[] } = {},
): DiagramElement[] {
  const { fonts = DEFAULT_LANE_FONTS, connectors = [] } = opts;
  const lane = base.find((e) => e.id === laneId && isAnyLane(e));
  if (!lane) return base;
  const ctx: FitCtx = {
    fonts,
    heightWas: new Map(base.map((e) => [e.id, e.height] as const)),
    routes: routeReaches(base, connectors),
  };
  const pool = poolOfBand(base, lane);
  const { elements: withLent, lent } = pool ? lendToBands(base, pool) : { elements: base, lent: new Map<string, string | undefined>() };

  let els = fitBand(withLent, laneId, ctx);

  // The containers above: none below what its own name needs. What they need
  // comes back to the lane's bottom band, up to the height the lane had.
  const now = els.find((e) => e.id === laneId)!;
  let need = 0;
  let cur = els.find((e) => e.id === now.parentId);
  for (let hops = 0; cur && hops < 16; hops++) {
    const floor = Math.min(nameFloor(cur, fonts), ctx.heightWas.get(cur.id) ?? cur.height);
    need = Math.max(need, floor - cur.height);
    const parentId: string | undefined = cur.parentId;
    cur = parentId ? els.find((e) => e.id === parentId) : undefined;
  }
  const give = Math.min(need, lane.height - now.height);
  if (give > EPS) els = growAtBottomEdge(els, laneId, give, fonts);

  els = handBack(els, lent);
  const moved = els.some((e, i) => {
    const b = base[i];
    return Math.abs(e.x - b.x) > EPS || Math.abs(e.y - b.y) > EPS
      || Math.abs(e.width - b.width) > EPS || Math.abs(e.height - b.height) > EPS;
  });
  return moved ? els : base;
}

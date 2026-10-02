/**
 * "Add a task called X" with an expanded subprocess (EP) selected or under the cursor — Paul, 2026-10-02:
 *
 *   When an EP is highlighted or is the hover target, "add {task | subprocess | gateway | event} called X"
 *   adds the element INSIDE it. The first one is surrounded by a Start and an End event, joined by
 *   sequence connectors. After that, the next addition goes to the right of the last element before the
 *   End — or after the selected / hovered element inside the EP. Each time, the EP is widened to take it
 *   and everything to its right in the lane moves right; if the pool is not wide enough it is extended.
 *   Just the lane (his ruling, 2026-10-02): flows from other lanes are not touched.
 *
 * This file decides WHERE things go and WHAT to join; `applyAssistOps` carries it out with the editor's own
 * actions. Room is the mouse's Insert Space, scoped to the lane the EP is in — it widens the EP (a container
 * cut by the marker line), the lane and the pool, and moves what is right of the marker in that lane.
 *
 * Collapsed subprocesses only for the new element ("subprocess"); a nested EP is left for later.
 *
 * Pure.
 */
import type { Connector, DiagramElement } from "./types";
import { EP_WRAP } from "./subprocessWrap";
import { SEQUENCE_NODE_TYPES } from "./templates";

/** The gap between neighbours inside an EP — the one a wrap leaves around its Start and End. */
export const EP_GAP = 30;

/** What an "add" may put inside an EP. (A start or end event would break the Start → … → End shape.) */
export const EP_ADDABLE = new Set<string>(["task", "subprocess", "gateway", "intermediate-event"]);

export interface Size { w: number; h: number }
export interface Centre { x: number; y: number }

export interface EpPlan {
  /** Room to make first — everything in `scopeId` right of `markerX` moves right `dx` (the EP and its lane and pool widen). */
  shift?: { markerX: number; dx: number; scopeId: string };
  /** The elements to add, in order. `role` names them in `joins`. */
  add: Array<{ role: "start" | "new" | "end"; symbol: "start-event" | "end-event" | "new"; centre: Centre }>;
  /** Sequence flows to draw, each end an existing element id or a role of something added. */
  joins: Array<{ from: string; to: string }>;
  /** Flows to remove first (the one being spliced into). */
  remove: string[];
  /** The sentence for the log. */
  summary: string;
}

export type EpResult = { error: string } | EpPlan;

const cx = (e: { x: number; width: number }) => e.x + e.width / 2;
const cy = (e: { y: number; height: number }) => e.y + e.height / 2;
const right = (e: { x: number; width: number }) => e.x + e.width;
const nameOf = (e: DiagramElement) => (e.label ?? "").replace(/\s+/g, " ").trim() || String(e.type).replace(/-/g, " ");

/** The nearest lane / sub-lane / pool above the EP — the scope of the room-making. */
export function bandAbove(ep: DiagramElement, els: readonly DiagramElement[]): DiagramElement | undefined {
  let cur = els.find((e) => e.id === ep.parentId);
  for (let i = 0; cur && i < 16; i++) {
    if (cur.type === "lane" || cur.type === "sublane" || cur.type === "pool") return cur;
    cur = els.find((e) => e.id === cur!.parentId);
  }
  return undefined;
}

/**
 * Which EP, and which element inside it, an "add" means — or null when the add is an ordinary one.
 *
 * The same order "this" uses: the selection first (one element), then what is under the cursor.
 *   an EP                       → into it
 *   an element INSIDE an EP     → into that EP, after that element
 * Anything else — a task in a lane, a pool, nothing — is an ordinary add, exactly as before.
 */
export function epTarget(
  els: readonly DiagramElement[],
  selectedIds: readonly string[],
  underPointer: DiagramElement | null,
): { ep: DiagramElement; anchor: DiagramElement | null } | null {
  const sel = selectedIds.length === 1 ? els.find((e) => e.id === selectedIds[0]) : undefined;
  const t = sel ?? (selectedIds.length === 0 ? underPointer ?? undefined : undefined);
  if (!t) return null;
  if (t.type === "subprocess-expanded") return { ep: t, anchor: null };
  if (t.boundaryHostId) return null;
  const parent = t.parentId ? els.find((e) => e.id === t.parentId) : undefined;
  if (parent?.type === "subprocess-expanded" && SEQUENCE_NODE_TYPES.has(t.type)) return { ep: parent, anchor: t };
  return null;
}

export function planAddInsideEp(
  els: readonly DiagramElement[],
  connectors: readonly Connector[],
  ep: DiagramElement,
  anchor: DiagramElement | null,
  size: Size,
  eventSize: number = EP_WRAP.EVENT,
): EpResult {
  const band = bandAbove(ep, els);
  if (!band) return { error: `${nameOf(ep)} is not in a pool or lane, so there is nowhere to make room` };
  const kids = els.filter((e) => e.parentId === ep.id && !e.boundaryHostId && SEQUENCE_NODE_TYPES.has(e.type));
  const kidIds = new Set(kids.map((k) => k.id));
  const start = kids.find((k) => k.type === "start-event");
  const end = kids.find((k) => k.type === "end-event");
  const flows = connectors.filter((c) => c.type === "sequence" && kidIds.has(c.sourceId) && kidIds.has(c.targetId));

  // ── An empty EP: Start → new → End ──────────────────────────────────────
  if (kids.length === 0) {
    const need = EP_WRAP.EVENT_INSET + eventSize + EP_GAP + size.w + EP_GAP + eventSize + EP_WRAP.EVENT_INSET;
    const dx = Math.max(0, Math.ceil(need - ep.width));
    const top = ep.y + EP_WRAP.PAD_TOP, bottom = ep.y + ep.height - EP_WRAP.PAD_BOTTOM;
    const rowY = (top + bottom) / 2;
    const sx = ep.x + EP_WRAP.EVENT_INSET + eventSize / 2;
    const nx = ep.x + EP_WRAP.EVENT_INSET + eventSize + EP_GAP + size.w / 2;
    const ex = nx + size.w / 2 + EP_GAP + eventSize / 2;
    return {
      ...(dx > 0 ? { shift: { markerX: ep.x + ep.width - 2, dx, scopeId: band.id } } : {}),
      add: [
        { role: "start", symbol: "start-event", centre: { x: sx, y: rowY } },
        { role: "new", symbol: "new", centre: { x: nx, y: rowY } },
        { role: "end", symbol: "end-event", centre: { x: ex, y: rowY } },
      ],
      joins: [{ from: "start", to: "new" }, { from: "new", to: "end" }],
      remove: [],
      summary: `added it inside ${nameOf(ep)}, between a new Start and End${dx > 0 ? ` — widened ${nameOf(ep)} ${dx}px and moved what is right of it in ${nameOf(band)} across` : ""}`,
    };
  }

  // ── Which step it follows, and which (if any) it goes in front of ───────
  const into = (id: string) => flows.filter((c) => c.targetId === id);
  const out = (id: string) => flows.filter((c) => c.sourceId === id);
  const rightmost = (xs: DiagramElement[]) => xs.sort((a, b) => right(b) - right(a))[0];
  const lastBeforeEnd = (): DiagramElement | undefined => {
    if (end) {
      const feeders = into(end.id).map((c) => kids.find((k) => k.id === c.sourceId)).filter((k): k is DiagramElement => !!k);
      if (feeders.length) return rightmost(feeders);
    }
    return rightmost(kids.filter((k) => k.type !== "end-event")) ;
  };

  let prev: DiagramElement | undefined;
  let next: DiagramElement | undefined;
  let spliced: Connector | undefined;
  if (anchor && anchor.type !== "end-event") {
    prev = anchor;
    const outs = out(anchor.id);
    if (outs.length > 1) return { error: `${nameOf(anchor)} has ${outs.length} flows out — say which one to go on, or select the step before the End` };
    spliced = outs[0];
    next = spliced ? kids.find((k) => k.id === spliced!.targetId) : undefined;
  } else {
    prev = lastBeforeEnd();
    next = end;
    if (prev && end) spliced = flows.find((c) => c.sourceId === prev!.id && c.targetId === end.id);
  }
  if (!prev) return { error: `there is nothing in ${nameOf(ep)} to follow` };

  const rowY = cy(prev);
  const nx = right(prev) + EP_GAP + size.w / 2;
  const slotRight = nx + size.w / 2;
  // Room: the next step (or, with none, the EP's own right edge) must stay clear of it.
  const needRightOf = slotRight + EP_GAP;
  const dx = next
    ? Math.max(0, Math.ceil(needRightOf - next.x))
    : Math.max(0, Math.ceil(slotRight + EP_WRAP.EVENT_INSET - right(ep)));
  const joins = [{ from: prev.id, to: "new" }, ...(next ? [{ from: "new", to: next.id }] : [])];
  return {
    ...(dx > 0 ? { shift: { markerX: right(prev), dx, scopeId: band.id } } : {}),
    add: [{ role: "new", symbol: "new", centre: { x: nx, y: rowY } }],
    joins,
    remove: spliced ? [spliced.id] : [],
    summary: `added it inside ${nameOf(ep)} after ${nameOf(prev)}${next ? ` and before ${nameOf(next)}` : ""}${dx > 0 ? ` — widened ${nameOf(ep)} ${dx}px and moved what is right of it in ${nameOf(band)} across` : ""}`,
  };
}

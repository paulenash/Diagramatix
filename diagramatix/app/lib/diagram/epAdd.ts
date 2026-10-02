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
 * A subprocess — collapsed or EXPANDED — can be the new element: an EP inside an EP (Paul, 2026-10-02: "I should be able to
 * add an EP inside another EP"). The new element may be TALLER than the EP's row, so the room is made both ways: sideways
 * as above, and DOWN — the EP grows taller and everything below it moves down (the mouse's Insert Space, vertical).
 *
 * An EVENT EP is the special case (`planAddEventEp`, below): an event subprocess is not part of the flow, so it is built
 * under the existing flow, with its own Start, Task and End.
 *
 * Pure.
 */
import type { Connector, DiagramElement } from "./types";
import { EP_WRAP } from "./subprocessWrap";
import { SEQUENCE_NODE_TYPES } from "./templates";
import { getAllDescendantIds } from "./containment";

/** The gap between neighbours inside an EP — the one a wrap leaves around its Start and End. */
export const EP_GAP = 30;

/** What an "add" may put inside an EP. (A start or end event would break the Start → … → End shape.) */
export const EP_ADDABLE = new Set<string>(["task", "subprocess", "subprocess-expanded", "gateway", "intermediate-event"]);

/**
 * The name a new subprocess gets when none is said: "Subprocess <n>" (Paul, 2026-10-02: "the default name is Subprocess <n>, as
 * usual"). n is one more than the subprocesses already there, collapsed and expanded together, stepped up past any name that
 * is taken. (The mouse's drop still names an expanded one "Expanded <n>"; the voice follows what Paul said.)
 */
export function nextSubprocessName(els: readonly DiagramElement[]): string {
  let n = els.filter((e) => e.type === "subprocess" || e.type === "subprocess-expanded").length + 1;
  const taken = new Set(els.map((e) => (e.label ?? "").trim()));
  while (taken.has(`Subprocess ${n}`)) n++;
  return `Subprocess ${n}`;
}

/** An expanded subprocess whose Usage is Event: it hangs under the flow of the EP it is in, not in it. */
export const isEventEp = (e: DiagramElement): boolean =>
  e.type === "subprocess-expanded" && (e.properties as { subprocessType?: string } | undefined)?.subprocessType === "event";

export interface Size { w: number; h: number }
export interface Centre { x: number; y: number }

export interface EpPlan {
  /** Room to make first — everything in `scopeId` right of `markerX` moves right `dx` (the EP and its lane and pool widen). */
  shift?: { markerX: number; dx: number; scopeId: string };
  /** Room DOWN, made first: the EP grows `dy` taller and EVERYTHING below it moves down (Insert Space, whole diagram). */
  grow?: { markerY: number; dy: number };
  /** The elements to add, in order. `role` names them in `joins`. */
  add: Array<{ role: "start" | "new" | "end"; symbol: "start-event" | "end-event" | "new"; centre: Centre }>;
  /** Sequence flows to draw, each end an existing element id or a ROLE of something added. A role is written
   *  "@start", "@new" or "@end" — never a bare word, because a real element id can be "start" or "end" (Paul's test
   *  diagram has both, and the first version of this confused the new Start with his "Claim Received"). */
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
  // The FLOW: not an event subprocess (those hang under the flow — see planAddEventEp).
  const kids = els.filter((e) => e.parentId === ep.id && !e.boundaryHostId && SEQUENCE_NODE_TYPES.has(e.type) && !isEventEp(e));
  const kidIds = new Set(kids.map((k) => k.id));
  const start = kids.find((k) => k.type === "start-event");
  const end = kids.find((k) => k.type === "end-event");
  const flows = connectors.filter((c) => c.type === "sequence" && kidIds.has(c.sourceId) && kidIds.has(c.targetId));

  // ── An empty EP: Start → new → End ──────────────────────────────────────
  if (kids.length === 0) {
    const need = EP_WRAP.EVENT_INSET + eventSize + EP_GAP + size.w + EP_GAP + eventSize + EP_WRAP.EVENT_INSET;
    const dx = Math.max(0, Math.ceil(need - ep.width));
    // Tall enough for the new element (an EP inside an EP is taller than a task): else grow DOWN, everything below moving.
    const needH = EP_WRAP.PAD_TOP + Math.max(size.h, eventSize) + EP_WRAP.PAD_BOTTOM;
    const dy = Math.max(0, Math.ceil(needH - ep.height));
    const top = ep.y + EP_WRAP.PAD_TOP, bottom = ep.y + Math.max(ep.height, needH) - EP_WRAP.PAD_BOTTOM;
    const rowY = (top + bottom) / 2;
    const sx = ep.x + EP_WRAP.EVENT_INSET + eventSize / 2;
    const nx = ep.x + EP_WRAP.EVENT_INSET + eventSize + EP_GAP + size.w / 2;
    const ex = nx + size.w / 2 + EP_GAP + eventSize / 2;
    return {
      ...(dx > 0 ? { shift: { markerX: ep.x + ep.width - 2, dx, scopeId: band.id } } : {}),
      ...(dy > 0 ? { grow: { markerY: ep.y + ep.height - 2, dy } } : {}),
      add: [
        { role: "start", symbol: "start-event", centre: { x: sx, y: rowY } },
        { role: "new", symbol: "new", centre: { x: nx, y: rowY } },
        { role: "end", symbol: "end-event", centre: { x: ex, y: rowY } },
      ],
      joins: [{ from: "@start", to: "@new" }, { from: "@new", to: "@end" }],
      remove: [],
      summary: `added it inside ${nameOf(ep)}, between a new Start and End${dx > 0 ? ` — widened ${nameOf(ep)} ${dx}px and moved what is right of it in ${nameOf(band)} across` : ""}${dy > 0 ? ` — made ${nameOf(ep)} ${dy}px taller and moved everything below it down` : ""}`,
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

  // The new element sits on the row of the step before it — but never above the label band, and the EP grows DOWN to
  // hold it if it is taller than the room it has.
  const rowY = Math.max(cy(prev), ep.y + EP_WRAP.PAD_TOP + size.h / 2);
  const dy = Math.max(0, Math.ceil(rowY + size.h / 2 + EP_WRAP.PAD_BOTTOM - (ep.y + ep.height)));
  const nx = right(prev) + EP_GAP + size.w / 2;
  const slotRight = nx + size.w / 2;
  // Room: the next step (or, with none, the EP's own right edge) must stay clear of it.
  const needRightOf = slotRight + EP_GAP;
  const dx = next
    ? Math.max(0, Math.ceil(needRightOf - next.x))
    : Math.max(0, Math.ceil(slotRight + EP_WRAP.EVENT_INSET - right(ep)));
  const joins = [{ from: prev.id, to: "@new" }, ...(next ? [{ from: "@new", to: next.id }] : [])];
  return {
    ...(dx > 0 ? { shift: { markerX: right(prev), dx, scopeId: band.id } } : {}),
    ...(dy > 0 ? { grow: { markerY: ep.y + ep.height - 2, dy } } : {}),
    add: [{ role: "new", symbol: "new", centre: { x: nx, y: rowY } }],
    joins,
    remove: spliced ? [spliced.id] : [],
    summary: `added it inside ${nameOf(ep)} after ${nameOf(prev)}${next ? ` and before ${nameOf(next)}` : ""}${dx > 0 ? ` — widened ${nameOf(ep)} ${dx}px and moved what is right of it in ${nameOf(band)} across` : ""}${dy > 0 ? ` — made ${nameOf(ep)} ${dy}px taller and moved everything below it down` : ""}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// An EVENT expanded subprocess inside an expanded subprocess — Paul, 2026-10-02:
//
//   "A common scenario is adding an Event Expanded Subprocess to an Expanded Subprocess that already has a Start Event
//   to End Event flow. The height of the parent EP must increase, the existing flow move to the top of the parent EP and
//   the new EP appear as an Event EP with its own Start Event, Task and End Event, placed in the middle of the EP under
//   the existing flow. The Start Event has Trigger Message and Interruption → Interrupting. A further EP goes
//   underneath any existing Event EPs, the same construction. The parent EP will in general need to grow in height and
//   width: everything below it is pushed down and everything to the right of it pushed right, including pool and lane
//   boundaries and any pool below the white-box pool the EP is in."
//
// "Pushed right / down" is the mouse's Insert Space for the WHOLE diagram (not scoped to the lane, as an ordinary add is):
// the EP, its lane and its pool are cut by the marker line and grow, the other pools are cut and grow with them (they
// stay one width), and everything beyond the line moves.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EventEpPlan {
  /** Make the parent wider first: Insert Space across the whole diagram at `markerX`. */
  growX?: { markerX: number; dx: number };
  /** Make the parent taller: Insert Space down the whole diagram at `markerY`. */
  growY?: { markerY: number; dy: number };
  /** The existing flow, moved UP to the top of the parent (these ids, by `dy` upward). */
  moveUp?: { ids: string[]; dy: number };
  /** The new Event EP, and what goes inside it: a Start (Message, interrupting), a Task and an End. */
  ep: { centre: Centre; width: number; height: number };
  start: Centre;
  task: Centre;
  end: Centre;
  summary: string;
}

export function planAddEventEp(
  els: readonly DiagramElement[],
  parent: DiagramElement,
  taskSize: Size,
  eventSize: number = EP_WRAP.EVENT,
): { error: string } | EventEpPlan {
  const M = EP_WRAP.EVENT_INSET;
  const kids = els.filter((e) => e.parentId === parent.id);
  const eventEps = kids.filter(isEventEp);
  const eventEpIds = new Set(eventEps.map((e) => e.id));
  // The existing FLOW: everything directly in the parent that is not an event subprocess (nor mounted on one).
  const flowKids = kids.filter((k) => !isEventEp(k) && !(k.boundaryHostId && eventEpIds.has(k.boundaryHostId)));

  const flowTop = flowKids.length ? Math.min(...flowKids.map((k) => k.y)) : 0;
  const flowBottom = flowKids.length ? Math.max(...flowKids.map((k) => k.y + k.height)) : 0;
  // The flow goes to the TOP of the parent (just under its label band). It only ever moves up.
  const moveUpDy = flowKids.length ? Math.max(0, Math.floor(flowTop - (parent.y + EP_WRAP.PAD_TOP))) : 0;
  const flowBottomAfter = flowBottom - moveUpDy;

  // The new Event EP goes UNDER whatever is already there: the flow, or the lowest Event EP.
  const stackBottom = Math.max(flowKids.length ? flowBottomAfter : -Infinity, ...eventEps.map((e) => e.y + e.height));
  const yNew = Number.isFinite(stackBottom) ? stackBottom + EP_GAP : parent.y + EP_WRAP.PAD_TOP;

  const rowH = Math.max(taskSize.h, eventSize);
  const width = M + eventSize + EP_GAP + taskSize.w + EP_GAP + eventSize + M;
  const height = EP_WRAP.PAD_TOP + rowH + EP_WRAP.PAD_BOTTOM;

  // The parent must hold it with a margin each side, and reach below it.
  const needW = width + 2 * M;
  const dx = Math.max(0, Math.ceil(needW - parent.width));
  const finalW = parent.width + dx;
  const dy = Math.max(0, Math.ceil(yNew + height + EP_WRAP.PAD_BOTTOM - (parent.y + parent.height)));

  const xNew = parent.x + (finalW - width) / 2;                   // in the MIDDLE of the parent
  const rowY = yNew + EP_WRAP.PAD_TOP + rowH / 2;
  const startX = xNew + M + eventSize / 2;
  const taskX = xNew + M + eventSize + EP_GAP + taskSize.w / 2;
  const endX = taskX + taskSize.w / 2 + EP_GAP + eventSize / 2;

  const moveIds = new Set<string>();
  if (moveUpDy > 0) for (const k of flowKids) { moveIds.add(k.id); for (const d of getAllDescendantIds(els as DiagramElement[], k.id)) moveIds.add(d); }

  const said = [
    moveUpDy > 0 ? `moved the existing flow up` : "",
    dx > 0 ? `widened ${nameOf(parent)} ${dx}px (pushing what is to the right across, pool and lane edges with it)` : "",
    dy > 0 ? `made ${nameOf(parent)} ${dy}px taller (pushing everything below it down)` : "",
  ].filter(Boolean).join(", ");
  return {
    ...(dx > 0 ? { growX: { markerX: parent.x + parent.width - 2, dx } } : {}),
    ...(dy > 0 ? { growY: { markerY: parent.y + parent.height - 2, dy } } : {}),
    ...(moveUpDy > 0 ? { moveUp: { ids: [...moveIds], dy: moveUpDy } } : {}),
    ep: { centre: { x: xNew + width / 2, y: yNew + height / 2 }, width, height },
    start: { x: startX, y: rowY },
    task: { x: taskX, y: rowY },
    end: { x: endX, y: rowY },
    summary: `as an Event subprocess in the middle of ${nameOf(parent)}, ${eventEps.length ? "under the existing Event subprocesses" : flowKids.length ? "under the existing flow" : "at the top"}, with its own Start (Message, interrupting), Task and End${said ? ` — ${said}` : ""}`,
  };
}

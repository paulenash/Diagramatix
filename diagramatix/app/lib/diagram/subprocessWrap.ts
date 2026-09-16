/**
 * Surround a selection with an expanded subprocess — and dissolve one back
 * into the flow. Paul, 2026-09-16:
 *
 *   "Surround selected with an Expanded Subprocess called X" — make horizontal
 *   room in the lane (or pool) the selection sits in without touching the
 *   neighbouring lanes (the pool only grows to the right), put an EP around
 *   the selected elements exactly as they were, keep their internal flows,
 *   re-point the ONE incoming and the ONE outgoing flow of the group at the
 *   EP, and give the EP a Start event before the entry element and an End
 *   event after the exit element, on short straight connectors. Legal only
 *   with exactly one flow in and one flow out.
 *
 *   "Delete selected" on an EP is the reverse: the shell and its Start/End go,
 *   the contents stay and are spliced back into the flow, and the room the
 *   shell used is given back. Wrap → unwrap restores every x exactly, without
 *   undo, and not necessarily straight after one another.
 *
 * Both are pure whole-state transforms: the reducer applies them, the editor
 * runs them first for the guard message (or the summary), and the tests assert
 * the geometry directly.
 */
import type { Connector, DiagramElement, Side } from "./types";
import { recomputeAllConnectors } from "./routing";

export const EP_WRAP = {
  /** Room to the left of the wrapped group: inset + a 36 px Start + a 30 px gap. */
  PAD_LEFT: 90,
  /** Room to the right: a 30 px gap + a 36 px End + inset. */
  PAD_RIGHT: 90,
  /** Above the group — the EP's own label lives here. */
  PAD_TOP: 36,
  PAD_BOTTOM: 24,
  /** The Start / End sit this far inside the EP's left / right edge. */
  EVENT_INSET: 24,
  EVENT: 36,
} as const;

export interface WrapIds { epId: string; startId: string; endId: string; startConnId: string; endConnId: string }
export interface Shape { elements: DiagramElement[]; connectors: Connector[] }
export type WrapPlan = { error: string } | (Shape & { summary: string; contentRight: number });

const SWIMLANE = new Set<string>(["pool", "lane", "sublane"]);
const CONTAINER = new Set<string>(["pool", "lane", "sublane", "subprocess-expanded"]);
const ARTIFACT = new Set<string>(["text-annotation", "review-comment", "data-object", "data-store"]);

const cx = (e: DiagramElement) => e.x + e.width / 2;
const cy = (e: DiagramElement) => e.y + e.height / 2;
const nameOf = (e: DiagramElement) => e.label?.trim() || e.type;

/** `roots` plus everything under them: descendants by parentId and the boundary events mounted on any of them. */
function closure(elements: DiagramElement[], roots: Iterable<string>): Set<string> {
  const ids = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of elements) {
      if (ids.has(e.id)) continue;
      if ((e.parentId && ids.has(e.parentId)) || (e.boundaryHostId && ids.has(e.boundaryHostId))) { ids.add(e.id); grew = true; }
    }
  }
  return ids;
}

function bbox(els: DiagramElement[]) {
  const x = Math.min(...els.map((e) => e.x)), y = Math.min(...els.map((e) => e.y));
  const right = Math.max(...els.map((e) => e.x + e.width)), bottom = Math.max(...els.map((e) => e.y + e.height));
  return { x, y, right, bottom, width: right - x, height: bottom - y };
}

/**
 * Connectors after a shift: one whose two ends moved together keeps its shape
 * (waypoints translated); every other one — an end moved on its own, or an end
 * was re-pointed (`force`) — is routed afresh.
 */
function settle(shape: Shape, dxOf: (id: string) => number, force: Set<string>): Shape {
  const needs = new Set<string>(force);
  const connectors = shape.connectors.map((c) => {
    if (needs.has(c.id)) return c;
    const a = dxOf(c.sourceId), b = dxOf(c.targetId);
    if (a === b) return a ? { ...c, waypoints: c.waypoints.map((p) => ({ ...p, x: p.x + a })) } : c;
    needs.add(c.id);
    return c;
  });
  const routed = new Map(recomputeAllConnectors(connectors.filter((c) => needs.has(c.id)), shape.elements).map((c) => [c.id, c] as const));
  return { elements: shape.elements, connectors: connectors.map((c) => routed.get(c.id) ?? c) };
}

const flow = (id: string, sourceId: string, targetId: string): Connector => ({
  id, sourceId, targetId, sourceSide: "right", targetSide: "left",
  type: "sequence", directionType: "directed", routingType: "rectilinear",
  sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
  sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
});

export function planWrapInSubprocess(shape: Shape, selectedIds: readonly string[], label: string, ids: WrapIds): WrapPlan {
  const byId = new Map(shape.elements.map((e) => [e.id, e] as const));
  const picked = selectedIds.map((id) => byId.get(id)).filter((e): e is DiagramElement => !!e);
  if (picked.some((e) => CONTAINER.has(e.type))) return { error: "the selection can't include a pool, lane or subprocess — select the tasks, gateways and events to surround" };
  const members = picked.filter((e) => !ARTIFACT.has(e.type) && !e.boundaryHostId);
  if (members.length === 0) return { error: "select the elements to surround first" };
  const homeId = members[0].parentId;
  if (members.some((e) => e.parentId !== homeId)) return { error: "the selected elements must all sit in the one lane or pool" };
  const home = homeId ? byId.get(homeId) : undefined;

  // The group is the members plus their boundary events; exactly one sequence
  // flow may enter it and exactly one may leave it.
  const group = closure(shape.elements, members.map((e) => e.id));
  const seq = shape.connectors.filter((c) => c.type === "sequence");
  const incoming = seq.filter((c) => group.has(c.targetId) && !group.has(c.sourceId));
  const outgoing = seq.filter((c) => group.has(c.sourceId) && !group.has(c.targetId));
  if (incoming.length !== 1 || outgoing.length !== 1) {
    return { error: `the selection needs exactly one flow in and one flow out — it has ${incoming.length} in and ${outgoing.length} out` };
  }
  const entry = byId.get(incoming[0].targetId)!;
  const exit = byId.get(outgoing[0].sourceId)!;
  if (exit.boundaryHostId) return { error: "the flow out must leave from a task or gateway, not from a boundary event" };

  const groupEls = [...group].map((id) => byId.get(id)!);
  const box = bbox(groupEls);
  const { PAD_LEFT: L, PAD_RIGHT: R, EVENT_INSET, EVENT } = EP_WRAP;
  // Vertical padding fits the lane: a tight lane gets a tighter EP, never one poking out of its band.
  const inLane = !!home && SWIMLANE.has(home.type);
  const padTop = inLane ? Math.max(8, Math.min(EP_WRAP.PAD_TOP, box.y - home!.y - 4)) : EP_WRAP.PAD_TOP;
  const padBottom = inLane ? Math.max(8, Math.min(EP_WRAP.PAD_BOTTOM, home!.y + home!.height - box.bottom - 4)) : EP_WRAP.PAD_BOTTOM;
  const ep: DiagramElement = {
    id: ids.epId, type: "subprocess-expanded", label,
    x: box.x, y: box.y - padTop, width: box.width + L + R, height: box.height + padTop + padBottom,
    properties: {}, ...(homeId ? { parentId: homeId } : {}),
  };

  // Room: the group moves right by the Start's share; every sibling in the
  // same lane from the group's left edge rightward moves by the whole width
  // the shell adds. A sibling that would end up INSIDE the EP is a mistake
  // the user has to fix first — it is never adopted silently.
  const isHome = (e: DiagramElement) => (homeId ? e.parentId === homeId : !e.parentId);
  const siblings = shape.elements.filter((e) => !group.has(e.id) && isHome(e) && !SWIMLANE.has(e.type) && !e.boundaryHostId && cx(e) >= box.x);
  const trapped = siblings.find((e) => cx(e) < box.right && cy(e) >= ep.y && cy(e) <= ep.y + ep.height);
  if (trapped) return { error: `${nameOf(trapped)} sits in that area but isn't selected — select it too, or move it first` };
  const shifted = closure(shape.elements, siblings.map((e) => e.id));
  const dxOf = (id: string) => (group.has(id) ? L : shifted.has(id) ? L + R : 0);

  // The Start faces the entry element and the End faces the exit element, each
  // on the element's centre line, so the two new flows are straight and short.
  const start: DiagramElement = { id: ids.startId, type: "start-event", label: "", x: ep.x + EVENT_INSET, y: cy(entry) - EVENT / 2, width: EVENT, height: EVENT, properties: {}, parentId: ep.id };
  const end: DiagramElement = { id: ids.endId, type: "end-event", label: "", x: ep.x + ep.width - EVENT_INSET - EVENT, y: cy(exit) - EVENT / 2, width: EVENT, height: EVENT, properties: {}, parentId: ep.id };
  const elements: DiagramElement[] = [];
  let placed = false;
  for (const e of shape.elements) {
    if (group.has(e.id) && !placed) { elements.push(ep, start, end); placed = true; } // drawn beneath its children
    const dx = dxOf(e.id);
    const moved = dx ? { ...e, x: e.x + dx } : e;
    elements.push(group.has(e.id) ? { ...moved, parentId: ep.id } : moved);
  }

  const reroute = new Set<string>([incoming[0].id, outgoing[0].id, ids.startConnId, ids.endConnId]);
  const connectors0 = shape.connectors.map((c) => {
    if (c.id === incoming[0].id) return { ...c, targetId: ep.id, targetSide: "left" as Side, targetOffsetAlong: 0.5, targetPinned: false, pathShaped: false };
    if (c.id === outgoing[0].id) return { ...c, sourceId: ep.id, sourceSide: "right" as Side, sourceOffsetAlong: 0.5, sourcePinned: false, pathShaped: false };
    return c;
  });
  connectors0.push(flow(ids.startConnId, start.id, entry.id), flow(ids.endConnId, exit.id, end.id));
  const { connectors } = settle({ elements, connectors: connectors0 }, dxOf, reroute);

  const contentRight = Math.max(...elements.filter((e) => !SWIMLANE.has(e.type)).map((e) => e.x + e.width));
  const n = members.length;
  return {
    elements, connectors, contentRight,
    summary: `surrounded ${n} element${n === 1 ? "" : "s"} with the expanded subprocess ${label}${siblings.length ? `, moving ${siblings.length} to the right` : ""}`,
  };
}

export function planUnwrapSubprocess(shape: Shape, epId: string): WrapPlan {
  const byId = new Map(shape.elements.map((e) => [e.id, e] as const));
  const ep = byId.get(epId);
  if (!ep || ep.type !== "subprocess-expanded") return { error: "select an expanded subprocess first" };

  const inside = closure(shape.elements, [ep.id]);
  inside.delete(ep.id);
  const kids = shape.elements.filter((e) => e.parentId === ep.id);
  const starts = kids.filter((e) => e.type === "start-event").sort((a, b) => a.x - b.x);
  const ends = kids.filter((e) => e.type === "end-event").sort((a, b) => b.x - a.x);
  const shellEvents = shape.elements.filter((e) => e.boundaryHostId === ep.id);
  // The shell, its Start/End and anything mounted on its edge go; everything else inside stays.
  const removed = new Set<string>([ep.id, ...starts.map((e) => e.id), ...ends.map((e) => e.id), ...shellEvents.map((e) => e.id)]);
  const content = shape.elements.filter((e) => inside.has(e.id) && !removed.has(e.id));
  if (content.length === 0) return { error: `${nameOf(ep)} has nothing inside it` };

  // The flow re-enters at what the Start fed (else the leftmost element) and
  // leaves from what fed the End (else the rightmost).
  const seq = shape.connectors.filter((c) => c.type === "sequence");
  const entryId = (starts[0] && seq.find((c) => c.sourceId === starts[0].id && !removed.has(c.targetId))?.targetId)
    ?? [...content].sort((a, b) => a.x - b.x)[0].id;
  const exitId = (ends[0] && seq.find((c) => c.targetId === ends[0].id && !removed.has(c.sourceId))?.sourceId)
    ?? [...content].sort((a, b) => (b.x + b.width) - (a.x + a.width))[0].id;

  // Give the room back: the contents slide left to where the shell's left edge
  // was, and everything right of the shell slides left by the width it added.
  const box = bbox(content);
  const dxKids = ep.x - box.x;
  const dxRight = Math.min(0, -(ep.width - box.width));
  const isHome = (e: DiagramElement) => (ep.parentId ? e.parentId === ep.parentId : !e.parentId);
  const siblings = shape.elements.filter((e) => e.id !== ep.id && isHome(e) && !SWIMLANE.has(e.type) && !e.boundaryHostId && cx(e) >= ep.x + ep.width);
  const shifted = closure(shape.elements, siblings.map((e) => e.id));
  const dxOf = (id: string) => (inside.has(id) && !removed.has(id) ? dxKids : shifted.has(id) ? dxRight : 0);

  const elements = shape.elements
    .filter((e) => !removed.has(e.id))
    .map((e) => {
      const dx = dxOf(e.id);
      const moved = dx ? { ...e, x: e.x + dx } : e;
      return e.parentId === ep.id ? { ...moved, parentId: ep.parentId } : moved;
    });

  const reroute = new Set<string>();
  const connectors0: Connector[] = [];
  for (const c of shape.connectors) {
    if (!removed.has(c.sourceId) && !removed.has(c.targetId)) { connectors0.push(c); continue; }
    if (c.targetId === ep.id && !removed.has(c.sourceId)) {
      connectors0.push({ ...c, targetId: entryId, targetSide: "left", targetOffsetAlong: 0.5, targetPinned: false, pathShaped: false });
      reroute.add(c.id);
    } else if (c.sourceId === ep.id && !removed.has(c.targetId)) {
      connectors0.push({ ...c, sourceId: exitId, sourceSide: "right", sourceOffsetAlong: 0.5, sourcePinned: false, pathShaped: false });
      reroute.add(c.id);
    }
    // Start → entry, exit → End and flows on the shell's own edge events: gone with the shell.
  }
  const { connectors } = settle({ elements, connectors: connectors0 }, dxOf, reroute);

  const contentRight = Math.max(...elements.filter((e) => !SWIMLANE.has(e.type)).map((e) => e.x + e.width));
  return {
    elements, connectors, contentRight,
    summary: `dissolved ${nameOf(ep)} — its ${content.length} element${content.length === 1 ? " is" : "s are"} back in the flow`,
  };
}

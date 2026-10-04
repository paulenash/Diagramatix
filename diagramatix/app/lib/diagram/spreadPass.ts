/**
 * The editor's endpoint post-pass (slice 3 of new features/connector-endpoints-plan-2026-10-03.md).
 *
 * After an action, the connectors that action TOUCHED — added, re-attached, or attached to an element that moved or was
 * resized — must not share an attachment point with each other or with the connectors already on the same faces. The
 * allocator (endpointSpread.ts) decides where the ends go; this applies it, and re-routes only what it changed.
 *
 * SCOPE, deliberately narrow: ONLY the connectors an action touched may move. Every other connector is FROZEN — it keeps
 * the offsets it was saved with and simply counts as occupied, so a touched connector is placed round it. An old diagram
 * that already has two connectors on one point is NOT silently rearranged by an unrelated edit (the load-time repair, with
 * its green flash and its Undo, is slice 5). A label edit changes nothing; a drag moves the dragged element's own
 * connectors, round their neighbours; a new connector separates itself from the ones it joined, and they stay put.
 *
 * Pure.
 */
import type { Connector, DiagramData, DiagramElement } from "./types";
import { spreadEndpoints } from "./endpointSpread";
import { recomputeAllConnectors } from "./routing";

const RULED = new Set(["sequence", "messageBPMN"]);

const moved = (a: DiagramElement, b: DiagramElement) => a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;

/** What decides where a connector attaches. A label edit, a recolour or a re-route that kept these is not a change of attachment. */
const attachment = (c: Connector) =>
  `${c.type}|${c.sourceId}|${c.targetId}|${c.sourceSide}|${c.targetSide}|${c.sourceOffsetAlong ?? ""}|${c.targetOffsetAlong ?? ""}|${c.routingType}`;

/**
 * A route the person shaped by hand (nine or more points — routing.ts keeps its interior and only re-fits the end stubs)
 * is as good as a point they placed: it is never moved here. Re-fitting one stub of such a route leaves a slanted segment.
 */
const SHAPED_MIN_POINTS = 9;

/** The connectors an action touched: new or changed ones, and those attached to an element that moved or was resized. */
export function touchedConnectorIds(prev: DiagramData, next: DiagramData): Set<string> {
  const touched = new Set<string>();
  const was = new Map(prev.connectors.map((c) => [c.id, c] as const));
  for (const c of next.connectors) {
    if (!RULED.has(c.type)) continue;
    const w = was.get(c.id);
    if (!w || attachment(w) !== attachment(c)) touched.add(c.id);          // new, or attached differently
  }
  if (prev.elements !== next.elements) {
    const wasEl = new Map(prev.elements.map((e) => [e.id, e] as const));
    const movedIds = new Set<string>();
    for (const e of next.elements) {
      const w = wasEl.get(e.id);
      if (w && w !== e && moved(w, e)) movedIds.add(e.id);
    }
    if (movedIds.size) for (const c of next.connectors) if (RULED.has(c.type) && (movedIds.has(c.sourceId) || movedIds.has(c.targetId))) touched.add(c.id);
  }
  return touched;
}

/** What a moved connector's label does: stay where it was in the world (sequence), or follow its anchor end (message). */
export type LabelFor = (orig: Connector, rerouted: Connector, elements: readonly DiagramElement[]) => Partial<Connector>;

/** Spread the touched connectors; return `next` unchanged (same object) when there is nothing to do. */
export function spreadAfter(prev: DiagramData, next: DiagramData, labelFor?: LabelFor): DiagramData {
  if (prev.connectors === next.connectors && prev.elements === next.elements) return next;
  if (!next.connectors.some((c) => RULED.has(c.type))) return next;
  const touched = touchedConnectorIds(prev, next);
  if (!touched.size) return next;

  // Everything not touched is frozen: it stays exactly where it is and the touched ones are placed round it.
  const frozen = new Set<string>();
  for (const c of next.connectors) {
    if (!RULED.has(c.type)) continue;
    if (!touched.has(c.id) || (c.waypoints?.length ?? 0) >= SHAPED_MIN_POINTS) frozen.add(c.id);   // untouched, or shaped by hand
  }

  const r = spreadEndpoints(next.elements, next.connectors, { relaxed: next.relaxedLayout, frozen });
  const changed = r.changedIds.filter((id) => touched.has(id));
  if (!changed.length) return next;

  return applyOffsets(next, new Set(changed), r.connectors, labelFor);
}

/** Take the new offsets of the changed connectors from `spread`, re-route just those, and carry their labels with them. */
function applyOffsets(next: DiagramData, changedSet: ReadonlySet<string>, spread: readonly Connector[], labelFor?: LabelFor): DiagramData {
  const byId = new Map(spread.map((c) => [c.id, c] as const));
  const taken = next.connectors.map((c) => (changedSet.has(c.id)
    ? { ...c, sourceOffsetAlong: byId.get(c.id)!.sourceOffsetAlong, targetOffsetAlong: byId.get(c.id)!.targetOffsetAlong }
    : c));
  const origById = new Map(next.connectors.map((c) => [c.id, c] as const));
  const rerouted = new Map(
    recomputeAllConnectors(taken.filter((c) => changedSet.has(c.id)), next.elements, next.relaxedLayout).map((c) => {
      const orig = origById.get(c.id);
      // Its label goes with it: a sequence label keeps its place in the world, a message label follows its anchor end.
      const adj = orig && labelFor ? labelFor(orig, c, next.elements) : {};
      return [c.id, Object.keys(adj).length ? { ...c, ...adj } : c] as const;
    }),
  );
  return { ...next, connectors: taken.map((c) => rerouted.get(c.id) ?? c) as Connector[] };
}

/**
 * HEAL ON LOAD (slice 5): the same rule applied to a whole saved diagram, once, when it is opened — for diagrams drawn
 * before the rule existed (or by something that ignored it) that have two connectors on one point.
 *
 * Left alone, by Paul's rulings: a diagram generated from an image (`relaxedLayout`) or imported (`exactAsDrawn`) stays
 * exactly as drawn; gateways are out of scope (the allocator never touches them); a route shaped by hand is never moved.
 * Everything else that collides is separated, in the order that avoids crossings, and re-routed.
 *
 * Returns the healed diagram and the ids it changed — the editor flashes those green and applies the heal as ONE undoable
 * step, so a single Undo gives back the diagram as it was saved. `changedIds` empty means nothing to do (and `data` is the
 * same object). Idempotent: healing a healed diagram changes nothing.
 */
export function healEndpoints(data: DiagramData, labelFor?: LabelFor): { data: DiagramData; changedIds: string[] } {
  const none = { data, changedIds: [] as string[] };
  if (data.relaxedLayout || data.exactAsDrawn) return none;
  if (!data.connectors.some((c) => RULED.has(c.type))) return none;
  const frozen = new Set<string>();
  for (const c of data.connectors) if (RULED.has(c.type) && (c.waypoints?.length ?? 0) >= SHAPED_MIN_POINTS) frozen.add(c.id);
  const r = spreadEndpoints(data.elements, data.connectors, { frozen });
  if (!r.changedIds.length) return none;
  const healed = applyOffsets(data, new Set(r.changedIds), r.connectors, labelFor);
  return { data: healed, changedIds: [...r.changedIds] };
}

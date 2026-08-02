/**
 * Boundary crossings for a SCOPED SOP (lane / pool / subprocess) — every
 * connector with exactly one endpoint inside the scope. Shared by BOTH the
 * figure (green "To:/From:" boundary stubs drawn where a connector leaves the
 * shown region) and the SOP text (the Hand-offs section), so they always agree.
 *
 * Label rules (per spec):
 *  - Sequence crossing to another lane  → context = "<Lane>" (or "<Pool> / <Lane>"
 *    when it also crosses a pool); detail = the target element's name.
 *  - Message to/from a black-box Pool    → context = "<Pool name>"; detail = message label.
 *  - Message to/from a white-box Pool     → context = "<Pool> / <Lane>"; detail = the
 *    target activity's name.
 */
import type { DiagramData, DiagramElement } from "../diagram/types";
import { indexById, laneOf, poolOf, isInside } from "../diagram/containment";
import type { SopScope } from "./skeleton";

export interface BoundaryCrossing {
  direction: "out" | "in";   // out → leaves scope ("To:"); in → enters scope ("From:")
  kind: "sequence" | "message";
  context: string;           // the lane/pool context (no "To:/From:" prefix)
  detail: string;            // target name, or the message label
  inElementId: string;       // the in-scope element the connector attaches to (for stub placement)
  peerX: number;             // peer element centre — the direction the stub points
  peerY: number;
}

const SEQ = new Set(["sequence", "flow", "flowline"]);
const MSG = new Set(["message", "messageBPMN"]);

export function computeBoundaryCrossings(data: DiagramData, scope: SopScope, scopeElementId?: string): BoundaryCrossing[] {
  if (scope === "whole" || scope === "group" || !scopeElementId) return [];
  const elements = data.elements ?? [];
  const connectors = data.connectors ?? [];
  const byId = indexById(elements);
  const labelOf = (e?: DiagramElement | null) => (e ? (e.label?.trim() || `(unnamed ${e.type})`) : "");

  const inScope = (el?: DiagramElement): boolean => {
    if (!el) return false;
    if (scope === "lane") return laneOf(el, byId)?.id === scopeElementId;
    if (scope === "pool") return poolOf(el, byId)?.id === scopeElementId;
    if (scope === "subprocess") return isInside(el, scopeElementId, byId);
    return false;
  };

  const out: BoundaryCrossing[] = [];
  for (const c of connectors) {
    const isSeq = SEQ.has(c.type), isMsg = MSG.has(c.type);
    if (!isSeq && !isMsg) continue;
    const src = byId.get(c.sourceId), tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    const sIn = inScope(src), tIn = inScope(tgt);
    if (sIn === tIn) continue; // both inside or both outside → not a boundary crossing
    const inEl = sIn ? src : tgt;
    const peer = sIn ? tgt : src;
    const direction: "out" | "in" = sIn ? "out" : "in";

    let context: string, detail: string, kind: "sequence" | "message";
    if (isMsg) {
      kind = "message";
      if (peer.type === "pool") {
        // Message to/from a pool element (typically a black-box pool).
        context = labelOf(peer);
        detail = c.label?.trim() || "(message)";
      } else {
        // Message to/from an activity in another (white-box) pool.
        const pool = poolOf(peer, byId), lane = laneOf(peer, byId);
        context = pool ? (lane ? `${labelOf(pool)} / ${labelOf(lane)}` : labelOf(pool)) : labelOf(lane);
        detail = labelOf(peer);
      }
    } else {
      kind = "sequence";
      const peerLane = laneOf(peer, byId), peerPool = poolOf(peer, byId), myPool = poolOf(inEl, byId);
      const crossPool = !!peerPool && !!myPool && peerPool.id !== myPool.id;
      context = crossPool && peerPool
        ? (peerLane ? `${labelOf(peerPool)} / ${labelOf(peerLane)}` : labelOf(peerPool))
        : (peerLane ? labelOf(peerLane) : labelOf(peerPool));
      detail = labelOf(peer);
    }

    out.push({ direction, kind, context, detail, inElementId: inEl.id, peerX: peer.x + peer.width / 2, peerY: peer.y + peer.height / 2 });
  }
  return out;
}

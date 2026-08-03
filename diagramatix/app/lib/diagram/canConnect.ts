/**
 * Pure connector-legality predicate — a faithful mirror of the `ADD_CONNECTOR`
 * non-force validation gauntlet in `app/hooks/useDiagram.ts`. Returns true when a
 * NON-force connect of `connectorType` from `source` to `target` would be
 * ACCEPTED by the reducer.
 *
 * The reducer calls this (single source of truth) and the AI "assist" / next-step
 * suggestion engine calls it to pre-filter legal candidates BEFORE offering them.
 *
 * Scope: this covers exactly the `if (!force) { … }` gauntlet. The pre-gauntlet
 * special cases are handled by the reducer before this runs — review-comment
 * endpoints (coerced to a review link → always allowed, so treated as true here),
 * self-loops (source === target), and the compensation → association coercion.
 */
import type { DiagramElement, ConnectorType } from "./types";

const DATA_ELEMENT_TYPES = new Set<string>(["data-object", "data-store", "text-annotation"]);
const MARKER_TYPES = new Set<string>(["uml-pain-point", "uml-issue"]);
const EVENT_CONN_TYPES = new Set<string>(["start-event", "intermediate-event", "end-event"]);
const COMPENSATION_TARGET_TYPES = new Set<string>(["task", "subprocess", "subprocess-expanded"]);

export function canConnect(
  source: DiagramElement,
  target: DiagramElement,
  connectorType: ConnectorType,
  elements: DiagramElement[],
): boolean {
  // Review-comment endpoints are coerced to a (non-directed) review link before
  // the gauntlet runs — always valid.
  if (source.type === "review-comment" || target.type === "review-comment") return true;

  const isDataConn = DATA_ELEMENT_TYPES.has(source.type) || DATA_ELEMENT_TYPES.has(target.type);
  const isCompensationLink =
    source.type === "intermediate-event" &&
    (source.eventType as string | undefined) === "compensation" &&
    !!source.boundaryHostId &&
    COMPENSATION_TARGET_TYPES.has(target.type);

  // State-machine: never FROM a final-state or TO an initial-state.
  if (source.type === "final-state") return false;
  if (target.type === "initial-state") return false;

  // Data elements may only use associationBPMN.
  if (isDataConn && connectorType !== "associationBPMN") return false;

  // Pain points / issues can never be a connector endpoint.
  if (MARKER_TYPES.has(source.type) || MARKER_TYPES.has(target.type)) return false;

  // UML package: only dependency / containment / note-anchor; containment is package↔package only.
  const isPackageConn = source.type === "uml-package" || target.type === "uml-package";
  if (isPackageConn && connectorType !== "uml-dependency" && connectorType !== "uml-containment"
      && connectorType !== "uml-note-anchor") return false;
  if (connectorType === "uml-containment"
      && !(source.type === "uml-package" && target.type === "uml-package")) return false;

  // UML note: only a note-anchor, joining exactly one Note end to a non-Note.
  const isNoteConn = source.type === "uml-note" || target.type === "uml-note";
  if (isNoteConn && connectorType !== "uml-note-anchor") return false;
  if (connectorType === "uml-note-anchor") {
    const srcNote = source.type === "uml-note";
    const tgtNote = target.type === "uml-note";
    if (srcNote === tgtNote) return false;
  }

  // associationBPMN only for data / event-to-event / compensation.
  const isEventToEvent = EVENT_CONN_TYPES.has(source.type) && EVENT_CONN_TYPES.has(target.type);
  if (!isDataConn && !isEventToEvent && !isCompensationLink && connectorType === "associationBPMN") return false;

  // messageBPMN never onto a white-box pool itself.
  if (connectorType === "messageBPMN") {
    const srcWB = source.type === "pool" && ((source.properties.poolType as string | undefined) ?? "black-box") === "white-box";
    const tgtWB = target.type === "pool" && ((target.properties.poolType as string | undefined) ?? "black-box") === "white-box";
    if (srcWB || tgtWB) return false;
  }

  // ── BPMN sequence rules ──
  if (connectorType === "sequence") {
    // Compensation activity = association-only, never sequence.
    if (source.properties?.isForCompensation === true || target.properties?.isForCompensation === true) return false;

    const byId = (id?: string) => (id ? elements.find((e) => e.id === id) : undefined);
    const findExpandedSubParent = (el: DiagramElement): DiagramElement | undefined => {
      let cur = el;
      for (let i = 0; i < 10; i++) {
        if (!cur.parentId) return undefined;
        const parent = byId(cur.parentId);
        if (!parent) return undefined;
        if (parent.type === "subprocess-expanded") return parent;
        cur = parent;
      }
      return undefined;
    };
    const isEventExpandedSub = (el: DiagramElement) =>
      el.type === "subprocess-expanded" && (el.properties.subprocessType as string | undefined) === "event";

    // No sequence TO a non-boundary start event; none FROM a non-boundary end event.
    if (target.type === "start-event" && !target.boundaryHostId) return false;
    if (source.type === "end-event" && !source.boundaryHostId) return false;

    // No sequence to/from an Event Expanded Subprocess; scope containment rules.
    if (isEventExpandedSub(target)) return false;
    if (isEventExpandedSub(source)) return false;
    const targetParentExp = findExpandedSubParent(target);
    if (targetParentExp && isEventExpandedSub(targetParentExp)) {
      const sourceParentExp = findExpandedSubParent(source);
      if (sourceParentExp?.id !== targetParentExp.id) return false;
    }
    const sourceParentExp = findExpandedSubParent(source);
    if (sourceParentExp && isEventExpandedSub(sourceParentExp)) {
      const targetParentExp2 = findExpandedSubParent(target);
      if (targetParentExp2?.id !== sourceParentExp.id) return false;
    }

    // Edge-mounted End/Intermediate events cannot connect INSIDE their host subprocess.
    if (source.boundaryHostId && (source.type === "end-event" || source.type === "intermediate-event")) {
      const hostSub = byId(source.boundaryHostId);
      if (hostSub) {
        let cur: DiagramElement | undefined = target;
        for (let i = 0; i < 10 && cur; i++) {
          if (cur.id === hostSub.id || cur.parentId === hostSub.id) return false;
          cur = cur.parentId ? byId(cur.parentId) : undefined;
        }
      }
    }
    // Edge-mounted End event: reachable only from INSIDE its host.
    if (target.boundaryHostId && target.type === "end-event") {
      const hostId = target.boundaryHostId;
      let cur: DiagramElement | undefined = source, inside = false;
      for (let i = 0; i < 10 && cur; i++) {
        if (cur.id === hostId || cur.parentId === hostId) { inside = true; break; }
        cur = cur.parentId ? byId(cur.parentId) : undefined;
      }
      if (!inside) return false;
    }
    // Edge-mounted Start event (R3.08): reachable only from OUTSIDE its host.
    if (target.boundaryHostId && target.type === "start-event") {
      const hostId = target.boundaryHostId;
      let cur: DiagramElement | undefined = source, inside = false;
      for (let i = 0; i < 10 && cur; i++) {
        if (cur.id === hostId || cur.parentId === hostId) { inside = true; break; }
        cur = cur.parentId ? byId(cur.parentId) : undefined;
      }
      if (inside) return false;
    }
  }

  return true;
}

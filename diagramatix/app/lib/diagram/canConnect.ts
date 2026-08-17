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
import { getElementPoolId } from "./poolUtil";

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
    // An edge-mounted (boundary) intermediate event — an "EMIE" — catches an
    // internal trigger, not an incoming message flow, UNLESS its trigger is
    // Message. So a messageBPMN may only target a boundary intermediate event
    // when eventType === "message"; and a boundary event never SENDS a message.
    const isBoundaryIntermediate = (el: DiagramElement) =>
      el.type === "intermediate-event" && !!el.boundaryHostId;
    if (isBoundaryIntermediate(source)) return false;
    if (isBoundaryIntermediate(target) && (target.eventType as string | undefined) !== "message") return false;
  }

  // ── BPMN sequence rules ──
  if (connectorType === "sequence") {
    // Compensation activity = association-only, never sequence.
    if (source.properties?.isForCompensation === true || target.properties?.isForCompensation === true) return false;

    // A sequence flow may never cross a POOL boundary — participants in
    // different pools communicate only via message flows. (Two pool-less
    // top-level elements both resolve to null → same "pool" → allowed.)
    if (getElementPoolId(source, elements) !== getElementPoolId(target, elements)) return false;

    const byId = (id?: string) => (id ? elements.find((e) => e.id === id) : undefined);
    // The innermost Expanded-Subprocess (EP) ancestor's id — the element's flow
    // "scope" — or null when it lives at the top level (walks past lanes/pools).
    const containerScope = (el: DiagramElement | undefined): string | null => {
      let cur = el;
      for (let i = 0; i < 20 && cur; i++) {
        if (!cur.parentId) return null;
        const parent = byId(cur.parentId);
        if (!parent) return null;
        if (parent.type === "subprocess-expanded") return parent.id;
        cur = parent;
      }
      return null;
    };
    const isEventExpandedSub = (el: DiagramElement) =>
      el.type === "subprocess-expanded" && (el.properties.subprocessType as string | undefined) === "event";

    // A non-boundary Start can never be a sequence target; a non-boundary End
    // can never be a sequence source.
    if (target.type === "start-event" && !target.boundaryHostId) return false;
    if (source.type === "end-event" && !source.boundaryHostId) return false;

    // An Event Expanded Subprocess is triggered by an event, never sequence flow.
    if (isEventExpandedSub(source) || isEventExpandedSub(target)) return false;

    // Scope model: a sequence flow may not cross an EP boundary. Each endpoint's
    // "flow scope" is the EP it participates in — normally its container, but an
    // edge-mounted event redefines it:
    //   • edge Start on X — source: flows INTO X (scope = X); target: an external
    //     trigger reached from OUTSIDE X (scope = the scope containing X).
    //   • edge End on X — target: X's exit, reachable only from INSIDE X (scope =
    //     X); source: illegal (an End has no outgoing flow).
    //   • edge (boundary) Intermediate on X: its flow continues in X's own scope.
    // A connection is legal iff the two effective scopes are equal.
    const flowScope = (el: DiagramElement, role: "source" | "target"): string | null | "illegal" => {
      if (el.boundaryHostId) {
        const host = byId(el.boundaryHostId);
        const outer = host ? containerScope(host) : null;
        if (el.type === "start-event") return role === "source" ? el.boundaryHostId : outer;
        if (el.type === "end-event") return role === "source" ? "illegal" : el.boundaryHostId;
        return outer; // boundary intermediate event
      }
      return containerScope(el);
    };
    const sScope = flowScope(source, "source");
    const tScope = flowScope(target, "target");
    if (sScope === "illegal" || tScope === "illegal") return false;
    if (sScope !== tScope) return false;
  }

  return true;
}

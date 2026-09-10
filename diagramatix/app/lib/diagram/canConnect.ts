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

// ── EPC ──
/** The three connectors. Split or join; never a shape on their own account. */
const EPC_CONNECTORS = new Set<string>(["epc-xor", "epc-and", "epc-or"]);
/** The connectors that represent a CHOICE. An AND is not one — it takes every
 *  branch — which is why an event may precede an AND but not these. */
const EPC_DECISIONS = new Set<string>(["epc-xor", "epc-or"]);
/** Everything the control flow may pass through. */
const EPC_FLOW_TYPES = new Set<string>(["epc-event", "epc-function", "epc-xor", "epc-and", "epc-or", "epc-interface"]);
const EPC_ORG_TYPES = new Set<string>(["epc-org-unit", "epc-position"]);
const EPC_DATA_TYPES = new Set<string>(["epc-data", "epc-application"]);

/**
 * EPC connector legality — rules E1, E3 and E6 of the notation.
 *
 * Returns `undefined` when neither end is an EPC object, so the BPMN/UML/state
 * gauntlet below is untouched by this existing. A diagram that contains no EPC
 * symbols behaves exactly as it did.
 *
 * E2 (starts and ends with an event), E4 (a connector is a split or a join,
 * never both), E5 (a split should be matched by a join) and E7 (one responsible
 * org unit) are NOT here. Two reasons, and both matter:
 *
 * They are properties of the WHOLE DIAGRAM rather than of one edge — E4 in
 * particular needs the connector list, which this predicate never receives, and
 * giving it one would change a signature the reducer and the assist engine both
 * depend on. And refusing an edge because the diagram is not yet balanced would
 * make an EPC impossible to draw: you would be blocked halfway through every
 * branch, before the join you were on your way to adding.
 *
 * So they are RED RULES, reported by the scan, where an EPC in progress is
 * allowed to be temporarily wrong.
 */
function epcCanConnect(
  source: DiagramElement,
  target: DiagramElement,
  connectorType: ConnectorType,
): boolean | undefined {
  const sEpc = source.type.startsWith("epc-");
  const tEpc = target.type.startsWith("epc-");
  if (!sEpc && !tEpc) return undefined;

  // The arc kinds are typed, so the wrong arc between the right objects is
  // caught as surely as the wrong objects.
  if (connectorType === "epc-org-assignment") {
    // E6, positive half: responsibility attaches an ORG to a FUNCTION, either way
    // round, and to nothing else. Never to an event — nobody performs a state.
    return (EPC_ORG_TYPES.has(source.type) && target.type === "epc-function")
      || (source.type === "epc-function" && EPC_ORG_TYPES.has(target.type));
  }
  if (connectorType === "epc-information-flow") {
    // Direction is the semantics: data → function reads, function → data writes.
    return (EPC_DATA_TYPES.has(source.type) && target.type === "epc-function")
      || (source.type === "epc-function" && EPC_DATA_TYPES.has(target.type));
  }
  if (connectorType !== "epc-control-flow") return false;

  // E6, control-flow half: only the six flow objects may carry sequence, which
  // excludes every satellite by construction. An explicit satellite veto used to
  // sit above this line; planting an offender proved it could not fail, because
  // the whitelist had already refused. One mechanism, and it is the live one.
  if (!EPC_FLOW_TYPES.has(source.type) || !EPC_FLOW_TYPES.has(target.type)) return false;

  // E1: strict alternation. Two functions may never be directly connected, nor
  // two events — the notation says a state gives rise to work which gives rise
  // to a state, and a chain that skips one is not an EPC.
  if (source.type === "epc-event" && target.type === "epc-event") return false;
  if (source.type === "epc-function" && target.type === "epc-function") return false;

  // E3: an event may not be followed by a DECISION. THE classic EPC rule: an
  // event is passive — it is a thing that has come about — and a passive thing
  // cannot choose. Only a function may precede an XOR or an OR. An AND after an
  // event is fine, because taking every branch is not a choice.
  if (source.type === "epc-event" && EPC_DECISIONS.has(target.type)) return false;

  return true;
}

export function canConnect(
  source: DiagramElement,
  target: DiagramElement,
  connectorType: ConnectorType,
  elements: DiagramElement[],
): boolean {
  // Review-comment endpoints are coerced to a (non-directed) review link before
  // the gauntlet runs — always valid.
  if (source.type === "review-comment" || target.type === "review-comment") return true;

  // EPC answers for its own objects and abstains for everything else, so the
  // BPMN / UML / state-machine gauntlet below is unchanged by its existence.
  const epc = epcCanConnect(source, target, connectorType);
  if (epc !== undefined) return epc;

  const isDataConn = DATA_ELEMENT_TYPES.has(source.type) || DATA_ELEMENT_TYPES.has(target.type);
  const isCompensationLink =
    source.type === "intermediate-event" &&
    (source.eventType as string | undefined) === "compensation" &&
    !!source.boundaryHostId &&
    COMPENSATION_TARGET_TYPES.has(target.type);

  // State-machine: never FROM a final-state or TO an initial / history state.
  // A history state (shallow H / deep H*) is a pseudo-initial state — it may
  // only have OUTGOING transitions (UML).
  if (source.type === "final-state") return false;
  if (target.type === "initial-state" || target.type === "history-state" || target.type === "deep-history-state") return false;

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
    //   • edge (boundary) Intermediate on X (an EMIE) — source: its outgoing flow
    //     continues in X's OUTER scope; target: illegal (an EMIE is TRIGGERED by
    //     its boundary, it has no incoming sequence flow).
    // A connection is legal iff the two effective scopes are equal.
    const flowScope = (el: DiagramElement, role: "source" | "target"): string | null | "illegal" => {
      if (el.boundaryHostId) {
        const host = byId(el.boundaryHostId);
        const outer = host ? containerScope(host) : null;
        if (el.type === "start-event") return role === "source" ? el.boundaryHostId : outer;
        if (el.type === "end-event") return role === "source" ? "illegal" : el.boundaryHostId;
        return role === "target" ? "illegal" : outer; // boundary intermediate (EMIE): outgoing only
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

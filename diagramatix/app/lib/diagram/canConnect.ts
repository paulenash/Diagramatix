/**
 * Pure connector-legality predicate — a faithful mirror of the `ADD_CONNECTOR`
 * non-force validation gauntlet in `app/hooks/useDiagram.ts`. Returns true when a
 * NON-force connect of `connectorType` from `source` to `target` would be
 * ACCEPTED by the reducer.
 *
 * The reducer's gauntlet is a MIRROR of this, held to it by
 * tests/diagram/can-connect-parity.test.ts — except for message flows, where
 * the reducer asks `messageFlowRefusal` below itself, so there is one message
 * rule and not two. The Canvas drop, the drag highlight, the Rules Checker
 * (B42), the voice commands and the AI "assist" / next-step suggestion engine
 * all call this to pre-filter legal candidates BEFORE offering them.
 *
 * Scope: this covers exactly the `if (!force) { … }` gauntlet. The pre-gauntlet
 * special cases are handled by the reducer before this runs — review-comment
 * endpoints (coerced to a review link → always allowed, so treated as true here),
 * self-loops (source === target), and the compensation → association coercion.
 */
import type { DiagramElement, ConnectorType, Connector } from "./types";
import { getElementPoolId } from "./poolUtil";
import { isThrowingEvent, isCatchingEvent } from "./eventDirection";
import { isBlackBoxPool } from "./blackBoxPoolMenu";

export interface CanConnectOptions {
  /**
   * A speed-up: "which pool is this in?" from a precomputed map — the drag
   * highlight asks canConnect for every element on every frame, and
   * getElementPoolId's walk made that O(n²) (CANVAS-06). It must give the same
   * answer as getElementPoolId.
   */
  poolIdOf?: (el: DiagramElement) => string | null;
  /**
   * The diagram's connectors. The message rule needs them for one question:
   * which way does an intermediate event with no Flow Type already face (see
   * `messageTraffic`)? Every path that draws or offers a message passes them;
   * without them only the Flow Type counts.
   */
  connectors?: readonly Connector[];
}

/** Which pool an element is in — the caller's fast resolver when given. */
const poolLookup = (elements: DiagramElement[], opts?: CanConnectOptions) =>
  opts?.poolIdOf ?? ((el: DiagramElement) => getElementPoolId(el, elements));

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
 * The descriptive objects. Every one of them attaches to a FUNCTION and says
 * something about it, so they behave exactly as an information object does —
 * which is why they join EPC_DATA_TYPES below rather than getting rules of
 * their own. Note what that buys: E6 already refuses them on the control flow,
 * because the flow whitelist names its six members rather than listing what is
 * banned. Ten new symbols and the control-flow rule needed no change at all.
 */
const EPC_ANNOTATION_TYPES = new Set<string>([
  "epc-kpi", "epc-risk", "epc-product", "epc-knowledge", "epc-business-rule",
  "epc-screen", "epc-objective", "epc-machine", "epc-location", "epc-requirement",
]);
/** Everything that hangs off a function by an information arc. */
const EPC_ATTACHABLE = new Set<string>([...EPC_DATA_TYPES, ...EPC_ANNOTATION_TYPES]);

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
    // The descriptive objects ride the same arc — a KPI measuring a function and
    // an invoice being read by one are the same shape of statement.
    return (EPC_ATTACHABLE.has(source.type) && target.type === "epc-function")
      || (source.type === "epc-function" && EPC_ATTACHABLE.has(target.type));
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

// ── Message flows ──────────────────────────────────────────────────────────
//
// THE message-flow endpoint rule: which elements may SEND a message, which may
// RECEIVE one, and which pairs may exchange one. Every path asks it — the mouse
// drop and the blue drag highlight (through canConnect), the reducer's
// ADD_CONNECTOR, the voice "add a message" numbering and its answer, the
// addMessage op, and the Rules Checker's B42 scan. One rule, one place: copies
// of it drift — voice numbered every task but never "Message 2 Arrives", which
// the mouse could message, while the mouse took a message onto a timer.
//
// Paul, 2026-09-25: "Should allow messages to Receive Intermediate events as
// well e.g. message 2 arrives" — and later: "Also messages should be allowed
// FROM Intermediate and End events with trigger Send. Add Messages should
// include them in the numbered list."
//
// Paul, 2026-09-25, on plain (no-trigger) events: "Convertible". A plain event
// may take a message and becomes a Message event — the reducer's conversion in
// ADD_CONNECTOR stays. So:
//   • a plain or Message START event receives (never sends);
//   • a plain or Message END event sends (never receives);
//   • a plain or Message INTERMEDIATE event with no Flow Type (or "none") goes
//     either way; only an explicit "catching" or "throwing" (or the legacy
//     taskType "send" with no Flow Type — eventDirection.ts) fixes it — or a
//     message it already has: one that already receives a message catches, one
//     that already sends throws. An event is a catch or a throw, never both,
//     and the reducer stamps the Flow Type when the editor draws the first
//     message; generated and imported diagrams carry the message without the
//     stamp. Without this, a second message the other way was accepted, the
//     reducer flipped the event, and its first message became a Rules Checker
//     error (the seeded O2C example's "Customer Responds");
//   • a boundary intermediate event receives only, and only when its trigger
//     is Message (it catches an internal trigger otherwise);
//   • Multiple and Parallel-multiple triggers are treated as Message (BPMN
//     lets either carry a message definition);
//   • tasks, collapsed and expanded subprocesses and black-box pools go both
//     ways;
//   • never: gateways, lanes, white-box pools (message what is inside them),
//     data, annotations, events with any other trigger (timer, error,
//     escalation, …), a start event inside an embedded subprocess (it is always
//     a None start), a boundary start or end event, an event subprocess shell,
//     a compensation activity (only its compensation association reaches it),
//     anything inside a black-box pool (message the pool);
//   • the two ends are in different pools. A pool-less element is in the
//     "invisible pool" (poolId null) — the drag highlight's reading — so a
//     pool-less element may message an element in a pool, and two pool-less
//     elements may not message each other.
//
// Reasons are returned, not just refusals, because voice has no ring to show:
// "“Message 1 Arrives” catches a message — it can only receive one" is what
// tells Paul to say it the other way round.

/** Triggers that carry a message. Plain ("none"/unset) is convertible. */
const MESSAGE_TRIGGERS = new Set<string>(["message", "multiple", "parallel-multiple"]);
const isPlainEvent = (el: DiagramElement) => {
  const t = el.eventType as string | undefined;
  return t == null || t === "none";
};
const takesMessages = (el: DiagramElement) =>
  isPlainEvent(el) || MESSAGE_TRIGGERS.has(el.eventType as string);
const wrongTrigger = (el: DiagramElement) => {
  const t = String(el.eventType).replace(/-/g, " ");
  // Read aloud by Diagramatix Voice, so "an Error", not "a Error".
  const article = /^[aeiou]/i.test(t) ? "an" : "a";
  return `has ${article} ${t.charAt(0).toUpperCase()}${t.slice(1)} trigger — only a Message event (or a plain one, which becomes a Message event) exchanges messages`;
};

/**
 * Which elements already send, and which already receive, a message. Built once
 * per connectors array: the drag highlight asks for every element on every
 * frame. Connector lists are replaced, never edited in place (React state), so
 * the array is the key; the length check catches a caller that pushes anyway.
 */
const trafficCache = new WeakMap<readonly Connector[], { n: number; sends: Set<string>; receives: Set<string> }>();
export function messageTraffic(connectors: readonly Connector[]): { sends: ReadonlySet<string>; receives: ReadonlySet<string> } {
  const hit = trafficCache.get(connectors);
  if (hit && hit.n === connectors.length) return hit;
  const t = { n: connectors.length, sends: new Set<string>(), receives: new Set<string>() };
  for (const c of connectors) {
    if (c.type !== "messageBPMN") continue;
    t.sends.add(c.sourceId);
    t.receives.add(c.targetId);
  }
  trafficCache.set(connectors, t);
  return t;
}
const alreadyReceives = (el: DiagramElement, opts?: CanConnectOptions) =>
  !!opts?.connectors && messageTraffic(opts.connectors).receives.has(el.id);
const alreadySends = (el: DiagramElement, opts?: CanConnectOptions) =>
  !!opts?.connectors && messageTraffic(opts.connectors).sends.has(el.id);
const isEventSubprocess = (el: DiagramElement) =>
  el.type === "subprocess-expanded" && (el.properties?.subprocessType as string | undefined) === "event";
const isWhiteBoxPoolElement = (el: DiagramElement) =>
  el.type === "pool" && ((el.properties?.poolType as string | undefined) ?? "black-box") === "white-box";

const KIND_NOUNS: Record<string, string> = {
  gateway: "a gateway", lane: "a lane", sublane: "a sub-lane", "data-object": "a data object",
  "data-store": "a data store", "text-annotation": "a text annotation", "review-comment": "a review comment",
};
const kindOf = (el: DiagramElement) => KIND_NOUNS[el.type] ?? `a ${el.type.replace(/-/g, " ")}`;

/** How an element is named in a reason: its label, or what it is. */
export function messageEndName(el: DiagramElement): string {
  const l = (el.label ?? "").replace(/\s+/g, " ").trim();
  return l ? `“${l}”` : `the unnamed ${el.type.replace(/-/g, " ")}`;
}

/**
 * Inside a pool marked black-box. A black-box pool's contents are hidden — the
 * pool shape IS the participant, so the message goes to it (the drag
 * highlight's long-standing reading). Only an EXPLICIT black-box counts
 * (blackBoxPoolMenu's definition): a pool with no poolType is ambiguous, and
 * the reducer re-types every pool from its contents on the next edit anyway.
 */
function insideBlackBoxPool(el: DiagramElement, elements: DiagramElement[], opts?: CanConnectOptions): boolean {
  const pid = poolLookup(elements, opts)(el);
  if (!pid) return false;
  const pool = elements.find((e) => e.id === pid);
  return !!pool && isBlackBoxPool(pool);
}

/** What rules an element out as a message end in EITHER direction. */
function whyNeverAMessageEnd(el: DiagramElement, elements: DiagramElement[], opts?: CanConnectOptions): string | null {
  switch (el.type) {
    case "task":
    case "subprocess":
    case "subprocess-expanded":
      if (isEventSubprocess(el)) return "is an event subprocess — messages go to and from the elements inside it";
      if (el.properties?.isForCompensation === true) return "is a compensation activity — only its compensation association reaches it";
      break;
    case "pool":
      return isWhiteBoxPoolElement(el) ? "is a white-box pool — messages go to and from the elements inside it" : null;
    case "start-event":
    case "intermediate-event":
    case "end-event":
      break;
    default:
      return `is ${kindOf(el)} — only tasks, subprocesses, black-box pools and events exchange messages`;
  }
  return insideBlackBoxPool(el, elements, opts) ? "is inside a black-box pool — its contents are hidden; message the pool itself" : null;
}

/** A start event whose nearest Expanded Subprocess is an embedded (non-event)
 *  one: BPMN gives an embedded subprocess a None start, always. */
function startsEmbeddedSubprocess(el: DiagramElement, elements: DiagramElement[]): boolean {
  const scope = containerScopeOf(el, elements);
  if (!scope) return false;
  const ep = elements.find((e) => e.id === scope);
  return !!ep && !isEventSubprocess(ep);
}

/**
 * Why `el` can't SEND a message — a phrase that follows its name ("is a start
 * event — it can only receive a message") — or null when it can.
 */
export function whyCantSendMessage(el: DiagramElement, elements: DiagramElement[], opts?: CanConnectOptions): string | null {
  const never = whyNeverAMessageEnd(el, elements, opts);
  if (never) return never;
  switch (el.type) {
    case "start-event":
      return "is a start event — it can only receive a message";
    case "end-event":
      if (el.boundaryHostId) return "sits on its subprocess's edge — only a free-standing end event sends a message";
      return takesMessages(el) ? null : wrongTrigger(el);
    case "intermediate-event":
      if (el.boundaryHostId) return "is a boundary event — a boundary event only catches, it never sends";
      if (!takesMessages(el)) return wrongTrigger(el);
      if (isCatchingEvent(el)) return "catches a message — it can only receive one";
      if (!isThrowingEvent(el) && alreadyReceives(el, opts)) return "already receives a message, so it catches — it can't send one too";
      return null;
    default:
      return null;
  }
}

/**
 * Why `el` can't RECEIVE a message — a phrase that follows its name — or null
 * when it can.
 */
export function whyCantReceiveMessage(el: DiagramElement, elements: DiagramElement[], opts?: CanConnectOptions): string | null {
  const never = whyNeverAMessageEnd(el, elements, opts);
  if (never) return never;
  switch (el.type) {
    case "end-event":
      return "is an end event — it can only send a message";
    case "start-event":
      if (el.boundaryHostId) return "sits on its subprocess's edge — only a free-standing start event receives a message";
      if (startsEmbeddedSubprocess(el, elements)) return "starts an embedded subprocess — that always begins with a plain (None) start event";
      return takesMessages(el) ? null : wrongTrigger(el);
    case "intermediate-event":
      // The EMIE rule: a boundary event catches its host's internal trigger,
      // not an incoming message flow — unless its trigger IS Message.
      if (el.boundaryHostId) {
        return (el.eventType as string | undefined) === "message"
          ? null
          : "is a boundary event without a Message trigger — set its trigger to Message first";
      }
      if (!takesMessages(el)) return wrongTrigger(el);
      if (isThrowingEvent(el)) return "throws a message — it can only send one";
      if (!isCatchingEvent(el) && alreadySends(el, opts)) return "already sends a message, so it throws — it can't receive one too";
      return null;
    default:
      return null;
  }
}

/**
 * Why a message flow from `source` to `target` is refused — a sentence naming
 * the end at fault — or null when it is legal. The one message rule (see the
 * block comment above); canConnect's messageBPMN branch is exactly this.
 */
export function messageFlowRefusal(
  source: DiagramElement,
  target: DiagramElement,
  elements: DiagramElement[],
  opts?: CanConnectOptions,
): string | null {
  const s = whyCantSendMessage(source, elements, opts);
  if (s) return `${messageEndName(source)} ${s}`;
  const t = whyCantReceiveMessage(target, elements, opts);
  if (t) return `${messageEndName(target)} ${t}`;
  if (!sameMessageParticipant(source, target, elements, opts)) return null;
  return poolLookup(elements, opts)(source) === null
    ? `${messageEndName(source)} and ${messageEndName(target)} are both outside every pool — a message runs between two pools`
    : `${messageEndName(source)} and ${messageEndName(target)} are in the same pool — join them with a sequence flow, not a message`;
}

/**
 * The pair part of the rule on its own: are the two ends ONE participant (the
 * same pool, or both pool-less)? messageFlowRefusal is exactly "the source can
 * send, the target can receive, and this is false". Exported so the numbering,
 * which has already sorted the senders from the receivers, asks only this for
 * each pair rather than re-running both per-end checks (and building a refusal
 * sentence) for every one of them.
 */
export function sameMessageParticipant(
  source: DiagramElement,
  target: DiagramElement,
  elements: DiagramElement[],
  opts?: CanConnectOptions,
): boolean {
  const poolOf = poolLookup(elements, opts);
  return poolOf(source) === poolOf(target);
}

export function canConnect(
  source: DiagramElement,
  target: DiagramElement,
  connectorType: ConnectorType,
  elements: DiagramElement[],
  opts?: CanConnectOptions,
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

  if (connectorType === "messageBPMN" && messageFlowRefusal(source, target, elements, opts) !== null) return false;

  // ── BPMN sequence rules ──
  if (connectorType === "sequence") {
    // Compensation activity = association-only, never sequence.
    if (source.properties?.isForCompensation === true || target.properties?.isForCompensation === true) return false;

    // A sequence flow may never cross a POOL boundary — participants in
    // different pools communicate only via message flows. (Two pool-less
    // top-level elements both resolve to null → same "pool" → allowed.)
    const poolOf = poolLookup(elements, opts);
    if (poolOf(source) !== poolOf(target)) return false;

    const isEventExpandedSub = (el: DiagramElement) =>
      el.type === "subprocess-expanded" && (el.properties.subprocessType as string | undefined) === "event";

    // A non-boundary Start can never be a sequence target; a non-boundary End
    // can never be a sequence source.
    if (target.type === "start-event" && !target.boundaryHostId) return false;
    if (source.type === "end-event" && !source.boundaryHostId) return false;

    // An Event Expanded Subprocess is triggered by an event, never sequence flow.
    if (isEventExpandedSub(source) || isEventExpandedSub(target)) return false;

    // Scope model: a sequence flow may not cross an EP boundary (flowScopeOf).
    // A connection is legal iff the two effective scopes are equal.
    const sScope = flowScopeOf(source, "source", elements);
    const tScope = flowScopeOf(target, "target", elements);
    if (sScope === "illegal" || tScope === "illegal") return false;
    if (sScope !== tScope) return false;
  }

  return true;
}

/**
 * The innermost Expanded-Subprocess (EP) ancestor's id — the element's flow
 * "scope" — or null when it lives at the top level (walks past lanes/pools).
 */
export function containerScopeOf(el: DiagramElement | undefined, elements: DiagramElement[]): string | null {
  let cur = el;
  for (let i = 0; i < 20 && cur; i++) {
    if (!cur.parentId) return null;
    const parentId: string = cur.parentId;
    const parent = elements.find((e) => e.id === parentId);
    if (!parent) return null;
    if (parent.type === "subprocess-expanded") return parent.id;
    cur = parent;
  }
  return null;
}

/**
 * An endpoint's "flow scope" — the EP its sequence flow participates in.
 * Normally its container's, but an edge-mounted event redefines it:
 *   • edge Start on X — source: flows INTO X (scope = X); target: an external
 *     trigger reached from OUTSIDE X (scope = the scope containing X).
 *   • edge End on X — target: X's exit, reachable only from INSIDE X (scope =
 *     X); source: illegal (an End has no outgoing flow).
 *   • edge (boundary) Intermediate on X (an EMIE) — source: its outgoing flow
 *     continues in X's OUTER scope; target: illegal (an EMIE is TRIGGERED by
 *     its boundary, it has no incoming sequence flow).
 *
 * Exported so that the reducer and the follow-on placement (where a step added
 * after a boundary event lives — assistPlacement.followOnParentId) ask this
 * rule instead of restating it.
 */
export function flowScopeOf(
  el: DiagramElement,
  role: "source" | "target",
  elements: DiagramElement[],
): string | null | "illegal" {
  if (el.boundaryHostId) {
    const hostId = el.boundaryHostId;
    const host = elements.find((e) => e.id === hostId);
    const outer = host ? containerScopeOf(host, elements) : null;
    if (el.type === "start-event") return role === "source" ? hostId : outer;
    if (el.type === "end-event") return role === "source" ? "illegal" : hostId;
    return role === "target" ? "illegal" : outer; // boundary intermediate (EMIE): outgoing only
  }
  return containerScopeOf(el, elements);
}

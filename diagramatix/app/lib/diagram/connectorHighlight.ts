/**
 * Pure, testable business rules for the connector drop-target HIGHLIGHT — the
 * green / blue / purple / dark-yellow rings the canvas draws on candidate
 * elements while a connector is being dragged from a source.
 *
 * Canvas.tsx renders drop targets in several independent passes (plain
 * elements, expanded subprocesses, boundary events, …). To stop those passes
 * drifting apart (the EP-boundary regression), the rules live here and every
 * pass consumes them:
 *   • `computeDragContext(source)` classifies the SOURCE once (is it an
 *     edge-mounted start? a compensation event? inside an Event subprocess? …).
 *   • `isSequenceHighlightTarget(source, target)` is the single authority for
 *     the green SEQUENCE highlight — a faithful delegate to `canConnect`, the
 *     same predicate `ADD_CONNECTOR` enforces on commit.
 *   • `isMessageHighlightTarget(source, target)` is the single authority for
 *     the blue MESSAGE highlight (BPMN only): the message rule in canConnect.ts,
 *     which the drop, the reducer and voice's "add a message" numbers also ask.
 *     No branch below computes blue.
 *
 * These are covered by tests/diagram/connector-highlight.test.ts.
 */
import type { DiagramElement, Connector, DiagramType } from "./types";
import { canConnect, type CanConnectOptions } from "./canConnect";
import { getElementPoolId } from "./poolUtil";
import { isThrowingEvent } from "./eventDirection";

export { getElementPoolId };

const DATA_ELEMENT_TYPES = new Set<string>(["data-object", "data-store", "text-annotation"]);
const CHILD_EVENT_TYPES_HIGHLIGHT = new Set<string>(["start-event", "intermediate-event", "end-event"]);

/**
 * The SOURCE end of a connector drag, classified into the flags the highlight
 * passes branch on. A verbatim extraction of the `draggingFrom*` consts that
 * used to live inline in Canvas.tsx.
 */
export interface DragContext {
  sourcePoolId: string | null;
  sourceIsData: boolean;
  sourceBoundaryHostId: string | null;
  sourceParentId: string | null;
  sourceAncestorIds: Set<string>;
  sourceHostParentId: string | null;
  fromPool: boolean;
  fromFreeEndEvent: boolean;
  fromEdgeMountedEndEvent: boolean;
  fromEdgeMountedStartEvent: boolean;
  fromEdgeMountedIntermediateSendEvent: boolean;
  fromEdgeMountedIntermediateReceiveEvent: boolean;
  fromEdgeMountedIntermediateEvent: boolean;
  fromEdgeMountedCompensationEvent: boolean;
  compEventAlreadyLinked: boolean;
  compTargetsAvailable: boolean;
  fromFinalState: boolean;
  fromEventSubprocess: boolean;
  fromInsideEventSubprocess: boolean;
  fromChildEvent: boolean;
  fromBoundaryOnChild: boolean;
}

/**
 * Classify a drag SOURCE. `sourceId` is the id being dragged from (used to
 * detect a compensation event that is already linked). Pure — no React, no
 * canvas geometry.
 */
export function computeDragContext(
  source: DiagramElement | null,
  elements: DiagramElement[],
  connectors: Connector[],
  sourceId?: string,
): DragContext {
  const empty: DragContext = {
    sourcePoolId: null, sourceIsData: false, sourceBoundaryHostId: null, sourceParentId: null,
    sourceAncestorIds: new Set(), sourceHostParentId: null,
    fromPool: false, fromFreeEndEvent: false, fromEdgeMountedEndEvent: false,
    fromEdgeMountedStartEvent: false, fromEdgeMountedIntermediateSendEvent: false,
    fromEdgeMountedIntermediateReceiveEvent: false, fromEdgeMountedIntermediateEvent: false,
    fromEdgeMountedCompensationEvent: false, compEventAlreadyLinked: false, compTargetsAvailable: false,
    fromFinalState: false, fromEventSubprocess: false, fromInsideEventSubprocess: false,
    fromChildEvent: false, fromBoundaryOnChild: false,
  };
  if (!source) return empty;

  const sourcePoolId = getElementPoolId(source, elements);
  const sourceIsData = DATA_ELEMENT_TYPES.has(source.type);
  const fromPool = source.type === "pool";
  const fromFreeEndEvent = source.type === "end-event" && !source.boundaryHostId;
  const fromEdgeMountedEndEvent = source.type === "end-event" && !!source.boundaryHostId;
  const fromEdgeMountedStartEvent = source.type === "start-event" && !!source.boundaryHostId;
  const fromEdgeMountedIntermediateSendEvent =
    source.type === "intermediate-event" && !!source.boundaryHostId && isThrowingEvent(source);
  const fromEdgeMountedIntermediateReceiveEvent =
    source.type === "intermediate-event" && !!source.boundaryHostId && source.flowType === "catching";
  const fromEdgeMountedIntermediateEvent =
    fromEdgeMountedIntermediateSendEvent || fromEdgeMountedIntermediateReceiveEvent;
  const fromEdgeMountedCompensationEvent =
    source.type === "intermediate-event" && !!source.boundaryHostId && source.eventType === "compensation";
  const compEventAlreadyLinked =
    fromEdgeMountedCompensationEvent && !!sourceId &&
    connectors.some((c) => c.type === "associationBPMN" && c.sourceId === sourceId);
  const compTargetsAvailable = fromEdgeMountedCompensationEvent && !compEventAlreadyLinked;
  const fromFinalState = source.type === "final-state";
  const fromEventSubprocess = source.type === "subprocess-expanded" &&
    (source.properties.subprocessType as string | undefined) === "event";
  const fromInsideEventSubprocess = (() => {
    if (!source.parentId) return false;
    const p = elements.find((e) => e.id === source.parentId);
    return p?.type === "subprocess-expanded" && (p.properties.subprocessType as string | undefined) === "event";
  })();
  const sourceAncestorIds = (() => {
    const ids = new Set<string>();
    let cur: DiagramElement | undefined = source;
    const visited = new Set<string>();
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      const nextId: string | undefined = cur.boundaryHostId ?? cur.parentId;
      if (nextId) { ids.add(nextId); cur = elements.find((e) => e.id === nextId); }
      else break;
    }
    return ids;
  })();
  const fromChildEvent =
    CHILD_EVENT_TYPES_HIGHLIGHT.has(source.type) && !source.boundaryHostId && !!source.parentId;
  const fromBoundaryOnChild =
    CHILD_EVENT_TYPES_HIGHLIGHT.has(source.type) && !!source.boundaryHostId &&
    elements.some((e) => e.id === source.boundaryHostId && !!e.parentId);
  const sourceHostParentId = fromBoundaryOnChild
    ? elements.find((e) => e.id === source.boundaryHostId)?.parentId ?? null
    : null;

  return {
    sourcePoolId, sourceIsData, sourceBoundaryHostId: source.boundaryHostId ?? null,
    sourceParentId: source.parentId ?? null, sourceAncestorIds, sourceHostParentId,
    fromPool, fromFreeEndEvent, fromEdgeMountedEndEvent, fromEdgeMountedStartEvent,
    fromEdgeMountedIntermediateSendEvent, fromEdgeMountedIntermediateReceiveEvent,
    fromEdgeMountedIntermediateEvent, fromEdgeMountedCompensationEvent, compEventAlreadyLinked,
    compTargetsAvailable, fromFinalState, fromEventSubprocess, fromInsideEventSubprocess,
    fromChildEvent, fromBoundaryOnChild,
  };
}

/**
 * The SINGLE authority for the green SEQUENCE-flow highlight. An element is a
 * valid green target only when `canConnect` (the predicate `ADD_CONNECTOR`
 * enforces on commit) accepts a sequence flow to it. Every canvas render pass
 * calls this, so the highlight can never diverge from what a drop will accept.
 *
 * A no-op (always true) for non-BPMN diagrams — transition / flow / flowline
 * connectors carry their own, separate rules elsewhere.
 */
export function isSequenceHighlightTarget(
  source: DiagramElement,
  target: DiagramElement,
  elements: DiagramElement[],
  diagramType: DiagramType,
  opts?: CanConnectOptions,
): boolean {
  if (diagramType !== "bpmn") return true;
  return canConnect(source, target, "sequence", elements, opts);
}

/**
 * The SINGLE authority for the blue MESSAGE highlight on a BPMN diagram: the
 * message rule canConnect enforces (messageFlowRefusal), so a ring is blue
 * exactly when a drop there would draw a message — and exactly when voice's
 * "add a message" would number the pair.
 *
 * A review comment is excluded here, not in the rule: canConnect says yes to
 * any pair with one (the reducer turns it into a review link, which is never
 * a message), so without this every element would light blue from one.
 * Pass the diagram's connectors in `opts`: an event with no Flow Type that
 * already has a message faces that way, and lights only that way.
 */
export function isMessageHighlightTarget(
  source: DiagramElement,
  target: DiagramElement,
  elements: DiagramElement[],
  opts?: CanConnectOptions,
): boolean {
  if (source.type === "review-comment" || target.type === "review-comment") return false;
  return canConnect(source, target, "messageBPMN", elements, opts);
}

// ───────────────────────────────────────────────────────────────────────────
// Full drop-target classification for a NEW connector drag.
// A verbatim port of the per-branch logic that used to live inline in the
// canvas render passes (non-containers, boundary events, expanded subprocesses,
// and pool/composite container targets). Endpoint-RECONNECTION drags (moving an
// existing message/association end) are a SEPARATE mode, still handled inline in
// Canvas.tsx and NOT covered here.
// ───────────────────────────────────────────────────────────────────────────

const BPMN_TRIGGER_TYPES = new Set<string>(["task", "subprocess", "subprocess-expanded", "intermediate-event", "end-event", "pool"]);
const COMP_ACTIVITY_TYPES = new Set<string>(["task", "subprocess", "subprocess-expanded"]);
// Container element types that are never a new-connector drop target.
const NON_TARGET_TYPES = new Set<string>(["lane", "group", "system-boundary", "process-group", "uml-package", "review-comment"]);

/** The four connector-highlight colours a candidate target can receive. */
export interface TargetHighlight {
  sequence: boolean;     // green  — sequence / flow / flowline / transition
  message: boolean;      // blue   — messageBPMN
  association: boolean;  // purple — associationBPMN
  compensation: boolean; // dark-yellow — compensation association (Activity)
}

const NO_HIGHLIGHT: TargetHighlight = { sequence: false, message: false, association: false, compensation: false };

function isValidContextFlowPair(sourceType: string, targetType: string): boolean {
  if (sourceType === "external-entity") return targetType === "process-system";
  if (sourceType === "process-system") return targetType === "external-entity";
  return false;
}

/**
 * Classify one candidate `target` for a NEW connector drag from `source`.
 * `ctx` must be `computeDragContext(source, …)`. Returns which highlight (if
 * any) the element should receive. Pure.
 */
export function classifyDragTarget(
  source: DiagramElement | null,
  target: DiagramElement,
  ctx: DragContext,
  elements: DiagramElement[],
  connectors: Connector[],
  diagramType: DiagramType,
  opts?: { isSelfLoopTarget?: boolean; poolIdOf?: (el: DiagramElement) => string | null },
): TargetHighlight {
  if (!source) return NO_HIGHLIGHT;
  // Pool lookup: caller may pass a precomputed resolver so the per-element pool
  // id is O(1) instead of getElementPoolId's O(n) walk on every drag frame
  // (CANVAS-06). Falls back to the direct lookup.
  const poolOf = opts?.poolIdOf ?? ((el: DiagramElement) => getElementPoolId(el, elements));
  // Universal gates (shared by every pass).
  if (target.id === source.id && !opts?.isSelfLoopTarget) return NO_HIGHLIGHT;
  if (ctx.fromFinalState) return NO_HIGHLIGHT;
  if (target.type === "initial-state") return NO_HIGHLIGHT;
  // Dragging from an EP never highlights its OWN contents / boundary events.
  if (source.type === "subprocess-expanded" &&
      (target.parentId === source.id || target.boundaryHostId === source.id)) return NO_HIGHLIGHT;

  const isBpmnSource = BPMN_TRIGGER_TYPES.has(source.type);
  let out: TargetHighlight;

  // The branches decide green, purple and dark-yellow. Blue is not theirs: it
  // is set once, below, from the message rule.
  if (target.type === "pool") {
    out = NO_HIGHLIGHT; // a pool takes nothing but a message
  } else if (target.type === "composite-state") {
    out = { ...NO_HIGHLIGHT, sequence: !ctx.sourceIsData && source.parentId !== target.id };
  } else if (NON_TARGET_TYPES.has(target.type)) {
    out = NO_HIGHLIGHT;
  } else if (target.type === "subprocess-expanded") {
    out = classifyEpTarget(target, ctx);
  } else if (target.boundaryHostId) {
    out = classifyBoundaryTarget(source, target, ctx, elements, isBpmnSource, poolOf);
  } else {
    out = classifyPlainTarget(source, target, ctx, diagramType, isBpmnSource, poolOf);
  }

  // Single authority for the green highlight: canConnect (BPMN) — see
  // isSequenceHighlightTarget. Subsumes the old event-subprocess / non-boundary
  // -start / compensation-activity gates, so they need not be duplicated here.
  if (out.sequence && !isSequenceHighlightTarget(source, target, elements, diagramType, { poolIdOf: poolOf })) {
    out = { ...out, sequence: false };
  }
  // Single authority for the blue highlight: the message rule itself, so blue
  // is exactly what a drop, the reducer and voice's "add a message" numbers
  // accept. Only a BPMN diagram has messages. No branch above computes blue: a
  // second copy of the message rule drifts (one lit a white-box pool blue that
  // no drop would take).
  const message = diagramType === "bpmn"
    && isMessageHighlightTarget(source, target, elements, { poolIdOf: poolOf, connectors });
  return message === out.message ? out : { ...out, message };
}

function classifyEpTarget(target: DiagramElement, ctx: DragContext): TargetHighlight {
  const isEventSub = (target.properties.subprocessType as string | undefined) === "event";
  // Edge-mounted start / intermediate sources are NOT excluded here — an EP can
  // be their valid target when it lives in the right scope (a host child for an
  // edge-start, an outer sibling for an EMIE). canConnect (the sequence gate)
  // makes the exact scope decision; this only withholds the cases it can't judge.
  const sequence = !ctx.sourceIsData && !isEventSub && !ctx.fromEventSubprocess && !ctx.fromInsideEventSubprocess
    && !ctx.fromEdgeMountedCompensationEvent && target.id !== ctx.sourceParentId;
  const association = ctx.sourceIsData;
  const compensation = ctx.compTargetsAvailable && !isEventSub && target.id !== ctx.sourceBoundaryHostId;
  return { sequence, message: false, association, compensation };
}

function classifyBoundaryTarget(
  source: DiagramElement, target: DiagramElement, ctx: DragContext,
  elements: DiagramElement[], isBpmnSource: boolean,
  poolIdOf: (el: DiagramElement) => string | null,
): TargetHighlight {
  let sequence = false, association = false;
  const poolOf = poolIdOf(target);
  const host = elements.find((e) => e.id === target.boundaryHostId);

  if (ctx.fromPool) {
    /* a pool sends only messages — blue is the message rule's */
  } else if ((ctx.fromChildEvent || ctx.fromBoundaryOnChild) && target.boundaryHostId && ctx.sourceAncestorIds.has(target.boundaryHostId)) {
    association = true; // purple — associationBPMN to a boundary event on an ancestor
  } else if (ctx.sourceIsData) {
    association = true;
  } else if (ctx.fromFreeEndEvent) {
    /* a free end event has no outgoing sequence — blue is the message rule's */
  } else if (ctx.fromEdgeMountedEndEvent) {
    if (poolOf === ctx.sourcePoolId && host?.parentId !== ctx.sourceBoundaryHostId) sequence = true;
  } else if (ctx.fromEdgeMountedStartEvent) {
    /* boundary events are not inside the subprocess → not targets */
  } else if (ctx.fromEdgeMountedIntermediateSendEvent) {
    if (target.boundaryHostId !== ctx.sourceBoundaryHostId && (!host || host.parentId !== ctx.sourceBoundaryHostId)) {
      if (poolOf === ctx.sourcePoolId) sequence = true;
    }
  } else if (ctx.fromEdgeMountedIntermediateReceiveEvent) {
    /* not a valid target for receive events */
  } else if (!isBpmnSource || !ctx.sourcePoolId) {
    sequence = true;
  } else {
    if (poolOf === ctx.sourcePoolId) sequence = true;
  }
  return { sequence, message: false, association, compensation: false };
}

function classifyPlainTarget(
  source: DiagramElement, target: DiagramElement, ctx: DragContext,
  diagramType: DiagramType, isBpmnSource: boolean,
  poolIdOf: (el: DiagramElement) => string | null,
): TargetHighlight {
  let sequence = false, association = false, compensation = false;
  const elIsData = DATA_ELEMENT_TYPES.has(target.type);
  const poolOf = poolIdOf(target);

  if (ctx.fromEdgeMountedCompensationEvent) {
    if (ctx.compTargetsAvailable && COMP_ACTIVITY_TYPES.has(target.type) && target.id !== ctx.sourceBoundaryHostId) compensation = true;
  } else if (ctx.fromPool) {
    /* a pool sends only messages — blue is the message rule's */
  } else if (ctx.sourceIsData && !elIsData) {
    association = true;
  } else if (ctx.sourceIsData && elIsData) {
    /* data → data is not a legal connector — no highlight */
  } else if (!ctx.sourceIsData && elIsData) {
    association = true;
  } else if (ctx.fromBoundaryOnChild) {
    if (CHILD_EVENT_TYPES_HIGHLIGHT.has(target.type) && !target.boundaryHostId && target.parentId === ctx.sourceHostParentId) {
      sequence = true; association = true; // dual highlight
    } else if (poolOf === ctx.sourcePoolId || !poolOf) {
      sequence = true;
    }
  } else if (ctx.fromFreeEndEvent) {
    /* a free end event has no outgoing sequence — blue is the message rule's */
  } else if (ctx.fromEdgeMountedEndEvent) {
    if ((poolOf === ctx.sourcePoolId || !poolOf) && target.parentId !== ctx.sourceBoundaryHostId) sequence = true;
  } else if (ctx.fromEdgeMountedStartEvent) {
    if (target.parentId === ctx.sourceBoundaryHostId) sequence = true;
  } else if (ctx.fromEdgeMountedIntermediateSendEvent || ctx.fromEdgeMountedIntermediateReceiveEvent) {
    // An EMIE is catch-only; its outgoing sequence continues in the OUTER scope
    // (the exception/continuation path beside the host), NOT into the host's
    // interior — so it targets anything EXCEPT its host activity's own children.
    // canConnect narrows this to the exact outer-scope match.
    if (target.parentId !== ctx.sourceBoundaryHostId) {
      if (poolOf === ctx.sourcePoolId || !poolOf) sequence = true;
    }
  } else if (isBpmnSource && !ctx.sourcePoolId) {
    // Floating BPMN source = the invisible white-box participant. Staying
    // within the invisible pool is a sequence (canConnect-gated); crossing to a
    // named pool is a message (the message rule's blue).
    if (poolOf === null) sequence = true;
  } else if (!isBpmnSource || !ctx.sourcePoolId) {
    sequence = (diagramType === "context" || diagramType === "basic")
      ? isValidContextFlowPair(source.type, target.type)
      : true;
  } else {
    if (poolOf === ctx.sourcePoolId) sequence = true;
  }
  return { sequence, message: false, association, compensation };
}

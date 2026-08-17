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
 *
 * These are covered by tests/diagram/connector-highlight.test.ts.
 */
import type { DiagramElement, Connector, DiagramType } from "./types";
import { canConnect } from "./canConnect";
import { getElementPoolId } from "./poolUtil";

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
    source.type === "intermediate-event" && !!source.boundaryHostId &&
    (source.flowType === "throwing" || (source.flowType == null && source.taskType === "send"));
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
): boolean {
  if (diagramType !== "bpmn") return true;
  return canConnect(source, target, "sequence", elements);
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

const isWhiteBoxPool = (poolId: string | null, elements: DiagramElement[]): boolean => {
  if (!poolId) return false;
  const p = elements.find((e) => e.id === poolId);
  return ((p?.properties.poolType as string | undefined) ?? "black-box") === "white-box";
};

// A pool-less element behaves as if wrapped in one shared implicit pool: the
// "invisible unnamed pool" (poolId === null). It is a real WHITE-BOX participant
// — its contents are visible and message-targetable, distinct from any named
// pool. So a message may target a named white-box pool's contents OR any
// pool-less (invisible-pool) element; a named BLACK-box pool's contents stay
// hidden (message its pool shape instead).
const isVisibleParticipant = (poolId: string | null, elements: DiagramElement[]): boolean =>
  poolId === null || isWhiteBoxPool(poolId, elements);

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
  opts?: { isSelfLoopTarget?: boolean },
): TargetHighlight {
  if (!source) return NO_HIGHLIGHT;
  // Universal gates (shared by every pass).
  if (target.id === source.id && !opts?.isSelfLoopTarget) return NO_HIGHLIGHT;
  if (ctx.fromFinalState) return NO_HIGHLIGHT;
  if (target.type === "initial-state") return NO_HIGHLIGHT;
  // Dragging from an EP never highlights its OWN contents / boundary events.
  if (source.type === "subprocess-expanded" &&
      (target.parentId === source.id || target.boundaryHostId === source.id)) return NO_HIGHLIGHT;

  const isBpmnSource = BPMN_TRIGGER_TYPES.has(source.type);
  let out: TargetHighlight;

  if (target.type === "pool") {
    out = classifyPoolTarget(target, ctx, isBpmnSource);
  } else if (target.type === "composite-state") {
    out = { ...NO_HIGHLIGHT, sequence: !ctx.sourceIsData && source.parentId !== target.id };
  } else if (NON_TARGET_TYPES.has(target.type)) {
    out = NO_HIGHLIGHT;
  } else if (target.type === "subprocess-expanded") {
    out = classifyEpTarget(target, ctx);
    // An EP (subprocess) is also a valid messageBPMN target across pools, exactly
    // like a task — reuse the plain-target message logic (blue). Its sequence /
    // association / compensation come from classifyEpTarget above.
    const msg = classifyPlainTarget(source, target, ctx, elements, connectors, diagramType, isBpmnSource).message;
    if (msg) out = { ...out, message: true };
  } else if (target.boundaryHostId) {
    out = classifyBoundaryTarget(source, target, ctx, elements, connectors, isBpmnSource);
  } else {
    out = classifyPlainTarget(source, target, ctx, elements, connectors, diagramType, isBpmnSource);
  }

  // Single authority for the green highlight: canConnect (BPMN) — see
  // isSequenceHighlightTarget. Subsumes the old event-subprocess / non-boundary
  // -start / compensation-activity gates, so they need not be duplicated here.
  if (out.sequence && !isSequenceHighlightTarget(source, target, elements, diagramType)) {
    out = { ...out, sequence: false };
  }
  return out;
}

function classifyPoolTarget(target: DiagramElement, ctx: DragContext, isBpmnSource: boolean): TargetHighlight {
  const poolType = (target.properties.poolType as string | undefined) ?? "black-box";
  const message = isBpmnSource && target.id !== ctx.sourcePoolId && poolType === "black-box"
    && !ctx.fromEdgeMountedEndEvent && !ctx.fromEdgeMountedStartEvent && !ctx.fromEdgeMountedIntermediateReceiveEvent;
  return { ...NO_HIGHLIGHT, message };
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
  elements: DiagramElement[], connectors: Connector[], isBpmnSource: boolean,
): TargetHighlight {
  let sequence = false, message = false, association = false;
  const bEvtIsSendLocked = (target.flowType === "throwing" || target.taskType === "send")
    && connectors.some((c) => c.type === "messageBPMN" && c.sourceId === target.id);
  const poolOf = getElementPoolId(target, elements);
  const host = elements.find((e) => e.id === target.boundaryHostId);
  // An edge-mounted (boundary) intermediate event catches an internal trigger,
  // not an incoming message flow — it is a messageBPMN target ONLY when its
  // trigger is Message (canConnect enforces the same on commit).
  const targetCanReceiveMsg = target.type === "intermediate-event"
    && (target.eventType as string | undefined) === "message";

  if (ctx.fromPool) {
    if (poolOf && poolOf !== ctx.sourcePoolId && targetCanReceiveMsg && !bEvtIsSendLocked && isWhiteBoxPool(poolOf, elements)) message = true;
  } else if ((ctx.fromChildEvent || ctx.fromBoundaryOnChild) && target.boundaryHostId && ctx.sourceAncestorIds.has(target.boundaryHostId)) {
    association = true; // purple — associationBPMN to a boundary event on an ancestor
  } else if (ctx.sourceIsData) {
    association = true;
  } else if (ctx.fromFreeEndEvent) {
    if (poolOf && targetCanReceiveMsg && !bEvtIsSendLocked && isWhiteBoxPool(poolOf, elements)) message = true;
  } else if (ctx.fromEdgeMountedEndEvent) {
    if (poolOf === ctx.sourcePoolId && host?.parentId !== ctx.sourceBoundaryHostId) sequence = true;
  } else if (ctx.fromEdgeMountedStartEvent) {
    /* boundary events are not inside the subprocess → not targets */
  } else if (ctx.fromEdgeMountedIntermediateSendEvent) {
    if (target.boundaryHostId !== ctx.sourceBoundaryHostId && (!host || host.parentId !== ctx.sourceBoundaryHostId)) {
      if (poolOf === ctx.sourcePoolId) sequence = true;
      else if (poolOf && poolOf !== ctx.sourcePoolId && targetCanReceiveMsg && !bEvtIsSendLocked && isWhiteBoxPool(poolOf, elements)) message = true;
    }
  } else if (ctx.fromEdgeMountedIntermediateReceiveEvent) {
    /* not a valid target for receive events */
  } else if (!isBpmnSource || !ctx.sourcePoolId) {
    sequence = true;
  } else {
    if (poolOf === ctx.sourcePoolId) sequence = true;
    else if (poolOf && poolOf !== ctx.sourcePoolId && targetCanReceiveMsg && !bEvtIsSendLocked && isWhiteBoxPool(poolOf, elements)) message = true;
  }
  return { sequence, message, association, compensation: false };
}

function classifyPlainTarget(
  source: DiagramElement, target: DiagramElement, ctx: DragContext,
  elements: DiagramElement[], connectors: Connector[], diagramType: DiagramType, isBpmnSource: boolean,
): TargetHighlight {
  let sequence = false, message = false, association = false, compensation = false;
  const elIsData = DATA_ELEMENT_TYPES.has(target.type);
  const elIsSendLocked = target.type === "end-event"
    || ((target.taskType === "send" || target.flowType === "throwing")
        && connectors.some((c) => c.type === "messageBPMN" && c.sourceId === target.id));
  const poolOf = getElementPoolId(target, elements);

  if (ctx.fromEdgeMountedCompensationEvent) {
    if (ctx.compTargetsAvailable && COMP_ACTIVITY_TYPES.has(target.type) && target.id !== ctx.sourceBoundaryHostId) compensation = true;
  } else if (ctx.fromPool) {
    if (!elIsData && !elIsSendLocked && poolOf !== ctx.sourcePoolId && isVisibleParticipant(poolOf, elements)) message = true;
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
    if (!elIsData && !elIsSendLocked && poolOf && isWhiteBoxPool(poolOf, elements)) message = true;
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
      if (poolOf === ctx.sourcePoolId) sequence = true;
      else if (poolOf && poolOf !== ctx.sourcePoolId && !elIsData && !elIsSendLocked && isWhiteBoxPool(poolOf, elements)) message = true;
      else if (!poolOf) sequence = true;
    }
  } else if (isBpmnSource && !ctx.sourcePoolId) {
    // Floating BPMN source = the invisible white-box participant. Crossing to a
    // NAMED pool's visible contents is a message; staying within the invisible
    // pool is a sequence (canConnect-gated).
    if (poolOf !== null) {
      if (!elIsData && !elIsSendLocked && isWhiteBoxPool(poolOf, elements)) message = true;
    } else {
      sequence = true;
    }
  } else if (!isBpmnSource || !ctx.sourcePoolId) {
    sequence = (diagramType === "context" || diagramType === "basic")
      ? isValidContextFlowPair(source.type, target.type)
      : true;
  } else {
    if (poolOf === ctx.sourcePoolId) sequence = true;
    else if (!elIsData && !elIsSendLocked && isVisibleParticipant(poolOf, elements)) message = true;
  }
  return { sequence, message, association, compensation };
}

/**
 * The right-click "element matrix" — the grid of shapes offered when you
 * right-click empty canvas, or the BODY of a pool or lane.
 *
 * Paul, 2026-09-19: "The right-click menu should show the element matrix when
 * clicked in the body of the pool or lane. The right-click menu element matrix
 * should include the Pool/Lane after the Gateway, and the Pain Point, Issue,
 * and Review Comment at the end."
 *
 * The order is his, and is the point of this module: a list spelled out inline
 * in a 9,000-line component is a list nothing can check.
 *
 * Pure.
 */
import type { DiagramType, SymbolType } from "./types";

const BPMN_QUICK_ADD: SymbolType[] = [
  "start-event", "intermediate-event", "end-event",
  // Pool/Lane sits after the Gateway. It is ONE entry because the symbol reads
  // where it lands: empty space makes a pool, an existing pool makes a lane.
  "task", "subprocess", "subprocess-expanded", "gateway", "pool",
  "data-object", "data-store", "text-annotation", "group",
  // The three markers, last.
  "uml-pain-point", "uml-issue", "review-comment",
];

const SM_QUICK_ADD: SymbolType[] = [
  "state", "submachine", "initial-state", "final-state", "composite-state", "gateway", "fork-join",
];

const VC_QUICK_ADD: SymbolType[] = [
  "chevron", "chevron-collapsed", "process-group",
];

/** A Review Comment is stamped with its author and the time, so it can only be
 *  offered where the editor has given the canvas a way to build one. */
export const REVIEW_COMMENT: SymbolType = "review-comment";

export interface QuickAddOpts {
  /** Is the editor able to create a Review Comment on this diagram? */
  canAddReviewComment?: boolean;
}

export function quickAddSymbols(diagramType: DiagramType, opts: QuickAddOpts = {}): SymbolType[] {
  const list = diagramType === "state-machine" ? SM_QUICK_ADD
    : diagramType === "value-chain" ? VC_QUICK_ADD
    : BPMN_QUICK_ADD;
  return opts.canAddReviewComment ? list : list.filter((s) => s !== REVIEW_COMMENT);
}

export const QUICK_ADD_LABELS: Record<string, string> = {
  "start-event": "Start",
  "task": "Task",
  "subprocess": "Sub-Process",
  "subprocess-expanded": "Expanded",
  "intermediate-event": "Intermediate",
  "end-event": "End",
  "data-object": "Data Object",
  "data-store": "Data Store",
  "text-annotation": "Annotation",
  "group": "Group",
  "state": "State",
  "initial-state": "Initial",
  "final-state": "Final",
  "composite-state": "Composite",
  "gateway": "Gateway",
  "fork-join": "Fork/Join",
  "submachine": "SubMachine",
  "chevron": "Process",
  "chevron-collapsed": "Collapsed",
  "process-group": "Value Chain",
  "pool": "Pool/Lane",
  "uml-pain-point": "Pain Point",
  "uml-issue": "Issue",
  "review-comment": "Review Comment",
};

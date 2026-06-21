/**
 * Canonical Standard-Flowchart → BPMN mapping — the SINGLE source of truth for
 * BOTH consumers:
 *   1. the deterministic diagram translator (flowchartToBpmn.ts), which reads
 *      this table in code, and
 *   2. the AI image→BPMN path (app/lib/ai/planBpmn.ts), whose flowchart
 *      "TRANSLATE shapes" prompt line is GENERATED from this table via
 *      renderFlowchartMappingForPrompt().
 *
 * Edit the table once and both stay in sync — geometric/translation rules live
 * in code, not just in the prompt.
 */

import type { SymbolType, BpmnTaskType, GatewayType, EventType } from "../types";

/** How the translator treats the mapped node in the BPMN control-flow graph. */
export type BpmnKind =
  | "control"   // a real flow node: event / task / gateway / subprocess
  | "artifact"  // a data artifact: spliced out of the sequence, attached by association
  | "stub";     // a flow-continuation marker (on/off-page connector): spliced away

export interface FlowchartBpmnMapping {
  /** Source flowchart symbol type. */
  flowchart: SymbolType;
  /** Target BPMN element type. For terminators this is resolved to
   *  start-event / end-event by in/out degree at translate time. For stubs the
   *  value is unused (the node is removed). */
  bpmn: SymbolType;
  kind: BpmnKind;
  taskType?: BpmnTaskType;
  gatewayType?: GatewayType;
  eventType?: EventType;
  /** Terminator resolves to start-event (no inbound) or end-event (no outbound). */
  terminator?: boolean;
  /** BPMN type is an approximation worth flagging in the translation report. */
  approx?: boolean;
  /** Extra note surfaced in the translation report. */
  note?: string;
  /** Shape→BPMN phrase for the AI image prompt, e.g. 'Rectangle → "task"'.
   *  Stubs and duplicate phrases are de-duplicated by the renderer. */
  promptText: string;
}

/** The mapping table, keyed by flowchart SymbolType. */
export const FLOWCHART_TO_BPMN_MAP: Record<string, FlowchartBpmnMapping> = {
  "flowchart-terminator": {
    flowchart: "flowchart-terminator",
    bpmn: "start-event",
    kind: "control",
    terminator: true,
    promptText:
      'Oval / pill with no inbound arrow → "start-event"; oval / pill with no outbound arrow → "end-event"',
  },
  "flowchart-process": {
    flowchart: "flowchart-process",
    bpmn: "task",
    kind: "control",
    taskType: "none",
    promptText: 'Rectangle → "task"',
  },
  "flowchart-decision": {
    flowchart: "flowchart-decision",
    bpmn: "gateway",
    kind: "control",
    gatewayType: "exclusive",
    promptText:
      'Diamond with two outgoing branches → exclusive "gateway" (decision); diamond at the join → exclusive "gateway" (merge)',
  },
  "flowchart-merge": {
    flowchart: "flowchart-merge",
    bpmn: "gateway",
    kind: "control",
    gatewayType: "exclusive",
    promptText: 'Merge / junction symbol → exclusive "gateway"',
  },
  "flowchart-predefined": {
    flowchart: "flowchart-predefined",
    bpmn: "subprocess",
    kind: "control",
    promptText: 'Predefined process (double-barred rectangle) → "subprocess"',
  },
  "flowchart-preparation": {
    flowchart: "flowchart-preparation",
    bpmn: "task",
    kind: "control",
    taskType: "none",
    approx: true,
    note: "preparation approximated as a plain task",
    promptText: 'Preparation (hexagon) → "task"',
  },
  "flowchart-manual-input": {
    flowchart: "flowchart-manual-input",
    bpmn: "task",
    kind: "control",
    taskType: "user",
    promptText: 'Manual input → "task" (user)',
  },
  "flowchart-manual-op": {
    flowchart: "flowchart-manual-op",
    bpmn: "task",
    kind: "control",
    taskType: "manual",
    promptText: 'Manual operation (trapezoid) → "task" (manual)',
  },
  "flowchart-delay": {
    flowchart: "flowchart-delay",
    bpmn: "intermediate-event",
    kind: "control",
    eventType: "timer",
    promptText: 'Delay (D-shape) → timer "intermediate-event"',
  },
  "flowchart-io": {
    flowchart: "flowchart-io",
    bpmn: "data-object",
    kind: "artifact",
    promptText: 'Parallelogram (data input/output) → "data-object"',
  },
  "flowchart-document": {
    flowchart: "flowchart-document",
    bpmn: "data-object",
    kind: "artifact",
    promptText: 'Document → "data-object"',
  },
  "flowchart-multidoc": {
    flowchart: "flowchart-multidoc",
    bpmn: "data-object",
    kind: "artifact",
    note: "multiple-documents mapped to a single data-object (collection)",
    promptText: 'Multiple documents → "data-object"',
  },
  "flowchart-display": {
    flowchart: "flowchart-display",
    bpmn: "data-object",
    kind: "artifact",
    approx: true,
    note: "display approximated as a data-object",
    promptText: 'Display → "data-object"',
  },
  "flowchart-database": {
    flowchart: "flowchart-database",
    bpmn: "data-store",
    kind: "artifact",
    promptText: 'Database cylinder → "data-store"',
  },
  "flowchart-onpage": {
    flowchart: "flowchart-onpage",
    bpmn: "task", // unused — stubs are spliced out
    kind: "stub",
    promptText:
      "On-page / off-page connectors only continue the flow — follow them through and turn arrow / branch labels into sequence-flow labels",
  },
  "flowchart-offpage": {
    flowchart: "flowchart-offpage",
    bpmn: "task", // unused — stubs are spliced out
    kind: "stub",
    promptText:
      "On-page / off-page connectors only continue the flow — follow them through and turn arrow / branch labels into sequence-flow labels",
  },
  "flowchart-vswimlane": {
    flowchart: "flowchart-vswimlane",
    bpmn: "lane",
    kind: "control",
    promptText: 'Vertical swimlane columns → "lane"s inside a single white-box "pool"',
  },
};

/** Safe fallback for any unrecognised flowchart shape — a plain task. */
export const FALLBACK_MAPPING: FlowchartBpmnMapping = {
  flowchart: "flowchart-process",
  bpmn: "task",
  kind: "control",
  taskType: "none",
  approx: true,
  note: "unrecognised shape mapped to a plain task",
  promptText: 'Anything else → "task"',
};

/** Look up the mapping for a flowchart element type (falls back to a task). */
export function mapFlowchartType(type: string): FlowchartBpmnMapping {
  return FLOWCHART_TO_BPMN_MAP[type] ?? FALLBACK_MAPPING;
}

/**
 * Render the flowchart-translation guidance for the AI image→BPMN system
 * prompt. Returns the body of a single bullet (no leading "- "), generated from
 * the table so the prompt can never drift from the code translator. Duplicate
 * phrases (the shared on/off-page line) are emitted once, in table order.
 */
export function renderFlowchartMappingForPrompt(): string {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const m of Object.values(FLOWCHART_TO_BPMN_MAP)) {
    if (seen.has(m.promptText)) continue;
    seen.add(m.promptText);
    phrases.push(m.promptText);
  }
  return (
    "If the image is a non-BPMN flowchart: TRANSLATE shapes to BPMN. " +
    phrases.join(". ") +
    ". Read labels with OCR and keep arrow / branch labels as sequence-flow labels. " +
    "If no pools / lanes (swimlanes) are drawn, wrap everything in a single white-box pool named after the process."
  );
}

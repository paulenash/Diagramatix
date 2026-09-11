/**
 * Canonical EPC → BPMN mapping — the SINGLE source of truth for BOTH consumers:
 *   1. the deterministic diagram translator (epcToBpmn.ts), which reads this
 *      table in code, and
 *   2. the AI image→BPMN path (app/lib/ai/planBpmn.ts), whose EPC "TRANSLATE
 *      shapes" prompt line is GENERATED from this table via
 *      renderEpcMappingForPrompt().
 *
 * Edit the table once and both stay in sync — the same trick
 * flowchartBpmnMap.ts uses, and for the same reason: a translation rule that
 * exists twice drifts.
 *
 * **Why this table cannot be the whole story.** A flowchart shape maps to a
 * BPMN type on its own. An EPC EVENT does not: the same pink hexagon becomes a
 * start event, an end event, a label on a sequence flow, or nothing at all,
 * depending entirely on where it sits. So `kind` names which contextual rule
 * applies and the translator resolves it — the table stays the one place the
 * mapping is DECLARED, without pretending the decision is context-free.
 */

import type { SymbolType, BpmnTaskType, GatewayType } from "../types";

/** How the translator treats the mapped node. */
export type EpcBpmnKind =
  /** Function → task. The only EPC element that is unambiguously an activity. */
  | "activity"
  /** Event → resolved by position: start / end / branch label / dropped. */
  | "event"
  /** XOR / AND / OR → a gateway of the matching type. */
  | "gateway"
  /** Org unit or position → a lane. Derived from the model, never from geometry. */
  | "lane"
  /** Application system → a black-box IT system pool, per the house convention. */
  | "system-pool"
  /** Information object → data-object, spliced out and re-attached by association. */
  | "artifact"
  /** Process interface → a call activity: the chain continues in another EPC. */
  | "call";

export interface EpcBpmnMapping {
  /** Source EPC symbol type. */
  epc: SymbolType;
  /** Target BPMN element type. For `event` this is resolved at translate time. */
  bpmn: SymbolType;
  kind: EpcBpmnKind;
  taskType?: BpmnTaskType;
  gatewayType?: GatewayType;
  subprocessType?: string;
  /** BPMN type is an approximation worth flagging in the translation report. */
  approx?: boolean;
  /** Extra note surfaced in the translation report. */
  note?: string;
  /**
   * Prefix for the converted label, e.g. "KPI". BPMN has no KPI or Risk, so the
   * kind would be lost the moment the shape became a text annotation — the
   * prefix is what keeps "Order cycle time" from reading as a stray note.
   */
  labelPrefix?: string;
  /** Shape→BPMN phrase for the AI image prompt, e.g. 'Green rounded box → "task"'. */
  promptText: string;
}

export const EPC_TO_BPMN_MAP: Record<string, EpcBpmnMapping> = {
  "epc-function": {
    epc: "epc-function",
    bpmn: "task",
    kind: "activity",
    taskType: "none",
    promptText: 'Rounded rectangle, usually green (a function) → "task"',
  },
  "epc-event": {
    epc: "epc-event",
    bpmn: "start-event", // resolved to start / end / a flow label / dropped
    kind: "event",
    promptText:
      'Elongated hexagon, usually pink (an event) → "start-event" if nothing flows into it and "end-event" if nothing flows out; an event straight after a decision is a BRANCH CONDITION, so put its wording on the outgoing sequence flow instead of drawing a node; every other event is a state between two steps and is DROPPED',
  },
  "epc-xor": {
    epc: "epc-xor",
    bpmn: "gateway",
    kind: "gateway",
    gatewayType: "exclusive",
    promptText: 'Circle containing × → exclusive "gateway"',
  },
  "epc-and": {
    epc: "epc-and",
    bpmn: "gateway",
    kind: "gateway",
    gatewayType: "parallel",
    promptText: 'Circle containing ∧ → parallel "gateway"',
  },
  "epc-or": {
    epc: "epc-or",
    bpmn: "gateway",
    kind: "gateway",
    gatewayType: "inclusive",
    promptText: 'Circle containing ∨ → inclusive "gateway"',
  },
  "epc-org-unit": {
    epc: "epc-org-unit",
    bpmn: "lane",
    kind: "lane",
    promptText:
      'Box with a rounded left edge, usually yellow (an organisational unit) → a "lane"; put every function it is joined to in that lane',
  },
  "epc-position": {
    epc: "epc-position",
    bpmn: "lane",
    kind: "lane",
    promptText: 'The same box with a person glyph (a position / role) → also a "lane"',
  },
  "epc-data": {
    epc: "epc-data",
    bpmn: "data-object",
    kind: "artifact",
    promptText:
      'Box with a bar down its left edge (an information object) → "data-object", attached to its function by an association rather than sitting in the flow',
  },
  "epc-application": {
    epc: "epc-application",
    bpmn: "pool",
    kind: "system-pool",
    promptText:
      'Box with bars at both sides (an application system) → a black-box "pool" for that system, reached by a message flow. Never a data store: a system of record IS the black-box IT system pool',
  },
  "epc-interface": {
    epc: "epc-interface",
    bpmn: "subprocess",
    kind: "call",
    subprocessType: "call",
    note: "process interface mapped to a call activity",
    promptText: 'Chevron / arrow-shaped box (a process interface) → a call activity "subprocess"',
  },
};

/** Safe fallback for any unrecognised EPC shape — a plain task. */
// The descriptive objects. BPMN has no KPI, no Risk, no Objective — and
// inventing a task or a data object for one would put a thing in the process
// that is not a step in it. A text annotation is BPMN's own answer to "extra
// information about an activity", so that is what they become, each keeping its
// kind in the label and each reported as an approximation.
const ANNOTATION_MAPPINGS: Array<[SymbolType, string]> = [
  ["epc-kpi", "KPI"],
  ["epc-risk", "Risk"],
  ["epc-product", "Product"],
  ["epc-knowledge", "Knowledge"],
  ["epc-business-rule", "Rule"],
  ["epc-screen", "Screen"],
  ["epc-objective", "Objective"],
  ["epc-machine", "Resource"],
  ["epc-location", "Location"],
  ["epc-requirement", "Requirement"],
];
for (const [type, prefix] of ANNOTATION_MAPPINGS) {
  EPC_TO_BPMN_MAP[type] = {
    epc: type,
    bpmn: "text-annotation",
    kind: "artifact",
    approx: true,
    labelPrefix: prefix,
    note: `${prefix} kept as a text annotation — BPMN has no equivalent object`,
    promptText: `A box carrying a ${prefix.toLowerCase()} beside a function → "text-annotation" attached to that task, prefixed "${prefix}: "`,
  };
}

export const EPC_FALLBACK_MAPPING: EpcBpmnMapping = {
  epc: "epc-function",
  bpmn: "task",
  kind: "activity",
  taskType: "none",
  approx: true,
  note: "unrecognised shape mapped to a plain task",
  promptText: 'Anything else → "task"',
};

/** Look up the mapping for an EPC element type (falls back to a task). */
export function mapEpcToBpmnType(type: string): EpcBpmnMapping {
  return EPC_TO_BPMN_MAP[type] ?? EPC_FALLBACK_MAPPING;
}

/**
 * Render the EPC-translation guidance for the AI image→BPMN system prompt.
 * Returns the body of a single bullet (no leading "- "), generated from the
 * table so the prompt can never drift from the code translator.
 */
export function renderEpcMappingForPrompt(): string {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const m of Object.values(EPC_TO_BPMN_MAP)) {
    if (seen.has(m.promptText)) continue;
    seen.add(m.promptText);
    phrases.push(m.promptText);
  }
  return (
    "If the image is an EPC (event-driven process chain, the ARIS notation): TRANSLATE shapes to BPMN. " +
    phrases.join(". ") +
    ". An EPC alternates event and function, so a faithful copy would put a round shape between every two tasks — do not; " +
    "keep the first and last, turn the ones after a decision into flow labels, and drop the rest. " +
    "If the EPC names no organisational units, wrap everything in a single white-box pool named after the process."
  );
}

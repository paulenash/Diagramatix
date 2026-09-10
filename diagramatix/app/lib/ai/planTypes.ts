/**
 * Which diagram types generate through the two-phase PLAN flow, and what each
 * one needs from the panel.
 *
 * This exists because the two facts it holds were, until EPC, a pair of two-way
 * booleans in two different files:
 *
 *   DiagramEditor.tsx   const usesPlanPanel = type === "bpmn" || type === "flowchart";
 *   PlanPanel.tsx       const isFlowchart  = type === "flowchart";
 *
 * Two branches read as a choice. Three read as a list someone forgot to write
 * down — and the second of them is worse than it looks, because `isFlowchart`
 * was never really asking "is this a flowchart". It was asking "is this plan
 * flat?", and answering it by naming the only flat type there was. A third flat
 * type makes that name a lie at ten call sites at once.
 *
 * Adding a type here is the whole registration: the button appears, the panel
 * posts to the right endpoints, and the tabs match the plan's shape.
 */
import type { DiagramType } from "@/app/lib/diagram/types";

export interface PlanTypeConfig {
  /** Base path of the pair of routes: `${apiBase}/plan` and `${apiBase}/apply-layout`. */
  apiBase: string;
  /**
   * Is the plan BPMN-shaped — pools, lanes and containers?
   *
   * The structured Pools / Elements / Connectors tabs read that shape directly,
   * so a flat plan edits through the generic Raw JSON tab instead. This also
   * gates image-geometry capture, which only means anything when the plan can
   * carry per-element bounds.
   */
  structured: boolean;
  /** What this notation calls the things between its shapes, singular. It is not
   *  cosmetic: an EPC has ARCS of three different kinds and only one of them is
   *  sequence, so "connection" would be quietly wrong in the one place the count
   *  is reported back to the person who asked for the diagram. */
  connectorNoun: string;
}

/**
 * The registry. A type absent from here uses the one-shot AI panel instead —
 * that is the default, not a gap.
 */
export const PLAN_TYPES: Partial<Record<DiagramType, PlanTypeConfig>> = {
  bpmn: { apiBase: "/api/ai/bpmn", structured: true, connectorNoun: "connection" },
  flowchart: { apiBase: "/api/ai/flowchart", structured: false, connectorNoun: "flowline" },
  epc: { apiBase: "/api/ai/epc", structured: false, connectorNoun: "arc" },
};

/** Does this type generate through the two-phase Plan panel? */
export function usesPlanFlow(type: DiagramType | string | undefined): boolean {
  return !!type && type in PLAN_TYPES;
}

/** Config for a plan type, falling back to the BPMN pair for anything unknown. */
export function planTypeConfig(type: DiagramType | string | undefined): PlanTypeConfig {
  return (type ? PLAN_TYPES[type as DiagramType] : undefined) ?? PLAN_TYPES.bpmn!;
}

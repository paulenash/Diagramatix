/**
 * Phase 2 of a BPMN generation — a plan in, a laid-out diagram out: validate
 * with the shared Zod schema, normalise, run the deterministic layout engine.
 * No AI call. Used by POST /api/ai/bpmn/apply-layout (the desktop consoles) and
 * by the phone's server-side generate job, so both draw a plan the same way.
 */
import { layoutBpmnDiagram, type AiElement, type AiConnection, type LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";
import { validatePlan } from "@/app/lib/ai/planSchema";
import { normaliseAiPlan } from "@/app/lib/ai/planBpmn";
import type { DiagramData } from "@/app/lib/diagram/types";

export interface LayoutBpmnPlanOptions {
  promptLabel?: string;
  preservePositions?: boolean;
  imageAspect?: { w: number; h: number };
  mode?: "normal" | "test";
}

export type LayoutBpmnPlanResult =
  | { ok: true; diagramData: DiagramData; diagnostics: LayoutDiagnostic[]; elementCount: number; connectionCount: number }
  | { ok: false; issues: unknown };

/** Throws only if the layout engine itself throws; a plan that fails validation is `ok: false`. */
export function layoutBpmnPlan(plan: unknown, opts: LayoutBpmnPlanOptions = {}): LayoutBpmnPlanResult {
  const result = validatePlan(plan);
  if (!result.ok) return { ok: false, issues: result.issues };
  // Defence-in-depth: run the same normaliser the Sonnet path uses so any
  // camelCase-typed plan hand-edited in the JSON view still lays out correctly.
  const normalised = {
    elements: result.plan.elements as unknown as AiElement[],
    connections: result.plan.connections as unknown as AiConnection[],
  };
  normaliseAiPlan(normalised);
  // The layout reports what it could not take at face value, and every caller
  // must be able to surface it — this is the step that actually produces the
  // diagram, so it is where the damage would show.
  const diagnostics: LayoutDiagnostic[] = [];
  const diagramData = layoutBpmnDiagram(normalised.elements, normalised.connections, {
    promptLabel: opts.promptLabel,
    preservePositions: opts.preservePositions,
    imageAspect: opts.imageAspect,
    mode: opts.mode ?? "normal",
    onDiagnostic: (d) => diagnostics.push(d),
  });
  return {
    ok: true, diagramData, diagnostics,
    elementCount: normalised.elements.length,
    connectionCount: normalised.connections.length,
  };
}

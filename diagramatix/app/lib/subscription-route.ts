/**
 * Thin Next.js wrapper around `app/lib/subscription.ts`.
 *
 * Lives separately so the pure enforcement library has no Next.js
 * dependency (importable from non-route code and from tests). Routes
 * use `gateLimit()` before doing work and `recordUsage()` after the
 * work succeeds. A blocked check returns 403 with a JSON body the UI
 * can inspect — the `metric` field lets the client tell "you hit a
 * project cap" from "your trial expired".
 */

import { NextResponse } from "next/server";
import {
  checkLimit,
  recordUsage as recordUsageLib,
  type CheckContext,
  type EventMetric,
  type LimitMetric,
} from "./subscription";

/**
 * Returns null when the user is permitted to proceed. Returns a
 * NextResponse with HTTP 403 when blocked. Body shape:
 *
 *   { error: string, metric: LimitMetric|"trial", current: number, limit: number }
 *
 * The UI layer uses `metric` to choose between "upgrade for more …" and
 * "your trial expired" prompts. Status is uniformly 403 to keep client-
 * side handling simple — the body's `metric` differentiates.
 */
export async function gateLimit(
  userId: string,
  metric: LimitMetric,
  ctx?: CheckContext,
): Promise<NextResponse | null> {
  const result = await checkLimit(userId, metric, ctx);
  if (result.ok) return null;
  return NextResponse.json(
    {
      error: result.reason,
      metric: result.metric,
      current: result.current,
      limit: result.limit,
    },
    { status: 403 },
  );
}

/** Re-exported for symmetry — keeps route code importing one module. */
export async function recordUsage(
  userId: string,
  metric: EventMetric,
  delta: number = 1,
): Promise<void> {
  return recordUsageLib(userId, metric, delta);
}

/**
 * Element-counting rules per the subscription spec: nodes only.
 * Excludes connectors (which live in `data.connectors`, not
 * `data.elements`, so they're already out) and artifact types
 * (data-object, data-store, text-annotation).
 */
const ARTIFACT_TYPES = new Set(["data-object", "data-store", "text-annotation"]);

export function countNodeElements(diagramData: unknown): number {
  if (!diagramData || typeof diagramData !== "object") return 0;
  const elements = (diagramData as { elements?: { type?: string }[] }).elements;
  if (!Array.isArray(elements)) return 0;
  let n = 0;
  for (const e of elements) {
    if (!e || typeof e !== "object") continue;
    if (ARTIFACT_TYPES.has((e as { type?: string }).type ?? "")) continue;
    n++;
  }
  return n;
}

/**
 * Gate a per-diagram element-count limit at an AI / import entry point.
 * Picks the BPMN or non-BPMN metric based on the diagram type, counts
 * nodes in the proposed data, and returns a 403 NextResponse if the
 * tier's cap is exceeded.
 *
 * Use at routes that bring in element data from outside:
 *   - AI generate / plan routes (after the model returns)
 *   - Import routes (after the parser succeeds)
 *
 * Do NOT use on the diagram-save endpoint — saves of already-over-cap
 * diagrams must succeed so users can edit their way back under.
 */
export async function gateElementCount(
  userId: string,
  diagramType: string,
  diagramData: unknown,
): Promise<NextResponse | null> {
  const count = countNodeElements(diagramData);
  const metric: LimitMetric =
    diagramType === "bpmn" ? "bpmnElementsPerDiagram" : "nonBpmnElementsPerDiagram";
  return gateLimit(userId, metric, { proposedElementCount: count });
}

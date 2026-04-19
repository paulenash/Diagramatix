/**
 * Zod schemas for the AI-generated BPMN "plan" — the structured JSON that
 * Sonnet returns in phase 1 and that the layout engine consumes in phase 2.
 *
 * Mirrors the `AiElement` and `AiConnection` interfaces in
 * app/lib/diagram/bpmnLayout.ts. When those interfaces change, update here
 * too — this is the single validation point shared by client (RawJsonView),
 * server (phase-1 + phase-2 endpoints), and any future tooling.
 */
import { z } from "zod";

const ELEMENT_TYPES = [
  "pool",
  "lane",
  "start-event",
  "end-event",
  "intermediate-event",
  "task",
  "gateway",
  "subprocess",
  "subprocess-expanded",
  "data-object",
  "data-store",
  "text-annotation",
  "group",
] as const;

const BOUNDARY_SIDES = ["left", "right", "top", "bottom"] as const;

export const AiElementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ELEMENT_TYPES),
  label: z.string(),
  taskType: z.string().optional(),
  gatewayType: z.string().optional(),
  eventType: z.string().optional(),
  pool: z.string().optional(),
  lane: z.string().optional(),
  poolType: z.enum(["white-box", "black-box"]).optional(),
  lanes: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  parentSubprocess: z.string().optional(),
  boundaryHost: z.string().optional(),
  boundarySide: z.enum(BOUNDARY_SIDES).optional(),
  parentPool: z.string().optional(),
  subprocessType: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const AiConnectionSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().optional(),
  type: z.string().optional(),
}).passthrough();

export const AiPlanSchema = z.object({
  elements: z.array(AiElementSchema),
  connections: z.array(AiConnectionSchema),
});

export type AiPlan = z.infer<typeof AiPlanSchema>;

/**
 * Validate a plan object. Returns { ok: true, plan } or { ok: false, issues }
 * where each issue is a human-readable path + message for UI display.
 */
export function validatePlan(input: unknown): { ok: true; plan: AiPlan } | { ok: false; issues: string[] } {
  const result = AiPlanSchema.safeParse(input);
  if (result.success) return { ok: true, plan: result.data };
  const issues = result.error.issues.map(i => {
    const path = i.path.length ? i.path.join(".") : "(root)";
    return `${path}: ${i.message}`;
  });
  return { ok: false, issues };
}

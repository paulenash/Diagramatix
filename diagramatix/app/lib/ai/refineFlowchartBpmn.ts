/**
 * Optional AI "tidy" pass for a deterministically-translated flowchart→BPMN
 * plan. The model may only improve cosmetic fields (labels, task / gateway /
 * event sub-types); STRUCTURE IS LOCKED by construction — we start from the
 * deterministic plan and overlay only whitelisted fields matched by id, so no
 * element / connection can ever be added, removed, re-typed or re-parented,
 * whatever the model returns. Any failure returns the input unchanged.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001"; // AI Generate default (see app/lib/ai/models.ts)

export interface RefineResult {
  elements: AiElement[];
  connections: AiConnection[];
  refined: boolean;
}

const SYSTEM = `You tidy a BPMN plan that was mechanically derived from a flowchart. You may improve ONLY these fields: each element's "label" (clearer business wording), a task's "taskType" ("user" | "service" | "manual" | "send" | "receive" | "none"), a gateway's "gatewayType" ("exclusive" | "parallel" | "inclusive"), an event's "eventType", and a connection's "label" (branch names like "Yes" / "No" / "Rejected"). You MUST NOT add, remove, reorder or re-parent any element or connection, and MUST NOT change any "id", "type", "pool", "lane" or "parentSubprocess". Return the SAME elements and connections with only those fields adjusted. Output ONLY JSON: {"elements":[...],"connections":[...]} — no markdown, no commentary.`;

export async function refineFlowchartBpmnPlan(opts: {
  apiKey: string;
  elements: AiElement[];
  connections: AiConnection[];
  model?: string;
}): Promise<RefineResult> {
  const { apiKey, elements, connections } = opts;
  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify({ elements, connections }) }],
    });
    const text = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const parsed = extractJson(text);
    if (!parsed) return { elements, connections, refined: false };
    return { ...mergeRefinement(elements, connections, parsed), refined: true };
  } catch {
    return { elements, connections, refined: false };
  }
}

interface RefinedPayload {
  elements?: Array<Partial<AiElement> & { id?: string }>;
  connections?: Array<Partial<AiConnection>>;
}

/** Overlay only whitelisted fields from the model onto the deterministic plan. */
export function mergeRefinement(
  elements: AiElement[],
  connections: AiConnection[],
  refined: RefinedPayload,
): { elements: AiElement[]; connections: AiConnection[] } {
  const byId = new Map((refined.elements ?? []).map((e) => [e.id, e]));
  const mergedElements = elements.map((e) => {
    const r = byId.get(e.id);
    if (!r) return e;
    return {
      ...e,
      ...(typeof r.label === "string" && r.label.trim() ? { label: r.label } : {}),
      ...(r.taskType && e.type === "task" ? { taskType: r.taskType } : {}),
      ...(r.gatewayType && e.type === "gateway" ? { gatewayType: r.gatewayType } : {}),
      ...(r.eventType && e.type.includes("event") ? { eventType: r.eventType } : {}),
    };
  });

  const pool = Array.isArray(refined.connections) ? [...refined.connections] : [];
  const mergedConnections = connections.map((c) => {
    const i = pool.findIndex(
      (rc) => rc.sourceId === c.sourceId && rc.targetId === c.targetId && typeof rc.label === "string" && rc.label.trim(),
    );
    if (i < 0) return c;
    const label = pool[i].label as string;
    pool.splice(i, 1);
    return { ...c, label };
  });

  return { elements: mergedElements, connections: mergedConnections };
}

/** Tolerant JSON extraction — strips markdown fences / preamble. */
function extractJson(text: string): RefinedPayload | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

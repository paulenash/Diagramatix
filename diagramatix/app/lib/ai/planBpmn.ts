/**
 * Sonnet-call helper for AI BPMN generation.
 *
 * Shared by:
 *   - POST /api/ai/generate-bpmn         (one-shot "Quick" mode)
 *   - POST /api/ai/bpmn/plan             (phase 1 of the 2-phase flow)
 *
 * Keep all Anthropic-facing logic here so the three call sites don't drift.
 * The layout step (phase 2) is NOT invoked here — callers hand the returned
 * plan to `layoutBpmnDiagram` when they are ready to render.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

export type Attachment =
  | { type: "pdf"; data: string; name?: string }
  | { type: "text"; data: string; name?: string }
  | null
  | undefined;

export interface PlanBpmnOptions {
  apiKey: string;
  prompt: string;
  attachment?: Attachment;
  /** Full rules markdown (general + bpmn default). Sent verbatim in the system prompt. */
  rules: string;
  /** Override the default model for testing. */
  model?: string;
}

export type PlanBpmnResult =
  | { ok: true; plan: { elements: AiElement[]; connections: AiConnection[] }; model: string }
  | { ok: false; status: number; error: string; raw?: string };

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/**
 * Build the system prompt instructing Sonnet to return normalised BPMN JSON.
 * Keep this identical to the previous single-file implementation so the
 * generate-bpmn refactor is a no-behaviour-change swap.
 */
export function buildSystemPrompt(rules: string): string {
  return `You are a BPMN process modelling expert. Given a description of a business process, output a valid JSON object that defines the process as BPMN elements and connections.

${rules ? `USER RULES AND PREFERENCES (follow these strictly):\n${rules}\n\n` : ""}CRITICAL FORMAT RULES — you MUST follow these exactly:
- Use ONLY these type values: "pool", "lane", "start-event", "end-event", "task", "gateway", "subprocess", "subprocess-expanded", "intermediate-event", "data-object", "data-store", "text-annotation", "group"
- NEVER use "startEvent", "endEvent", "exclusiveGateway", "sendTask" etc. — use the hyphenated forms above
- Use "label" (not "name") for all element labels
- Every element MUST have: id, type, label
- Pools MUST have: poolType ("white-box" or "black-box")
- Black-box pools MUST also include "isSystem": true | false so downstream code can position them correctly without name guessing:
  * isSystem=true → IT systems / business applications (Salesforce, XERO, SAP, SharePoint, databases, APIs, ERP, CRM, etc.). Positioned BELOW the main pool.
  * isSystem=false → external entities that are people or organisations (Customer, Client, Supplier, Government Department, etc.). Positioned ABOVE the main pool.
  * White-box pools do not need isSystem.
- Lanes MUST have: parentPool (the pool id they belong to)
- Flow elements (tasks, gateways, events) MUST have: pool (pool id). Include "lane" ONLY if the prompt mentions specific roles, teams, or performers responsible for elements.
- DO NOT create default/placeholder lanes (e.g. "Team", "Process Team", "Main Lane"). Only create lanes when the prompt implies multiple performers/roles. If no roles are mentioned, elements go directly in the pool with NO lane.
- Tasks should have: taskType ("user", "service", "send", "receive", "manual", "none")
- Gateways should have: gatewayType ("exclusive", "parallel", "inclusive")
- Expanded subprocesses use type "subprocess-expanded". They CAN contain child elements: set their "parentSubprocess" property to the subprocess id instead of "lane"
- If the prompt mentions an "Event Subprocess" or "Event Expanded Subprocess":
  * Set properties.subprocessType = "event" on the subprocess-expanded element
  * An Event Subprocess MUST be placed INSIDE a containing Normal Expanded Subprocess (parentSubprocess = normal subprocess id). Create a wrapping Normal Expanded Subprocess if the user only mentioned the event subprocess.
  * Inside the Event Subprocess, add TWO child elements (not boundary events):
    - A non-interrupting start event (parentSubprocess = event subprocess id, properties: { interrupting: false })
    - An end event (parentSubprocess = event subprocess id)
  * Event subprocesses are small (about 4 task widths wide × 2 task heights tall) — the layout engine will size them automatically
  * NEVER create sequence connectors TO or FROM an Event Expanded Subprocess — they are triggered by events, not sequence flow.
- Every process MUST have a Start Event and at least one End Event at the main Process Pool level (outside any subprocess). These represent the overall process entry and exit. If the user doesn't mention them explicitly, create them anyway.
- CRITICAL: Always place EVERY element mentioned in the prompt, EVEN IF it is not connected to anything. Unconnected elements still appear on the canvas.
- Boundary events (edge-mounted on a task, subprocess, or expanded subprocess): add "boundaryHost": "<elementId>" to the event. Choose placement via "boundarySide":
  * Start events → "left" (default: middle of left edge)
  * End events → "right" (default: middle of right edge)
  * Intermediate events (timers, interrupts, escalations) → "top" or "bottom" near right corner
- CRITICAL: Every diverging gateway (with 2+ outgoing flows) MUST have a corresponding merge gateway downstream where ALL branches reconnect BEFORE any subsequent task. The merge gateway must have the same gatewayType as the diverging gateway. Even if one branch has only one task and the other has multiple, both MUST flow into the merge gateway.
- Connections use: sourceId, targetId, and optionally label and type ("sequence" or "message")
- Use "sequence" for flows within the same pool, "message" for flows between different pools
- Every message connector MUST have a descriptive label (e.g. "Order details", "Payment receipt"). The label will be rendered in the gap between the two pools.

Output ONLY valid JSON (no markdown, no explanation, no comments):

Example 1 — NO roles mentioned, so NO lanes (elements go directly in pool):
{
  "elements": [
    { "id": "p1", "type": "pool", "label": "Company", "poolType": "white-box" },
    { "id": "e1", "type": "start-event", "label": "Start", "pool": "p1" },
    { "id": "sp1", "type": "subprocess-expanded", "label": "Database Operations", "pool": "p1" },
    { "id": "bs1", "type": "start-event", "label": "", "boundaryHost": "sp1", "boundarySide": "left" },
    { "id": "bt1", "type": "intermediate-event", "label": "Timeout", "eventType": "timer", "boundaryHost": "sp1", "boundarySide": "top" },
    { "id": "be1", "type": "end-event", "label": "", "boundaryHost": "sp1", "boundarySide": "right" },
    { "id": "t1", "type": "task", "label": "Check Database", "taskType": "service", "parentSubprocess": "sp1" },
    { "id": "t2", "type": "task", "label": "Update Database", "taskType": "service", "parentSubprocess": "sp1" },
    { "id": "e2", "type": "end-event", "label": "End", "pool": "p1" }
  ],
  "connections": [
    { "sourceId": "e1", "targetId": "sp1", "type": "sequence" },
    { "sourceId": "t1", "targetId": "t2", "type": "sequence" },
    { "sourceId": "sp1", "targetId": "e2", "type": "sequence" }
  ]
}

Example 2 — Roles mentioned (Sales, Finance), message flows to Customer (external, non-system) and Salesforce (IT system):
{
  "elements": [
    { "id": "pC", "type": "pool", "label": "Customer", "poolType": "black-box", "isSystem": false },
    { "id": "p1", "type": "pool", "label": "Company", "poolType": "white-box" },
    { "id": "l1", "type": "lane", "label": "Sales", "parentPool": "p1" },
    { "id": "l2", "type": "lane", "label": "Finance", "parentPool": "p1" },
    { "id": "pS", "type": "pool", "label": "Salesforce", "poolType": "black-box", "isSystem": true },
    { "id": "e1", "type": "start-event", "label": "Start", "pool": "p1", "lane": "l1" },
    { "id": "t1", "type": "task", "label": "Notify Customer", "taskType": "send", "pool": "p1", "lane": "l1" },
    { "id": "t2", "type": "task", "label": "Record Payment", "taskType": "user", "pool": "p1", "lane": "l2" },
    { "id": "e2", "type": "end-event", "label": "End", "pool": "p1", "lane": "l2" }
  ],
  "connections": [
    { "sourceId": "e1", "targetId": "t1", "type": "sequence" },
    { "sourceId": "t1", "targetId": "pC", "type": "message" },
    { "sourceId": "t1", "targetId": "t2", "type": "sequence" },
    { "sourceId": "t2", "targetId": "pS", "type": "message" },
    { "sourceId": "t2", "targetId": "e2", "type": "sequence" }
  ]
}`;
}

/**
 * Normalise AI output — fix common naming issues in the returned JSON.
 * Same mapping the inline code used; extracted so every endpoint benefits.
 */
const TYPE_MAP: Record<string, string> = {
  "startEvent": "start-event", "start_event": "start-event",
  "endEvent": "end-event", "end_event": "end-event",
  "exclusiveGateway": "gateway", "parallelGateway": "gateway",
  "inclusiveGateway": "gateway", "eventBasedGateway": "gateway",
  "sendTask": "task", "receiveTask": "task", "userTask": "task",
  "serviceTask": "task", "manualTask": "task", "scriptTask": "task",
  "subProcess": "subprocess", "sub_process": "subprocess",
  "intermediateEvent": "intermediate-event",
  "intermediateCatchEvent": "intermediate-event",
  "intermediateThrowEvent": "intermediate-event",
};

export function normaliseAiPlan(parsed: { elements: AiElement[]; connections: AiConnection[] }): void {
  for (const el of parsed.elements) {
    if (TYPE_MAP[el.type]) {
      if (el.type === "exclusiveGateway") el.gatewayType = "exclusive";
      else if (el.type === "parallelGateway") el.gatewayType = "parallel";
      else if (el.type === "inclusiveGateway") el.gatewayType = "inclusive";
      else if (el.type === "sendTask") el.taskType = "send";
      else if (el.type === "receiveTask") el.taskType = "receive";
      else if (el.type === "userTask") el.taskType = "user";
      else if (el.type === "serviceTask") el.taskType = "service";
      else if (el.type === "manualTask") el.taskType = "manual";
      el.type = TYPE_MAP[el.type];
    }
    if (!el.label && (el as unknown as Record<string, unknown>).name) {
      el.label = (el as unknown as Record<string, unknown>).name as string;
    }
    if (el.type === "lane" && !el.pool && (el as unknown as Record<string, unknown>).parentPool) {
      el.pool = (el as unknown as Record<string, unknown>).parentPool as string;
    }
  }
}

/**
 * Call Sonnet with the given prompt + attachment + rules, parse + normalise
 * the JSON response, and return the plan. Does not run the layout engine.
 */
export async function planBpmn(opts: PlanBpmnOptions): Promise<PlanBpmnResult> {
  const { apiKey, prompt, attachment, rules, model = DEFAULT_MODEL } = opts;
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildSystemPrompt(rules);

  const userContent: Anthropic.Messages.ContentBlockParam[] = [];
  if (attachment?.type === "pdf" && attachment.data) {
    userContent.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: attachment.data },
    } as Anthropic.Messages.ContentBlockParam);
  } else if (attachment?.type === "text" && attachment.data) {
    userContent.push({
      type: "text",
      text: `--- ATTACHED DOCUMENT: ${attachment.name ?? "document"} ---\n${attachment.data}\n--- END DOCUMENT ---`,
    });
  }
  userContent.push({ type: "text", text: prompt.trim() });

  const message = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = message.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { ok: false, status: 500, error: "No response from AI" };
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  let parsed: { elements: AiElement[]; connections: AiConnection[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    return {
      ok: false,
      status: 500,
      error: `Failed to parse AI response as JSON: ${(parseErr as Error).message}`,
      raw: jsonStr.substring(0, 500),
    };
  }

  if (!Array.isArray(parsed.elements) || !Array.isArray(parsed.connections)) {
    return { ok: false, status: 500, error: "Invalid AI response structure" };
  }

  normaliseAiPlan(parsed);
  return { ok: true, plan: parsed, model };
}

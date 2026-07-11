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
import { renderFlowchartMappingForPrompt } from "@/app/lib/diagram/translate/flowchartBpmnMap";
import { hardWrapProcessName } from "@/app/lib/diagram/textMetrics";

export type Attachment =
  | { type: "pdf"; data: string; name?: string }
  | { type: "text"; data: string; name?: string }
  /** A diagram image (PNG / JPEG / WebP / GIF) that Sonnet should
   *  reverse-engineer into the plan. `data` is the raw bytes, base64
   *  encoded; `mediaType` is the matching IANA type sent to Claude's
   *  vision API. */
  | { type: "image"; data: string; mediaType: string; name?: string }
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
  /** Image import "reproduce original layout": ask the model to additionally
   *  report each shape's normalised `bounds` and each connector's attachment
   *  sides + drawn waypoints, so `layoutBpmnPreserved` can rebuild the vendor's
   *  actual layout instead of auto-stacking. */
  captureGeometry?: boolean;
}

export type PlanBpmnResult =
  | { ok: true; plan: { elements: AiElement[]; connections: AiConnection[] }; model: string }
  | { ok: false; status: number; error: string; raw?: string };

const DEFAULT_MODEL = "claude-haiku-4-5-20251001"; // AI Generate default (see app/lib/ai/models.ts)

/**
 * Build the system prompt instructing Sonnet to return normalised BPMN JSON.
 * Keep this identical to the previous single-file implementation so the
 * generate-bpmn refactor is a no-behaviour-change swap.
 */
export function buildSystemPrompt(rules: string, captureGeometry = false): string {
  return `You are a BPMN process modelling expert. Given a description of a business process, output a valid JSON object that defines the process as BPMN elements and connections.

IMAGE INPUT — when an image of an existing diagram is attached:
- Treat the image as the source of truth. Reverse-engineer the process from what is drawn, then express it in the BPMN JSON format below.${captureGeometry ? `

GEOMETRY CAPTURE — for THIS request, reproduce the DRAWN layout exactly as it appears (this diagram is being imported from another tool and must not be re-flowed):
- For EVERY element (pool, lane, task, gateway, event, subprocess, data object, annotation) add a "bounds" object: { "x": <left>, "y": <top>, "w": <width>, "h": <height> }, where each value is a number 0..1 expressed as a fraction of the WHOLE image (x,y = the shape's top-left corner; origin at the image's top-left). Use 2-3 decimal places.
- Pools may be ANY size and may sit side-by-side or at any position — report their real boxes; do NOT force them to full width or vertical stacking. Order pools top-to-bottom by their "y".
- A lane's box must lie inside its pool's box; a node's box must lie inside its lane/pool box.
- For EVERY connection also report how it was drawn: "sourceSide" and "targetSide" (one of "left"/"right"/"top"/"bottom" — the side of each element the line attaches to), and "waypoints": an array of { "x", "y" } normalised 0..1 points tracing the line's route as drawn (corners of the polyline, in order from source to target). Message flows between pools are often rectilinear and connect elements that are NOT vertically aligned — capture them as drawn.
- Keep boxes tight to the drawn shape. If you genuinely cannot see a shape's box, omit "bounds" for that element only (do NOT guess a filler box). Never invent elements to fill empty space.` : ""}
- If the image is already a BPMN diagram: copy the structure faithfully. Read pool names, lane names, task labels, gateway labels and event labels off the image. Map every shape to its hyphenated type: rounded rectangle → "task" (or "subprocess" / "subprocess-expanded" if it contains its own sub-flow), diamond → "gateway", circle with thin border → "start-event", circle with thick border → "end-event", circle with double border → "intermediate-event", parallel horizontal lines → "pool" / "lane", dashed-rectangle around tasks → "group", document icon → "data-object", cylinder → "data-store", sticky-note → "text-annotation".
- ${renderFlowchartMappingForPrompt()}
- Read labels with OCR. Do NOT invent tasks, branches or roles that are not visible in the image. If a label is unreadable, use a short descriptive placeholder rather than guessing.
- Where the user's text prompt adds detail beyond the image (extra rules, role names, message flows), apply it. Where the prompt CONTRADICTS the image, prefer the image.

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
- TASKTYPE RULES FOR TASKS WITH BLACK-BOX MESSAGE FLOWS:
  * Task with messages BOTH TO AND FROM an EXTERNAL ENTITY (isSystem=false): default "none"; never use "send", "receive", or "user".
  * Task with messages BOTH TO AND FROM an IT SYSTEM (isSystem=true): default "user"; never use "send", "receive", or "manual".
  * Task that only RECEIVES a message from an EXTERNAL ENTITY: default "receive"; never use "send".
  * Task that only SENDS a message to an EXTERNAL ENTITY: default "send"; never use "receive" or "user".
  * Task with messages to/from an IT SYSTEM in only one direction: default "user"; never use "send", "receive", or "manual".
  * Send and Receive each represent ONE direction of a message exchange — never use them on a task that has messages in BOTH directions.
  * ABSOLUTE RULE: a Manual task must NEVER exchange messages with an IT-system pool (isSystem=true) in any direction.
- Gateways should have: gatewayType ("exclusive", "parallel", "inclusive", "event-based"). Use "event-based" ONLY when the prompt describes one of several alternative EVENTS racing to occur (whichever happens first) — see the USER RULES for the exact trigger and wiring. The matching merge gateway MUST use the same gatewayType.
- Expanded subprocesses use type "subprocess-expanded". They CAN contain child elements: set their "parentSubprocess" property to the subprocess id instead of "lane"
  * An expanded subprocess's OWN start and end events are INTERNAL flow nodes: give them parentSubprocess = the subprocess id. NEVER give a start-event or end-event a boundaryHost — start/end events can never be boundary (edge-mounted) events. boundaryHost is ONLY for intermediate (interrupting / non-interrupting) events mounted on an activity's edge.
  * EVERY Expanded Subprocess has its OWN internal Start event and internal End event — the ONLY exception is an Ad-Hoc Sub-Process (see below), which has NO start or end events (neither inside nor on the boundary).
- ACTIVITY MARKERS — a task or subprocess-expanded can carry ONE of these markers:
  * LOOP: the activity (or the group of activities in an Expanded Subprocess) repeats. Set "repeatType": "loop" (top level, NOT under properties) to draw the Standard Loop marker (↻). Use this for a repeating group of activities: put them inside an Expanded Subprocess, name it with the loop condition (e.g. "Do Until Info Complete", "Repeat Until Approved", "Do While Stock Low"), set repeatType "loop", and do NOT add a gateway for the loop test or a sequence connector going back to the first activity — the loop is shown by the marker alone. For a time limit add a Timer intermediate event edge-mounted on the Subprocess boundary (boundaryHost = the subprocess id, eventType "timer"), labelled with the limit; for cancellation/errors add edge-mounted intermediate events with eventType "cancel" / "error".
  * MULTI-INSTANCE: the same activity runs once per item in a collection. Set "repeatType": "mi-parallel" (all at once) or "mi-sequential" (one after another).
  * AD-HOC: a group of activities that may be done in ANY order (or skipped). Model them as tasks INSIDE an Expanded Subprocess with NO sequence connectors between them, NO start or end events (inside or on the boundary), and set "properties": { "adHoc": true } on the subprocess-expanded to draw the Ad-Hoc marker (~).
  * EVERY task / gateway / event that runs inside the subprocess (everything between its internal start and internal end) MUST carry parentSubprocess = that subprocess id. Do not leave the subprocess's internal tasks at lane level — if they belong to the subprocess's flow, tag them.
  * A parallel / inclusive gateway that SPLITS to — or JOINS from — an expanded subprocess as one of its parallel branches is NOT inside that subprocess. It sits at the subprocess's own level (same lane, parentSubprocess = the EP's lane/parent, never the EP id). Only set parentSubprocess = an EP id for elements that genuinely run INSIDE that subprocess's flow.
- EVENT SUBPROCESS DETECTION — an Event Expanded Subprocess is ANY subprocess that is TRIGGERED BY AN EVENT rather than by sequence flow. Recognise these triggers in the prompt (match case-insensitively and treat as event subs even when the user's label does NOT contain the words "event" or "subprocess"):
  * Any mention of "event subprocess" / "event expanded subprocess" / "interrupt" / "non-interrupting" in relation to a subprocess
  * Time-based triggers: "on timer", "after X minutes/hours/days", "periodically", "scheduled", "timeout", "deadline", "overdue", "SLA breach"
  * Signal / message triggers: "on receiving X", "when X arrives", "on notification", "on update", "on change", "on alert"
  * Exception triggers: "on error", "on failure", "if cancelled", "on escalation", "on abort"
  * Parallel-handler language: "meanwhile", "in parallel, handle X", "whilst also listening for X", "concurrently"
  A subprocess that handles "customer updates", "account changes", "policy updates", "incoming notifications", etc. is AN EVENT SUB — it fires when those things happen, not in the main sequence.
- If you determine a subprocess is an Event Expanded Subprocess:
  * Set subprocessType = "event" on the subprocess-expanded element (at top level, NOT nested under properties). Setting this is MANDATORY — downstream code strips illegal connectors using this flag; without it the diagram is incorrect.
  * An Event Subprocess MUST be placed INSIDE a containing Normal Expanded Subprocess (parentSubprocess = normal subprocess id). Create a wrapping Normal Expanded Subprocess if the user only mentioned the event subprocess.
  * Inside the Event Subprocess, add TWO child elements (not boundary events):
    - A start event (parentSubprocess = event subprocess id). Choose its interruptionType based on the prompt's semantics:
      • Non-Interrupting — set properties.interruptionType = "non-interrupting" when the inner tasks run IN PARALLEL with the outer subprocess's tasks (the outer flow keeps going while the event sub also runs). Triggers like "meanwhile", "in parallel", "whilst also listening", "concurrently", "while X is happening", periodic notifications/updates that don't pause outer work, or non-fatal alerts are non-interrupting.
      • Interrupting — set properties.interruptionType = "interrupting" (or omit the property — interrupting is the default) when the outer tasks are PUT ON HOLD / cancelled / superseded while the inner tasks run. Triggers like "on error", "on failure", "on cancellation", "on escalation", "on abort", "on timeout that stops processing", or "if X then stop and …" are interrupting.
      • If genuinely ambiguous, default to non-interrupting.
    - An end event (parentSubprocess = event subprocess id)
  * Event subprocesses are small (about 4 task widths wide × 2 task heights tall) — the layout engine will size them automatically
  * NEVER create ANY connector (sequence OR message) TO or FROM an Event Expanded Subprocess — they are triggered by events, not by flow of any kind.
- Every process MUST have a Start Event and at least one End Event at the main Process Pool level (outside any subprocess). These represent the overall process entry and exit. If the user doesn't mention them explicitly, create them anyway.
- The process-level Start Event MUST be assigned to the TOPMOST lane of its pool (the first lane in the pool's lane list). Even if the start event is logically performed by a role in a different lane, place it in the top lane so the process entry point reads top-down. The layout engine will enforce this — but emitting it correctly avoids confusing the AI plan view.
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
      else if (el.type === "eventBasedGateway") el.gatewayType = "event-based";
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
    // Task / Subprocess name hard-wrapping — multi-word names read as several
    // lines (break after word 2 / word 3 / every 3 words by length). Applies to
    // every generated BPMN task + collapsed subprocess. Idempotent.
    if ((el.type === "task" || el.type === "subprocess") && el.label) {
      el.label = hardWrapProcessName(el.label);
    }
    // R46: any event whose label mentions "non-interrupting" gets its
    // interruptionType attribute set to "non-interrupting" (the renderer
    // reads this property to draw the dashed circle). Handles the common
    // spellings "non-interrupting", "non interrupting", "noninterrupting".
    if (el.type === "start-event" || el.type === "end-event" || el.type === "intermediate-event") {
      const label = (el.label ?? "").toLowerCase();
      if (/non[-\s]?interrupting/.test(label)) {
        el.properties = { ...(el.properties ?? {}), interruptionType: "non-interrupting" };
      }
    }
  }

  // Every set of Lanes must have a containing Pool. A lane with NO pool
  // reference at all (neither parentPool nor pool — the pool wasn't present in
  // the original) is wrapped, with its siblings, in a single white-box pool
  // named "Process" (Paul 2026-07-12). Lanes that reference a pool id are left
  // alone (the back-fill above handles them). Idempotent: once the lanes point
  // at the pool it won't fire again (the plan → apply-layout double-pass is safe).
  const orphanLanes = parsed.elements.filter((e) =>
    e.type === "lane" && !e.parentPool && !e.pool);
  if (orphanLanes.length > 0) {
    const POOL_ID = "auto-process-pool";
    const orphanIds = new Set(orphanLanes.map((l) => l.id));
    // If every orphan lane carries drawn geometry (image import), give the pool
    // the union box so the preserved layout has a pool to place the lanes in.
    const boxes = orphanLanes.map((l) => l.bounds).filter(Boolean) as { x: number; y: number; w: number; h: number }[];
    let bounds: { x: number; y: number; w: number; h: number } | undefined;
    if (boxes.length === orphanLanes.length) {
      const x = Math.min(...boxes.map((b) => b.x));
      const y = Math.min(...boxes.map((b) => b.y));
      const r = Math.max(...boxes.map((b) => b.x + b.w));
      const btm = Math.max(...boxes.map((b) => b.y + b.h));
      bounds = { x, y, w: r - x, h: btm - y };
    }
    const pool: AiElement = { id: POOL_ID, type: "pool", label: "Process", poolType: "white-box", ...(bounds ? { bounds } : {}) };
    parsed.elements.unshift(pool);
    for (const l of orphanLanes) l.parentPool = POOL_ID;
    // Flow elements that live in an orphan lane now belong to the new pool.
    for (const e of parsed.elements) {
      if (e.lane && orphanIds.has(e.lane)) e.pool = POOL_ID;
    }
  }
}

/**
 * Call Sonnet with the given prompt + attachment + rules, parse + normalise
 * the JSON response, and return the plan. Does not run the layout engine.
 */
export async function planBpmn(opts: PlanBpmnOptions): Promise<PlanBpmnResult> {
  const { apiKey, prompt, attachment, rules, model = DEFAULT_MODEL, captureGeometry = false } = opts;
  const client = new Anthropic({ apiKey });
  // Geometry capture only makes sense with an image to measure.
  const wantGeometry = captureGeometry && attachment?.type === "image";
  const systemPrompt = buildSystemPrompt(rules, wantGeometry);

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
  } else if (attachment?.type === "image" && attachment.data && attachment.mediaType) {
    // Sonnet vision — feed the image as the source of truth so the
    // model can reverse-engineer a BPMN-shaped plan from a screenshot
    // of a BPMN diagram or a flowchart. The system prompt teaches the
    // shape translation; here we just hand the bytes over.
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: attachment.mediaType as
          "image/png" | "image/jpeg" | "image/webp" | "image/gif",
        data: attachment.data,
      },
    } as Anthropic.Messages.ContentBlockParam);
    userContent.push({
      type: "text",
      text: `An image of an existing process diagram is attached above (${attachment.name ?? "diagram.png"}). Treat the image as the source of truth and reverse-engineer the BPMN plan from it. If the text prompt below adds or contradicts anything visible in the image, prefer what the image shows.${wantGeometry ? " Also report each shape's `bounds` (normalised 0..1) and each connector's `sourceSide`/`targetSide` + `waypoints` exactly as drawn — we are reproducing the original layout, not re-flowing it." : ""}`,
    });
  }
  // Append a final, extremely explicit "JSON only" instruction to the
  // user turn itself. Sonnet 4.6 reportedly attends to the last thing the
  // user said more reliably than to a system-prompt rule, and this model
  // rejects assistant-message prefill (returns 400 "does not support
  // assistant message prefill"). Combined with the substring-extraction
  // fallback below, this kills the "I'll analyze…" preamble in practice.
  userContent.push({
    type: "text",
    text: prompt.trim() +
      "\n\nReturn ONLY the JSON object. No prose. No preamble like " +
      "\"I'll analyze\" or \"Here is\". No markdown fences. Your entire " +
      "response MUST start with `{` and end with `}` — nothing else.",
  });

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
  // Defence-in-depth: if any prose still leaked in front of or after the
  // JSON object, clip to the outermost { … } pair before parsing.
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  let parsed: { elements: AiElement[]; connections: AiConnection[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error("[planBpmn] JSON parse failed. Raw response (first 1 KB):",
      textBlock.text.slice(0, 1024));
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

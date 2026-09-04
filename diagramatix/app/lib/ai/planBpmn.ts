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
import { makeAiClient, cappedMaxTokens } from "@/app/lib/ai/anthropicClient";
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
- If the image is already a BPMN diagram: copy the structure faithfully. Read pool names, lane names, task labels, gateway labels and event labels off the image. Map every shape to its hyphenated type: rounded rectangle → "task" (or "subprocess" / "subprocess-expanded" if it contains its own sub-flow), diamond → "gateway", circle with thin border → "start-event", circle with thick border → "end-event", circle with double border → "intermediate-event", parallel horizontal lines → "pool" / "lane" (a lane visibly split into stacked sub-bands → the inner bands are SUB-lanes: give each a "parentLane"), dashed-rectangle around tasks → "group", document icon → "data-object", cylinder → "data-store", sticky-note → "text-annotation". A diamond containing a SMALL ASTERISK / SIX-POINTED STAR (✳) → "gateway" with gatewayType "complex". A double-border circle containing a PENTAGON → "intermediate-event" with eventType "multiple"; containing a PLUS (✚) → eventType "parallel-multiple". A rounded rectangle drawn with a THICK / BOLD border → "subprocess" with properties.subprocessType "call" (a Call Activity). A small double-left-triangle "rewind" (◀◀) marker at the bottom-centre of an activity → set properties.isForCompensation true (a compensation handler). A data-object with three short vertical bars at its base → set properties.multiplicity "collection"; a data-object with a small hollow arrow → an input, a filled arrow → an output (usually auto-derived from its associations).
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
- SUB-LANES: when a lane is itself divided into horizontal sub-bands (a lane nested inside another lane — common in imported diagrams), emit the OUTER band as a normal lane and EACH inner band as a lane that ALSO has "parentLane" set to the outer lane's id (keep "parentPool" too). A flow element that sits inside a sub-band sets "lane" to the SUB-lane's id (the innermost band that contains it), not the outer lane's id. Only nest when the image genuinely shows a lane split into sub-bands — do NOT invent sub-lanes.
- Flow elements (tasks, gateways, events) MUST have: pool (pool id). Include "lane" ONLY if the prompt mentions specific roles, teams, or performers responsible for elements.
- DO NOT create default/placeholder lanes (e.g. "Team", "Process Team", "Main Lane"). Only create lanes when the prompt implies multiple performers/roles. If no roles are mentioned, elements go directly in the pool with NO lane.
- Tasks should have: taskType ("user", "service", "send", "receive", "manual", "none"). The DEFAULT marker is "none".
- TASK MARKERS: for a task that exchanges a Message Flow with a black-box pool, its marker is assigned AUTOMATICALLY from the message flows — just draw the message connectors and set that pool's isSystem correctly (do not work the marker out yourself). For every OTHER task, set the marker from its WORDING per the task-marker rules in the USER RULES below; a "service" (automated) marker is always kept.
  * ABSOLUTE RULE: a Manual task must NEVER exchange messages with an IT-system pool (isSystem=true) in any direction.
- Gateways should have: gatewayType ("exclusive", "parallel", "inclusive", "event-based", "complex"). Use "event-based" ONLY when the prompt describes one of several alternative EVENTS racing to occur (whichever happens first) — see the USER RULES for the exact trigger and wiring. Use "complex" ONLY for advanced synchronisation the basic gateways can't express (e.g. "proceed when any 2 of the 3 branches finish", "N-of-M" join conditions); it is rare — prefer exclusive/inclusive/parallel otherwise. The matching merge gateway MUST use the same gatewayType.
- MULTIPLE / PARALLEL-MULTIPLE EVENTS: when ONE event may be triggered by ANY of several different triggers ("on a message OR a timer OR a signal"), set that event's eventType to "multiple" (pentagon marker) rather than inventing several events. When it fires only once ALL of several triggers have occurred, use "parallel-multiple" (plus marker).
- CALL ACTIVITY (reusable / global sub-process): when a step INVOKES a separately-defined reusable process ("call the Credit Check process", "run the standard Onboarding sub-process", "invoke the <named> process"), model it as a COLLAPSED "subprocess" with properties.subprocessType = "call" (drawn with a thick border). It sits in the normal sequence flow like any other activity.
- COMPENSATION (undo / rollback): when the process must UNDO a previously-completed activity on failure/cancellation ("reverse the payment", "cancel the reservation", "roll back the booking"), model the compensating activity as a task with properties.isForCompensation = true (a "rewind" marker). A compensation activity is NOT in the normal sequence flow — do NOT give it an incoming or outgoing sequence connector. Where you can, add a Compensation intermediate event (eventType "compensation") edge-mounted on the activity being undone (boundaryHost = that activity) and a connector from that Compensation event to the compensating task — it is drawn automatically as a dashed, directed Association (NOT a sequence flow). At minimum set isForCompensation so the marker shows.
- Expanded subprocesses use type "subprocess-expanded". They CAN contain child elements: set their "parentSubprocess" property to the subprocess id instead of "lane"
  * An expanded subprocess's OWN start and end events are INTERNAL flow nodes: give them parentSubprocess = the subprocess id. NEVER give a start-event or end-event a boundaryHost — start/end events can never be boundary (edge-mounted) events. boundaryHost is ONLY for intermediate (interrupting / non-interrupting) events mounted on an activity's edge.
  * NEVER label an Expanded Subprocess's INTERNAL start or end events — leave their "label" empty (""). (Process-level start/end events at pool/lane level MAY be labelled; only the events INSIDE an EP are unlabelled.)
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
    // An Expanded Subprocess's INTERNAL start/end events are never labelled —
    // strip any label the model added. (Process-level start/end may keep theirs.)
    if ((el.type === "start-event" || el.type === "end-event") && el.parentSubprocess) {
      el.label = "";
    }
  }

  // Every set of Lanes MUST have a containing Pool. A lane is an "orphan" when
  // it has NO pool reference at all OR its parentPool/pool points at a pool the
  // AI never actually emitted (a dangling reference — the AI generated lanes for
  // a pool it forgot to include). Both cases leave the lanes with no real pool,
  // so we wrap all orphan lanes in a single white-box pool named "Company"
  // (Paul 2026-07-12). Idempotent: once the lanes point at the injected pool it
  // won't fire again (the plan → apply-layout double-pass is safe).
  const poolIds = new Set(parsed.elements.filter((e) => e.type === "pool").map((e) => e.id));
  const laneRef = (e: AiElement) => e.parentPool ?? e.pool;
  const orphanLanes = parsed.elements.filter((e) => {
    if (e.type !== "lane") return false;
    // A sub-lane (carries parentLane) is never an orphan — it inherits its pool
    // from its parent lane in the sub-lane pass below, so don't wrap it.
    if (e.parentLane) return false;
    const ref = laneRef(e);
    return !ref || !poolIds.has(ref);
  });
  if (orphanLanes.length > 0) {
    const POOL_ID = "auto-process-pool";
    const orphanLaneIds = new Set(orphanLanes.map((l) => l.id));
    // Any pool id the orphan lanes were pointing at doesn't exist — flow
    // elements referencing the same missing pool must be re-homed too.
    const danglingPoolIds = new Set(
      orphanLanes.map(laneRef).filter((r): r is string => !!r && !poolIds.has(r)),
    );
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
    const pool: AiElement = { id: POOL_ID, type: "pool", label: "Company", poolType: "white-box", ...(bounds ? { bounds } : {}) };
    parsed.elements.unshift(pool);
    for (const l of orphanLanes) { l.parentPool = POOL_ID; l.pool = POOL_ID; }
    // Re-home flow elements: those in an orphan lane, or those directly pointing
    // at a missing pool id, now belong to the injected pool.
    for (const e of parsed.elements) {
      if (e.type === "pool" || e.type === "lane") continue;
      if ((e.lane && orphanLaneIds.has(e.lane)) || (e.pool && danglingPoolIds.has(e.pool))) {
        e.pool = POOL_ID;
      }
    }
  }

  // ── Sub-lanes ── a lane that declares `parentLane` (the id of another lane it
  // nests inside) becomes a "sublane" so the layout renders it as a nested band.
  // It keeps parentPool + parentLane. A dangling parentLane (points at a missing
  // id, itself, or a non-lane) is dropped so the element stays a plain lane.
  // Runs AFTER orphan-lane wrapping so parentPool is already settled. Idempotent.
  {
    const laneById = new Map(
      parsed.elements.filter((e) => e.type === "lane").map((e) => [e.id, e]),
    );
    for (const el of parsed.elements) {
      if (el.type !== "lane") continue;
      const pl = el.parentLane;
      if (pl && pl !== el.id && laneById.has(pl)) {
        // Inherit the parent lane's pool when the model omitted it on the sub-lane.
        const parent = laneById.get(pl)!;
        if (!el.parentPool) el.parentPool = parent.parentPool;
        if (!el.pool) el.pool = parent.pool ?? parent.parentPool;
        (el as unknown as { type: string }).type = "sublane";
      } else if (pl) {
        delete el.parentLane;
      }
    }
  }

  // ── Task markers ── The MESSAGE-driven markers are fully determined by the
  // plan (message connectors + the partner pool's isSystem flag), so assign
  // them in code — deterministic and reliable — rather than trusting the model.
  // For a task that exchanges messages with a BLACK-BOX pool:
  //   • any message (either direction) with an IT-SYSTEM pool (isSystem=true) → "user"
  //   • both SENDS and RECEIVES with a non-system (external-entity) pool      → "none"
  //   • only SENDS to a non-system pool                                       → "send"
  //   • only RECEIVES from a non-system pool                                  → "receive"
  // A task with NO black-box-pool messages keeps the model's WORDING-based
  // choice (service = automated, or send/receive/user inferred from the verb),
  // defaulting to "none". Default marker is always "none".
  const poolType = (e: AiElement) =>
    e.poolType ?? (e.properties as { poolType?: string } | undefined)?.poolType;
  const blackBoxById = new Map(
    parsed.elements.filter((e) => e.type === "pool" && poolType(e) === "black-box").map((e) => [e.id, e]),
  );
  const isSysPool = (p: AiElement) =>
    typeof p.isSystem === "boolean" ? p.isSystem
      : (p.properties as { isSystem?: unknown } | undefined)?.isSystem === true;
  for (const t of parsed.elements) {
    if (t.type !== "task") continue;
    // SERVICE GUARD — an automated (Service) task stays Service even when it
    // exchanges messages. "No human" is orthogonal to messaging, so the
    // message-driven markers must NOT clobber a deliberate "service" marker
    // (this also honours green rule R2.03, which allows "service" for a
    // system-interacting task).
    if (t.taskType === "service") continue;
    let sysMsg = false, sendEntity = false, recvEntity = false, anyBlackBoxMsg = false;
    for (const c of parsed.connections) {
      if (c.type !== "message") continue;
      const asSrc = c.sourceId === t.id, asTgt = c.targetId === t.id;
      if (!asSrc && !asTgt) continue;
      const partner = blackBoxById.get(asSrc ? c.targetId : c.sourceId);
      if (!partner) continue;
      anyBlackBoxMsg = true;
      if (isSysPool(partner)) sysMsg = true;
      else { if (asSrc) sendEntity = true; if (asTgt) recvEntity = true; }
    }
    if (anyBlackBoxMsg) {
      t.taskType = sysMsg ? "user"
        : (sendEntity && recvEntity) ? "none"
        : sendEntity ? "send"
        : recvEntity ? "receive"
        : "none";
    } else if (!t.taskType) {
      t.taskType = "none";
    }
  }

  // Code-enforced connector cleanup — runs last, on the fully-canonicalised plan.
  pruneRedundantBpmnConnectors(parsed);
}

/** Iterative DFS (gray/black) back-edge detector over a sequence-flow subgraph.
 *  Returns the set of `${sourceId}->${targetId}` edge keys that close a cycle. */
function findBackEdges(edges: AiConnection[]): Set<string> {
  const adj = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.sourceId); nodes.add(e.targetId);
    const arr = adj.get(e.sourceId);
    if (arr) arr.push(e.targetId); else adj.set(e.sourceId, [e.targetId]);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n, WHITE);
  const back = new Set<string>();
  for (const start of nodes) {
    if (color.get(start) !== WHITE) continue;
    const stack: { node: string; i: number }[] = [{ node: start, i: 0 }];
    color.set(start, GRAY);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const neighbours = adj.get(top.node) ?? [];
      if (top.i < neighbours.length) {
        const nxt = neighbours[top.i++];
        const c = color.get(nxt);
        if (c === GRAY) back.add(`${top.node}->${nxt}`);          // closes a cycle
        else if (c === WHITE) { color.set(nxt, GRAY); stack.push({ node: nxt, i: 0 }); }
      } else {
        color.set(top.node, BLACK);
        stack.pop();
      }
    }
  }
  return back;
}

/**
 * Prune redundant sequence flows the model tends to over-draw. Code-enforced (runs
 * on every AI BPMN plan via normaliseAiPlan), and idempotent — apply-layout re-runs
 * normaliseAiPlan on an already-pruned plan and nothing re-fires:
 *
 *  (b) Inside a Standard-Loop expanded subprocess (repeatType === "loop"), a
 *      back-edge sequence flow between two of its children is redundant: the loop
 *      marker already means "repeat", so the drawn loop-back is noise (issue #3).
 *  (a) A gateway with exactly ONE incoming and ONE outgoing sequence flow is a pure
 *      pass-through — e.g. a "merge" left behind when the other branch ended at an
 *      End Event, so nothing actually rejoins. Delete the gateway and reconnect its
 *      single source straight to its single target (issue #4). A 1-in/1-out gateway
 *      is never semantically meaningful in BPMN, so this is always safe.
 *
 * Run order matters: (b) first, so a loop gateway left with a single outgoing branch
 * after its back-edge is stripped is then collapsed by (a)'s fixpoint.
 */
export function pruneRedundantBpmnConnectors(
  parsed: { elements: AiElement[]; connections: AiConnection[] },
): void {
  const DATA_ARTIFACT_TYPES = new Set(["data-object", "data-store", "text-annotation"]);
  const isSeqFlow = (c: AiConnection, types: Map<string, string>) =>
    c.type !== "message"
    && !DATA_ARTIFACT_TYPES.has(types.get(c.sourceId) ?? "")
    && !DATA_ARTIFACT_TYPES.has(types.get(c.targetId) ?? "");

  // (b) Redundant back-edges inside loop-marked expanded subprocesses.
  const loopSubs = parsed.elements.filter(
    (e) => (e.type === "subprocess-expanded" || e.type === "subprocess") && e.repeatType === "loop",
  );
  for (const sp of loopSubs) {
    const childIds = new Set(
      parsed.elements.filter((e) => e.parentSubprocess === sp.id).map((e) => e.id),
    );
    if (childIds.size === 0) continue;
    const types = new Map(parsed.elements.map((e) => [e.id, e.type] as const));
    const internal = parsed.connections.filter(
      (c) => isSeqFlow(c, types) && childIds.has(c.sourceId) && childIds.has(c.targetId),
    );
    const back = findBackEdges(internal);
    if (back.size) {
      const drop = new Set(internal.filter((c) => back.has(`${c.sourceId}->${c.targetId}`)));
      parsed.connections = parsed.connections.filter((c) => !drop.has(c));
    }
  }

  // (a) Collapse pass-through gateways — fixpoint, since removing one can expose
  //     the next (chained gateways).
  let changed = true;
  while (changed) {
    changed = false;
    const types = new Map(parsed.elements.map((e) => [e.id, e.type] as const));
    for (const g of parsed.elements) {
      if (g.type !== "gateway") continue;
      // A message flow touching the gateway means removing it would orphan a
      // message — leave it alone.
      if (parsed.connections.some((c) => c.type === "message" && (c.sourceId === g.id || c.targetId === g.id))) continue;
      const ins = parsed.connections.filter((c) => isSeqFlow(c, types) && c.targetId === g.id);
      const outs = parsed.connections.filter((c) => isSeqFlow(c, types) && c.sourceId === g.id);
      if (ins.length !== 1 || outs.length !== 1) continue;
      const inc = ins[0], out = outs[0];
      // Skip degenerate self-references (would create a self-loop on reconnect).
      if (inc.sourceId === g.id || out.targetId === g.id || inc.sourceId === out.targetId) continue;
      parsed.elements = parsed.elements.filter((e) => e.id !== g.id);
      parsed.connections = parsed.connections.filter((c) => c !== inc && c !== out);
      // Reconnect source → target (don't duplicate an already-present flow).
      const dup = parsed.connections.some(
        (c) => c.type !== "message" && c.sourceId === inc.sourceId && c.targetId === out.targetId,
      );
      if (!dup) {
        parsed.connections.push({
          sourceId: inc.sourceId,
          targetId: out.targetId,
          type: "sequence",
          ...(out.label ? { label: out.label } : inc.label ? { label: inc.label } : {}),
        });
      }
      changed = true;
      break; // maps are stale after a mutation — rebuild on the next pass
    }
  }
}

/**
 * Extract the FIRST complete top-level JSON object from a model response by
 * matching braces (string- and escape-aware). This beats a naive
 * `indexOf("{")…lastIndexOf("}")` clip, which breaks when a model appends a note
 * AFTER the JSON that itself contains a `}` — the clip then swallows that prose
 * and JSON.parse fails right where the real object ended (the "Expected ',' or ']'
 * at position N" failures). Returns the balanced slice, or the tail from the first
 * `{` when unbalanced (genuinely truncated), or the input if there's no `{`.
 */
export function extractBalancedJson(s: string): string {
  const start = s.indexOf("{");
  if (start < 0) return s;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return s.slice(start);
}

/** Best-effort repair of common LLM JSON slips (trailing commas before a close).
 *  Conservative: only touches `,` immediately before `}`/`]`, which is never valid. */
export function repairJsonCommas(s: string): string {
  return s.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Salvage a TRUNCATED plan JSON (model hit its output cap mid-object): trim back to
 * the last complete top-level array element (the last `}`/`]` at a clean boundary),
 * drop a dangling comma, then append the closing brackets for everything still open.
 * Yields a valid object with as many complete elements/connections as arrived — far
 * better than a total parse failure. Returns null when there's nothing to salvage.
 */
export function closeTruncatedJson(s: string): string | null {
  // Find the last index at which we're at depth-safe boundary (a `}` or `]` that
  // isn't inside a string) — that's the end of a complete element.
  let inStr = false, esc = false, lastClose = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "}" || ch === "]") lastClose = i;
  }
  if (lastClose < 0) return null;
  let trimmed = s.slice(0, lastClose + 1).replace(/,\s*$/, "");
  // Recompute the open-bracket stack over the trimmed slice and close it.
  const stack: string[] = [];
  inStr = false; esc = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  for (let i = stack.length - 1; i >= 0; i--) trimmed += stack[i];
  return trimmed;
}

/** The exact Anthropic `messages.create` request for a BPMN plan. */
export interface BpmnRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: Anthropic.Messages.ContentBlockParam[] }[];
}

/**
 * Assemble the EXACT request body sent to the model for a BPMN plan — the single
 * source of truth shared by `planBpmn` (which sends it) and the SuperAdmin
 * "Export Full AI Prompt" endpoint (which serialises it), so the export can never
 * drift from what is really sent.
 */
export function buildBpmnRequest(opts: PlanBpmnOptions): BpmnRequest {
  const { prompt, attachment, rules, model = DEFAULT_MODEL, captureGeometry = false } = opts;
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

  // Output cap for the plan JSON. Image ingestion with geometry capture (bounds +
  // per-connector waypoints for every shape) is FAR larger than a text-only plan and
  // was truncating verbose models (Opus) mid-JSON → "Unexpected end of JSON input".
  // Give the big-output Claude models (Opus / Sonnet) more room; keep 16000 for the
  // rest (the largest Kimi K3 + Haiku accept). Salvage below covers any residual cut.
  const maxTokens = cappedMaxTokens(model, /(?:opus|sonnet)/i.test(model) ? 32000 : 16000);
  return { model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: "user", content: userContent }] };
}

/**
 * Call Sonnet with the given prompt + attachment + rules, parse + normalise
 * the JSON response, and return the plan. Does not run the layout engine.
 */
export async function planBpmn(opts: PlanBpmnOptions): Promise<PlanBpmnResult> {
  const { apiKey, model = DEFAULT_MODEL } = opts;
  const client = makeAiClient(model, apiKey);
  // NOTE: max_tokens above ~21333 would trip the SDK's "Streaming is required for
  // operations that may take longer than 10 minutes" guard — but makeAiClient sets
  // an explicit client `timeout`, which skips that guard entirely (see messages.js:
  // the check only runs when the client timeout is unset). So this stays a plain
  // non-streaming create (keeping the telemetry wrapper intact).
  const message = await client.messages.create(buildBpmnRequest(opts));

  const textBlock = message.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { ok: false, status: 500, error: "No response from AI" };
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }
  // Defence-in-depth: extract the first complete { … } object by brace-matching,
  // so any prose the model appended after the JSON (even if it contains braces)
  // is dropped instead of corrupting the parse.
  jsonStr = extractBalancedJson(jsonStr);

  type Plan = { elements: AiElement[]; connections: AiConnection[] };
  const tryParse = (str: string): Plan | null => {
    try { return JSON.parse(str) as Plan; } catch { return null; }
  };
  // 1) as-is  2) trailing-comma repair  3) close a truncated object (salvage the
  // complete elements/connections that did arrive).
  const salvaged = closeTruncatedJson(jsonStr);
  let parsed: Plan | null = tryParse(jsonStr) ?? tryParse(repairJsonCommas(jsonStr));
  if (!parsed && salvaged) parsed = tryParse(salvaged) ?? tryParse(repairJsonCommas(salvaged));

  if (!parsed) {
    // Raw model output can contain generated process content — gate it (ENT-16).
    console.error("[planBpmn] JSON parse failed.", process.env.DEBUG_CONTENT_LOGS === "1"
      ? `Raw response (first 2 KB): ${textBlock.text.slice(0, 2048)}`
      : "(set DEBUG_CONTENT_LOGS=1 to log raw output)");
    return {
      ok: false,
      status: 500,
      error: "Failed to parse AI response as JSON (the model likely returned an incomplete or malformed plan). Try again, or use a less verbose model.",
      raw: jsonStr.substring(0, 800),
    };
  }

  // A salvaged/truncated object may be missing one of the two top-level arrays —
  // coerce so a partial-but-usable diagram still renders rather than erroring.
  if (!Array.isArray(parsed.elements)) parsed.elements = [];
  if (!Array.isArray(parsed.connections)) parsed.connections = [];
  if (parsed.elements.length === 0) {
    return { ok: false, status: 500, error: "The AI response had no usable elements — please try again." };
  }

  /**
   * ELEMENTS WITHOUT FLOW IS NOT "PARTIAL BUT USABLE".
   *
   * The coercion above exists so a response cut off inside `connections` still
   * renders what did arrive. That is right when SOME connections survived. It is
   * wrong when NONE did: a BPMN diagram with a dozen elements and no sequence
   * flow is not a partial process, it is a pile of boxes, and it was being
   * returned as a success. Paul, 2026-09-05, from a prod run:
   *
   *     V22.01 Receive Notification   ✗ 11el / 0conn — no flow
   *
   * `connections` is the LAST array in the response, so it is the first thing a
   * truncation loses — which is why this shape in particular means "cut off"
   * rather than "the model had nothing to say".
   *
   * Refusing lets the batch runner RETRY it (up to three goes, 2735304a), which
   * is the right answer for a truncation: it is not deterministic, and the next
   * attempt usually completes. Salvaging instead spent the retry budget on
   * nothing and saved the wreckage.
   *
   * Same principle Paul set for prompts: no silent truncations.
   */
  const FLOW_NODE = new Set([
    "task", "subprocess", "subprocess-expanded", "start-event", "end-event",
    "intermediate-event", "gateway",
  ]);
  const flowNodes = parsed.elements.filter((e) => FLOW_NODE.has(String(e.type))).length;
  if (parsed.connections.length === 0 && flowNodes > 1) {
    const why = (message as { stop_reason?: string }).stop_reason === "max_tokens"
      ? "the model ran out of room mid-plan"
      : "the response was cut off before any flow arrived";
    return {
      ok: false, status: 500,
      error: `The AI returned ${flowNodes} elements and no sequence flow — ${why}. Nothing was saved; try again.`,
    };
  }

  normaliseAiPlan(parsed);
  return { ok: true, plan: parsed, model };
}

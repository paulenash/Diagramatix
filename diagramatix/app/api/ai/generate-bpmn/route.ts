import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

function buildSystemPrompt(rules: string): string {
  return `You are a BPMN process modelling expert. Given a description of a business process, output a valid JSON object that defines the process as BPMN elements and connections.

${rules ? `USER RULES AND PREFERENCES (follow these strictly):\n${rules}\n\n` : ""}CRITICAL FORMAT RULES — you MUST follow these exactly:
- Use ONLY these type values: "pool", "lane", "start-event", "end-event", "task", "gateway", "subprocess", "subprocess-expanded", "intermediate-event", "data-object", "data-store", "text-annotation", "group"
- NEVER use "startEvent", "endEvent", "exclusiveGateway", "sendTask" etc. — use the hyphenated forms above
- Use "label" (not "name") for all element labels
- Every element MUST have: id, type, label
- Pools MUST have: poolType ("white-box" or "black-box")
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
- CRITICAL: Always place EVERY element mentioned in the prompt, EVEN IF it is not connected to anything. Unconnected elements still appear on the canvas.
- Boundary events (edge-mounted on a task, subprocess, or expanded subprocess): add "boundaryHost": "<elementId>" to the event. Choose placement via "boundarySide":
  * Start events → "left" (default: middle of left edge)
  * End events → "right" (default: middle of right edge)
  * Intermediate events (timers, interrupts, escalations) → "top" or "bottom" near right corner
- CRITICAL: Every diverging gateway (with 2+ outgoing flows) MUST have a corresponding merge gateway downstream where ALL branches reconnect BEFORE any subsequent task. The merge gateway must have the same gatewayType as the diverging gateway. Even if one branch has only one task and the other has multiple, both MUST flow into the merge gateway.
- Connections use: sourceId, targetId, and optionally label and type ("sequence" or "message")
- Use "sequence" for flows within the same pool, "message" for flows between different pools

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

Example 2 — Roles mentioned (Sales, Finance), so lanes are created:
{
  "elements": [
    { "id": "p1", "type": "pool", "label": "Company", "poolType": "white-box" },
    { "id": "l1", "type": "lane", "label": "Sales", "parentPool": "p1" },
    { "id": "l2", "type": "lane", "label": "Finance", "parentPool": "p1" },
    { "id": "e1", "type": "start-event", "label": "Start", "pool": "p1", "lane": "l1" },
    { "id": "t1", "type": "task", "label": "Check Order", "taskType": "user", "pool": "p1", "lane": "l1" },
    { "id": "t2", "type": "task", "label": "Process Payment", "taskType": "service", "pool": "p1", "lane": "l2" },
    { "id": "e2", "type": "end-event", "label": "End", "pool": "p1", "lane": "l2" }
  ],
  "connections": [
    { "sourceId": "e1", "targetId": "t1", "type": "sequence" },
    { "sourceId": "t1", "targetId": "t2", "type": "sequence" },
    { "sourceId": "t2", "targetId": "e2", "type": "sequence" }
  ]
}`;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service not configured. Set ANTHROPIC_API_KEY in .env" }, { status: 503 });
  }

  const { prompt, attachment } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Load General + BPMN-specific default rules
  let rules = "";
  try {
    for (const category of ["general", "bpmn"]) {
      const dr = await prisma.diagramRules.findFirst({
        where: { category, isDefault: true },
        select: { rules: true },
      });
      if (dr?.rules) rules += (rules ? "\n\n" : "") + dr.rules;
    }
  } catch { /* proceed without rules */ }

  try {
    const client = new Anthropic({ apiKey });
    const systemPrompt = buildSystemPrompt(rules);

    console.log("[AI] Generating BPMN with rules:", rules ? "yes" : "no (defaults)");

    // Build user message content: text prompt + optional document attachment
    const userContent: Anthropic.Messages.ContentBlockParam[] = [];
    if (attachment?.type === "pdf" && attachment.data) {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: attachment.data },
      } as Anthropic.Messages.ContentBlockParam);
    } else if (attachment?.type === "text" && attachment.data) {
      userContent.push({ type: "text", text: `--- ATTACHED DOCUMENT: ${attachment.name ?? "document"} ---\n${attachment.data}\n--- END DOCUMENT ---` });
    }
    userContent.push({ type: "text", text: prompt.trim() });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = message.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    let jsonStr = textBlock.text.trim();
    console.log("[AI] Raw response length:", jsonStr.length);

    // Strip markdown fences if present
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    let parsed: { elements: AiElement[]; connections: AiConnection[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("[AI] JSON parse failed:", (parseErr as Error).message);
      return NextResponse.json({
        error: "Failed to parse AI response as JSON. Try again.",
        raw: jsonStr.substring(0, 500),
      }, { status: 500 });
    }

    if (!Array.isArray(parsed.elements) || !Array.isArray(parsed.connections)) {
      console.error("[AI] Invalid structure:", Object.keys(parsed));
      return NextResponse.json({ error: "Invalid AI response structure" }, { status: 500 });
    }

    // Normalize AI output — fix common naming issues
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

    for (const el of parsed.elements) {
      // Fix type names
      if (TYPE_MAP[el.type]) {
        // Infer taskType/gatewayType from original type name
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
      // Fix "name" → "label"
      if (!el.label && (el as unknown as Record<string, unknown>).name) {
        el.label = (el as unknown as Record<string, unknown>).name as string;
      }
      // Fix lane parentPool → pool reference for layout
      if (el.type === "lane" && !el.pool && (el as unknown as Record<string, unknown>).parentPool) {
        el.pool = (el as unknown as Record<string, unknown>).parentPool as string;
      }
    }

    console.log("[AI] Normalized:", parsed.elements.length, "elements,", parsed.connections.length, "connections");
    console.log("[AI] Types:", [...new Set(parsed.elements.map(e => e.type))].join(", "));

    const diagramData = layoutBpmnDiagram(parsed.elements, parsed.connections);

    return NextResponse.json({
      diagramData,
      elementCount: parsed.elements.length,
      connectionCount: parsed.connections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AI generate-bpmn] error:", msg);
    return NextResponse.json({ error: `AI generation failed: ${msg}` }, { status: 500 });
  }
}

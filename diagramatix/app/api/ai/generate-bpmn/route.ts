import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";

function buildSystemPrompt(rules: string): string {
  return `You are a BPMN process modelling expert. Given a description of a business process, output a valid JSON object that defines the process as BPMN elements and connections.

${rules ? `USER RULES AND PREFERENCES (follow these strictly):\n${rules}\n\n` : ""}CRITICAL FORMAT RULES — you MUST follow these exactly:
- Use ONLY these type values: "pool", "lane", "start-event", "end-event", "task", "gateway", "subprocess", "intermediate-event"
- NEVER use "startEvent", "endEvent", "exclusiveGateway", "sendTask" etc. — use the hyphenated forms above
- Use "label" (not "name") for all element labels
- Every element MUST have: id, type, label
- Pools MUST have: poolType ("white-box" or "black-box")
- Lanes MUST have: parentPool (the pool id they belong to)
- Flow elements (tasks, gateways, events) MUST have: pool (pool id) and lane (lane id if applicable)
- Tasks should have: taskType ("user", "service", "send", "receive", "manual", "none")
- Gateways should have: gatewayType ("exclusive", "parallel", "inclusive")
- CRITICAL: Every diverging gateway (with 2+ outgoing flows) MUST have a corresponding merge gateway downstream where ALL branches reconnect BEFORE any subsequent task. The merge gateway must have the same gatewayType as the diverging gateway. Even if one branch has only one task and the other has multiple, both MUST flow into the merge gateway.
- Connections use: sourceId, targetId, and optionally label and type ("sequence" or "message")
- Use "sequence" for flows within the same pool, "message" for flows between different pools

Output ONLY valid JSON (no markdown, no explanation, no comments):
{
  "elements": [
    { "id": "p1", "type": "pool", "label": "Customer", "poolType": "black-box" },
    { "id": "p2", "type": "pool", "label": "Company", "poolType": "white-box" },
    { "id": "p3", "type": "pool", "label": "Salesforce", "poolType": "black-box" },
    { "id": "l1", "type": "lane", "label": "Sales Team", "parentPool": "p2" },
    { "id": "l2", "type": "lane", "label": "Finance Team", "parentPool": "p2" },
    { "id": "e1", "type": "start-event", "label": "Order Received", "pool": "p2", "lane": "l1" },
    { "id": "e2", "type": "task", "label": "Check Order", "taskType": "user", "pool": "p2", "lane": "l1" },
    { "id": "e3", "type": "gateway", "label": "Approved?", "gatewayType": "exclusive", "pool": "p2", "lane": "l1" },
    { "id": "e4", "type": "task", "label": "Process Payment", "taskType": "service", "pool": "p2", "lane": "l2" },
    { "id": "e5", "type": "task", "label": "Send Rejection", "taskType": "send", "pool": "p2", "lane": "l1" },
    { "id": "e6", "type": "gateway", "label": "", "gatewayType": "exclusive", "pool": "p2", "lane": "l2" },
    { "id": "e7", "type": "end-event", "label": "Complete", "pool": "p2", "lane": "l2" }
  ],
  "connections": [
    { "sourceId": "p1", "targetId": "e1", "type": "message", "label": "Order Email" },
    { "sourceId": "e1", "targetId": "e2", "type": "sequence" },
    { "sourceId": "e2", "targetId": "e3", "type": "sequence" },
    { "sourceId": "e3", "targetId": "e4", "type": "sequence", "label": "Yes" },
    { "sourceId": "e3", "targetId": "e5", "type": "sequence", "label": "No" },
    { "sourceId": "e4", "targetId": "e6", "type": "sequence" },
    { "sourceId": "e5", "targetId": "e6", "type": "sequence" },
    { "sourceId": "e6", "targetId": "e7", "type": "sequence" },
    { "sourceId": "e5", "targetId": "p1", "type": "message", "label": "Rejection Notice" }
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

  const { prompt } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Load General rules + BPMN-specific rules (user's or defaults)
  let rules = "";
  try {
    let orgId: string | null = null;
    try { orgId = await getCurrentOrgId(session, await cookies()); } catch { /* no org */ }

    for (const category of ["general", "bpmn"]) {
      let catRules = "";
      if (orgId) {
        const userRules = await prisma.diagramRules.findFirst({
          where: { category, userId: session.user.id, orgId },
          select: { rules: true },
        });
        if (userRules) catRules = userRules.rules;
      }
      if (!catRules) {
        const defaultRules = await prisma.diagramRules.findFirst({
          where: { category, isDefault: true },
          select: { rules: true },
        });
        if (defaultRules) catRules = defaultRules.rules;
      }
      if (catRules) rules += (rules ? "\n\n" : "") + catRules;
    }
  } catch { /* proceed without rules */ }

  try {
    const client = new Anthropic({ apiKey });
    const systemPrompt = buildSystemPrompt(rules);

    console.log("[AI] Generating BPMN with rules:", rules ? "yes" : "no (defaults)");

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt.trim() }],
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

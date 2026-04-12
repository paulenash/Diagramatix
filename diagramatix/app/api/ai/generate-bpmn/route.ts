import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";

function buildSystemPrompt(rules: string, mode: "plan" | "generate"): string {
  const ruleBlock = rules ? `\n\nUSER RULES AND PREFERENCES:\n${rules}\n` : "";

  if (mode === "plan") {
    return `You are a BPMN process modelling expert. Given a description of a business process, create a structured PLAN for the BPMN diagram.
${ruleBlock}
Output ONLY valid JSON (no markdown, no explanation) in this format:
{
  "pools": [
    { "id": "pool1", "name": "Company Name", "type": "white-box", "lanes": [
      { "id": "lane1", "name": "Sales Team" },
      { "id": "lane2", "name": "Finance Team" }
    ]},
    { "id": "pool2", "name": "Customer", "type": "black-box" },
    { "id": "pool3", "name": "Salesforce", "type": "black-box" }
  ],
  "elements": [
    { "id": "e1", "type": "start-event", "label": "Start", "pool": "pool1", "lane": "lane1" },
    { "id": "e2", "type": "task", "label": "Check Order", "taskType": "user", "pool": "pool1", "lane": "lane1" },
    { "id": "e3", "type": "gateway", "label": "Customer exists?", "gatewayType": "exclusive", "pool": "pool1", "lane": "lane1" },
    { "id": "e4", "type": "end-event", "label": "End", "pool": "pool1", "lane": "lane2" }
  ],
  "connections": [
    { "sourceId": "e1", "targetId": "e2", "type": "sequence" },
    { "sourceId": "pool2", "targetId": "e1", "type": "message", "label": "Order Email" }
  ]
}

Element types: start-event, end-event, task, gateway, subprocess, intermediate-event
Task types: user, service, manual, script, send, receive, business-rule, none
Gateway types: exclusive, parallel, inclusive, event-based
Connection types: sequence (within same pool), message (between pools)
Pool types: white-box (with lanes, for the main process), black-box (for external entities/systems)`;
  }

  return `You are a BPMN process modelling expert. Given a structured plan, output the final BPMN diagram as valid JSON.
${ruleBlock}
The plan will contain pools, elements with pool/lane assignments, and connections.
Convert it to valid BPMN elements and connections.

Output ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "elements": [
    { "id": "e1", "type": "start-event", "label": "Start" },
    { "id": "e2", "type": "task", "label": "Review Application", "taskType": "user" }
  ],
  "connections": [
    { "sourceId": "e1", "targetId": "e2" },
    { "sourceId": "e2", "targetId": "e3", "label": "Yes" }
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

  const { prompt, mode = "plan" } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Load user's BPMN rules (or system defaults)
  let rules = "";
  try {
    let orgId: string | null = null;
    try { orgId = await getCurrentOrgId(session, await cookies()); } catch { /* no org */ }

    // Try user-specific first
    if (orgId) {
      const userRules = await prisma.bpmnRules.findFirst({
        where: { userId: session.user.id, orgId },
        select: { rules: true },
      });
      if (userRules) rules = userRules.rules;
    }

    // Fall back to default
    if (!rules) {
      const defaultRules = await prisma.bpmnRules.findFirst({
        where: { isDefault: true },
        select: { rules: true },
      });
      if (defaultRules) rules = defaultRules.rules;
    }
  } catch { /* proceed without rules */ }

  try {
    const client = new Anthropic({ apiKey });
    const systemPrompt = buildSystemPrompt(rules, mode as "plan" | "generate");

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
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    if (mode === "plan") {
      // Return the plan for user review
      let plan;
      try { plan = JSON.parse(jsonStr); }
      catch { return NextResponse.json({ error: "Failed to parse AI plan", raw: jsonStr.substring(0, 1000) }, { status: 500 }); }
      return NextResponse.json({ plan, raw: jsonStr });
    }

    // Generate mode — parse and layout
    let parsed: { elements: AiElement[]; connections: AiConnection[] };
    try { parsed = JSON.parse(jsonStr); }
    catch { return NextResponse.json({ error: "Failed to parse AI response", raw: jsonStr.substring(0, 500) }, { status: 500 }); }

    if (!Array.isArray(parsed.elements) || !Array.isArray(parsed.connections)) {
      return NextResponse.json({ error: "Invalid AI response structure" }, { status: 500 });
    }

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

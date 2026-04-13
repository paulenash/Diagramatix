import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";

function buildSystemPrompt(rules: string): string {
  return `You are a BPMN process modelling expert. Given a description of a business process, output a valid JSON object that defines the process as BPMN elements and connections.

${rules ? `USER RULES AND PREFERENCES (follow these strictly):\n${rules}\n\n` : ""}TECHNICAL REQUIREMENTS:
- Every process MUST start with exactly one start-event and end with one or more end-events.
- Use "task" for activities/steps. Set taskType to "user" for human tasks, "service" for automated/system tasks, "send" for sending messages, "receive" for receiving, "manual" for manual tasks, or "none" if unspecified.
- Use "gateway" for decision points. Set gatewayType to "exclusive" for XOR (if/else), "parallel" for AND (fork/join), "inclusive" for OR. Every diverging gateway MUST have a matching merge gateway downstream.
- Use "subprocess" for sub-processes that contain multiple steps.
- Use "intermediate-event" for wait states or signals (set eventType: "timer", "message", "signal", etc.).
- Each element needs a unique id (use short ids like "e1", "e2", etc.) and a descriptive label.
- Connections go from sourceId to targetId. Add a label for gateway conditions (e.g., "Yes", "No", "Approved").
- Keep the process realistic, complete, and professionally structured.

Output ONLY valid JSON in this exact format (no markdown, no explanation, no comments):
{
  "elements": [
    { "id": "e1", "type": "start-event", "label": "Order Received" },
    { "id": "e2", "type": "task", "label": "Review Order", "taskType": "user" },
    { "id": "e3", "type": "gateway", "label": "Valid?", "gatewayType": "exclusive" },
    { "id": "e4", "type": "task", "label": "Process Order", "taskType": "service" },
    { "id": "e5", "type": "task", "label": "Reject Order", "taskType": "user" },
    { "id": "e6", "type": "gateway", "label": "", "gatewayType": "exclusive" },
    { "id": "e7", "type": "end-event", "label": "Complete" }
  ],
  "connections": [
    { "sourceId": "e1", "targetId": "e2" },
    { "sourceId": "e2", "targetId": "e3" },
    { "sourceId": "e3", "targetId": "e4", "label": "Yes" },
    { "sourceId": "e3", "targetId": "e5", "label": "No" },
    { "sourceId": "e4", "targetId": "e6" },
    { "sourceId": "e5", "targetId": "e6" },
    { "sourceId": "e6", "targetId": "e7" }
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

  // Load user's BPMN rules (or system defaults)
  let rules = "";
  try {
    let orgId: string | null = null;
    try { orgId = await getCurrentOrgId(session, await cookies()); } catch { /* no org */ }

    if (orgId) {
      const userRules = await prisma.bpmnRules.findFirst({
        where: { userId: session.user.id, orgId },
        select: { rules: true },
      });
      if (userRules) rules = userRules.rules;
    }

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

    console.log("[AI] Parsed:", parsed.elements.length, "elements,", parsed.connections.length, "connections");

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

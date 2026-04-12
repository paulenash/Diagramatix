import { NextResponse } from "next/server";
import { auth } from "@/auth";
import Anthropic from "@anthropic-ai/sdk";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const SYSTEM_PROMPT = `You are a BPMN process modelling expert. Given a description of a business process, output a valid JSON object that defines the process as BPMN elements and connections.

Rules:
- Every process MUST start with exactly one start-event and end with one or more end-events.
- Use "task" for activities/steps. Set taskType to "user" for human tasks, "service" for automated tasks, "manual" for manual tasks, or "none" if unspecified.
- Use "gateway" for decision points. Set gatewayType to "exclusive" for XOR (if/else), "parallel" for AND (fork/join), "inclusive" for OR.
- Use "subprocess" for sub-processes that contain multiple steps.
- Use "intermediate-event" for wait states or signals (set eventType: "timer", "message", "signal", etc.).
- Each element needs a unique id (use short ids like "e1", "e2", etc.) and a descriptive label.
- Connections go from sourceId to targetId. Add a label for gateway conditions (e.g., "Yes", "No", "Approved").
- Keep the process realistic and complete.

Output ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "elements": [
    { "id": "e1", "type": "start-event", "label": "Start" },
    { "id": "e2", "type": "task", "label": "Review Application", "taskType": "user" },
    { "id": "e3", "type": "gateway", "label": "Approved?", "gatewayType": "exclusive" },
    { "id": "e4", "type": "task", "label": "Process Payment", "taskType": "service" },
    { "id": "e5", "type": "task", "label": "Send Rejection", "taskType": "service" },
    { "id": "e6", "type": "end-event", "label": "End" }
  ],
  "connections": [
    { "sourceId": "e1", "targetId": "e2" },
    { "sourceId": "e2", "targetId": "e3" },
    { "sourceId": "e3", "targetId": "e4", "label": "Yes" },
    { "sourceId": "e3", "targetId": "e5", "label": "No" },
    { "sourceId": "e4", "targetId": "e6" },
    { "sourceId": "e5", "targetId": "e6" }
  ]
}`;

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

  try {
    const client = new Anthropic({ apiKey });

    let message;
    const models = ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-sonnet-20240229"];
    for (const model of models) {
      try {
        message = await client.messages.create({
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt.trim() }],
        });
        break; // success
      } catch (modelErr) {
        const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
        if (msg.includes("model") || msg.includes("not_found")) continue; // try next model
        throw modelErr; // re-throw non-model errors
      }
    }
    if (!message) {
      return NextResponse.json({ error: "No compatible AI model available" }, { status: 503 });
    }

    // Extract text content
    const textBlock = message.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Parse JSON from response (strip any markdown fences if present)
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    let parsed: { elements: AiElement[]; connections: AiConnection[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({
        error: "Failed to parse AI response as JSON",
        raw: jsonStr.substring(0, 500),
      }, { status: 500 });
    }

    if (!Array.isArray(parsed.elements) || !Array.isArray(parsed.connections)) {
      return NextResponse.json({ error: "Invalid AI response structure" }, { status: 500 });
    }

    // Layout the elements and create DiagramData
    const diagramData = layoutBpmnDiagram(parsed.elements, parsed.connections);

    return NextResponse.json({
      diagramData,
      elementCount: parsed.elements.length,
      connectionCount: parsed.connections.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[AI generate-bpmn] error:", message);
    return NextResponse.json({ error: `AI generation failed: ${message}` }, { status: 500 });
  }
}

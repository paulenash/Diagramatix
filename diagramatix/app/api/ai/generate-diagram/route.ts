import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";
import type { DiagramType } from "@/app/lib/diagram/types";

const DIAGRAM_PROMPTS: Record<string, string> = {
  "state-machine": `You are a UML State Machine diagram expert. Output ONLY valid JSON with elements and connections.

Element types: "initial-state", "final-state", "state", "composite-state", "submachine", "gateway", "fork-join"
Connection type: "transition" with optional label
Gateway types: "exclusive" (decision/merge)

Output format:
{
  "elements": [
    { "id": "e1", "type": "initial-state", "label": "" },
    { "id": "e2", "type": "state", "label": "Idle" },
    { "id": "e3", "type": "state", "label": "Processing" },
    { "id": "e4", "type": "final-state", "label": "" }
  ],
  "connections": [
    { "sourceId": "e1", "targetId": "e2" },
    { "sourceId": "e2", "targetId": "e3", "label": "start / begin processing" },
    { "sourceId": "e3", "targetId": "e4", "label": "complete" }
  ]
}`,

  "value-chain": `You are a Value Chain diagram expert. Output ONLY valid JSON with elements.

Element types: "chevron" (process step), "chevron-collapsed" (links to sub-diagram), "process-group" (container)
No connectors in value chain diagrams — flow is implied by left-to-right arrangement.

Output format:
{
  "elements": [
    { "id": "g1", "type": "process-group", "label": "Core Processes" },
    { "id": "e1", "type": "chevron", "label": "Inbound Logistics", "group": "g1", "description": "Receiving and storing raw materials" },
    { "id": "e2", "type": "chevron", "label": "Operations", "group": "g1", "description": "Manufacturing and assembly" },
    { "id": "e3", "type": "chevron-collapsed", "label": "Outbound Logistics", "group": "g1", "description": "Distribution to customers" }
  ],
  "connections": []
}`,

  domain: `You are a UML Domain Model expert. Output ONLY valid JSON with elements and connections.

Element types: "uml-class" (entity), "uml-enumeration" (lookup)
Connection types: "uml-association", "uml-aggregation", "uml-composition", "uml-generalisation"

Output format:
{
  "elements": [
    { "id": "e1", "type": "uml-class", "label": "Customer", "attributes": [
      { "name": "id", "type": "Integer", "visibility": "+" },
      { "name": "name", "type": "String", "visibility": "+" }
    ]},
    { "id": "e2", "type": "uml-enumeration", "label": "OrderStatus", "values": ["Pending", "Shipped", "Delivered"] }
  ],
  "connections": [
    { "sourceId": "e1", "targetId": "e2", "type": "uml-association", "sourceMultiplicity": "1", "targetMultiplicity": "*" }
  ]
}`,

  context: `You are a Context Diagram expert. Output ONLY valid JSON with elements and connections.

Element types: "process-system" (central system), "external-entity" (external actors/systems)
Connection type: "flow" with label describing data exchanged

Output format:
{
  "elements": [
    { "id": "e1", "type": "process-system", "label": "Order Management System" },
    { "id": "e2", "type": "external-entity", "label": "Customer" },
    { "id": "e3", "type": "external-entity", "label": "Warehouse" }
  ],
  "connections": [
    { "sourceId": "e2", "targetId": "e1", "label": "Order Request" },
    { "sourceId": "e1", "targetId": "e3", "label": "Shipping Instructions" }
  ]
}`,

  "process-context": `You are a Process Context (Use Case) diagram expert. Output ONLY valid JSON with elements and connections.

Element types: "use-case" (process), "actor" (role/person), "team" (group), "system" (IT system), "system-boundary" (container)
Connection type: "association" with optional label

Output format:
{
  "elements": [
    { "id": "sb1", "type": "system-boundary", "label": "Order System" },
    { "id": "e1", "type": "use-case", "label": "Place Order", "parent": "sb1" },
    { "id": "e2", "type": "actor", "label": "Customer" }
  ],
  "connections": [
    { "sourceId": "e2", "targetId": "e1" }
  ]
}`,
};

function buildSystemPrompt(diagramType: string, rules: string): string {
  const basePrompt = DIAGRAM_PROMPTS[diagramType];
  if (!basePrompt) return "Output valid JSON with elements and connections arrays.";
  const ruleBlock = rules ? `\n\nUSER RULES AND PREFERENCES (follow strictly):\n${rules}\n` : "";
  return basePrompt + ruleBlock;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured. Set ANTHROPIC_API_KEY in .env" }, { status: 503 });

  const { prompt, diagramType } = await req.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  if (!diagramType) return NextResponse.json({ error: "diagramType required" }, { status: 400 });

  // Load General + diagram-specific rules
  let rules = "";
  try {
    let orgId: string | null = null;
    try { orgId = await getCurrentOrgId(session, await cookies()); } catch {}

    for (const category of ["general", diagramType]) {
      let catRules = "";
      if (orgId) {
        const ur = await prisma.diagramRules.findFirst({
          where: { category, userId: session.user.id, orgId },
          select: { rules: true },
        });
        if (ur) catRules = ur.rules;
      }
      if (!catRules) {
        const dr = await prisma.diagramRules.findFirst({
          where: { category, isDefault: true },
          select: { rules: true },
        });
        if (dr) catRules = dr.rules;
      }
      if (catRules) rules += (rules ? "\n\n" : "") + catRules;
    }
  } catch {}

  try {
    const client = new Anthropic({ apiKey });
    const systemPrompt = buildSystemPrompt(diagramType, rules);

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt.trim() }],
    });

    const textBlock = message.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No AI response" }, { status: 500 });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch { return NextResponse.json({ error: "Failed to parse AI JSON", raw: jsonStr.substring(0, 500) }, { status: 500 }); }

    return NextResponse.json({ parsed, diagramType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI failed: ${msg}` }, { status: 500 });
  }
}

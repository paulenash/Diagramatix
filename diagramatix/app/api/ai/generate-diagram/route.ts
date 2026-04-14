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

Element types: "chevron-collapsed" (process — always use this type), "process-group" (value chain container)
No connectors in value chain diagrams — flow is implied by left-to-right arrangement.
Always use "chevron-collapsed" for every process element. Never use "chevron".

Output format:
{
  "elements": [
    { "id": "g1", "type": "process-group", "label": "Core Processes" },
    { "id": "e1", "type": "chevron-collapsed", "label": "Inbound Logistics", "group": "g1", "description": "Receiving and storing raw materials" },
    { "id": "e2", "type": "chevron-collapsed", "label": "Operations", "group": "g1", "description": "Manufacturing and assembly" },
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

  "process-context": `You are a Process Context diagram expert. This is NOT a standard Use Case Diagram — it shows processes in context with their actors, teams, and systems.
Output ONLY valid JSON with elements and connections.

Element types:
- "use-case" — a process (ellipse shape)
- "actor" — a person/role (stick figure shape). Use ONLY for individual human roles.
- "team" — a group/department (group-of-people shape). Use for any team, department, or organisational unit.
- "system" — an IT system or application (computer/monitor shape). Use for software systems, tools, databases, platforms.
- "hourglass" — a time-based trigger or auto-scheduler (hourglass shape). Use for ANY scheduled, time-triggered, recurring, periodic, or automated timing mechanism (e.g. "Auto Scheduler", "Daily Timer", "Monthly Trigger", "Cron Job", "Scheduled Task").
- "system-boundary" — process group container (rectangle)
Connection type: "association" with optional label

IMPORTANT rules:
- The "system-boundary" label MUST always include the words "Process Group" (e.g. "Order Management Process Group", "HR Process Group").
- Place related use-case processes inside a system-boundary using the "parent" field.
- Actors, teams, and systems go OUTSIDE the boundary.
- CRITICAL: If something is a software system, scheduler, application, platform, database, tool, or automated service, it MUST use type "system", NOT "actor". Examples: "Auto Scheduler" → system, "ERP" → system, "CRM" → system, "Email System" → system, "Payroll System" → system.
- Create a short 2-3 character process ID prefix for the process group (e.g. "HR" for Human Resources, "FI" for Finance, "OM" for Order Management).
- Each process label MUST start with its numbered ID in format P-XX-NN (e.g. "P-HR-01 Recruit Staff", "P-HR-02 Onboard Employee", "P-FI-01 Process Invoice").
- If a team or department is mentioned, use "team" type, NOT "actor".
- If an IT system is mentioned that the process interacts with, use "system" type with the system name.
- ORDER the elements array so that actors/teams/systems appear in the JSON between the processes they connect to. This helps the layout engine place them optimally to minimise crossing lines.

Output format:
{
  "elements": [
    { "id": "sb1", "type": "system-boundary", "label": "Order Management Process Group" },
    { "id": "e1", "type": "use-case", "label": "P-OM-01 Place Order", "parent": "sb1" },
    { "id": "e3", "type": "actor", "label": "Customer" },
    { "id": "e2", "type": "use-case", "label": "P-OM-02 Check Stock", "parent": "sb1" },
    { "id": "e4", "type": "team", "label": "Warehouse Team" },
    { "id": "e5", "type": "system", "label": "ERP System" },
    { "id": "e6", "type": "hourglass", "label": "Auto Scheduler" }
  ],
  "connections": [
    { "sourceId": "e3", "targetId": "e1" },
    { "sourceId": "e3", "targetId": "e2" },
    { "sourceId": "e4", "targetId": "e2" },
    { "sourceId": "e5", "targetId": "e2" },
    { "sourceId": "e6", "targetId": "e2" }
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

    // Normalize process-context: auto-correct actors that should be systems or hourglasses
    if (diagramType === "process-context" && Array.isArray(parsed.elements)) {
      const HOURGLASS_KEYWORDS = /\b(scheduler|schedule|scheduled|timer|timed|cron|periodic|recurring|daily|weekly|monthly|yearly|annual|trigger|auto.?schedul)/i;
      const SYSTEM_KEYWORDS = /\b(system|app|application|platform|database|db|erp|crm|saas|api|server|service|tool|software|engine|portal|gateway)\b/i;
      for (const el of parsed.elements) {
        if (typeof el.label !== "string") continue;
        if ((el.type === "actor" || el.type === "system") && HOURGLASS_KEYWORDS.test(el.label)) {
          el.type = "hourglass";
        } else if (el.type === "actor" && SYSTEM_KEYWORDS.test(el.label)) {
          el.type = "system";
        }
      }
    }

    return NextResponse.json({ parsed, diagramType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI failed: ${msg}` }, { status: 500 });
  }
}

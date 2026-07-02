import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { gateLimit, gateElementCount, recordUsage } from "@/app/lib/subscription-route";
import { buildGenericSystemPrompt } from "@/app/lib/ai/generateDiagramPrompt";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";


export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured. Set ANTHROPIC_API_KEY in .env" }, { status: 503 });

  const { prompt, diagramType, attachment } = await req.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  if (!diagramType) return NextResponse.json({ error: "diagramType required" }, { status: 400 });

  // Subscription cap: AI attempts. Check before the model call.
  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // Load General + diagram-specific default rules, then filter to GREEN
  // (AI-enforceable) only. See bpmn/plan/route.ts for the full reasoning.
  let rules = "";
  try {
    for (const category of ["general", diagramType]) {
      const dr = await prisma.diagramRules.findFirst({
        where: { category, isDefault: true },
        select: { rules: true },
      });
      if (dr?.rules) rules += (rules ? "\n\n" : "") + dr.rules;
    }
  } catch {}
  const fullLen = rules.length;
  rules = splitRulesByEnforcement(rules).aiRules;
  console.log("[AI generate-diagram]", diagramType, "full:", fullLen, "chars → green-only:", rules.length, "chars");

  try {
    const client = new Anthropic({ apiKey });
    const systemPrompt = buildGenericSystemPrompt(diagramType, rules);

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
      model: await getAiGenerateModel(),
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
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

    // Element-count gate. Non-BPMN diagrams are capped on Free at 15
    // nodes; reject before recording the AI quota so users don't burn
    // attempts on over-cap output.
    if (Array.isArray(parsed.elements)) {
      const elementBlock = await gateElementCount(
        session.user.id,
        diagramType,
        { elements: parsed.elements },
      );
      if (elementBlock) return elementBlock;
    }
    // Record AFTER success so failed attempts don't burn the user's quota.
    await recordUsage(session.user.id, "aiAttempts");
    return NextResponse.json({ parsed, diagramType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI failed: ${msg}` }, { status: 500 });
  }
}

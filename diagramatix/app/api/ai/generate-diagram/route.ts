import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { prisma } from "@/app/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { makeAiClient, aiApiKey } from "@/app/lib/ai/anthropicClient";
import { enterAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { gateLimit, gateElementCount, recordUsage } from "@/app/lib/subscription-route";
import { buildGenericSystemPrompt } from "@/app/lib/ai/generateDiagramPrompt";
import { groundRulesWithPcf } from "@/app/lib/pcf/promptGrounding";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";


export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const _pol = await gateOrgPolicy(session, "allowAi");
  if (_pol) return _pol;
  await enterAiRouteContext(session, AI_INVOCATION_POINTS.DiagramGenerate);

  const { prompt, diagramType, attachment, pcfNodeId } = await req.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  if (!diagramType) return NextResponse.json({ error: "diagramType required" }, { status: 400 });

  // Provider-aware + vision-aware: image input uses the Vision-model override when
  // set; the selected model then decides the key/endpoint (Claude vs Kimi).
  const model = await resolveGenerateModel(attachment?.type === "image");
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ error: "AI not configured for the selected model. Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY." }, { status: 503 });

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
  rules = await groundRulesWithPcf(prisma, rules, pcfNodeId);
  console.log("[AI generate-diagram]", diagramType, "full:", fullLen, "chars → green-only+pcf:", rules.length, "chars");

  try {
    const client = makeAiClient(model, apiKey);
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
    } else if (attachment?.type === "image" && attachment.data) {
      // Vision input — a photo/screenshot of an existing diagram. Read it as
      // the source of truth (mirrors the BPMN image-to-diagram flow).
      const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
      const mediaType = ALLOWED.includes(attachment.mediaType) ? attachment.mediaType : "image/png";
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: attachment.data },
      } as Anthropic.Messages.ContentBlockParam);
      userContent.push({
        type: "text",
        text: "The attached image is a diagram to reproduce. Treat it as the SOURCE OF TRUTH: transcribe every shape (mapping it to the correct element type) and its label exactly as drawn (OCR the text), and every arrow/line as a connection between the right elements. Do NOT invent elements that aren't in the image. When the image and the text prompt conflict, the image wins.",
      });
    }
    userContent.push({ type: "text", text: prompt.trim() });

    const message = await client.messages.create({
      model,
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

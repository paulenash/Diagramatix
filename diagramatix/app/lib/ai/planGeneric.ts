/**
 * Reusable core of the generic AI diagram planner — the model call + JSON
 * extraction shared by anything that wants "prompt + rules + template → parsed
 * {elements, connections}" for a non-BPMN diagram type. Mirrors the inline logic
 * in app/api/ai/generate-diagram/route.ts (kept in sync), extracted so callers
 * outside that route (e.g. the miner's AI state-machine) can reuse the exact same
 * rules → buildGenericSystemPrompt → Anthropic → parse pipeline.
 *
 * Rules must already be GREEN-filtered (splitRulesByEnforcement(...).aiRules) and
 * the model resolved (getAiGenerateModel()); this helper is deliberately dumb.
 */
import Anthropic from "@anthropic-ai/sdk";
import { makeAiClient } from "@/app/lib/ai/anthropicClient";
import { buildGenericSystemPrompt } from "./generateDiagramPrompt";
import { extractBalancedJson, repairJsonCommas, closeTruncatedJson } from "./planBpmn";

export interface GenericPlanInput {
  apiKey: string;
  model: string;
  diagramType: string;
  rules: string;      // already green-filtered aiRules
  prompt: string;
  attachment?: { type: "pdf" | "text"; data: string; name?: string };
  maxTokens?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface GenericPlan { elements?: any[]; connections?: any[] }

export async function planGeneric(input: GenericPlanInput): Promise<GenericPlan> {
  const client = makeAiClient(input.model, input.apiKey);
  const systemPrompt = buildGenericSystemPrompt(input.diagramType, input.rules);

  const userContent: Anthropic.Messages.ContentBlockParam[] = [];
  if (input.attachment?.type === "pdf" && input.attachment.data) {
    userContent.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.attachment.data },
    } as Anthropic.Messages.ContentBlockParam);
  } else if (input.attachment?.type === "text" && input.attachment.data) {
    userContent.push({ type: "text", text: `--- ATTACHED DOCUMENT: ${input.attachment.name ?? "document"} ---\n${input.attachment.data}\n--- END DOCUMENT ---` });
  }
  userContent.push({ type: "text", text: input.prompt.trim() });

  const message = await client.messages.create({
    model: input.model,
    max_tokens: input.maxTokens ?? 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No AI response");

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }
  // Robust parse (mirrors planBpmn / the generate-diagram route): take the first
  // balanced { … } object (drop appended prose), then try as-is → trailing-comma
  // repair → salvage a truncated object before giving up.
  jsonStr = extractBalancedJson(jsonStr);
  const tryParse = (s: string): GenericPlan | null => {
    try { return JSON.parse(s) as GenericPlan; } catch { return null; }
  };
  const salvaged = closeTruncatedJson(jsonStr);
  const parsed = tryParse(jsonStr) ?? tryParse(repairJsonCommas(jsonStr))
    ?? (salvaged ? (tryParse(salvaged) ?? tryParse(repairJsonCommas(salvaged))) : null);
  if (!parsed) throw new Error("Failed to parse AI JSON");
  return parsed;
}

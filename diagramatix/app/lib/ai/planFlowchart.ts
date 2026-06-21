/**
 * Sonnet-call helper for AI Standard-Flowchart generation (phase 1 of the
 * 2-phase flow). Mirrors planBpmn.ts: build a system prompt, call Sonnet with
 * the prompt + optional attachment (PDF / text / image), parse + normalise the
 * JSON plan. The deterministic top-down layout (phase 2) runs separately in
 * `layoutFlowchartDiagram` — no layout happens here.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Attachment } from "./planBpmn";
import type { AiFcElement, AiFcConnection } from "@/app/lib/diagram/layoutFlowchart";

export interface PlanFlowchartOptions {
  apiKey: string;
  prompt: string;
  attachment?: Attachment;
  /** Green (AI-enforceable) rules markdown. Sent verbatim in the system prompt. */
  rules: string;
  model?: string;
}

export type PlanFlowchartResult =
  | { ok: true; plan: { elements: AiFcElement[]; connections: AiFcConnection[] }; model: string }
  | { ok: false; status: number; error: string; raw?: string };

const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Canonical flowchart element types the model may emit. */
const TYPE_LIST = [
  "terminator", "process", "decision", "io", "document", "multidoc",
  "predefined", "preparation", "manual-input", "manual-op", "display",
  "delay", "database", "onpage", "offpage", "merge",
];

export function buildFlowchartSystemPrompt(rules: string): string {
  return `You are a Standard Flowchart (ISO 5807) modelling expert. Given a description of a process, output a valid JSON object defining the flowchart as elements and connections.

IMAGE INPUT — when an image of an existing flowchart is attached:
- Treat the image as the source of truth. Reverse-engineer the flow from what is drawn, then express it in the JSON format below.
- Map drawn shapes to types: rounded pill / stadium → "terminator"; rectangle → "process"; diamond → "decision"; parallelogram → "io"; document (wavy bottom) → "document"; stacked documents → "multidoc"; double-bar rectangle → "predefined"; hexagon → "preparation"; sloped-top box → "manual-input"; inverted trapezoid → "manual-op"; curved-base box → "display"; D-shape → "delay"; cylinder → "database"; circle → "onpage"; pentagon / home-plate → "offpage"; down-triangle → "merge".
- Read labels with OCR. Do NOT invent steps or branches that are not visible. Use a short placeholder if a label is unreadable.
- Where the user's text prompt adds detail beyond the image, apply it. Where it contradicts the image, prefer the image.

${rules ? `USER RULES AND PREFERENCES (follow these strictly):\n${rules}\n\n` : ""}CRITICAL FORMAT RULES — follow exactly:
- Output ONLY a JSON object with two arrays: "elements" and "connections".
- Each element: { "id": string, "type": one of [${TYPE_LIST.map((t) => `"${t}"`).join(", ")}], "label": string, "lane"?: string }.
- Each connection: { "sourceId": string, "targetId": string, "label"?: string }.
- Use "label" (not "name") everywhere. Give every element a unique short id (e.g. "n1", "n2").
- SWIMLANES: if the process spans multiple actors / roles / systems, set each element's "lane" to the responsible actor's name (e.g. "Customer", "Sales", "Billing System"). The layout draws lanes as vertical swimlane columns left-to-right in first-appearance order, and the flow zig-zags between them as responsibility hands off. If there is only one actor, OMIT "lane" entirely. Do NOT emit swimlane shapes yourself — just tag elements with a "lane".
- Start the flow with exactly one "terminator" labelled "Start" and finish with one or more "terminator" elements labelled "End"/"Stop".
- Model the MAIN sequence as a single top-to-bottom chain of "process" steps.
- A "decision" MUST have two or more outgoing connections, each carrying a branch "label" (e.g. "Yes" / "No"). Decision labels should be phrased as a question ending in "?".
- Where multiple branches rejoin, you MAY add a "merge" element, but it is optional — branches can also connect straight back into a later step.
- Keep ids referentially consistent: every connection's sourceId and targetId must match an element id.

Output the JSON only — no prose, no markdown fences. Your entire response MUST start with \`{\` and end with \`}\`.`;
}

/** Normalise common AI drift (name→label, missing ids) in place. */
export function normaliseFlowchartPlan(parsed: { elements: AiFcElement[]; connections: AiFcConnection[] }): void {
  let auto = 0;
  for (const e of parsed.elements ?? []) {
    if (!e.label && (e as { name?: string }).name) e.label = (e as { name?: string }).name;
    if (!e.id) e.id = `n${++auto}`;
    if (typeof e.type === "string") e.type = e.type.trim();
  }
}

export async function planFlowchart(opts: PlanFlowchartOptions): Promise<PlanFlowchartResult> {
  const { apiKey, prompt, attachment, rules, model = DEFAULT_MODEL } = opts;
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildFlowchartSystemPrompt(rules);

  const userContent: Anthropic.Messages.ContentBlockParam[] = [];
  if (attachment?.type === "pdf" && attachment.data) {
    userContent.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: attachment.data },
    } as Anthropic.Messages.ContentBlockParam);
  } else if (attachment?.type === "text" && attachment.data) {
    userContent.push({
      type: "text",
      text: `--- ATTACHED DOCUMENT: ${attachment.name ?? "document"} ---\n${attachment.data}\n--- END DOCUMENT ---`,
    });
  } else if (attachment?.type === "image" && attachment.data && attachment.mediaType) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: attachment.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
        data: attachment.data,
      },
    } as Anthropic.Messages.ContentBlockParam);
    userContent.push({
      type: "text",
      text: `An image of an existing flowchart is attached above (${attachment.name ?? "flowchart.png"}). Treat the image as the source of truth and reverse-engineer the flowchart plan from it. If the text prompt below adds or contradicts anything visible, prefer the image.`,
    });
  }
  userContent.push({
    type: "text",
    text: prompt.trim() +
      "\n\nReturn ONLY the JSON object. No prose, no preamble, no markdown fences. " +
      "Your entire response MUST start with `{` and end with `}`.",
  });

  const message = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { ok: false, status: 500, error: "No response from AI" };
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  let parsed: { elements: AiFcElement[]; connections: AiFcConnection[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error("[planFlowchart] JSON parse failed. Raw response (first 1 KB):", textBlock.text.slice(0, 1024));
    return {
      ok: false, status: 500,
      error: `Failed to parse AI response as JSON: ${(parseErr as Error).message}`,
      raw: jsonStr.substring(0, 500),
    };
  }

  if (!Array.isArray(parsed.elements) || !Array.isArray(parsed.connections)) {
    return { ok: false, status: 500, error: "Invalid AI response structure" };
  }

  normaliseFlowchartPlan(parsed);
  return { ok: true, plan: parsed, model };
}

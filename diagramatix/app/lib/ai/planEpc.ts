/**
 * Model-call helper for AI EPC generation (phase 1 of the 2-phase flow).
 *
 * Mirrors planFlowchart.ts: build a system prompt, call the model with the
 * prompt + optional attachment (PDF / text / image), parse and normalise the
 * JSON plan. The deterministic vertical layout (phase 2) runs separately in
 * `layoutEpcDiagram` — no layout happens here.
 *
 * The prompt teaches E1-E7 as GREEN rules, because they are rules a model can
 * actually follow: they are about which shape may follow which, and the model
 * is choosing the shapes. Two of them are additionally impossible to break in
 * this plan format at all — `org` is a single string (E7) and only a function
 * carries assignments (E6) — which is the reason the format is shaped that way.
 */
import Anthropic from "@anthropic-ai/sdk";
import { makeAiClient, cappedMaxTokens } from "@/app/lib/ai/anthropicClient";
import type { Attachment } from "./planBpmn";
import type { AiEpcElement, AiEpcConnection } from "@/app/lib/diagram/layoutEpc";

export interface PlanEpcOptions {
  apiKey: string;
  prompt: string;
  attachment?: Attachment;
  /** Green (AI-enforceable) rules markdown. Sent verbatim in the system prompt. */
  rules: string;
  model?: string;
}

export type PlanEpcResult =
  | { ok: true; plan: { elements: AiEpcElement[]; connections: AiEpcConnection[] }; model: string }
  | { ok: false; status: number; error: string; raw?: string };

const DEFAULT_MODEL = "claude-haiku-4-5-20251001"; // AI Generate default (see app/lib/ai/models.ts)

/** The element types the model may emit on the control flow. */
const TYPE_LIST = ["event", "function", "xor", "and", "or", "interface"];

export function buildEpcSystemPrompt(rules: string): string {
  return `You are an ARIS eEPC (Event-driven Process Chain) modelling expert. Given a description of a process, output a valid JSON object defining the EPC as elements and connections.

WHAT AN EPC IS — the rules that make one correct. Follow every one:
- An EPC alternates PASSIVE and ACTIVE. An "event" is a state that has come about ("Invoice received", "Credit approved") — it is passive and does nothing. A "function" is work being done ("Verify invoice") — it is active. They alternate: event, function, event, function.
- E1 STRICT ALTERNATION. Never connect two functions directly, and never connect two events directly. If two steps follow each other, there is an event between them naming the state the first one brought about.
- E2 EVENT-BOUNDED. The chain BEGINS with an event (what triggers the process) and ENDS with an event (the state it brought about). Every chain end must be an event. An "interface" may stand in for an event at either end when the process continues in another EPC.
- E3 AN EVENT CANNOT DECIDE. This is the rule most models get wrong. An "xor" or "or" split must be preceded by a FUNCTION, never by an event — an event is passive and cannot choose. The function is the one that does the deciding ("Check credit rating"), and the events AFTER the split name the outcomes ("Credit approved" / "Credit refused"). An "and" split MAY follow an event, because it is not a choice.
- E4 SPLIT OR JOIN, NEVER BOTH. A connector has either one input and several outputs, or several inputs and one output. Never several of both.
- E5 MATCH THE SPLIT. A split should be closed by a JOIN OF THE SAME TYPE — an "xor" split closes with an "xor" join, an "and" split with an "and" join. Do not close an "and" with an "xor".
- Name events in the PAST TENSE as a state: "Order received", "Payment failed", "Goods dispatched". Name functions as an ACTIVE verb phrase: "Verify invoice", "Approve credit limit", "Dispatch goods".
- Each branch out of an xor or or split leads first to an EVENT naming that outcome. Put the outcome in the event's label, and also on the connection's "label".

WHO DOES IT, AND WITH WHAT — assignments belong to a function:
- Set "org" on a function to the department or role responsible for it ("Accounts Payable", "Credit Officer"). One value only: a function has at most ONE responsible party.
- Set "data" on a function to the information objects it reads or writes ("Invoice", "Customer record").
- Set "system" on a function to the application systems the work happens in ("SAP", "Salesforce").
- Only a "function" may carry org / data / system. Never put them on an event, a connector or an interface. Do NOT emit organisational units, information objects or application systems as ELEMENTS — the layout draws them beside their function automatically.

IMAGE INPUT — when an image of an existing EPC is attached:
- Treat the image as the source of truth. Reverse-engineer the chain from what is drawn, then express it in the JSON format below.
- Map drawn shapes to types: elongated hexagon (usually pink) → "event"; rounded rectangle (usually green) → "function"; circle containing x → "xor"; circle containing a caret / wedge pointing up → "and"; circle containing v → "or"; chevron / arrow-shaped box → "interface"; box with a rounded left edge (usually yellow) → an "org" value on the function it touches; box with a bar down its left edge → a "data" value; box with bars at both sides → a "system" value.
- Read labels with OCR. Do NOT invent steps or branches that are not visible. Use a short placeholder if a label is unreadable.
- Where the user's text prompt adds detail beyond the image, apply it. Where it contradicts the image, prefer the image.

${rules ? `USER RULES AND PREFERENCES (follow these strictly):\n${rules}\n\n` : ""}CRITICAL FORMAT RULES — follow exactly:
- Output ONLY a JSON object with two arrays: "elements" and "connections".
- Each element: { "id": string, "type": one of [${TYPE_LIST.map((t) => `"${t}"`).join(", ")}], "label": string, "org"?: string, "data"?: string[], "system"?: string[] }.
- Each connection: { "sourceId": string, "targetId": string, "label"?: string }.
- Use "label" (not "name") everywhere. Give every element a unique short id (e.g. "n1", "n2").
- Keep ids referentially consistent: every connection's sourceId and targetId must match an element id.
- Do NOT emit position or size — the layout places everything.

Output the JSON only — no prose, no markdown fences. Your entire response MUST start with \`{\` and end with \`}\`.`;
}

/** Normalise common AI drift (name→label, missing ids, a scalar where an array belongs). */
export function normaliseEpcPlan(parsed: { elements: AiEpcElement[]; connections: AiEpcConnection[] }): void {
  let auto = 0;
  for (const e of parsed.elements ?? []) {
    if (!e.label && (e as { name?: string }).name) e.label = (e as { name?: string }).name;
    if (!e.id) e.id = `n${++auto}`;
    if (typeof e.type === "string") e.type = e.type.trim();
    // Models routinely emit "data": "Invoice" where the format asks for a list.
    // Coercing is safe and lossless; rejecting would throw away a good plan.
    for (const key of ["data", "system"] as const) {
      const v = e[key] as unknown;
      if (typeof v === "string") e[key] = v.trim() ? [v.trim()] : [];
      else if (Array.isArray(v)) e[key] = v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim());
      else if (v != null) delete e[key];
    }
    // E7 is structural here: one responsible party, so a list collapses to its
    // first entry rather than quietly assigning two lanes on conversion.
    const org = e.org as unknown;
    if (Array.isArray(org)) e.org = org.find((x) => typeof x === "string" && x.trim())?.trim();
    else if (typeof org === "string") e.org = org.trim() || undefined;
    else if (org != null) delete e.org;
  }
}

export async function planEpc(opts: PlanEpcOptions): Promise<PlanEpcResult> {
  const { apiKey, prompt, attachment, rules, model = DEFAULT_MODEL } = opts;
  const client = makeAiClient(model, apiKey);
  const systemPrompt = buildEpcSystemPrompt(rules);

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
      text: `An image of an existing EPC is attached above (${attachment.name ?? "epc.png"}). Treat the image as the source of truth and reverse-engineer the plan from it. If the text prompt below adds or contradicts anything visible, prefer the image.`,
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
    // See planBpmn: 8192 truncated larger plans mid-JSON on verbose models.
    max_tokens: cappedMaxTokens(model, 16000),
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

  let parsed: { elements: AiEpcElement[]; connections: AiEpcConnection[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    // Raw model output can contain generated process content — gate it (ENT-16).
    console.error("[planEpc] JSON parse failed.", process.env.DEBUG_CONTENT_LOGS === "1"
      ? `Raw response (first 1 KB): ${textBlock.text.slice(0, 1024)}`
      : "(set DEBUG_CONTENT_LOGS=1 to log raw output)");
    return {
      ok: false, status: 500,
      error: `Failed to parse AI response as JSON: ${(parseErr as Error).message}`,
      raw: jsonStr.substring(0, 500),
    };
  }

  if (!Array.isArray(parsed.elements) || !Array.isArray(parsed.connections)) {
    return { ok: false, status: 500, error: "Invalid AI response structure" };
  }

  normaliseEpcPlan(parsed);
  return { ok: true, plan: parsed, model };
}

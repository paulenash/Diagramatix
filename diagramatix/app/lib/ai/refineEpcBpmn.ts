/**
 * Optional AI "tidy" pass for a deterministically-translated EPC→BPMN plan.
 *
 * Structure is LOCKED by construction, and not by asking nicely: the merge
 * starts from the deterministic plan and overlays only whitelisted fields
 * matched by id, so no element or connection can be added, removed, re-typed or
 * re-parented whatever the model returns. That merge is `mergeRefinement`,
 * shared with the flowchart pass — the safety-critical half lives in exactly one
 * place. Any failure returns the input unchanged and burns no quota.
 *
 * **One job, not two.** The original plan gave this pass a second job: judge
 * whether a dropped EPC intermediate event was genuinely a timer or a message,
 * and reinstate it. That is out of scope and stays out, because reinstating an
 * element is a structural change — the one thing the safety story forbids. An
 * event dropped by the translator is named in the report instead, where a person
 * can put it back deliberately. Naming the omission is the point: a pass that
 * quietly did nothing about it would look complete.
 */
import Anthropic from "@anthropic-ai/sdk";
import { makeAiClient } from "@/app/lib/ai/anthropicClient";
import { mergeRefinement, type RefinedPayload } from "@/app/lib/ai/refineFlowchartBpmn";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001"; // AI Generate default (see app/lib/ai/models.ts)

export interface RefineEpcResult {
  elements: AiElement[];
  connections: AiConnection[];
  refined: boolean;
}

const SYSTEM = `You tidy a BPMN plan that was mechanically derived from an EPC (event-driven process chain). You have TWO jobs.

JOB 1 — TASK NAMES. EPC functions are conventionally named as NOUN PHRASES — "Invoice verification", "Credit limit approval" — and BPMN tasks are named as VERB PHRASES: "Verify invoice", "Approve credit limit". Rewrite them.

JOB 2 — GATEWAY DECISIONS. An EPC connector is an unlabelled circle, so every gateway in this plan arrives with an EMPTY label and its outgoing flows carrying the wording of the events that followed the split — "Credit approved", "Credit refused". BPMN says it the other way round: the GATEWAY asks the question and the FLOWS answer it.

So for each gateway with two or more outgoing flows:
- Write the gateway's "label" as the QUESTION the flow labels are answers to, ending in "?" — "Credit approved?", "Stock available?", "Order over $10,000?".
- Rewrite each outgoing flow's "label" as the ANSWER: "Yes" / "No" where the branches are a yes/no pair, otherwise the shortest wording that still distinguishes them ("Approved" / "Referred" / "Declined").
- THE MAPPING MUST NOT MOVE. The flow that said "Credit approved" is the one that must now say "Yes". Getting this backwards inverts the process while leaving a diagram that looks perfectly correct, which is the worst thing you can do here — if you are not certain which answer belongs to which flow, leave that gateway's labels exactly as they are.
- A gateway with ONE outgoing flow is a join. Leave joins unlabelled and leave their flows alone.
- A parallel gateway takes every branch, so there is no question to ask. Leave parallel gateways unlabelled.

You may improve ONLY these fields: each element's "label", a task's "taskType" ("user" | "service" | "manual" | "send" | "receive" | "none"), a gateway's "gatewayType" ("exclusive" | "parallel" | "inclusive"), an event's "eventType", and a connection's "label".

Connection labels are BRANCH CONDITIONS carried over from the events after a decision ("Credit approved", "Credit refused"). Keep their meaning exactly; you may shorten them.

You MUST NOT add, remove, reorder or re-parent any element or connection, and MUST NOT change any "id", "type", "pool", "lane" or "parentSubprocess". Return the SAME elements and connections with only those fields adjusted. Output ONLY JSON: {"elements":[...],"connections":[...]} — no markdown, no commentary.`;

export async function refineEpcBpmnPlan(opts: {
  apiKey: string;
  elements: AiElement[];
  connections: AiConnection[];
  model?: string;
}): Promise<RefineEpcResult> {
  const { apiKey, elements, connections } = opts;
  const model = opts.model ?? DEFAULT_MODEL;
  try {
    const client = makeAiClient(model, apiKey);
    const resp = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify({ elements, connections }) }],
    });
    const text = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const parsed = extractJson(text);
    if (!parsed) return { elements, connections, refined: false };
    return { ...mergeRefinement(elements, connections, parsed), refined: true };
  } catch {
    return { elements, connections, refined: false };
  }
}

/** Tolerant JSON extraction — strips markdown fences / preamble. */
function extractJson(text: string): RefinedPayload | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

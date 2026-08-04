/**
 * POST /api/ai/command  — Abracadabra Mode AI fallback.
 *   Body: { instruction: string, state: DiagramData }
 *   Returns: { ops: AssistOp[] } — a small edit-op list the editor applies to
 *   the CURRENT diagram. This is the incremental (delta) counterpart to the
 *   whole-diagram generate flow; the deterministic grammar handles common
 *   phrasings client-side and only falls through to here for the rest.
 *
 * Metering: a Raw Attempt only (LiveCommand is NOT in AI_USER_METERED_POINTS),
 * so a chatty editing session never burns the coarse aiAttempts quota.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { makeAiClient, aiApiKey } from "@/app/lib/ai/anthropicClient";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { validateOps } from "@/app/lib/assist/ops";
import { serializeDiagramForCommand } from "@/app/lib/assist/serializeDiagram";
import type { DiagramData } from "@/app/lib/diagram/types";

const SYSTEM = `You translate ONE spoken instruction from a process modeller into a small list of edit operations on the CURRENT BPMN diagram. Output ONLY a JSON array of ops — no prose, no markdown.

Op shapes (use element NAMES for refs — they are resolved against the diagram; you may also use "it"/"the last"/"the previous"/"the <type>"):
  { "op":"add", "symbolType": <type>, "label"?: string, "gatewayType"?: "exclusive"|"parallel"|"inclusive"|"event-based", "eventType"?: "message"|"timer"|"error"|..., "afterRef"?: <name> }
  { "op":"connect", "fromRef": <name>, "toRef": <name> }
  { "op":"disconnect", "fromRef": <name>, "toRef": <name> }
  { "op":"delete", "ref": <name> }
  { "op":"rename", "ref": <name>, "label": string }
  { "op":"undo" }

<type> is one of: task, gateway, start-event, end-event, intermediate-event, subprocess, data-object, data-store, text-annotation.
Rules: prefer the smallest op list that satisfies the instruction. Use "afterRef" when the user says a new element follows an existing one (this also connects them). Only reference elements that exist in the diagram (below) — except for a brand-new element you are adding. If the instruction is not an editing command, return [].`;

function extractJsonArray(text: string): unknown {
  const s = text.indexOf("["), e = text.lastIndexOf("]");
  if (s === -1 || e === -1 || e < s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pol = await gateOrgPolicy(session, "allowAi");
  if (pol) return pol;
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.LiveCommand));

  const body = await req.json().catch(() => null) as { instruction?: string; state?: DiagramData } | null;
  const instruction = body?.instruction?.trim();
  if (!instruction) return NextResponse.json({ error: "instruction is required" }, { status: 400 });
  const state = body?.state ?? { elements: [], connectors: [] } as unknown as DiagramData;

  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ ops: [] }); // no AI configured → no-op

  try {
    const client = makeAiClient(model, apiKey);
    const resp = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `CURRENT DIAGRAM:\n${serializeDiagramForCommand(state)}\n\nINSTRUCTION:\n${instruction}\n\nReturn the JSON op array.`,
      }],
    });
    const text = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const ops = validateOps(extractJsonArray(text));
    return NextResponse.json({ ops });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/ai/command] error:", message);
    return NextResponse.json({ ops: [], error: message }, { status: 200 });
  }
}

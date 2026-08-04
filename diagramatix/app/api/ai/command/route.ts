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
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { prisma } from "@/app/lib/db";
import type { DiagramData } from "@/app/lib/diagram/types";

/** Load the admin-editable GREEN "assist" command rules (aliases / phrasing
 *  hints). Red rules in that category are code-enforced invariants and are not
 *  sent to the model. Returns "" on any error so the fallback still works. */
async function loadAssistGreenRules(): Promise<string> {
  try {
    const dr = await prisma.diagramRules.findFirst({
      where: { category: "assist", isDefault: true },
      select: { rules: true },
    });
    if (!dr?.rules) return "";
    return splitRulesByEnforcement(dr.rules).aiRules;
  } catch {
    return "";
  }
}

const SYSTEM = `You interpret ONE spoken (often mis-transcribed) instruction from a process modeller editing a BPMN diagram. Output ONLY a JSON OBJECT — no prose, no markdown:
  { "canonical": string, "ops": [ …op objects… ] }

**canonical** (preferred): rewrite the instruction as ONE plain command using the exact phrasings below, keeping the user's names/numbers, and FIXING obvious speech mis-hears ("poll"/"pull"→pool, "line"→lane, "lane two"→Lane 2). The app re-parses this deterministically, so it's the safest path. Use "" if it doesn't fit any form.
Canonical forms:
  add a <type> called <name> after <name>   ·   connect <name> to <name>   ·   disconnect <name> from <name>
  rename <name> to <name>   ·   move <name> <n> elements <left|right|up|down>
  delete <name>   ·   delete <name> and compact   ·   add a boundary event called <name> to <name>
  add a pool   ·   add a black-box pool above|below existing pools   ·   put a pool around everything (wraps loose elements)
  add <n> lanes to <pool> called <A, B and C>   ·   add a lane above|below <lane>   ·   add <n> sublanes to <lane> called <A, B and C>   ·   swap <lane> with <lane>
  compress <pool>   ·   extend the pools to include all elements   ·   nudge <pool> up|down   ·   again
  add a message from <name> to <name> labelled <text>   ·   rename connector <text> to <text>   ·   delete connector <text>
  clear the diagram   ·   export the diagram to JSON   ·   undo that

**ops** (fallback, used only if canonical is ""): the same edit as structured ops.

Op shapes (use element NAMES for refs — they are resolved against the diagram; you may also use "it"/"the last"/"the previous"/"the <type>"):
  { "op":"add", "symbolType": <type>, "label"?: string, "gatewayType"?: "exclusive"|"parallel"|"inclusive"|"event-based", "eventType"?: "message"|"timer"|"error"|..., "afterRef"?: <name> }
  { "op":"connect", "fromRef": <name>, "toRef": <name> }
  { "op":"disconnect", "fromRef": <name>, "toRef": <name> }
  { "op":"delete", "ref": <name>, "compact"?: boolean }   // compact closes the gap left behind
  { "op":"rename", "ref": <name>, "label": string }
  { "op":"move", "ref": <name>, "direction": "left"|"right"|"up"|"down", "count"?: number }
  { "op":"wrapInPool", "label"?: string }                 // put a pool around all un-pooled elements
  { "op":"addBoundary", "hostRef": <name>, "label"?: string, "eventType"?: "error"|"timer"|"message"|... }  // boundary event on a task/subprocess
  { "op":"addPool", "label"?: string, "poolType"?: "black-box"|"white-box", "position"?: "above"|"below" }  // new pool
  { "op":"addLanes", "poolRef": <name>, "labels": [string,…] }      // N equal named lanes in a pool
  { "op":"addLaneAt", "poolRef": <name>, "position": "above"|"below", "refLane": <name>, "label"?: string }  // insert a lane by a ref lane
  { "op":"addSublanes", "laneRef": <name>, "labels": [string,…] }   // N equal named sublanes in a lane
  { "op":"swapLanes", "laneA": <name>, "laneB": <name> }            // swap two adjacent lanes
  { "op":"compressPool", "poolRef": <name> }                        // shrink a pool to fit its contents (verbs: compress/shrink/reduce/shorten/compact/collapse)
  { "op":"extendPools" }                                            // widen ALL pools to the same width, covering every element (verbs: extend/lengthen/widen)
  { "op":"nudgePool", "ref"?: <name>, "direction": "up"|"down", "distance"?: number }  // move a pool a small step (default 20px); ref omitted → the black-box pool
  { "op":"again" }                                                  // repeat the last command (e.g. another nudge)
  { "op":"addMessage", "fromRef": <name>, "toRef": <name>, "label"?: string }  // message flow between an activity and a pool/participant
  { "op":"clear" }                    // empty the whole diagram
  { "op":"export", "format":"json" }  // download the diagram as JSON
  { "op":"undo" }

<type> is one of: task, gateway, start-event, end-event, intermediate-event, subprocess, data-object, data-store, text-annotation.
Rules: prefer canonical whenever the instruction maps to a form above. Use "afterRef" when a new element follows an existing one. Only reference elements that exist in the diagram (below) — except a brand-new element you are adding. If it is not an editing command, return { "canonical": "", "ops": [] }.`;

function extractJsonObject(text: string): { canonical?: unknown; ops?: unknown } | null {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
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
  if (!apiKey) return NextResponse.json({ canonical: "", ops: [] }); // no AI configured → no-op

  const greenRules = await loadAssistGreenRules();
  const system = greenRules
    ? `${SYSTEM}\n\nAdmin-maintained command aliases / phrasing hints (use them when normalising the instruction):\n${greenRules}`
    : SYSTEM;

  try {
    const client = makeAiClient(model, apiKey);
    const resp = await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      messages: [{
        role: "user",
        content: `CURRENT DIAGRAM:\n${serializeDiagramForCommand(state)}\n\nINSTRUCTION:\n${instruction}\n\nReturn the JSON object { "canonical", "ops" }.`,
      }],
    });
    const text = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const obj = extractJsonObject(text);
    const canonical = typeof obj?.canonical === "string" ? obj.canonical.trim() : "";
    const ops = validateOps(obj?.ops);
    return NextResponse.json({ canonical, ops });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/ai/command] error:", message);
    return NextResponse.json({ canonical: "", ops: [], error: message }, { status: 200 });
  }
}

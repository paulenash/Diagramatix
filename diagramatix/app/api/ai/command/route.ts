/**
 * POST /api/ai/command  — Voice Assist AI fallback.
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
import { getAiCommandModel } from "@/app/lib/ai/aiModelSetting";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { gateFeature } from "@/app/lib/subscription-route";
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
  add a pool   ·   add a black-box pool above|below existing pools   ·   add a pool called <name> above|below <pool>   ·   put a pool around everything (wraps loose elements)
  align these (tidily)   ·   align these in a row   ·   align these in a column   ·   align their left edges
  accept the suggestion   ·   take the <type>   ·   take the second one
  add <n> lanes to <pool> called <A, B and C>   ·   add a lane above|below <lane>   ·   add <n> sublanes to <lane> called <A, B and C>   ·   swap <lane> with <lane>
  compress <pool>   ·   extend the pools to include all elements   ·   nudge <name> up|down|left|right (20px; "nudge these left" for the selection)   ·   move these right (the selection, 100px per step)   ·   again
  swap top and bottom · move top to bottom (the SELECTED gateways' connection points; swap exchanges two, move needs the destination free — any pair of top|bottom|middle|left|right; NOT a lane swap unless two lane NAMES are given)
  surround selected with an expanded subprocess called <name>   (the SELECTED elements become the contents of a new expanded subprocess; needs one flow in and one out)
  unwrap the selected subprocess   ·   delete selected (on an expanded subprocess: dissolves it, the contents stay in the flow)
  label selected <text> (the selected connector)   ·   label connectors (numbers them)   ·   rename tasks|lanes|events… (numbers them)
  add a message from <name> to <name> labelled <text>   ·   add a message (numbers the candidates, then "n to m labelled <text>")   ·   add a message to the selected   ·   rename connector <text> to <text>   ·   delete connector <text>
  name these <A, B and C> (the SELECTED elements, in reading order — the counts must match)   ·   assign these to the <name> team   ·   attach risk <code or name> to these
  put a <type> here (at the MOUSE position; "there" too)   ·   rename the one under the cursor to <name>
  clear the diagram   ·   export the diagram to JSON   ·   undo that

**ops** (fallback, used only if canonical is ""): the same edit as structured ops.

Elements marked [selected] are the user's current mouse selection: "this", "these", "the selection" and "the selected <type>" refer to them — KEEP those words in canonical rather than substituting names.

Op shapes (use element NAMES for refs — they are resolved against the diagram; you may also use "it"/"the last"/"the previous"/"the <type>"/"this"/"these"/"the selected <type>"/"the one under the cursor"):
  { "op":"add", "symbolType": <type>, "label"?: string, "gatewayType"?: "exclusive"|"parallel"|"inclusive"|"event-based", "eventType"?: "message"|"timer"|"error"|..., "afterRef"?: <name>, "at"?: "pointer" }
        // "at":"pointer" places it where the MOUSE is ("put a task here"/"there") and draws no connector.
  { "op":"connect", "fromRef": <name>, "toRef": <name> }
  { "op":"disconnect", "fromRef": <name>, "toRef": <name> }
  { "op":"delete", "ref": <name>, "compact"?: boolean }   // compact closes the gap left behind
  { "op":"rename", "ref": <name>, "label": string }
  { "op":"move", "ref": <name>, "direction": "left"|"right"|"up"|"down", "count"?: number }
  { "op":"wrapInPool", "label"?: string }                 // put a pool around all un-pooled elements
  { "op":"addBoundary", "hostRef": <name>, "label"?: string, "eventType"?: "error"|"timer"|"message"|... }  // boundary event on a task/subprocess
  { "op":"addPool", "label"?: string, "poolType"?: "black-box"|"white-box", "position"?: "above"|"below", "relativeTo"?: <pool name> }
        // B7: "relativeTo" is the pool the new one goes above or below. WITHOUT it "position" has no anchor and the
        // pool lands relative to the existing stack, which is rarely what was asked. Always send it when a pool is named.
  { "op":"alignSelection", "mode": "smart"|"center"|"vcenter"|"left"|"right"|"top"|"bottom" }  // align the SELECTED
        // elements. "center" = one horizontal line (a row); "vcenter" = one vertical line (a column); "smart" tidies.
        // If the user says only "align these horizontally", ASK which they mean — it means both things to people.
  { "op":"acceptGhost", "pick"?: string }  // take an Assist ghost suggestion ("accept", "take the gateway",
        // "the second one"). Only when a suggestion is showing; do NOT use it to add an element.
  { "op":"addLanes", "poolRef": <name>, "labels": [string,…] }      // N equal named lanes in a pool
  { "op":"addLaneAt", "poolRef": <name>, "position": "above"|"below", "refLane": <name>, "label"?: string }  // insert a lane by a ref lane
  { "op":"addSublanes", "laneRef": <name>, "labels": [string,…] }   // N equal named sublanes in a lane
  { "op":"swapLanes", "laneA": <name>, "laneB": <name> }            // swap two adjacent lanes
  { "op":"compressPool", "poolRef": <name> }                        // shrink a pool to fit its contents (verbs: compress/shrink/reduce/shorten/compact/collapse)
  { "op":"extendPools" }                                            // widen ALL pools to the same width, covering every element (verbs: extend/lengthen/widen)
  { "op":"nudgePool", "ref"?: <name>, "direction": "up"|"down", "distance"?: number }  // move a pool a small step (default 20px); ref omitted → the black-box pool
  { "op":"movePoolBoundary", "ref"?: <name>, "boundary": "left"|"right"|"top"|"bottom", "direction": "up"|"down"|"left"|"right", "distance"?: number }  // move ONE edge of a pool (a resize). A left/right boundary only takes left/right; a top/bottom one only up/down. "move the pool left boundary right by 40"
  { "op":"moveLane", "ref": <lane name>, "direction": "up"|"down", "distance"?: number }  // shift a lane ½ Task height (32px), keeping its height
  { "op":"again" }                                                  // repeat the last command (e.g. another nudge)
  { "op":"addMessage", "fromRef": <name>, "toRef": <name>, "label"?: string }  // message flow between an activity and a pool/participant
  { "op":"addMessageByNumber", "fromSelection"?: true }  // no ends given: number the candidates and let the user pick
  { "op":"labelSelected", "label"?: string }  // the selected connector
  { "op":"swapGatewayPoints", "a": "top"|"middle"|"bottom"|"left"|"right", "b": same }  // the selected gateways' points
  { "op":"moveGatewayPoint", "from": same, "to": same }  // move ONE connector to a FREE point; swap needs both taken
  { "op":"wrapInSubprocess", "label"?: string }           // surround the SELECTED elements with an expanded subprocess
  { "op":"unwrapSubprocess" }                              // dissolve the SELECTED expanded subprocess back into the flow
  { "op":"renameByType", "itemType": "pool"|"lane"|"message"|"task"|"subprocess"|"gateway"|"event"|"connector" }  // numbers them for a pick
  { "op":"pickTemplate" }   // open the numbered TEMPLATE window; the user then says a number, and "yes" to keep it.
        // Use for anything that asks to add or see a template WITHOUT naming one. Never invent a template name.
  { "op":"fillLabels", "labels": string[] }  // name every SELECTED element at once, in reading order (rows top to
        // bottom, each row left to right). The counts must match; a mismatch is refused, not truncated.
  { "op":"assignTeam", "team": string }      // put the SELECTED activities in a simulation team
  { "op":"attachRiskControl", "ref": string } // attach a Risk or Control from the project's library to the SELECTED
        // elements. "ref" is a code ("R-012") or a name ("duplicate payment"), as spoken.
  { "op":"convert", "ref": string, "subtype": string }  // set a SUBTYPE MARKER on an element that already has the right
        // shape — the same choices as the right-click menu. subtype is the spoken phrase, e.g. "user task",
        // "service task", "parallel gateway", "event-based gateway", "merge", "timer event", "error event",
        // "call subprocess", "transaction", "loop", "MI parallel", "input data object". This CANNOT change a task
        // into a gateway; if that is what was asked, return no ops rather than something adjacent.
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

/** How long one sentence may take to canonicalise before we stop waiting. */
export const COMMAND_TIMEOUT_MS = 20_000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pol = await gateOrgPolicy(session, "allowAi");
  if (pol) return pol;
  // Voice Assist is an Expert-and-above feature (Paul, 2026-09-17). The editor
  // only decides which buttons to draw; this is the half that means anything,
  // since the route is reachable directly. SuperAdmins bypass via the admin-email
  // check inside the availability map.
  const feat = await gateFeature(session.user.id, "voice-assist");
  if (feat) return feat;
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.LiveCommand));

  const body = await req.json().catch(() => null) as { instruction?: string; state?: DiagramData; selectedIds?: string[] } | null;
  const instruction = body?.instruction?.trim();
  if (!instruction) return NextResponse.json({ error: "instruction is required" }, { status: 400 });
  const state = body?.state ?? { elements: [], connectors: [] } as unknown as DiagramData;
  const selectedIds = Array.isArray(body?.selectedIds) ? body!.selectedIds!.filter((s) => typeof s === "string") : [];

  const model = await getAiCommandModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ canonical: "", ops: [] }); // no AI configured → no-op

  const greenRules = await loadAssistGreenRules();
  const system = greenRules
    ? `${SYSTEM}\n\nAdmin-maintained command aliases / phrasing hints (use them when normalising the instruction):\n${greenRules}`
    : SYSTEM;

  // A command bar that sits on "thinking…" for ever is worse than one that says
  // it gave up: the user cannot tell a slow provider from a dead one, and the
  // grammar was going to re-validate the answer anyway. 20s is far longer than
  // a one-sentence rewrite needs.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), COMMAND_TIMEOUT_MS);
  try {
    const client = makeAiClient(model, apiKey);
    const resp = await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      messages: [{
        role: "user",
        content: `CURRENT DIAGRAM:\n${serializeDiagramForCommand(state, selectedIds)}\n\nINSTRUCTION:\n${instruction}\n\nReturn the JSON object { "canonical", "ops" }.`,
      }],
    }, { signal: ac.signal });
    const text = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const obj = extractJsonObject(text);
    const canonical = typeof obj?.canonical === "string" ? obj.canonical.trim() : "";
    const ops = validateOps(obj?.ops);
    return NextResponse.json({ canonical, ops });
  } catch (err) {
    const aborted = ac.signal.aborted;
    const message = aborted
      ? `The command interpreter took longer than ${Math.round(COMMAND_TIMEOUT_MS / 1000)}s — try saying it again, or use a simpler phrasing.`
      : err instanceof Error ? err.message : String(err);
    console.error("[POST /api/ai/command] error:", aborted ? "timeout" : message);
    return NextResponse.json({ canonical: "", ops: [], error: message }, { status: 200 });
  } finally {
    clearTimeout(timeout);
  }
}

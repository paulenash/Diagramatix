import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveOrgModel } from "@/app/lib/ai/orgModels";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { requireNewChainAccess } from "@/app/lib/valueChain/newChainAccess";
import { choosePromptQuestions, coreQuestionSet } from "@/app/lib/valueChain/promptQuestions";

/**
 * POST { title, narrative } — the clarifying questions (up to ten) for a chain about to be created: the fixed core list tailored to the approved
 * narrative by ONE small AI call, or the fixed list alone if that call cannot be made. Create a New Value Chain, step 5. Reads only; not counted
 * against the author's AI attempts (only prompts written are), like the same step in Create Project from Process Repository.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const access = await requireNewChainAccess(session);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as { title?: unknown; narrative?: unknown } | null;
  const title = String(body?.title ?? "").trim();
  const narrative = String(body?.narrative ?? "");
  if (!narrative.trim()) return NextResponse.json(coreQuestionSet());

  const model = await resolveOrgModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json(coreQuestionSet());
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.BpmnRefine));
  return NextResponse.json(await choosePromptQuestions({ apiKey, model, processTitle: title || "New value chain", narrative }));
}

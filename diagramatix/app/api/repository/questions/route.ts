import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";
import { publishedChainFor } from "@/app/lib/valueChain/repositoryChains";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveOrgModel } from "@/app/lib/ai/orgModels";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { choosePromptQuestions, coreQuestionSet } from "@/app/lib/valueChain/promptQuestions";
import { repositoryAccessFor } from "@/app/lib/valueChain/repositoryAccess";

/**
 * POST { code, processCode? } — the clarifying questions (up to ten) asked before a project is created from the Process Repository.
 *
 * The same engine as the SuperAdmin tools (promptQuestions.ts): a fixed core list tailored to the chain's narrative by ONE small AI call, and
 * the fixed list on its own if that call cannot be made. Not counted against the user's AI attempts — only the diagrams generated are.
 * Reads only; nothing is written.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const access = await repositoryAccessFor(session.user.id);
  if (access.mode === "none") return NextResponse.json({ error: "The Process Repository is not part of your subscription." }, { status: 403 });
  const pol = await gateOrgPolicy(session, "allowAi");
  if (pol) return NextResponse.json(coreQuestionSet());            // AI is off for this Org: the fixed list can still be asked

  const body = (await req.json().catch(() => null)) as { code?: unknown; processCode?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  const processCode = typeof body?.processCode === "string" ? body.processCode : "";
  let orgId: string | null = null;
  try { orgId = await getCurrentOrgId(session, await cookies()); } catch { orgId = null; }
  const chain = code ? await publishedChainFor(code, orgId) : null;
  if (!chain) return NextResponse.json({ error: `Value chain ${code} is not available` }, { status: 404 });

  const model = await resolveOrgModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json(coreQuestionSet());
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.BpmnRefine));
  const proc = processCode ? chain.processes.find((p) => p.code === processCode) : undefined;
  return NextResponse.json(await choosePromptQuestions({
    apiKey, model,
    processTitle: proc ? `${proc.code} ${proc.title} (in ${chain.code} ${chain.publishedTitle ?? chain.title})` : `${chain.code} ${chain.publishedTitle ?? chain.title}`,
    narrative: chain.publishedNarrative ?? chain.narrative,
  }));
}

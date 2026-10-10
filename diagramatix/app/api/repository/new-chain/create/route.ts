import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveOrgModel } from "@/app/lib/ai/orgModels";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { requireNewChainAccess } from "@/app/lib/valueChain/newChainAccess";
import { latestChainNarrativeVersion, normaliseBrief } from "@/app/lib/valueChain/chainNarrative";
import {
  attemptsRemaining, createUserChain, maxUserChainsPerOrg, normaliseOptions, planTargets, plannedPromptCount, userChainCount,
} from "@/app/lib/valueChain/newChain";
import { streamChainRun } from "@/app/lib/valueChain/newChainRun";

/**
 * POST — "Create a New Value Chain", the last step: allocate the Org's next C code, create the chain (a draft owned by the author) with its
 * processes and brief, then write its prompts one by one, streaming progress (NDJSON, see newChainRun.ts). Published to the Org when every
 * planned prompt exists; if the run stops (a limit, a spend cap, a failure) the chain stays a draft and /resume carries on.
 *
 * Body: { title, generalNarrative, processes:[{title,details}], narrative (approved), provisionalCode, options:{processContext,archimate},
 *         answers:[{label,answer}], narrativeTemplateVersion }
 *
 * The prompts planned (7–16) are checked against the author's remaining AI attempts BEFORE anything is created, so a run that cannot finish
 * is refused up front instead of stopping half-way. The Org's chain limit is checked here too.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await auth();
  const access = await requireNewChainAccess(session);
  if (!access.ok) return access.response;

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { brief, problems } = normaliseBrief(raw);
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  const narrative = typeof raw?.narrative === "string" ? raw.narrative : "";
  const provisionalCode = typeof raw?.provisionalCode === "string" ? raw.provisionalCode : "";
  if (!narrative.trim()) return NextResponse.json({ error: "Build and approve the narrative first." }, { status: 400 });
  const options = normaliseOptions(raw?.options);
  const answers = (Array.isArray(raw?.answers) ? raw!.answers as unknown[] : [])
    .filter((a): a is { label: string; answer: string } => !!a && typeof (a as { label?: unknown }).label === "string" && typeof (a as { answer?: unknown }).answer === "string")
    .map((a) => ({ label: a.label.slice(0, 120), answer: a.answer.slice(0, 2000) }));
  const echoed = Number(raw?.narrativeTemplateVersion);
  const narrativeTemplateVersion = Number.isInteger(echoed) && echoed >= 1 && echoed <= latestChainNarrativeVersion().version ? echoed : null;

  if (!access.isSuper) {
    const [have, max] = await Promise.all([userChainCount(access.orgId), maxUserChainsPerOrg()]);
    if (have >= max) return NextResponse.json({ error: `Your organisation already has ${have} value chains created this way (the limit is ${max}). Ask your OrgAdmin or SuperAdmin.` }, { status: 403 });
  }
  const needed = plannedPromptCount(options, brief.processes.length);
  const left = await attemptsRemaining(access.userId);
  if (left < needed) {
    return NextResponse.json({
      error: `This value chain needs ${needed} AI attempts and you have ${left} left.`,
      message: `Writing all ${needed} prompts uses ${needed} AI attempts; you have ${left} left. Nothing was created.`,
      metric: "aiAttempts", current: needed, limit: left,
    }, { status: 403 });
  }

  const model = await resolveOrgModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.DiagramGenerate));

  const created = await createUserChain({
    orgId: access.orgId, userId: access.userId, userName: access.userName, brief, narrative, provisionalCode, options, answers,
    narrativeTemplateVersion, narrativeModel: model,
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });

  const allTargets = planTargets(created.code, brief.title, created.processes, options);
  return streamChainRun({
    userId: access.userId, orgId: access.orgId, isSuper: access.isSuper,
    chain: { id: created.chainId, code: created.code, title: brief.title, narrative: created.narrative },
    subs: created.processes, allTargets, targets: allTargets, answers, model, apiKey,
    first: { t: "chain", chainId: created.chainId, code: created.code, title: brief.title, total: allTargets.length, processes: created.processes },
  });
}


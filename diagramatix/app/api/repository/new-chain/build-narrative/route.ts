import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveOrgModel } from "@/app/lib/ai/orgModels";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { requireNewChainAccess } from "@/app/lib/valueChain/newChainAccess";
import { normaliseBrief } from "@/app/lib/valueChain/chainNarrative";
import { buildChainNarrative, loadNarrativeAdditions, modelComplete } from "@/app/lib/valueChain/chainNarrativeAi";
import { nextUserChainCode } from "@/app/lib/valueChain/chainCodes";
import { maxUserChainsPerOrg, userChainCount } from "@/app/lib/valueChain/newChain";

/**
 * POST { title, generalNarrative, processes:[{title,details}] } — build the STRUCTURED NARRATIVE (the sixth master template) for the author
 * to read, edit and approve. Create a New Value Chain, step 4. Writes nothing: no chain exists yet. Costs one AI attempt on success.
 *
 * It is written under the code the chain WOULD get now (the Org's next C number) and re-issued under the real one when the chain is created.
 * The chains-per-Org limit is checked here as well as at creation, so the author finds out before spending anything.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const access = await requireNewChainAccess(session);
  if (!access.ok) return access.response;

  const { brief, problems } = normaliseBrief(await req.json().catch(() => null));
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  if (!access.isSuper) {
    const [have, max] = await Promise.all([userChainCount(access.orgId), maxUserChainsPerOrg()]);
    if (have >= max) return NextResponse.json({ error: `Your organisation already has ${have} value chains created this way (the limit is ${max}). Ask your OrgAdmin or SuperAdmin.` }, { status: 403 });
  }
  const blocked = await gateLimit(access.userId, "aiAttempts");
  if (blocked) return blocked;
  const model = await resolveOrgModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.DiagramGenerate));

  const codes = (await prisma.valueChainLibrary.findMany({ where: { orgId: access.orgId }, select: { code: true } })).map((c) => c.code);
  const code = nextUserChainCode(codes);
  const built = await buildChainNarrative({ code, brief, additions: await loadNarrativeAdditions(access.orgId), complete: modelComplete(apiKey, model) });
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 422 });
  if (!access.isSuper) await recordUsage(access.userId, "aiAttempts");
  // The model name is deliberately not returned: only a SuperAdmin or OrgAdmin ever sees which model is in use.
  return NextResponse.json({ narrative: built.narrative, provisionalCode: code, templateVersion: built.templateVersion });
}

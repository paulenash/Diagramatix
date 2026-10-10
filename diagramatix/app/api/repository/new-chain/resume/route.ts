import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveOrgModel } from "@/app/lib/ai/orgModels";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { requireNewChainAccess } from "@/app/lib/valueChain/newChainAccess";
import { attemptsRemaining, loadChainForRun, missingTargets } from "@/app/lib/valueChain/newChain";
import { canManageChain } from "@/app/lib/valueChain/chainPermissions";
import { streamChainRun } from "@/app/lib/valueChain/newChainRun";

/**
 * POST { chainId } — carry on writing the prompts of a chain whose run stopped (a limit, a spend cap, a failed prompt). Writes ONLY the
 * prompts that do not exist yet, so nothing is charged twice, and publishes the chain when it is complete. The owner, an OrgAdmin of the
 * chain's Org, or a SuperAdmin may do this. A chain the caller may not manage is "not found".
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await auth();
  const access = await requireNewChainAccess(session);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as { chainId?: unknown } | null;
  const chainId = typeof body?.chainId === "string" ? body.chainId : "";
  // A SuperAdmin may resume a chain in any Org; everyone else only their own Org's.
  const orgOfChain = access.isSuper && chainId
    ? (await prisma.valueChainLibrary.findUnique({ where: { id: chainId }, select: { orgId: true } }))?.orgId ?? access.orgId
    : access.orgId;
  const run = chainId ? await loadChainForRun(chainId, orgOfChain) : null;
  if (!run || !canManageChain(access, run.chain)) return NextResponse.json({ error: "Value chain not found" }, { status: 404 });

  const todo = await missingTargets(run.chain.id, run.targets);
  if (todo.length === 0) return NextResponse.json({ error: "Every prompt in this value chain has already been written." }, { status: 409 });
  const left = await attemptsRemaining(access.userId);
  if (left < 1) return NextResponse.json({ error: "You have no AI attempts left.", metric: "aiAttempts" }, { status: 403 });

  const model = await resolveOrgModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.DiagramGenerate));

  return streamChainRun({
    userId: access.userId, orgId: run.chain.orgId, isSuper: access.isSuper,
    chain: { id: run.chain.id, code: run.chain.code, title: run.chain.title, narrative: run.chain.narrative },
    subs: run.subs, allTargets: run.targets, targets: todo, answers: run.answers, model, apiKey,
    first: { t: "chain", chainId: run.chain.id, code: run.chain.code, title: run.chain.title, total: todo.length, resumed: true, processes: run.subs },
  });
}

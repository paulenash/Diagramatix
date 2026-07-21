/**
 * POST — build a STATE MACHINE from a run's state sequences → a NEW
 * `state-machine` diagram in the project; records its id on the run.
 *
 * `{ ai?: boolean, as?: "discovered" | "reference" }`:
 *   • ai:false — deterministic discoverStateMachine (mirrors the log 1:1).
 *   • ai:true  — Claude curates a clean, governable variant via the app's AI
 *                Generate pipeline. Metered against aiAttempts; needs ANTHROPIC_API_KEY.
 *   • as:"discovered" (default) — the DISCOVERED mirror, stored in discoveredSmId.
 *     Regenerated on refresh; treat as read-mostly.
 *   • as:"reference" — a SEPARATE governed rulebook, stored in referenceSmId. It
 *     is a distinct diagram: discovery + refresh never overwrite it, so edits are
 *     safe. (This is the fix for discovered/reference sharing one diagram.)
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { discoverStateMachine } from "@/app/lib/mining/discoverStateMachine";
import { generateStateMachineViaAi } from "@/app/lib/mining/aiStateMachine";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import type { Variant, MiningStats } from "@/app/lib/mining/types";
import type { DiagramData } from "@/app/lib/diagram/types";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, runId } = await params;
  let orgId: string | null = null;
  try {
    const ctx = await requireProjectAccess(session, await cookies(), id, "edit");
    orgId = ctx.projectOrgId ?? null;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const useAi = body?.ai === true;
  const asReference = body?.as === "reference";

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const variants = (run.variants ?? []) as unknown as Variant[];
  if (!Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json({ error: "This run has no variants to discover from." }, { status: 400 });
  }
  const userId = session?.user?.id;

  let data: DiagramData;
  let nameSuffix = asReference ? "reference" : "states";
  if (useAi) {
    const _pol = await gateOrgPolicy(session, "allowAi");
    if (_pol) return _pol;
    const model = await getAiGenerateModel();
    const apiKey = aiApiKey(model);
    if (!apiKey) return NextResponse.json({ error: "AI not configured for the selected model. Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY." }, { status: 503 });
    if (userId) { const block = await gateLimit(userId, "aiAttempts"); if (block) return block; }

    // General + state-machine default rules → GREEN (AI-enforceable) only.
    let rules = "";
    try {
      for (const category of ["general", "state-machine"]) {
        const dr = await prisma.diagramRules.findFirst({ where: { category, isDefault: true }, select: { rules: true } });
        if (dr?.rules) rules += (rules ? "\n\n" : "") + dr.rules;
      }
    } catch { /* rules are best-effort */ }
    rules = splitRulesByEnforcement(rules).aiRules;

    try {
      data = await generateStateMachineViaAi({
        apiKey,
        model,
        rules,
        variants,
        stats: (run.stats ?? {}) as unknown as MiningStats,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `AI generation failed: ${msg}` }, { status: 502 });
    }
    if (userId) await recordUsage(userId, "aiAttempts"); // only after success
    nameSuffix = asReference ? "reference (AI)" : "states (AI)";
  } else {
    data = discoverStateMachine(variants);
  }

  const diagram = await prisma.diagram.create({
    data: {
      name: `${run.name} — ${nameSuffix}`,
      type: "state-machine",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
      userId: userId!, diagramOwnerId: userId ?? null, orgId, projectId: id,
    },
    select: { id: true },
  });
  // A reference is a SEPARATE governed diagram (referenceSmId) — never the
  // discovered mirror — so editing/refreshing one can't disturb the other.
  await prisma.processMiningRun.update({
    where: { id: runId },
    data: asReference ? { referenceSmId: diagram.id } : { discoveredSmId: diagram.id },
  });

  return NextResponse.json({ diagramId: diagram.id, ai: useAi, as: asReference ? "reference" : "discovered" }, { status: 201 });
}

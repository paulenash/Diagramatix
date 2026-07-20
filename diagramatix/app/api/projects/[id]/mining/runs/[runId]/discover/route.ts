/**
 * POST — discover the BPMN process implied by a run's event log → a new `bpmn`
 * diagram in the project. Records the diagram id on the run.
 *
 * Two modes (body):
 *   • default (`{ edgeThreshold? }`) — deterministic: variants → directly-follows
 *     graph → BPMN plan (edgeThreshold 0..1 trims rare paths).
 *   • `{ ai:true }` — Claude curates a clean, readable process via the app's AI
 *     BPMN pipeline (general + bpmn rules, the BPMN prompt, the configured model).
 *     Metered against the AI-attempts quota; needs ANTHROPIC_API_KEY.
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
import { discoverProcess } from "@/app/lib/mining/discoverProcess";
import { generateProcessViaAi } from "@/app/lib/mining/aiProcess";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
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

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const useAi = body?.ai === true;
  const edgeThreshold = typeof body.edgeThreshold === "number" ? Math.max(0, Math.min(1, body.edgeThreshold)) : 0;
  const variants = (run.variants ?? []) as unknown as Variant[];
  if (!Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json({ error: "This run has no variants to discover from." }, { status: 400 });
  }
  const userId = session?.user?.id;

  let data: DiagramData;
  let nameSuffix = "discovered";
  if (useAi) {
    const _pol = await gateOrgPolicy(session, "allowAi");
    if (_pol) return _pol;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI not configured. Set ANTHROPIC_API_KEY." }, { status: 503 });
    if (userId) { const block = await gateLimit(userId, "aiAttempts"); if (block) return block; }

    // General + bpmn default rules → GREEN (AI-enforceable) only.
    let rules = "";
    try {
      for (const category of ["general", "bpmn"]) {
        const dr = await prisma.diagramRules.findFirst({ where: { category, isDefault: true }, select: { rules: true } });
        if (dr?.rules) rules += (rules ? "\n\n" : "") + dr.rules;
      }
    } catch { /* rules are best-effort */ }
    rules = splitRulesByEnforcement(rules).aiRules;

    try {
      data = await generateProcessViaAi({
        apiKey,
        model: await getAiGenerateModel(),
        rules,
        variants,
        stats: (run.stats ?? {}) as unknown as MiningStats,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `AI generation failed: ${msg}` }, { status: 502 });
    }
    if (userId) await recordUsage(userId, "aiAttempts"); // only after success
    nameSuffix = "discovered (AI)";
  } else {
    const { plan } = discoverProcess(variants, { edgeThreshold });
    data = layoutBpmnDiagram(plan.elements, plan.connections, { promptLabel: run.name });
  }

  const diagram = await prisma.diagram.create({
    data: {
      name: `${run.name} — ${nameSuffix}`,
      type: "bpmn",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
      userId: userId!, diagramOwnerId: userId ?? null, orgId, projectId: id,
    },
    select: { id: true },
  });
  await prisma.processMiningRun.update({ where: { id: runId }, data: { discoveredBpmnId: diagram.id } });

  return NextResponse.json({ diagramId: diagram.id, ai: useAi }, { status: 201 });
}

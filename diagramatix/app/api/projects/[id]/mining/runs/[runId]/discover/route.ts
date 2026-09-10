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
import { gateFeature, gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { enterAiContext, AI_INVOCATION_POINTS, recordDiagramGenerated } from "@/app/lib/ai/aiTelemetry";
import { discoverProcess } from "@/app/lib/mining/discoverProcess";
import { isTaskRun, collapseNavForDiscovery } from "@/app/lib/mining/taskMining/insights";
import { badgeEdgeCounts } from "@/app/lib/mining/edgeBadges";
import { annotateTransitions } from "@/app/lib/mining/handover";
import { filterAnalytics, isFilterActive, describeFilter, type MiningFilter } from "@/app/lib/mining/filterAnalytics";
import { formatDuration } from "@/app/lib/mining/analytics";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import { generateProcessViaAi } from "@/app/lib/mining/aiProcess";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { logLayoutDiagnostic } from "@/app/lib/diagram/layoutDiagnosticLog";
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
  const fg = await gateFeature(session?.user?.id ?? "", "processMining");
  if (fg) return fg;

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const useAi = body?.ai === true;
  const edgeThreshold = typeof body.edgeThreshold === "number" ? Math.max(0, Math.min(1, body.edgeThreshold)) : 0;
  const allVariants = (run.variants ?? []) as unknown as Variant[];
  if (!Array.isArray(allVariants) || allVariants.length === 0) {
    return NextResponse.json({ error: "This run has no variants to discover from." }, { status: 400 });
  }

  // DISCOVERY FROM A SLICE.
  //
  // Every other filtered view in the workbench is a live recalculation that
  // disappears when the filter is cleared. Discovery cannot be: it emits a
  // PERSISTED DIAGRAM that will sit in the project list long after the slice
  // that produced it has been forgotten. So this is an explicit action rather
  // than an overlay, and two things follow from that:
  //
  //  - the diagram is NAMED with its slice, because a model of the Northern
  //    region indistinguishable from a model of the whole process is worse
  //    than no model at all; and
  //  - it does NOT become the run\u2019s `discoveredBpmnId`. The run\u2019s canonical
  //    model is the whole log. A slice is a side artefact and replacing the
  //    real one with it would silently narrow every view that reads it.
  const filter = (body.filter ?? {}) as MiningFilter;
  const sliced = isFilterActive(filter);
  const filterNote = describeFilter(filter);
  const analytics = run.analytics as unknown as RunAnalytics | null;

  if (sliced && !analytics) {
    return NextResponse.json({ error: "This run has no case index, so it cannot be sliced. Re-import the log." }, { status: 400 });
  }
  const slice = sliced ? filterAnalytics(analytics, allVariants, filter) : null;
  // Only the variants somebody in the slice actually followed. Keeping the
  // zero-count ones would draw paths the slice never took.
  const variants = slice ? slice.variants.filter((v) => v.count > 0) : allVariants;
  if (variants.length === 0) {
    return NextResponse.json({ error: `No cases match ${filterNote ?? "that filter"}, so there is no process to discover from.` }, { status: 400 });
  }
  const userId = session?.user?.id;

  let data: DiagramData;
  let nameSuffix = "discovered";
  if (useAi) {
    const _pol = await gateOrgPolicy(session, "allowAi");
    if (_pol) return _pol;
    const model = await getAiGenerateModel();
    const apiKey = aiApiKey(model);
    if (!apiKey) return NextResponse.json({ error: "AI not configured for the selected model. Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY." }, { status: 503 });
    if (userId) { const block = await gateLimit(userId, "aiAttempts"); if (block) return block; }
    enterAiContext({ userId, orgId, invocationPoint: AI_INVOCATION_POINTS.MiningDiscover });

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
    // "# diagrams generated using AI" — AI mode only (deterministic discovery below isn't "AI").
    await recordDiagramGenerated({ userId, orgId, diagramType: "bpmn", source: "mining-discover" });
    nameSuffix = "discovered (AI)";
  } else {
    // Task runs: collapse the pure app-switch/open steps for the ROUTINE MAP — they
    // are the same node at multiple points, which turns DFG discovery into a tangled
    // gateway mesh. Collapsing yields a clean work-step routine whose only cycle is
    // the genuine rework loop (the switching is still measured by the Automation tab).
    const dv = isTaskRun(variants) ? collapseNavForDiscovery(variants) : variants;
    const { plan } = discoverProcess(dv, { edgeThreshold });
    // No promptLabel — that stamps an "AI Generated" annotation, which is wrong for
    // the deterministic (1:1-with-the-log) discovery. The AI path keeps its label.
  // Layout diagnostics are collected and logged rather than dropped: a plan whose
  // references dangle produces a diagram that LOOKS fine, which is what made the
  // V06 defects survive three regenerations (Paul, 2026-08-29). Not surfaced in
  // this feature's UI yet — the log is the floor, not the ceiling.
    data = badgeEdgeCounts(layoutBpmnDiagram(plan.elements, plan.connections, { onDiagnostic: logLayoutDiagnostic("mining discover") }));
    // How often each path was taken is already a badge; how LONG it took is
    // the half that was mined, persisted since import and never shown.
    // The SLICE\u2019s edges when there is one \u2014 labelling a filtered model with
    // whole-run timings would be the mixed-provenance defect, persisted.
    const an = (slice?.analytics ?? analytics) as RunAnalytics | null;
    if (an?.edges) data = annotateTransitions(data, an.edges, (ms) => formatDuration(ms, an.clockUnit));
  }

  const diagram = await prisma.diagram.create({
    data: {
      name: sliced ? `${run.name} — ${nameSuffix} (${filterNote})` : `${run.name} — ${nameSuffix}`,
      type: "bpmn",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
      userId: userId!, diagramOwnerId: userId ?? null, orgId, projectId: id,
    },
    select: { id: true },
  });
  // A slice never becomes the run\u2019s model \u2014 see the note above.
  if (!sliced) await prisma.processMiningRun.update({ where: { id: runId }, data: { discoveredBpmnId: diagram.id } });

  return NextResponse.json({ diagramId: diagram.id, ai: useAi, sliced, filter: filterNote, cases: slice?.estimatedCases ?? null }, { status: 201 });
}

/**
 * Rebuild what a run can honestly be rebuilt from.
 *
 * A live run is rebuilt from its source's event buffer — the real thing. A
 * manually imported run has no raw events anywhere, so only what derives from
 * the stored variants is redone: the discovered process, the discovered
 * lifecycle, and the conformance replay. The imported figures (stats,
 * performance, analytics, governance) are left exactly as they are and the
 * response names each one it did not touch, with the reason and the remedy.
 *
 * See `app/lib/mining/recompute.ts` for why the refusals are the point.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
import { planRecompute } from "@/app/lib/mining/recompute";
import { refreshRunFromSource } from "@/app/lib/mining/refreshRun";
import { updateRunJson } from "@/app/lib/mining/runStore";
import { discoverProcess } from "@/app/lib/mining/discoverProcess";
import { discoverStateMachine } from "@/app/lib/mining/discoverStateMachine";
import { badgeEdgeCounts } from "@/app/lib/mining/edgeBadges";
import { annotateTransitions } from "@/app/lib/mining/handover";
import { formatDuration, type RunAnalytics } from "@/app/lib/mining/analytics";
import { flagIllegalTransitions } from "@/app/lib/mining/flagIllegalTransitions";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { logLayoutDiagnostic } from "@/app/lib/diagram/layoutDiagnosticLog";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";
import { writeDiagramData } from "@/app/lib/mining/diagramStore";
import type { Variant } from "@/app/lib/mining/types";
import type { DiagramData } from "@/app/lib/diagram/types";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, runId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const fg = await gateFeature(session?.user?.id ?? "", "processMining");
  if (fg) return fg;

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const source = await prisma.miningSource.findFirst({ where: { runId, projectId: id } });
  const buffer = (source?.buffer as string[][] | null) ?? [];
  const variants = (run.variants ?? []) as unknown as Variant[];

  const plan = planRecompute({
    hasVariants: variants.length > 0,
    hasSourceBuffer: !!source && buffer.length > 0,
    discoveredBpmnId: run.discoveredBpmnId,
    discoveredSmId: run.discoveredSmId,
    referenceSmId: run.referenceSmId,
  });

  // A live run has its raw events still; rebuild it properly.
  if (plan.mode === "source" && source) {
    const result = await refreshRunFromSource(source);
    return NextResponse.json({ ...plan, result });
  }

  if (plan.mode === "impossible") return NextResponse.json(plan);

  // Stored mode: everything below derives from `variants` alone. Nothing here
  // touches stats/performance/analytics/governance — that is the contract.
  let conformance: ReturnType<typeof checkTransitionConformance> | null = null;
  if (run.referenceSmId) {
    const ref = await prisma.diagram.findFirst({ where: { id: run.referenceSmId, projectId: id, type: "state-machine" }, select: { data: true } });
    if (ref) {
      conformance = checkTransitionConformance(variants, (ref.data ?? { elements: [], connectors: [] }) as unknown as ReferenceSm);
      await updateRunJson(runId, { conformance });
    }
  }

  if (run.discoveredBpmnId) {
    const { plan: bpmn } = discoverProcess(variants, { edgeThreshold: 0 });
    // Same account of what the layout could not take at face value as the
    // discover route gives — a re-layout can dangle a reference just as an
    // original can, and a diagram that LOOKS fine is how those survive.
    let data = badgeEdgeCounts(layoutBpmnDiagram(bpmn.elements, bpmn.connections, { onDiagnostic: logLayoutDiagnostic("mining recompute") }));
    const an = run.analytics as unknown as RunAnalytics | null;
    if (an?.edges) data = annotateTransitions(data, an.edges, (ms) => formatDuration(ms, an.clockUnit));
    await writeDiagramData(run.discoveredBpmnId, data);
  }
  if (run.discoveredSmId) {
    let sm: DiagramData = discoverStateMachine(variants);
    if (conformance) sm = flagIllegalTransitions(sm, conformance.transitionStats);
    await writeDiagramData(run.discoveredSmId, sm);
  }

  return NextResponse.json({ ...plan, conformance });
}

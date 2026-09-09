/**
 * Refresh a live ProcessMiningRun in place from a source's accumulated event
 * buffer. Rebuilds the aggregates the importer computes, then — if the run
 * already has a discovered BPMN/State-Machine or a chosen reference — re-runs
 * the deterministic discovery (updating the existing diagrams in place) and the
 * conformance replay (which feeds org Compliance Monitoring). Reuses the same
 * pure pipeline functions as the interactive importer; only deterministic
 * discovery is re-run automatically (AI discovery costs quota and stays manual).
 */
import { prisma } from "@/app/lib/db";
import { updateRunJson } from "./runStore";
import { writeDiagramData } from "./diagramStore";
import { buildEventLog } from "./parseEventLog";
import { computePerformance } from "./performance";
import { computeAnalytics } from "./analytics";
import { computeGovernance, hasGovernance } from "./governance";
import { splitByTime } from "@/app/lib/simulation/validate";
import { discoverProcess } from "./discoverProcess";
import { badgeEdgeCounts } from "./edgeBadges";
import { discoverStateMachine } from "./discoverStateMachine";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { checkTransitionConformance, type ReferenceSm } from "./transitionConformance";
import { flagIllegalTransitions } from "./flagIllegalTransitions";
import type { LogMapping, Performance } from "./types";
import type { DiagramData } from "@/app/lib/diagram/types";

export interface RefreshableSource {
  id: string;
  runId: string | null;
  name: string;
  headerFields: unknown;   // string[]
  buffer: unknown;         // string[][]
  mapping: unknown;        // LogMapping
}

export interface RefreshResult { cases: number; events: number; variants: number }

/** Rebuild the source's live run from its buffer; re-discover + re-conform in place. */
export async function refreshRunFromSource(source: RefreshableSource): Promise<RefreshResult | null> {
  if (!source.runId) return null;
  const headers = (source.headerFields as string[]) ?? [];
  const rows = (source.buffer as string[][]) ?? [];
  const mapping = source.mapping as LogMapping;
  if (!mapping?.caseId || !mapping?.activity || !mapping?.timestamp) return null;

  const log = buildEventLog(headers, rows, mapping);

  // What the run knew before this refresh. Two things have to survive it, and
  // neither did.
  const prior = await prisma.processMiningRun.findUnique({
    where: { id: source.runId },
    select: { performance: true, studyId: true },
  });
  const priorPerf = (prior?.performance ?? {}) as Partial<Performance>;

  // THE HOLD-BACK IS RE-APPLIED, not inherited. Recomputing performance over
  // every trace silently turned an out-of-sample validation into an in-sample
  // one: the twin quietly began marking its own homework, while the panel went
  // on reporting whichever answer a field that had just been dropped implied.
  // Re-splitting at the same percentage keeps the arrangement the user asked
  // for as the log grows.
  const pct = priorPerf.holdout?.pct ?? 0;
  const traceStart = (t: { events: { timestamp: number }[] }) => t.events[0]?.timestamp ?? 0;
  const split = pct > 0
    ? splitByTime(log.traces.map((t) => ({ startMs: traceStart(t), t })), pct)
    : null;
  const performance = computePerformance(split ? split.fit.map((x) => x.t) : log.traces);
  if (split && split.holdout.length > 0) {
    performance.holdout = { pct, splitMs: split.splitMs, cases: split.holdout.length };
  }

  // A twin calibrated before this refresh no longer describes the log. MARKED,
  // not re-calibrated — a study the user has edited must not be rewritten under
  // them. The FIRST divergence date is kept, because what a reader needs is when
  // the twin stopped being true, not when it was last looked at.
  if (prior?.studyId) performance.twinStaleAt = priorPerf.twinStaleAt ?? new Date().toISOString();

  const analytics = computeAnalytics(log);
  const governance = computeGovernance(log.traces);

  // kpiConfig is preserved across a live refresh — it is absent from the patch,
  // which is what "leave this column alone" now looks like.
  await updateRunJson(source.runId, {
    stats: log.stats, variants: log.variants, performance, analytics,
    governance: hasGovernance(governance) ? governance : null,
  });

  const run = await prisma.processMiningRun.findUnique({
    where: { id: source.runId },
    select: { discoveredBpmnId: true, discoveredSmId: true, referenceSmId: true },
  });

  if (run && log.variants.length > 0) {
    // Re-discover the BPMN in place (deterministic).
    if (run.discoveredBpmnId) {
      const { plan } = discoverProcess(log.variants, { edgeThreshold: 0 });
      const data = badgeEdgeCounts(layoutBpmnDiagram(plan.elements, plan.connections)); // no promptLabel → no "AI Generated" tag
      await writeDiagramData(run.discoveredBpmnId, data);
    }
    // Re-discover the state machine in place (deterministic mirror + frequencies).
    let smData: DiagramData | null = run.discoveredSmId ? discoverStateMachine(log.variants) : null;
    // Re-run conformance against the chosen reference (feeds Compliance Monitoring)
    // and paint the illegal transitions red on the discovered mirror.
    if (run.referenceSmId) {
      const ref = await prisma.diagram.findFirst({ where: { id: run.referenceSmId, type: "state-machine" }, select: { data: true } });
      if (ref) {
        const result = checkTransitionConformance(log.variants, (ref.data ?? { elements: [], connectors: [] }) as unknown as ReferenceSm);
        await updateRunJson(source.runId, { conformance: result });
        if (smData) smData = flagIllegalTransitions(smData, result.transitionStats);
      }
    }
    if (run.discoveredSmId && smData) {
      await writeDiagramData(run.discoveredSmId, smData);
    }
  }

  await prisma.miningSource.update({ where: { id: source.id }, data: { lastRefreshAt: new Date() } });
  return { cases: log.stats.cases, events: log.stats.events, variants: log.variants.length };
}

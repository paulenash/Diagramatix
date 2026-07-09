/**
 * Refresh a live ProcessMiningRun in place from a source's accumulated event
 * buffer. Rebuilds the aggregates the importer computes, then — if the run
 * already has a discovered BPMN/State-Machine or a chosen reference — re-runs
 * the deterministic discovery (updating the existing diagrams in place) and the
 * conformance replay (which feeds org Compliance Monitoring). Reuses the same
 * pure pipeline functions as the interactive importer; only deterministic
 * discovery is re-run automatically (AI discovery costs quota and stays manual).
 */
import { prisma, pgPool } from "@/app/lib/db";
import { buildEventLog } from "./parseEventLog";
import { computePerformance } from "./performance";
import { computeGovernance, hasGovernance } from "./governance";
import { discoverProcess } from "./discoverProcess";
import { discoverStateMachine } from "./discoverStateMachine";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { checkTransitionConformance, type ReferenceSm } from "./transitionConformance";
import { flagIllegalTransitions } from "./flagIllegalTransitions";
import type { LogMapping } from "./types";
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
  const performance = computePerformance(log.traces);
  const governance = computeGovernance(log.traces);

  await pgPool.query(
    'UPDATE "ProcessMiningRun" SET stats = $1::jsonb, variants = $2::jsonb, performance = $3::jsonb, governance = $4::jsonb, "updatedAt" = NOW() WHERE id = $5',
    [JSON.stringify(log.stats), JSON.stringify(log.variants), JSON.stringify(performance), JSON.stringify(hasGovernance(governance) ? governance : null), source.runId],
  );

  const run = await prisma.processMiningRun.findUnique({
    where: { id: source.runId },
    select: { discoveredBpmnId: true, discoveredSmId: true, referenceSmId: true },
  });

  if (run && log.variants.length > 0) {
    // Re-discover the BPMN in place (deterministic).
    if (run.discoveredBpmnId) {
      const { plan } = discoverProcess(log.variants, { edgeThreshold: 0 });
      const data = layoutBpmnDiagram(plan.elements, plan.connections, { promptLabel: source.name });
      await pgPool.query('UPDATE "Diagram" SET data = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(data), run.discoveredBpmnId]);
    }
    // Re-discover the state machine in place (deterministic mirror + frequencies).
    let smData: DiagramData | null = run.discoveredSmId ? discoverStateMachine(log.variants) : null;
    // Re-run conformance against the chosen reference (feeds Compliance Monitoring)
    // and paint the illegal transitions red on the discovered mirror.
    if (run.referenceSmId) {
      const ref = await prisma.diagram.findFirst({ where: { id: run.referenceSmId, type: "state-machine" }, select: { data: true } });
      if (ref) {
        const result = checkTransitionConformance(log.variants, (ref.data ?? { elements: [], connectors: [] }) as unknown as ReferenceSm);
        await pgPool.query('UPDATE "ProcessMiningRun" SET conformance = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(result), source.runId]);
        if (smData) smData = flagIllegalTransitions(smData, result.transitionStats);
      }
    }
    if (run.discoveredSmId && smData) {
      await pgPool.query('UPDATE "Diagram" SET data = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(smData), run.discoveredSmId]);
    }
  }

  await prisma.miningSource.update({ where: { id: source.id }, data: { lastRefreshAt: new Date() } });
  return { cases: log.stats.cases, events: log.stats.events, variants: log.variants.length };
}

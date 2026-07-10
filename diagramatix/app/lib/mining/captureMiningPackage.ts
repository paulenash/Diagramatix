/**
 * Capture a project's ProcessMiningRun into a portable MiningExamplePackage —
 * the compressed log (mapping + variants + performance + stats) plus the run's
 * reference state-machine diagram (the single source of truth for conformance).
 * The neutral bundle behind the SuperAdmin "Save run as example" authoring path
 * (adoptMiningPackage is the inverse).
 *
 * Mirrors app/lib/simulation/captureProject.ts.
 */
import { prisma } from "@/app/lib/db";
import type { DiagramData } from "@/app/lib/diagram/types";
import {
  validateMiningExamplePackage,
  type MiningExamplePackage,
  type MiningExampleDiagram,
} from "./examplePackage";
import type { MiningExampleRun } from "./examplePackage";
import type { LogMapping, MiningStats, Variant, Performance, GovernanceStats } from "./types";

export interface CaptureMiningResult { pkg: MiningExamplePackage; runName: string }

/** The ProcessMiningRun fields capture reads (a structural subset of the model). */
type DbRun = {
  name: string; mapping: unknown; stats: unknown; variants: unknown; performance: unknown; governance: unknown;
  referenceSmId: string | null; discoveredSmId: string | null; objectType: string | null;
};

/** Build the portable package for a mining run — or, when the run is part of an
 *  OCEL study (has an ocelGroupId), the WHOLE study: every object type's run +
 *  its discovered + reference state machines + the shared Domain Diagram. Throws
 *  on a missing/empty run or a package that fails validation. */
export async function captureMiningPackage(projectId: string, runId: string): Promise<CaptureMiningResult> {
  const primary = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId } });
  if (!primary) throw new Error("Run not found in project");

  const diagrams: MiningExampleDiagram[] = [];
  const seen = new Set<string>();
  // Capture a diagram by id (dedup); returns its package key (= the id) or undefined.
  const capture = async (id: string | null | undefined): Promise<string | undefined> => {
    if (!id) return undefined;
    if (seen.has(id)) return id;
    const d = await prisma.diagram.findFirst({ where: { id, projectId }, select: { id: true, name: true, type: true, data: true } });
    if (!d) return undefined;
    seen.add(d.id);
    diagrams.push({ key: d.id, name: d.name, type: d.type || "state-machine", data: (d.data ?? {}) as unknown as DiagramData });
    return d.id;
  };

  const toRun = async (r: DbRun): Promise<MiningExampleRun> => {
    const variants = (r.variants ?? []) as unknown as Variant[];
    if (!Array.isArray(variants) || variants.length === 0) throw new Error(`Run "${r.name}" has no variants to capture`);
    const performance = (r.performance ?? null) as unknown as Performance | null;
    if (!performance?.clockUnit) throw new Error(`Run "${r.name}" has no performance data — re-import the log`);
    const governance = (r.governance ?? null) as unknown as GovernanceStats | null;
    const referenceSmKey = await capture(r.referenceSmId);
    const discoveredSmKey = await capture(r.discoveredSmId);
    return {
      name: r.name,
      mapping: (r.mapping ?? {}) as unknown as LogMapping,
      stats: (r.stats ?? {}) as unknown as MiningStats,
      variants,
      performance,
      ...(governance && Object.keys(governance.controls ?? {}).length ? { governance } : {}),
      ...(referenceSmKey ? { referenceSmKey } : {}),
      ...(r.objectType ? { objectType: r.objectType } : {}),
      ...(discoveredSmKey ? { discoveredSmKey } : {}),
    };
  };

  let pkg: MiningExamplePackage;
  if (primary.ocelGroupId) {
    // OCEL study — capture the Domain Diagram + every sibling run (sequentially,
    // so the shared diagrams array isn't raced).
    const siblings = await prisma.processMiningRun.findMany({ where: { projectId, ocelGroupId: primary.ocelGroupId }, orderBy: { createdAt: "asc" } });
    const domainDiagramKey = await capture(primary.domainDiagramId);
    const runs: MiningExampleRun[] = [];
    for (const s of siblings) runs.push(await toRun(s));
    pkg = { version: 1, diagrams, run: runs[0], runs, ...(domainDiagramKey ? { domainDiagramKey } : {}) };
  } else {
    pkg = { version: 1, diagrams, run: await toRun(primary) };
  }

  const errs = validateMiningExamplePackage(pkg);
  if (errs.length) throw new Error(`Captured package invalid: ${errs.join("; ")}`);
  return { pkg, runName: primary.name };
}

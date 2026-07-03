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
import type { LogMapping, MiningStats, Variant, Performance } from "./types";

export interface CaptureMiningResult { pkg: MiningExamplePackage; runName: string }

/** Build the portable package for one mining run in a project. Throws on a
 *  missing run, a run with no reference SM, or a package that fails validation. */
export async function captureMiningPackage(projectId: string, runId: string): Promise<CaptureMiningResult> {
  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId } });
  if (!run) throw new Error("Run not found in project");

  const variants = (run.variants ?? []) as unknown as Variant[];
  if (!Array.isArray(variants) || variants.length === 0) throw new Error("Run has no variants to capture");
  const performance = (run.performance ?? null) as unknown as Performance | null;
  if (!performance?.clockUnit) throw new Error("Run has no performance data — re-import the log");

  // Carry the reference SM diagram (id = package key) when one is set.
  const diagrams: MiningExampleDiagram[] = [];
  let referenceSmKey: string | undefined;
  if (run.referenceSmId) {
    const ref = await prisma.diagram.findFirst({ where: { id: run.referenceSmId, projectId }, select: { id: true, name: true, type: true, data: true } });
    if (ref) {
      diagrams.push({ key: ref.id, name: ref.name, type: ref.type || "state-machine", data: (ref.data ?? {}) as unknown as DiagramData });
      referenceSmKey = ref.id;
    }
  }

  const pkg: MiningExamplePackage = {
    version: 1,
    diagrams,
    run: {
      name: run.name,
      mapping: (run.mapping ?? {}) as unknown as LogMapping,
      stats: (run.stats ?? {}) as unknown as MiningStats,
      variants,
      performance,
      ...(referenceSmKey ? { referenceSmKey } : {}),
    },
  };
  const errs = validateMiningExamplePackage(pkg);
  if (errs.length) throw new Error(`Captured package invalid: ${errs.join("; ")}`);
  return { pkg, runName: run.name };
}

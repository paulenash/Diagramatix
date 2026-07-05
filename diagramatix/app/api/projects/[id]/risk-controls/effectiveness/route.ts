import { NextResponse } from "next/server";
import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { loadProjectLibrary, loadLatestConformance, loadLatestGovernance } from "@/app/lib/riskControls/queries";
import { observedDeviations, controlEffectiveness, logControlEffectiveness } from "@/app/lib/riskControls/controlEffectiveness";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/risk-controls/effectiveness
 * Control operating-effectiveness for the project's controls, from two mined
 * sources: Control IDs carried on event-log events (preferred — direct evidence,
 * Change B) and, failing that, a hand-mapped conformance deviation. Returns the
 * observed deviations (a menu to map controls against) + per-control figures.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardProject(id, "view", false); if (g.error) return g.error;

  const [library, latestConf, latestGov] = await Promise.all([
    loadProjectLibrary(id), loadLatestConformance(id), loadLatestGovernance(id),
  ]);
  if (!latestConf && !latestGov) return NextResponse.json({ run: null, deviations: [], effectiveness: {} });

  const controls = (library?.items ?? []).filter((i) => i.kind === "Control");
  const effectiveness: Record<string, unknown> = {};
  for (const c of controls) {
    // Prefer Control-ID-on-events evidence; fall back to conformance-deviation mapping.
    const e = logControlEffectiveness(c.code, latestGov?.governance)
      ?? (latestConf ? controlEffectiveness(c.monitorSignature, latestConf.conformance) : null);
    if (e) effectiveness[c.id] = e;
  }
  // The headline "run" prefers the conformance run (fitness/cases); else the governance run.
  const run = latestConf
    ? { id: latestConf.runId, name: latestConf.runName, totalCases: latestConf.conformance.totalCases, fitness: latestConf.conformance.fitness }
    : { id: latestGov!.runId, name: latestGov!.runName };
  return NextResponse.json({
    run,
    deviations: latestConf ? observedDeviations(latestConf.conformance) : [],
    effectiveness,
  });
}

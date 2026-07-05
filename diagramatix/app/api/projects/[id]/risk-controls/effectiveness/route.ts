import { NextResponse } from "next/server";
import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { loadProjectLibrary, loadLatestConformance } from "@/app/lib/riskControls/queries";
import { observedDeviations, controlEffectiveness } from "@/app/lib/riskControls/controlEffectiveness";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/risk-controls/effectiveness
 * Control operating-effectiveness from the project's latest mining-conformance
 * run: the observed deviations (a menu to map controls against) + per-control
 * "bypassed in N of M cases". Null run when no conformance has been run yet.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardProject(id, "view", false); if (g.error) return g.error;

  const [library, latest] = await Promise.all([loadProjectLibrary(id), loadLatestConformance(id)]);
  if (!latest) return NextResponse.json({ run: null, deviations: [], effectiveness: {} });

  const controls = (library?.items ?? []).filter((i) => i.kind === "Control");
  const effectiveness: Record<string, unknown> = {};
  for (const c of controls) {
    const e = controlEffectiveness(c.monitorSignature, latest.conformance);
    if (e) effectiveness[c.id] = e;
  }
  return NextResponse.json({
    run: { id: latest.runId, name: latest.runName, totalCases: latest.conformance.totalCases, fitness: latest.conformance.fitness },
    deviations: observedDeviations(latest.conformance),
    effectiveness,
  });
}

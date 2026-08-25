import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/simulation/last-run — the config of the most recent
 * COMPLETED scenario run in this project.
 *
 * The console promises "Replay uses your last scenario run", but it only knew
 * about a run made in the CURRENT session: the config was held in React state
 * and set from the Run button. Open the simulator fresh and that state is null,
 * so the replay silently fell back to its four-hour default window — which
 * starts at t=0 ≙ Monday 00:00 and therefore contains no working hours at all
 * for a team on business hours. The replay ticked and nothing ever happened,
 * while running the same model worked fine.
 *
 * The config was on disk the whole time (`SimulationRun.configSnapshot`, written
 * by the run route). This hands it back so a returning session replays the run
 * it says it is replaying.
 *
 * Gated at "view" like the studies list — replaying is a read.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const run = await prisma.simulationRun.findFirst({
    // Finished only: a run still in flight has a config but no result to replay,
    // and an errored one is not something to reproduce by default.
    where: { scenario: { study: { projectId: id } }, finishedAt: { not: null }, error: null },
    orderBy: { finishedAt: "desc" },
    select: {
      id: true,
      finishedAt: true,
      configSnapshot: true,
      scenario: { select: { id: true, name: true, studyId: true } },
    },
  });

  if (!run) return NextResponse.json({ run: null });

  return NextResponse.json({
    run: {
      id: run.id,
      finishedAt: run.finishedAt,
      scenarioId: run.scenario?.id ?? null,
      scenarioName: run.scenario?.name ?? null,
      studyId: run.scenario?.studyId ?? null,
      config: run.configSnapshot ?? null,
    },
  });
}

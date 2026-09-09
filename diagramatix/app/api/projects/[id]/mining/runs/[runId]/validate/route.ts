/**
 * POST — does the calibrated twin match the real event log it came from?
 *
 * Compares the flow-time distribution the SIMULATION produced against the one
 * the business actually had, and returns an agreement figure with the verdict.
 *
 * Out-of-sample when the log was imported with a hold-back: the twin is fitted
 * on the earlier cases and tested against the later ones it never saw. Without a
 * hold-back the comparison is IN-SAMPLE — still useful as a sanity check, and
 * labelled as the weaker test rather than passed off as the stronger one.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
import { compareDistributions } from "@/app/lib/simulation/validate";
import { SECONDS_PER_UNIT, type ClockUnit } from "@/app/lib/simulation/types";
import type { RunMetrics } from "@/app/lib/simulation/results";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { Performance } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, runId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const fg = await gateFeature(session?.user?.id ?? "", "processMining");
  if (fg) return fg;

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!run.studyId) {
    return NextResponse.json({ error: "Calibrate a digital twin first — there is no simulation to check yet." }, { status: 400 });
  }

  const analytics = (run.analytics ?? null) as unknown as RunAnalytics | null;
  const perf = (run.performance ?? null) as unknown as Performance | null;
  if (!analytics?.cases?.length || !perf?.clockUnit) {
    return NextResponse.json({ error: "This run has no per-case data — re-import the log." }, { status: 400 });
  }

  // The most recent completed run of any scenario in the twin study.
  const simRun = await prisma.simulationRun.findFirst({
    where: { scenario: { studyId: run.studyId }, error: null },
    orderBy: { startedAt: "desc" },
    select: { metrics: true, startedAt: true },
  });
  const metrics = (simRun?.metrics ?? null) as unknown as RunMetrics | null;
  if (!metrics?.stats?.caseFlow) {
    return NextResponse.json({ error: "Run the twin simulation once before checking it against reality." }, { status: 400 });
  }
  const quantiles = metrics.stats.caseFlow.quantiles;
  if (!quantiles?.length) {
    return NextResponse.json({
      error: "That simulation run predates distribution recording — run the twin again and the check can be made.",
    }, { status: 400 });
  }

  // ── Observed cases, in the SAME units as the simulation ────────────────
  // Mining stores milliseconds; the twin runs in the mined clock unit. Comparing
  // them unconverted would report total disagreement between identical processes.
  const unit = (metrics.clockUnit || perf.clockUnit) as ClockUnit;
  const msPerUnit = SECONDS_PER_UNIT[unit] * 1000;

  const holdout = perf.holdout ?? null;
  const observedCases = holdout?.splitMs != null
    ? analytics.cases.filter((c) => c.startMs >= holdout.splitMs!)
    : analytics.cases;
  const observed = observedCases.map((c) => c.cycleMs / msPerUnit);

  const comparison = compareDistributions(quantiles, observed, {
    simulatedN: metrics.stats.caseFlow.count,
    unit,
  });

  return NextResponse.json({
    comparison,
    unit,
    outOfSample: !!holdout,
    holdout,
    // The log moved on after this twin was calibrated. Reported rather than
    // silently corrected: re-calibrating would rewrite a study the user may
    // have edited, and a validation against a twin that no longer describes
    // the log is a number worth distrusting.
    twinStaleAt: perf.twinStaleAt ?? null,
    observedCases: observed.length,
    simulatedAt: simRun?.startedAt ?? null,
    // Said plainly rather than left for the reader to work out: an in-sample
    // check is the model marking its own homework.
    caveat: holdout
      ? `Out-of-sample: the twin was fitted on the first ${Math.round((1 - holdout.pct) * 100)}% of cases and is being tested against the ${holdout.cases} it never saw.`
      : "In-sample: the twin was fitted on every case, including these. That makes this a sanity check, not a real test — re-import the log with a hold-back for an out-of-sample answer.",
  });
}

/**
 * GET — the linked run series this run belongs to, and the comparison between
 * its two most recent observations.
 *
 * A mining run is a photograph. The question everyone asks second is whether
 * things got better or worse, and until `parentRunId` existed the Miner could
 * not answer it: the snapshot route froze a run into a dated copy and recorded
 * no link back, so the history was there and could only be reassembled by
 * guessing at name prefixes.
 *
 * The comparison is computed here by the same pure function the console would
 * use, so the API and any future view cannot disagree about what changed — and
 * so the REFUSAL travels with it. Two runs that look like different processes
 * come back with `ok: false` and a reason, never with a table of deltas.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
import { compareRuns, fitnessHistory, orderSeries, type ComparableRun } from "@/app/lib/mining/compareRuns";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";
import type { Variant } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string; runId: string }> };

/** How far back a series is walked. A run refreshed hourly for a year is not a
 *  chart anybody reads, and the whole chain would be fetched to draw it. */
const MAX_SERIES = 60;

export async function GET(_req: Request, { params }: Params) {
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

  // Walk BACK from this run through its ancestors, then forward through any
  // descendants, so the series is the whole chain regardless of which member
  // was asked for.
  const chain = new Map<string, typeof run>();
  chain.set(run.id, run);

  let cursor = run.parentRunId;
  while (cursor && chain.size < MAX_SERIES) {
    const parent = await prisma.processMiningRun.findFirst({ where: { id: cursor, projectId: id } });
    // A parent in another project, or deleted, ends the walk — it is not this
    // series' history and inventing a link to it would be worse than stopping.
    if (!parent || chain.has(parent.id)) break;
    chain.set(parent.id, parent);
    cursor = parent.parentRunId;
  }

  let frontier: string[] = [run.id];
  while (frontier.length && chain.size < MAX_SERIES) {
    const kids = await prisma.processMiningRun.findMany({ where: { projectId: id, parentRunId: { in: frontier } } });
    frontier = [];
    for (const k of kids) {
      if (chain.has(k.id)) continue;
      chain.set(k.id, k);
      frontier.push(k.id);
    }
  }

  const comparable = (r: typeof run): ComparableRun => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    analytics: (r.analytics ?? null) as unknown as RunAnalytics | null,
    variants: (r.variants ?? []) as unknown as Variant[],
    conformance: (r.conformance ?? null) as unknown as ConformanceResult | null,
  });

  const ordered = orderSeries([...chain.values()].map((r) => ({ id: r.id, parentRunId: r.parentRunId })));
  const series = ordered.map((o) => comparable(chain.get(o.id)!));

  if (series.length < 2) {
    // Not a failure — most runs are a series of one, and saying so is better
    // than an empty comparison that looks like nothing changed.
    return NextResponse.json({
      series: series.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt })),
      history: fitnessHistory(series),
      comparison: null,
      note: "This run has no earlier observation to compare against. Snapshot it, or re-import the next period's log, and the two can be put side by side.",
    });
  }

  const before = series[series.length - 2], after = series[series.length - 1];
  return NextResponse.json({
    series: series.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt })),
    history: fitnessHistory(series),
    comparison: compareRuns(before, after),
    truncated: chain.size >= MAX_SERIES,
  });
}

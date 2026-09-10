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
 * The comparison is computed here by the same pure function the console uses,
 * so the API and the view cannot disagree about what changed — and so the
 * REFUSAL travels with it. Two runs that look like different processes come
 * back with `ok: false` and a reason, never with a table of deltas.
 *
 * `?against=<runId>` compares this run with one the analyst NAMED, which need
 * not share a lineage. That is not a convenience: the commonest comparison
 * anybody wants is last period against this one, and two period imports of the
 * same process have no link between them whatsoever. Requiring a snapshot chain
 * would have meant the ordinary case had no answer.
 *
 * The response also carries what the alert rules would say RIGHT NOW — the same
 * evaluation the cron performs, asked on demand. A watcher you cannot
 * interrogate is one nobody trusts, and "tell me what you would have told me"
 * is the question that earns that trust. It is a second CALLER of the rules,
 * never a second copy: the poll route and this share `alertPointsFrom`.
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
import type { KpiConfig } from "@/app/lib/mining/outcomes";
import { alertPointsFrom, type HistoryRow } from "@/app/lib/mining/alertHistory";
import { evaluateAlerts } from "@/app/lib/mining/alerts";

type Params = { params: Promise<{ id: string; runId: string }> };

/** How far back a series is walked. A run refreshed hourly for a year is not a
 *  chart anybody reads, and the whole chain would be fetched to draw it. */
const MAX_SERIES = 60;

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id, runId } = await params;
  // Two runs the user picked, rather than the two ends of a link chain. The AP
  // example ships three period logs of the same process, and nothing links them
  // — they are separate imports. Requiring a parent chain before anything can
  // be compared would mean the commonest real case (I mined last quarter, I
  // mined this quarter) had no answer.
  const against = new URL(req.url).searchParams.get("against");
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

  // The counterpart the analyst named, which need NOT be in the chain. Two
  // period imports of the same process are the commonest comparison anybody
  // wants, and they have no lineage between them at all.
  let pair: [ComparableRun, ComparableRun] | null = null;
  if (against && against !== run.id) {
    const other = await prisma.processMiningRun.findFirst({ where: { id: against, projectId: id } });
    if (!other) return NextResponse.json({ error: "That run is not in this project." }, { status: 404 });
    const a = comparable(other), b = comparable(run);
    // Older is "before", whichever order they were asked for in. A comparison
    // run backwards reports every improvement as a regression, and reads
    // perfectly plausibly while doing so.
    pair = new Date(a.createdAt) <= new Date(b.createdAt) ? [a, b] : [b, a];
  } else if (series.length >= 2) {
    pair = [series[series.length - 2], series[series.length - 1]];
  }

  const comparison = pair ? compareRuns(pair[0], pair[1]) : null;

  // ── What the watcher would say, asked now rather than when the cron next
  // runs. Same rules, same thresholds, same refusals — this is a second CALLER
  // of the alert evaluation, never a second copy of it.
  //
  // The history is the linked series where there is one; where the analyst has
  // instead named a counterpart, the two of them are a legitimate two-point
  // history — but only once `compareRuns` has agreed they are the same process.
  // Alerting across two unrelated runs would report a different process as a
  // catastrophic regression.
  const historyRuns: ComparableRun[] = comparison?.ok && against ? [pair![0], pair![1]] : series;
  const rows: HistoryRow[] = [];
  for (const r of historyRuns) {
    const full = await prisma.processMiningRun.findUnique({ where: { id: r.id }, select: { kpiConfig: true } });
    rows.push({ ...r, kpiConfig: (full?.kpiConfig ?? null) as unknown as KpiConfig | null });
  }
  const source = await prisma.miningSource.findFirst({ where: { projectId: id, runId: run.id } });
  const watch = evaluateAlerts({
    now: new Date(),
    source: source
      ? { name: source.name, kind: source.kind, lastIngestAt: source.lastIngestAt, createdAt: source.createdAt, autoRefresh: source.autoRefresh }
      : null,
    history: alertPointsFrom(rows),
  });

  return NextResponse.json({
    series: series.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt })),
    history: fitnessHistory(series),
    comparison,
    alerts: watch.alerts,
    notEvaluated: watch.notEvaluated,
    truncated: chain.size >= MAX_SERIES,
    // Not a failure — most runs are a series of one, and saying so is better
    // than an empty comparison that looks like nothing changed.
    note: comparison ? undefined
      : "This run has no earlier observation to compare against. Pick another run of the same process above, or snapshot this one and mine the next period.",
  });
}

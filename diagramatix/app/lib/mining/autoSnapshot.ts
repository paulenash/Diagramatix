/**
 * A live run keeps its own history.
 *
 * `refreshRunFromSource` rebuilds a live run IN PLACE. That is right — the run
 * is the current picture — but it means the previous picture is gone the moment
 * new events arrive, and by the time somebody asks "when did conformance start
 * slipping?" there is nothing to answer with. Phase 10 cannot alert on
 * "fitness fell from 94% to 71%" for the same reason.
 *
 * So a refresh may leave a dated copy behind, linked by `parentRunId`.
 *
 * THREE THINGS KEEP THIS FROM BECOMING A ROW FACTORY, because a source polled
 * every five minutes would otherwise write 288 runs a day:
 *
 *  1. an interval — at most one snapshot per period, however often the source
 *     refreshes;
 *  2. a cap on the series, oldest pruned first, so history is bounded;
 *  3. nothing is written when nothing changed — a poll that found no new
 *     events has no new picture to keep.
 *
 * It is also deliberately BEST-EFFORT. Keeping history is worth doing and is
 * not worth failing a refresh over: the live run is the product, the snapshot
 * is the archive.
 */
import { prisma } from "@/app/lib/db";
import { updateRunJson } from "./runStore";

/** At most one automatic snapshot per run per this many hours. */
export const SNAPSHOT_INTERVAL_HOURS = 24;
/** Automatic snapshots retained per run. Older ones are pruned, oldest first. */
export const MAX_AUTO_SNAPSHOTS = 30;
/** Marks a snapshot this module made, so pruning never touches a hand-made one. */
export const AUTO_SNAPSHOT_MARK = " — auto ";

export interface SnapshotDecision {
  taken: boolean;
  /** Why not, when it was not. */
  reason?: string;
  snapshotId?: string;
  pruned?: number;
}

/**
 * Decide whether a refresh should leave a snapshot behind. Pure, so the policy
 * is testable without a database — which matters because every branch here is
 * a decision not to write rows.
 */
export function shouldSnapshot(input: {
  /** When the most recent automatic snapshot of this run was taken. */
  lastAutoAt: Date | null;
  now: Date;
  /** Events in the run BEFORE this refresh, and after it. */
  eventsBefore: number;
  eventsAfter: number;
  intervalHours?: number;
}): SnapshotDecision {
  const { lastAutoAt, now, eventsBefore, eventsAfter } = input;
  const intervalHours = input.intervalHours ?? SNAPSHOT_INTERVAL_HOURS;

  // Nothing arrived, so there is no new picture — and the OLD picture is still
  // the current one, which means a snapshot would be a duplicate of the run.
  if (eventsAfter <= eventsBefore) return { taken: false, reason: "no new events since the last refresh" };
  // Nothing to preserve: the run had no history of its own yet.
  if (eventsBefore === 0) return { taken: false, reason: "the run was empty before this refresh" };

  if (lastAutoAt) {
    const hours = (now.getTime() - lastAutoAt.getTime()) / 3_600_000;
    if (hours < intervalHours) {
      return { taken: false, reason: `the last automatic snapshot was ${hours.toFixed(1)}h ago (interval ${intervalHours}h)` };
    }
  }
  return { taken: true };
}

/**
 * Freeze the run's CURRENT state into a dated copy before a refresh overwrites
 * it, and link the live run to it.
 *
 * Called with the values the run holds NOW — i.e. before the refresh writes
 * over them — so the copy is the picture that is about to be lost.
 */
export async function autoSnapshot(runId: string, projectId: string | null): Promise<SnapshotDecision> {
  try {
    const run = await prisma.processMiningRun.findUnique({ where: { id: runId } });
    if (!run) return { taken: false, reason: "run not found" };

    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const snap = await prisma.processMiningRun.create({
      data: {
        name: `${run.name}${AUTO_SNAPSHOT_MARK}${stamp}`,
        projectId: run.projectId, orgId: run.orgId, createdById: run.createdById,
        referenceSmId: run.referenceSmId,
        parentRunId: run.parentRunId ?? null,
        // A snapshot is a DATA record: the discovered diagrams stay with the
        // live run rather than being cloned per period.
        excludeFromCompliance: run.excludeFromCompliance,
      },
    });
    await updateRunJson(snap.id, {
      mapping: run.mapping, stats: run.stats, variants: run.variants,
      performance: run.performance, analytics: run.analytics ?? null,
      governance: run.governance ?? null, conformance: run.conformance ?? null,
      kpiConfig: run.kpiConfig ?? null,
    });
    await prisma.processMiningRun.update({ where: { id: runId }, data: { parentRunId: snap.id } });

    const pruned = await pruneAutoSnapshots(runId, projectId);
    return { taken: true, snapshotId: snap.id, pruned };
  } catch {
    // Best-effort by design: the live run is the product, the archive is not
    // worth failing a refresh over.
    return { taken: false, reason: "the snapshot could not be written" };
  }
}

/**
 * Keep the automatic series bounded, oldest first.
 *
 * Only snapshots this module made are eligible — a hand-taken snapshot is
 * somebody's deliberate record and is never pruned to make room. Deleting one
 * re-points its child at its own parent, so the chain never breaks.
 */
export async function pruneAutoSnapshots(runId: string, projectId: string | null): Promise<number> {
  const walked: { id: string; parentRunId: string | null; name: string }[] = [];
  const seen = new Set<string>([runId]);
  let cursor = (await prisma.processMiningRun.findUnique({ where: { id: runId }, select: { parentRunId: true } }))?.parentRunId ?? null;
  while (cursor && !seen.has(cursor) && walked.length < 500) {
    const r = await prisma.processMiningRun.findFirst({
      where: { id: cursor, ...(projectId ? { projectId } : {}) },
      select: { id: true, parentRunId: true, name: true },
    });
    if (!r) break;
    seen.add(r.id);
    walked.push(r);
    cursor = r.parentRunId;
  }

  const auto = walked.filter((r) => r.name.includes(AUTO_SNAPSHOT_MARK));
  const excess = auto.slice(MAX_AUTO_SNAPSHOTS);      // oldest are last in the walk
  let pruned = 0;
  for (const victim of excess) {
    // Re-point whoever pointed at it, so removing a link does not sever the
    // chain behind it.
    await prisma.processMiningRun.updateMany({ where: { parentRunId: victim.id }, data: { parentRunId: victim.parentRunId } });
    await prisma.processMiningRun.delete({ where: { id: victim.id } }).catch(() => {});
    pruned++;
  }
  return pruned;
}

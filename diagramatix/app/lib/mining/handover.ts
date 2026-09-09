/**
 * Where the elapsed time actually goes — the transitions between steps.
 *
 * `analytics.edges` has been computed and persisted on every run since import
 * and read by nothing. It is the other half of the bottleneck table: an activity
 * that takes eight hours is not one fact but several, and which successor it was
 * heading for is usually the interesting one.
 *
 * ONE THING HAS TO BE SAID OUT LOUD, because it is the difference between this
 * being useful and being a fabrication. An event log records ONE timestamp per
 * event. The interval between two consecutive events is therefore a single
 * number, and nothing in the data says how much of it was work and how much was
 * waiting. `computeAnalytics` pushes that same interval into BOTH the
 * from-activity's `totalTimeMs` and this edge's samples — the same milliseconds
 * under two names. So:
 *
 *  - an "in-step vs between-step split" cannot be computed here, and is not;
 *  - these rows DECOMPOSE the bottleneck table by successor rather than adding
 *    to it, and the UI must say so or a reader will sum both and double-count.
 *
 * Pure — no DB, no React.
 */

import type { EdgeMetric } from "./analytics";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * Below this many observations an edge shows a frequency and no median. Two
 * samples do not have a median worth quoting, and a confident-looking number
 * beside "2 cases" is exactly the kind of figure someone repeats in a meeting.
 */
export const MIN_EDGE_OBS = 3;

export interface TransitionRow {
  from: string;
  to: string;
  freq: number;
  /** null when there are too few observations to quote one. */
  medianMs: number | null;
  /** Total elapsed on this transition across the log. */
  totalMs: number;
  /** True when `totalMs` is `freq × median` — a run imported before totals were
   *  recorded. Marked in the UI rather than passed off as measured. */
  estimated: boolean;
  /** This transition's share of all the time leaving `from` (0..1). */
  shareOfFrom: number;
}

export interface TransitionView {
  rows: TransitionRow[];
  /** Total elapsed across every transition — the whole of the log's flow time
   *  that sits between one recorded event and the next. */
  totalMs: number;
  /** True when ANY row's total is an estimate, so the caveat is shown once. */
  anyEstimated: boolean;
}

/**
 * Rank the transitions by how much elapsed time they account for.
 *
 * Sorted by total rather than by median: a two-day wait that happens twice
 * matters less than a two-hour wait that happens four hundred times, and ranking
 * by median puts the rare one at the top of the screen.
 */
export function transitionRows(edges: EdgeMetric[] | undefined): TransitionView {
  const list = edges ?? [];

  // Total per edge. `totalMs` is recorded at import from the real samples; for
  // runs that predate it, `freq × median` is a reasonable stand-in and is
  // flagged as one — it is right for a symmetric spread and understates a
  // skewed one, which is the usual shape of a waiting time.
  const withTotals = list.map((e) => {
    const measured = typeof e.totalMs === "number";
    return {
      e,
      total: measured ? e.totalMs! : e.freq * e.medianMs,
      estimated: !measured,
    };
  });

  const leavingFrom = new Map<string, number>();
  for (const { e, total } of withTotals) leavingFrom.set(e.from, (leavingFrom.get(e.from) ?? 0) + total);

  const rows: TransitionRow[] = withTotals.map(({ e, total, estimated }) => ({
    from: e.from,
    to: e.to,
    freq: e.freq,
    medianMs: e.freq >= MIN_EDGE_OBS ? e.medianMs : null,
    totalMs: total,
    estimated,
    shareOfFrom: (leavingFrom.get(e.from) ?? 0) > 0 ? total / leavingFrom.get(e.from)! : 0,
  })).sort((a, b) => b.totalMs - a.totalMs || b.freq - a.freq);

  return {
    rows,
    totalMs: rows.reduce((s, r) => s + r.totalMs, 0),
    anyEstimated: rows.some((r) => r.estimated),
  };
}

/** An unambiguous key for a directed pair. Concatenating the two labels would
 *  make "AB"->"C" and "A"->"BC" the same edge. */
export const edgePairKey = (from: string, to: string) => JSON.stringify([from, to]);

/**
 * The median transition time for each edge, for labelling the discovered model.
 * Only edges with enough observations to quote one.
 */
export function transitionMedians(edges: EdgeMetric[] | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of edges ?? []) {
    if (e.freq >= MIN_EDGE_OBS) out.set(edgePairKey(e.from, e.to), e.medianMs);
  }
  return out;
}

/** Stroke widths for a weighted arrow — the same 1.5→5.0 range the OCEL domain
 *  diagram already uses, so a heavy mined edge looks like a heavy domain edge
 *  and the default 1.5 is exactly what an unweighted connector already draws. */
const MIN_W = 1.5, MAX_W = 5;

/**
 * Put the mined timings onto the discovered model.
 *
 * `label` carries the median gap and `weight` the share of elapsed time, both on
 * channels the renderer already has — `transitionCount` keeps the frequency
 * badge it was given by `badgeEdgeCounts`, so the arrow ends up saying how OFTEN
 * and how LONG at once.
 *
 * Matching is by element label, because that is the only thing the discovered
 * diagram and the analytics share; an edge whose endpoints cannot both be found
 * (a gateway the layout inserted, the start and end events) is left alone.
 */
export function annotateTransitions(
  data: DiagramData,
  edges: EdgeMetric[] | undefined,
  format: (ms: number) => string,
): DiagramData {
  const view = transitionRows(edges);
  if (view.rows.length === 0) return data;

  const byPair = new Map(view.rows.map((r) => [edgePairKey(r.from, r.to), r]));
  const labelOf = new Map(data.elements.map((e) => [e.id, (e.label ?? "").trim()]));
  const maxTotal = Math.max(...view.rows.map((r) => r.totalMs));

  return {
    ...data,
    connectors: data.connectors.map((c) => {
      const row = byPair.get(edgePairKey(labelOf.get(c.sourceId) ?? "", labelOf.get(c.targetId) ?? ""));
      if (!row) return c;
      return {
        ...c,
        // Only where a median can honestly be quoted; the frequency badge stands
        // on its own for the rest.
        ...(row.medianMs === null ? {} : { label: format(row.medianMs) }),
        weight: maxTotal > 0
          ? Math.round((MIN_W + (row.totalMs / maxTotal) * (MAX_W - MIN_W)) * 10) / 10
          : MIN_W,
      };
    }),
  };
}

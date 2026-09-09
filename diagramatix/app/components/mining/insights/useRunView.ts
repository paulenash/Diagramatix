"use client";

/**
 * The single seam every Insights panel reads its numbers through.
 *
 * THE RULE, and it is the whole point: **no panel reads the fetched `analytics`
 * directly — every panel reads the run view.** A panel that reaches around this
 * seam is a panel that will one day show unfiltered numbers beside filtered
 * ones, and the moment one figure on the screen is quietly whole-run while its
 * neighbour is sliced, every number in the workbench becomes uncitable. That is
 * the failure this product can least afford, in the one feature whose entire
 * claim is that its numbers can be cited.
 *
 * The seam was introduced in Phase 1 as an identity view, before there was any
 * filter, precisely so that this — Phase 5 — would be a change in ONE place
 * rather than a retrofit of eight panels. It was.
 *
 * It owns the **exactness vocabulary**: what a figure is allowed to claim about
 * itself. Four states, not two, because a run whose per-event vectors were
 * dropped to stay inside the payload budget — or which predates them — cannot
 * honour a time-shaped filter and must say so rather than showing a whole-run
 * number in a filtered context.
 */

import { useMemo } from "react";
import type { RunAnalytics, AnalyticsDetail } from "@/app/lib/mining/analytics";
import type { Variant } from "@/app/lib/mining/types";
import {
  filterAnalytics, isFilterActive, describeFilter, EMPTY_FILTER, MIN_SLICE_CASES,
  type MiningFilter,
} from "@/app/lib/mining/filterAnalytics";

/** What a figure on screen is entitled to claim. */
export type Exactness =
  /** Whole-run, and no filter is active. The ordinary case. */
  | "whole"
  /** Filtered, and the underlying figures are exact for the slice. */
  | "filtered"
  /** Filtered, but computed from a 1-in-N sample of cases, or from a run whose
   *  per-event detail is missing. A number, but not a citable one. */
  | "estimated"
  /** This panel cannot honour the filter at all. The number shown is the
   *  WHOLE-RUN number and is labelled as such — never averaged, never narrowed. */
  | "unfiltered";

export interface RunView {
  analytics: RunAnalytics | null;
  variants: Variant[];
  /** True once a filter is applied. */
  filtered: boolean;
  /** One line naming the slice, for a chip and for the exported report. */
  description: string | null;
  /** Matching cases in the stored index, and the estimate for the real log. */
  matched: number;
  estimatedCases: number;
  /** Too few matching cases to quote a distribution — counts only. */
  belowFloor: boolean;
  /** What this run's case index actually carries. `"none"` for runs imported
   *  before the per-event vectors existed — absent, not zero. */
  detail: AnalyticsDetail;
  /** The claim a count-shaped figure (case counts, variant mix, outcome split)
   *  may make. These filter from the case index alone. */
  countExactness: Exactness;
  /** The claim a time-shaped figure (activity durations, the heat map, handover
   *  medians) may make. These need per-event durations, which not every run has. */
  timeExactness: Exactness;
  /** One line a panel can print verbatim, or null when there is nothing to say. */
  note: string | null;
}

export function useRunView(
  analytics: RunAnalytics | null,
  variants: Variant[],
  filter: MiningFilter = EMPTY_FILTER,
): RunView {
  return useMemo(() => {
    const detail: AnalyticsDetail = analytics?.detail ?? "none";
    const filtered = isFilterActive(filter);
    const sliced = filterAnalytics(analytics, variants, filter);

    const countExactness: Exactness = !filtered ? "whole" : analytics?.capped ? "estimated" : "filtered";
    const timeExactness: Exactness = !filtered
      ? "whole"
      : sliced?.timeUnfiltered ? "unfiltered"
      : analytics?.capped ? "estimated"
      : "filtered";

    let note: string | null = null;
    if (filtered && timeExactness === "unfiltered") {
      note = detail === "none"
        ? "This run predates per-event detail, so timings are shown for the whole run. Re-import the log to filter them."
        : "This run stores counts only (the log was too large for per-event detail), so timings are shown for the whole run.";
    } else if (filtered && countExactness === "estimated") {
      note = `Estimated from a sample: this run stores ${analytics?.cases.length ?? 0} of ${analytics?.totalCases ?? 0} cases, so a slice is scaled up by the same stride.`;
    }
    if (filtered && sliced?.belowFloor) {
      // Said in ADDITION to anything above: the count is the finding here, and
      // the distributions are the thing not to read.
      const few = `Only ${sliced.matched} case${sliced.matched === 1 ? "" : "s"} match — below ${MIN_SLICE_CASES}, so counts are reported and distributions are not.`;
      note = note ? `${few} ${note}` : few;
    }

    return {
      analytics: sliced?.analytics ?? analytics,
      variants: sliced?.variants ?? variants,
      filtered,
      description: describeFilter(filter),
      matched: sliced?.matched ?? 0,
      estimatedCases: sliced?.estimatedCases ?? 0,
      belowFloor: !!sliced?.belowFloor,
      detail, countExactness, timeExactness, note,
    };
  }, [analytics, variants, filter]);
}

/** The short label a panel puts beside a figure. Null when there is nothing
 *  worth saying — an unfiltered run should not be littered with chips. */
export function exactnessLabel(e: Exactness): string | null {
  switch (e) {
    case "whole": return null;
    case "filtered": return "filtered";
    case "estimated": return "filtered · estimated";
    case "unfiltered": return "not filtered";
  }
}

/** The colour a chip takes — amber where a reader must not cite the number. */
export function exactnessTone(e: Exactness): string {
  switch (e) {
    case "whole": return "";
    case "filtered": return "bg-emerald-900/40 border-emerald-700/50 text-emerald-200";
    case "estimated": return "bg-amber-900/40 border-amber-700/50 text-amber-200";
    case "unfiltered": return "bg-rose-900/40 border-rose-700/50 text-rose-200";
  }
}

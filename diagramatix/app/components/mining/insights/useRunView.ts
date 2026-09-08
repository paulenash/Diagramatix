"use client";

/**
 * The single seam every Insights panel reads its numbers through.
 *
 * Today it is an identity view: it hands back exactly the analytics and variants
 * that were fetched. It exists now, before there is any filter, because of what
 * happens when one arrives.
 *
 * THE RULE, and it is the whole point: **no panel reads the fetched `analytics`
 * directly — every panel reads the run view.** A panel that reaches around this
 * seam is a panel that will one day show unfiltered numbers beside filtered
 * ones, and the moment one figure on the screen is quietly whole-run while its
 * neighbour is sliced, every number in the workbench becomes uncitable. That is
 * the failure this product can least afford, in the one feature whose entire
 * claim is that its numbers can be cited.
 *
 * Introducing it now costs an hour and converts Phase 4 from a retrofit of six
 * panels into a single change here.
 *
 * It also owns the **exactness vocabulary** — what a figure is allowed to claim
 * about itself. Three states, not two: a run whose per-event vectors were
 * dropped to stay inside the payload budget, or which predates them entirely,
 * cannot honour a time-shaped filter, and must say so rather than showing a
 * whole-run number in a filtered context.
 */

import { useMemo } from "react";
import type { RunAnalytics, AnalyticsDetail } from "@/app/lib/mining/analytics";
import type { Variant } from "@/app/lib/mining/types";

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
  /** True once a filter is applied (Phase 4). Always false today. */
  filtered: boolean;
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

export function useRunView(analytics: RunAnalytics | null, variants: Variant[]): RunView {
  return useMemo(() => {
    const detail: AnalyticsDetail = analytics?.detail ?? "none";
    // No filter exists yet, so everything is whole-run and nothing needs a
    // caveat. When Phase 4 lands, only this block changes.
    const filtered = false;

    const countExactness: Exactness = filtered ? (analytics?.capped ? "estimated" : "filtered") : "whole";
    const timeExactness: Exactness = !filtered
      ? "whole"
      : detail !== "full" ? "unfiltered"
      : analytics?.capped ? "estimated"
      : "filtered";

    let note: string | null = null;
    if (filtered && timeExactness === "unfiltered") {
      note = detail === "none"
        ? "This run predates per-event detail, so timings are shown for the whole run. Re-import the log to filter them."
        : "This run stores counts only (the log was too large for per-event detail), so timings are shown for the whole run.";
    } else if (filtered && countExactness === "estimated") {
      note = `Estimated from a sample: this run stores ${analytics?.cases.length ?? 0} of ${analytics?.totalCases ?? 0} cases.`;
    }

    return { analytics, variants, filtered, detail, countExactness, timeExactness, note };
  }, [analytics, variants]);
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

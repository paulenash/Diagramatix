/**
 * From "fourteen cases skipped the credit check" to "here they are".
 *
 * A conformance figure is a metric. A list of the actual case ids is evidence,
 * and the difference decides whether anyone acts on it — the first thing a
 * sceptical stakeholder asks is *which ones*, and a tool that cannot answer gets
 * treated as an opinion.
 *
 * Nothing here needs raw events. A violation now records the variants that
 * exhibit it, and every stored case carries the variant it followed, so the join
 * is over data that has been sitting in the run row all along. That is what lets
 * EVERY existing run gain case attribution from a recompute rather than a
 * re-import.
 *
 * THE FLOOR THIS MODULE EXISTS TO ENFORCE. On a large run the case index is a
 * 1-in-N stride, so fourteen offending cases may resolve to nine that can be
 * named. The answer is "14 cases · 9 identifiable in the stored sample" — never
 * a silently short list presented as the list. A list that quietly omits five
 * cases is precisely what stops an auditor trusting the tool, and it is
 * indistinguishable from a correct answer unless the tool says so itself.
 *
 * Pure — no DB, no React.
 */

import type { CaseSummary, RunAnalytics } from "./analytics";
import type { ConformanceViolation } from "./transitionConformance";
import type { Variant } from "./types";

export interface ViolationEvidence {
  /** The cases that can actually be named, from the stored index. */
  cases: CaseSummary[];
  /** What the violation claims — frequency-weighted over the whole log. */
  claimed: number;
  /** How many of those can be named here. */
  identifiable: number;
  /** True when the two differ because the index is a sample, so the caller must
   *  say so rather than presenting `cases` as the complete list. */
  partial: boolean;
  /** True when this run's conformance predates variant attribution: the cases
   *  are UNKNOWN, which is not the same as none, and must not be shown as an
   *  empty list. */
  unattributed: boolean;
  /** One line stating exactly what the list is. */
  statement: string;
}

/**
 * The cases behind one violation.
 *
 * `claimed` is derived from the VARIANTS PASSED IN rather than read off the
 * stored violation, and that is not a detail. A stored violation counts the
 * whole log; under a filter the variant counts are the slice's, so summing
 * them over the violating variants gives the slice's own figure. Reading the
 * stored count instead would put a whole-run claim ("3 cases") beside a
 * filtered list ("1 identifiable"), and the honest floor would then fire on a
 * gap that striding did not cause and re-checking would not fix.
 *
 * It also means the deviations list filters for free — which is exactly what
 * the plan predicted about conformance, arriving one phase later than it
 * expected.
 */
export function evidenceFor(
  violation: ConformanceViolation | null,
  analytics: RunAnalytics | null,
  variants: Variant[] = [],
): ViolationEvidence {
  const empty: ViolationEvidence = {
    cases: [], claimed: 0, identifiable: 0, partial: false, unattributed: false,
    statement: "No violation selected.",
  };
  if (!violation || !analytics) return empty;



  // ABSENT is not EMPTY. A run conformed before this shipped has no attribution
  // at all, and showing "0 cases" would be a confident lie about a run that
  // simply has not been asked again.
  if (!violation.variantIdxs) {
    // Nothing to sum over, so the stored whole-run count is all there is —
    // and it is reported as unattributed, not as a filtered figure.
    return {
      cases: [], claimed: violation.cases, identifiable: 0, partial: false, unattributed: true,
      statement: `${violation.cases.toLocaleString()} case${violation.cases === 1 ? "" : "s"} — which ones was not recorded when this run was checked. Re-check conformance to attribute them.`,
    };
  }

  const wanted = new Set(violation.variantIdxs);
  const cases = analytics.cases.filter((c) => wanted.has(c.variantIdx));
  // The slice's own count when the variants are a slice's; the whole-run count
  // when they are not. One expression, both cases.
  const claimed = variants.length
    ? violation.variantIdxs.reduce((s, i) => s + (variants[i]?.count ?? 0), 0)
    : violation.cases;
  const identifiable = cases.length;
  const partial = identifiable < claimed;

  let statement: string;
  if (claimed === 0) {
    statement = "Never observed in this log — the reference allows it, nothing did it.";
  } else if (!partial) {
    statement = `${claimed.toLocaleString()} case${claimed === 1 ? "" : "s"}, all listed.`;
  } else {
    // The sentence the plan asked for, verbatim in shape: the claim, then how
    // much of it can be shown, then why.
    statement = `${claimed.toLocaleString()} cases · ${identifiable.toLocaleString()} identifiable in the stored sample`
      + (analytics.capped
        ? ` (this run stores ${analytics.cases.length.toLocaleString()} of ${analytics.totalCases.toLocaleString()} cases).`
        : ".");
  }

  return { cases, claimed, identifiable, partial, unattributed: false, statement };
}

/** One step of a case, as it can be reconstructed from the stored index. */
export interface TimelineStep {
  activity: string;
  state: string;
  /** Time until the NEXT step. Null on the final step, which has none — and on
   *  a run whose per-event durations were not stored. */
  durMs: number | null;
  /** Offset from the case's start, when durations are available. */
  offsetMs: number | null;
  resource: string | null;
}

/**
 * A case's path, and its timeline when the run kept per-event durations.
 *
 * The activity sequence always resolves — it is the variant. The timings do not
 * always, and the caller is told which by `durMs` being null rather than zero;
 * a zero would draw a step that took no time, which is a different claim.
 */
export function caseTimeline(
  c: CaseSummary | null,
  variants: Variant[],
  resourceDict: string[] = [],
): TimelineStep[] {
  if (!c) return [];
  const v = variants[c.variantIdx];
  if (!v) return [];
  let offset = 0;
  return v.events.map((activity, i) => {
    const durMs = c.durs?.[i] ?? null;
    const step: TimelineStep = {
      activity,
      state: v.states[i] ?? "",
      durMs: i < v.events.length - 1 ? durMs : null,
      offsetMs: c.durs ? offset : null,
      resource: (() => { const ri = c.res?.[i]; return ri !== undefined && ri >= 0 ? resourceDict[ri] ?? null : null; })(),
    };
    offset += durMs ?? 0;
    return step;
  });
}

/** RFC-4180-ish escaping: quote anything containing a comma, quote or newline. */
const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The whole per-case index as CSV.
 *
 * The on-screen list is capped at sixty rows, which is right for reading and
 * useless for anyone who wants to check the work. This is the same data without
 * the cap — every stored case, its variant, its timing, and any kept columns.
 *
 * It does NOT invent the cases a strided run did not store. The caller states
 * the coverage next to the button, and the header row names the columns exactly
 * as the screen does so the two can be reconciled.
 */
export function casesCsv(analytics: RunAnalytics, variants: Variant[]): string {
  const attrNames = [...new Set(analytics.cases.flatMap((c) => Object.keys(c.attrs ?? {})))].sort();
  const iso = (ms: number) => new Date(ms).toISOString();
  const header = ["Case", "Variant", "Steps", "Started", "Ended", "Cycle (ms)", "Path", ...attrNames];
  const lines = [header.map(cell).join(",")];
  for (const c of analytics.cases) {
    lines.push([
      cell(c.caseId),
      cell(c.variantIdx + 1),
      cell(c.events),
      cell(iso(c.startMs)),
      cell(iso(c.endMs)),
      cell(c.cycleMs),
      cell((variants[c.variantIdx]?.events ?? []).join(" → ")),
      ...attrNames.map((n) => cell(c.attrs?.[n] ?? "")),
    ].join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

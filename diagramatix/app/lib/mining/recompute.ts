/**
 * What a mining run can honestly be rebuilt from, once it has been imported.
 *
 * The importer is the only moment the raw events exist. `import/route.ts` says
 * so in as many words — the aggregates "must be computed NOW — raw events are
 * transient" — and everything after it reads `variants`, `analytics`,
 * `performance` and `governance` out of the run row.
 *
 * That makes "recompute this run" two completely different operations, and the
 * difference is the whole of this module:
 *
 *  - A **live** run has a source with a rolling event buffer. Its raw events DO
 *    still exist, so it can be rebuilt properly — that is `refreshRunFromSource`,
 *    which already existed.
 *  - A **manually imported** run has no raw events anywhere. Anything derivable
 *    from the stored *variants* can be rebuilt: the discovered process, the
 *    discovered lifecycle, the conformance replay. Anything needing per-event
 *    data cannot be, at any price.
 *
 * The second list is the point. It would be easy to recompute an approximation
 * from `variants` — a variant knows its activity sequence and its frequency —
 * and every number would look plausible and be wrong, because a variant has no
 * timestamps, no resources and no attributes. So each such field is **refused by
 * name, with the reason and the remedy**, rather than quietly approximated.
 *
 * Pure — no DB, no React.
 */

/** The state of a run, as far as deciding what can be rebuilt is concerned. */
export interface RecomputeSubject {
  /** Stored variants — present on every run imported since the feature shipped. */
  hasVariants: boolean;
  /** A live source with a non-empty event buffer. */
  hasSourceBuffer: boolean;
  discoveredBpmnId: string | null;
  discoveredSmId: string | null;
  referenceSmId: string | null;
}

export interface RefusedField {
  field: string;
  /** Why the stored data cannot produce it. */
  why: string;
}

export interface RecomputePlan {
  /** "source" rebuilds everything from raw events; "stored" from variants only. */
  mode: "source" | "stored" | "impossible";
  /** What this recompute will actually redo. */
  willRebuild: string[];
  /** What it will not, and why. Empty in `source` mode. */
  refused: RefusedField[];
  /** One line for the person who pressed the button. */
  message: string;
}

/**
 * Fields that need per-event data, with the reason each is unreachable from a
 * stored run. Kept as data rather than prose in a route, because the honest
 * answer has to survive every later phase that adds a field to the run row.
 */
const NEEDS_RAW_EVENTS: RefusedField[] = [
  { field: "stats", why: "counts events, and only variants and their frequencies are stored" },
  { field: "performance", why: "needs each event's timestamp and resource — a variant has neither" },
  { field: "analytics", why: "needs per-case timings and attributes, which are summarised, not kept" },
  { field: "governance", why: "reads the control, risk and policy ids off each event" },
];

export function planRecompute(run: RecomputeSubject): RecomputePlan {
  if (run.hasSourceBuffer) {
    return {
      mode: "source",
      willRebuild: ["stats", "variants", "performance", "analytics", "governance", "discovered diagrams", "conformance"],
      refused: [],
      message: "This run is fed by a live source, so it was rebuilt from its event buffer — everything is current.",
    };
  }

  if (!run.hasVariants) {
    return {
      mode: "impossible",
      willRebuild: [],
      refused: NEEDS_RAW_EVENTS,
      message: "This run has no stored variants, so there is nothing to rebuild from. Re-import the log.",
    };
  }

  const willRebuild: string[] = [];
  if (run.discoveredBpmnId) willRebuild.push("the discovered process");
  if (run.discoveredSmId) willRebuild.push("the discovered state machine");
  if (run.referenceSmId) willRebuild.push("conformance against the reference");

  const message = willRebuild.length === 0
    ? "Nothing to rebuild: this run has no discovered diagrams and no reference to check against. Its stored figures can only change by re-importing the log."
    : `Rebuilt ${willRebuild.join(", ")} from the stored variants. The imported figures are unchanged — see below for why.`;

  return { mode: "stored", willRebuild, refused: NEEDS_RAW_EVENTS, message };
}

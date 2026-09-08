/**
 * Core process-mining types. An event log is a flat table; we map its columns to
 * roles (case/entity id, activity, timestamp, state, …), normalise it into
 * per-entity traces ordered by time, then compress to VARIANTS (distinct
 * state/event sequences + frequency) — the bounded, persistable form the rest of
 * the feature (discovery, conformance, simulator calibration) runs on.
 *
 * Pure data — no DB, no React.
 */

/** Which column of the uploaded log plays each role. Values are column headers,
 *  EXCEPT `activityState` which is a config map (not a column). */
export interface LogMapping {
  caseId: string;        // entity instance id (e.g. Invoice #123) — the process "case"
  activity: string;      // the business event / activity name
  timestamp: string;     // when it happened
  state?: string;        // optional: the entity's resulting state after the event
  entityType?: string;   // optional: the entity kind (Invoice, Employee…)
  resource?: string;     // optional: who/what performed it (→ simulation team)
  // Governance (optional) — carry GRC identifiers straight from the source system.
  controlId?: string;    // optional: the Control (RCM) id exercised by the event
  riskId?: string;       // optional: the Risk id the event relates to
  policyId?: string;     // optional: the Policy id the event relates to
  /** When no `state` column is mapped, this activity→state table supplies the
   *  state each activity produces (defaults to the activity's own name). It
   *  completes the lifecycle the rest of the miner + the State Machine need. */
  activityState?: Record<string, string>;
  /** When no `resource` column is mapped, this activity→team table supplies the
   *  team for each activity (e.g. enriched from the Process Diagram's lanes). */
  activityResource?: Record<string, string>;
  /**
   * What to do with each column, by header name.
   *
   * Every column the nine roles above do not claim used to be discarded at parse
   * time, which is why "did invoices over $10,000 take longer?" was unanswerable
   * from the very spreadsheet that had just been uploaded. Kept columns become
   * per-case attributes on the analytics index and are what a filter slices on.
   *
   * DEFAULTS ARE DELIBERATE. An unmapped column defaults to `"drop"`, not
   * `"keep"`: this is a product where a spare column is as likely to hold a
   * customer name as a region, and opting IN to retention is the only safe way
   * round. A mapped column defaults to `"keep"` — it is already in use — but may
   * be set to `"hash"`, which is the honest answer for a case id that is really
   * a customer number.
   *
   * `"hash"` is a stable one-way digest: the same input always gives the same
   * token, so cases still group and join correctly, and nothing reads back.
   */
  attributeMode?: Record<string, "keep" | "hash" | "drop">;
}

/** One normalised event row. `timestamp` is epoch milliseconds. */
export interface LogEvent {
  caseId: string;
  activity: string;
  timestamp: number;
  state: string;
  resource?: string;
  controlId?: string;
  riskId?: string;
  policyId?: string;
  /** Columns kept by `LogMapping.attributeMode`. Carried on the event because
   *  that is where the row is; the analytics index takes them from the case's
   *  FIRST event, which is the one that describes the case rather than a later
   *  state of it. Absent when nothing was kept. */
  attrs?: Record<string, string>;
}

/** All events of one entity instance, ordered by timestamp. */
export interface CaseTrace {
  caseId: string;
  events: LogEvent[];
}

/** A distinct entity behaviour + how many cases followed it exactly — the
 *  compressed log. `states`/`events` run in lockstep: event[i] is the activity
 *  that produced state[i] (states[0] is the entity's first observed state). */
export interface Variant {
  states: string[];
  events: string[];
  count: number;
}

/** Headline aggregates for a mining run. */
export interface MiningStats {
  cases: number;
  events: number;
  activities: string[];   // distinct activity names
  states: string[];       // distinct state values
  variants: number;       // distinct variant count
  from?: number;          // earliest timestamp (epoch ms)
  to?: number;            // latest timestamp (epoch ms)
  unmappedRows?: number;  // rows dropped for a missing case/timestamp
}

/** The parsed + aggregated event log — what the import route persists (minus the
 *  raw `traces`, which it keeps only transiently for performance aggregation). */
export interface EventLog {
  events: LogEvent[];
  traces: CaseTrace[];
  variants: Variant[];
  stats: MiningStats;
}

/** Per-control operating-effectiveness mined DIRECTLY from Control IDs carried on
 *  events. `expected` = cases in which the control's governed activities occurred;
 *  `applied` = cases in which the control id was actually recorded; the shortfall
 *  is a bypass. */
export interface ControlObservation {
  applied: number;                 // distinct cases carrying this control id
  expected: number;                // distinct cases where a governed activity occurred
  bypassed: number;                // expected - applied
  effectivenessPct: number | null; // applied/expected (null when expected = 0)
  activities: string[];            // activities observed carrying this control id
}

/** Governance aggregates mined from Control/Risk/Policy IDs on events — the stored
 *  summary that closes the loop with the Risk & Control (GRC) feature. */
export interface GovernanceStats {
  controls: Record<string, ControlObservation>;   // control id → effectiveness
  risks: Record<string, { cases: number }>;        // risk id → distinct cases
  policies: Record<string, { cases: number }>;     // policy id → distinct cases
}

/** Timing + resource aggregates mined from the log — the numbers that calibrate
 *  a simulation "digital twin". All durations are already in `clockUnit`. */
export interface Performance {
  clockUnit: "second" | "minute" | "hour" | "day";
  activityDurations: Record<string, number[]>;   // activity → sojourn-time samples (until next event)
  interArrival: number[];                          // gaps between consecutive cases' first events
  activityResource: Record<string, string>;        // activity → dominant resource (→ simulation team)
  resourceConcurrency: Record<string, number>;     // resource → max simultaneous cases (→ team capacity)
  activeHours: number[];                           // 168 buckets, index = day(0=Mon)*24 + hour, event count
  /** What the twin was fitted WITHOUT, when a hold-back was asked for at import.
   *  Recorded here because it describes the FIT: the cases after `splitMs` were
   *  kept aside so the model can later be tested on data it never saw. Absent =
   *  fitted on everything, and any validation is in-sample and must say so. */
  holdout?: { pct: number; splitMs: number | null; cases: number };
}

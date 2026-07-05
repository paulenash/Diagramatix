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
}

/**
 * Core process-mining types. An event log is a flat table; we map its columns to
 * roles (case/entity id, activity, timestamp, state, …), normalise it into
 * per-entity traces ordered by time, then compress to VARIANTS (distinct
 * state/event sequences + frequency) — the bounded, persistable form the rest of
 * the feature (discovery, conformance, simulator calibration) runs on.
 *
 * Pure data — no DB, no React.
 */

/** Which column of the uploaded log plays each role. Values are column headers. */
export interface LogMapping {
  caseId: string;        // entity instance id (e.g. Invoice #123) — the process "case"
  activity: string;      // the business event / activity name
  timestamp: string;     // when it happened
  state: string;         // the entity's resulting state after the event
  entityType?: string;   // optional: the entity kind (Invoice, Employee…)
  resource?: string;     // optional: who/what performed it (→ simulation team)
}

/** One normalised event row. `timestamp` is epoch milliseconds. */
export interface LogEvent {
  caseId: string;
  activity: string;
  timestamp: number;
  state: string;
  resource?: string;
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

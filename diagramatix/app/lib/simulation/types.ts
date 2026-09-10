/**
 * Core simulation types for the BPMN process simulator.
 *
 * Naming follows the OMG/WfMC BPSim categories where practical so the model
 * maps losslessly to BPSim XML (see app/lib/simulation/bpsim/*): time params
 * (ProcessingTime/WaitTime/SetupTime), control params (InterTriggerTimer/
 * Probability/Condition), resource params (Role/Quantity), and distributions.
 *
 * These foundation types are pure data — no engine state, no React, no Prisma.
 */

/** A statistical distribution. Param numbers are in the scenario's base time
 *  unit (see SimRunConfig.clockUnit) for time fields, or plain values for
 *  counts/probabilities. Maps to BPSim distribution elements. */
export type SimDist =
  | { kind: "fixed"; value: number }
  | { kind: "uniform"; min: number; max: number }
  | { kind: "triangular"; min: number; mode: number; max: number }
  | { kind: "normal"; mean: number; sd: number } // truncated at 0
  | { kind: "exponential"; mean: number }        // mean = 1/rate
  /**
   * The one a modeller reaches for when the task is real work.
   *
   * Service times are right-skewed: most cases cluster and a few run far past
   * the median. A truncated normal cannot produce that tail and a triangular
   * puts a hard ceiling on it, so both understate exactly the cases that make a
   * queue form. `mean` and `sd` are of the DISTRIBUTION, not of its underlying
   * normal — a modeller has the average and the spread of the thing they
   * measured, not of its logarithm.
   */
  | { kind: "lognormal"; mean: number; sd: number }
  /**
   * The observed values themselves, resampled — no distributional assumption at
   * all. What mining calibration fits, because the samples ARE the evidence and
   * choosing a curve to lay over them is a claim the data does not make.
   *
   * Held as an ordered quantile sketch (see `empiricalFrom`) so a diagram never
   * carries fifty thousand numbers.
   */
  | { kind: "empirical"; samples: number[] };

export type ClockUnit = "second" | "minute" | "hour" | "day";

/** Seconds per base clock unit — the canonical conversion table. */
export const SECONDS_PER_UNIT: Record<ClockUnit, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
};

/** One open window in a weekly working calendar. `day` is 0=Monday … 6=Sunday;
 *  `start`/`end` are "HH:MM" (end exclusive, "24:00" = end of day). `rate` is an
 *  arrival-rate multiplier applied to sources during this window (default 1);
 *  it is ignored for teams (a team is simply staffed at full capacity when open).
 *  Everything not covered by an interval is CLOSED. */
export interface CalendarInterval {
  day: number;
  start: string;
  end: string;
  rate?: number;
}

/** A reusable weekly working calendar (the "working hours" of a team or the
 *  operating hours of an arrival source). The pattern repeats every 7 days with
 *  sim-clock t=0 anchored to Monday 00:00. An empty `intervals` list means
 *  "always open" (the safe engine fallback for an unconfigured calendar). */
export interface WorkCalendar {
  intervals: CalendarInterval[];
  /**
   * Dated departures from the weekly pattern: bank holidays, the Christmas
   * shutdown, the summer when a third of the team is away. A calendar repeats
   * weekly and a department's YEAR does not.
   *
   * Each entry REPLACES the weekly pattern for that one date. Empty `intervals`
   * means closed all day, which is the common case; a non-empty list means
   * different hours (a half-day before a holiday).
   *
   * Requires `epochDate`: without a real date for sim t=0 an exception cannot be
   * located, so exceptions are IGNORED and `calendarWarnings` says so rather
   * than silently applying none of them.
   */
  exceptions?: CalendarException[];
  /**
   * The calendar date of sim clock t=0, "YYYY-MM-DD". The weekly pattern anchors
   * t=0 to MONDAY 00:00, so this should be a Monday; `calendarWarnings` flags it
   * when it is not, because otherwise the weekday pattern and the dated
   * exceptions would disagree with each other by a constant offset.
   */
  epochDate?: string;
}

/** One dated departure from the weekly pattern. `day` is deliberately absent:
 *  the date decides the day, and carrying a weekday too would let the two
 *  disagree. */
export interface CalendarException {
  /** "YYYY-MM-DD". */
  date: string;
  /** Open windows for that date. EMPTY = closed all day. */
  intervals: { start: string; end: string; rate?: number }[];
  /** Shown in the editor: "Christmas Day", "Ann on leave". */
  note?: string;
}

/** Run configuration for one scenario (≙ BPSim ScenarioParameters). */
export interface SimRunConfig {
  /** Base time unit; every SimDist time value is interpreted in this unit. */
  clockUnit: ClockUnit;
  /** Simulated time to run, in clockUnit. */
  horizon: number;
  /** Lead-in time discarded from statistics, in clockUnit. */
  warmUp: number;
  /** Monte-Carlo replications (≙ BPSim replication). */
  replications: number;
  /** Master seed; replication r derives its own stream from this. */
  seed: number;
  /** Record time-weighted queue stats (costs a little memory). */
  collectQueues: boolean;
}

export const DEFAULT_RUN_CONFIG: SimRunConfig = {
  clockUnit: "minute",
  horizon: 480,
  warmUp: 0,
  replications: 1,
  seed: 1,
  collectQueues: true,
};

/** A planned (timed) intervention — the deterministic, reproducible subset of
 *  the Operator's levers, scheduled onto the calendar before the run. `t` is
 *  in the scenario's clockUnit. `target` is a teamId / nodeId / edgeId per
 *  kind; `value` is the new capacity / arrival multiplier / probability /
 *  inject count; `duration` (capacity & outage) reverts the change after that
 *  many clockUnits. */
export type PlannedInterventionKind =
  | "capacity"    // target=teamId, value=new capacity (duration → temporary surge/cut)
  | "arrival"     // target=nodeId (source), value=rate multiplier
  | "branchProb"  // target=edgeId, value=new probability 0..1
  | "inject"      // target=nodeId, value=token count injected at t
  | "outage";     // target=teamId, value=capacity during the outage (duration)

export interface PlannedIntervention {
  id: string;
  t: number;
  kind: PlannedInterventionKind;
  target: string;
  value: number;
  duration?: number;
  note?: string;
}

/** A scenario's run configuration = the base SimRunConfig plus any planned
 *  interventions. Stored as JSON on SimulationScenario.runConfig. */
export interface ScenarioRunConfig extends SimRunConfig {
  interventions?: PlannedIntervention[];
}

/** A scheduled future event on the engine's calendar. `seq` is a monotonic
 *  insertion counter used purely as a deterministic tie-break for events at
 *  the same `time`. `payload` is engine-defined. */
export interface ScheduledEvent<P = unknown> {
  time: number;
  seq: number;
  payload: P;
}

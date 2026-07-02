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
  | { kind: "exponential"; mean: number };        // mean = 1/rate

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

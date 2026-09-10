/**
 * Watch it, rather than visit it.
 *
 * Everything else the Miner does assumes somebody opened it. This is the part
 * that speaks first — and that changes what the product is, from a study you
 * commission into a monitor that tells you when your process changed.
 *
 * THE CHEAPEST ALARM IS THE MOST VALUABLE ONE, and it is deliberately first:
 * **the source stopped sending.** It needs no thresholds, no history and no
 * statistics — only `lastIngestAt`. It is also the failure most likely to go
 * unnoticed, because a feed that goes quiet produces no error anywhere: the run
 * simply stops changing, and a dashboard of stale numbers looks exactly like a
 * dashboard of stable ones.
 *
 * THE FLOOR, and it is the one that decides whether these alerts get switched
 * off within a week: **nothing fires on a first observation.** A process mined
 * once has no trend; a fitness of 71% on the first run is the as-is process, not
 * a regression, and alerting on it teaches the recipient that the alerts are
 * noise. Every history-based signal reports *not enough history yet* by name
 * rather than staying quiet, so a reader can tell "nothing is wrong" from "this
 * cannot be judged".
 *
 * Pure — no DB, no React.
 */

export type AlertKind = "source-silent" | "fitness-drop" | "new-deviation" | "late-rate-doubled";

/** One observation in a linked run series. */
export interface AlertPoint {
  runId: string;
  name: string;
  /** ISO. */
  at: string;
  /** null when that run was never conformance-checked — unknown, not zero. */
  fitness: number | null;
  /** Share of cases that missed the SLA, or null when no SLA is set. */
  lateRate: number | null;
  /** Deviation messages with at least one case. */
  violations: string[];
}

export interface AlertSource {
  name: string;
  kind: string;
  lastIngestAt: Date | null;
  createdAt: Date;
  autoRefresh: boolean;
}

export interface MiningAlert {
  kind: AlertKind;
  severity: "warning" | "error";
  /** The headline, carrying its own number. */
  title: string;
  detail: string;
  /** The run the alert is about, where there is one. */
  runId?: string;
}

export interface AlertResult {
  alerts: MiningAlert[];
  /** Signals that could not be judged, and why. Never silently skipped — silence
   *  reads as a clean bill. */
  notEvaluated: string[];
}

/** A feed quiet for longer than this has stopped, as far as anyone watching is
 *  concerned. Generous: a daily feed that slips a few hours is not an incident. */
export const SILENCE_HOURS = 48;
/** A fall of this many points is a change worth a message, not drift. */
export const FITNESS_DROP = 0.1;
/** Below this, conformance is worth saying out loud however it got there. */
export const FITNESS_FLOOR = 0.7;
/** The late rate has to more than double AND clear this, so a rise from 1% to
 *  3% does not page anybody. */
export const LATE_RATE_FLOOR = 0.1;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const hoursBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 3_600_000;

export interface AlertInput {
  now: Date;
  /** The live source feeding this run, when there is one. */
  source?: AlertSource | null;
  /** The linked run series, OLDEST FIRST, including the current run. */
  history: AlertPoint[];
  silenceHours?: number;
}

export function evaluateAlerts(input: AlertInput): AlertResult {
  const { now, source, history } = input;
  const silenceHours = input.silenceHours ?? SILENCE_HOURS;
  const alerts: MiningAlert[] = [];
  const notEvaluated: string[] = [];

  // ── 1. The source stopped sending ────────────────────────────────────────
  if (source && source.autoRefresh) {
    if (!source.lastIngestAt) {
      // Never received anything. Not an incident on the day it was set up, and
      // very much one a week later — a source configured and then forgotten is
      // the commonest way a "live" dashboard becomes a fossil.
      const age = hoursBetween(now, source.createdAt);
      if (age >= silenceHours) {
        alerts.push({
          kind: "source-silent", severity: "error",
          title: `"${source.name}" has never received any events`,
          detail: `It was set up ${Math.round(age / 24)} days ago and nothing has arrived. Whatever is meant to be sending has not started.`,
        });
      }
    } else {
      const quiet = hoursBetween(now, source.lastIngestAt);
      if (quiet >= silenceHours) {
        alerts.push({
          kind: "source-silent", severity: "error",
          title: `"${source.name}" has sent nothing for ${Math.round(quiet)} hours`,
          detail: "The run is not wrong, it is simply not moving — and a dashboard of stale figures looks exactly like a dashboard of stable ones.",
        });
      }
    }
  } else if (!source) {
    notEvaluated.push("Silence is not watched: this run has no live source, so there is nothing that could stop sending.");
  } else {
    notEvaluated.push(`Silence is not watched: auto-refresh is off for "${source.name}".`);
  }

  // ── Everything below needs a previous observation ────────────────────────
  if (history.length < 2) {
    notEvaluated.push("Conformance and outcome trends are not watched yet: this process has been mined once, so there is nothing to compare against. They begin at the second observation.");
    return { alerts, notEvaluated };
  }

  const latest = history[history.length - 1];
  const prior = history[history.length - 2];

  // ── 2. Conformance fell ──────────────────────────────────────────────────
  if (latest.fitness === null || prior.fitness === null) {
    notEvaluated.push("Conformance is not watched: at least one of the two most recent runs was never checked against a reference model.");
  } else {
    const drop = prior.fitness - latest.fitness;
    if (drop >= FITNESS_DROP) {
      alerts.push({
        kind: "fitness-drop", severity: "error", runId: latest.runId,
        title: `Conformance fell from ${pct(prior.fitness)} to ${pct(latest.fitness)}`,
        detail: `Between "${prior.name}" and "${latest.name}". That is ${pct(drop)} of cases that used to replay cleanly and no longer do.`,
      });
    } else if (latest.fitness < FITNESS_FLOOR) {
      alerts.push({
        kind: "fitness-drop", severity: "warning", runId: latest.runId,
        title: `Conformance is ${pct(latest.fitness)}`,
        detail: `Below ${pct(FITNESS_FLOOR)}, and steady rather than falling — it did not get worse this period, it has been this way.`,
      });
    }
  }

  // ── 3. A deviation nobody had seen before ────────────────────────────────
  const before = new Set(prior.violations);
  const appeared = latest.violations.filter((v) => !before.has(v));
  if (appeared.length > 0) {
    alerts.push({
      kind: "new-deviation", severity: "error", runId: latest.runId,
      title: appeared.length === 1 ? "A deviation appeared that was not there before" : `${appeared.length} deviations appeared that were not there before`,
      detail: appeared.slice(0, 3).join("; ") + (appeared.length > 3 ? `; and ${appeared.length - 3} more` : ""),
    });
  }

  // ── 4. The late rate doubled ─────────────────────────────────────────────
  if (latest.lateRate === null || prior.lateRate === null) {
    notEvaluated.push("The late rate is not watched: no SLA is set, so no case can be late.");
  } else if (prior.lateRate <= 0) {
    // Doubling nothing is still nothing; a first late case is a change of state
    // and is reported as a floor breach rather than an infinite multiple.
    if (latest.lateRate >= LATE_RATE_FLOOR) {
      alerts.push({
        kind: "late-rate-doubled", severity: "warning", runId: latest.runId,
        title: `${pct(latest.lateRate)} of cases are now late`,
        detail: `Nothing was late in "${prior.name}".`,
      });
    }
  } else if (latest.lateRate >= prior.lateRate * 2 && latest.lateRate >= LATE_RATE_FLOOR) {
    alerts.push({
      kind: "late-rate-doubled", severity: "error", runId: latest.runId,
      title: `The late rate went from ${pct(prior.lateRate)} to ${pct(latest.lateRate)}`,
      detail: `More than double, between "${prior.name}" and "${latest.name}".`,
    });
  }

  return { alerts, notEvaluated };
}

/** A stable key for one alert, so the same condition is not announced twice. */
export function alertKey(runIdOrSourceId: string, a: MiningAlert): string {
  return `${runIdOrSourceId}:${a.kind}:${a.title}`;
}

/**
 * Per-element baseline simulation parameters, stored in `element.properties.sim`.
 *
 * These are the numbers a user annotates on the model (visible in the
 * Properties panel, versioned with the diagram). They mirror the BPSim
 * parameter categories so the BPSim importer/exporter (app/lib/simulation/bpsim)
 * maps losslessly, and they feed the engine network (app/lib/simulation/model)
 * at assembly time. All fields optional + additive (schema 1.24).
 */

import type { SimDist } from "@/app/lib/simulation/types";
import type { DiagramElement } from "./types";

export type { SimDist };

/** A token property assignment (BPSim PropertyParameters): set a property to a
 *  sampled distribution OR an evaluated expression when the token passes. */
export interface SimAssignment {
  property: string;
  dist?: SimDist;
  expr?: string;
}

/** Expanded-subprocess loop behaviour. Standard loop ("Do while…" / "Repeat
 *  until…") repeats the body; multi-instance ("Repeat for each…") runs N
 *  instances sequentially or in parallel. */
export type LoopParams =
  | { kind: "standard"; iterations?: SimDist; loopBackProb?: number; test?: "while" | "until" }
  | { kind: "multi"; instances: SimDist; ordering: "sequential" | "parallel"; join?: "all"; };

export interface ElementSimParams {
  // source events (BPSim ControlParameters: InterTriggerTimer / TriggerCount)
  arrival?: SimDist;
  maxArrivals?: number;
  /** Working/operating hours: id of a project calendar (SimulationCalendar). On a
   *  source it gates arrivals to open windows; teams take their calendar from the
   *  Team library instead. Resolved to a WorkCalendar at assembly time. */
  calendarId?: string;
  // task (BPSim TimeParameters + ResourceParameters)
  cycleTime?: SimDist;
  setupTime?: SimDist;
  waitTime?: SimDist;
  teamId?: string;
  resourceUnits?: number;
  // delay / timer
  delay?: SimDist;
  // How the delay magnitude is interpreted (default "elapsed" when absent):
  //   "working" → `delay` counts only during working hours (the lane's calendar)
  //   "until"   → the token waits until `delayUntil` (wall-clock "HH:MM"), `delay` ignored
  delayMode?: "elapsed" | "working" | "until";
  delayUntil?: string;
  // boundary catch event on an activity: races the host's cycle time. `trigger`
  // = time from host-start until the event fires; `fireProb` (0..1, default 1) =
  // chance it fires at all this execution (e.g. a boundary error at ~5%).
  // `triggerMode` "working" counts the trigger only during working hours —
  // a reminder "after 7 working days" is not the same as 7 elapsed days. It is
  // set from the event's LABEL when the label says so ("7 working days"), and
  // absent means ELAPSED, which is the ordinary reading of "2 days".
  boundary?: { trigger?: SimDist; fireProb?: number; triggerMode?: "working" };
  // intermediate catch/throw synchronisation. `channel` names the signal/message
  // (defaults to the element label); a THROW fires it, a CATCH blocks until it
  // fires. `catchTimeout` (catch only) is a fallback / external-arrival release
  // so a catch with no reachable throw still proceeds.
  channel?: string;
  catchTimeout?: SimDist;
  // expanded subprocess loop / multi-instance
  loop?: LoopParams;
  // event subprocess: how long after the parent scope starts its trigger fires
  eventTrigger?: SimDist;
  // token property assignments (BPSim PropertyParameters)
  assign?: SimAssignment[];
  // subprocess: simulate the linked/inline body, or use a black-box summary
  subMode?: "simulate" | "summary";
  summaryCycleTime?: SimDist;
  /** Param keys on THIS element that were populated by "Fill missing" (not the
   *  user). Rendered purple; "Unfill missing" clears only still-listed keys. A
   *  manual edit to a field removes it from here (see simPatch), so a value the
   *  user has since overridden is never unfilled. */
  autofilled?: string[];
}

/** Process-level property definitions (BPSim Property), stored on DiagramData
 *  (`data.sim.properties`). Each is carried on every token. */
export interface SimPropertyDef {
  name: string;
  type?: "int" | "float" | "bool" | "string";
  initDist?: SimDist;
  initValue?: number | string | boolean;
}

export const DISTRIBUTION_KINDS: SimDist["kind"][] = [
  "fixed", "uniform", "triangular", "normal", "exponential",
];

/** A sensible default distribution for a freshly-added field. */
export function defaultDist(): SimDist {
  return { kind: "fixed", value: 1 };
}

/** Read the sim params off an element (never throws; returns {} if absent). */
export function getSimParams(el: Pick<DiagramElement, "properties">): ElementSimParams {
  const sim = el.properties?.sim;
  return sim && typeof sim === "object" ? (sim as ElementSimParams) : {};
}

/** Build the `{ sim }` properties patch for onUpdateProperties, merging a
 *  partial change over the element's current sim params. A manual edit here
 *  removes the touched keys from `autofilled` (see ElementSimParams) so a value
 *  the user has overridden is no longer treated as auto-filled. */
export function simPatch(el: Pick<DiagramElement, "properties">, patch: Partial<ElementSimParams>): { sim: ElementSimParams } {
  const cur = getSimParams(el);
  const touched = Object.keys(patch);
  const next: ElementSimParams = { ...cur, ...patch };
  if (cur.autofilled && cur.autofilled.length) {
    const remaining = cur.autofilled.filter((k) => !touched.includes(k));
    if (remaining.length) next.autofilled = remaining; else delete next.autofilled;
  }
  return { sim: next };
}

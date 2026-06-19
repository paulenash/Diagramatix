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
  // task (BPSim TimeParameters + ResourceParameters)
  cycleTime?: SimDist;
  setupTime?: SimDist;
  waitTime?: SimDist;
  teamId?: string;
  resourceUnits?: number;
  // delay / timer
  delay?: SimDist;
  // expanded subprocess loop / multi-instance
  loop?: LoopParams;
  // event subprocess: how long after the parent scope starts its trigger fires
  eventTrigger?: SimDist;
  // token property assignments (BPSim PropertyParameters)
  assign?: SimAssignment[];
  // subprocess: simulate the linked/inline body, or use a black-box summary
  subMode?: "simulate" | "summary";
  summaryCycleTime?: SimDist;
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
 *  partial change over the element's current sim params. */
export function simPatch(el: Pick<DiagramElement, "properties">, patch: Partial<ElementSimParams>): { sim: ElementSimParams } {
  return { sim: { ...getSimParams(el), ...patch } };
}

/**
 * Normalised representation of a BPSim (OMG/WfMC) scenario — the neutral shape
 * the importer produces and the exporter consumes, sitting between BPSim XML
 * and our engine model. Parameter categories mirror BPSim: TimeParameters,
 * ControlParameters, ResourceParameters, PropertyParameters.
 *
 * Times that arrive as xsd:duration (DurationParameter) are converted to the
 * target ClockUnit at parse time; distribution params (mean/sd/min/max) are
 * plain numbers in the scenario's base unit, passed through verbatim.
 */

import type { SimDist } from "../types";

/** A token-property entry: either an initial distribution (a Property def) or
 *  an expression assignment applied when the token passes the element. */
export interface BpsimAssignment {
  property: string;
  type?: string;
  init?: SimDist;     // <Property><...Distribution/></Property>
  expr?: string;      // <Property><ExpressionParameter value="..."/></Property>
}

/** Per-element parameters keyed by the BPMN elementRef. */
export interface BpsimElementParams {
  // TimeParameters
  processingTime?: SimDist;
  waitTime?: SimDist;
  setupTime?: SimDist;
  // ControlParameters
  interArrival?: SimDist;   // InterTriggerTimer
  probability?: number;     // Probability / FloatingParameter (on a sequence flow)
  condition?: string;       // Condition / ExpressionParameter
  // ResourceParameters
  quantity?: number;        // Quantity / NumericParameter (staffed capacity)
  selection?: string;       // Selection / ExpressionParameter (getResource(...))
  // PropertyParameters
  assignments?: BpsimAssignment[];
}

export interface BpsimScenario {
  id?: string;
  name?: string;
  author?: string;
  /** ScenarioParameters @replication. */
  replication?: number;
  /** ScenarioParameters/Duration → horizon, in the chosen ClockUnit. */
  horizon?: number;
  /** ScenarioParameters/Warmup → warm-up, in the chosen ClockUnit. */
  warmUp?: number;
  /** elementRef → its parameters. */
  elements: Record<string, BpsimElementParams>;
}

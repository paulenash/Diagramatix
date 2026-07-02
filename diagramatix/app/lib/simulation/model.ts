/**
 * The engine-facing process network — a flat node/edge graph the simulator
 * runs on, deliberately decoupled from the BPMN diagram. `network.ts` (later)
 * assembles this from one or more diagrams via walkForwardClosure; tests and
 * the BPSim importer build it directly. Keeping the engine's input this simple
 * is what lets one engine serve single processes, portfolios and conformance
 * fixtures alike.
 */

import type { SimDist, WorkCalendar } from "./types";

export type NodeKind = "source" | "task" | "gateway" | "delay" | "sink" | "subprocess";

/** Expanded-subprocess loop behaviour (engine form). Standard loop repeats the
 *  body (a fixed iteration count, or a per-pass loop-back probability);
 *  multi-instance runs N body instances sequentially or in parallel. */
export type LoopSpec =
  | { kind: "standard"; iterations?: SimDist; loopBackProb?: number }
  | { kind: "multi"; instances: SimDist; ordering: "sequential" | "parallel" };

/** An Event Subprocess attached to an Expanded Subprocess: fires while the
 *  parent scope is active. Non-interrupting runs a handler alongside the
 *  parent; interrupting cancels the parent scope and diverts to the handler. */
export interface EventSub {
  id: string;
  bodyStart: string;     // entry node of the handler body (body nodes scope = id)
  trigger: SimDist;      // timer: delay from scope entry until the event fires
  interrupting: boolean;
}

/** Set a token property when a token passes through (BPSim PropertyParameters):
 *  value is either a distribution to sample or an expression to evaluate. */
export interface Assignment {
  property: string;
  value: SimDist | { expr: string };
}

export interface SimNode {
  id: string;
  kind: NodeKind;
  label?: string;
  /** Diagram this node came from (for per-diagram roll-up + replay scoping). */
  diagramId?: string;
  /** The subprocess (EP) this node is the body of — set on body nodes so a
   *  token can tell when it has reached the end of the current scope. */
  scope?: string;
  // subprocess (expanded subprocess body)
  bodyStart?: string;   // entry node of the inline body
  loop?: LoopSpec;      // loop / multi-instance wrapping of the body
  eventSubs?: EventSub[]; // event subprocesses that may fire while this scope runs
  // source
  arrival?: SimDist;
  maxArrivals?: number;
  /** Operating hours for this source: arrivals are only generated during open
   *  windows (deferred to the next open time otherwise), with per-window rate
   *  multipliers for time-varying (peak/off-peak) arrivals. Absent → 24/7. */
  calendar?: WorkCalendar;
  // task
  cycleTime?: SimDist;
  setupTime?: SimDist;   // BPSim SetupTime, added before processing
  waitTime?: SimDist;    // BPSim WaitTime — non-seizing delay after service
  teamId?: string;
  units?: number;        // resource Quantity (default 1)
  // delay
  delay?: SimDist;
  // gateway
  gateway?: "decision" | "parallel";
  // token property assignments applied on entry
  assign?: Assignment[];
}

export interface SimEdge {
  id: string;
  source: string;
  target: string;
  /** Decision branch probability 0..1 (BPSim Probability / FloatingParameter). */
  probability?: number;
  /** Decision branch condition (BPSim Condition / ExpressionParameter). */
  condition?: { expr: string };
  /** Fallback edge when no condition matches / probabilities under-sum. */
  isDefault?: boolean;
}

export interface SimTeam {
  id: string;
  capacity: number;
  /** Working hours: the team is staffed at `capacity` during open windows and
   *  0 when closed (in-service tasks finish; new seizes wait). Absent → 24/7. */
  calendar?: WorkCalendar;
}

export interface SimPropertyDef {
  name: string;
  /** Initial value: a distribution to sample per token, or a literal. */
  init?: SimDist | number | string | boolean;
}

export interface SimNetwork {
  nodes: SimNode[];
  edges: SimEdge[];
  teams: SimTeam[];
  properties?: SimPropertyDef[];
}

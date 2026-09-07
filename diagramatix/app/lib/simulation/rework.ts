/**
 * Rework, in the words people actually use — and "what if we automate this?" as
 * a scenario rather than an aspiration.
 *
 * Smaller items 01 and 05 of the Simulator extension plan.
 *
 * REWORK (01). The engine has always been able to model rework: a decision
 * gateway whose "fail" branch loops back to an earlier task is exactly it. But
 * nobody thinks of it as "an edge probability on a loop-back connector" — they
 * think "about one in eight come back". The value is the same number, read the
 * other way round, so this needs no engine change at all: find the loop-backs,
 * express them as a rework rate and a first-pass yield, and let the number be set
 * in those terms.
 *
 * AUTOMATION (05). Task Mining already scores a task's automation potential.
 * Turning that score into a quantified saving is one override away: set the
 * task's time near zero and drop its demand on the team. That is a scenario the
 * Simulator can run, so the score stops being a number and becomes a business
 * case.
 *
 * Pure — no DB, no React, and safe for a client component to import.
 */

import type { ConnectorType, DiagramData } from "@/app/lib/diagram/types";
import type { OverrideSet } from "./overrides";

/** A loop-back connector: a sequence flow that returns to a task already passed.
 *  `probability` is the share of cases that take it — the rework rate. */
export interface ReworkLoop {
  /** The connector that loops back. */
  connectorId: string;
  /** The gateway (or task) the loop leaves from. */
  fromId: string;
  fromLabel: string;
  /** The task the work returns to. */
  toId: string;
  toLabel: string;
  /** Share of cases that come back, 0..1. Undefined when the branch carries no
   *  probability yet — unset, not zero. */
  reworkRate?: number;
  /** 1 − reworkRate, the share that get it right first time. */
  firstPassYield?: number;
}

const pct = (x: number) => Math.round(x * 1000) / 10;

/**
 * Find the rework loops in a diagram: sequence flows that go BACKWARDS, i.e. to
 * an element the flow has already reached.
 *
 * "Backwards" is decided by a forward walk from the start events, not by
 * geometry — a loop drawn left-to-right is still a loop, and a long flow drawn
 * right-to-left is not.
 */
export function findReworkLoops(data: DiagramData): ReworkLoop[] {
  const elements = data.elements ?? [];
  // BPMN sequence flows are "sequence"; "flow"/"flowline" are the flowchart
  // equivalents. Anything else (message, association) is not process flow and
  // must not be walked, or a message to a black-box pool would read as a loop.
  const FLOW: ConnectorType[] = ["sequence", "flow", "flowline"];
  const connectors = (data.connectors ?? []).filter((c) => FLOW.includes(c.type));
  const byId = new Map(elements.map((e) => [e.id, e]));

  const out = new Map<string, string[]>();
  for (const c of connectors) {
    if (!c.sourceId || !c.targetId) continue;
    (out.get(c.sourceId) ?? out.set(c.sourceId, []).get(c.sourceId)!).push(c.targetId);
  }

  // Depth-first from every start event, marking the current path. An edge whose
  // target is ON the current path goes backwards — that is the loop.
  const starts = elements.filter((e) => e.type === "start-event").map((e) => e.id);
  const roots = starts.length ? starts : elements.filter((e) => !connectors.some((c) => c.targetId === e.id)).map((e) => e.id);

  const backEdges = new Set<string>();
  const onPath = new Set<string>();
  const done = new Set<string>();
  const walk = (id: string) => {
    if (onPath.has(id)) return;
    onPath.add(id);
    for (const next of out.get(id) ?? []) {
      if (onPath.has(next)) backEdges.add(`${id}${next}`);
      else if (!done.has(next)) walk(next);
    }
    onPath.delete(id);
    done.add(id);
  };
  for (const r of roots) walk(r);

  const label = (id: string) => (byId.get(id)?.label ?? "").replace(/\s+/g, " ").trim() || id;

  return connectors
    .filter((c) => backEdges.has(`${c.sourceId}${c.targetId}`))
    .map((c) => {
      // READ from the diagram: Connector.branchProbability. WRITE via an override:
      // EdgeOverride.probability, keyed by the engine edge id. Two different names
      // for the same quantity at two different layers - do not conflate them.
      const p = typeof c.branchProbability === "number" ? c.branchProbability : undefined;
      return {
        connectorId: c.id,
        fromId: c.sourceId!, fromLabel: label(c.sourceId!),
        toId: c.targetId!, toLabel: label(c.targetId!),
        ...(p !== undefined ? { reworkRate: p, firstPassYield: Math.max(0, 1 - p) } : {}),
      };
    });
}

/** "About one in eight come back" → the override that sets it. `rate` is 0..1. */
export function reworkOverride(loop: ReworkLoop, rate: number): OverrideSet {
  const clamped = Math.max(0, Math.min(1, rate));
  return { connectors: { [loop.connectorId]: { probability: clamped } } };
}

/** A sentence a business reader recognises, from the same number. */
export function describeRework(loop: ReworkLoop): string {
  if (loop.reworkRate === undefined) {
    return `${loop.toLabel} can be sent back from ${loop.fromLabel}, but no rework rate has been set yet.`;
  }
  return (
    `${pct(loop.reworkRate)}% of cases come back to ${loop.toLabel} from ${loop.fromLabel} — ` +
    `a first-pass yield of ${pct(loop.firstPassYield!)}%.`
  );
}

/** How much of a task's demand automation is assumed to remove. Not zero: an
 *  automated step still takes some time and still fails occasionally, and a
 *  business case built on "instant and free" is one nobody believes. */
export const AUTOMATION_RESIDUAL = 0.05;

export interface AutomationProposal {
  nodeId: string;
  label: string;
  scenarioName: string;
  overrides: OverrideSet;
  /** Stated on the suggestion, because it is an assumption and not a result. */
  assumption: string;
}

/**
 * "What if we automate this task?" as a runnable scenario: the task keeps a small
 * residual time and stops consuming a person.
 *
 * `currentCycleMean` is only used to scale the residual, so a two-minute task
 * does not become a two-minute automated task. Pass nothing and the residual is
 * a flat small fixed time.
 */
export function automateTaskOverride(nodeId: string, label: string, currentCycleMean?: number): AutomationProposal {
  const residual = typeof currentCycleMean === "number" && currentCycleMean > 0
    ? Math.max(0.01, Math.round(currentCycleMean * AUTOMATION_RESIDUAL * 100) / 100)
    : 0.1;
  return {
    nodeId,
    label,
    scenarioName: `Automate ${label}`.slice(0, 120),
    overrides: {
      elements: {
        [nodeId]: {
          cycleTime: { kind: "fixed", value: residual },
          // The work no longer draws on the team's capacity, which is usually
          // where the saving actually comes from — not the time on the task.
          units: 0,
        },
      },
    },
    assumption:
      `Assumes the step still takes ${residual} (about ${Math.round(AUTOMATION_RESIDUAL * 100)}% of its current time) ` +
      `and no longer occupies a person. It does not assume the automation is free to build — enter that as the ` +
      `implementation cost in the business case.`,
  };
}

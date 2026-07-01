/**
 * Build a replay from the current diagram: assemble → run one traced
 * replication → return the token-movement trace for the player to animate.
 * Pure client-side (instant, no round-trip), per the plan.
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { Engine, type TraceEvent, type Intervention } from "./engine";
import { assembleFromDiagram } from "./assemble";
import { spliceLinkedSubprocesses } from "./spliceLinks";
import type { SimNetwork } from "./model";
import { getSimParams } from "@/app/lib/diagram/simParams";
import { DEFAULT_RUN_CONFIG, type SimRunConfig } from "./types";

export interface ReplayData {
  trace: TraceEvent[];
  durationSim: number;
  /** Assembled node id → team id, so the live stats credit the right teams
   *  (including those inside linked/expanded subprocesses). */
  nodeTeam: Map<string, string>;
}

/** Optional project diagrams so linked (collapsed) subprocesses are flattened in
 *  — exactly as the real run does — instead of animating as a pass-through. */
export interface ReplayOpts { rootId?: string; byId?: Map<string, DiagramData> }

function assembleForReplay(data: DiagramData, teamCapacities: Record<string, number> | undefined, opts?: ReplayOpts): SimNetwork {
  const src = opts?.byId && opts.rootId ? spliceLinkedSubprocesses(data, opts.rootId, opts.byId) : data;
  return assembleFromDiagram(src, { teamCapacities });
}

function nodeTeamOf(net: SimNetwork): Map<string, string> {
  return new Map(net.nodes.filter((n) => n.teamId).map((n) => [n.id, n.teamId as string]));
}

/** A short, watchable default run for the interactive replay. */
export function defaultReplayConfig(seed = 1): SimRunConfig {
  return { ...DEFAULT_RUN_CONFIG, horizon: 240, warmUp: 0, replications: 1, seed, collectQueues: true };
}

/** Distinct team ids referenced by the diagram's tasks (for the Operator panel). */
export function teamIdsInDiagram(data: DiagramData): string[] {
  const ids = new Set<string>();
  for (const el of data.elements) {
    const t = getSimParams(el).teamId;
    if (t) ids.add(t);
  }
  return [...ids];
}

function endOf(trace: TraceEvent[], fallback: number): number {
  return trace.length ? trace[trace.length - 1].t : fallback;
}

export function buildReplay(
  data: DiagramData,
  config: SimRunConfig,
  teamCapacities?: Record<string, number>,
  opts?: ReplayOpts,
): ReplayData {
  const net = assembleForReplay(data, teamCapacities, opts);
  const e = new Engine(net, config, undefined, { trace: true, maxTrace: 50000 });
  e.run();
  return { trace: e.getTrace(), durationSim: endOf(e.getTrace(), config.horizon), nodeTeam: nodeTeamOf(net) };
}

/**
 * Fork the timeline: re-run deterministically to `atSimT`, apply the Operator's
 * intervention, then continue. Because the engine is deterministic the prefix
 * up to `atSimT` is identical to the original run, so the player can keep its
 * clock and watch the divergence. Returns one coherent forked trace.
 */
export function forkReplay(
  data: DiagramData,
  config: SimRunConfig,
  atSimT: number,
  iv: Intervention,
  teamCapacities?: Record<string, number>,
  opts?: ReplayOpts,
): ReplayData {
  const net = assembleForReplay(data, teamCapacities, opts);
  const e = new Engine(net, config, undefined, { trace: true, maxTrace: 50000 });
  e.reset();
  e.runUntil(atSimT);
  e.applyIntervention(iv);
  e.runUntil(config.horizon);
  return { trace: e.getTrace(), durationSim: endOf(e.getTrace(), config.horizon), nodeTeam: nodeTeamOf(net) };
}

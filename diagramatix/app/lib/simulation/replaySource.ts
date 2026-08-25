/**
 * Build a replay from the current diagram: assemble → run one traced
 * replication → return the token-movement trace for the player to animate.
 * Pure client-side (instant, no round-trip), per the plan.
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { Engine, type TraceEvent, type Intervention } from "./engine";
import { assembleFromDiagram, type CalendarOpts } from "./assemble";
import { spliceLinkedSubprocesses } from "./spliceLinks";
import type { SimNetwork } from "./model";
import { getSimParams } from "@/app/lib/diagram/simParams";
import { DEFAULT_RUN_CONFIG, SECONDS_PER_UNIT, type SimRunConfig, type WorkCalendar, type ClockUnit } from "./types";
import { nextOpenAt } from "./calendar";
import type { NodeMeta } from "./tokenTable";

export interface ReplayData {
  trace: TraceEvent[];
  durationSim: number;
  /** Assembled node id → team id, so the live stats credit the right teams
   *  (including those inside linked/expanded subprocesses). */
  nodeTeam: Map<string, string>;
  /** Assembled node id → label/kind/team, for the token-trace table columns. */
  nodeMeta: Map<string, NodeMeta>;
  /** Node ids in FLOW order (topological from the sources, sub-process bodies
   *  expanded in place). The trace table orders its columns by this so they read
   *  left-to-right in the order work actually happens — which the trace alone
   *  can't tell you, because a rarely-taken branch and a sub-process's own
   *  short-lived tokens both distort any ordering derived from visit times. */
  flowOrder: string[];
  /** Resources activities named that are NOT in the project's Resources list.
   *  Under strict assembly these get no pool, so the work is unresourced — which
   *  is correct but must never be silent: the view shows these so a run can
   *  always explain why an activity is not queueing for anyone. */
  unknownTeams: string[];
}

/**
 * Flow order: breadth-first from the START events, following sequence edges and
 * stepping into each sub-process body where it is entered.
 *
 * Deliberately NOT a plain topological sort. Kahn's algorithm seeds from every
 * node with no incoming edge, so a step that is missing its inbound connector —
 * common in a model still being drawn — sorts to the very front as if it ran
 * first. Walking forward from the sources instead means the mainline reads in
 * order and anything unreachable is appended at the END, where its disconnection
 * is obvious rather than misleading. Cycles (rework loops) terminate on `seen`.
 */
function flowOrderOf(net: SimNetwork): string[] {
  const out = new Map<string, string[]>();
  const push = (from: string, to: string) => (out.get(from) ?? out.set(from, []).get(from)!).push(to);
  for (const e of net.edges) push(e.source, e.target);
  // A sub-process's body hangs off bodyStart rather than an edge — follow it so
  // the body's steps sort immediately after their container.
  for (const n of net.nodes) if (n.bodyStart) push(n.id, n.bodyStart);

  const queue = net.nodes.filter((n) => n.kind === "source").map((n) => n.id);
  const seen = new Set<string>(queue);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const nxt of out.get(id) ?? []) if (!seen.has(nxt)) { seen.add(nxt); queue.push(nxt); }
  }
  for (const n of net.nodes) if (!seen.has(n.id)) order.push(n.id); // unreachable → last
  return order;
}

/** Words for the kinds that are commonly left unnamed. */
const KIND_WORD: Record<string, string> = { source: "start", sink: "end", delay: "event", gateway: "gateway" };

function nodeMetaOf(net: SimNetwork): Map<string, NodeMeta> {
  const labelById = new Map(net.nodes.map((n) => [n.id, (n.label ?? "").trim()]));
  return new Map(net.nodes.map((n) => {
    // A start/end event inside an expanded sub-process is deliberately unnamed,
    // so falling back to the raw node id shows the user a meaningless hex string
    // ("Event mnuzzcry"). Name it by what it is and which sub-process it's in.
    let label = (n.label ?? "").trim();
    if (!label) {
      const word = KIND_WORD[n.kind] ?? n.kind;
      const scope = n.scope ? labelById.get(n.scope) : "";
      label = scope ? `(${word} in ${scope})` : `(unnamed ${word})`;
    }
    return [n.id, { label, kind: n.kind, team: n.teamId }];
  }));
}

/** Optional project diagrams so linked (collapsed) subprocesses are flattened in
 *  — exactly as the real run does — instead of animating as a pass-through.
 *  Working calendars (team + source) make the replay show tokens queuing outside
 *  hours, matching the authoritative run. */
export interface ReplayOpts extends CalendarOpts { rootId?: string; byId?: Map<string, DiagramData> }

function assembleForReplay(data: DiagramData, teamCapacities: Record<string, number> | undefined, opts?: ReplayOpts): SimNetwork {
  const src = opts?.byId && opts.rootId ? spliceLinkedSubprocesses(data, opts.rootId, opts.byId) : data;
  // strictTeams: only resources the user can SEE and adjust may affect a run.
  return assembleFromDiagram(src, { teamCapacities, strictTeams: true, teamCalendars: opts?.teamCalendars, calendarsById: opts?.calendarsById });
}

function nodeTeamOf(net: SimNetwork): Map<string, string> {
  return new Map(net.nodes.filter((n) => n.teamId).map((n) => [n.id, n.teamId as string]));
}

/** A short, watchable default run for the interactive replay. */
export function defaultReplayConfig(seed = 1): SimRunConfig {
  return { ...DEFAULT_RUN_CONFIG, horizon: 240, warmUp: 0, replications: 1, seed, collectQueues: true };
}

/**
 * A replay horizon that actually contains some work.
 *
 * The simulation clock starts at **t=0 ≙ Monday 00:00** and the short default
 * window is four hours — so a model whose teams work 09:00–17:00 has a replay
 * covering Mon 00:00–04:00, in which nothing can happen at all. The clock ticks,
 * tokens arrive and queue, and no work ever starts: the replay looks stuck, and
 * a run of the same model looks fine because a scenario run uses its own
 * multi-day horizon.
 *
 * So extend the window past the first open moment across the calendared teams
 * and give it a full shift beyond that. With no calendars (24/7) the short
 * window is already fine and is left alone.
 */
export function replayHorizonFor(
  base: number,
  teamCalendars: Record<string, WorkCalendar> | undefined,
  clockUnit: ClockUnit,
): number {
  const cals = Object.values(teamCalendars ?? {}).filter((c) => (c?.intervals?.length ?? 0) > 0);
  if (cals.length === 0) return base; // always open — the short window shows work
  // The soonest any calendared team could start, and one shift beyond it.
  const firstOpen = Math.min(...cals.map((c) => nextOpenAt(0, c, clockUnit)));
  const shift = (8 * 3600) / SECONDS_PER_UNIT[clockUnit];
  return Math.max(base, Math.ceil(firstOpen + shift));
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
  return { trace: e.getTrace(), durationSim: endOf(e.getTrace(), config.horizon), nodeTeam: nodeTeamOf(net), nodeMeta: nodeMetaOf(net), flowOrder: flowOrderOf(net), unknownTeams: net.unknownTeams ?? [] };
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
  return { trace: e.getTrace(), durationSim: endOf(e.getTrace(), config.horizon), nodeTeam: nodeTeamOf(net), nodeMeta: nodeMetaOf(net), flowOrder: flowOrderOf(net), unknownTeams: net.unknownTeams ?? [] };
}

/**
 * Sparse scenario overrides — a scenario stores ONLY what differs from the
 * study's assembled baseline network, and `applyOverrides` deep-merges those
 * differences over a fresh copy of the baseline. This is the BPSim
 * `Scenario inherits` concept: one assembled baseline, many cheap what-ifs.
 *
 * Overrides are keyed by the engine network's ids (node id = element id,
 * edge id = connector id, team id = the resource pool id), so the manager UI
 * writes "change just this element's cycle time" without copying the diagram.
 * Applying always returns a NEW network — the baseline is reused unmutated
 * across every scenario in a run, so this must never write through to it.
 */

import type { SimNetwork, SimNode, SimEdge, SimTeam } from "./model";
import type { SimDist } from "./types";

/** The overridable subset of a node's simulation params. Every field optional
 *  + sparse: only defined keys replace the baseline value. */
export interface NodeOverride {
  cycleTime?: SimDist;
  setupTime?: SimDist;
  waitTime?: SimDist;
  teamId?: string;
  units?: number;
  arrival?: SimDist;
  maxArrivals?: number;
  delay?: SimDist;
}

export interface TeamOverride {
  capacity?: number;
}

export interface EdgeOverride {
  probability?: number;
}

/** A scenario's sparse difference from the baseline (stored as JSON on
 *  SimulationScenario.overrides). Names mirror the plan's OverrideSet:
 *  `elements` by node id, `connectors` by edge id, `teams` by pool id. */
export interface OverrideSet {
  elements?: Record<string, NodeOverride>;
  connectors?: Record<string, EdgeOverride>;
  teams?: Record<string, TeamOverride>;
}

const NODE_KEYS: (keyof NodeOverride)[] = [
  "cycleTime", "setupTime", "waitTime", "teamId", "units", "arrival", "maxArrivals", "delay",
];

/** True if the override set carries no actual changes. */
export function isEmptyOverride(ov?: OverrideSet): boolean {
  if (!ov) return true;
  return (
    !ov.elements || Object.keys(ov.elements).length === 0
  ) && (
    !ov.connectors || Object.keys(ov.connectors).length === 0
  ) && (
    !ov.teams || Object.keys(ov.teams).length === 0
  );
}

/** Deep-clone a network so overrides never mutate the shared baseline. The
 *  SimNetwork is plain JSON-safe data, so a structured deep copy is correct
 *  and avoids aliasing nested SimDist objects between baseline and scenario. */
function cloneNetwork(net: SimNetwork): SimNetwork {
  return {
    nodes: net.nodes.map((n) => ({ ...n })),
    edges: net.edges.map((e) => ({ ...e })),
    teams: net.teams.map((t) => ({ ...t })),
    properties: net.properties ? net.properties.map((p) => ({ ...p })) : undefined,
  };
}

/** Apply a sparse override set over a baseline network, returning a new
 *  network. Unknown ids are ignored (the model may have changed since the
 *  override was authored). A team referenced by a node override but absent
 *  from the baseline is created with capacity 1 so the engine has a pool. */
export function applyOverrides(baseline: SimNetwork, ov?: OverrideSet): SimNetwork {
  const net = cloneNetwork(baseline);
  if (isEmptyOverride(ov)) return net;

  if (ov!.elements) {
    const byId = new Map<string, SimNode>(net.nodes.map((n) => [n.id, n]));
    for (const [id, patch] of Object.entries(ov!.elements)) {
      const node = byId.get(id);
      if (!node || !patch) continue;
      for (const key of NODE_KEYS) {
        if (patch[key] !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (node as any)[key] = patch[key];
        }
      }
    }
  }

  if (ov!.connectors) {
    const byId = new Map<string, SimEdge>(net.edges.map((e) => [e.id, e]));
    for (const [id, patch] of Object.entries(ov!.connectors)) {
      const edge = byId.get(id);
      if (!edge || !patch) continue;
      if (patch.probability !== undefined) edge.probability = patch.probability;
    }
  }

  if (ov!.teams) {
    const byId = new Map<string, SimTeam>(net.teams.map((t) => [t.id, t]));
    for (const [id, patch] of Object.entries(ov!.teams)) {
      if (!patch) continue;
      const team = byId.get(id);
      if (team) {
        if (patch.capacity !== undefined) team.capacity = patch.capacity;
      } else if (patch.capacity !== undefined) {
        const created: SimTeam = { id, capacity: patch.capacity };
        net.teams.push(created);
        byId.set(id, created);
      }
    }
  }

  // A node override may point a task at a team the baseline never declared
  // (the user retargeted resourcing). Ensure every referenced team has a pool.
  const known = new Set(net.teams.map((t) => t.id));
  for (const node of net.nodes) {
    if (node.teamId && !known.has(node.teamId)) {
      net.teams.push({ id: node.teamId, capacity: 1 });
      known.add(node.teamId);
    }
  }

  return net;
}

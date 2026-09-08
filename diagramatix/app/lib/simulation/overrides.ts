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
import type { PoolUnit, QueueDiscipline } from "./resourcePool";

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
  /** "What if this step no longer needed the specialist?" — the other half of
   *  the cross-training question. An EMPTY array means "requires nothing", which
   *  is different from absent ("leave the baseline alone"), so both are usable. */
  requiredSkills?: string[];
}

/** One person, as a scenario states them. */
export interface TeamMemberOverride {
  name: string;
  /** What this person can do IN THIS SCENARIO. Replaces their library skills
   *  outright — a scenario says what is true, it does not accumulate. */
  skills: string[];
}

export interface TeamOverride {
  capacity?: number;
  /** "What if we triaged?" is a scenario, not a rebuild of the model. */
  discipline?: QueueDiscipline;
  /**
   * Cross-training and new starters — "what if we trained someone?", which is
   * the only question anyone asks once they have a skills matrix, and which was
   * unaskable before this existed.
   *
   * MERGED BY NAME, never a whole-list replacement: naming one person must not
   * silently delete the rest of the team. A name the team already has has its
   * skills replaced; a name it does not have is ADDED as a new person, which is
   * how "hire two more administrators" is expressed.
   *
   * Names match the way every other cross-model link in the product matches
   * them — trimmed, whitespace-collapsed, case-insensitive — so a stray capital
   * retrains the person you meant rather than inventing a phantom twin. The
   * SPELLING kept is the library's, so the roster does not change appearance.
   *
   * Note this can turn a counted pool into a skilled one. That is intended: it
   * is the only way to ask the question of a team that has never named anybody.
   */
  members?: TeamMemberOverride[];
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
  // Listed here and nowhere else: being a NODE_KEY is also what puts a lever in
  // the sweep and the tornado, so a parameter added here is testable for free.
  "requiredSkills",
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

/** The same normalisation every cross-model name match in the product uses. */
const normaliseName = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Merge a scenario's people over the library's, BY NAME.
 *
 * Builds an entirely new array of new objects rather than editing in place:
 * `cloneNetwork` shallow-copies each team, so the baseline's `units` array and
 * the unit objects inside it are SHARED with every scenario. Mutating one here
 * would rewrite the baseline and every other scenario derived from it — a
 * cross-scenario corruption that would look like a random engine bug.
 */
function mergeMembers(base: PoolUnit[] | undefined, patch: TeamMemberOverride[]): PoolUnit[] {
  const out: PoolUnit[] = (base ?? []).map((u) => ({ ...u, skills: [...u.skills] }));
  const byName = new Map(out.map((u, i) => [normaliseName(u.name ?? u.id), i]));
  for (const m of patch) {
    if (!m || typeof m.name !== "string" || !m.name.trim()) continue;
    const skills = Array.isArray(m.skills) ? m.skills.filter((x) => typeof x === "string") : [];
    const at = byName.get(normaliseName(m.name));
    if (at !== undefined) {
      // Keep the library's spelling of the name and its id; only what the
      // person can do is what the scenario is changing.
      out[at] = { ...out[at], skills };
    } else {
      const name = m.name.trim();
      out.push({ id: name, name, skills });
      byName.set(normaliseName(name), out.length - 1);
    }
  }
  return out;
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
        if (patch.discipline !== undefined) team.discipline = patch.discipline;
        if (patch.members?.length) team.units = mergeMembers(team.units, patch.members);
      } else if (patch.capacity !== undefined || patch.members?.length) {
        const created: SimTeam = { id, capacity: patch.capacity ?? 1 };
        if (patch.discipline !== undefined) created.discipline = patch.discipline;
        if (patch.members?.length) created.units = mergeMembers(undefined, patch.members);
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

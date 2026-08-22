/**
 * Portfolio assembly — turn a set of BPMN diagrams into ONE engine network so
 * the simulator runs many processes in a single replication, sharing team
 * pools. Cross-process contention is the whole point: two diagrams whose tasks
 * both draw on the "Analysts" pool compete for it because there is exactly one
 * pool per distinct teamId across the entire portfolio.
 *
 * Each diagram is assembled with the single-diagram `assembleFromDiagram`
 * (which already splices a diagram's INLINE expanded subprocesses + event subs,
 * Phase 3d) and then namespaced (`<diagramId>::<id>`) so node/edge ids never
 * collide between diagrams. Team ids are deliberately NOT namespaced — that
 * shared key is what couples the processes.
 *
 * `portfolioClosure` computes the forward-link closure of a set of root
 * diagrams (the diagrams a Study would pull in). Cross-diagram subprocess
 * *drill-down* splicing (a collapsed subprocess simulating its LINKED child
 * diagram inline) reuses the same scope mechanism but needs per-usage cloning
 * to keep a child reused by two parents isolated; that is a planned extension.
 * Until then a linked child appears in the portfolio as its own top-level
 * graph (still sharing team pools), and a collapsed subprocess with no inline
 * body stays a black-box summary task.
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { extractForwardLinks } from "@/app/lib/diagram/linkClosure";
import { assembleFromDiagram, type CalendarOpts } from "./assemble";
import type { SimNetwork, SimNode, SimEdge, SimTeam } from "./model";

export interface PortfolioDiagram {
  id: string;
  data: DiagramData;
}

const NS = "::";
const ns = (diagramId: string, id: string) => `${diagramId}${NS}${id}`;

/** Prefix every id inside a single-diagram network with its diagram id, and
 *  stamp `diagramId` on each node for per-diagram roll-up + replay scoping.
 *  Team ids are left raw so pools stay shared across the portfolio. */
function namespaceFragment(net: SimNetwork, diagramId: string): SimNetwork {
  const p = (id: string | undefined) => (id === undefined ? undefined : ns(diagramId, id));

  const nodes: SimNode[] = net.nodes.map((n) => ({
    ...n,
    id: ns(diagramId, n.id),
    diagramId,
    scope: p(n.scope),
    bodyStart: p(n.bodyStart),
    eventSubs: n.eventSubs?.map((es) => ({
      ...es,
      id: ns(diagramId, es.id),
      bodyStart: ns(diagramId, es.bodyStart),
    })),
  }));

  const edges: SimEdge[] = net.edges.map((e) => ({
    ...e,
    id: ns(diagramId, e.id),
    source: ns(diagramId, e.source),
    target: ns(diagramId, e.target),
  }));

  // unknownTeams is carried through: a resource missing from the library must
  // still be reportable after namespacing, or it would vanish silently in a
  // portfolio run — precisely the failure this reporting exists to prevent.
  return { nodes, edges, teams: net.teams, properties: net.properties, unknownTeams: net.unknownTeams };
}

/**
 * Assemble a list of top-level process diagrams into one portfolio network.
 * Every distinct teamId becomes a single shared resource pool; a pool's
 * capacity comes from `teamCapacities` (the published team library) when
 * present, otherwise the largest capacity any fragment declared for it.
 */
export function assemblePortfolio(
  diagrams: PortfolioDiagram[],
  opts?: { teamCapacities?: Record<string, number>; strictTeams?: boolean } & CalendarOpts,
): SimNetwork {
  const nodes: SimNode[] = [];
  const edges: SimEdge[] = [];
  const teamCap = new Map<string, number>();
  const unknown = new Set<string>();

  for (const d of diagrams) {
    const frag = namespaceFragment(
      assembleFromDiagram(d.data, { teamCapacities: opts?.teamCapacities, strictTeams: opts?.strictTeams, teamCalendars: opts?.teamCalendars, calendarsById: opts?.calendarsById }),
      d.id,
    );
    for (const u of frag.unknownTeams ?? []) unknown.add(u);
    nodes.push(...frag.nodes);
    edges.push(...frag.edges);
    for (const t of frag.teams) {
      // One pool per teamId across the whole portfolio: prefer the library
      // capacity, else keep the largest any diagram asked for.
      const lib = opts?.teamCapacities?.[t.id];
      const next = lib ?? Math.max(teamCap.get(t.id) ?? 0, t.capacity);
      teamCap.set(t.id, next);
    }
  }

  // Re-attach each team's working calendar (by team name) — the per-team pools
  // are rebuilt here, so the calendar resolved in the fragments would be lost.
  const teams: SimTeam[] = [...teamCap].map(([id, capacity]) => ({
    id,
    capacity,
    ...(opts?.teamCalendars?.[id] ? { calendar: opts.teamCalendars[id] } : {}),
  }));
  // Carry every undeclared resource up from the fragments, so a portfolio run
  // can report them exactly as a single-diagram run does — a name that is not in
  // the Resources list must never be able to hide inside a linked diagram.
  const unknownTeams = [...unknown];
  return { nodes, edges, teams, ...(unknownTeams.length ? { unknownTeams } : {}) };
}

/**
 * Forward-link closure of `roots` within the supplied diagram set — the
 * diagrams a Study assembles (roots + every descendant reachable via in-set
 * `linkedDiagramId` links). Pure + in-memory (no DB), mirroring the
 * DB-backed `walkForwardClosure` used by the publish flow. Cycle-safe.
 */
export function portfolioClosure(diagrams: PortfolioDiagram[], roots: string[]): string[] {
  const byId = new Map(diagrams.map((d) => [d.id, d]));
  const visited = new Set<string>();
  const queue = roots.filter((r) => byId.has(r));

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const d = byId.get(cur);
    if (!d) continue;
    for (const link of extractForwardLinks(cur, d.data)) {
      if (byId.has(link.targetDiagramId) && !visited.has(link.targetDiagramId)) {
        queue.push(link.targetDiagramId);
      }
    }
  }

  return [...visited];
}

/**
 * Assemble a single BPMN diagram into the engine's SimNetwork.
 *
 * Maps BPMN element types to engine node kinds and pulls each element's
 * baseline simulation parameters from `properties.sim`. Decision-branch routing
 * (probability / condition / default) comes off the connectors. Distinct team
 * ids referenced by tasks become resource pools.
 *
 * This is the single-diagram path used by the live replay / Operator (which run
 * on the loaded diagram). The portfolio assembler (network.ts, Phase 4) will
 * extend this across linked diagrams via walkForwardClosure.
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { SimNetwork, SimNode, SimEdge, SimTeam, NodeKind, Assignment } from "./model";
import type { SimDist } from "./types";

function mapKind(type: string): NodeKind | null {
  switch (type) {
    case "start-event": return "source";
    case "end-event": return "sink";
    case "task":
    case "subprocess":
    case "subprocess-expanded": return "task";
    case "gateway": return "gateway";
    case "intermediate-event": return "delay";
    default: return null;
  }
}

const DEFAULT_ARRIVAL: SimDist = { kind: "exponential", mean: 10 };
const DEFAULT_CYCLE: SimDist = { kind: "fixed", value: 1 };

export function assembleFromDiagram(
  data: DiagramData,
  opts?: { teamCapacities?: Record<string, number> },
): SimNetwork {
  const nodes: SimNode[] = [];
  const teamIds = new Set<string>();

  for (const el of data.elements) {
    const kind = mapKind(el.type);
    if (!kind) continue;
    const sim = getSimParams(el);
    const node: SimNode = { id: el.id, kind, label: el.label };

    if (kind === "source") {
      node.arrival = sim.arrival ?? DEFAULT_ARRIVAL;
      node.maxArrivals = sim.maxArrivals;
    } else if (kind === "task") {
      node.cycleTime = sim.cycleTime ?? DEFAULT_CYCLE;
      node.setupTime = sim.setupTime;
      node.waitTime = sim.waitTime;
      node.teamId = sim.teamId;
      node.units = sim.resourceUnits ?? 1;
      if (sim.teamId) teamIds.add(sim.teamId);
    } else if (kind === "delay") {
      node.delay = sim.delay ?? { kind: "fixed", value: 0 };
    } else if (kind === "gateway") {
      // Parallel split when the gateway is explicitly parallel; else decision.
      node.gateway = el.gatewayType === "parallel" ? "parallel" : "decision";
    }

    if (sim.assign && sim.assign.length > 0) {
      node.assign = sim.assign.map<Assignment>((a) => ({
        property: a.property,
        value: a.expr ? { expr: a.expr } : (a.dist ?? { kind: "fixed", value: 0 }),
      }));
    }
    nodes.push(node);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: SimEdge[] = data.connectors
    .filter((c) => nodeIds.has(c.sourceId) && nodeIds.has(c.targetId))
    .map((c) => ({
      id: c.id,
      source: c.sourceId,
      target: c.targetId,
      probability: c.branchProbability !== undefined ? c.branchProbability / 100 : undefined,
      condition: c.branchCondition ? { expr: c.branchCondition } : undefined,
      isDefault: c.isDefaultFlow,
    }));

  const teams: SimTeam[] = [...teamIds].map((id) => ({ id, capacity: opts?.teamCapacities?.[id] ?? 1 }));

  return { nodes, edges, teams };
}

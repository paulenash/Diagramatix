/**
 * Assemble a single BPMN diagram into the engine's SimNetwork — now hierarchy-
 * aware so a drawn Expanded Subprocess (EP) simulates its inline body, and an
 * Event Subprocess nested inside an EP becomes an engine event sub.
 *
 * Mapping:
 *  • An Expanded Subprocess (`subprocess-expanded`, not an event sub) → a
 *    `subprocess` node; its child start-event is the body entry (a pass-through
 *    delay), its body children are scope-tagged, its child end-events become
 *    scope sinks; repeatType / sim.loop → LoopSpec.
 *  • An Event Subprocess (`subprocess-expanded` + properties.subprocessType ===
 *    "event") inside an EP → an `eventSub` on that parent EP: the internal
 *    start-event gives the trigger (sim.eventTrigger) + interrupting flag
 *    (properties.interruptionType !== "non-interrupting"); its first downstream
 *    node is the handler bodyStart.
 *  • Everything else maps flatly as before.
 *
 * Decision routing comes off the connectors; distinct team ids → resource pools.
 * The portfolio assembler (network.ts, Phase 4) extends this across linked
 * diagrams via walkForwardClosure.
 */

import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { getSimParams, type LoopParams } from "@/app/lib/diagram/simParams";
import type { SimNetwork, SimNode, SimEdge, SimTeam, NodeKind, Assignment, LoopSpec, EventSub } from "./model";
import type { SimDist } from "./types";

const DEFAULT_ARRIVAL: SimDist = { kind: "exponential", mean: 10 };
const DEFAULT_CYCLE: SimDist = { kind: "fixed", value: 1 };
const DEFAULT_TRIGGER: SimDist = { kind: "exponential", mean: 60 };

function baseKind(type: string): NodeKind | null {
  switch (type) {
    case "start-event": return "source";
    case "end-event": return "sink";
    case "task":
    case "subprocess": return "task"; // collapsed subprocess → black-box task (summary)
    case "subprocess-expanded": return "subprocess";
    case "gateway": return "gateway";
    case "intermediate-event": return "delay";
    default: return null;
  }
}

const isEP = (el?: DiagramElement) => !!el && el.type === "subprocess-expanded";
const isEventEP = (el?: DiagramElement) => isEP(el) && el!.properties?.subprocessType === "event";

/** Map a diagram LoopParams (+ repeatType fallback) to the engine LoopSpec. */
function loopOf(el: DiagramElement): LoopSpec | undefined {
  const lp: LoopParams | undefined = getSimParams(el).loop;
  if (lp) {
    return lp.kind === "standard"
      ? { kind: "standard", iterations: lp.iterations, loopBackProb: lp.loopBackProb }
      : { kind: "multi", instances: lp.instances, ordering: lp.ordering };
  }
  switch (el.repeatType) {
    case "loop": return { kind: "standard", iterations: { kind: "fixed", value: 2 } };
    case "mi-sequential": return { kind: "multi", instances: { kind: "fixed", value: 3 }, ordering: "sequential" };
    case "mi-parallel": return { kind: "multi", instances: { kind: "fixed", value: 3 }, ordering: "parallel" };
    default: return undefined;
  }
}

export function assembleFromDiagram(
  data: DiagramData,
  opts?: { teamCapacities?: Record<string, number> },
): SimNetwork {
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const childrenOf = new Map<string, DiagramElement[]>();
  for (const e of data.elements) {
    if (e.parentId) (childrenOf.get(e.parentId) ?? childrenOf.set(e.parentId, []).get(e.parentId)!).push(e);
  }
  const firstOutTarget = (id: string) => data.connectors.find((c) => c.sourceId === id)?.targetId;
  /** Nearest ancestor lane/pool team — a task with no own team inherits it. */
  const laneTeamOf = (el: DiagramElement): string | undefined => {
    let cur = el.parentId ? byId.get(el.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.type === "lane" || cur.type === "pool") {
        const tid = getSimParams(cur).teamId;
        if (tid) return tid;
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };
  /** Nearest ancestor EP — the scope a body node belongs to. */
  const scopeOf = (el: DiagramElement): string | undefined => {
    let cur = el.parentId ? byId.get(el.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (isEP(cur)) return cur.id;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };

  // ── Event subprocesses: build EventSub records, skip their start events ──
  const skip = new Set<string>();          // elements that aren't flow nodes
  const eventSubsByParent = new Map<string, EventSub[]>();
  for (const el of data.elements) {
    if (!isEventEP(el)) continue;
    const parentScope = scopeOf(el);
    const startEv = (childrenOf.get(el.id) ?? []).find((c) => c.type === "start-event");
    skip.add(el.id);
    if (startEv) skip.add(startEv.id);
    if (!parentScope || !startEv) continue; // event sub must live inside an EP
    const bodyStart = firstOutTarget(startEv.id);
    if (!bodyStart) continue;
    const trigger = getSimParams(startEv).eventTrigger ?? getSimParams(el).eventTrigger ?? DEFAULT_TRIGGER;
    const interrupting = startEv.properties?.interruptionType !== "non-interrupting";
    const arr = eventSubsByParent.get(parentScope) ?? eventSubsByParent.set(parentScope, []).get(parentScope)!;
    arr.push({ id: el.id, bodyStart, trigger, interrupting });
  }

  // ── Map elements to engine nodes ──
  const nodes: SimNode[] = [];
  const teamIds = new Set<string>();

  for (const el of data.elements) {
    if (skip.has(el.id)) continue;
    let kind = baseKind(el.type);
    if (!kind) continue;
    if (isEventEP(el)) continue; // handled as an event sub
    const sim = getSimParams(el);
    const scope = scopeOf(el);
    const node: SimNode = { id: el.id, kind, label: el.label, scope };

    if (kind === "source") {
      if (scope !== undefined) { node.kind = "delay"; node.delay = { kind: "fixed", value: 0 }; kind = "delay"; } // EP body entry → pass-through
      else { node.arrival = sim.arrival ?? DEFAULT_ARRIVAL; node.maxArrivals = sim.maxArrivals; }
    } else if (kind === "task") {
      node.cycleTime = sim.cycleTime ?? DEFAULT_CYCLE;
      node.setupTime = sim.setupTime;
      node.waitTime = sim.waitTime;
      const teamId = sim.teamId ?? laneTeamOf(el); // inherit the lane's team if none set
      node.teamId = teamId;
      node.units = sim.resourceUnits ?? 1;
      if (teamId) teamIds.add(teamId);
    } else if (kind === "delay") {
      node.delay = sim.delay ?? { kind: "fixed", value: 0 };
    } else if (kind === "gateway") {
      node.gateway = el.gatewayType === "parallel" ? "parallel" : "decision";
    } else if (kind === "subprocess") {
      const bodyStartEl = (childrenOf.get(el.id) ?? []).find((c) => c.type === "start-event" && !skip.has(c.id));
      node.bodyStart = bodyStartEl?.id;
      node.loop = loopOf(el);
      node.eventSubs = eventSubsByParent.get(el.id);
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

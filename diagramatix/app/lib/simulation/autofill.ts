/**
 * Fill in the simulation attributes a process needs to run, wherever the user
 * hasn't entered them — for quickly testing a partially-complete model.
 *
 * Only MISSING values are filled (existing user data is never overwritten):
 *  • process   — source arrival, task cycle time, delay times
 *  • entities  — a team per swim-lane (capacity defaulted by the assembler),
 *                assigned to tasks that have no team; resource units
 *  • routing   — decision-gateway branch probabilities (even split to 100)
 *                for gateways where no branch has a probability or condition
 *
 * Environment (run horizon / replications / seed) is supplied by the run
 * config at simulation time (defaultReplayConfig), so nothing is stored here.
 */

import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { getSimParams, type ElementSimParams, type SimDist } from "@/app/lib/diagram/simParams";

const DEF_ARRIVAL: SimDist = { kind: "exponential", mean: 10 };
const DEF_CYCLE: SimDist = { kind: "triangular", min: 3, mode: 5, max: 8 };
const DEF_DELAY: SimDist = { kind: "fixed", value: 2 };

const SOURCE = new Set(["start-event"]);
const TASK = new Set(["task", "subprocess", "subprocess-expanded"]);
const DELAY = new Set(["intermediate-event"]);

/** Walk parentId up to the nearest lane/pool and use its label as the team id —
 *  the readable name the user sees on the lane, so the Teams library + the
 *  Simulation Data "team" column read as the lane names, not an internal slug. */
function laneTeamId(el: DiagramElement, byId: Map<string, DiagramElement>): string {
  let cur: DiagramElement | undefined = el;
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    if (parent.type === "lane" || parent.type === "pool") return (parent.label || "").trim() || "team";
    cur = parent;
  }
  return "team";
}

export interface AutofillResult {
  data: DiagramData;
  filled: number; // count of attributes populated
}

export function autofillSimulation(data: DiagramData): AutofillResult {
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  let filled = 0;

  const elements = data.elements.map((el) => {
    let changed = false;
    const sim: ElementSimParams = { ...getSimParams(el) };

    if (SOURCE.has(el.type) && !sim.arrival) { sim.arrival = DEF_ARRIVAL; filled++; changed = true; }
    if (TASK.has(el.type)) {
      if (!sim.cycleTime) { sim.cycleTime = DEF_CYCLE; filled++; changed = true; }
      if (!sim.teamId) { sim.teamId = laneTeamId(el, byId); filled++; changed = true; }
      if (sim.resourceUnits === undefined) { sim.resourceUnits = 1; changed = true; }
    }
    if (DELAY.has(el.type) && !sim.delay) { sim.delay = DEF_DELAY; filled++; changed = true; }

    return changed ? { ...el, properties: { ...el.properties, sim } } : el;
  });

  // Decision-gateway branch probabilities — even split for gateways where no
  // outgoing branch carries a probability or condition yet.
  const probById = new Map<string, number>();
  for (const gw of data.elements) {
    if (gw.type !== "gateway" || gw.gatewayType === "parallel") continue;
    const out = data.connectors.filter((c) => c.sourceId === gw.id);
    if (out.length < 2) continue;
    const anySet = out.some((c) => c.branchProbability !== undefined || c.branchCondition);
    if (anySet) continue;
    const each = Math.floor(100 / out.length);
    out.forEach((c, i) => {
      const p = i === out.length - 1 ? 100 - each * (out.length - 1) : each;
      probById.set(c.id, p);
      filled++;
    });
  }

  const connectors = data.connectors.map((c) =>
    probById.has(c.id) ? { ...c, branchProbability: probById.get(c.id) } : c,
  );

  return { data: { ...data, elements, connectors }, filled };
}

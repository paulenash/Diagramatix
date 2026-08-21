/**
 * Derive the team library a simulation needs from the diagrams themselves.
 *
 * A team is the LOWEST container that actually performs activities: for each
 * task (or subprocess), its nearest enclosing sub-lane / lane, or its pool when
 * there is no lane. Names are deduped across the whole set of diagrams (the
 * entry diagram + every linked child in the process hierarchy), so opening the
 * simulator can seed the team library from the drawn org structure instead of
 * leaving it empty. Pure + data-only, so it's easy to test and cheap to run.
 */

import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { getSimParams } from "@/app/lib/diagram/simParams";

const TASKISH = new Set(["task", "subprocess", "subprocess-expanded"]);
const LANE_LIKE = new Set(["lane", "sublane"]);

/** The team name a task belongs to: the label (or explicit sim.teamId) of its
 *  nearest enclosing lane / sub-lane, else its pool. Undefined when the task is
 *  not inside any pool/lane. */
export function laneTeamName(el: DiagramElement, byId: Map<string, DiagramElement>): string | undefined {
  let cur: DiagramElement | undefined = el.parentId ? byId.get(el.parentId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (LANE_LIKE.has(cur.type) || cur.type === "pool") {
      const name = (getSimParams(cur).teamId ?? cur.label ?? "").trim();
      if (name) return name;
    }
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return undefined;
}

/** Distinct team names across a set of diagrams — the lowest active lane/sublane
 *  (or pool) of every task, deduped by name (case-insensitive dedupe, keeping the
 *  first spelling seen). */
export function harvestLaneTeams(diagrams: DiagramData[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of diagrams) {
    const byId = new Map(d.elements.map((e) => [e.id, e]));
    for (const el of d.elements) {
      if (!TASKISH.has(el.type)) continue;
      if (el.properties?.subprocessType === "event") continue; // event subs aren't real work lanes
      const name = laneTeamName(el, byId);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

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
/**
 * Every team name the diagrams actually refer to — each lane/pool label plus
 * each task's `sim.teamId`. Teams are matched by NAME (there is no id link from
 * a task to a SimulationTeam row), so a lane that is renamed or deleted leaves
 * its old team row in the library with nothing pointing at it. The Teams panel
 * uses this to mark those rows "unused" rather than silently accumulating them.
 */
export function usedTeamNames(diagrams: DiagramData[]): Set<string> {
  const out = new Set<string>();
  for (const d of diagrams) {
    for (const el of d?.elements ?? []) {
      if (el.type === "lane" || el.type === "pool") {
        const n = (el.label || "").trim();
        if (n) out.add(n);
      }
      const team = (getSimParams(el).teamId ?? "").trim();
      if (team) out.add(team);
    }
  }
  return out;
}

/**
 * Every team name the model REFERENCES — lane/sublane names plus any team an
 * activity has been assigned directly — so each one becomes a real, visible,
 * editable row instead of a phantom.
 *
 * A name an activity uses but no lane declares (a typo, or a lane that was since
 * renamed) would otherwise never be created: the assembler then invents a pool
 * for it at capacity 1, so the work is silently done by one invisible person
 * while everything set on the real team applies to none of it. Surfacing both
 * names side by side in the Teams list makes the discrepancy something the user
 * can see and correct, rather than something the run quietly absorbs.
 *
 * Note this harvests only names the model actually uses — it never invents one.
 */
export function harvestReferencedTeams(diagrams: DiagramData[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (name: string | undefined) => {
    const n = (name ?? "").trim();
    if (!n || seen.has(n.toLowerCase())) return;
    seen.add(n.toLowerCase());
    out.push(n);
  };
  for (const name of harvestLaneTeams(diagrams)) add(name);
  for (const d of diagrams) {
    for (const el of d?.elements ?? []) {
      if (!TASKISH.has(el.type)) continue;
      if (el.properties?.subprocessType === "event") continue;
      add(getSimParams(el).teamId);
    }
  }
  return out;
}

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

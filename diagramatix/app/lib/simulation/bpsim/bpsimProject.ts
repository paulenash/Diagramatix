/**
 * Turn a parsed BPSim scenario into the project-level simulation setup that
 * makes an imported .bpmn immediately RUNNABLE: the team + calendar library and
 * the run configuration.
 *
 * applyBpsimToDiagram handles the per-element annotations; this is the other
 * half — the things that live on the PROJECT rather than on the diagram.
 *
 * This derives ONLY what the file states. It deliberately does not autofill the
 * gaps: a file that names no resources yields no teams, and the user fills them
 * in with ⚙ Fill missing simulation data. (scripts/gen-bpmn-examples.ts takes a
 * different route on purpose — it autofills first and forces capacity 1, so the
 * shipped catalog examples show contention out of the box.)
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { ExampleLibrary, ExampleTeam } from "../examplePackage";
import type { ClockUnit, ScenarioRunConfig } from "../types";
import type { BpsimScenario } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Pick the scenario carrying the most element parameters — a BPSim file often
 *  holds several (baseline + variants) and the richest is the best basis for the
 *  imported annotations. Returns null when the file has no usable scenario. */
export function richestScenario(scenarios: BpsimScenario[]): BpsimScenario | null {
  let best: BpsimScenario | null = null;
  for (const s of scenarios) {
    const n = Object.keys(s.elements ?? {}).length;
    if (n === 0) continue;
    if (!best || n > Object.keys(best.elements).length) best = s;
  }
  return best;
}

/**
 * Derive the team + calendar library from a diagram that has already had
 * applyBpsimToDiagram run over it.
 *
 * Team names come from the elements' resolved `teamId` (BPSim
 * ResourceParameters/Selection `getResource('name', units)`). Capacity comes
 * from ResourceParameters/Quantity where the file states it — the staffed size
 * of the pool — taking the largest value seen for a team when tasks disagree,
 * and falling back to 1 so contention is visible rather than silently infinite.
 * Calendars come from the scenario's <Calendar> definitions.
 */
export function bpsimLibraryFrom(data: DiagramData, scenario: BpsimScenario): ExampleLibrary {
  // BPSim keys Quantity by elementRef; map each element back to its team so the
  // stated staffing lands on the right pool.
  const capacityByTeam = new Map<string, number>();
  const teamOfElement = new Map<string, string>();
  for (const el of data.elements) {
    const team = getSimParams(el).teamId;
    if (team) teamOfElement.set(el.id, team);
  }
  const names = new Set<string>(teamOfElement.values());
  for (const [, params] of Object.entries(scenario.elements ?? {})) {
    if (!params.selection) continue;
    const m = params.selection.match(/getResource\(\s*'([^']+)'/);
    if (!m) continue;
    const name = m[1];
    // A resource is a team whether or not the file also states its Quantity —
    // Quantity only refines the pool size (Car Repair, for instance, states
    // quantities but never names a resource, so those are unattributable).
    names.add(name);
    if (params.quantity == null) continue;
    const q = Math.max(1, Math.round(params.quantity));
    capacityByTeam.set(name, Math.max(capacityByTeam.get(name) ?? 0, q));
  }

  const teams: ExampleTeam[] = [...names].sort().map((name) => ({
    name,
    capacity: capacityByTeam.get(name) ?? 1,
  }));

  const calendars = (scenario.calendars ?? [])
    .filter((c) => c.pattern)
    .map((c) => ({ name: c.name?.trim() || c.id, pattern: c.pattern }));

  return { teams, ...(calendars.length ? { calendars } : {}) };
}

/** Run configuration from the scenario's ScenarioParameters, clamped to a sane
 *  band so a file stating a 10-million-minute horizon can't wedge a run. */
export function bpsimRunConfig(scenario: BpsimScenario, clockUnit: ClockUnit = "minute"): ScenarioRunConfig {
  const horizon = clamp(Math.round(scenario.horizon ?? 2000), 800, 100_000);
  const replications = clamp(Math.round(scenario.replication ?? 8), 1, 50);
  const warmUp = scenario.warmUp != null
    ? clamp(Math.round(scenario.warmUp), 0, Math.floor(horizon / 2))
    : Math.round(horizon * 0.1);
  return { clockUnit, horizon, warmUp, replications, seed: 1, collectQueues: true };
}

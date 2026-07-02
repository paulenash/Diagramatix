/**
 * Extract a BpsimScenario FROM a Diagramatix diagram — the inverse of
 * applyBpsimToDiagram. Turns each element's `properties.sim` + each connector's
 * branch fields into the neutral BPSim shape, so the diagram's simulation model
 * can be exported to standard BPSim XML (buildBpsimData) and re-imported.
 *
 * Source operating-hours calendars round-trip (calendarRef + a scenario-level
 * <Calendar> def, pulled from the project calendar library passed in opts). Team
 * *working-hours* calendars live in the project team library, not on diagram
 * elements, so they're outside this per-diagram interchange (team capacity does
 * carry, via the Selection getResource(...) units).
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { WorkCalendar } from "../types";
import type { BpsimScenario, BpsimElementParams, BpsimCalendar } from "./types";

const SOURCE_TYPES = new Set(["start-event", "intermediate-event"]);
const TASK_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);

export interface DiagramBpsimOpts {
  name?: string;
  horizon?: number;
  warmUp?: number;
  replication?: number;
  /** Project calendar library, so a source's calendarId resolves to a <Calendar> def. */
  calendars?: { id: string; name?: string; pattern: WorkCalendar }[];
}

export function diagramToBpsimScenario(data: DiagramData, opts: DiagramBpsimOpts = {}): BpsimScenario {
  const elements: Record<string, BpsimElementParams> = {};
  const usedCalendars = new Set<string>();

  for (const el of data.elements) {
    const sim = getSimParams(el);
    const p: BpsimElementParams = {};
    if (SOURCE_TYPES.has(el.type) && !el.boundaryHostId) {
      if (sim.arrival) p.interArrival = sim.arrival;
      if (sim.calendarId) { p.calendarRef = sim.calendarId; usedCalendars.add(sim.calendarId); }
    } else if (TASK_TYPES.has(el.type)) {
      if (sim.cycleTime) p.processingTime = sim.cycleTime;
      if (sim.waitTime) p.waitTime = sim.waitTime;
      if (sim.setupTime) p.setupTime = sim.setupTime;
      if (sim.teamId) p.selection = `getResource('${sim.teamId}'${sim.resourceUnits && sim.resourceUnits !== 1 ? `, ${sim.resourceUnits}` : ""})`;
      if (sim.assign?.length) {
        p.assignments = sim.assign.map((a) => ({
          property: a.property,
          ...(a.expr ? { expr: a.expr } : {}),
          ...(a.dist ? { init: a.dist } : {}),
        }));
      }
    }
    if (Object.keys(p).length) elements[el.id] = p;
  }

  for (const c of data.connectors) {
    const p: BpsimElementParams = {};
    if (c.branchProbability !== undefined) p.probability = c.branchProbability / 100;
    if (c.branchCondition) p.condition = c.branchCondition;
    if (Object.keys(p).length) elements[c.id] = p;
  }

  const calendars: BpsimCalendar[] = (opts.calendars ?? [])
    .filter((c) => usedCalendars.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, pattern: c.pattern }));

  const scenario: BpsimScenario = { elements };
  if (opts.name) scenario.name = opts.name;
  if (opts.horizon !== undefined) scenario.horizon = opts.horizon;
  if (opts.warmUp !== undefined) scenario.warmUp = opts.warmUp;
  if (opts.replication !== undefined) scenario.replication = opts.replication;
  if (calendars.length) scenario.calendars = calendars;
  return scenario;
}

/** Identity element/connector id map, for applying a scenario that was exported
 *  FROM this same diagram (ids unchanged) via applyBpsimToDiagram. */
export function identityIdMap(data: DiagramData): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of data.elements) map[e.id] = e.id;
  for (const c of data.connectors) map[c.id] = c.id;
  return map;
}

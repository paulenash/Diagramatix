/**
 * Apply a parsed BPSim scenario onto an imported diagram — the model-mapping
 * step that turns BPSim parameters into Diagramatix simulation annotations.
 *
 * `idMap` is importBpmnXml's bpmn-id → minted-id map, so BPSim elementRefs
 * (which use the original BPMN ids) resolve to the diagram's elements/flows:
 *   • element refs  → element.properties.sim (TimeParameters → cycle/wait/setup,
 *     InterTriggerTimer → arrival, ResourceParameters Selection → team + units,
 *     PropertyParameters → token assignments)
 *   • sequence-flow refs → connector branch fields (Probability → 0..100,
 *     Condition → expression)
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { simPatch, type ElementSimParams, type SimAssignment } from "@/app/lib/diagram/simParams";
import type { BpsimScenario } from "./types";

export function applyBpsimToDiagram(
  data: DiagramData,
  idMap: Record<string, string>,
  scenario: BpsimScenario,
): DiagramData {
  const elIds = new Set(data.elements.map((e) => e.id));
  const connIds = new Set(data.connectors.map((c) => c.id));
  const elPatch = new Map<string, Partial<ElementSimParams>>();
  const connPatch = new Map<string, { branchProbability?: number; branchCondition?: string }>();

  for (const [ref, p] of Object.entries(scenario.elements)) {
    const id = idMap[ref];
    if (!id) continue;

    if (elIds.has(id)) {
      const patch: Partial<ElementSimParams> = {};
      if (p.processingTime) patch.cycleTime = p.processingTime;
      if (p.waitTime) patch.waitTime = p.waitTime;
      if (p.setupTime) patch.setupTime = p.setupTime;
      if (p.interArrival) patch.arrival = p.interArrival;
      // ResourceParameters Selection → getResource('team', units)
      if (p.selection) {
        const m = p.selection.match(/getResource\(\s*'([^']+)'\s*(?:,\s*(\d+))?/);
        if (m) { patch.teamId = m[1]; if (m[2]) patch.resourceUnits = parseInt(m[2], 10); }
      }
      // Source operating-hours calendar (references a scenario <Calendar> by id).
      if (p.calendarRef) patch.calendarId = p.calendarRef;
      // PropertyParameters → token assignments (init distribution OR expression)
      if (p.assignments?.length) {
        patch.assign = p.assignments.map<SimAssignment>((a) => ({
          property: a.property,
          ...(a.expr ? { expr: a.expr } : {}),
          ...(a.init ? { dist: a.init } : {}),
        }));
      }
      if (Object.keys(patch).length) elPatch.set(id, patch);
    } else if (connIds.has(id)) {
      const cp: { branchProbability?: number; branchCondition?: string } = {};
      if (p.probability !== undefined) cp.branchProbability = Math.round(p.probability * 100);
      if (p.condition) cp.branchCondition = p.condition;
      if (Object.keys(cp).length) connPatch.set(id, cp);
    }
  }

  const elements = data.elements.map((el) => {
    const patch = elPatch.get(el.id);
    return patch ? { ...el, properties: { ...el.properties, ...simPatch(el, patch) } } : el;
  });
  const connectors = data.connectors.map((c) => {
    const cp = connPatch.get(c.id);
    return cp ? { ...c, ...cp } : c;
  });
  return { ...data, elements, connectors };
}

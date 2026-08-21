/**
 * Export ONE self-contained .bpmn file carrying both the process and its
 * simulation model: standard BPMN 2.0 XML with a `<bpsim:BPSimData>` block in
 * the definitions-level `<extensionElements>`, which is the arrangement the
 * BPSim spec defines.
 *
 * BPMN 2.0 has no native slot for simulation parameters, so without this the
 * sim model is simply absent from a .bpmn export. Element refs are written in
 * `bpmnRefId` form so they resolve against the ids in the same document.
 *
 * Lives in the bpsim folder (not bpmn/) so the dependency runs simulation →
 * diagram, never the reverse.
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { buildBpmnXml, bpmnRefId } from "@/app/lib/diagram/bpmn/exportBpmnXml";
import { buildBpsimData } from "./exportBpsim";
import { diagramToBpsimScenario, type DiagramBpsimOpts } from "./diagramBpsim";
import type { ClockUnit } from "../types";

export interface BpmnWithSimOpts extends Omit<DiagramBpsimOpts, "refId"> {
  /** Clock unit the sim numbers are in — drives ISO-8601 duration emission. */
  clockUnit?: ClockUnit;
}

/**
 * Build BPMN XML for `data`, embedding its simulation model when the diagram
 * carries one. A diagram with no sim parameters produces a plain BPMN file
 * (no empty extension block), so this is safe to use as the only export path.
 */
export function buildBpmnXmlWithSim(data: DiagramData, diagramName: string, opts: BpmnWithSimOpts = {}): string {
  const { clockUnit = "minute", ...scenarioOpts } = opts;
  const scenario = diagramToBpsimScenario(data, {
    name: diagramName,
    ...scenarioOpts,
    refId: bpmnRefId, // refs must match the ids buildBpmnXml emits
  });
  const hasSim = Object.keys(scenario.elements).length > 0;
  return buildBpmnXml(data, diagramName, {
    bpsimXml: hasSim ? buildBpsimData([scenario], clockUnit) : undefined,
  });
}

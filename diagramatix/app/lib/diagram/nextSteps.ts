/**
 * Tier-1 "assist-while-you-draw" next-step suggestions — pure, instant, no LLM.
 *
 * Given the currently-selected element, propose the likely next element(s) +
 * connector, ranked by how commonly they follow. Every candidate is filtered
 * through `canConnect` against a synthetic fresh target, so a suggestion is
 * always legal to place. The AI layer (assist.ts) later NAMES a chosen candidate.
 */
import type { DiagramData, DiagramElement, SymbolType, ConnectorType, EventType, GatewayType } from "./types";
import { canConnect } from "./canConnect";

export interface NextStepCandidate {
  symbolType: SymbolType;
  connectorType: ConnectorType;
  eventType?: EventType;
  gatewayType?: GatewayType;
  /** Short label for the ghost + palette ("Task", "Decision", "End"). */
  label: string;
  /** Why it's suggested (tooltip). */
  reason: string;
}

/** Ordered candidate menu per source type (BPMN), most-likely first. */
function menuFor(sourceType: string): NextStepCandidate[] {
  const task: NextStepCandidate = { symbolType: "task", connectorType: "sequence", label: "Task", reason: "next activity" };
  const decision: NextStepCandidate = { symbolType: "gateway", connectorType: "sequence", gatewayType: "exclusive", label: "Decision", reason: "branch the flow" };
  const end: NextStepCandidate = { symbolType: "end-event", connectorType: "sequence", label: "End", reason: "end the process" };
  switch (sourceType) {
    case "start-event": return [task];
    case "task":
    case "subprocess":
    case "subprocess-expanded": return [task, decision, end];
    case "gateway": return [task];
    case "intermediate-event": return [task];
    default: return [];
  }
}

/** A fresh, top-level-ish target of the candidate type — placed in the source's
 *  own scope so container/scope legality checks match a real placement. */
function synthTarget(c: NextStepCandidate, parentId?: string): DiagramElement {
  return {
    id: "__ghost__",
    type: c.symbolType,
    label: c.label,
    x: 0, y: 0, width: 100, height: 60,
    properties: {},
    ...(c.eventType ? { eventType: c.eventType } : {}),
    ...(c.gatewayType ? { gatewayType: c.gatewayType } : {}),
    ...(parentId ? { parentId } : {}),
  } as DiagramElement;
}

/** Legal, ranked next-step candidates for `source` (Tier-1; BPMN only for now). */
export function suggestNextSteps(
  source: DiagramElement,
  data: DiagramData,
  diagramType: string,
): NextStepCandidate[] {
  if (diagramType !== "bpmn") return [];
  return menuFor(source.type).filter((c) =>
    canConnect(source, synthTarget(c, source.parentId), c.connectorType, data.elements),
  );
}

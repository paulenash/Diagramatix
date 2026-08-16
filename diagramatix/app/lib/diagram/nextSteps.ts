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
import { placeBoundaryEvent } from "./assistPlacement";

/**
 * What accepting a candidate does:
 *  - "element"  → place a new element inline / on a gateway branch + connect.
 *  - "boundary" → mount a trigger-less intermediate event on the source's edge.
 *  - "template" → open the inline-template picker anchored on the source.
 *  - "intent"   → attach the template a keyword catalog maps the source name to.
 */
export type CandidateKind = "element" | "boundary" | "template" | "intent" | "dataobject";

export interface NextStepCandidate {
  kind: CandidateKind;
  symbolType: SymbolType;
  connectorType: ConnectorType;
  eventType?: EventType;
  gatewayType?: GatewayType;
  /** Short label for the ghost + palette ("Task", "Gateway", "End"). */
  label: string;
  /** Why it's suggested (tooltip). */
  reason: string;
  /** intent kind only — the catalog match. */
  intentLabel?: string;
  intentCategory?: string;
  intentTemplateName?: string;
  /** dataobject kind only — "in" (data → element) or "out" (element → data). */
  dataDirection?: "in" | "out";
}

const BOUNDARY_HOST_TYPES = new Set<string>(["task", "subprocess", "subprocess-expanded"]);

/** Ordered candidate menu per source type (BPMN), most-likely first. */
function menuFor(sourceType: string): NextStepCandidate[] {
  const task: NextStepCandidate = { kind: "element", symbolType: "task", connectorType: "sequence", label: "Task", reason: "next activity" };
  const gateway: NextStepCandidate = { kind: "element", symbolType: "gateway", connectorType: "sequence", gatewayType: "exclusive", label: "Gateway", reason: "branch the flow" };
  const end: NextStepCandidate = { kind: "element", symbolType: "end-event", connectorType: "sequence", label: "End", reason: "end the process" };
  switch (sourceType) {
    case "start-event": return [task];
    case "task":
    case "subprocess":
    case "subprocess-expanded": return [task, gateway, end];
    case "gateway": return [task];
    case "intermediate-event": return [task];
    default: return [];
  }
}

/** Boundary-event candidate when the source can host one AND there's room. */
function boundaryCandidateFor(source: DiagramElement, data: DiagramData): NextStepCandidate | null {
  if (!BOUNDARY_HOST_TYPES.has(source.type)) return null;
  const existing = data.elements.filter((e) => e.boundaryHostId === source.id);
  if (placeBoundaryEvent(source, existing) === null) return null; // full → give up
  return { kind: "boundary", symbolType: "intermediate-event", connectorType: "sequence", label: "Boundary", reason: "attach a boundary event" };
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
  const elements = menuFor(source.type).filter((c) =>
    canConnect(source, synthTarget(c, source.parentId), c.connectorType, data.elements),
  );
  const boundary = boundaryCandidateFor(source, data);
  return boundary ? [...elements, boundary] : elements;
}

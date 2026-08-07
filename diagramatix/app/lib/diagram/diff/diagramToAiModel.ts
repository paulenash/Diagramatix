/**
 * DiagramData → AI model ({ elements, connections }) — the inverse of
 * layoutBpmnDiagram's element build. Lets us rebuild a clean, re-laid-out BPMN
 * diagram from an existing one (used by process MERGE: convert both versions to
 * this model, splice, then feed layoutBpmnDiagram again).
 *
 * Membership (pool / lane / subprocess) is read from `parentId` via the shared
 * containment helpers and re-expressed as the AiElement `pool` / `lane` /
 * `parentSubprocess` ids layoutBpmnDiagram expects. Connectors map back to the
 * three AI connection kinds (sequence / message / association-as-plain).
 */
import type { DiagramData, DiagramElement, Connector } from "../types";
import type { AiElement, AiConnection } from "../bpmnLayout";
import { indexById, laneOf, poolOf, type ElementIndex } from "../containment";

export interface AiModel { elements: AiElement[]; connections: AiConnection[] }

const DATA_TYPES = new Set(["data-object", "data-store", "text-annotation"]);

/** The immediate lane/sublane ancestor id (not skipping to the pool), or undefined. */
function immediateLaneId(el: DiagramElement, byId: ElementIndex): string | undefined {
  let cur: DiagramElement | undefined = el;
  let guard = 0;
  while (cur && guard++ < 16) {
    const p: DiagramElement | undefined = cur.parentId ? byId.get(cur.parentId) : undefined;
    if (!p) return undefined;
    if (p.type === "lane" || p.type === "sublane") return p.id;
    if (p.type === "pool") return undefined;
    cur = p;
  }
  return undefined;
}

/** The nearest expanded-subprocess ancestor id, else undefined. */
function subprocessParentId(el: DiagramElement, byId: ElementIndex): string | undefined {
  const p = el.parentId ? byId.get(el.parentId) : undefined;
  return p && p.type === "subprocess-expanded" ? p.id : undefined;
}

export function diagramToAiModel(data: DiagramData): AiModel {
  const elements: DiagramElement[] = data.elements ?? [];
  const connectors: Connector[] = data.connectors ?? [];
  const byId = indexById(elements);

  const aiElements: AiElement[] = [];
  for (const el of elements) {
    const props = (el.properties ?? {}) as Record<string, unknown>;
    if (el.type === "pool") {
      const lanes = elements
        .filter((e) => e.type === "lane" && e.parentId === el.id)
        .map((l) => ({ id: l.id, name: l.label ?? "" }));
      aiElements.push({
        id: el.id, type: "pool", label: el.label ?? "",
        poolType: (props.poolType as string | undefined) ?? "white-box",
        ...(props.isSystem !== undefined ? { isSystem: !!props.isSystem } : {}),
        ...(lanes.length ? { lanes } : {}),
      });
      continue;
    }
    if (el.type === "lane" || el.type === "sublane") {
      const pool = poolOf(el, byId);
      const parentLane = immediateLaneId(el, byId);
      aiElements.push({
        id: el.id, type: "lane", label: el.label ?? "",
        ...(pool ? { parentPool: pool.id } : {}),
        ...(parentLane ? { parentLane } : {}),
      });
      continue;
    }
    // Regular node (task / event / gateway / subprocess / data / annotation / group).
    const pool = poolOf(el, byId);
    const lane = immediateLaneId(el, byId);
    const sub = subprocessParentId(el, byId);
    const ai: AiElement = { id: el.id, type: el.type, label: el.label ?? "" };
    if (el.taskType && el.taskType !== "none") ai.taskType = el.taskType;
    if (el.gatewayType) ai.gatewayType = el.gatewayType;
    if (el.eventType) ai.eventType = el.eventType;
    if (el.repeatType && el.repeatType !== "none") ai.repeatType = el.repeatType;
    if (props.subprocessType) ai.subprocessType = props.subprocessType as string;
    if (pool && !DATA_TYPES.has(el.type)) ai.pool = pool.id;
    if (lane && !DATA_TYPES.has(el.type)) ai.lane = lane;
    if (sub) ai.parentSubprocess = sub;
    if (el.boundaryHostId) {
      ai.boundaryHost = el.boundaryHostId;
      const side = props.boundarySide as string | undefined;
      if (side === "left" || side === "right" || side === "top" || side === "bottom") ai.boundarySide = side;
    }
    // Pass through remaining custom properties (adHoc, linkedDiagramId, etc.),
    // minus the ones already lifted to first-class AiElement fields.
    const { poolType: _p, isSystem: _s, subprocessType: _st, boundarySide: _b, ...rest } = props;
    if (Object.keys(rest).length) ai.properties = rest;
    aiElements.push(ai);
  }

  const aiConnections: AiConnection[] = [];
  for (const c of connectors) {
    const t = c.type;
    // review-comment tethers + non-BPMN links are not part of the process graph.
    if (t === "review-comment-link") continue;
    let type: string | undefined;
    if (t === "message" || t === "messageBPMN") type = "message";
    else if (t === "association" || t === "associationBPMN") type = undefined; // layout re-infers association from data endpoints
    else type = "sequence";
    aiConnections.push({
      sourceId: c.sourceId, targetId: c.targetId,
      ...(c.label ? { label: c.label } : {}),
      ...(type ? { type } : {}),
    });
  }

  return { elements: aiElements, connections: aiConnections };
}

/**
 * Layout engine for AI-generated BPMN diagrams.
 * Takes abstract process elements and produces positioned DiagramData.
 */

import type { DiagramData, DiagramElement, Connector, Point } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";

export interface AiElement {
  id: string;
  type: "start-event" | "end-event" | "task" | "gateway" | "subprocess" | "intermediate-event";
  label: string;
  taskType?: string;
  gatewayType?: string;
  eventType?: string;
}

export interface AiConnection {
  sourceId: string;
  targetId: string;
  label?: string;
}

const H_GAP = 60;   // horizontal gap between elements
const V_GAP = 80;   // vertical gap for parallel branches
const START_X = 100;
const START_Y = 200;

/**
 * Layout AI-generated elements in a left-to-right flow.
 * Handles sequential flow and gateway branches.
 */
export function layoutBpmnDiagram(
  aiElements: AiElement[],
  aiConnections: AiConnection[],
): DiagramData {
  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];

  // Build adjacency from connections
  const outgoing = new Map<string, AiConnection[]>();
  const incoming = new Map<string, AiConnection[]>();
  for (const c of aiConnections) {
    if (!outgoing.has(c.sourceId)) outgoing.set(c.sourceId, []);
    outgoing.get(c.sourceId)!.push(c);
    if (!incoming.has(c.targetId)) incoming.set(c.targetId, []);
    incoming.get(c.targetId)!.push(c);
  }

  // Find start elements (no incoming connections)
  const startIds = aiElements
    .filter(e => !incoming.has(e.id) || incoming.get(e.id)!.length === 0)
    .map(e => e.id);
  if (startIds.length === 0 && aiElements.length > 0) startIds.push(aiElements[0].id);

  // BFS to assign columns (x positions) and handle branching
  const positions = new Map<string, { col: number; row: number }>();
  const visited = new Set<string>();
  const queue: { id: string; col: number; row: number }[] = [];

  for (const sid of startIds) {
    queue.push({ id: sid, col: 0, row: 0 });
  }

  while (queue.length > 0) {
    const { id, col, row } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    // If position already assigned (from another path), keep the later column
    const existing = positions.get(id);
    if (existing && existing.col >= col) continue;
    positions.set(id, { col, row });

    const outs = outgoing.get(id) ?? [];
    if (outs.length === 1) {
      queue.push({ id: outs[0].targetId, col: col + 1, row });
    } else if (outs.length > 1) {
      // Gateway branching: spread targets vertically
      const midRow = row;
      const halfSpread = (outs.length - 1) / 2;
      outs.forEach((c, i) => {
        const branchRow = midRow + (i - halfSpread);
        queue.push({ id: c.targetId, col: col + 1, row: branchRow });
      });
    }
  }

  // Handle any unvisited elements (disconnected)
  for (const e of aiElements) {
    if (!positions.has(e.id)) {
      positions.set(e.id, { col: positions.size, row: 0 });
    }
  }

  // Convert positions to pixel coordinates
  const elMap = new Map(aiElements.map(e => [e.id, e]));

  for (const [id, pos] of positions) {
    const ai = elMap.get(id);
    if (!ai) continue;

    const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
    const w = def.defaultWidth;
    const h = def.defaultHeight;
    const x = START_X + pos.col * (w + H_GAP);
    const y = START_Y + pos.row * (h + V_GAP);

    const el: DiagramElement = {
      id: ai.id,
      type: ai.type as DiagramElement["type"],
      x, y, width: w, height: h,
      label: ai.label,
      properties: {},
      ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
      ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
      ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
    };
    elements.push(el);
  }

  // Create connectors
  for (const c of aiConnections) {
    const src = elements.find(e => e.id === c.sourceId);
    const tgt = elements.find(e => e.id === c.targetId);
    if (!src || !tgt) continue;

    // Determine sides based on relative position
    let srcSide: "top" | "right" | "bottom" | "left" = "right";
    let tgtSide: "top" | "right" | "bottom" | "left" = "left";

    const srcCx = src.x + src.width / 2;
    const srcCy = src.y + src.height / 2;
    const tgtCx = tgt.x + tgt.width / 2;
    const tgtCy = tgt.y + tgt.height / 2;

    if (Math.abs(tgtCy - srcCy) > Math.abs(tgtCx - srcCx)) {
      // Mostly vertical
      if (tgtCy > srcCy) { srcSide = "bottom"; tgtSide = "top"; }
      else { srcSide = "top"; tgtSide = "bottom"; }
    }

    connectors.push({
      id: `conn-${c.sourceId}-${c.targetId}`,
      sourceId: c.sourceId,
      targetId: c.targetId,
      sourceSide: srcSide,
      targetSide: tgtSide,
      type: "sequence",
      directionType: "directed",
      routingType: "rectilinear",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [] as Point[],
      label: c.label ?? "",
      ...(c.label ? {
        labelOffsetX: 0,
        labelOffsetY: -20,
        labelWidth: 80,
      } : {}),
    } as Connector);
  }

  return {
    elements,
    connectors,
    viewport: { x: 0, y: 0, zoom: 0.8 },
    fontSize: 12,
    connectorFontSize: 10,
  };
}

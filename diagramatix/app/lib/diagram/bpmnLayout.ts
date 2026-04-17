/**
 * Layout engine for AI-generated BPMN diagrams.
 * Handles pools, lanes, and element placement within lanes.
 */

import type { DiagramData, DiagramElement, Connector, Point } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";
import { computeWaypoints } from "./routing";

export interface AiElement {
  id: string;
  type: string; // "start-event" | "end-event" | "task" | "gateway" | "subprocess" | "subprocess-expanded" | "intermediate-event" | "pool" | "lane" | "data-object" | "data-store" | "text-annotation" | "group"
  label: string;
  taskType?: string;
  gatewayType?: string;
  eventType?: string;
  pool?: string;              // pool ID this element belongs to
  lane?: string;              // lane ID this element belongs to
  poolType?: string;          // "white-box" | "black-box"
  lanes?: { id: string; name: string }[];  // lanes within a pool
  parentSubprocess?: string;  // subprocess-expanded ID this element belongs to
  boundaryHost?: string;      // host element ID for edge-mounted events
  boundarySide?: "left" | "right" | "top" | "bottom"; // where on the host boundary
  parentPool?: string;        // for lanes — the pool they belong to
}

export interface AiConnection {
  sourceId: string;
  targetId: string;
  label?: string;
  type?: string; // "sequence" | "message"
}

// Layout constants
const POOL_HEADER_W = 36;
const LANE_H = 120;
const LANE_PAD_X = 50; // extra padding to clear lane header text
const BLACK_BOX_H = 50;
const POOL_GAP = 90; // gap between pool boundaries (3x original 30)
const COL_SPACING = 160; // horizontal spacing between columns
const TASK_W = 100; // standard task width for padding
const START_X = 50;
const START_Y = 50;

export function layoutBpmnDiagram(
  aiElements: AiElement[],
  aiConnections: AiConnection[],
): DiagramData {
  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];

  // Separate pools from other elements
  const pools = aiElements.filter(e => e.type === "pool");
  const lanes = aiElements.filter(e => e.type === "lane");
  // Flow elements = top-level BPMN content (exclude subprocess children and boundary events — these are placed separately)
  const flowElements = aiElements.filter(e =>
    e.type !== "pool" && e.type !== "lane" &&
    !e.parentSubprocess && !e.boundaryHost
  );

  // If no pools defined, create a simple left-to-right layout
  if (pools.length === 0) {
    return layoutFlat(flowElements, aiConnections);
  }

  // Identify white-box and black-box pools
  const whiteBoxPools = pools.filter(p => (p.poolType ?? "white-box") === "white-box");
  const blackBoxPools = pools.filter(p => p.poolType === "black-box");

  // Separate black-box pools into external entities (top) and systems (bottom)
  // Heuristic: if name contains common system names → bottom, else → top
  const SYSTEM_KEYWORDS = /salesforce|xero|sap|erp|crm|sharepoint|database|api|system|server|aws|azure|google/i;
  const topBlackBoxes = blackBoxPools.filter(p => !SYSTEM_KEYWORDS.test(p.label));
  const bottomBlackBoxes = blackBoxPools.filter(p => SYSTEM_KEYWORDS.test(p.label));

  // Build lane map: laneId → pool, and element → lane assignment
  const laneToPool = new Map<string, string>();
  const poolLanes = new Map<string, AiElement[]>();

  for (const pool of whiteBoxPools) {
    const poolLaneList: AiElement[] = [];
    // Check if pool has inline lanes definition
    if (pool.lanes && pool.lanes.length > 0) {
      for (const l of pool.lanes) {
        laneToPool.set(l.id, pool.id);
        poolLaneList.push({ id: l.id, type: "lane", label: l.name });
      }
    }
    // Also check standalone lane elements that reference this pool
    for (const l of lanes) {
      if (l.pool === pool.id && !laneToPool.has(l.id)) {
        laneToPool.set(l.id, pool.id);
        poolLaneList.push(l);
      }
    }
    poolLanes.set(pool.id, poolLaneList);
  }

  // Assign elements to lanes/pools
  const laneElements = new Map<string, AiElement[]>(); // laneId → elements
  const unassigned: AiElement[] = [];

  for (const el of flowElements) {
    if (el.lane && laneToPool.has(el.lane)) {
      if (!laneElements.has(el.lane)) laneElements.set(el.lane, []);
      laneElements.get(el.lane)!.push(el);
    } else if (el.pool) {
      // Assigned to pool but no lane — put in first lane of that pool
      const pLanes = poolLanes.get(el.pool);
      if (pLanes && pLanes.length > 0) {
        const firstLane = pLanes[0].id;
        if (!laneElements.has(firstLane)) laneElements.set(firstLane, []);
        laneElements.get(firstLane)!.push(el);
      } else {
        unassigned.push(el);
      }
    } else {
      unassigned.push(el);
    }
  }

  // If there are unassigned elements, put them in the first white-box pool's first lane
  if (unassigned.length > 0 && whiteBoxPools.length > 0) {
    const firstPool = whiteBoxPools[0];
    const pLanes = poolLanes.get(firstPool.id);
    if (pLanes && pLanes.length > 0) {
      const firstLane = pLanes[0].id;
      if (!laneElements.has(firstLane)) laneElements.set(firstLane, []);
      laneElements.get(firstLane)!.push(...unassigned);
    }
  }

  // Compute column positions for elements using BFS
  const outgoing = new Map<string, AiConnection[]>();
  const incoming = new Map<string, AiConnection[]>();
  for (const c of aiConnections) {
    if (c.type === "message") continue; // skip message flows for column layout
    if (!outgoing.has(c.sourceId)) outgoing.set(c.sourceId, []);
    outgoing.get(c.sourceId)!.push(c);
    if (!incoming.has(c.targetId)) incoming.set(c.targetId, []);
    incoming.get(c.targetId)!.push(c);
  }

  // Assign columns using topological sort — ensures merge gateways come after all inputs
  const colMap = new Map<string, number>();
  const startEls = flowElements.filter(e =>
    !incoming.has(e.id) || incoming.get(e.id)!.length === 0
  );
  if (startEls.length === 0 && flowElements.length > 0) startEls.push(flowElements[0]);

  // Multi-pass: keep updating columns until stable (handles merge gateways correctly)
  const queue: { id: string; col: number }[] = startEls.map(e => ({ id: e.id, col: 0 }));
  for (let pass = 0; pass < 20 && queue.length > 0; pass++) {
    const next: typeof queue = [];
    while (queue.length > 0) {
      const { id, col } = queue.shift()!;
      const existing = colMap.get(id) ?? -1;
      if (col <= existing) continue; // already has a later column
      colMap.set(id, col);
      for (const c of (outgoing.get(id) ?? [])) {
        next.push({ id: c.targetId, col: col + 1 });
      }
    }
    queue.push(...next);
  }
  // Unvisited elements
  for (const el of flowElements) {
    if (!colMap.has(el.id)) colMap.set(el.id, colMap.size);
  }

  const maxCol = Math.max(0, ...colMap.values());

  // ── Pool width: content columns + 1 task width padding for user adjustment room ──
  let curY = START_Y;
  // R21: content width + 1 task width padding
  const contentWidth = (maxCol + 1) * COL_SPACING;
  const poolWidth = POOL_HEADER_W + contentWidth + LANE_PAD_X + TASK_W;

  for (const bbp of topBlackBoxes) {
    // R20: black-box pool height = horizontal text width (rotated vertical) + buffer
    const textW = bbp.label.length * 7 + 20; // ~7px per char at 12px font + 20px buffer each side
    const bbH = Math.max(BLACK_BOX_H, textW);
    elements.push({
      id: bbp.id, type: "pool" as DiagramElement["type"],
      x: START_X, y: curY, width: poolWidth, height: bbH,
      label: bbp.label,
      properties: { poolType: "black-box", isSystem: false },
    });
    curY += bbH + POOL_GAP;
  }

  // ── Layout white-box pools with lanes ──
  for (const pool of whiteBoxPools) {
    const pLanes = poolLanes.get(pool.id) ?? [];
    const poolStartY = curY;

    // R21: Compute lane heights — each lane needs room for its elements + vertical padding
    const taskDef = getSymbolDefinition("task");
    const laneHeights: number[] = [];
    for (const lane of pLanes) {
      const els = laneElements.get(lane.id) ?? [];
      // Find max stacked elements per column
      const colCounts = new Map<number, number>();
      for (const e of els) {
        const c = colMap.get(e.id) ?? 0;
        colCounts.set(c, (colCounts.get(c) ?? 0) + 1);
      }
      const maxStack = Math.max(1, ...colCounts.values());
      // Each lane needs at least room for 1 task height + generous vertical buffer
      const vertBuffer = 40; // buffer above and below content
      const minLaneH = taskDef.defaultHeight + vertBuffer * 2;
      laneHeights.push(Math.max(minLaneH, maxStack * (taskDef.defaultHeight + 30) + vertBuffer * 2));
    }
    if (pLanes.length === 0) laneHeights.push(taskDef.defaultHeight + 80);

    let totalLaneH = laneHeights.reduce((s, h) => s + h, 0);

    // R20: Ensure pool is tall enough to display the vertical pool name
    // Same formula as black-box: horizontal text width + buffer, used as height
    const nameH = pool.label.length * 7 + 40;
    // Always apply: expand lanes if pool name needs more room
    if (totalLaneH < nameH) {
      const extra = nameH - totalLaneH;
      const perLane = Math.ceil(extra / laneHeights.length);
      for (let li = 0; li < laneHeights.length; li++) laneHeights[li] += perLane;
      totalLaneH = laneHeights.reduce((s, h) => s + h, 0);
    }
    // Minimum total pool height — at least 2x the default pool height
    const minPoolH = 200;
    if (totalLaneH < minPoolH) {
      const extra = minPoolH - totalLaneH;
      const perLane = Math.ceil(extra / laneHeights.length);
      for (let li = 0; li < laneHeights.length; li++) laneHeights[li] += perLane;
      totalLaneH = laneHeights.reduce((s, h) => s + h, 0);
    }

    // Create pool element
    elements.push({
      id: pool.id, type: "pool" as DiagramElement["type"],
      x: START_X, y: poolStartY, width: poolWidth, height: totalLaneH,
      label: pool.label,
      properties: { poolType: "white-box" },
    });

    // Create lanes
    let laneY = poolStartY;
    for (let i = 0; i < pLanes.length; i++) {
      const lane = pLanes[i];
      const laneH = laneHeights[i];

      elements.push({
        id: lane.id, type: "lane" as DiagramElement["type"],
        x: START_X + POOL_HEADER_W, y: laneY, width: poolWidth - POOL_HEADER_W, height: laneH,
        label: lane.label,
        properties: {},
        parentId: pool.id,
      });

      // Place elements within this lane
      const laneEls = laneElements.get(lane.id) ?? [];
      for (const el of laneEls) {
        const col = colMap.get(el.id) ?? 0;
        const def = getSymbolDefinition(el.type as DiagramElement["type"]);
        const elX = START_X + POOL_HEADER_W + LANE_PAD_X + col * COL_SPACING;
        const elY = laneY + laneH / 2 - def.defaultHeight / 2;

        elements.push({
          id: el.id, type: el.type as DiagramElement["type"],
          x: elX, y: elY, width: def.defaultWidth, height: def.defaultHeight,
          label: el.label,
          properties: {},
          parentId: lane.id,
          ...(el.taskType ? { taskType: el.taskType as DiagramElement["taskType"] } : {}),
          ...(el.gatewayType ? { gatewayType: el.gatewayType as DiagramElement["gatewayType"] } : {}),
          ...(el.eventType ? { eventType: el.eventType as DiagramElement["eventType"] } : {}),
        });
      }

      laneY += laneH;
    }

    curY = poolStartY + totalLaneH + POOL_GAP;
  }

  // ── Layout bottom black-box pools (systems) ──
  for (const bbp of bottomBlackBoxes) {
    const textW = bbp.label.length * 7 + 20;
    const bbH = Math.max(BLACK_BOX_H, textW);
    elements.push({
      id: bbp.id, type: "pool" as DiagramElement["type"],
      x: START_X, y: curY, width: poolWidth, height: bbH,
      label: bbp.label,
      properties: { poolType: "black-box", isSystem: true },
    });
    curY += bbH + POOL_GAP;
  }

  // ── Handle children of expanded subprocesses and edge-mounted boundary events ──
  // Find all expanded subprocesses that have declared children
  const subprocessChildren = new Map<string, AiElement[]>();
  const boundaryEvents = new Map<string, AiElement[]>(); // hostId → events
  for (const ai of aiElements) {
    if (ai.parentSubprocess) {
      if (!subprocessChildren.has(ai.parentSubprocess)) subprocessChildren.set(ai.parentSubprocess, []);
      subprocessChildren.get(ai.parentSubprocess)!.push(ai);
    }
    if (ai.boundaryHost) {
      if (!boundaryEvents.has(ai.boundaryHost)) boundaryEvents.set(ai.boundaryHost, []);
      boundaryEvents.get(ai.boundaryHost)!.push(ai);
    }
  }

  // For each expanded subprocess with children, enlarge it and place children inside
  const EXPANDED_PAD_X = 40, EXPANDED_PAD_Y = 50;
  const CHILD_COL_SPACING = 140, CHILD_ROW_SPACING = 90;
  const CHILD_COLS = 5; // up to 5 tasks wide
  for (const [spId, children] of subprocessChildren) {
    const spEl = elements.find(e => e.id === spId);
    if (!spEl) continue;
    const rows = Math.max(1, Math.ceil(children.length / CHILD_COLS));
    const cols = Math.min(CHILD_COLS, children.length);
    // Size: always at least 5 tasks wide × 4 tasks tall for "large" expanded subprocess
    const minCols = Math.max(5, cols);
    const minRows = Math.max(4, rows);
    const neededW = minCols * CHILD_COL_SPACING + EXPANDED_PAD_X * 2;
    const neededH = minRows * CHILD_ROW_SPACING + EXPANDED_PAD_Y * 2;
    const oldRight = spEl.x + spEl.width;
    const oldBottom = spEl.y + spEl.height;
    // Enlarge the subprocess
    spEl.width = Math.max(spEl.width, neededW);
    spEl.height = Math.max(spEl.height, neededH);
    const newRight = spEl.x + spEl.width;
    const newBottom = spEl.y + spEl.height;
    // Shift sibling elements to the right of this subprocess so they don't overlap
    const shiftX = newRight - oldRight;
    const shiftY = newBottom - oldBottom;
    if (shiftX > 0 || shiftY > 0) {
      for (const other of elements) {
        if (other.id === spEl.id) continue;
        if (other.parentId === spEl.id) continue; // its children
        if (other.boundaryHostId === spEl.id) continue; // its boundary events
        // Only shift siblings in the same parent (lane/pool)
        if (other.parentId !== spEl.parentId) continue;
        // Horizontal: only elements to the right of the old EP right edge
        if (shiftX > 0 && other.x >= oldRight - 1) {
          other.x += shiftX;
        }
        // Vertical: only elements below the old EP bottom (rare case)
        if (shiftY > 0 && other.y >= oldBottom - 1) {
          other.y += shiftY;
        }
      }
    }
    // Place children in a grid
    for (let i = 0; i < children.length; i++) {
      const ai = children[i];
      const col = i % CHILD_COLS;
      const row = Math.floor(i / CHILD_COLS);
      const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
      const cx = EXPANDED_PAD_X + col * CHILD_COL_SPACING + CHILD_COL_SPACING / 2;
      const cy = EXPANDED_PAD_Y + row * CHILD_ROW_SPACING + CHILD_ROW_SPACING / 2;
      elements.push({
        id: ai.id, type: ai.type as DiagramElement["type"],
        x: spEl.x + cx - def.defaultWidth / 2,
        y: spEl.y + cy - def.defaultHeight / 2,
        width: def.defaultWidth, height: def.defaultHeight,
        label: ai.label, properties: {}, parentId: spEl.id,
        ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
        ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
        ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
      });
    }
  }

  // Place boundary-mounted events on host edges
  for (const [hostId, events] of boundaryEvents) {
    const host = elements.find(e => e.id === hostId);
    if (!host) continue;
    // Group by side
    const bySide: Record<string, AiElement[]> = { left: [], right: [], top: [], bottom: [] };
    for (const ev of events) {
      // Determine default side from event type
      let side = ev.boundarySide;
      if (!side) {
        if (ev.type === "start-event") side = "left";
        else if (ev.type === "end-event") side = "right";
        else side = "top"; // intermediate events default to top
      }
      bySide[side].push(ev);
    }
    for (const [side, evs] of Object.entries(bySide)) {
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i];
        const def = getSymbolDefinition(ev.type as DiagramElement["type"]);
        const W = def.defaultWidth, H = def.defaultHeight;
        let ex = 0, ey = 0;
        if (side === "left") {
          ex = host.x - W / 2;
          ey = host.y + host.height / 2 - H / 2 + (i - (evs.length - 1) / 2) * (H + 10);
        } else if (side === "right") {
          ex = host.x + host.width - W / 2;
          ey = host.y + host.height / 2 - H / 2 + (i - (evs.length - 1) / 2) * (H + 10);
        } else if (side === "top") {
          // Near right corner for intermediate events (timers/interrupts)
          ex = host.x + host.width - W - 30 - i * (W + 10);
          ey = host.y - H / 2;
        } else { // bottom
          ex = host.x + host.width - W - 30 - i * (W + 10);
          ey = host.y + host.height - H / 2;
        }
        elements.push({
          id: ev.id, type: ev.type as DiagramElement["type"],
          x: ex, y: ey, width: W, height: H,
          label: ev.label, properties: {}, boundaryHostId: host.id,
          ...(ev.taskType ? { taskType: ev.taskType as DiagramElement["taskType"] } : {}),
          ...(ev.eventType ? { eventType: ev.eventType as DiagramElement["eventType"] } : {}),
        });
      }
    }
  }

  // Place any unconnected / unassigned elements that were still skipped
  // (elements with no pool/lane/parentSubprocess/boundaryHost that we haven't placed yet)
  const placedIds = new Set(elements.map(e => e.id));
  const unplacedEls = aiElements.filter(ai =>
    ai.type !== "pool" && ai.type !== "lane" && !placedIds.has(ai.id)
  );
  if (unplacedEls.length > 0) {
    let floatY = 100;
    const floatX = 50;
    for (const ai of unplacedEls) {
      const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
      elements.push({
        id: ai.id, type: ai.type as DiagramElement["type"],
        x: floatX, y: floatY, width: def.defaultWidth, height: def.defaultHeight,
        label: ai.label, properties: {},
        ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
        ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
        ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
      });
      floatY += def.defaultHeight + 20;
    }
  }

  // ── R24: Grow pools and lanes to contain all their elements ──
  // After all placement (including enlarged expanded subprocesses and boundary events),
  // expand pools and lanes so every process element fits fully inside.
  function expandContainerToFitChildren(containerId: string, containerType: "pool" | "lane") {
    const container = elements.find(e => e.id === containerId);
    if (!container) return;
    // Collect direct and transitive children
    const childIds = new Set<string>();
    function collect(parentId: string) {
      for (const e of elements) {
        if (e.parentId === parentId && !childIds.has(e.id)) {
          childIds.add(e.id);
          collect(e.id);
        }
        // Also include boundary events mounted on any descendant
        if (e.boundaryHostId && childIds.has(e.boundaryHostId) && !childIds.has(e.id)) {
          childIds.add(e.id);
        }
      }
    }
    collect(containerId);
    if (childIds.size === 0) return;

    // Compute child bounds (including boundary events which stick outside their host)
    let maxRight = container.x;
    let maxBottom = container.y;
    for (const id of childIds) {
      const child = elements.find(e => e.id === id);
      if (!child) continue;
      maxRight = Math.max(maxRight, child.x + child.width);
      maxBottom = Math.max(maxBottom, child.y + child.height);
    }
    const PAD = 30;
    const neededW = maxRight - container.x + PAD;
    const neededH = maxBottom - container.y + PAD;
    if (neededW > container.width) container.width = neededW;
    if (neededH > container.height) {
      if (containerType === "pool") {
        // Distribute extra height across direct lane children proportionally
        const directLanes = elements.filter(e => e.type === "lane" && e.parentId === container.id).sort((a, b) => a.y - b.y);
        if (directLanes.length > 0) {
          const extra = neededH - container.height;
          const totalCurrentH = directLanes.reduce((s, l) => s + l.height, 0);
          let offsetY = 0;
          for (const lane of directLanes) {
            const share = Math.ceil(extra * (lane.height / totalCurrentH));
            lane.y += offsetY;
            lane.height += share;
            offsetY += share;
          }
          container.height = container.height + extra;
        } else {
          container.height = neededH;
        }
      } else {
        container.height = neededH;
      }
    }
  }

  // Grow lanes to fit their children first
  for (const el of elements) {
    if (el.type === "lane") expandContainerToFitChildren(el.id, "lane");
  }
  // Then grow pools to fit their lanes (and any direct children)
  for (const el of elements) {
    if (el.type === "pool") expandContainerToFitChildren(el.id, "pool");
  }
  // Match lane widths to their parent pool's new width
  for (const pool of elements.filter(e => e.type === "pool")) {
    const poolLanes = elements.filter(e => e.type === "lane" && e.parentId === pool.id);
    for (const lane of poolLanes) {
      lane.width = pool.width - POOL_HEADER_W;
    }
  }

  // ── Create connectors ──
  const elMap = new Map(elements.map(e => [e.id, e]));

  // Helper: check if element is a gateway
  const isGateway = (el: DiagramElement) => el.type === "gateway";
  // Helper: check if gateway is a merge (has 2+ incoming sequence connectors)
  const incomingCount = new Map<string, number>();
  for (const c of aiConnections) {
    if (c.type !== "message") {
      incomingCount.set(c.targetId, (incomingCount.get(c.targetId) ?? 0) + 1);
    }
  }
  const isMergeGateway = (el: DiagramElement) =>
    isGateway(el) && (incomingCount.get(el.id) ?? 0) >= 2;
  const isDecisionGateway = (el: DiagramElement) =>
    isGateway(el) && !isMergeGateway(el);

  for (const c of aiConnections) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;

    const isMessage = c.type === "message" ||
      src.type === "pool" || tgt.type === "pool";

    let connType: string;
    let srcSide: string, tgtSide: string;
    let srcOffsetAlong: number | undefined;

    if (isMessage) {
      connType = "messageBPMN";
      // Message flow — always vertical
      const srcCy = src.y + src.height / 2;
      const tgtCy = tgt.y + tgt.height / 2;
      srcSide = srcCy < tgtCy ? "bottom" : "top";
      tgtSide = srcCy < tgtCy ? "top" : "bottom";
      // Compute offsetAlong so pool attachment points align vertically with the non-pool element
      if (src.type === "pool" && tgt.type !== "pool") {
        const taskCx = tgt.x + tgt.width / 2;
        srcOffsetAlong = Math.max(0.02, Math.min(0.98, (taskCx - src.x) / src.width));
      } else if (src.type !== "pool" && tgt.type !== "pool") {
        // Both are non-pool elements — use 0.5 (centre) for both
        srcOffsetAlong = 0.5;
      }
    } else {
      connType = "sequence";
      const srcCx = src.x + src.width / 2;
      const tgtCx = tgt.x + tgt.width / 2;
      const srcCy = src.y + src.height / 2;
      const tgtCy = tgt.y + tgt.height / 2;

      // Fix 2: Decision gateway outgoing — use top/bottom for branching
      if (isDecisionGateway(src)) {
        if (tgtCy < srcCy) {
          // Target is above → exit from top
          srcSide = "top"; tgtSide = "left";
        } else if (tgtCy > srcCy) {
          // Target is below → exit from bottom
          srcSide = "bottom"; tgtSide = "left";
        } else {
          // Same row → right to left
          srcSide = "right"; tgtSide = "left";
        }
      }
      // Fix 3: Merge gateway incoming — enter from top/bottom
      else if (isMergeGateway(tgt)) {
        if (srcCy < tgtCy) {
          srcSide = "right"; tgtSide = "top";
        } else if (srcCy > tgtCy) {
          srcSide = "right"; tgtSide = "bottom";
        } else {
          srcSide = "right"; tgtSide = "left";
        }
      }
      // Default: left-to-right or vertical
      else if (Math.abs(tgtCy - srcCy) > Math.abs(tgtCx - srcCx) * 1.5) {
        srcSide = tgtCy > srcCy ? "bottom" : "top";
        tgtSide = tgtCy > srcCy ? "top" : "bottom";
      } else {
        srcSide = "right";
        tgtSide = "left";
      }
    }

    // Compute target offset for message connectors
    let tgtOffsetAlong: number | undefined;
    if (isMessage) {
      if (tgt.type === "pool" && src.type !== "pool") {
        const taskCx = src.x + src.width / 2;
        tgtOffsetAlong = Math.max(0.02, Math.min(0.98, (taskCx - tgt.x) / tgt.width));
      } else if (tgt.type !== "pool") {
        tgtOffsetAlong = 0.5; // centre of target element
      }
    }

    // Fix 4: Gateway label positioning
    let labelOffsetX: number | undefined;
    let labelOffsetY: number | undefined;
    let labelWidth: number | undefined;
    if (c.label) {
      if (isDecisionGateway(src)) {
        // Decision gateway condition labels on outgoing flows
        labelOffsetX = 5;
        labelOffsetY = -20;
        labelWidth = 60;
      } else {
        labelOffsetX = 0;
        labelOffsetY = -20;
        labelWidth = 80;
      }
    }

    connectors.push({
      id: `conn-${c.sourceId}-${c.targetId}`,
      sourceId: c.sourceId,
      targetId: c.targetId,
      sourceSide: srcSide as Connector["sourceSide"],
      targetSide: tgtSide as Connector["targetSide"],
      type: connType as Connector["type"],
      directionType: "directed",
      routingType: "rectilinear",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [] as Point[],
      label: c.label ?? "",
      ...(srcOffsetAlong !== undefined ? { sourceOffsetAlong: srcOffsetAlong } : {}),
      ...(tgtOffsetAlong !== undefined ? { targetOffsetAlong: tgtOffsetAlong } : {}),
      ...(labelOffsetX !== undefined ? { labelOffsetX, labelOffsetY, labelWidth } : {}),
    } as Connector);
  }

  // Compute waypoints for all connectors
  const computedConnectors = connectors.map(conn => {
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    try {
      const srcOffset = conn.sourceOffsetAlong ?? 0.5;
      const tgtOffset = conn.targetOffsetAlong ?? 0.5;

      // Message connectors: compute vertical waypoints manually so they display correctly
      if (conn.type === "messageBPMN") {
        const srcSide = conn.sourceSide;
        const tgtSide = conn.targetSide;
        // Compute attachment points using offset along the side
        const srcX = src.x + srcOffset * src.width;
        const srcY = srcSide === "bottom" ? src.y + src.height : src.y;
        const tgtX = tgt.x + tgtOffset * tgt.width;
        const tgtY = tgtSide === "top" ? tgt.y : tgt.y + tgt.height;
        // Use the non-pool element's X for vertical alignment
        const alignX = src.type === "pool" ? tgtX : tgt.type === "pool" ? srcX : (srcX + tgtX) / 2;
        return {
          ...conn,
          waypoints: [
            { x: alignX, y: srcY },
            { x: alignX, y: tgtY },
          ],
          sourceOffsetAlong: (alignX - src.x) / src.width,
          targetOffsetAlong: (alignX - tgt.x) / tgt.width,
          sourceInvisibleLeader: false,
          targetInvisibleLeader: false,
        };
      }

      const result = computeWaypoints(src, tgt, elements,
        conn.sourceSide, conn.targetSide, conn.routingType, srcOffset, tgtOffset);
      return { ...conn, waypoints: result.waypoints,
        sourceInvisibleLeader: result.sourceInvisibleLeader,
        targetInvisibleLeader: result.targetInvisibleLeader };
    } catch { return conn; }
  });

  return {
    elements,
    connectors: computedConnectors,
    viewport: { x: 0, y: 0, zoom: 0.6 },
    fontSize: 12,
    connectorFontSize: 10,
  };
}

/** Flat layout for diagrams without pools */
function layoutFlat(
  aiElements: AiElement[],
  aiConnections: AiConnection[],
): DiagramData {
  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];

  const outgoing = new Map<string, AiConnection[]>();
  const incoming = new Map<string, AiConnection[]>();
  for (const c of aiConnections) {
    if (!outgoing.has(c.sourceId)) outgoing.set(c.sourceId, []);
    outgoing.get(c.sourceId)!.push(c);
    if (!incoming.has(c.targetId)) incoming.set(c.targetId, []);
    incoming.get(c.targetId)!.push(c);
  }

  const colMap = new Map<string, { col: number; row: number }>();
  const visited = new Set<string>();
  const starts = aiElements.filter(e => !incoming.has(e.id) || incoming.get(e.id)!.length === 0);
  if (starts.length === 0 && aiElements.length > 0) starts.push(aiElements[0]);

  const queue: { id: string; col: number; row: number }[] = starts.map(e => ({ id: e.id, col: 0, row: 0 }));
  while (queue.length > 0) {
    const { id, col, row } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    colMap.set(id, { col, row });
    const outs = outgoing.get(id) ?? [];
    if (outs.length === 1) {
      queue.push({ id: outs[0].targetId, col: col + 1, row });
    } else {
      const half = (outs.length - 1) / 2;
      outs.forEach((c, i) => queue.push({ id: c.targetId, col: col + 1, row: row + (i - half) }));
    }
  }
  for (const e of aiElements) {
    if (!colMap.has(e.id)) colMap.set(e.id, { col: colMap.size, row: 0 });
  }

  for (const [id, pos] of colMap) {
    const ai = aiElements.find(e => e.id === id);
    if (!ai) continue;
    const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
    elements.push({
      id, type: ai.type as DiagramElement["type"],
      x: 100 + pos.col * (def.defaultWidth + 60),
      y: 200 + pos.row * (def.defaultHeight + 80),
      width: def.defaultWidth, height: def.defaultHeight,
      label: ai.label, properties: {},
      ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
      ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
      ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
    });
  }

  const elMap = new Map(elements.map(e => [e.id, e]));
  for (const c of aiConnections) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;
    connectors.push({
      id: `conn-${c.sourceId}-${c.targetId}`,
      sourceId: c.sourceId, targetId: c.targetId,
      sourceSide: "right", targetSide: "left",
      type: "sequence", directionType: "directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false,
      waypoints: [] as Point[],
      label: c.label ?? "",
    } as Connector);
  }

  // Compute waypoints
  const computed = connectors.map(conn => {
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    try {
      const r = computeWaypoints(src, tgt, elements, conn.sourceSide, conn.targetSide, conn.routingType, 0.5, 0.5);
      return { ...conn, waypoints: r.waypoints, sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
    } catch { return conn; }
  });

  return {
    elements, connectors: computed,
    viewport: { x: 0, y: 0, zoom: 0.8 },
    fontSize: 12, connectorFontSize: 10,
  };
}

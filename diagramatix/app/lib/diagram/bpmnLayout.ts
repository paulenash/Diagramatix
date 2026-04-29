/**
 * Layout engine for AI-generated BPMN diagrams.
 * Handles pools, lanes, and element placement within lanes.
 */

import type { DiagramData, DiagramElement, Connector, Point } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";
import { computeWaypoints } from "./routing";

// Phase-trace writer: stderr only — no file I/O to avoid Windows file-lock
// contention when many phase() calls fire from a single request.
function layoutTrace(line: string) {
  const stamped = `${new Date().toISOString()} ${line}\n`;
  try { process.stderr.write(stamped); } catch { /* ignore */ }
}

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
  isSystem?: boolean;         // only meaningful for black-box pools: true = IT system (below main), false = external entity (above main)
  lanes?: { id: string; name: string }[];  // lanes within a pool
  parentSubprocess?: string;  // subprocess-expanded ID this element belongs to
  boundaryHost?: string;      // host element ID for edge-mounted events
  boundarySide?: "left" | "right" | "top" | "bottom"; // where on the host boundary
  parentPool?: string;        // for lanes — the pool they belong to
  subprocessType?: string;    // "normal" | "event" | "transaction" | "call"
  properties?: Record<string, unknown>; // additional properties pass-through
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
const LANE_PAD_X = 54; // 1.5 × start-event width (36) — gap between pool/lane header right edge and the first start event
const BLACK_BOX_H = 50;
const POOL_GAP = 90; // gap between pool boundaries (3x original 30)
const COL_SPACING = 160; // horizontal spacing between columns
const TASK_W = 100; // standard task width for padding
const START_X = 50;
const START_Y = 50;

// Build properties object for a DiagramElement from an AiElement.
// Merges ai.properties pass-through with specific fields like subprocessType.
function buildProps(ai: AiElement): Record<string, unknown> {
  const props: Record<string, unknown> = { ...(ai.properties ?? {}) };
  if (ai.subprocessType) props.subprocessType = ai.subprocessType;
  return props;
}

export function layoutBpmnDiagram(
  aiElements: AiElement[],
  aiConnections: AiConnection[],
  opts?: { promptLabel?: string },
): DiagramData {
  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];

  // Phase timing — always writes to stderr and apply-layout.log so we can
  // see where a layout hangs regardless of Next.js stdout buffering.
  const _t0 = Date.now();
  const phase = (name: string) => {
    layoutTrace(`[layoutBpmnDiagram] ${name} @ ${Date.now() - _t0}ms`);
  };
  phase("start");

  // ── R26/R29/R30: Event Subprocess handling ──
  // - Auto-detect event subprocesses
  // - Ensure they are wrapped in a Normal Expanded Subprocess
  // - Auto-inject a non-interrupting internal start event and internal end event if missing
  const injected: AiElement[] = [];
  for (const ai of aiElements) {
    if (ai.type !== "subprocess-expanded") continue;
    const labelLower = (ai.label || "").toLowerCase();
    // Fallback detection: treat as event sub if any direct child is a
    // non-interrupting start event. AI sometimes forgets to set
    // subprocessType="event" even when it emits the characteristic
    // non-interrupting internal start event (which is only valid inside
    // an event sub). Catching this avoids missed R48 connector-stripping.
    const hasNonInterruptingStart = aiElements.some(child =>
      child.parentSubprocess === ai.id &&
      child.type === "start-event" &&
      !child.boundaryHost &&
      ((child.properties as Record<string, unknown> | undefined)?.interruptionType === "non-interrupting" ||
       (child.properties as Record<string, unknown> | undefined)?.interrupting === false));
    const isEventSub = ai.subprocessType === "event" ||
      (ai.properties?.subprocessType === "event") ||
      labelLower.includes("event subprocess") ||
      labelLower.includes("event expanded") ||
      hasNonInterruptingStart;
    if (!isEventSub) continue;
    // Ensure subprocessType is set
    if (!ai.subprocessType) ai.subprocessType = "event";

    // R29: Ensure the event subprocess is inside a Normal Expanded Subprocess
    // If parentSubprocess is not set, or it's set to a pool/lane context, wrap it
    const parentSub = ai.parentSubprocess
      ? aiElements.find(e => e.id === ai.parentSubprocess)
      : undefined;
    const parentIsNormalSub = parentSub?.type === "subprocess-expanded" &&
      (parentSub.subprocessType ?? "normal") !== "event";
    if (!parentIsNormalSub) {
      // Create a wrapping Normal Expanded Subprocess
      const wrapperId = `_wrapper_${ai.id}`;
      injected.push({
        id: wrapperId,
        type: "subprocess-expanded",
        label: "Main Process",
        subprocessType: "normal",
        pool: ai.pool,
        lane: ai.lane,
      });
      ai.parentSubprocess = wrapperId;
      ai.pool = undefined;
      ai.lane = undefined;
    }

    // R30: Ensure internal non-interrupting start event exists
    const hasInternalStart = aiElements.some(e =>
      e.parentSubprocess === ai.id && e.type === "start-event" && !e.boundaryHost
    );
    if (!hasInternalStart) {
      injected.push({
        id: `_ev_start_${ai.id}`,
        type: "start-event",
        label: "",
        parentSubprocess: ai.id,
        eventType: "none",
        properties: { interruptionType: "non-interrupting" },
      });
    }
    // R30: Ensure internal end event exists
    const hasInternalEnd = aiElements.some(e =>
      e.parentSubprocess === ai.id && e.type === "end-event" && !e.boundaryHost
    );
    if (!hasInternalEnd) {
      injected.push({
        id: `_ev_end_${ai.id}`,
        type: "end-event",
        label: "",
        parentSubprocess: ai.id,
        eventType: "none",
      });
    }
  }
  aiElements = [...aiElements, ...injected];

  phase("event-sub-injection done");

  // Separate pools from other elements
  const pools = aiElements.filter(e => e.type === "pool");
  const lanes = aiElements.filter(e => e.type === "lane");
  // Flow elements = top-level BPMN content (exclude subprocess children and boundary events — these are placed separately)
  const flowElements = aiElements.filter(e =>
    e.type !== "pool" && e.type !== "lane" &&
    !e.parentSubprocess && !e.boundaryHost
  );

  // If no pools defined, inject a default Pool so all subprocess/boundary handling still runs.
  // Attach every flow element (that isn't a subprocess child or boundary event) to this pool.
  if (pools.length === 0) {
    const defaultPoolId = "_default_pool";
    const defaultPool: AiElement = {
      id: defaultPoolId, type: "pool", label: "Process", poolType: "white-box",
    };
    aiElements = [defaultPool, ...aiElements];
    for (const el of aiElements) {
      if (el === defaultPool) continue;
      if (el.type === "pool" || el.type === "lane") continue;
      // Only top-level elements get a pool assignment
      if (el.parentSubprocess || el.boundaryHost) continue;
      if (!el.pool) el.pool = defaultPoolId;
    }
    pools.push(defaultPool);
  }

  // R32: Every process must have a process-level Start Event and End Event in each white-box pool.
  // Check each white-box pool; if missing, inject them at top level.
  const processLevelInjections: AiElement[] = [];
  for (const pool of pools.filter(p => (p.poolType ?? "white-box") === "white-box")) {
    const poolTopLevelEls = aiElements.filter(e =>
      e.pool === pool.id && !e.parentSubprocess && !e.boundaryHost
    );
    const hasStart = poolTopLevelEls.some(e => e.type === "start-event");
    const hasEnd = poolTopLevelEls.some(e => e.type === "end-event");
    if (!hasStart) {
      processLevelInjections.push({
        id: `_proc_start_${pool.id}`,
        type: "start-event",
        label: "Start",
        pool: pool.id,
      });
    }
    if (!hasEnd) {
      processLevelInjections.push({
        id: `_proc_end_${pool.id}`,
        type: "end-event",
        label: "End",
        pool: pool.id,
      });
    }
  }
  aiElements = [...aiElements, ...processLevelInjections];

  // Identify white-box and black-box pools
  const whiteBoxPools = pools.filter(p => (p.poolType ?? "white-box") === "white-box");
  const blackBoxPools = pools.filter(p => p.poolType === "black-box");

  // Separate black-box pools into external entities (top) and systems (bottom).
  // Prefer the AI-set isSystem flag; fall back to a label keyword heuristic
  // only when the flag is undefined (legacy JSON or hand-written plans).
  const SYSTEM_KEYWORDS = /salesforce|xero|sap|erp|crm|sharepoint|database|api|system|server|aws|azure|google/i;
  function isSystemPool(p: AiElement): boolean {
    if (typeof p.isSystem === "boolean") return p.isSystem;
    const fromProps = (p.properties as { isSystem?: unknown } | undefined)?.isSystem;
    if (typeof fromProps === "boolean") return fromProps;
    return SYSTEM_KEYWORDS.test(p.label);
  }
  const topBlackBoxes = blackBoxPools.filter(p => !isSystemPool(p));
  const bottomBlackBoxes = blackBoxPools.filter(p => isSystemPool(p));

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

  // R43: Process-level Start Events must be placed in the TOPMOST lane of
  // their pool. Override any AI-set lane assignment so the process entry
  // point always reads top-down. Boundary starts and event-subprocess
  // internal starts are excluded — they belong with their host.
  for (const el of flowElements) {
    if (el.type !== "start-event") continue;
    if (el.parentSubprocess || el.boundaryHost) continue;
    if (!el.pool) continue;
    const pLanes = poolLanes.get(el.pool);
    if (!pLanes || pLanes.length === 0) continue;
    el.lane = pLanes[0].id;
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

  phase(`column map done (${colMap.size} elements, maxCol=${Math.max(0, ...colMap.values())})`);
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

    // Create lanes (if any)
    let laneY = poolStartY;
    if (pLanes.length === 0) {
      // No lanes: place elements directly in pool (assigned to pool, no lane).
      // R45 (also applied in the lane path): when multiple elements share a
      // column (e.g. decision-gateway branch targets), stack them vertically
      // so they don't overlap at the pool centre. n ≤ 2 uses the symmetric
      // split; n ≥ 3 stacks asymmetrically (idx 0 above, idx 1 level, idx 2+
      // stepping downward) to mirror the decision-exit placement.
      const poolEls = [
        ...(laneElements.get("__pool_" + pool.id) ?? []),
        ...flowElements.filter(e => e.pool === pool.id && !e.lane && !e.parentSubprocess && !e.boundaryHost),
      ];
      const seen = new Set<string>();
      const uniquePoolEls = poolEls.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
      const elsByCol = new Map<number, AiElement[]>();
      for (const el of uniquePoolEls) {
        const col = colMap.get(el.id) ?? 0;
        const list = elsByCol.get(col) ?? [];
        list.push(el);
        elsByCol.set(col, list);
      }
      for (const [col, list] of elsByCol) {
        const n = list.length;
        for (let i = 0; i < n; i++) {
          const el = list[i];
          const def = getSymbolDefinition(el.type as DiagramElement["type"]);
          const elX = START_X + POOL_HEADER_W + LANE_PAD_X + col * COL_SPACING;
          const stackSpacing = def.defaultHeight + 30;
          const stackOffset = n <= 2
            ? (i - (n - 1) / 2) * stackSpacing
            : (i - 1) * stackSpacing;
          const elY = poolStartY + totalLaneH / 2 - def.defaultHeight / 2 + stackOffset;
          elements.push({
            id: el.id, type: el.type as DiagramElement["type"],
            x: elX, y: elY, width: def.defaultWidth, height: def.defaultHeight,
            label: el.label, properties: buildProps(el), parentId: pool.id,
            ...(el.taskType ? { taskType: el.taskType as DiagramElement["taskType"] } : {}),
            ...(el.gatewayType ? { gatewayType: el.gatewayType as DiagramElement["gatewayType"] } : {}),
            ...(el.eventType ? { eventType: el.eventType as DiagramElement["eventType"] } : {}),
          });
        }
      }
    } else {
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

        // Place elements within this lane. Group by column; when multiple
        // elements share a column (e.g. gateway branches landing on targets
        // assigned to the same lane) stack them vertically around the lane
        // centre so they don't overlap. Stack order follows the AI's
        // emission sequence — combined with Option B's Y-sort on decision
        // outgoings (topmost target → top side, etc.) this gives a visually
        // consistent layout where branch connectors fan out cleanly.
        const laneEls = laneElements.get(lane.id) ?? [];
        const elsByCol = new Map<number, AiElement[]>();
        for (const el of laneEls) {
          const col = colMap.get(el.id) ?? 0;
          const list = elsByCol.get(col) ?? [];
          list.push(el);
          elsByCol.set(col, list);
        }
        for (const [col, list] of elsByCol) {
          const n = list.length;
          for (let i = 0; i < n; i++) {
            const el = list[i];
            const def = getSymbolDefinition(el.type as DiagramElement["type"]);
            const elX = START_X + POOL_HEADER_W + LANE_PAD_X + col * COL_SPACING;
            const stackSpacing = def.defaultHeight + 30;
            // R45 (Y stacking): for n ≥ 3, stack asymmetrically to mirror
            // decision-gateway exit placement — index 0 above, index 1
            // level with the lane centre, index 2+ below (one row each).
            // n ≤ 2 keeps the original symmetric split.
            const stackOffset = n <= 2
              ? (i - (n - 1) / 2) * stackSpacing
              : (i - 1) * stackSpacing;
            const elY = laneY + laneH / 2 - def.defaultHeight / 2 + stackOffset;

            elements.push({
              id: el.id, type: el.type as DiagramElement["type"],
              x: elX, y: elY, width: def.defaultWidth, height: def.defaultHeight,
              label: el.label,
              properties: buildProps(el),
              parentId: lane.id,
              ...(el.taskType ? { taskType: el.taskType as DiagramElement["taskType"] } : {}),
              ...(el.gatewayType ? { gatewayType: el.gatewayType as DiagramElement["gatewayType"] } : {}),
              ...(el.eventType ? { eventType: el.eventType as DiagramElement["eventType"] } : {}),
            });
          }
        }

        laneY += laneH;
      }
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

  phase(`pool/lane placement done (${elements.length} elements placed)`);

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
  // Process event subprocesses LAST so normal subprocesses size first and event subs can nest inside
  const sortedSpIds = Array.from(subprocessChildren.keys()).sort((a, b) => {
    const aEl = elements.find(e => e.id === a);
    const bEl = elements.find(e => e.id === b);
    const aEvent = aEl && (aEl.properties.subprocessType as string | undefined) === "event";
    const bEvent = bEl && (bEl.properties.subprocessType as string | undefined) === "event";
    return (aEvent ? 1 : 0) - (bEvent ? 1 : 0);
  });
  // Pre-compute event-subprocess size (used for both bottom-stack budget
  // and the event sub's own resize later). Matches the formula below.
  const taskDefForEvSub = getSymbolDefinition("task");
  const EVENT_SUB_W = taskDefForEvSub.defaultWidth * 4;
  const EVENT_SUB_H = taskDefForEvSub.defaultHeight * 2 + 40;
  const EVENT_SUB_GAP = 20;

  // R50: set of outer expanded-subprocess ids that contain embedded event
  // subs. When an outer sub is in this set, boundary Start/End events on
  // that host are forced to the TOP edge, and internal Start/End events
  // are placed in the top row of the grid.
  const outerSpsWithEventSubs = new Set<string>();

  for (const spId of sortedSpIds) {
    const children = subprocessChildren.get(spId)!;
    const spEl = elements.find(e => e.id === spId);
    if (!spEl) continue;
    const isEventSub = (spEl.properties.subprocessType as string | undefined) === "event";

    // R49: inside a NORMAL outer expanded subprocess, separate embedded
    // Event Expanded Subprocesses from the other children. Grid-place the
    // normal children at the top; stack the event subs at the bottom.
    const isChildEventSub = (ai: AiElement) =>
      ai.type === "subprocess-expanded" &&
      (ai.subprocessType === "event" || ai.properties?.subprocessType === "event");
    const normalChildren = isEventSub ? children : children.filter(ai => !isChildEventSub(ai));
    const eventSubChildren = isEventSub ? [] : children.filter(ai => isChildEventSub(ai));

    // R50: when the outer has event subs, internal Start/End events are
    // reserved for the top row; the rest fill the grid from row 1.
    const hasEventSubs = eventSubChildren.length > 0;
    const startEndCount = hasEventSubs
      ? normalChildren.filter(ai => ai.type === "start-event" || ai.type === "end-event").length
      : 0;
    const gridChildCount = normalChildren.length - startEndCount;
    const contentRows = (startEndCount > 0 ? 1 : 0) + Math.ceil(gridChildCount / CHILD_COLS);
    const rows = Math.max(1, contentRows || 1);
    const cols = Math.min(CHILD_COLS, Math.max(gridChildCount, startEndCount));
    // Event subprocess: 4 task widths × 2 task heights (small)
    // Normal subprocess: at least 5 tasks × 4 tasks (large), plus room
    // below the grid for any embedded event subs stacked vertically.
    let neededW: number, neededH: number;
    if (isEventSub) {
      neededW = EVENT_SUB_W;
      neededH = EVENT_SUB_H;
    } else {
      const minCols = Math.max(5, cols);
      const minRows = Math.max(4, rows);
      neededW = minCols * CHILD_COL_SPACING + EXPANDED_PAD_X * 2;
      neededH = minRows * CHILD_ROW_SPACING + EXPANDED_PAD_Y * 2;
      if (eventSubChildren.length > 0) {
        // Room for stacked event subs plus padding above the stack
        neededH += eventSubChildren.length * (EVENT_SUB_H + EVENT_SUB_GAP) + EVENT_SUB_GAP;
        neededW = Math.max(neededW, EVENT_SUB_W + EXPANDED_PAD_X * 2);
      }
    }
    const oldRight = spEl.x + spEl.width;
    const oldBottom = spEl.y + spEl.height;
    // Enlarge the subprocess
    spEl.width = Math.max(spEl.width, neededW);
    spEl.height = Math.max(spEl.height, neededH);
    const newRight = spEl.x + spEl.width;
    const newBottom = spEl.y + spEl.height;
    // Shift sibling elements that overlap the enlarged subprocess so they sit to the right
    const shiftX = newRight - oldRight;
    const shiftY = newBottom - oldBottom;
    if (shiftX > 0 || shiftY > 0) {
      const epLeft = spEl.x;
      for (const other of elements) {
        if (other.id === spEl.id) continue;
        if (other.parentId === spEl.id) continue; // its children
        if (other.boundaryHostId === spEl.id) continue; // its boundary events
        // Only consider siblings in the same parent (lane/pool)
        if (other.parentId !== spEl.parentId) continue;
        // Horizontal: any element whose LEFT edge is at or right of the EP's left edge
        // AND whose centre is past the EP's original centre — treat as "downstream" and shift
        const otherCx = other.x + other.width / 2;
        const epOldCx = epLeft + (oldRight - epLeft) / 2;
        if (shiftX > 0 && otherCx >= epOldCx) {
          // Shift so the element sits past the EP's new right edge
          const minX = spEl.x + spEl.width + 30; // 30px gap after EP
          if (other.x < minX) {
            other.x = minX + (other.x - oldRight > 0 ? (other.x - oldRight) : 0);
          }
        }
        // Vertical: elements below the old EP bottom (rare case)
        if (shiftY > 0 && other.y >= oldBottom - 1) {
          other.y += shiftY;
        }
      }
    }
    if (isEventSub) {
      // Event subprocess: Start event on the left, End event on the right,
      // both vertically centred. R51: Start/End centres sit 1.5 × event
      // width from their respective vertical boundaries (left for Start,
      // right for End) so they aren't cramped against the edge.
      const cyCentre = spEl.height / 2;
      for (const ai of children) {
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        let cx: number;
        if (ai.type === "start-event") {
          cx = 1.5 * def.defaultWidth;
        } else if (ai.type === "end-event") {
          cx = spEl.width - 1.5 * def.defaultWidth;
        } else {
          cx = spEl.width / 2; // middle for any other elements
        }
        elements.push({
          id: ai.id, type: ai.type as DiagramElement["type"],
          x: spEl.x + cx - def.defaultWidth / 2,
          y: spEl.y + cyCentre - def.defaultHeight / 2,
          width: def.defaultWidth, height: def.defaultHeight,
          label: ai.label, properties: buildProps(ai), parentId: spEl.id,
          ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
          ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
          ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
        });
      }
    } else {
      // Normal subprocess: grid layout for regular children.
      // R50: if this outer has embedded event subs, reserve the TOP row for
      // internal Start/End events and grid-place the rest starting row 1.
      const hasEventSubs = eventSubChildren.length > 0;
      if (hasEventSubs) outerSpsWithEventSubs.add(spId);
      const topRowEvents = hasEventSubs
        ? normalChildren.filter(ai => ai.type === "start-event" || ai.type === "end-event")
        : [];
      const gridChildren = hasEventSubs
        ? normalChildren.filter(ai => ai.type !== "start-event" && ai.type !== "end-event")
        : normalChildren;

      // Place Start/End events in the top row: Start on the left, End on
      // the right. R51: centres sit 1.5 × event width from their
      // respective vertical boundaries.
      for (const ai of topRowEvents) {
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        const cx = ai.type === "start-event"
          ? 1.5 * def.defaultWidth
          : spEl.width - 1.5 * def.defaultWidth;
        const cy = EXPANDED_PAD_Y + CHILD_ROW_SPACING / 2;
        elements.push({
          id: ai.id, type: ai.type as DiagramElement["type"],
          x: spEl.x + cx - def.defaultWidth / 2,
          y: spEl.y + cy - def.defaultHeight / 2,
          width: def.defaultWidth, height: def.defaultHeight,
          label: ai.label, properties: buildProps(ai), parentId: spEl.id,
          ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
          ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
          ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
        });
      }

      // Grid-place the rest, shifted down by one row when the top row is
      // reserved for Start/End events.
      const rowOffset = hasEventSubs ? 1 : 0;
      for (let i = 0; i < gridChildren.length; i++) {
        const ai = gridChildren[i];
        const col = i % CHILD_COLS;
        const row = Math.floor(i / CHILD_COLS) + rowOffset;
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        const cx = EXPANDED_PAD_X + col * CHILD_COL_SPACING + CHILD_COL_SPACING / 2;
        const cy = EXPANDED_PAD_Y + row * CHILD_ROW_SPACING + CHILD_ROW_SPACING / 2;
        elements.push({
          id: ai.id, type: ai.type as DiagramElement["type"],
          x: spEl.x + cx - def.defaultWidth / 2,
          y: spEl.y + cy - def.defaultHeight / 2,
          width: def.defaultWidth, height: def.defaultHeight,
          label: ai.label, properties: buildProps(ai), parentId: spEl.id,
          ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
          ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
          ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
        });
      }
      // R49: stack embedded event subprocesses at the BOTTOM of the outer
      // subprocess, one above the next. Centred horizontally.
      if (eventSubChildren.length > 0) {
        const stackTotalH = eventSubChildren.length * EVENT_SUB_H
          + (eventSubChildren.length - 1) * EVENT_SUB_GAP;
        const stackTopY = spEl.y + spEl.height - EVENT_SUB_GAP - stackTotalH;
        const stackCx = spEl.x + spEl.width / 2;
        for (let i = 0; i < eventSubChildren.length; i++) {
          const ai = eventSubChildren[i];
          const y = stackTopY + i * (EVENT_SUB_H + EVENT_SUB_GAP);
          elements.push({
            id: ai.id, type: ai.type as DiagramElement["type"],
            x: stackCx - EVENT_SUB_W / 2,
            y,
            width: EVENT_SUB_W, height: EVENT_SUB_H,
            label: ai.label, properties: buildProps(ai), parentId: spEl.id,
            ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
            ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
            ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
          });
        }
      }
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
      // R50 (boundary): when the host is an outer expanded sub containing
      // embedded event subs, force boundary Start events to the LEFT edge
      // and boundary End events to the RIGHT edge (regardless of what
      // the plan declared). Y will be re-aligned to the connected task's
      // centre in a later post-pass.
      if (outerSpsWithEventSubs.has(hostId)) {
        if (ev.type === "start-event") side = "left";
        else if (ev.type === "end-event") side = "right";
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
          label: ev.label,
          // R47: store boundarySide on the placed element so the wiring
          // pass can exit outgoing connectors from the connection point
          // furthest from the host edge the event is mounted on.
          properties: { ...buildProps(ev), boundarySide: side },
          boundaryHostId: host.id,
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
        label: ai.label, properties: buildProps(ai),
        ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
        ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
        ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
      });
      floatY += def.defaultHeight + 20;
    }
  }

  phase(`subprocess+boundary placement done (${elements.length} elements total)`);

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
    if (containerType === "pool") {
      // Pool height must cover all its lanes exactly (lanes already grew to fit content)
      const directLanes = elements.filter(e => e.type === "lane" && e.parentId === container.id).sort((a, b) => a.y - b.y);
      if (directLanes.length > 0) {
        // If neededH (based on descendants) exceeds what the lanes currently cover,
        // expand the last lane to absorb the difference
        let laneTotalH = directLanes.reduce((s, l) => s + l.height, 0);
        if (neededH > laneTotalH) {
          directLanes[directLanes.length - 1].height += (neededH - laneTotalH);
          laneTotalH = neededH;
        }
        // Stack lanes contiguously starting at pool.y
        let stackY = container.y;
        for (const lane of directLanes) {
          lane.y = stackY;
          stackY += lane.height;
        }
        container.height = laneTotalH;
      } else {
        if (neededH > container.height) container.height = neededH;
      }
    } else {
      if (neededH > container.height) container.height = neededH;
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

  // Match black-box pool widths to the widest white-box pool so every pool's
  // left and right edges line up. White-box pools can have grown during the
  // `expandContainerToFitChildren` pass above if their lanes/sub-lanes pushed
  // the contents wider than the initial column-based estimate.
  const allPools = elements.filter(e => e.type === "pool");
  const whiteBoxPoolEls = allPools.filter(
    p => ((p.properties.poolType as string | undefined) ?? "white-box") === "white-box"
  );
  if (whiteBoxPoolEls.length > 0) {
    const maxWbWidth = Math.max(...whiteBoxPoolEls.map(p => p.width));
    for (const bbp of allPools) {
      if ((bbp.properties.poolType as string | undefined) === "black-box") {
        bbp.width = maxWbWidth;
      }
    }
  }

  phase("containers expanded");

  // R52: Pools must never overlap. The expandContainerToFitChildren pass
  // above can grow a white-box pool downward to accommodate its lanes and
  // subprocess contents; if a bottom black-box pool was already placed at
  // the pre-grown Y, the two now overlap. Re-stack every pool top-to-bottom
  // with POOL_GAP between them and shift each pool's descendants (anything
  // whose centre Y lies within the pool's current bounds) along with it.
  // Extracted as a function so it can be re-run after R56 grows a pool
  // upward to enclose its AI-Generated annotation.
  function restackPoolsR52(): void {
    const sortedPools = elements
      .filter(e => e.type === "pool")
      .sort((a, b) => a.y - b.y);
    const poolDescendants = new Map<string, DiagramElement[]>();
    for (const pool of sortedPools) {
      const yTop = pool.y;
      const yBot = pool.y + pool.height;
      const descendants: DiagramElement[] = [];
      for (const el of elements) {
        if (el.type === "pool") continue;
        const elMid = el.y + el.height / 2;
        if (elMid >= yTop && elMid <= yBot) descendants.push(el);
      }
      poolDescendants.set(pool.id, descendants);
    }
    if (sortedPools.length > 0) {
      let stackY = sortedPools[0].y;
      for (const pool of sortedPools) {
        const dy = stackY - pool.y;
        if (dy !== 0) {
          pool.y += dy;
          for (const d of poolDescendants.get(pool.id)!) d.y += dy;
        }
        stackY = pool.y + pool.height + POOL_GAP;
      }
    }
  }
  restackPoolsR52();

  // ── Create connectors ──
  const elMap = new Map(elements.map(e => [e.id, e]));

  // Helper: check if element is a gateway
  const isGateway = (el: DiagramElement) => el.type === "gateway";

  // Gateway classification — strict topology test per AI layout rules R33/R34:
  //   Decision: exactly one (or zero) sequence inputs, two or more sequence outputs.
  //   Merge:    two or more sequence inputs, exactly one (or zero) sequence outputs.
  //   Neither:  falls through to default wiring.
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();
  // Ordered per-gateway connector lists (sequence flows only) — preserve the
  // AI's ordering so wiring (R35/R36) is deterministic across re-layouts.
  const decisionOutgoings = new Map<string, AiConnection[]>();
  const mergeIncomings    = new Map<string, AiConnection[]>();
  for (const c of aiConnections) {
    if (c.type === "message") continue;
    incomingCount.set(c.targetId, (incomingCount.get(c.targetId) ?? 0) + 1);
    outgoingCount.set(c.sourceId, (outgoingCount.get(c.sourceId) ?? 0) + 1);
  }
  const isDecisionGateway = (el: DiagramElement) =>
    isGateway(el) && (outgoingCount.get(el.id) ?? 0) >= 2 && (incomingCount.get(el.id) ?? 0) <= 1;
  const isMergeGateway = (el: DiagramElement) =>
    isGateway(el) && (incomingCount.get(el.id) ?? 0) >= 2 && (outgoingCount.get(el.id) ?? 0) <= 1;

  // R33/R34: patch classified gateways' properties so rendering and downstream
  // checks (e.g. Canvas.tsx gatewayRole reads) see the correct role. We only
  // OVERRIDE gatewayType when it's unset or "exclusive" default from the AI —
  // if the user / AI explicitly set a specific marker (parallel, inclusive),
  // preserve it since that's a deliberate semantic choice.
  // R40: decision-gateway labels are placed upper-left of the gateway diamond
  //      (above the top edge, offset left) rather than centred below it.
  for (const el of elements) {
    if (!isGateway(el)) continue;
    const decisionLabelPlacement = {
      labelOffsetX: -(el.width / 2 + 40),
      labelOffsetY: -(el.height + 15),
      labelWidth: 80,
    };
    if (isDecisionGateway(el)) {
      const t = (el.properties.gatewayType as string | undefined) ?? el.gatewayType ?? "exclusive";
      // R41: decision gateways without a label get a default "Test?" so the
      // diagram always asks a clear question at the branch point.
      if (!el.label || !el.label.trim()) el.label = "Test?";
      if (t === "exclusive" || t === "none") {
        el.properties = { ...el.properties, gatewayType: "none", gatewayRole: "decision", ...decisionLabelPlacement };
        el.gatewayType = "none";
      } else {
        el.properties = { ...el.properties, gatewayRole: "decision", ...decisionLabelPlacement };
      }
    } else if (isMergeGateway(el)) {
      const t = (el.properties.gatewayType as string | undefined) ?? el.gatewayType ?? "exclusive";
      if (t === "exclusive" || t === "none") {
        el.properties = { ...el.properties, gatewayType: "none", gatewayRole: "merge" };
        el.gatewayType = "none";
      } else {
        el.properties = { ...el.properties, gatewayRole: "merge" };
      }
    }
  }

  // R44: Nested decision-gateway Y alignment. A decision gateway should sit
  // at the same Y as its immediate sequence-flow predecessor so a branch
  // continuing through a nested diamond doesn't zig-zag back to the lane
  // centre. The paired merge gateway is aligned to the same Y for symmetry.
  // Pairing heuristic: BFS every outgoing branch forward through the whole
  // downstream graph (without stopping at inner merges) and collect the
  // full set of merges each branch reaches; the paired merge is the
  // smallest-column merge reachable by ALL branches — preferring one whose
  // in-degree matches the decision's out-degree.
  function findPairedMerge(decisionId: string): string | undefined {
    const outConns = outgoing.get(decisionId) ?? [];
    if (outConns.length < 2) return undefined;
    const branchMerges: Set<string>[] = [];
    for (const startConn of outConns) {
      const visited = new Set<string>();
      const merges = new Set<string>();
      const queue: string[] = [startConn.targetId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        const curEl = elMap.get(cur);
        if (curEl && isMergeGateway(curEl)) merges.add(cur);
        for (const c of outgoing.get(cur) ?? []) queue.push(c.targetId);
      }
      branchMerges.push(merges);
    }
    const common = [...branchMerges[0]].filter(m => branchMerges.every(s => s.has(m)));
    if (common.length === 0) return undefined;
    const byCol = (a: string, b: string) => (colMap.get(a) ?? 0) - (colMap.get(b) ?? 0);
    const matching = common.filter(m => (incomingCount.get(m) ?? 0) === outConns.length);
    if (matching.length > 0) return matching.sort(byCol)[0];
    return common.sort(byCol)[0];
  }

  // Walk decision gateways in column order so upstream Y-adjustments are
  // already applied when we read the predecessor's Y.
  const decisionElsSorted = elements
    .filter(e => isDecisionGateway(e))
    .sort((a, b) => (colMap.get(a.id) ?? 0) - (colMap.get(b.id) ?? 0));
  for (const dec of decisionElsSorted) {
    const incs = incoming.get(dec.id) ?? [];
    if (incs.length === 0) continue;
    const pred = elMap.get(incs[0].sourceId);
    if (!pred) continue;
    if (pred.parentId !== dec.parentId) continue; // stay within same container
    const predCentreY = pred.y + pred.height / 2;
    dec.y = predCentreY - dec.height / 2;

    const mergeId = findPairedMerge(dec.id);
    if (mergeId) {
      const merge = elMap.get(mergeId);
      if (merge && merge.parentId === dec.parentId) {
        merge.y = predCentreY - merge.height / 2;
      }
    }

    // R55: re-stack this decision's immediate outgoing branch targets
    // around the decision's (possibly-moved) Y so nested branches don't
    // remain centred on the pool/lane. Initial placement stacked them
    // around the container centre; here we snap them to match the
    // decision's actual Y. Uses the same formula as R45 (n ≤ 2 symmetric,
    // n ≥ 3 asymmetric). Only moves same-container siblings; branches in
    // different lanes/containers stay put.
    const outConns = outgoing.get(dec.id) ?? [];
    if (outConns.length >= 2) {
      const directBranches = outConns
        .map(c => elMap.get(c.targetId))
        .filter((x): x is DiagramElement => !!x && x.parentId === dec.parentId);
      const n = directBranches.length;
      const decCentreY = dec.y + dec.height / 2;
      for (let i = 0; i < n; i++) {
        const br = directBranches[i];
        const stackSpacing = br.height + 30;
        const offset = n <= 2
          ? (i - (n - 1) / 2) * stackSpacing
          : (i - 1) * stackSpacing;
        br.y = decCentreY + offset - br.height / 2;
      }
    }
  }

  // R57: pools must enclose every non-annotation, non-group element that
  // belongs to them. R44/R55 can push a deeply-nested decision branch
  // above or below the pool's current bounds (e.g. inner "yes" branch of
  // an inner decision whose predecessor is itself the outer "yes" branch
  // — lands two stack-rows above the pool centre). Grow the pool in
  // whichever direction(s) the overflow occurs; annotations and groups
  // are excluded from the bounds check since they float freely.
  {
    const FLOAT_TYPES = new Set(["text-annotation", "group"]);
    const PAD = 20;
    const pools = elements.filter(e => e.type === "pool");
    for (const pool of pools) {
      // Collect all descendants (via parentId chain + boundary events)
      // EXCEPT annotations and groups.
      const descendants: DiagramElement[] = [];
      const visited = new Set<string>();
      function collect(containerId: string) {
        for (const e of elements) {
          if (e.id === containerId || visited.has(e.id)) continue;
          const belongs =
            e.parentId === containerId ||
            (e.boundaryHostId && visited.has(e.boundaryHostId));
          if (!belongs) continue;
          visited.add(e.id);
          if (!FLOAT_TYPES.has(e.type)) descendants.push(e);
          collect(e.id);
        }
      }
      collect(pool.id);
      if (descendants.length === 0) continue;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const d of descendants) {
        minX = Math.min(minX, d.x);
        minY = Math.min(minY, d.y);
        maxX = Math.max(maxX, d.x + d.width);
        maxY = Math.max(maxY, d.y + d.height);
      }

      const neededLeft = minX - PAD;
      const neededTop = minY - PAD;
      const neededRight = maxX + PAD;
      const neededBottom = maxY + PAD;

      // Grow LEFT
      if (neededLeft < pool.x) {
        const grow = pool.x - neededLeft;
        pool.x -= grow;
        pool.width += grow;
      }
      // Grow RIGHT
      if (neededRight > pool.x + pool.width) {
        pool.width = neededRight - pool.x;
      }
      // Grow TOP (and extend first lane upward so it covers the new top)
      if (neededTop < pool.y) {
        const grow = pool.y - neededTop;
        pool.y -= grow;
        pool.height += grow;
        const poolLanes = elements.filter(e => e.type === "lane" && e.parentId === pool.id)
          .sort((a, b) => a.y - b.y);
        if (poolLanes.length > 0) {
          poolLanes[0].y -= grow;
          poolLanes[0].height += grow;
        }
      }
      // Grow BOTTOM (and extend last lane downward)
      if (neededBottom > pool.y + pool.height) {
        const grow = neededBottom - (pool.y + pool.height);
        pool.height += grow;
        const poolLanes = elements.filter(e => e.type === "lane" && e.parentId === pool.id)
          .sort((a, b) => a.y - b.y);
        if (poolLanes.length > 0) {
          poolLanes[poolLanes.length - 1].height += grow;
        }
      }
      // Match lane widths to pool's new width
      const poolLanes = elements.filter(e => e.type === "lane" && e.parentId === pool.id);
      for (const lane of poolLanes) {
        lane.x = pool.x + POOL_HEADER_W;
        lane.width = pool.width - POOL_HEADER_W;
      }
    }
    // R52 again — pool growth may have introduced overlaps between pools.
    restackPoolsR52();
  }

  // Build the ordered lists for the wiring pass (R35/R36).
  //   Decision outgoings: sorted by target element vertical position — topmost
  //                       target exits at "top", bottommost at "bottom", any
  //                       middles exit at "right" (mirrors R37 for merges).
  //                       This prevents branch connectors from criss-crossing
  //                       when the AI's emission order differs from the
  //                       physical lane/row order of the branch targets.
  //   Merge incomings:    sorted by source element vertical position so the
  //                       topmost source enters at "top", bottommost at "bottom",
  //                       and any middle sources enter at "left" (R37).
  for (const c of aiConnections) {
    if (c.type === "message") continue;
    const srcEl = elements.find(e => e.id === c.sourceId);
    const tgtEl = elements.find(e => e.id === c.targetId);
    if (srcEl && isDecisionGateway(srcEl)) {
      const list = decisionOutgoings.get(srcEl.id) ?? [];
      list.push(c);
      decisionOutgoings.set(srcEl.id, list);
    }
    if (tgtEl && isMergeGateway(tgtEl)) {
      const list = mergeIncomings.get(tgtEl.id) ?? [];
      list.push(c);
      mergeIncomings.set(tgtEl.id, list);
    }
  }
  // Sort each decision gateway's outgoing list by target's centre Y.
  for (const [decId, list] of decisionOutgoings) {
    list.sort((a, b) => {
      const aTgt = elements.find(e => e.id === a.targetId);
      const bTgt = elements.find(e => e.id === b.targetId);
      if (!aTgt || !bTgt) return 0;
      return (aTgt.y + aTgt.height / 2) - (bTgt.y + bTgt.height / 2);
    });
    decisionOutgoings.set(decId, list);
  }
  // Sort each merge gateway's incoming list by source element's centre Y so
  // the wiring pass can assign sides by vertical position.
  for (const [mergeId, list] of mergeIncomings) {
    list.sort((a, b) => {
      const aSrc = elements.find(e => e.id === a.sourceId);
      const bSrc = elements.find(e => e.id === b.sourceId);
      if (!aSrc || !bSrc) return 0;
      return (aSrc.y + aSrc.height / 2) - (bSrc.y + bSrc.height / 2);
    });
    mergeIncomings.set(mergeId, list);
  }

  // ── R27/R28: Auto-connect boundary start/end events to nearest internal task/subprocess ──
  // Boundary start events → connect FROM start TO nearest child task/subprocess
  // Boundary end events → connect FROM nearest child task/subprocess TO end event
  const TASK_LIKE_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);
  const existingConnKeys = new Set(aiConnections.map(c => `${c.sourceId}->${c.targetId}`));
  const autoConns: AiConnection[] = [];
  // Local helper — needed by both auto-connect (to exclude event subs from
  // candidates) and the filter below. Must look at el.properties, which is
  // already populated for every placed element.
  const isEventSubElement = (id: string): boolean => {
    const el = elements.find(e => e.id === id);
    return el?.type === "subprocess-expanded" &&
      (el.properties.subprocessType as string | undefined) === "event";
  };
  for (const el of elements) {
    if (!el.boundaryHostId) continue;
    if (el.type !== "start-event" && el.type !== "end-event") continue;
    const host = elements.find(h => h.id === el.boundaryHostId);
    if (!host || host.type !== "subprocess-expanded") continue;
    // Find children of the host that are task-like, EXCLUDING event subs
    // (R48: connectors to/from event subs are forbidden, so the auto-
    // connect heuristic must not pick one as its nearest candidate).
    const candidates = elements.filter(c =>
      c.parentId === host.id &&
      TASK_LIKE_TYPES.has(c.type) &&
      !isEventSubElement(c.id)
    );
    if (candidates.length === 0) continue;
    // Pick the nearest by centre-to-centre distance
    const ex = el.x + el.width / 2, ey = el.y + el.height / 2;
    let nearest = candidates[0];
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = Math.hypot((c.x + c.width / 2) - ex, (c.y + c.height / 2) - ey);
      if (d < bestDist) { bestDist = d; nearest = c; }
    }
    if (el.type === "start-event") {
      const key = `${el.id}->${nearest.id}`;
      if (!existingConnKeys.has(key)) { autoConns.push({ sourceId: el.id, targetId: nearest.id, type: "sequence" }); existingConnKeys.add(key); }
    } else { // end-event
      const key = `${nearest.id}->${el.id}`;
      if (!existingConnKeys.has(key)) { autoConns.push({ sourceId: nearest.id, targetId: el.id, type: "sequence" }); existingConnKeys.add(key); }
    }
  }

  // R50 (boundary Y-alignment): for boundary Start/End events on outer
  // subs that contain embedded event subs, re-set the event's Y to the
  // centre Y of the task/subprocess it connects to (explicit plan
  // connector or R27/R28 auto-connect). Runs AFTER auto-connect so the
  // connection target is known.
  const allConnsForAlign = [...aiConnections, ...autoConns];
  for (const el of elements) {
    if (!el.boundaryHostId) continue;
    if (el.type !== "start-event" && el.type !== "end-event") continue;
    if (!outerSpsWithEventSubs.has(el.boundaryHostId)) continue;
    // Find the connected task-like element (Start: outgoing target;
    // End: incoming source). Skip event subs — they never connect.
    let partnerId: string | undefined;
    if (el.type === "start-event") {
      const out = allConnsForAlign.find(c => c.sourceId === el.id);
      partnerId = out?.targetId;
    } else {
      const inc = allConnsForAlign.find(c => c.targetId === el.id);
      partnerId = inc?.sourceId;
    }
    if (!partnerId) continue;
    const partner = elements.find(e => e.id === partnerId);
    if (!partner || isEventSubElement(partner.id)) continue;
    const partnerCY = partner.y + partner.height / 2;
    el.y = partnerCY - el.height / 2;
  }
  // R31/R48: Drop ANY connector (sequence OR message) that touches an Event
  // Expanded Subprocess. Event subs are triggered by events, not by any kind
  // of flow — the rule is broader than R31's original sequence-only scope.
  // Apply the filter AFTER merging autoConns so auto-generated connectors
  // can't bypass it.
  const finalConnections = [...aiConnections, ...autoConns].filter(c =>
    !(isEventSubElement(c.sourceId) || isEventSubElement(c.targetId))
  );

  for (const c of finalConnections) {
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

      // Gateway wiring (R35/R36/R37):
      //   Decision gateway: incoming → left; outgoing assigned by target
      //                     vertical position — topmost target → top,
      //                     bottommost target → bottom, any middles → right.
      //   Merge gateway:    outgoing → right; incoming assigned by source
      //                     vertical position — topmost source → top,
      //                     bottommost → bottom, any middles → left. R37.
      // Each end is resolved independently so decision-to-merge connectors
      // pick the correct side at BOTH ends.
      const srcIsDecision = isDecisionGateway(src);
      const tgtIsMerge    = isMergeGateway(tgt);
      const srcIsMerge    = isMergeGateway(src);    // merge's outgoing → right
      const tgtIsDecision = isDecisionGateway(tgt); // decision's incoming → left

      if (srcIsDecision || tgtIsMerge || srcIsMerge || tgtIsDecision) {
        if (srcIsDecision) {
          // R45 (decision side): idx 0 → top, idx 1 → right (when n ≥ 3),
          // idx ≥ 2 → bottom. For n=2 fall back to top/bottom.
          const list = decisionOutgoings.get(src.id) ?? [];
          const idx = list.indexOf(c);
          const n = list.length;
          if (idx < 0 || n <= 1) srcSide = "right";
          else if (n === 2) srcSide = idx === 0 ? "top" : "bottom";
          else if (idx === 0) srcSide = "top";
          else if (idx === 1) srcSide = "right";
          else srcSide = "bottom";
        } else if (srcIsMerge) {
          srcSide = "right";
        } else {
          srcSide = "right";
        }
        if (tgtIsMerge) {
          // R45 (merge side): mirror — idx 0 → top, idx 1 → left (when n ≥ 3),
          // idx ≥ 2 → bottom.
          const list = mergeIncomings.get(tgt.id) ?? [];
          const idx = list.indexOf(c);
          const n = list.length;
          if (idx < 0 || n <= 1) tgtSide = "left";
          else if (n === 2) tgtSide = idx === 0 ? "top" : "bottom";
          else if (idx === 0) tgtSide = "top";
          else if (idx === 1) tgtSide = "left";
          else tgtSide = "bottom";
        } else if (tgtIsDecision) {
          tgtSide = "left";
        } else {
          tgtSide = "left";
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

    // R53: when source or target is an Event (start/end/intermediate), the
    // connector must attach on the side of the event FACING the other end
    // — so the line doesn't clip through the event's body. Skip boundary
    // intermediate events (R47 already handled those) and gateways (their
    // own rules R35/R36/R37/R45 dictate sides).
    const EVENT_TYPES = new Set(["start-event", "end-event", "intermediate-event"]);
    function sideFacing(el: DiagramElement, px: number, py: number): string {
      const ecx = el.x + el.width / 2, ecy = el.y + el.height / 2;
      const dx = px - ecx, dy = py - ecy;
      const nx = Math.abs(dx) / (el.width / 2 || 1);
      const ny = Math.abs(dy) / (el.height / 2 || 1);
      if (nx >= ny) return dx >= 0 ? "right" : "left";
      return dy >= 0 ? "bottom" : "top";
    }
    if (!isMessage) {
      const _tgtCx = tgt.x + tgt.width / 2, _tgtCy = tgt.y + tgt.height / 2;
      const _srcCx = src.x + src.width / 2, _srcCy = src.y + src.height / 2;
      if (EVENT_TYPES.has(src.type) && !src.boundaryHostId) {
        srcSide = sideFacing(src, _tgtCx, _tgtCy);
      }
      if (EVENT_TYPES.has(tgt.type) && !tgt.boundaryHostId) {
        tgtSide = sideFacing(tgt, _srcCx, _srcCy);
      }
    }

    // R47: connectors from an edge-mounted intermediate event must exit
    // from the event's connection point FURTHEST FROM the host edge the
    // event is mounted upon. That point sits on the event's own side that
    // matches boundarySide (e.g. event mounted on host's top edge exits
    // from the event's top point). Override whatever the generic rules
    // chose.
    if (src.boundaryHostId && src.type === "intermediate-event") {
      const stored = (src.properties?.boundarySide as string | undefined);
      if (stored === "top" || stored === "bottom" || stored === "left" || stored === "right") {
        srcSide = stored;
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

    // Connector label positioning:
    //   - Decision gateway outgoing → anchor to source edge, offset outward
    //     from whichever face the connector exits (R38).
    //   - Message flow → position the label vertically in the GAP between
    //     source and target pools so it reads cleanly in the inter-pool
    //     space (R39). Offset relative to connector midpoint.
    //   - Other (sequence fallback) → minor offset above the line.
    let labelOffsetX: number | undefined;
    let labelOffsetY: number | undefined;
    let labelWidth: number | undefined;
    let labelAnchor: "source" | "target" | undefined;
    if (c.label) {
      if (isDecisionGateway(src)) {
        // R42: outgoing sequence connector labels from a decision gateway
        // anchor to the source attachment point. Per-side placement:
        //   - top:    label sits ABOVE the gateway, RIGHT of the connector;
        //             left edge of text +6px from the connector,
        //             bottom of text 10px above the gateway top point.
        //   - bottom: label sits BELOW the gateway, RIGHT of the connector;
        //             left edge of text +6px from the connector,
        //             top of text 10px below the gateway bottom point.
        //   - right:  label sits BELOW the connector; left edge of text
        //             +3px from the gateway right-hand connection point,
        //             top of text 2px below the connector line.
        // labelOffsetX shifts the label CENTRE, so left-edge alignment
        // requires adding half the estimated text width (renderer formula:
        // Math.max(30, len*6 + 12) at fontScale=1; line height = 14).
        const estLabelW = Math.max(30, (c.label?.length ?? 0) * 6 + 12);
        const lineH = 14;
        labelWidth = 60;
        labelAnchor = "source";
        switch (srcSide) {
          case "top":    labelOffsetX = 6 + estLabelW / 2; labelOffsetY = -10 - lineH; break;
          case "bottom": labelOffsetX = 6 + estLabelW / 2; labelOffsetY = 10;          break;
          case "right":  labelOffsetX = 3 + estLabelW / 2; labelOffsetY = 2;           break;
          case "left":   labelOffsetX = -labelWidth - 8;   labelOffsetY = -6;          break;
          default:       labelOffsetX = 8;                 labelOffsetY = -20;         break;
        }
      } else if (isMessage) {
        // BBP-anchored placement: label sits 50px from the Black-Box Pool
        // boundary (into the gap), right of the connector by default.
        // If a sibling label on the same BBP would overlap, flip to the
        // left. Falls back to gap-centre when neither pool is BBP.
        function containingPool(el: DiagramElement): DiagramElement | undefined {
          if (el.type === "pool") return el;
          let cur: DiagramElement | undefined = el;
          for (let i = 0; i < 10 && cur; i++) {
            if (!cur.parentId) break;
            const parent = elements.find(e => e.id === cur!.parentId);
            if (!parent) break;
            if (parent.type === "pool") return parent;
            cur = parent;
          }
          return undefined;
        }
        const srcPool = containingPool(src);
        const tgtPool = containingPool(tgt);
        labelWidth = 80;
        if (srcPool && tgtPool) {
          const goingDown = srcSide === "bottom";
          const srcPoolEdgeY = goingDown ? srcPool.y + srcPool.height : srcPool.y;
          const tgtPoolEdgeY = goingDown ? tgtPool.y : tgtPool.y + tgtPool.height;
          const srcY = src.type === "pool" ? srcPoolEdgeY : (srcSide === "bottom" ? src.y + src.height : src.y);
          const tgtY = tgt.type === "pool" ? tgtPoolEdgeY : (srcSide === "bottom" ? tgt.y : tgt.y + tgt.height);
          const midY = (srcY + tgtY) / 2;
          // Approx anchor X (vertical messageBPMN means src and tgt edges share x)
          const midX = src.x + src.width / 2;
          const srcIsBlackBox = ((srcPool.properties.poolType as string | undefined) ?? "black-box") !== "white-box";
          const tgtIsBlackBox = ((tgtPool.properties.poolType as string | undefined) ?? "black-box") !== "white-box";
          let bbpId: string | null = null;
          let bbpEdgeY = 0;
          let otherEdgeY = 0;
          if (srcIsBlackBox && !tgtIsBlackBox) { bbpId = srcPool.id; bbpEdgeY = srcPoolEdgeY; otherEdgeY = tgtPoolEdgeY; }
          else if (tgtIsBlackBox && !srcIsBlackBox) { bbpId = tgtPool.id; bbpEdgeY = tgtPoolEdgeY; otherEdgeY = srcPoolEdgeY; }
          else if (srcIsBlackBox && tgtIsBlackBox) { bbpId = srcPool.id; bbpEdgeY = srcPoolEdgeY; otherEdgeY = tgtPoolEdgeY; }
          if (bbpId) {
            const direction = otherEdgeY >= bbpEdgeY ? 1 : -1;
            const labelCentreY = bbpEdgeY + 50 * direction;
            labelOffsetY = labelCentreY - midY - 7;
            const RIGHT = 45;
            const LEFT = -45;
            const Y_BAND = 24;
            const placedOnBbp = connectors.filter(pc =>
              pc.type === "messageBPMN" &&
              typeof pc.label === "string" && pc.label.trim().length > 0 &&
              (pc.sourceId === bbpId || pc.targetId === bbpId) &&
              pc.waypoints.length >= 4
            ).map(pc => {
              const cAnchorX = (pc.waypoints[1].x + pc.waypoints[pc.waypoints.length - 2].x) / 2;
              const cAnchorY = (pc.waypoints[1].y + pc.waypoints[pc.waypoints.length - 2].y) / 2;
              return {
                cx: cAnchorX + (pc.labelOffsetX ?? 0),
                cy: cAnchorY + (pc.labelOffsetY ?? 0) + 7,
                w: pc.labelWidth ?? 80,
              };
            });
            const overlapsAt = (testCx: number) => {
              for (const l of placedOnBbp) {
                if (Math.abs(l.cy - labelCentreY) > Y_BAND) continue;
                const aL = testCx - 80 / 2, aR = testCx + 80 / 2;
                const bL = l.cx - l.w / 2, bR = l.cx + l.w / 2;
                if (!(aR < bL || bR < aL)) return true;
              }
              return false;
            };
            const rightCx = midX + RIGHT;
            const leftCx = midX + LEFT;
            labelOffsetX = (overlapsAt(rightCx) && !overlapsAt(leftCx)) ? LEFT : RIGHT;
          } else {
            // Both white-box — legacy gap-centre placement
            const gapCentreY = (srcPoolEdgeY + tgtPoolEdgeY) / 2;
            labelOffsetY = gapCentreY - midY - 7;
            labelOffsetX = 20;
          }
        } else {
          labelOffsetX = 20;
          labelOffsetY = 0;
        }
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
      ...(labelAnchor ? { labelAnchor } : {}),
    } as Connector);
  }

  phase(`connectors built (${connectors.length})`);

  // Compute waypoints for all connectors
  const computedConnectors = connectors.map((conn, i) => {
    const tConn = Date.now();
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    const logSlow = () => {
      const dur = Date.now() - tConn;
      if (dur > 200) {
        layoutTrace(`[layoutBpmnDiagram] slow waypoint ${i}/${connectors.length}: ${conn.type} ${conn.sourceId}→${conn.targetId} took ${dur}ms`);
      }
    };
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
        logSlow();
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
      logSlow();
      return { ...conn, waypoints: result.waypoints,
        sourceInvisibleLeader: result.sourceInvisibleLeader,
        targetInvisibleLeader: result.targetInvisibleLeader };
    } catch { logSlow(); return conn; }
  });

  phase("waypoints computed — done");

  // R56: "AI Generated" annotation attached to the process-level Start Event.
  // Injected post-layout so it doesn't go through the column/lane placement.
  // Annotations can float anywhere — no need to stay inside the pool.
  const finalConnectors: Connector[] = [...computedConnectors];
  if (opts?.promptLabel) {
    const startEl = elements.find(e =>
      e.type === "start-event" && !e.boundaryHostId
      && !aiElements.find(a => a.id === e.id)?.parentSubprocess);
    if (startEl) {
      const annotId = "_ai_gen_annotation";
      const annotW = 160, annotH = 44;
      const startCx = startEl.x + startEl.width / 2;
      // Walk ancestors to find the top of the enclosing pool — the
      // annotation sits above it.
      let topOfContainer = startEl.y;
      let cur = startEl as DiagramElement | undefined;
      while (cur?.parentId) {
        const parent = elements.find(p => p.id === cur!.parentId);
        if (!parent) break;
        topOfContainer = parent.y;
        if (parent.type === "pool") break;
        cur = parent;
      }
      const annotX = startCx - annotW / 2;
      const annotY = topOfContainer - annotH - 20;
      elements.push({
        id: annotId,
        type: "text-annotation",
        x: annotX,
        y: annotY,
        width: annotW,
        height: annotH,
        label: `AI Generated\n${opts.promptLabel}`,
        properties: {},
      } as DiagramElement);
      finalConnectors.push({
        id: `conn-${annotId}-${startEl.id}`,
        sourceId: annotId,
        targetId: startEl.id,
        sourceSide: "bottom",
        targetSide: "top",
        type: "associationBPMN",
        directionType: "non-directed",
        routingType: "direct",
        sourceInvisibleLeader: false,
        targetInvisibleLeader: false,
        waypoints: [
          { x: annotX + annotW / 2, y: annotY + annotH },
          { x: startCx,             y: startEl.y },
        ],
        label: "",
      } as Connector);
    }
  }

  return {
    elements,
    connectors: finalConnectors,
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
      label: ai.label, properties: buildProps(ai),
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

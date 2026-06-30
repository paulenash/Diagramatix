/**
 * Layout engine for AI-generated BPMN diagrams.
 * Handles pools, lanes, and element placement within lanes.
 */

import type { DiagramData, DiagramElement, Connector, Point } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";
import { computeWaypoints } from "./routing";
import { autoSizeForType, wrapText, type AutosizeType } from "./textMetrics";

/** Word-wrap a black-box pool name into multiple lines, then size the pool
 *  FROM the wrapped result: the rotated label runs along the pool HEIGHT, so
 *  the height comes from the LONGEST wrapped line, and the header strip width
 *  from the line COUNT. Matches poolMetrics (fontSize 12) so the load-time
 *  recompute agrees. Without this the height was computed from the full
 *  single-line name and the black-box pool came out far too tall. */
function wrapPoolName(name: string): { label: string; height: number; headerWidth: number } {
  const MAX_CHARS = 18; // target line length — keeps the pool a sensible height
  const words = name.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (test.length > MAX_CHARS && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) lines.push(name);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const charPx = 12 * 0.6;   // poolMetrics charPxWidth
  const lineH = 12 * 1.18;   // poolMetrics lineH
  const height = Math.max(BLACK_BOX_H, Math.ceil(longest * charPx + 20));
  const headerWidth = Math.max(36, Math.ceil(lines.length * lineH + 8));
  return { label: lines.join("\n"), height, headerWidth };
}

/** Auto-size a task / subprocess to fit its label; other types keep their
 *  default. Tasks that overflow the catalogue width are the ones whose names
 *  spilled outside the box. */
function autoElementSize(type: string, label: string, taskType: string | undefined, def: { defaultWidth: number; defaultHeight: number }): { w: number; h: number } {
  if (type === "task" || type === "subprocess") {
    return autoSizeForType(type as AutosizeType, label ?? "", 12, !!taskType && taskType !== "none");
  }
  return { w: def.defaultWidth, h: def.defaultHeight };
}

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

  // ── Start/End events can never be boundary (edge-mounted) events ──
  // BPMN only allows INTERMEDIATE events on an activity boundary. The AI plan
  // sometimes tags an expanded subprocess's own start/end with boundaryHost =
  // the EP, which edge-mounts them (start → left edge, end → right edge) and
  // leaves the EP positioned around those events instead of wrapping its real
  // flow (the tasks then strand in the lane). Repair it: a start/end whose
  // boundaryHost is an EP becomes that EP's INTERNAL start/end
  // (parentSubprocess); on any other host the stray boundaryHost is dropped.
  {
    const epIdSet = new Set(
      aiElements.filter(e => e.type === "subprocess-expanded").map(e => e.id),
    );
    for (const ai of aiElements) {
      if ((ai.type === "start-event" || ai.type === "end-event") && ai.boundaryHost) {
        if (epIdSet.has(ai.boundaryHost)) ai.parentSubprocess = ai.boundaryHost;
        ai.boundaryHost = undefined;
        ai.boundarySide = undefined;
      }
    }
  }

  // ── R6.07/R6.10/R6.11: Event Subprocess handling ──
  // - Auto-detect event subprocesses
  // - Ensure they are wrapped in a Normal Expanded Subprocess
  // - Auto-inject an internal start event and internal end event if missing.
  //   R6.11 lets the AI choose interrupting vs non-interrupting based on
  //   semantics; this fallback only runs when the AI omitted the start
  //   event entirely, so we default to non-interrupting (R6.11's tiebreaker).
  const injected: AiElement[] = [];
  for (const ai of aiElements) {
    if (ai.type !== "subprocess-expanded") continue;
    const labelLower = (ai.label || "").toLowerCase();
    // Fallback detection: treat as event sub if any direct child is a
    // non-interrupting start event. AI sometimes forgets to set
    // subprocessType="event" even when it emits the characteristic
    // non-interrupting internal start event (which is only valid inside
    // an event sub). Catching this avoids missed R7.03 connector-stripping.
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

    // R6.10: A process-level Event Sub-Process renders directly inside its
    // pool. BPMN allows an Event Sub-Process at the top level of a Process —
    // it does NOT need a wrapping subprocess. We used to fabricate a "Main
    // Process" Normal Expanded Subprocess to host it, but that produced a
    // confusingly-named box containing only the event handler. If the AI
    // legitimately nested the event sub inside a real Normal Expanded
    // Subprocess, that nesting is preserved; otherwise it stays a top-level
    // flow element placed by the pool/lane layout.
    const parentSub = ai.parentSubprocess
      ? aiElements.find(e => e.id === ai.parentSubprocess)
      : undefined;
    const parentIsNormalSub = parentSub?.type === "subprocess-expanded" &&
      (parentSub.subprocessType ?? "normal") !== "event";
    if (!parentIsNormalSub && ai.parentSubprocess) {
      // parentSubprocess pointed at something that can't host it (a pool, an
      // event sub, or a missing id) — detach so it sits at the pool level.
      ai.parentSubprocess = undefined;
    }

    // R6.11: Ensure internal start event exists. Default to non-interrupting
    // when we have to fabricate one — the AI is responsible for choosing
    // interrupting when the prompt warrants it; if it skipped the start
    // event altogether we have no semantic signal, so use the tiebreaker.
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
    // R6.11: Ensure internal end event exists
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

  // ── Pull each EP's flow span inside the EP ──
  // After the start/end repair (and injection), an EP has internal start/end
  // events but the tasks BETWEEN them may still be tagged at lane level (the
  // plan never marked them). Tag every node that lies on a sequence path from
  // one of the EP's internal start events to one of its internal end events —
  // forward-reachable from a start AND backward-reachable from an end, so the
  // span is bounded and we never pull in unrelated downstream flow. Nodes
  // already inside another container, boundary events, and pools / lanes /
  // data artifacts are never reassigned.
  {
    const NONFLOW = new Set(["pool", "lane", "data-object", "data-store", "text-annotation", "group"]);
    const pushMap = (m: Map<string, string[]>, k: string, v: string) => {
      const a = m.get(k); if (a) a.push(v); else m.set(k, [v]);
    };
    const out = new Map<string, string[]>();
    const inc = new Map<string, string[]>();
    for (const c of aiConnections) {
      if (c.type === "message") continue;
      pushMap(out, c.sourceId, c.targetId);
      pushMap(inc, c.targetId, c.sourceId);
    }
    const byId = new Map(aiElements.map(e => [e.id, e]));
    for (const ep of aiElements.filter(e => e.type === "subprocess-expanded")) {
      const startIds = aiElements
        .filter(e => e.parentSubprocess === ep.id && e.type === "start-event").map(e => e.id);
      const endIds = aiElements
        .filter(e => e.parentSubprocess === ep.id && e.type === "end-event").map(e => e.id);
      if (startIds.length === 0 || endIds.length === 0) continue;
      const startSet = new Set(startIds);
      const endSet = new Set(endIds);
      // Forward from starts, stopping AT ends (include the end, don't cross it).
      const fwd = new Set<string>();
      const fstack = [...startIds];
      while (fstack.length) {
        const n = fstack.pop()!;
        for (const t of out.get(n) ?? []) {
          if (fwd.has(t)) continue;
          fwd.add(t);
          if (!endSet.has(t)) fstack.push(t);
        }
      }
      // Backward from ends, stopping AT starts.
      const bwd = new Set<string>();
      const bstack = [...endIds];
      while (bstack.length) {
        const n = bstack.pop()!;
        for (const s of inc.get(n) ?? []) {
          if (bwd.has(s)) continue;
          bwd.add(s);
          if (!startSet.has(s)) bstack.push(s);
        }
      }
      for (const id of fwd) {
        if (!bwd.has(id) || startSet.has(id) || endSet.has(id)) continue;
        const el = byId.get(id);
        if (!el || NONFLOW.has(el.type) || el.parentSubprocess || el.boundaryHost) continue;
        el.parentSubprocess = ep.id;
      }
    }
  }

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

  // R6.13: Every process must have a process-level Start Event and End Event in each white-box pool.
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

  // R3.08: Process-level Start Events must be placed in the TOPMOST lane of
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

  // Back-edge detection. Rework / iteration loops ("rejected → revise →
  // re-check") are valid BPMN, but the longest-path relaxation below keeps
  // the MAX column, so a loop's back-edge would pump every loop node's
  // column up by one on each pass — dragging the whole downstream chain to
  // the far right and collapsing the diagram into a single vertical column.
  // DFS the sequence-flow graph and flag any edge pointing back to a node
  // still on the current DFS stack (an ancestor) as a back-edge; those are
  // excluded from the column relaxation. Forward / cross edges are kept
  // (they don't create cycles). Acyclic diagrams find zero back-edges, so
  // this is a no-op for them.
  const backEdges = new Set<string>(); // key: `${sourceId}->${targetId}`
  {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const colour = new Map<string, number>();
    const roots = [...startEls.map(e => e.id), ...flowElements.map(e => e.id)];
    for (const root of roots) {
      if ((colour.get(root) ?? WHITE) !== WHITE) continue;
      // Iterative DFS (explicit stack) — avoids blowing the call stack on
      // large generated diagrams.
      const stack: { id: string; i: number }[] = [{ id: root, i: 0 }];
      colour.set(root, GRAY);
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const outs = outgoing.get(frame.id) ?? [];
        if (frame.i >= outs.length) { colour.set(frame.id, BLACK); stack.pop(); continue; }
        const target = outs[frame.i++].targetId;
        const tc = colour.get(target) ?? WHITE;
        if (tc === GRAY) {
          backEdges.add(`${frame.id}->${target}`);        // closes a cycle — skip in ranking
        } else if (tc === WHITE) {
          colour.set(target, GRAY);
          stack.push({ id: target, i: 0 });
        }
        // BLACK target = forward / cross edge — keep it as a normal ranking edge
      }
    }
  }

  // Multi-pass longest-path relaxation over the acyclic edge set (back-edges
  // excluded). The pass cap is bounded by the node count — a DAG's longest
  // path can't exceed that — replacing the old fixed 20-pass ceiling that
  // truncated deep flows.
  const colPassCap = Math.max(20, flowElements.length + 1);
  const queue: { id: string; col: number }[] = startEls.map(e => ({ id: e.id, col: 0 }));
  for (let pass = 0; pass < colPassCap && queue.length > 0; pass++) {
    const next: typeof queue = [];
    while (queue.length > 0) {
      const { id, col } = queue.shift()!;
      const existing = colMap.get(id) ?? -1;
      if (col <= existing) continue; // already has a later column
      colMap.set(id, col);
      for (const c of (outgoing.get(id) ?? [])) {
        if (backEdges.has(`${id}->${c.targetId}`)) continue; // don't rank through loops
        next.push({ id: c.targetId, col: col + 1 });
      }
    }
    queue.push(...next);
  }
  // Boundary-event flow targets. A boundary event (boundaryHost set) is not a
  // flow node, so the BFS above never traverses its outgoing edge — leaving
  // its target (e.g. a timer-boundary "Send reminder" task) UNRANKED, to be
  // dumped into the far-right "unvisited" bucket below (≈ colMap.size columns
  // out) with the pool stretched to match. Instead, rank each such target one
  // column right of the boundary event's HOST and relax its forward-only
  // downstream, so the excursion sits right next to the host.
  {
    const hostOf = new Map<string, string>();
    for (const el of aiElements) {
      if (el.boundaryHost) hostOf.set(el.id, el.boundaryHost);
    }
    let bq: { id: string; col: number }[] = [];
    for (const c of aiConnections) {
      if (c.type === "message") continue;
      const host = hostOf.get(c.sourceId);
      if (host === undefined) continue; // not a boundary-event flow
      bq.push({ id: c.targetId, col: (colMap.get(host) ?? 0) + 1 });
    }
    for (let pass = 0; pass < colPassCap && bq.length > 0; pass++) {
      const next: typeof bq = [];
      while (bq.length > 0) {
        const { id, col } = bq.shift()!;
        const existing = colMap.get(id) ?? -1;
        if (col <= existing) continue;
        colMap.set(id, col);
        for (const c of (outgoing.get(id) ?? [])) {
          if (backEdges.has(`${id}->${c.targetId}`)) continue;
          const tcol = colMap.get(c.targetId);
          if (tcol !== undefined && tcol <= col) continue; // upstream / loop-back — never bump it
          next.push({ id: c.targetId, col: col + 1 });
        }
      }
      bq = next;
    }
  }

  // Unvisited elements
  for (const el of flowElements) {
    if (!colMap.has(el.id)) colMap.set(el.id, colMap.size);
  }

  phase(`column map done (${colMap.size} elements, maxCol=${Math.max(0, ...colMap.values())}, backEdges=${backEdges.size})`);
  const maxCol = Math.max(0, ...colMap.values());

  // ── Pool width: content columns + 1 task width padding for user adjustment room ──
  let curY = START_Y;
  // R6.02: content width + 1 task width padding
  const contentWidth = (maxCol + 1) * COL_SPACING;
  const poolWidth = POOL_HEADER_W + contentWidth + LANE_PAD_X + TASK_W;

  for (const bbp of topBlackBoxes) {
    // R6.01: black-box pool height = rotated multi-line text length. Wrap the
    // name FIRST, then size from the wrapped result (longest line → height,
    // line count → header strip width).
    const wrapped = wrapPoolName(bbp.label);
    const bbH = wrapped.height;
    elements.push({
      id: bbp.id, type: "pool" as DiagramElement["type"],
      x: START_X, y: curY, width: poolWidth, height: bbH,
      label: wrapped.label,
      properties: { poolType: "black-box", isSystem: false, poolHeaderWidth: wrapped.headerWidth },
    });
    curY += bbH + POOL_GAP;
  }

  // ── Layout white-box pools with lanes ──
  for (const pool of whiteBoxPools) {
    const pLanes = poolLanes.get(pool.id) ?? [];
    const poolStartY = curY;

    // R6.02: Compute lane heights — each lane needs room for its elements + vertical padding
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

    // R6.01: Ensure pool is tall enough to display the vertical pool name
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
      // R3.10 (also applied in the lane path): when multiple elements share a
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
          const sz = autoElementSize(el.type, el.label ?? "", el.taskType as string | undefined, def);
          // Keep the element CENTRE on the column so auto-sized tasks stay
          // aligned with their neighbours either side.
          const colCentreX = START_X + POOL_HEADER_W + LANE_PAD_X + col * COL_SPACING + def.defaultWidth / 2;
          const elX = colCentreX - sz.w / 2;
          const stackSpacing = def.defaultHeight + 30;
          const stackOffset = n <= 2
            ? (i - (n - 1) / 2) * stackSpacing
            : (i - 1) * stackSpacing;
          const elY = poolStartY + totalLaneH / 2 - sz.h / 2 + stackOffset;
          elements.push({
            id: el.id, type: el.type as DiagramElement["type"],
            x: elX, y: elY, width: sz.w, height: sz.h,
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
            const sz = autoElementSize(el.type, el.label ?? "", el.taskType as string | undefined, def);
            // Keep the element CENTRE on the column so auto-sized tasks stay
            // aligned with their neighbours either side.
            const colCentreX = START_X + POOL_HEADER_W + LANE_PAD_X + col * COL_SPACING + def.defaultWidth / 2;
            const elX = colCentreX - sz.w / 2;
            const stackSpacing = def.defaultHeight + 30;
            // R3.10 (Y stacking): for n ≥ 3, stack asymmetrically to mirror
            // decision-gateway exit placement — index 0 above, index 1
            // level with the lane centre, index 2+ below (one row each).
            // n ≤ 2 keeps the original symmetric split.
            const stackOffset = n <= 2
              ? (i - (n - 1) / 2) * stackSpacing
              : (i - 1) * stackSpacing;
            const elY = laneY + laneH / 2 - sz.h / 2 + stackOffset;

            elements.push({
              id: el.id, type: el.type as DiagramElement["type"],
              x: elX, y: elY, width: sz.w, height: sz.h,
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
    const wrapped = wrapPoolName(bbp.label);
    const bbH = wrapped.height;
    elements.push({
      id: bbp.id, type: "pool" as DiagramElement["type"],
      x: START_X, y: curY, width: poolWidth, height: bbH,
      label: wrapped.label,
      properties: { poolType: "black-box", isSystem: true, poolHeaderWidth: wrapped.headerWidth },
    });
    curY += bbH + POOL_GAP;
  }

  phase(`pool/lane placement done (${elements.length} elements placed)`);

  // ── Re-parent boundary-crossing gateways out of expanded subprocesses ──
  // A parallel / inclusive SPLIT or JOIN that forks to — or merges from — an
  // expanded subprocess as ONE OF ITS BRANCHES must sit at the EP's own level
  // (same lane), never inside it. The AI plan sometimes marks such a gateway
  // with parentSubprocess = the EP; if the gateway connects to the EP itself
  // or to any element outside that EP, it is boundary-crossing — strip the
  // parentSubprocess so it lays out as a SIBLING of the EP (inheriting the
  // EP's lane / pool, or the EP's own parent EP when nested). Genuine in-EP
  // gateways connect only to in-EP elements and are left untouched. Without
  // this the EP wrongly grows to swallow the outer join (user report).
  {
    const insideEp = new Map<string, string>(); // elId -> the EP id it's declared inside
    for (const ai of aiElements) if (ai.parentSubprocess) insideEp.set(ai.id, ai.parentSubprocess);
    const epById = new Map(aiElements.filter(a => a.type === "subprocess-expanded").map(a => [a.id, a]));
    for (const ai of aiElements) {
      if (ai.type !== "gateway" || !ai.parentSubprocess) continue;
      const spId = ai.parentSubprocess;
      const crosses = aiConnections.some((c) => {
        if (c.sourceId !== ai.id && c.targetId !== ai.id) return false;
        const other = c.sourceId === ai.id ? c.targetId : c.sourceId;
        if (other === spId) return true;            // connects to the EP itself → EP is a branch
        return insideEp.get(other) !== spId;        // endpoint is outside this EP
      });
      if (crosses) {
        const ep = epById.get(spId);
        if (ep?.parentSubprocess) {
          ai.parentSubprocess = ep.parentSubprocess; // nested: hop up to the EP's own parent EP
        } else {
          ai.parentSubprocess = undefined;
          if (ep) { ai.lane = ep.lane; ai.pool = ep.pool; }
        }
      }
    }
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
  // Content-driven event-subprocess footprint. An event sub lays its children
  // out in a single row, so its width grows with the child count (height is
  // fixed). Shared by the event sub's own resize AND a parent normal sub's
  // width budget, so the parent reserves enough room to actually contain it
  // — a fixed EVENT_SUB_W budget overflows once the event sub has >2 children.
  const eventSubSize = (childCount: number) => ({
    w: Math.max(EVENT_SUB_W, Math.max(2, childCount) * CHILD_COL_SPACING + EXPANDED_PAD_X * 2),
    h: EVENT_SUB_H,
  });

  // R8.01: set of outer expanded-subprocess ids that contain embedded event
  // subs. When an outer sub is in this set, boundary Start/End events on
  // that host are forced to the TOP edge, and internal Start/End events
  // are placed in the top row of the grid.
  const outerSpsWithEventSubs = new Set<string>();

  for (const spId of sortedSpIds) {
    const children = subprocessChildren.get(spId)!;
    const spEl = elements.find(e => e.id === spId);
    if (!spEl) continue;
    const isEventSub = (spEl.properties.subprocessType as string | undefined) === "event";

    // R7.04: inside a NORMAL outer expanded subprocess, separate embedded
    // Event Expanded Subprocesses from the other children. Grid-place the
    // normal children at the top; stack the event subs at the bottom.
    const isChildEventSub = (ai: AiElement) =>
      ai.type === "subprocess-expanded" &&
      (ai.subprocessType === "event" || ai.properties?.subprocessType === "event");
    const normalChildren = isEventSub ? children : children.filter(ai => !isChildEventSub(ai));
    const eventSubChildren = isEventSub ? [] : children.filter(ai => isChildEventSub(ai));

    // A plain linear EP (a normal subprocess with NO embedded event subs) lays
    // its children out as a single left-to-right flow row — start at the far
    // left, end at the far right, tasks evenly spaced between — exactly like an
    // event subprocess. The 5-column grid is reserved for the (rarer) case of
    // an outer sub that hosts embedded event subprocesses; using it for a plain
    // sub wrapped the internal end event onto a second row (user report).
    const singleRowFlow = !isEventSub && eventSubChildren.length === 0;

    // R8.01: when the outer has event subs, internal Start/End events are
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
    // Normal subprocess: sized to its content (a modest 2×2 floor so even a
    // tiny EP still reads as a container), plus room below the grid for any
    // embedded event subs stacked vertically.
    let neededW: number, neededH: number;
    if (isEventSub) {
      // Flexible sizing: an event subprocess lays its children out in a
      // single row (start → middle elements → end), so its width must grow
      // with the child count rather than being pinned to a fixed 4-task box.
      const sz = eventSubSize(children.length);
      neededW = sz.w;
      neededH = sz.h;
    } else if (singleRowFlow) {
      // Single-row flow: width grows with the child count; height is one row.
      neededW = Math.max(2, normalChildren.length) * CHILD_COL_SPACING + EXPANDED_PAD_X * 2;
      neededH = CHILD_ROW_SPACING + EXPANDED_PAD_Y * 2;
    } else {
      // Content-driven: grow with the actual child grid, with a small 2×2
      // floor (was a rigid 5×4, which bloated small subprocesses with empty
      // space). Embedded event subs add height below the grid (handled next).
      const hasGridContent = gridChildCount > 0 || startEndCount > 0;
      const minCols = Math.max(2, cols);
      // Skip the 2-row grid floor when there are no grid children — e.g. an
      // auto-injected wrapper ("Main Process") whose only child is an embedded
      // event sub. Otherwise the wrapper carries ~2 empty rows of dead height
      // above the event sub.
      const minRows = hasGridContent ? Math.max(2, rows) : 0;
      neededW = minCols * CHILD_COL_SPACING + EXPANDED_PAD_X * 2;
      neededH = minRows * CHILD_ROW_SPACING + EXPANDED_PAD_Y * 2;
      if (eventSubChildren.length > 0) {
        // Room for stacked event subs plus padding above the stack
        neededH += eventSubChildren.length * (EVENT_SUB_H + EVENT_SUB_GAP) + EVENT_SUB_GAP;
        // Reserve the WIDEST embedded event sub at its real, content-driven
        // width — not the EVENT_SUB_W floor, which a multi-task event sub
        // overflows (it would then stick out past the wrapper's right edge).
        let maxEvW = EVENT_SUB_W;
        for (const es of eventSubChildren) {
          maxEvW = Math.max(maxEvW, eventSubSize((subprocessChildren.get(es.id) ?? []).length).w);
        }
        neededW = Math.max(neededW, maxEvW + EXPANDED_PAD_X * 2);
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
    if (isEventSub || singleRowFlow) {
      // Single-row flow (event subprocess OR a plain linear EP): lay children
      // out left-to-right — Start first, End last, any middle elements
      // (tasks/gateways) evenly spaced between them, all vertically centred.
      // Even distribution + the content-driven width keeps them readable
      // however many there are, and the End never wraps to a second row.
      const ordered = [
        ...normalChildren.filter(c => c.type === "start-event"),
        ...normalChildren.filter(c => c.type !== "start-event" && c.type !== "end-event"),
        ...normalChildren.filter(c => c.type === "end-event"),
      ];
      const cyCentre = spEl.height / 2;
      const n = ordered.length;
      const usableW = spEl.width - EXPANDED_PAD_X * 2;
      for (let i = 0; i < n; i++) {
        const ai = ordered[i];
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        const cx = n <= 1 ? spEl.width / 2 : EXPANDED_PAD_X + (usableW * i) / (n - 1);
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
      // R8.01: if this outer has embedded event subs, reserve the TOP row for
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
      // the right. R8.02: centres sit 1.5 × event width from their
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
      // R7.04: stack embedded event subprocesses at the BOTTOM of the outer
      // subprocess, one above the next. Centred horizontally.
      if (eventSubChildren.length > 0) {
        const stackTotalH = eventSubChildren.length * EVENT_SUB_H
          + (eventSubChildren.length - 1) * EVENT_SUB_GAP;
        const stackTopY = spEl.y + spEl.height - EVENT_SUB_GAP - stackTotalH;
        const stackCx = spEl.x + spEl.width / 2;
        for (let i = 0; i < eventSubChildren.length; i++) {
          const ai = eventSubChildren[i];
          // Place at the event sub's FINAL content-driven size so it sits
          // centred and stays inside the wrapper; the event sub's own resize
          // pass (it's processed later) then finds the size already correct.
          const sz = eventSubSize((subprocessChildren.get(ai.id) ?? []).length);
          const y = stackTopY + i * (EVENT_SUB_H + EVENT_SUB_GAP);
          elements.push({
            id: ai.id, type: ai.type as DiagramElement["type"],
            x: stackCx - sz.w / 2,
            y,
            width: sz.w, height: sz.h,
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
      // R8.01 (boundary): when the host is an outer expanded sub containing
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
          // R7.02: store boundarySide on the placed element so the wiring
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

  // Move every transitive child of a container (parentId chain + boundary
  // events mounted on any descendant) vertically by dy. Used when a lane is
  // re-stacked so its contents move with it.
  function collectSubtreeIds(rootId: string): Set<string> {
    const ids = new Set<string>();
    let added = true;
    while (added) {
      added = false;
      for (const e of elements) {
        if (e.id === rootId || ids.has(e.id)) continue;
        if (e.parentId === rootId || (e.parentId && ids.has(e.parentId)) ||
            (e.boundaryHostId && (e.boundaryHostId === rootId || ids.has(e.boundaryHostId)))) {
          ids.add(e.id);
          added = true;
        }
      }
    }
    return ids;
  }

  function shiftSubtree(rootId: string, dy: number) {
    for (const id of collectSubtreeIds(rootId)) {
      const el = elements.find(e => e.id === id);
      if (el) el.y += dy;
    }
  }

  // Re-fit every lane to enclose its (post-Y-adjustment) children, then
  // re-stack the lanes contiguously starting at pool.y. Run AFTER all the
  // gateway-Y passes (R3.09 / R55 / R8.01) and R57, so cross-lane decision
  // gateways and pulled-up predecessors don't leave their parent lane —
  // logical containment (parentId) and visual containment (geometric bounds)
  // stay aligned, which kills the "lane does not fully contain child"
  // warnings the scanner reports. Floats (annotations, groups) are excluded
  // from the bounds check so a stray annotation can't bloat a lane.
  function fitLanesToChildren() {
    // Float types never belong in a lane's bounds; neither do gateways or
    // events. BPMN lanes represent PERFORMERS — only activities (tasks /
    // subprocesses) need to fit inside their lane, so gateways and events
    // are free to ride a cross-lane midpoint (R8.01) without forcing the
    // lane to stretch around them.
    const NON_LANE_BOUND = new Set([
      "text-annotation", "group",
      "gateway",
      "start-event", "intermediate-event", "end-event",
    ]);
    const PAD = 10;
    for (const pool of elements.filter(e => e.type === "pool")) {
      const lanes = elements.filter(e => e.type === "lane" && e.parentId === pool.id).sort((a, b) => a.y - b.y);
      if (lanes.length === 0) continue;
      // 1. Grow each lane to cover its descendants (top + bottom). Growing
      //    upward keeps children at their current y (lane expands around them);
      //    re-stack in step 2 normalises the lane.y to pool.y and moves
      //    children with it.
      for (const lane of lanes) {
        const kidIds = collectSubtreeIds(lane.id);
        let minY = Infinity, maxY = -Infinity;
        for (const id of kidIds) {
          const el = elements.find(e => e.id === id);
          if (!el || NON_LANE_BOUND.has(el.type)) continue;
          minY = Math.min(minY, el.y);
          maxY = Math.max(maxY, el.y + el.height);
        }
        if (!isFinite(minY)) continue;
        const neededTop = minY - PAD;
        const neededBot = maxY + PAD;
        if (neededTop < lane.y) {
          const grow = lane.y - neededTop;
          lane.y -= grow;
          lane.height += grow;
        }
        if (neededBot > lane.y + lane.height) {
          lane.height = neededBot - lane.y;
        }
      }
      // 2. Re-stack contiguously from pool.y, carrying each lane's subtree.
      let stackY = pool.y;
      for (const lane of lanes) {
        const dy = stackY - lane.y;
        if (dy !== 0) {
          lane.y = stackY;
          shiftSubtree(lane.id, dy);
        }
        stackY += lane.height;
      }
      pool.height = lanes.reduce((s, l) => s + l.height, 0);
      // 3. Match lane x/width to the pool's (R57 may have moved/widened it).
      for (const lane of lanes) {
        lane.x = pool.x + POOL_HEADER_W;
        lane.width = pool.width - POOL_HEADER_W;
      }
    }
  }

  // ── R6.05: Grow pools and lanes to contain all their elements ──
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
        // Stack lanes contiguously starting at pool.y. When an earlier lane
        // grew (e.g. to fit a tall expanded subprocess), every later lane
        // shifts down — and its CONTENTS must ride with it. Moving only
        // lane.y left the children behind in the lane above, so a whole
        // lane's worth of tasks/events rendered hundreds of px outside (and
        // above) their own lane band.
        let stackY = container.y;
        for (const lane of directLanes) {
          const dy = stackY - lane.y;
          if (dy !== 0) {
            lane.y = stackY;
            shiftSubtree(lane.id, dy);
          }
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

  // ── Ensure every expanded subprocess encloses its own children ──
  // The parentSubprocess-based sizing above sizes each EP for the children
  // it places, but in an order where an OUTER EP can be measured BEFORE an
  // inner EP grows — leaving the outer too small to contain the inner EP and
  // its contents. (Any EP whose children carry only parentId, not
  // parentSubprocess, is never sized at all.) Mirror the move-time enclose
  // (ensureContainersEncloseChildren) using parentId so a freshly generated
  // EP looks identical to one the user has nudged. Deepest-first: inner EPs
  // settle before their outer EP measures them. Artifacts (data objects /
  // stores / annotations) and the EP's own boundary events are inert and
  // never force growth — matching the move-time rule exactly.
  {
    const EP_ARTIFACT_TYPES = new Set(["data-object", "data-store", "text-annotation"]);
    const SIDE_PAD = 24;   // left / right / bottom breathing room
    const TOP_PAD = 34;    // extra room at the top for the EP label
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const depthOf = (start: typeof elements[number]) => {
      let d = 0;
      let cur: typeof elements[number] | undefined = start;
      while (cur?.parentId) { d++; cur = elements.find(e => e.id === cur!.parentId); if (d > 12) break; }
      return d;
    };
    const eps = elements
      .filter(e => e.type === "subprocess-expanded")
      .sort((a, b) => depthOf(b) - depthOf(a));
    for (const ep of eps) {
      const kids = elements.filter(c =>
        c.parentId === ep.id &&
        !EP_ARTIFACT_TYPES.has(c.type) &&
        c.boundaryHostId !== ep.id);
      if (kids.length === 0) continue;
      // Tighten the EP to a snug box around its real children — uniform pad on
      // all sides (extra at the top for the label). This both REMOVES large
      // empty gaps (notably the top) and GROWS to enclose a nested inner EP,
      // replacing the previous grow-only logic that left the original slack.
      const minX = Math.min(...kids.map(c => c.x));
      const minY = Math.min(...kids.map(c => c.y));
      const maxX = Math.max(...kids.map(c => c.x + c.width));
      const maxY = Math.max(...kids.map(c => c.y + c.height));
      const nx = minX - SIDE_PAD;
      const ny = minY - TOP_PAD;
      const nw = (maxX + SIDE_PAD) - nx;
      const nh = (maxY + SIDE_PAD) - ny;
      ep.x = nx; ep.y = ny; ep.width = nw; ep.height = nh;

      // Re-snap this EP's edge-mounted boundary events back onto the new rim
      // (they'd otherwise float off the old, larger box edges).
      for (const be of elements) {
        if (be.boundaryHostId !== ep.id) continue;
        const cx = be.x + be.width / 2, cy = be.y + be.height / 2;
        const dl = Math.abs(cx - nx), dr = Math.abs(nx + nw - cx);
        const dt = Math.abs(cy - ny), db = Math.abs(ny + nh - cy);
        const m = Math.min(dl, dr, dt, db);
        let px: number, py: number;
        if (m === dl)      { px = nx;      py = clamp(cy, ny, ny + nh); }
        else if (m === dr) { px = nx + nw; py = clamp(cy, ny, ny + nh); }
        else if (m === dt) { px = clamp(cx, nx, nx + nw); py = ny; }
        else               { px = clamp(cx, nx, nx + nw); py = ny + nh; }
        be.x = px - be.width / 2; be.y = py - be.height / 2;
      }

      // Conservative de-overlap: if the (possibly grown) EP now overlaps a
      // DOWNSTREAM sibling in the same lane/pool, push that sibling just past
      // the EP's right edge — same right-shift strategy the initial EP sizing
      // uses. Only siblings whose centre is right of the EP centre move, so
      // upstream elements are never disturbed.
      const epCx = nx + nw / 2;
      for (const sib of elements) {
        if (sib.id === ep.id || sib.parentId !== ep.parentId) continue;
        if (sib.type === "lane" || sib.type === "sublane" || sib.type === "pool") continue;
        if (EP_ARTIFACT_TYPES.has(sib.type) || sib.boundaryHostId) continue;
        // Only push a LEAF sibling — one that has no children of its own and no
        // boundary events mounted on it — so a simple x-shift can't orphan a
        // container's contents or leave a host's events behind.
        const hasChildren = elements.some(e => e.parentId === sib.id || e.boundaryHostId === sib.id);
        if (hasChildren) continue;
        const oX = Math.min(sib.x + sib.width, nx + nw) - Math.max(sib.x, nx);
        const oY = Math.min(sib.y + sib.height, ny + nh) - Math.max(sib.y, ny);
        if (oX > 0 && oY > 0 && (sib.x + sib.width / 2) >= epCx) {
          sib.x = nx + nw + 30;
        }
      }
    }
  }

  // ── R8.17: Separate any leaf elements that landed on top of one another ──
  // Sibling branch terminals can collapse onto the same (x,y) when their row/Y
  // assignment coincides (the "Cause A" defect). Push the lower-priority of
  // each near-coincident pair straight down (carrying its subtree) until it
  // clears; the lane/pool-fit passes below then grow the container to make
  // room, and connectors route around the new positions. Conservative by
  // design — only acts on SUBSTANTIAL overlap (>50% of the smaller element on
  // BOTH axes) so normally-spaced layouts are never disturbed.
  {
    const OVERLAP_LEAF = new Set<string>([
      "task", "subprocess", "start-event", "end-event",
      "intermediate-event", "gateway", "data-object", "data-store",
    ]);
    const byIdDO = new Map(elements.map((e) => [e.id, e]));
    const ancestorOf = (anc: DiagramElement, node: DiagramElement): boolean => {
      let cur: DiagramElement | undefined = node;
      for (let i = 0; i < 32 && cur; i++) {
        const nid = cur.boundaryHostId ?? cur.parentId;
        if (!nid) return false;
        if (nid === anc.id) return true;
        cur = byIdDO.get(nid);
      }
      return false;
    };
    const leaves = elements.filter((e) => OVERLAP_LEAF.has(e.type));
    const GAP = 30;
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (let i = 0; i < leaves.length; i++) {
        for (let k = i + 1; k < leaves.length; k++) {
          const a = leaves[i], b = leaves[k];
          if (a.boundaryHostId === b.id || b.boundaryHostId === a.id) continue;
          if (ancestorOf(a, b) || ancestorOf(b, a)) continue;
          const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          if (ox <= 0 || oy <= 0) continue;
          const minW = Math.min(a.width, b.width), minH = Math.min(a.height, b.height);
          if (ox <= minW * 0.5 || oy <= minH * 0.5) continue; // only near-coincident
          // Yield the lower-priority element: the one further right (later in
          // flow); ties broken by the lower one, then by array order.
          let mover = b, anchor = a;
          if (a.x > b.x || (a.x === b.x && (a.y > b.y || (a.y === b.y && i > k)))) { mover = a; anchor = b; }
          const dy = (anchor.y + anchor.height + GAP) - mover.y;
          if (dy > 0) { shiftSubtree(mover.id, dy); moved = true; }
        }
      }
      if (!moved) break;
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

  // R8.03: Pools must never overlap. The expandContainerToFitChildren pass
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

    // Membership by parentId-chain, NOT Y-overlap. The Y-overlap method
    // mis-attributes a deeply nested lane / subprocess child to a SIBLING
    // pool whenever the white-box pool grew downward (via
    // expandContainerToFitChildren) into the bottom black-box pool's
    // initial Y range — the lane's centre Y can sit inside the black-box
    // pool's bounds even though structurally it belongs to the white box.
    // R8.03 would then shift it with the black-box pool to maintain
    // POOL_GAP, producing a gap between lanes and a lane sticking out
    // below its parent pool. (2026-05-18 regression.)
    const poolDescendants = new Map<string, DiagramElement[]>();
    for (const pool of sortedPools) poolDescendants.set(pool.id, []);
    const memo = new Map<string, string | null>(); // elementId → owningPoolId
    function findOwningPool(el: DiagramElement): string | null {
      if (el.type === "pool") return el.id;
      if (memo.has(el.id)) return memo.get(el.id)!;
      // Walk up the parentId chain, then check boundaryHost as fallback.
      let cur: DiagramElement | undefined = el;
      let guard = 0;
      while (cur && guard++ < 32) {
        if (cur.type === "pool") {
          memo.set(el.id, cur.id);
          return cur.id;
        }
        const parentRef: string | undefined = cur.parentId ?? cur.boundaryHostId;
        if (!parentRef) break;
        cur = elements.find(e => e.id === parentRef);
      }
      memo.set(el.id, null);
      return null;
    }
    for (const el of elements) {
      if (el.type === "pool") continue;
      const owner = findOwningPool(el);
      if (owner && poolDescendants.has(owner)) {
        poolDescendants.get(owner)!.push(el);
      }
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

  // ── Snap each generated text annotation next to its associated element ──
  // A text annotation otherwise keeps the default flow position it was given,
  // which can sit a long way from the element it documents. Place it just
  // ABOVE the associated element (centred, small gap); if that would escape
  // the top of its containing lane / pool, flip it directly BELOW instead.
  // The "_ai_gen_annotation" is positioned by R56 and left alone here. Runs
  // before connector waypoints are computed so the association routes short.
  {
    const ANNOT_GAP = 20;
    const containerOf = (el: DiagramElement): DiagramElement | null => {
      let cur: DiagramElement | undefined = el;
      let guard = 0;
      while (cur && guard++ < 32) {
        const parent: DiagramElement | undefined = cur.parentId ? elMap.get(cur.parentId) : undefined;
        if (!parent) break;
        if (parent.type === "lane" || parent.type === "pool" || parent.type === "subprocess-expanded") return parent;
        cur = parent;
      }
      return null;
    };
    for (const a of elements) {
      if (a.type !== "text-annotation" || a.id === "_ai_gen_annotation") continue;
      let target: DiagramElement | undefined;
      for (const c of aiConnections) {
        const other = c.sourceId === a.id ? c.targetId : c.targetId === a.id ? c.sourceId : null;
        if (!other) continue;
        const t = elMap.get(other);
        if (t && t.type !== "text-annotation") { target = t; break; }
      }
      if (!target) continue;
      a.x = target.x + target.width / 2 - a.width / 2;
      let ay = target.y - a.height - ANNOT_GAP;          // prefer above
      const container = containerOf(target);
      if (container && ay < container.y + 4) {
        ay = target.y + target.height + ANNOT_GAP;       // would escape the top → flip below
      }
      a.y = ay;
    }
  }

  // Helper: check if element is a gateway
  const isGateway = (el: DiagramElement) => el.type === "gateway";

  // Gateway classification — strict topology test per AI layout rules R6.14/R6.15:
  //   Decision: exactly one (or zero) sequence inputs, two or more sequence outputs.
  //   Merge:    two or more sequence inputs, exactly one (or zero) sequence outputs.
  //   Neither:  falls through to default wiring.
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();
  // Ordered per-gateway connector lists (sequence flows only) — preserve the
  // AI's ordering so wiring (R6.16/R6.17) is deterministic across re-layouts.
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

  // R6.14/R6.15: patch classified gateways' properties so rendering and downstream
  // checks (e.g. Canvas.tsx gatewayRole reads) see the correct role. We only
  // OVERRIDE gatewayType when it's unset or "exclusive" default from the AI —
  // if the user / AI explicitly set a specific marker (parallel, inclusive),
  // preserve it since that's a deliberate semantic choice.
  // R6.22: decision-gateway labels are placed upper-left of the gateway diamond
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
      // R6.23: an EXCLUSIVE decision gateway without a label gets a default
      // "Decision?" so the diagram asks a clear question at the branch point.
      // Event-based gateways (R6.18) are NOT questions — they route to
      // whichever enumerated event fires first — so they stay unlabelled;
      // the pentagon marker is self-explanatory. Parallel / inclusive
      // gateways aren't questions either, so the default is exclusive-only.
      if ((t === "exclusive" || t === "none") && (!el.label || !el.label.trim())) el.label = "Decision?";
      if (t === "exclusive" || t === "none") {
        el.properties = { ...el.properties, gatewayType: "none", gatewayRole: "decision", ...decisionLabelPlacement };
        el.gatewayType = "none";
      } else {
        el.properties = { ...el.properties, gatewayRole: "decision", ...decisionLabelPlacement };
      }
    } else if (isMergeGateway(el)) {
      const t = (el.properties.gatewayType as string | undefined) ?? el.gatewayType ?? "exclusive";
      // R5.09: merge-gateway labels are placed top-left of the diamond too (when
      // the gateway actually carries a label) — same as decision gateways.
      const mergePlacement = el.label && el.label.trim() ? decisionLabelPlacement : {};
      if (t === "exclusive" || t === "none") {
        el.properties = { ...el.properties, gatewayType: "none", gatewayRole: "merge", ...mergePlacement };
        el.gatewayType = "none";
      } else {
        el.properties = { ...el.properties, gatewayRole: "merge", ...mergePlacement };
      }
    }
  }

  // R3.09: Nested decision-gateway Y alignment. A decision gateway should sit
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
    // decision's actual Y. Uses the same formula as R3.10 (n ≤ 2 symmetric,
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

  // R8.01: Decision/merge gateway pairs sit at the Y midpoint of the FIRST
  // following Task / Subprocess of each outgoing branch, irrespective of
  // which lanes those branches enter. R3.09 above aligns the decision to
  // its immediate predecessor's Y — that's a sensible default when both
  // branches stay in one lane, but biases the diamond toward the
  // incoming-flow lane when branches diverge across lanes. R8.01 overrides
  // that with the branch midpoint so the gateway band reads as a clean
  // horizontal split-and-rejoin across the spanned lanes.
  //
  // Only fires when at least one branch's first-following task/subprocess
  // sits in a different lane from the decision gateway itself — i.e.
  // when there's a real cross-lane spread to centre on. Within-lane
  // decisions keep R3.09/R55's predecessor-anchored Y.
  for (const dec of decisionElsSorted) {
    const outConns = outgoing.get(dec.id) ?? [];
    if (outConns.length < 2) continue;

    // First task/subprocess on each branch — BFS forward from each
    // outgoing target until we hit a non-gateway, non-event element
    // (skip over intermediate gateways that would otherwise distort
    // the midpoint with their own Y).
    const branchAnchorYs: number[] = [];
    const branchParentIds = new Set<string | undefined>();
    for (const outConn of outConns) {
      const visited = new Set<string>();
      const queue: string[] = [outConn.targetId];
      let anchor: DiagramElement | undefined;
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        const el = elMap.get(cur);
        if (!el) continue;
        if (el.type === "task" || el.type === "subprocess" || el.type === "subprocess-expanded") {
          anchor = el;
          break;
        }
        // Skip through gateways / events; collect their successors.
        for (const c of outgoing.get(cur) ?? []) queue.push(c.targetId);
      }
      if (anchor) {
        branchAnchorYs.push(anchor.y + anchor.height / 2);
        branchParentIds.add(anchor.parentId);
      }
    }

    // Only re-centre when branches genuinely span multiple lanes —
    // otherwise R3.09's predecessor anchor reads better. Require ≥ 2
    // anchors found, and at least one anchor in a different parent
    // from the decision (so we know lanes are actually spanned).
    if (branchAnchorYs.length < 2) continue;
    const spansMultipleParents =
      branchParentIds.size > 1 || (branchParentIds.size === 1 && !branchParentIds.has(dec.parentId));
    if (!spansMultipleParents) continue;

    const midY = branchAnchorYs.reduce((s, y) => s + y, 0) / branchAnchorYs.length;
    dec.y = midY - dec.height / 2;
    const mergeId = findPairedMerge(dec.id);
    if (mergeId) {
      const merge = elMap.get(mergeId);
      if (merge) merge.y = midY - merge.height / 2;
    }
  }

  // R8.02: Auto-position Data Objects relative to their associated element.
  // A connector from data-object → element (data is the source, element
  // is the target) means the data is an INPUT to the element — placed
  // upper-left (preferred) or lower-left of the element. A connector
  // from element → data-object means OUTPUT — placed upper-right or
  // lower-right. We also stamp data.properties.role = "input"|"output"
  // so the rendering matches the placement.
  //
  // Pre-existing parentId is preserved (data inherits the associated
  // element's lane parent so R57 below grows the lane to accommodate
  // the data object's new bounds).
  const DATA_GAP = 30; // horizontal gap between data and element
  const DATA_VGAP = 20; // vertical gap when above/below the element
  // Track occupied quadrants per associated element so two data objects
  // sharing the same task don't stack on top of each other.
  const usedQuadrants = new Map<string, Set<"UL" | "LL" | "UR" | "LR">>();
  for (const el of elements) {
    if (el.type !== "data-object") continue;
    // Find the FIRST associationBPMN-eligible connector touching this
    // data object. aiConnections is the AI's intent; we look at both
    // directions to determine input vs output.
    const conn = aiConnections.find(
      (c) =>
        (c.sourceId === el.id || c.targetId === el.id) &&
        c.type !== "message" &&
        c.type !== "sequence",
    );
    if (!conn) continue;
    const isOutput = conn.sourceId !== el.id; // element → data → output
    const associatedId = isOutput ? conn.sourceId : conn.targetId;
    const associated = elMap.get(associatedId);
    if (!associated) continue;
    // Stamp the role property so rendering reflects placement.
    el.properties = { ...el.properties, role: isOutput ? "output" : "input" };
    // Inherit parentId from the associated element so the lane/pool
    // grows to fit the data object via R57.
    if (associated.parentId) el.parentId = associated.parentId;

    // Choose quadrant: upper first, fall back to lower if upper is
    // already taken for this element.
    const used = usedQuadrants.get(associatedId) ?? new Set();
    const upper = isOutput ? "UR" as const : "UL" as const;
    const lower = isOutput ? "LR" as const : "LL" as const;
    const pick = used.has(upper) ? lower : upper;
    used.add(pick);
    usedQuadrants.set(associatedId, used);

    if (pick === "UL") {
      el.x = associated.x - el.width - DATA_GAP;
      el.y = associated.y - el.height - DATA_VGAP;
    } else if (pick === "LL") {
      el.x = associated.x - el.width - DATA_GAP;
      el.y = associated.y + associated.height + DATA_VGAP;
    } else if (pick === "UR") {
      el.x = associated.x + associated.width + DATA_GAP;
      el.y = associated.y - el.height - DATA_VGAP;
    } else {
      el.x = associated.x + associated.width + DATA_GAP;
      el.y = associated.y + associated.height + DATA_VGAP;
    }
  }

  // R8.03: Auto-position Data Stores near the elements they're connected
  // to. Different geometry from R8.02 because data stores frequently
  // serve multiple consumers — single-link case centres them
  // above (preferred) or below the associated element; multi-link case
  // centres them at the horizontal centroid of all associated elements
  // and offsets vertically out of the way of the sequence connectors
  // flowing horizontally between those elements.
  //
  // Above-vs-below preference: above unless the associated element(s)
  // sit near the top of their parent's content area (which would push
  // the data store outside the lane on the top side); in that case
  // fall back to below. The lane growth pass (R57) below handles
  // either direction.
  const DATA_STORE_VGAP = 40;
  for (const el of elements) {
    if (el.type !== "data-store") continue;
    // Find every association touching this data store.
    const conns = aiConnections.filter(
      (c) =>
        (c.sourceId === el.id || c.targetId === el.id) &&
        c.type !== "message" &&
        c.type !== "sequence",
    );
    if (conns.length === 0) continue;

    const associatedIds = conns.map((c) => (c.sourceId === el.id ? c.targetId : c.sourceId));
    const associated = associatedIds
      .map((id) => elMap.get(id))
      .filter((x): x is DiagramElement => !!x);
    if (associated.length === 0) continue;

    // Inherit parentId from the first associated element (most are
    // expected to share a lane; if they don't, the data store still
    // logically belongs with the first one for lane-grow purposes).
    if (associated[0].parentId) el.parentId = associated[0].parentId;

    // Horizontal centroid of associated elements' centres.
    const centroidX =
      associated.reduce((s, a) => s + a.x + a.width / 2, 0) / associated.length;

    // Vertical position — above (preferred) or below the row.
    const minTop = Math.min(...associated.map((a) => a.y));
    const maxBottom = Math.max(...associated.map((a) => a.y + a.height));
    const aboveY = minTop - el.height - DATA_STORE_VGAP;
    const belowY = maxBottom + DATA_STORE_VGAP;

    // Pick above unless it would land above the parent's top edge with
    // less than 10px of breathing room — then prefer below. Lanes / pools
    // can still grow via R57 to accommodate either choice; this just
    // avoids the visual surprise of a data store hovering well above its
    // pool when an equally good slot exists below.
    let chosenY = aboveY;
    const parent = el.parentId ? elMap.get(el.parentId) : undefined;
    if (parent && aboveY < parent.y + 10) chosenY = belowY;

    el.x = centroidX - el.width / 2;
    el.y = chosenY;
  }

  // R57: pools must enclose every non-annotation, non-group element that
  // belongs to them. R3.09/R55 can push a deeply-nested decision branch
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
    // R57 just grew white-box pools left/right to contain stray descendants.
    // Black-box pools have no descendants so they didn't grow with them —
    // re-sync widths so every pool's left and right edges line up again
    // (the same invariant the post-expandContainerToFitChildren pass at
    // line ~943 establishes, but for the new max width).
    {
      const allPoolsForSync = elements.filter(e => e.type === "pool");
      const whiteBoxPoolEls = allPoolsForSync.filter(
        p => ((p.properties.poolType as string | undefined) ?? "white-box") === "white-box"
      );
      if (whiteBoxPoolEls.length > 0) {
        const minX = Math.min(...whiteBoxPoolEls.map(p => p.x));
        const maxRight = Math.max(...whiteBoxPoolEls.map(p => p.x + p.width));
        const targetWidth = maxRight - minX;
        for (const bb of allPoolsForSync) {
          if ((bb.properties.poolType as string | undefined) === "black-box") {
            bb.x = minX;
            bb.width = targetWidth;
          }
        }
      }
    }
    // R8.03 again — pool growth may have introduced overlaps between pools.
    restackPoolsR52();
  }

  // Final lane fit — make every lane visually contain its (now-finalised)
  // children. Cross-lane decision gateways (R8.01) and predecessor-aligned
  // decisions (R3.09) can otherwise leave their assigned lane's vertical
  // band, producing "element outside its lane" warnings even though the
  // parentId is correct. After this pass, logical == visual containment.
  fitLanesToChildren();
  // Lane growth may have changed pool heights; re-stack pools so they
  // don't overlap.
  restackPoolsR52();

  // Build the ordered lists for the wiring pass (R6.16/R6.17).
  //   Decision outgoings: sorted by target element vertical position — topmost
  //                       target exits at "top", bottommost at "bottom", any
  //                       middles exit at "right" (mirrors R6.19 for merges).
  //                       This prevents branch connectors from criss-crossing
  //                       when the AI's emission order differs from the
  //                       physical lane/row order of the branch targets.
  //   Merge incomings:    sorted by source element vertical position so the
  //                       topmost source enters at "top", bottommost at "bottom",
  //                       and any middle sources enter at "left" (R6.19).
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

  // ── R6.08/R6.09: Auto-connect boundary start/end events to nearest internal task/subprocess ──
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
    // (R7.03: connectors to/from event subs are forbidden, so the auto-
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

  // R8.01 (boundary Y-alignment): for boundary Start/End events on outer
  // subs that contain embedded event subs, re-set the event's Y to the
  // centre Y of the task/subprocess it connects to (explicit plan
  // connector or R6.08/R6.09 auto-connect). Runs AFTER auto-connect so the
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
  // ── Wrap each EP box around its contents (BEFORE routing) ──
  // Every element now has its final position, but an earlier parallel-branch /
  // lane pass positioned each EP's box to line up with its incoming sequence
  // connector — independently of where its contents landed — so the box floats
  // off its own row. The children are the source of truth: tighten each EP box
  // to hug its children (uniform pad, extra at the top for the label),
  // deepest-first, re-snap its boundary events, and grow ancestor lanes/pools
  // so the box stays enclosed. Connectors are routed AFTER this, so they go
  // straight to the corrected boxes — no re-routing ("place EPs + contents,
  // then connect").
  {
    const EP_ARTIFACT = new Set(["data-object", "data-store", "text-annotation"]);
    const SIDE_PAD = 30, TOP_PAD = 36;
    const clampW = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const depthOf3 = (start: DiagramElement) => {
      let d = 0; let cur: DiagramElement | undefined = start;
      while (cur?.parentId) { d++; cur = elements.find(e => e.id === cur!.parentId); if (d > 12) break; }
      return d;
    };
    const eps = elements
      .filter(e => e.type === "subprocess-expanded")
      .sort((a, b) => depthOf3(b) - depthOf3(a)); // inner first
    for (const ep of eps) {
      const kids = elements.filter(c =>
        c.parentId === ep.id && !EP_ARTIFACT.has(c.type) && c.boundaryHostId !== ep.id);
      if (kids.length === 0) continue;
      const minX = Math.min(...kids.map(c => c.x));
      const minY = Math.min(...kids.map(c => c.y));
      const maxX = Math.max(...kids.map(c => c.x + c.width));
      const maxY = Math.max(...kids.map(c => c.y + c.height));
      const nx = minX - SIDE_PAD, ny = minY - TOP_PAD;
      const nw = (maxX + SIDE_PAD) - nx, nh = (maxY + SIDE_PAD) - ny;
      if (Math.abs(nx - ep.x) <= 0.5 && Math.abs(ny - ep.y) <= 0.5
        && Math.abs(nw - ep.width) <= 0.5 && Math.abs(nh - ep.height) <= 0.5) continue;
      ep.x = nx; ep.y = ny; ep.width = nw; ep.height = nh;
      // Re-snap edge-mounted boundary events onto the new rim.
      for (const be of elements) {
        if (be.boundaryHostId !== ep.id) continue;
        const cx = be.x + be.width / 2, cy = be.y + be.height / 2;
        const dl = Math.abs(cx - nx), dr = Math.abs(nx + nw - cx);
        const dt = Math.abs(cy - ny), db = Math.abs(ny + nh - cy);
        const m = Math.min(dl, dr, dt, db);
        let px: number, py: number;
        if (m === dl)      { px = nx;      py = clampW(cy, ny, ny + nh); }
        else if (m === dr) { px = nx + nw; py = clampW(cy, ny, ny + nh); }
        else if (m === dt) { px = clampW(cx, nx, nx + nw); py = ny; }
        else               { px = clampW(cx, nx, nx + nw); py = ny + nh; }
        be.x = px - be.width / 2; be.y = py - be.height / 2;
      }
      // Keep ancestor lanes / pools enclosing the re-wrapped box (right/bottom).
      let cur: DiagramElement | undefined = ep.parentId ? elements.find(e => e.id === ep.parentId) : undefined;
      let guard = 0;
      while (cur && guard++ < 16) {
        if (cur.type === "lane" || cur.type === "sublane" || cur.type === "pool" || cur.type === "subprocess-expanded") {
          const needR = ep.x + ep.width + 20 - cur.x;
          const needB = ep.y + ep.height + 20 - cur.y;
          if (needR > cur.width)  cur.width = needR;
          if (needB > cur.height) cur.height = needB;
        }
        cur = cur.parentId ? elements.find(e => e.id === cur!.parentId) : undefined;
      }
    }
  }

  // ── R6.25: a merge/join gateway sits to the RIGHT of every element feeding it ──
  // After EP wrapping, a wide parallel branch (e.g. an EP) can extend past the
  // merge gateway's column, stranding the merge inside / left of a branch. Move
  // each merge (a gateway that is the target of ≥2 sequence flows) to the right
  // of its rightmost source, then shift the merge AND everything downstream of
  // it (forward-reachable, with descendants + boundary events) by the same delta
  // so its outgoing flow and successors follow. Sources are upstream, so they're
  // never moved. Runs before routing, so connectors are drawn to the final spot.
  {
    const R625_GAP = 60;
    const pushArr = (m: Map<string, string[]>, k: string, v: string) => {
      const a = m.get(k); if (a) a.push(v); else m.set(k, [v]);
    };
    const incoming = new Map<string, string[]>();
    const outById = new Map<string, string[]>();
    for (const c of [...aiConnections, ...autoConns]) {
      if (c.type === "message") continue;
      pushArr(incoming, c.targetId, c.sourceId);
      pushArr(outById, c.sourceId, c.targetId);
    }
    const elById = new Map(elements.map(e => [e.id, e]));
    const kidsByParent = new Map<string, DiagramElement[]>();
    for (const e of elements) { if (e.parentId) pushArr2(kidsByParent, e.parentId, e); }
    function pushArr2(m: Map<string, DiagramElement[]>, k: string, v: DiagramElement) {
      const a = m.get(k); if (a) a.push(v); else m.set(k, [v]);
    }
    const descendantsOf = (rootId: string): string[] => {
      const out: string[] = []; const stack = [rootId];
      while (stack.length) { const cur = stack.pop()!; for (const k of kidsByParent.get(cur) ?? []) { out.push(k.id); stack.push(k.id); } }
      return out;
    };
    // Merges processed left-to-right so a cascade settles in one pass.
    const merges = elements
      .filter(e => e.type === "gateway"
        && (incoming.get(e.id)?.length ?? 0) >= 2
        // Skip gateways INSIDE an EP — the single-row EP layout already places
        // them, and moving one would break the EP's wrap.
        && elById.get(e.parentId ?? "")?.type !== "subprocess-expanded")
      .sort((a, b) => a.x - b.x);
    // Move a whole element + its descendants + boundary events by (dx, dy).
    const shiftBy = (rootId: string, dx: number, dy: number) => {
      const set = new Set<string>([rootId, ...descendantsOf(rootId)]);
      for (const e of elements) if (e.boundaryHostId && set.has(e.boundaryHostId)) set.add(e.id);
      for (const e of elements) if (set.has(e.id)) { e.x += dx; e.y += dy; }
    };
    for (const g of merges) {
      let maxRight = -Infinity;
      for (const sid of incoming.get(g.id) ?? []) {
        const s = elById.get(sid);
        if (s) maxRight = Math.max(maxRight, s.x + s.width);
      }
      if (isFinite(maxRight)) {
        const delta = (maxRight + R625_GAP) - g.x;
        if (delta > 0.5) {
          // Shift the merge + everything downstream of it (forward-reachable).
          const shiftSet = new Set<string>();
          const stack = [g.id];
          while (stack.length) {
            const n = stack.pop()!;
            if (shiftSet.has(n)) continue;
            shiftSet.add(n);
            for (const t of outById.get(n) ?? []) stack.push(t);
          }
          for (const id of [...shiftSet]) for (const d of descendantsOf(id)) shiftSet.add(d);
          for (const e of elements) if (e.boundaryHostId && shiftSet.has(e.boundaryHostId)) shiftSet.add(e.id);
          for (const e of elements) if (shiftSet.has(e.id)) e.x += delta;
        }
      }
      // Align the post-merge flow to the merge's Y so the exit is a straight
      // line, AND pull it back to normal spacing in X. The column layout placed
      // the merge's successor far to the right (the gap survives R6.25's shift),
      // leaving a very long merge → end-event connector. Walk the single-in /
      // single-out chain after the merge: pull each element onto the merge's
      // centre Y and snug it up to normal spacing after its predecessor (X is
      // only ever pulled LEFT, never pushed right). Stop at the next join /
      // branch / lane change. The pool-tighten pass below then reclaims the
      // freed width.
      const POST_MERGE_GAP = 90;   // edge gap merge→successor (≈ normal flow)
      const mergeCy = g.y + g.height / 2;
      const seenY = new Set<string>([g.id]);
      let prevRight = g.x + g.width;
      let curId: string | undefined = (() => { const o = outById.get(g.id) ?? []; return o.length === 1 ? o[0] : undefined; })();
      while (curId && !seenY.has(curId)) {
        seenY.add(curId);
        if ((incoming.get(curId)?.length ?? 0) !== 1) break;     // a join — leave it
        const el = elById.get(curId);
        if (!el || el.parentId !== g.parentId) break;             // changed lane/container
        const dy = mergeCy - (el.y + el.height / 2);
        const targetX = prevRight + POST_MERGE_GAP;
        const dx = el.x > targetX + 0.5 ? targetX - el.x : 0;    // only snug leftwards
        if (Math.abs(dy) > 0.5 || dx !== 0) shiftBy(el.id, dx, dy);
        prevRight = el.x + el.width;
        const o = outById.get(curId) ?? [];
        curId = o.length === 1 ? o[0] : undefined;
      }
    }
    // Grow lanes / pools to cover any element pushed past their right edge.
    const rightOfDescendants = (cont: DiagramElement): number => {
      let r = cont.x + 50;
      for (const e of elements) {
        let p: string | undefined = e.parentId, guard = 0;
        while (p && guard++ < 20) { if (p === cont.id) { r = Math.max(r, e.x + e.width); break; } p = elById.get(p)?.parentId; }
      }
      return r;
    };
    for (const cont of elements) {
      if (cont.type !== "lane" && cont.type !== "pool") continue;
      const need = rightOfDescendants(cont) - cont.x + 30;
      if (need > cont.width) cont.width = need;
    }
  }

  // ── R5.08 + pool over-width: every generated pool is the SAME width, tight to
  // content (left + right aligned) ──
  // Pool widths start from a generous column estimate and the enclose passes
  // only ever GROW, so a white-box pool can end up far wider than its content
  // (test 5: 526 px of empty pool past the last element). Set every top-level
  // pool to a single uniform width = rightmost content across ALL pools + pad,
  // all sharing the same left x. Runs before routing so messages attach to the
  // final edges (the message pass recomputes offsetAlong against the partner).
  {
    const POOL_PAD = 50;
    const topPools = elements.filter(e => e.type === "pool" && !e.parentId);
    if (topPools.length > 0) {
      const byId = new Map(elements.map(e => [e.id, e]));
      const descRight = (poolId: string): number => {
        let r = -Infinity;
        for (const e of elements) {
          if (e.type === "pool" || e.type === "lane") continue;
          let p: string | undefined = e.parentId, g = 0;
          while (p && g++ < 20) { if (p === poolId) { r = Math.max(r, e.x + e.width); break; } p = byId.get(p)?.parentId; }
        }
        return r;
      };
      let maxRight = -Infinity;
      for (const p of topPools) { const r = descRight(p.id); if (isFinite(r)) maxRight = Math.max(maxRight, r); }
      if (isFinite(maxRight)) {
        const leftX = Math.min(...topPools.map(p => p.x));
        const targetRight = maxRight + POOL_PAD;
        const syncLaneWidth = (parentId: string, innerLeft: number, innerWidth: number) => {
          for (const lane of elements.filter(e => (e.type === "lane" || e.type === "sublane") && e.parentId === parentId)) {
            lane.x = innerLeft;
            lane.width = innerWidth;
            syncLaneWidth(lane.id, innerLeft, innerWidth); // recurse into sub-lanes
          }
        };
        for (const p of topPools) {
          p.x = leftX;
          p.width = targetRight - leftX;
          syncLaneWidth(p.id, leftX + POOL_HEADER_W, p.width - POOL_HEADER_W);
        }
      }
    }
  }

  // R6.12/R7.03: Drop ANY connector (sequence OR message) that touches an Event
  // Expanded Subprocess. Event subs are triggered by events, not by any kind
  // of flow — the rule is broader than R6.12's original sequence-only scope.
  // Apply the filter AFTER merging autoConns so auto-generated connectors
  // can't bypass it.
  const finalConnections = [...aiConnections, ...autoConns].filter(c =>
    !(isEventSubElement(c.sourceId) || isEventSubElement(c.targetId))
  );

  // BPMN connector-type rules (the AI plan only knows "sequence" vs
  // "message" — we classify on the rendered geometry):
  //   • either endpoint is a data-store / data-object / text-annotation
  //     → associationBPMN (BPMN forbids sequence flow on data artifacts).
  //   • either endpoint is a pool, or the AI said "message" → messageBPMN.
  //   • everything else → sequence.
  // Direction on associations follows the AI's source/target ordering so
  // "task → data" stays as a write (arrow into the data element) and
  // "data → task" stays as a read (arrow out of the data element).
  const DATA_ASSOC_TYPES = new Set(["data-store", "data-object", "text-annotation"]);
  // R05.05: track each message label we place (centre x/y + width, keyed by
  // the black-box pool it sits on) so the next label on the same pool edge
  // can be staggered/flipped to avoid overlap. The connectors built here get
  // their waypoints in a LATER pass, so the previous overlap check (which
  // read pc.waypoints) never fired — we track placements ourselves instead.
  const msgLabelTrack: { bbpId: string; cx: number; cy: number; w: number }[] = [];
  for (const c of finalConnections) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;

    const isAssociation = DATA_ASSOC_TYPES.has(src.type) || DATA_ASSOC_TYPES.has(tgt.type);
    const isMessage = !isAssociation && (
      c.type === "message" ||
      src.type === "pool" || tgt.type === "pool"
    );

    let connType: string;
    let srcSide: string, tgtSide: string;
    let srcOffsetAlong: number | undefined;

    if (isAssociation) {
      connType = "associationBPMN";
      // Pick the two closest sides between the data element and its task
      // partner — associations are drawn straight ("direct" routing) so
      // we don't need rectilinear elbow logic. Use the centre-to-centre
      // angle to pick which side of each.
      const srcCx = src.x + src.width / 2;
      const tgtCx = tgt.x + tgt.width / 2;
      const srcCy = src.y + src.height / 2;
      const tgtCy = tgt.y + tgt.height / 2;
      const dx = tgtCx - srcCx;
      const dy = tgtCy - srcCy;
      if (Math.abs(dx) >= Math.abs(dy)) {
        srcSide = dx >= 0 ? "right" : "left";
        tgtSide = dx >= 0 ? "left" : "right";
      } else {
        srcSide = dy >= 0 ? "bottom" : "top";
        tgtSide = dy >= 0 ? "top" : "bottom";
      }
    } else if (isMessage) {
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

      // Gateway wiring (R6.16/R6.17/R6.19):
      //   Decision gateway: incoming → left; outgoing assigned by target
      //                     vertical position — topmost target → top,
      //                     bottommost target → bottom, any middles → right.
      //   Merge gateway:    outgoing → right; incoming assigned by source
      //                     vertical position — topmost source → top,
      //                     bottommost → bottom, any middles → left. R6.19.
      // Each end is resolved independently so decision-to-merge connectors
      // pick the correct side at BOTH ends.
      const srcIsDecision = isDecisionGateway(src);
      const tgtIsMerge    = isMergeGateway(tgt);
      const srcIsMerge    = isMergeGateway(src);    // merge's outgoing → right
      const tgtIsDecision = isDecisionGateway(tgt); // decision's incoming → left

      if (srcIsDecision || tgtIsMerge || srcIsMerge || tgtIsDecision) {
        if (srcIsDecision) {
          // R3.10 (decision side): idx 0 → top, idx 1 → right (when n ≥ 3),
          // idx ≥ 2 → bottom. For n=2 fall back to top/bottom.
          const list = decisionOutgoings.get(src.id) ?? [];
          const idx = list.indexOf(c);
          const n = list.length;
          if (idx < 0 || n <= 1) srcSide = "right";
          else if (n === 2) {
            // idx 0 = topmost target, idx 1 = bottommost — but only exit
            // top/bottom when the target is ACTUALLY above/below the gateway.
            // A target sitting level with the gateway (mainly to the side, e.g.
            // a compensation fan-out) exits "right" so the route doesn't jog
            // up/down INTO the target body (sequence-clips-own-endpoint).
            // Surfaced by the AI harness: book-trip-allornothing.
            srcSide = tgtCy < src.y - 10 ? "top"
              : tgtCy > src.y + src.height + 10 ? "bottom"
              : "right";
          }
          else if (idx === 0) srcSide = "top";
          else if (idx === 1) srcSide = "right";
          else srcSide = "bottom";
        } else if (srcIsMerge) {
          srcSide = "right";
        } else {
          srcSide = "right";
        }
        if (tgtIsMerge) {
          // R3.10 (merge side): mirror — idx 0 → top, idx 1 → left (when n ≥ 3),
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

    // R3.06: when source or target is an Event (start/end/intermediate), the
    // connector must attach on the side of the event FACING the other end
    // — so the line doesn't clip through the event's body. Skip boundary
    // intermediate events (R7.02 already handled those) and gateways (their
    // own rules R6.16/R6.17/R6.19/R3.10 dictate sides).
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
      // R6.18: a connector leaving an Event-based DECISION gateway must
      // enter its target event on the event's LEFT connection point —
      // never top/bottom — so every branch reads left-to-right out of
      // the gateway (the top/bottom branches route up/down then right
      // into the event's left side). Overrides the generic R3.06
      // sideFacing choice above, which would otherwise pick top/bottom
      // for the up/down branches.
      const srcGwType = (src.properties?.gatewayType as string | undefined) ?? src.gatewayType;
      if (isDecisionGateway(src) && srcGwType === "event-based"
          && EVENT_TYPES.has(tgt.type) && !tgt.boundaryHostId) {
        tgtSide = "left";
      }

      // R8.04 / R8.13 (loop-back routing): a right-to-left (rework / loop) edge
      // must never drag back ACROSS the forward flow on the left face — route it
      // AROUND, via the TOP or BOTTOM of BOTH ends. Prefer UNDER (bottom) so the
      // implied loop reads below the main path; switch to OVER (top) when the
      // target sits above the source, OR when a boundary event occupies the
      // bottom of either end (routing under would collide with it). Events keep
      // their own facing rule (assigned just above); skip them here.
      if (
        connType === "sequence" &&
        _tgtCx < _srcCx - 4 &&
        !EVENT_TYPES.has(src.type) && !EVENT_TYPES.has(tgt.type)
      ) {
        const boundaryOn = (host: DiagramElement, want: string) =>
          elements.some((e) => e.boundaryHostId === host.id
            && ((e.properties?.boundarySide as string | undefined)
                ?? (e as { boundarySide?: string }).boundarySide) === want);
        // A sibling flow-node stacked directly above/below an end (same column,
        // within a routing gap) blocks that vertical exit just as a boundary
        // event does: the top→top / bottom→bottom staple can't climb past it,
        // so it falls back to the generic router which clips the source body.
        // (Reproduced live by the AI conformance harness: rework-loop back-edge.)
        const STACK_GAP = 90;
        const stackedOn = (host: DiagramElement, want: "top" | "bottom") =>
          elements.some((e) => {
            if (e.id === src.id || e.id === tgt.id || e.id === host.id) return false;
            if (e.type === "pool" || e.type === "lane" || e.boundaryHostId) return false;
            if (!(e.x < host.x + host.width && e.x + e.width > host.x)) return false; // x-overlap
            return want === "top"
              ? e.y + e.height <= host.y && host.y - (e.y + e.height) < STACK_GAP
              : e.y >= host.y + host.height && e.y - (host.y + host.height) < STACK_GAP;
          });
        const bottomBlocked = boundaryOn(src, "bottom") || boundaryOn(tgt, "bottom")
          || stackedOn(src, "bottom") || stackedOn(tgt, "bottom");
        const topBlocked    = boundaryOn(src, "top")    || boundaryOn(tgt, "top")
          || stackedOn(src, "top")    || stackedOn(tgt, "top");
        // Force the clear side when exactly one is blocked; otherwise route by
        // vertical position (target above source → over) as before.
        const goOver = topBlocked && !bottomBlocked ? false
          : bottomBlocked && !topBlocked ? true
          : _tgtCy < _srcCy - 4;
        const side: "top" | "bottom" = goOver ? "top" : "bottom";
        srcSide = side;
        tgtSide = side;
      }
    }

    // R7.02: connectors from an edge-mounted intermediate event must exit
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
    //     from whichever face the connector exits (R6.20).
    //   - Message flow → position the label vertically in the GAP between
    //     source and target pools so it reads cleanly in the inter-pool
    //     space (R6.21). Offset relative to connector midpoint.
    //   - Other (sequence fallback) → minor offset above the line.
    let labelOffsetX: number | undefined;
    let labelOffsetY: number | undefined;
    let labelWidth: number | undefined;
    let labelAnchor: "source" | "target" | undefined;
    if (c.label) {
      if (isDecisionGateway(src)) {
        // R3.07: outgoing sequence connector labels from a decision gateway
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
            // R05.05: a message label sits in the GAP between the two pools,
            // CENTRED horizontally on its own (vertical) message connector —
            // never shoved off to the side. Where neighbouring connectors are
            // close enough that the labels would overlap, the label's text is
            // offset vertically in HALF-line-height steps (alternating above /
            // below the gap centre) so they interleave instead of stacking.
            const LINE_H = 14;             // single-line label height
            const W = 80;                  // label width
            const HALF = LINE_H / 2;       // the half-line vertical step
            // Anchor the label to the Black-Box Pool's GAP-FACING edge, half a
            // pool-gap into the gap — NOT to the midpoint between the two pool
            // edges. The other endpoint's pool may be far away (another pool
            // between them, or shifted by re-sizing), in which case a midpoint
            // lands inside an intervening pool. Anchoring to the BBP edge keeps
            // the label in the adjacent gap regardless. Mirrors the runtime
            // re-anchor in computeMsgBpmnLabelOffsets.
            const gapDir = otherEdgeY >= bbpEdgeY ? 1 : -1;
            const baseCentreY = bbpEdgeY + (POOL_GAP / 2) * gapDir;
            // Horizontally centred on the connector.
            labelOffsetX = 0;
            // Count labels already placed on this pool whose connector sits
            // within a label width of this one — only those can overlap.
            const xClose = msgLabelTrack.filter(l =>
              l.bbpId === bbpId && Math.abs(l.cx - midX) < W
            ).length;
            // tier 0 → -HALF, 1 → +HALF, 2 → -LINE_H, 3 → +LINE_H, …
            const dir = xClose % 2 === 0 ? -1 : 1;
            const mag = (Math.floor(xClose / 2) + 1) * HALF;
            // Keep the (staggered) label fully inside the adjacent gap so it
            // can never drift into either pool.
            const edgeNear = bbpEdgeY + HALF * gapDir;
            const edgeFar  = bbpEdgeY + (POOL_GAP - HALF) * gapDir;
            const lo = Math.min(edgeNear, edgeFar), hi = Math.max(edgeNear, edgeFar);
            const cy = Math.max(lo, Math.min(hi, baseCentreY + dir * mag));
            labelOffsetY = cy - midY - 7;
            msgLabelTrack.push({ bbpId, cx: midX, cy, w: W });
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

    // Per-type rendering defaults. Associations are drawn as straight
    // lines with an "open" arrowhead (the BPMN convention) and follow
    // the AI's source→target ordering — that ordering carries the read
    // vs write semantic the user drew in the source diagram.
    const directionTypeFinal: "directed" | "open-directed" =
      connType === "associationBPMN" ? "open-directed" : "directed";
    const routingTypeFinal: "rectilinear" | "direct" =
      connType === "associationBPMN" ? "direct" : "rectilinear";

    connectors.push({
      id: `conn-${c.sourceId}-${c.targetId}`,
      sourceId: c.sourceId,
      targetId: c.targetId,
      sourceSide: srcSide as Connector["sourceSide"],
      targetSide: tgtSide as Connector["targetSide"],
      type: connType as Connector["type"],
      directionType: directionTypeFinal,
      routingType: routingTypeFinal,
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

  // ── R5.06 / R5.07: message connection-point + label de-overlap ──
  // R5.06 — two or more message flows attaching to the SAME element on the same
  // side must not share a connection point: spread their attachment x's so
  // they're ≥10px apart (the classic case is one element that both SENDS and
  // RECEIVES a message — both would otherwise land on its centre). The vertical
  // message line is driven by the NON-pool endpoint's x, so we spread that
  // endpoint's offsetAlong and re-align the pool partner to match.
  // R5.07 — message labels that would stack at a similar x are offset vertically
  // in ½-label-height steps so they don't overlap.
  {
    const MIN_SEP = 24;   // ≥10px point separation, doubled (Paul)
    const LABEL_H = 22;   // per-tier vertical label stagger — clears the ~16-18px
                          // rendered message-label height with a small gap
    const msgs = connectors.filter(c => c.type === "messageBPMN");
    // The endpoint that drives the vertical line = the non-pool element.
    const anchorOf = (c: Connector) => {
      const s = elMap.get(c.sourceId), t = elMap.get(c.targetId);
      if (s && s.type !== "pool") return { elId: c.sourceId, side: c.sourceSide, isSource: true, el: s };
      if (t && t.type !== "pool") return { elId: c.targetId, side: c.targetSide, isSource: false, el: t };
      return null;
    };
    // R5.06
    const groups = new Map<string, { c: Connector; a: NonNullable<ReturnType<typeof anchorOf>> }[]>();
    for (const c of msgs) {
      const a = anchorOf(c);
      if (!a) continue;
      const k = `${a.elId}|${a.side}`;
      const g = groups.get(k); if (g) g.push({ c, a }); else groups.set(k, [{ c, a }]);
    }
    for (const grp of groups.values()) {
      if (grp.length < 2) continue;
      const el = grp[0].a.el;
      const stepFrac = MIN_SEP / Math.max(1, el.width);
      grp.forEach((g, i) => {
        const off = Math.max(0.08, Math.min(0.92, 0.5 + (i - (grp.length - 1) / 2) * stepFrac));
        const attachX = el.x + off * el.width;
        if (g.a.isSource) g.c.sourceOffsetAlong = off; else g.c.targetOffsetAlong = off;
        // Re-align the pool partner so its attachment sits at the same x.
        const partnerId = g.a.isSource ? g.c.targetId : g.c.sourceId;
        const partner = elMap.get(partnerId);
        if (partner && partner.type === "pool" && partner.width > 0) {
          const poolOff = Math.max(0.02, Math.min(0.98, (attachX - partner.x) / partner.width));
          if (g.a.isSource) g.c.targetOffsetAlong = poolOff; else g.c.sourceOffsetAlong = poolOff;
        }
      });
    }
    // R5.07 — vertically stagger message labels whose horizontal spans would
    // overlap. The label x ≈ its connector's attachment x; two labels overlap
    // when their x's are within LABEL_W of each other. Use a SLIDING-WINDOW
    // grouping (not fixed buckets — those split an overlapping pair that
    // straddles a boundary), then offset each member by a full label-height
    // step (alternating above / below) so the labels clear each other.
    const labelX = (c: Connector): number | null => {
      const a = anchorOf(c); if (!a) return null;
      const off = a.isSource ? (c.sourceOffsetAlong ?? 0.5) : (c.targetOffsetAlong ?? 0.5);
      return a.el.x + off * a.el.width;
    };
    const LABEL_W = 100;      // labels within this x distance can overlap
    const STEP = LABEL_H;     // per-tier vertical step (= a full label height)
    const labelled = msgs
      .filter(c => c.label && c.labelOffsetX !== undefined)
      .map(c => ({ c, x: labelX(c) }))
      .filter((o): o is { c: Connector; x: number } => o.x !== null)
      .sort((a, b) => a.x - b.x);
    const stagger = (grp: { c: Connector; x: number }[]) => {
      if (grp.length < 2) return;
      // ASSIGN a centred spread (don't ADD to each base): adding could overshoot
      // when the bases already differ and net a gap smaller than a label height,
      // leaving the labels overlapping. Centring on the group's mean base keeps
      // them in the inter-pool gap while guaranteeing a full STEP between rows.
      const baseY = grp.reduce((sum, o) => sum + (o.c.labelOffsetY ?? 0), 0) / grp.length;
      const n = grp.length;
      grp.forEach((o, i) => { o.c.labelOffsetY = baseY + (i - (n - 1) / 2) * STEP; });
    };
    let group: { c: Connector; x: number }[] = [];
    for (const o of labelled) {
      if (group.length === 0 || o.x - group[group.length - 1].x < LABEL_W) group.push(o);
      else { stagger(group); group = [o]; }
    }
    stagger(group);
  }

  // ── R8.11 / R8.12: sequence connection-point de-overlap ─────────────────────
  // SEQUENCE connectors that attach to the SAME element on the SAME side must
  // not share a connection point (R8.11), and must also stay ≥10px clear of any
  // MESSAGE point already on that side (R8.12). Spread the sequence attachment
  // offsets so every point is ≥10px from its neighbours; a lone sequence end
  // with nothing to clash with is left centred so straight flows stay straight.
  {
    const MIN_PX = 10;
    type SeqEnd = { c: Connector; isSource: boolean };
    const seqEnds = new Map<string, SeqEnd[]>();   // `elId|side` → sequence ends there
    const msgPts  = new Map<string, number[]>();   // `elId|side` → message offsets there
    const addSeq = (k: string, v: SeqEnd) => { const a = seqEnds.get(k); if (a) a.push(v); else seqEnds.set(k, [v]); };
    const addMsg = (k: string, v: number) => { const a = msgPts.get(k); if (a) a.push(v); else msgPts.set(k, [v]); };
    for (const c of connectors) {
      if (c.type === "sequence") {
        addSeq(`${c.sourceId}|${c.sourceSide}`, { c, isSource: true });
        addSeq(`${c.targetId}|${c.targetSide}`, { c, isSource: false });
      } else if (c.type === "messageBPMN") {
        addMsg(`${c.sourceId}|${c.sourceSide}`, c.sourceOffsetAlong ?? 0.5);
        addMsg(`${c.targetId}|${c.targetSide}`, c.targetOffsetAlong ?? 0.5);
      }
    }
    for (const [key, ends] of seqEnds) {
      const bar = key.indexOf("|");
      const el = elMap.get(key.slice(0, bar));
      const side = key.slice(bar + 1);
      if (!el) continue;
      const faceLen = (side === "top" || side === "bottom") ? el.width : el.height;
      if (faceLen <= 1) continue;
      const occupied = msgPts.get(key) ?? [];
      if (ends.length < 2 && occupied.length === 0) continue;   // nothing to separate
      const minFrac = MIN_PX / faceLen;
      const horiz = side === "top" || side === "bottom";
      // Order by the OTHER endpoint's position along the face, so the points run
      // in the same order as the elements they reach (no crossed connectors).
      const otherCoord = (e: SeqEnd) => {
        const o = elMap.get(e.isSource ? e.c.targetId : e.c.sourceId);
        if (!o) return 0;
        return horiz ? o.x + o.width / 2 : o.y + o.height / 2;
      };
      const sorted = [...ends].sort((a, b) => otherCoord(a) - otherCoord(b));
      const n = sorted.length;
      const stepFrac = Math.max(minFrac, n > 1 ? 1 / (n + 1) : 0);
      sorted.forEach((e, i) => {
        let off = 0.5 + (i - (n - 1) / 2) * stepFrac;
        for (const m of occupied) {   // keep ≥10px clear of message points (R8.12)
          if (Math.abs(off - m) < minFrac) off = off >= m ? m + minFrac : m - minFrac;
        }
        off = Math.max(0.1, Math.min(0.9, off));
        if (e.isSource) e.c.sourceOffsetAlong = off; else e.c.targetOffsetAlong = off;
      });
    }
  }

  // Re-tile lanes after the late EP-wrapping + merge passes. Those run AFTER the
  // earlier fitLanesToChildren and can GROW a lane (to enclose a re-wrapped EP)
  // without pushing the lanes below it down — leaving them overlapping. An
  // overlapping lane stack breaks the editor's boundary drag-handles (placed at
  // lane.y + lane.height) and scrambles the on-screen lane order, so re-stack the
  // lanes contiguously and re-stack the pools one final time. (Guarded by B35.)
  fitLanesToChildren();
  restackPoolsR52();

  // ── R8.14 / R8.15 / R8.18: Start & End event placement + connector length ──
  // Tighten the flow's two ends so the Start/End events hug their neighbours.
  //   R8.14 — the PROCESS-level Start (parent Pool/Lane, not an EP) clears its
  //           container's INNER boundary (past the lane/pool header strip) by
  //           ≥ 1 event width. The Start is moved right to that floor only.
  //   R8.15 — the first connector is ≤ 70% of a task width, shortened by moving
  //           the FIRST ELEMENT left toward the start. In the main pool just the
  //           first element (+ its own contents) moves; inside an EP the WHOLE
  //           inner flow slides left so the inner spacing stays uniform.
  //   R8.18 — the End event is pulled left to hug its last element by the same
  //           ≤ 70% gap, in both the main pool and inside EPs.
  {
    const byIdSE = new Map(elements.map((e) => [e.id, e]));
    const MAX_CONN = 0.7 * TASK_W; // 70px
    const shiftX = (ids: Iterable<string>, dx: number) => {
      for (const id of ids) { const e = byIdSE.get(id); if (e) e.x += dx; }
    };
    // An element's subtree PLUS any Data Object/Store associated with it (those
    // are parented to the lane, not the element, so they don't ride along on a
    // plain subtree shift — without this they'd be left behind, e.g. an input
    // data object would end up on top of / right of its moved element).
    const movableWith = (rootId: string): Set<string> => {
      const ids = new Set<string>([rootId, ...collectSubtreeIds(rootId)]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of connectors) {
          const oa = byIdSE.get(c.sourceId), ob = byIdSE.get(c.targetId);
          if (ids.has(c.sourceId) && ob && (ob.type === "data-object" || ob.type === "data-store") && !ids.has(ob.id)) { ids.add(ob.id); grew = true; }
          if (ids.has(c.targetId) && oa && (oa.type === "data-object" || oa.type === "data-store") && !ids.has(oa.id)) { ids.add(oa.id); grew = true; }
        }
      }
      return ids;
    };

    // R8.14 — clearance floor for the process-level start.
    for (const s of elements) {
      if (s.type !== "start-event" || s.boundaryHostId) continue;
      const parent = s.parentId ? byIdSE.get(s.parentId) : undefined;
      if (!parent || (parent.type !== "pool" && parent.type !== "lane")) continue;
      const headerW = parent.type === "lane"
        ? ((parent.properties?.laneHeaderWidth as number | undefined) || 36)
        : POOL_HEADER_W;
      const floor = parent.x + headerW + s.width;
      if (s.x < floor) s.x = floor;
    }

    // R8.15 — shorten the first connector by bringing the first element to it.
    for (const s of elements) {
      if (s.type !== "start-event" || s.boundaryHostId) continue;
      const outs = connectors.filter((c) => c.type === "sequence" && c.sourceId === s.id);
      if (outs.length !== 1) continue;
      const t = byIdSE.get(outs[0].targetId);
      if (!t) continue;
      const gap = t.x - (s.x + s.width);
      if (gap <= MAX_CONN) continue;
      const dx = gap - MAX_CONN;
      const parent = s.parentId ? byIdSE.get(s.parentId) : undefined;
      if (parent && parent.type === "subprocess-expanded") {
        // slide the whole inner flow (every EP descendant except the start) left
        const ids = [...collectSubtreeIds(parent.id)].filter((id) => id !== s.id);
        shiftX(ids, -dx);
      } else {
        // main pool: move just the first element (+ its own contents and any
        // associated data objects/stores) left
        shiftX(movableWith(t.id), -dx);
      }
    }

    // R8.18 — pull each End event left to hug its last element (pool + EP).
    for (const e of elements) {
      if (e.type !== "end-event" || e.boundaryHostId) continue;
      const ins = connectors.filter((c) => c.type === "sequence" && c.targetId === e.id);
      let maxRight = -Infinity;
      for (const c of ins) {
        const src = byIdSE.get(c.sourceId);
        if (src && src.id !== e.id) maxRight = Math.max(maxRight, src.x + src.width);
      }
      if (!isFinite(maxRight)) continue;
      if (e.x - maxRight > MAX_CONN) e.x = maxRight + MAX_CONN;
    }
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

      // Message connectors: build the canonical 4-waypoint moveable
      // structure (sourceCentre → srcEdge → tgtEdge → targetCentre) so
      // the user can later drag the body horizontally and re-attach the
      // endpoints. Anything less than 4 waypoints / missing the
      // invisible-leader flags would land in the editor as a static
      // (un-moveable) message flow.
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
            { x: src.x + src.width / 2, y: src.y + src.height / 2 },
            { x: alignX, y: srcY },
            { x: alignX, y: tgtY },
            { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height / 2 },
          ],
          sourceOffsetAlong: (alignX - src.x) / src.width,
          targetOffsetAlong: (alignX - tgt.x) / tgt.width,
          sourceInvisibleLeader: true,
          targetInvisibleLeader: true,
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

  // ── R5.09: place gateway labels top-left, close, and clear of obstacles ─────
  // The label rides an ARC around the gateway centre at the nearest-clearing
  // radius. It STARTS up-and-slightly-left (≈68° above horizontal — steeper than
  // a 45° diagonal, which reads better and keeps clear of the upstream element
  // usually sitting directly left) and, if the label box overlaps a nearby flow
  // element or connector, sweeps DOWN THE LEFT SIDE (toward straight-left, then
  // bottom-left) until it finds a clear angle — staying as close to the gateway
  // as possible. Sweeping left/down avoids the incoming connector (which usually
  // arrives from the left at the gateway's vertical centre) and the branch
  // labels (which sit out along the outgoing connectors to the right).
  {
    const LH = 14, GAP = 8, NEAR = 360;
    const START_DEG = -22;   // 0° = straight up; negative = tilted left (≈68° from horizontal)
    // Sweep stops at straight-DOWN (-180°): up-left → left → bottom-left → down.
    // It must never cross onto the gateway's RIGHT, where the outgoing branches
    // and their labels sit, so the arc stays in the left hemisphere + below.
    const STEP_DEG = 13, SWEEP_DEG = 158;
    const OBST = new Set(["task", "subprocess", "subprocess-expanded", "start-event",
      "end-event", "intermediate-event", "gateway", "data-object", "data-store"]);
    const segs: { vx?: number; hy?: number; a: number; b: number }[] = [];
    for (const c of finalConnectors) {
      const w = c.waypoints ?? [];
      for (let i = 1; i < w.length; i++) {
        const p = w[i - 1], q = w[i];
        if (Math.abs(p.x - q.x) < 0.5) segs.push({ vx: p.x, a: Math.min(p.y, q.y), b: Math.max(p.y, q.y) });
        else if (Math.abs(p.y - q.y) < 0.5) segs.push({ hy: p.y, a: Math.min(p.x, q.x), b: Math.max(p.x, q.x) });
      }
    }
    const hitsBox = (r: { x: number; y: number; w: number; h: number }, b: DiagramElement) =>
      r.x < b.x + b.width && r.x + r.w > b.x && r.y < b.y + b.height && r.y + r.h > b.y;
    const hitsSeg = (r: { x: number; y: number; w: number; h: number }, s: typeof segs[number]) =>
      s.vx !== undefined
        ? s.vx >= r.x && s.vx <= r.x + r.w && s.b >= r.y && s.a <= r.y + r.h
        : s.hy! >= r.y && s.hy! <= r.y + r.h && s.b >= r.x && s.a <= r.x + r.w;
    for (const g of elements) {
      if (g.type !== "gateway" || !g.label || !g.label.trim()) continue;
      const lw = (g.properties.labelWidth as number) ?? 80;
      const lh = Math.max(1, wrapText(g.label.trim(), lw).length) * LH;
      const cx = g.x + g.width / 2, cy = g.y + g.height / 2;
      const near = elements.filter(e => e.id !== g.id && OBST.has(e.type)
        && Math.abs((e.x + e.width / 2) - cx) < NEAR && Math.abs((e.y + e.height / 2) - cy) < NEAR);
      // Label-centre position + box for a given clock angle (deg, clockwise from
      // up) and an optional outward push (pad) added to the snug radius.
      const place = (deg: number, pad = 0) => {
        const r = deg * Math.PI / 180, s = Math.sin(r), c = Math.cos(r);
        // Nearest-clearing radius: gateway + label half-extents projected onto the
        // angle, plus the gap — so the label hugs the gateway whatever the angle.
        const R = (g.width / 2 * Math.abs(s) + g.height / 2 * Math.abs(c))
          + GAP + (lw / 2 * Math.abs(s) + lh / 2 * Math.abs(c)) + pad;
        const lcx = cx + R * s, lcy = cy - R * c;
        return { lcx, lcy, box: { x: lcx - lw / 2, y: lcy - lh / 2, w: lw, h: lh } };
      };
      const clear = (b: { x: number; y: number; w: number; h: number }) =>
        !near.some(e => hitsBox(b, e)) && !segs.some(s => hitsSeg(b, s));
      // Sweep the left arc at the snug radius first; if the WHOLE arc is blocked
      // (dense gateway), push the label progressively further out and re-sweep,
      // so it never falls back onto an overlapping spot when a clear one exists.
      let chosen = place(START_DEG);
      let placed = false;
      for (let pad = 0; pad <= 100 && !placed; pad += 20) {
        for (let d = 0; d <= SWEEP_DEG; d += STEP_DEG) {
          const cand = place(START_DEG - d, pad);  // down the left side (up-left → left → bottom-left)
          if (clear(cand.box)) { chosen = cand; placed = true; break; }
        }
      }
      g.properties = {
        ...g.properties,
        labelWidth: lw,
        labelOffsetX: Math.round(chosen.lcx - cx),
        labelOffsetY: Math.round(chosen.lcy - lh / 2 - (g.y + g.height)),
      };
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

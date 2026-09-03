/**
 * Layout engine for AI-generated BPMN diagrams.
 * Handles pools, lanes, and element placement within lanes.
 */

import type { DiagramData, DiagramElement, Connector, Point } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";
import { closeFlowVoids } from "./closeFlowVoids";
import { computeWaypoints, recomputeAllConnectors, pickBoundaryEventSide } from "./routing";
import { analysePaths } from "./bpmnPaths";
import { autoSizeForType, wrapText, externalLabelBox, externalLabelSize, connectorLabelWidth, connectorLabelLines, LINE_HEIGHT, PAD, type AutosizeType } from "./textMetrics";
import { snapImportedBounds, type Box } from "./importGeometry";
import { buildTestConnectors } from "./bpmnTestConnectors";

/** Word-wrap a black-box pool name into multiple lines, then size the pool
 *  FROM the wrapped result: the rotated label runs along the pool HEIGHT, so
 *  the height comes from the LONGEST wrapped line, and the header strip width
 *  from the line COUNT. Matches poolMetrics (fontSize 12) so the load-time
 *  recompute agrees. Without this the height was computed from the full
 *  single-line name and the black-box pool came out far too tall. */
export function wrapPoolName(name: string): { label: string; height: number; headerWidth: number } {
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
  // The header strip stacks the label's lines ACROSS its width at the RENDERED pool
  // font size (default 16 — same value B32/checkPoolHeaderLabelOverrun and the
  // renderer use). Sizing it at 12 made the strip too narrow, so a 3-line pool name
  // overflowed and tripped the B32 overflow warning. Match 16 so it fits.
  const headerLineH = 16 * 1.18;
  const height = Math.max(BLACK_BOX_H, Math.ceil(longest * charPx + 20));
  const headerWidth = Math.max(36, Math.ceil(lines.length * headerLineH + 8));
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
  parentLane?: string;        // for a SUB-lane — the id of the parent lane it nests inside
  subprocessType?: string;    // "normal" | "event" | "transaction" | "call"
  repeatType?: string;        // activity marker: "loop" (standard loop) | "mi-parallel" | "mi-sequential" | "none"
  properties?: Record<string, unknown>; // additional properties pass-through (incl. adHoc: true for an ad-hoc Sub-Process)
  /** Normalised drawn bounding box (0..1 of the whole source image; x,y =
   *  top-left corner). Present only for image imports with captureGeometry.
   *  Consumed by layoutBpmnPreserved to reproduce the vendor's positions. */
  bounds?: { x: number; y: number; w: number; h: number };
}

export interface AiConnection {
  sourceId: string;
  targetId: string;
  label?: string;
  type?: string; // "sequence" | "message"
  /** Imported-layout connector geometry (captureGeometry only): the side each
   *  end attaches to and the normalised (0..1) waypoint polyline as drawn, so
   *  imported connectors honour the vendor's attachment points + routing. */
  sourceSide?: "left" | "right" | "top" | "bottom";
  targetSide?: "left" | "right" | "top" | "bottom";
  waypoints?: { x: number; y: number }[];
}

// Layout constants
const POOL_HEADER_W = 36;
const LANE_H = 120;
const LANE_PAD_X = 54; // 1.5 × start-event width (36) — gap between pool/lane header right edge and the first start event
const BLACK_BOX_H = 50;
const POOL_GAP = 98; // gap between pool boundaries = 1.5 × Task height (65) — plenty for a message label, no more (Paul 2026-07-29)
const COL_SPACING = 160; // horizontal spacing between columns
const TASK_W = 100; // standard task width for padding
const START_X = 50;
const START_Y = 50;

// Build properties object for a DiagramElement from an AiElement.
// Merges ai.properties pass-through with specific fields like subprocessType.
// (ad-hoc rides ai.properties.adHoc through the spread — no special handling.)
function buildProps(ai: AiElement): Record<string, unknown> {
  const props: Record<string, unknown> = { ...(ai.properties ?? {}) };
  if (ai.subprocessType) props.subprocessType = ai.subprocessType;
  return props;
}

/** Copy the AI-supplied activity marker (Standard Loop / Multi-Instance) from
 *  the plan onto the built element. Applies to tasks + sub-processes only; the
 *  renderer draws the marker from `element.repeatType`. Ad-hoc is separate (it
 *  rides `properties.adHoc`, carried by buildProps). Run once before returning. */
const REPEAT_MARKER_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);
function applyRepeatMarkers(elements: DiagramElement[], aiElements: AiElement[]): void {
  const byId = new Map(
    aiElements.filter((a) => a.repeatType && a.repeatType !== "none").map((a) => [a.id, a.repeatType as string]),
  );
  if (byId.size === 0) return;
  for (const el of elements) {
    const rt = byId.get(el.id);
    if (rt && REPEAT_MARKER_TYPES.has(el.type)) el.repeatType = rt as DiagramElement["repeatType"];
  }
}

/** Fixed-size BPMN symbols: keep the catalogue size (centred on the imported
 *  box) rather than stretching a circle/diamond to the drawn box. */
const FIXED_SYMBOL_TYPES = new Set(["start-event", "end-event", "intermediate-event", "gateway"]);
const DATA_ASSOC_TYPES_PRESERVE = new Set(["data-store", "data-object", "text-annotation"]);

/**
 * Image-import layout: reproduce the vendor's DRAWN positions rather than
 * auto-stacking. Consumes the normalised `bounds` on each AiElement, cleans
 * them with `snapImportedBounds`, scales to canvas pixels (preserving the
 * image's aspect ratio), and builds elements with absolute geometry +
 * parent-child nesting. Connectors honour the imported attachment sides and
 * routing where present, otherwise route rectilinearly (relaxed router).
 *
 * Returns null when the geometry is unusable so the caller falls through to the
 * validated auto-stack layout. The result carries `relaxedLayout: true` so the
 * editor/validation know not to re-impose Diagramatix conventions.
 */
function layoutBpmnPreserved(
  aiElements: AiElement[],
  aiConnections: AiConnection[],
  imageAspect?: { w: number; h: number },
): DiagramData | null {
  const snap = snapImportedBounds(
    aiElements.map((a) => ({
      id: a.id, type: a.type, bounds: a.bounds,
      pool: a.pool, lane: a.lane, parentPool: a.parentPool, parentLane: a.parentLane,
    })),
  );
  if (!snap.ok) return null;

  const TARGET_W = 1600;
  const TARGET_H = TARGET_W * (imageAspect && imageAspect.w > 0 ? imageAspect.h / imageAspect.w : 0.66);
  const toPx = (b: Box) => ({
    x: START_X + b.x * TARGET_W,
    y: START_Y + b.y * TARGET_H,
    width: b.w * TARGET_W,
    height: b.h * TARGET_H,
  });
  const aiById = new Map(aiElements.map((a) => [a.id, a]));
  const elements: DiagramElement[] = [];
  // Edge-mounted (boundary) events reference a host activity; defer them until
  // the host is placed, then snap them onto its boundary.
  const boundaryDefer: typeof snap.shapes = [];

  for (const s of snap.shapes) {
    const ai = aiById.get(s.id);
    if (!ai) continue;
    // Boundary intermediate event → mount on the host edge in a later pass.
    const hostAi = ai.boundaryHost ? aiById.get(ai.boundaryHost) : undefined;
    if (hostAi && hostAi.type !== "pool" && hostAi.type !== "lane"
        && (ai.type === "intermediate-event" || ai.type === "start-event")) {
      boundaryDefer.push(s);
      continue;
    }
    const px = toPx(s.box);
    let { x, y, width, height } = px;
    let parentId: string | undefined;
    const props = buildProps(ai);

    if (s.type === "pool") {
      props.poolType = (ai.poolType as string | undefined) ?? "white-box";
    } else if (s.type === "lane") {
      parentId = s.parentPoolId;
    } else if (s.type === "sublane") {
      // A sub-lane nests inside its parent lane (fall back to the pool if the
      // parent lane was dropped as an orphan).
      parentId = s.parentLaneId ?? s.parentPoolId;
    } else {
      // An element inside an Expanded Subprocess must be parented to the EP (not
      // its lane/pool) so connector routing treats the EP as a containment box —
      // otherwise flows between EP children detour AROUND the EP boundary.
      const epParent = ai.parentSubprocess && aiById.get(ai.parentSubprocess)?.type === "subprocess-expanded"
        ? ai.parentSubprocess : undefined;
      parentId = epParent ?? s.laneId ?? s.poolId;
      const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
      if (FIXED_SYMBOL_TYPES.has(ai.type)) {
        const cx = x + width / 2, cy = y + height / 2;
        width = def.defaultWidth; height = def.defaultHeight;
        x = cx - width / 2; y = cy - height / 2;
      } else if (ai.type === "task" || ai.type === "subprocess") {
        // Size a task / collapsed subprocess to fit its TEXT — grow only if the
        // label needs it. Vendor boxes are often drawn much larger than the
        // text warrants; using them made every task oversized. Keep the drawn
        // box CENTRE so the element stays where it was on the page.
        const cx = x + width / 2, cy = y + height / 2;
        const hasMarker = ai.type === "task" && !!ai.taskType && ai.taskType !== "none";
        const fit = autoSizeForType(ai.type as AutosizeType, ai.label ?? "", 12, hasMarker);
        width = fit.w; height = fit.h;
        x = cx - width / 2; y = cy - height / 2;
      } else {
        // Containers (subprocess-expanded) + artifacts: keep the drawn box but
        // don't let it collapse below the catalogue floor.
        width = Math.max(width, def.defaultWidth * 0.6);
        const lineCount = (ai.label ?? "").split("\n").length;
        const minH = lineCount * LINE_HEIGHT + 2 * PAD + 6;
        height = Math.max(height, def.defaultHeight * 0.6, minH);
      }
    }

    elements.push({
      id: s.id, type: ai.type as DiagramElement["type"],
      x, y, width, height,
      label: ai.label, properties: props,
      ...(parentId ? { parentId } : {}),
      ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
      ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
      ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
    });
  }

  // ── Boundary events ── snap each deferred event onto its host's nearest edge
  // so it renders mounted on the activity boundary (not floating in the lane).
  const placedById = new Map(elements.map((e) => [e.id, e]));
  for (const s of boundaryDefer) {
    const ai = aiById.get(s.id)!;
    const host = placedById.get(ai.boundaryHost!);
    const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
    const W = def.defaultWidth, H = def.defaultHeight;
    if (!host) {
      // Host wasn't placed — fall back to a plain node at the drawn position.
      const px = toPx(s.box);
      elements.push({ id: s.id, type: ai.type as DiagramElement["type"],
        x: px.x + px.width / 2 - W / 2, y: px.y + px.height / 2 - H / 2, width: W, height: H,
        label: ai.label, properties: buildProps(ai),
        ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}) });
      continue;
    }
    // Determine which host edge the drawn event centre is nearest to.
    const px = toPx(s.box);
    const cx = px.x + px.width / 2, cy = px.y + px.height / 2;
    const dl = Math.abs(cx - host.x), dr = Math.abs(cx - (host.x + host.width));
    const dt = Math.abs(cy - host.y), db = Math.abs(cy - (host.y + host.height));
    const side = ((ai.boundarySide as string | undefined)
      ?? [["left", dl], ["right", dr], ["top", dt], ["bottom", db]]
        .sort((a, b) => (a[1] as number) - (b[1] as number))[0][0]) as "left" | "right" | "top" | "bottom";
    // Centre the event ON the chosen edge, at the drawn along-edge position.
    let ex: number, ey: number;
    if (side === "left" || side === "right") {
      ex = (side === "left" ? host.x : host.x + host.width) - W / 2;
      ey = Math.max(host.y, Math.min(host.y + host.height - H, cy - H / 2));
    } else {
      ey = (side === "top" ? host.y : host.y + host.height) - H / 2;
      ex = Math.max(host.x, Math.min(host.x + host.width - W, cx - W / 2));
    }
    elements.push({
      id: s.id, type: ai.type as DiagramElement["type"],
      x: ex, y: ey, width: W, height: H,
      label: ai.label,
      properties: { ...buildProps(ai), boundarySide: side },
      boundaryHostId: host.id,
      ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
    });
  }

  // ── Expanded Subprocess tidy-up ── the vendor may draw an EP too small to
  // enclose all its children, or an intermediate event sitting on its edge.
  const taskDefH = getSymbolDefinition("task").defaultHeight;
  for (const ep of elements) {
    if (ep.type !== "subprocess-expanded") continue;
    // (a) Edge-mount an intermediate event sitting on / just outside the EP edge
    //     that isn't already a child of it — it becomes a boundary event.
    for (const ev of elements) {
      if (ev.type !== "intermediate-event" || ev.boundaryHostId || ev.parentId === ep.id) continue;
      const ecx = ev.x + ev.width / 2, ecy = ev.y + ev.height / 2;
      // nearest distance from the event centre to the EP rectangle boundary
      const nx = Math.max(ep.x, Math.min(ep.x + ep.width, ecx));
      const ny = Math.max(ep.y, Math.min(ep.y + ep.height, ecy));
      if (Math.hypot(nx - ecx, ny - ecy) > taskDefH) continue; // too far → not a boundary event
      const dl = Math.abs(ecx - ep.x), dr = Math.abs(ecx - (ep.x + ep.width));
      const dt = Math.abs(ecy - ep.y), db = Math.abs(ecy - (ep.y + ep.height));
      const side = ([["left", dl], ["right", dr], ["top", dt], ["bottom", db]]
        .sort((a, b) => (a[1] as number) - (b[1] as number))[0][0]) as "left" | "right" | "top" | "bottom";
      if (side === "left" || side === "right") {
        ev.x = (side === "left" ? ep.x : ep.x + ep.width) - ev.width / 2;
        ev.y = Math.max(ep.y, Math.min(ep.y + ep.height - ev.height, ev.y));
      } else {
        ev.y = (side === "top" ? ep.y : ep.y + ep.height) - ev.height / 2;
        ev.x = Math.max(ep.x, Math.min(ep.x + ep.width - ev.width, ev.x));
      }
      ev.boundaryHostId = ep.id;
      ev.parentId = ep.parentId; // boundary events belong to the EP's container
      ev.properties = { ...ev.properties, boundarySide: side };
    }
    // (b) Grow the EP so it encloses all its (non-boundary) children with padding.
    const kids = elements.filter((e) => e.parentId === ep.id && !e.boundaryHostId);
    if (kids.length) {
      const PAD = 20, HEADER = 28;
      const left = Math.min(ep.x, ...kids.map((k) => k.x - PAD));
      const top = Math.min(ep.y, ...kids.map((k) => k.y - HEADER));
      const right = Math.max(ep.x + ep.width, ...kids.map((k) => k.x + k.width + PAD));
      const bottom = Math.max(ep.y + ep.height, ...kids.map((k) => k.y + k.height + PAD));
      ep.x = left; ep.y = top; ep.width = right - left; ep.height = bottom - top;
    }
  }

  // ── Pool + lane tidy-up ── snapImportedBounds snaps each lane's x/width to
  // its parent pool's box, so the lanes end up COINCIDING with the pool and the
  // pool (with its name) is hidden BEHIND them — the lanes have the pool as a
  // formal parent but the pool isn't visible as a container. Rebuild proper
  // BPMN geometry: give the pool a left HEADER strip (so its name shows and it
  // visibly encloses the lanes) and inset every lane to the right of it. Content
  // (flow elements) keeps its absolute position — only the pool grows leftward,
  // so nothing shifts and the header simply appears.
  for (const pool of elements) {
    if (pool.type !== "pool") continue;
    const lanes = elements.filter((e) => e.type === "lane" && e.parentId === pool.id);
    if (lanes.length === 0) continue;
    const headerW = wrapPoolName(pool.label ?? "").headerWidth;
    const lMinX = Math.min(...lanes.map((l) => l.x));
    const lMinY = Math.min(...lanes.map((l) => l.y));
    const lMaxX = Math.max(...lanes.map((l) => l.x + l.width));
    const lMaxY = Math.max(...lanes.map((l) => l.y + l.height));
    // Normalise the lanes to a single content column (they already tile
    // vertically from snapImportedBounds) so their left edges line up flush
    // against the pool header.
    for (const lane of lanes) { lane.x = lMinX; lane.width = lMaxX - lMinX; }
    // Pool = header strip (headerW) to the LEFT of the lane column, enclosing
    // the full lane stack. Growing left keeps all lanes + content in place.
    pool.x = lMinX - headerW;
    pool.y = Math.min(pool.y, lMinY);
    pool.width = lMaxX - pool.x;
    pool.height = lMaxY - pool.y;
    pool.properties = { ...pool.properties, poolHeaderWidth: headerW };
  }

  // ── Sub-lanes inherit their parent lane's (normalised) x + width ── the pool
  // tidy-up above re-set each lane's x/width to the pool content column; a
  // sub-lane must line up flush inside its parent lane, so mirror it.
  for (const sub of elements) {
    if (sub.type !== "sublane" || !sub.parentId) continue;
    const parent = elements.find((e) => e.id === sub.parentId);
    if (parent && parent.type === "lane") { sub.x = parent.x; sub.width = parent.width; }
  }

  // ── Keep each lane's elements INSIDE its lane ── the drawn position can
  // straddle a lane boundary (e.g. a task whose top pokes into the lane above),
  // which is a lane assignment the plan is authoritative about. Clamp every
  // lane-assigned flow element fully within its lane. Only grow the lane (and
  // shift the lanes below it + the pool) when an element genuinely won't fit —
  // rare now that tasks are sized to their text.
  const LANE_MARGIN = 6;
  for (const pool of elements) {
    if (pool.type !== "pool") continue;
    const lanes = elements.filter((e) => e.type === "lane" && e.parentId === pool.id).sort((a, b) => a.y - b.y);
    if (lanes.length === 0) continue;
    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li];
      const kids = elements.filter((e) => e.parentId === lane.id && e.type !== "lane");
      // Grow the lane only if a child is taller than it can hold; push the
      // lanes below (and their absolute-positioned children move with the
      // clamp when we process them next).
      for (const k of kids) {
        const need = k.height + 2 * LANE_MARGIN;
        if (lane.height < need) {
          const delta = need - lane.height;
          lane.height += delta;
          for (let lj = li + 1; lj < lanes.length; lj++) lanes[lj].y += delta;
        }
      }
      // Clamp each child fully inside the (final) lane band.
      for (const k of kids) {
        const minY = lane.y + LANE_MARGIN;
        const maxY = lane.y + lane.height - k.height - LANE_MARGIN;
        if (maxY >= minY) k.y = Math.max(minY, Math.min(maxY, k.y));
      }
    }
    // Re-grow the pool to enclose the (possibly shifted) lane stack.
    const pMinY = Math.min(...lanes.map((l) => l.y));
    const pMaxY = Math.max(...lanes.map((l) => l.y + l.height));
    pool.y = Math.min(pool.y, pMinY);
    pool.height = pMaxY - pool.y;
  }

  // ── Connectors ── honour imported sides + routing where present.
  const elMap = new Map(elements.map((e) => [e.id, e]));
  const built: Connector[] = [];
  for (const c of aiConnections) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;
    const isAssoc = DATA_ASSOC_TYPES_PRESERVE.has(src.type) || DATA_ASSOC_TYPES_PRESERVE.has(tgt.type);
    const isMsg = !isAssoc && (c.type === "message" || src.type === "pool" || tgt.type === "pool");
    const type = isAssoc ? "associationBPMN" : isMsg ? "messageBPMN" : "sequence";

    // Default attachment sides from the centre-to-centre delta; honour the
    // imported sides when the model reported them.
    const dx = (tgt.x + tgt.width / 2) - (src.x + src.width / 2);
    const dy = (tgt.y + tgt.height / 2) - (src.y + src.height / 2);
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const defSrcSide = horiz ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
    const defTgtSide = horiz ? (dx >= 0 ? "left" : "right") : (dy >= 0 ? "top" : "bottom");

    built.push({
      id: `conn-${c.sourceId}-${c.targetId}`,
      sourceId: c.sourceId, targetId: c.targetId,
      // Honour the drawn LOGICAL attachment side (middle of that boundary /
      // vertex of a gateway); the actual endpoint is computed on the real
      // element boundary by the router below, so the connector always CONNECTS.
      // The raw imported waypoint polyline is NOT used as the path — its
      // coordinates are in image space and would float off the placed elements.
      sourceSide: c.sourceSide ?? defSrcSide,
      targetSide: c.targetSide ?? defTgtSide,
      sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
      type, directionType: "directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false,
      waypoints: [] as Point[],
      label: c.label ?? "",
    } as Connector);
  }

  // Rule 4: message flows generated by Apply Layout must NOT share attachment
  // points. Every message attaches to the TOP or BOTTOM of its endpoint (chosen
  // by relative vertical position — same rule the router applies); spread the
  // offsetAlong of all message endpoints that land on the same element + side,
  // ordered by the partner element's x so the connectors don't cross.
  type MsgEndpoint = { conn: Connector; which: "source" | "target"; elId: string; side: "top" | "bottom" };
  const endpoints: MsgEndpoint[] = [];
  for (const conn of built) {
    if (conn.type !== "messageBPMN") continue;
    const s = elMap.get(conn.sourceId)!, t = elMap.get(conn.targetId)!;
    const sCy = s.y + s.height / 2, tCy = t.y + t.height / 2;
    endpoints.push({ conn, which: "source", elId: conn.sourceId, side: sCy <= tCy ? "bottom" : "top" });
    endpoints.push({ conn, which: "target", elId: conn.targetId, side: sCy <= tCy ? "top" : "bottom" });
  }
  const groups = new Map<string, MsgEndpoint[]>();
  for (const ep of endpoints) {
    const key = `${ep.elId}|${ep.side}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(ep);
  }
  for (const eps of groups.values()) {
    if (eps.length <= 1) continue; // a lone endpoint keeps the centre (0.5)
    eps.sort((a, b) => {
      const oa = elMap.get(a.which === "source" ? a.conn.targetId : a.conn.sourceId)!;
      const ob = elMap.get(b.which === "source" ? b.conn.targetId : b.conn.sourceId)!;
      return (oa.x + oa.width / 2) - (ob.x + ob.width / 2);
    });
    eps.forEach((ep, i) => {
      const off = (i + 1) / (eps.length + 1);
      if (ep.which === "source") ep.conn.sourceOffsetAlong = off;
      else ep.conn.targetOffsetAlong = off;
    });
  }

  // Route every connector so its endpoints attach to the real element sides
  // (relaxed router → messages attach top/bottom, obstacle-free). This is what
  // makes the visible line touch its source/target, and — because the messages
  // are rectilinear — leaves them moveable/reshapeable in the editor.
  const connectors = recomputeAllConnectors(built, elements, true);

  applyRepeatMarkers(elements, aiElements);
  return {
    elements,
    connectors,
    viewport: { x: 0, y: 0, zoom: 0.6 },
    fontSize: 12,
    connectorFontSize: 10,
    relaxedLayout: true,
  };
}

/** R7.05 — an edge-mounted intermediate event's label sits on its OUTWARD side,
 *  biased WEST, so the outgoing sequence connector leaves the event cleanly.
 *  Keyed by the side the event is mounted on. */
function boundaryLabelOffset(side: string, w: number, h: number): { labelOffsetX: number; labelOffsetY: number } {
  if (side === "top")    return { labelOffsetX: -(w / 2 + 46), labelOffsetY: -(h + 30) };
  if (side === "bottom") return { labelOffsetX: -(w / 2 + 46), labelOffsetY: 8 };
  if (side === "left")   return { labelOffsetX: -(w / 2 + 90), labelOffsetY: -6 };
  return { labelOffsetX: (w / 2 + 8), labelOffsetY: -6 };
}
/** R7.04 — Re-snap an edge-mounted (boundary) event onto a host rim after the
 *  host box was resized. Honours the event's STORED boundarySide (so a
 *  top-mounted event stays on top instead of flipping to an adjacent edge when
 *  it sits near a corner), and keeps the event at least ONE EVENT WIDTH clear of
 *  BOTH corners of that edge — so the outward sequence connector gets a clean
 *  straight exit and never attaches on the shared corner point of the host
 *  boundary. Short edges fall back to centring the event. */
function snapBoundaryEventToRim(
  be: DiagramElement, nx: number, ny: number, nw: number, nh: number,
): void {
  const cx = be.x + be.width / 2, cy = be.y + be.height / 2;
  let side = be.properties?.boundarySide as string | undefined;
  if (side !== "left" && side !== "right" && side !== "top" && side !== "bottom") {
    const dl = Math.abs(cx - nx), dr = Math.abs(nx + nw - cx);
    const dt = Math.abs(cy - ny), db = Math.abs(ny + nh - cy);
    const m = Math.min(dl, dr, dt, db);
    side = m === dl ? "left" : m === dr ? "right" : m === dt ? "top" : "bottom";
  }
  // Corner margin = 1.5 × event size on that axis (⇒ event outer edge sits one
  // full event width from the corner); capped at half the edge so a short rim
  // just centres the event.
  const alongX = () => { const p = Math.min(be.width * 1.5, nw / 2); return Math.max(nx + p, Math.min(nx + nw - p, cx)); };
  const alongY = () => { const p = Math.min(be.height * 1.5, nh / 2); return Math.max(ny + p, Math.min(ny + nh - p, cy)); };
  let px: number, py: number;
  if (side === "left")       { px = nx;      py = alongY(); }
  else if (side === "right") { px = nx + nw; py = alongY(); }
  else if (side === "top")   { px = alongX(); py = ny; }
  else                       { px = alongX(); py = ny + nh; }
  be.x = px - be.width / 2;
  be.y = py - be.height / 2;
}

/**
 * Something the layout could not take at face value.
 *
 * Reported rather than swallowed. The layout has always had fallbacks — a float
 * pile for elements nothing placed, a default pool when none is declared — and
 * they are silent, so a diagram with three stranded tasks and an empty subprocess
 * comes back looking like a success. These make the failure visible at the moment
 * it happens, which is the only time anyone can act on it.
 */
export interface LayoutDiagnostic {
  kind: "recovered-reference" | "unresolved-reference" | "empty-subprocess" | "unplaced";
  elementId: string;
  label: string;
  field?: string;
  detail: string;
}

export function layoutBpmnDiagram(
  aiElements: AiElement[],
  aiConnections: AiConnection[],
  opts?: {
    promptLabel?: string;
    /** Called for anything the layout could not take at face value. */
    onDiagnostic?: (d: LayoutDiagnostic) => void;
    /** Image import: reproduce the vendor's drawn positions instead of
     *  auto-stacking. Requires usable `bounds` on pools/lanes/nodes; falls
     *  back to the normal auto-stack layout if the geometry is unusable. */
    preservePositions?: boolean;
    /** Natural pixel dimensions of the imported image, so normalised bounds
     *  keep the vendor's aspect ratio when scaled to the canvas. */
    imageAspect?: { w: number; h: number };
    /** EXPERIMENTAL SuperAdmin-only connector scheme. "test" re-derives every
     *  sequence connector via the C1/C2 rules (bpmnTestConnectors) after normal
     *  placement; element positions + all other connectors are untouched.
     *  Default/omitted = "normal" (unchanged product behaviour). */
    mode?: "normal" | "test";
  },
): DiagramData {
  // Image import with usable geometry → reproduce the drawn layout. Returns
  // null when the geometry is missing/degenerate so we drop through to the
  // normal auto-stack engine below (always a valid, validated fallback).
  if (opts?.preservePositions) {
    const preserved = layoutBpmnPreserved(aiElements, aiConnections, opts.imageAspect);
    if (preserved) return preserved;
  }

  // Sub-lane inclusion is handled in the PRESERVED (image-geometry) path only.
  // If we reach the auto-stack engine with sub-lanes present (a typed prompt),
  // flatten each sub-lane to a normal lane under its pool so placement still
  // works — nested-band auto-layout is a follow-up. Idempotent.
  for (const el of aiElements) {
    if (el.type !== "sublane") continue;
    if (!el.parentPool && el.parentLane) {
      const parent = aiElements.find((e) => e.id === el.parentLane);
      if (parent?.parentPool) el.parentPool = parent.parentPool;
    }
    if (!el.pool) el.pool = el.parentPool;
    el.type = "lane";
    delete el.parentLane;
  }

  // A standalone lane element is matched to its pool by `pool` further down, but
  // `parentPool` is the field the AiElement contract documents for exactly that
  // ("for lanes — the pool they belong to"). A plan that used the documented
  // field orphaned the lane: it belonged to no pool, so every element assigned
  // to it fell through lane placement and was parked at arbitrary coordinates.
  // Accept both spellings.
  for (const el of aiElements) {
    if (el.type === "lane" && !el.pool && el.parentPool) el.pool = el.parentPool;
  }

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

  // Normalize labels: the AI sometimes omits a label on an element (e.g. a
  // gateway or event), which would leave `label: undefined` on the built
  // DiagramElement even though the type requires a string — and the renderer
  // does `el.label.split("\n")`, white-screening the whole editor. Coerce to
  // "" here so every downstream element satisfies the contract.
  aiElements = aiElements.map(a => (a.label == null ? { ...a, label: "" } : a));

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

  // ── EP-boundary interrupt normalization (R8.19) ── a boundary (edge-mounted)
  // event whose host is INSIDE an Expanded Subprocess and whose outgoing flow
  // LEAVES that EP is a loop-terminating interrupt (e.g. a "10 working days
  // elapsed" timer that lapses the whole application). Such an event MUST sit on
  // the EP's OUTER boundary — not on an interior task — so the connector to its
  // external target runs fully OUTSIDE the EP. Re-home its boundaryHost to the EP
  // itself: the exit-target column ranking (which reads the host's column) and the
  // rim-snap placement then both treat the EP as the host. A boundary event whose
  // exit stays INSIDE the EP keeps its interior-task host.
  {
    const byIdEp = new Map(aiElements.map(e => [e.id, e]));
    for (const ev of aiElements) {
      if (!ev.boundaryHost) continue;
      const host = byIdEp.get(ev.boundaryHost);
      const epId = host?.parentSubprocess;
      if (!epId || byIdEp.get(epId)?.type !== "subprocess-expanded") continue; // host not EP-internal
      const exitsEp = aiConnections.some(c =>
        c.sourceId === ev.id && c.type !== "message" &&
        byIdEp.get(c.targetId)?.parentSubprocess !== epId);
      if (exitsEp) ev.boundaryHost = epId;
    }
  }

  // Separate pools from other elements
  /** Report something the layout could not take at face value. Never throws. */
  const diagnose = (d: LayoutDiagnostic) => { try { opts?.onDiagnostic?.(d); } catch { /* a reporter must never break a layout */ } };

  const pools = aiElements.filter(e => e.type === "pool");
  const lanes = aiElements.filter(e => e.type === "lane");
  // ── Dangling references ───────────────────────────────────────────────────
  //
  // The single most damaging thing a plan can contain, because of how the filter
  // below works: an element carrying `parentSubprocess` or `boundaryHost` is
  // EXCLUDED from flow placement, on the understanding that the subprocess-child
  // or boundary pass will place it instead. If the id it names does not exist,
  // NOTHING places it — it is invisible to the lane logic and invisible to the
  // pass that was supposed to own it, so it falls through to the float fallback
  // and lands outside every pool. The subprocess it named is left empty.
  //
  // That is not hypothetical: V06.08 "Validate Commercial Model" shipped with an
  // empty Expanded Subprocess and three tasks stranded at x=50, from one bad
  // reference (Paul, 2026-08-29 — "the worst generated diagram").
  //
  // So: resolve what can be resolved, drop what cannot (the element then places
  // normally, in a lane, like any other), and REPORT every one either way. A
  // recovered reference is still worth reporting — it means the model produced a
  // reference the plan schema did not intend.
  const byAiId = new Map(aiElements.map((e) => [e.id, e]));
  const laneRefs = new Map<string, string>(); // normalised key → lane id
  const poolRefs = new Map<string, string>();
  /** Case, punctuation and a leading id-prefix ("l", "lane") folded away. */
  const normRef = (s: string): string =>
    String(s).toLowerCase().replace(/^(lane[_-]?|l(?=[a-z]{2}))/, "").replace(/[^a-z0-9]/g, "");
  const remember = (map: Map<string, string>, key: string | undefined, id: string) => {
    if (!key) return;
    const k = normRef(key);
    if (k && !map.has(k)) map.set(k, id);
  };
  for (const l of lanes) { remember(laneRefs, l.id, l.id); remember(laneRefs, l.label, l.id); }
  for (const p of pools) {
    remember(poolRefs, p.id, p.id); remember(poolRefs, p.label, p.id);
    for (const il of (p.lanes ?? [])) { remember(laneRefs, il.id, il.id); remember(laneRefs, il.name, il.id); }
  }

  /** Resolve a reference to an element id, allowing a normalised near-match. */
  const resolveRef = (
    ref: string, ok: (e: AiElement) => boolean, extra?: Map<string, string>,
  ): string | null => {
    const direct = byAiId.get(ref);
    if (direct && ok(direct)) return ref;
    if (extra) {
      const hit = extra.get(normRef(ref));
      if (hit) return hit;
    }
    const k = normRef(ref);
    for (const e of aiElements) {
      if (!ok(e)) continue;
      if (normRef(e.id) === k || normRef(e.label ?? "") === k) return e.id;
    }
    return null;
  };

  const isContainerActivity = (e: AiElement) =>
    e.type === "subprocess-expanded" || e.type === "subprocess";

  /**
   * Nothing may contain itself, directly or through a chain.
   *
   * A self-reference passes every check above — `parentSubprocess` naming an
   * expanded subprocess IS valid when the element in question is that
   * subprocess — and then costs the whole diagram: the subprocess is excluded
   * from flow placement on the understanding that the subprocess-child pass will
   * place it, that pass positions children relative to a parent that was never
   * placed, and everything downstream of it in the flow goes with it.
   */
  const containmentCycles = (field: "parentSubprocess" | "boundaryHost") => {
    const clear = (e: AiElement, detail: string) => {
      diagnose({ kind: "unresolved-reference", elementId: e.id, label: e.label ?? "", field, detail });
      (e as unknown as Record<string, unknown>)[field] = undefined;
    };

    // FIRST, and separately: a direct self-reference. Blame is unambiguous here,
    // and clearing it first is what keeps the element's real children intact.
    // V06.08 shipped `sp1` naming `sp1`; walking up from each of its seven
    // children also reaches that loop, so a single combined pass blamed the
    // CHILDREN and emptied the subprocess it was trying to save.
    for (const e of aiElements) {
      if (e[field] && String(e[field]) === e.id) {
        clear(e, `"${e.id}" is the element itself — cleared, or nothing would have placed it`);
      }
    }

    // Then longer cycles. The element that CLOSES the loop is the one to clear:
    // every other element on the path has a defensible parent.
    for (const e of aiElements) {
      const path: AiElement[] = [];
      const onPath = new Set<string>();
      let cur: AiElement | undefined = e;
      for (let d = 0; d < 64 && cur; d++) {
        if (onPath.has(cur.id)) {
          const closer = path[path.length - 1];
          if (closer?.[field]) {
            clear(closer, `"${closer[field]}" closes a containment cycle — cleared, or nothing would have placed it`);
          }
          break;
        }
        onPath.add(cur.id);
        path.push(cur);
        const ref = cur[field];
        if (!ref) break;
        cur = byAiId.get(String(ref));
      }
    }
  };
  const isActivity = (e: AiElement) =>
    isContainerActivity(e) || e.type === "task" || e.type === "call-activity" || e.type === "transaction";

  for (const e of aiElements) {
    if (e.type === "pool" || e.type === "lane") continue;
    const fix = (
      field: "parentSubprocess" | "boundaryHost" | "lane" | "pool",
      ok: (x: AiElement) => boolean, extra?: Map<string, string>,
    ) => {
      const ref = e[field];
      if (!ref) return;
      const hit = resolveRef(String(ref), ok, extra);
      if (hit === ref) return;
      if (hit) {
        diagnose({ kind: "recovered-reference", elementId: e.id, label: e.label ?? "", field, detail: `"${ref}" matched "${hit}"` });
        (e as unknown as Record<string, unknown>)[field] = hit;
        return;
      }
      // Nothing matched. Clearing the field is what makes the element placeable:
      // it re-joins normal flow placement instead of vanishing into the float.
      diagnose({ kind: "unresolved-reference", elementId: e.id, label: e.label ?? "", field, detail: `"${ref}" does not exist — placed as normal flow content instead` });
      (e as unknown as Record<string, unknown>)[field] = undefined;
    };
    fix("parentSubprocess", isContainerActivity);
    fix("boundaryHost", isActivity);
    fix("lane", (x) => x.type === "lane", laneRefs);
    fix("pool", (x) => x.type === "pool", poolRefs);
  }
  containmentCycles("parentSubprocess");
  containmentCycles("boundaryHost");

  // ── An Expanded Subprocess with NO children adopts an orphan internal chain ──
  //
  // V06.08 shipped an EP drawn as a small empty box while a chain of four tasks
  // sat beside it in the lane:
  //
  //   Customer Buying Signal Received → [Repeat Until Pricing Model Validated] → Commercial Model Viable?
  //   «start» → Analyse → Revise → Update → Review Model → «end»          (floating, connected to nothing)
  //
  // The model got the TOPOLOGY right — it emitted the EP in the main flow and a
  // self-contained inner chain with the unlabelled start and end an EP's
  // internals always have — and only the `parentSubprocess` links were missing.
  // Nothing above can repair that, because there is no bad reference to fix:
  // the field was simply never set.
  //
  // The signature is specific enough to act on. A chain that (a) is a connected
  // component of the sequence graph on its own, (b) touches no pool-level
  // anchor, (c) opens on a start event with no label and no incoming flow, and
  // (d) closes on an end event, is a subprocess's insides — a process-level
  // start carries a real label and roots the main flow. Adopt ONLY when the
  // childless EPs and the orphan chains pair up one-to-one; anything else is a
  // guess, and a wrong adoption is worse than an empty box.
  {
    const seq = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      for (const [x, y] of [[a, b], [b, a]] as const) {
        const s = seq.get(x); if (s) s.add(y); else seq.set(x, new Set([y]));
      }
    };
    const DATA_TYPES = new Set(["data-object", "data-store", "text-annotation"]);
    const isFlow = (e: AiElement | undefined) =>
      !!e && e.type !== "pool" && e.type !== "lane" && !DATA_TYPES.has(e.type);
    const inbound = new Map<string, number>();
    for (const c of aiConnections) {
      if (c.type === "message") continue;
      const a = byAiId.get(c.sourceId), b = byAiId.get(c.targetId);
      if (!isFlow(a) || !isFlow(b)) continue;          // data associations are not flow
      link(c.sourceId, c.targetId);
      inbound.set(c.targetId, (inbound.get(c.targetId) ?? 0) + 1);
    }

    const childless = aiElements.filter(
      (e) => e.type === "subprocess-expanded"
        && !aiElements.some((x) => x.parentSubprocess === e.id),
    );

    if (childless.length > 0) {
      // Connected components over flow elements that are not already inside an EP.
      const candidates = aiElements.filter((e) => isFlow(e) && !e.parentSubprocess && !e.boundaryHost);
      const seen = new Set<string>();
      const orphans: AiElement[][] = [];
      for (const root of candidates) {
        if (seen.has(root.id)) continue;
        const comp: AiElement[] = [];
        const stack = [root.id];
        seen.add(root.id);
        while (stack.length) {
          const id = stack.pop()!;
          const el = byAiId.get(id);
          if (el) comp.push(el);
          for (const n of seq.get(id) ?? []) {
            if (seen.has(n)) continue;
            const ne = byAiId.get(n);
            if (!ne || ne.parentSubprocess || ne.boundaryHost) continue;
            seen.add(n); stack.push(n);
          }
        }
        const opens = comp.filter((e) => e.type === "start-event" && !(e.label ?? "").trim() && !inbound.get(e.id));
        const closes = comp.some((e) => e.type === "end-event");
        const hasContainer = comp.some((e) => e.type === "subprocess-expanded" || e.type === "subprocess");
        if (comp.length >= 3 && opens.length === 1 && closes && !hasContainer) orphans.push(comp);
      }

      if (orphans.length > 0 && orphans.length === childless.length) {
        // Pair in declaration order — the order the model wrote them is the only
        // signal available before anything has been positioned.
        for (let i = 0; i < childless.length; i++) {
          const ep = childless[i];
          for (const el of orphans[i]) el.parentSubprocess = ep.id;
          diagnose({
            kind: "recovered-reference", elementId: ep.id, label: ep.label ?? "",
            field: "parentSubprocess",
            detail: `empty subprocess adopted a floating internal chain of ${orphans[i].length} elements (the plan never set parentSubprocess on them)`,
          });
        }
      } else if (orphans.length > 0) {
        diagnose({
          kind: "unresolved-reference", elementId: childless[0].id, label: childless[0].label ?? "",
          field: "parentSubprocess",
          detail: `${childless.length} empty subprocess(es) and ${orphans.length} floating chain(s) — cannot pair them safely, leaving both as they are`,
        });
      }
    }
  }

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

  /** Data artifacts are inert: they never carry flow and may sit outside their EP. */
  const DATA_ARTIFACTS = new Set(["data-object", "data-store", "text-annotation"]);

  // ── A subprocess contains what its internal Start Event reaches ──
  //
  // V06.08 put "Finalise commercial model and document assumptions" and "Record
  // finalised commercial model in CRM" inside "Repeat Until Pricing Model
  // Validated". They are post-loop steps: the viability gateway, which sits at
  // the subprocess's own level, branches to them. The subprocess's real contents
  // are the chain «start» → Analyse → Revise → Update → Review → «end».
  //
  // Declared containment and declared flow contradicted each other, and the flow
  // is the more reliable of the two — it is what the prompt describes and what
  // every downstream reader (simulation, the link scan, the exporter) uses. So a
  // declared child that the internal Start Event cannot REACH is not part of the
  // subprocess: evict it to the subprocess's own level, where the flow already
  // says it belongs. Without an internal start there is nothing to reach from,
  // and the rule stays out of it.
  {
    const kidsOf = new Map<string, AiElement[]>();
    for (const e of aiElements) {
      if (!e.parentSubprocess || e.boundaryHost) continue;
      const a = kidsOf.get(String(e.parentSubprocess));
      if (a) a.push(e); else kidsOf.set(String(e.parentSubprocess), [e]);
    }
    for (const [spId, kids] of kidsOf) {
      const sp = byAiId.get(spId);
      if (!sp || sp.type !== "subprocess-expanded") continue;
      const ids = new Set(kids.map((k) => k.id));
      const starts = kids.filter((k) => k.type === "start-event"
        && !aiConnections.some((c) => c.targetId === k.id && ids.has(c.sourceId)));
      if (starts.length !== 1) continue;   // no single entry point — nothing to reach from

      const reached = new Set<string>([starts[0].id]);
      const stack = [starts[0].id];
      while (stack.length) {
        const id = stack.pop()!;
        for (const c of aiConnections) {
          if (c.type === "message" || c.sourceId !== id) continue;
          if (!ids.has(c.targetId) || reached.has(c.targetId)) continue;
          const t = byAiId.get(c.targetId);
          if (!t || DATA_ARTIFACTS.has(t.type)) continue;
          reached.add(c.targetId); stack.push(c.targetId);
        }
      }
      for (const k of kids) {
        if (reached.has(k.id) || DATA_ARTIFACTS.has(k.type)) continue;
        // Only flow steps are evicted. A nested subprocess that nothing reaches
        // is more likely an authoring gap than a containment error, and moving
        // one takes its own contents with it — too big a move for the evidence.
        if (k.type === "subprocess-expanded" || k.type === "subprocess") continue;
        k.parentSubprocess = sp.parentSubprocess;   // up one level (usually the lane)
        if (!sp.parentSubprocess) { k.lane = sp.lane; k.pool = sp.pool; }
        diagnose({
          kind: "recovered-reference", elementId: k.id, label: k.label ?? "", field: "parentSubprocess",
          detail: `declared inside "${sp.label ?? spId}" but its Start Event cannot reach it — moved out to the subprocess's own level, where the flow puts it`,
        });
      }
    }
  }

  // ── A sequence flow may not cross an expanded subprocess boundary ──
  //
  // The pass above lifts a boundary-crossing GATEWAY out of the EP it was wrongly
  // put inside. The opposite case is a flow drawn from outside straight INTO an
  // EP's insides: V06.08 came back with "Commercial model viable?" — a gateway at
  // the EP's own level — looping back to "Finalise commercial model and document
  // assumptions", an activity inside it (Paul, 2026-08-29).
  //
  // BPMN forbids it, and `canConnect` refuses to draw it in the editor, so a
  // generated diagram must not carry one either. The repair is the standard one:
  // move the inner endpoint OUT to the subprocess itself, which is what the flow
  // means — re-enter the loop, not jump into the middle of it. Only the endpoint
  // that is inside moves; a flow already touching the EP is already legal.
  {
    const epIds = new Set(aiElements.filter((a) => a.type === "subprocess-expanded").map((a) => a.id));
    /** Ancestor EPs of `id`, innermost first. */
    const ancestors = (id: string): string[] => {
      const out: string[] = [];
      let cur = byAiId.get(id);
      for (let d = 0; d < 16 && cur?.parentSubprocess; d++) {
        const p = String(cur.parentSubprocess);
        if (!epIds.has(p)) break;
        out.push(p);
        cur = byAiId.get(p);
      }
      return out;
    };
    const seen = new Set<string>();
    for (const c of aiConnections) {
      if (c.type === "message") continue;
      const src = byAiId.get(c.sourceId), tgt = byAiId.get(c.targetId);
      if (!src || !tgt) continue;
      // A boundary event lives ON the rim: its flows legitimately leave the EP.
      if (src.boundaryHost || tgt.boundaryHost) continue;
      // An ASSOCIATION to a data artifact crosses the boundary quite legally —
      // R8.02 deliberately moves a data object OUTSIDE the EP it belongs to, so
      // re-pointing these would drag every in-subprocess task's data link onto
      // the subprocess itself.
      if (DATA_ARTIFACTS.has(src.type) || DATA_ARTIFACTS.has(tgt.type)) continue;

      for (const end of ["sourceId", "targetId"] as const) {
        const meId = c[end], otherId = end === "sourceId" ? c.targetId : c.sourceId;
        const mine = ancestors(meId);
        if (mine.length === 0) continue;
        const theirs = new Set([otherId, ...ancestors(otherId)]);
        // The outermost EP that contains me but not them — the boundary crossed.
        const lift = [...mine].reverse().find((ep) => !theirs.has(ep));
        if (!lift) continue;
        (c as unknown as Record<string, string>)[end] = lift;
        diagnose({
          kind: "recovered-reference", elementId: meId, label: byAiId.get(meId)?.label ?? "",
          field: end === "sourceId" ? "boundaryHost" : "parentSubprocess",
          detail: `a sequence flow crossed the boundary of "${byAiId.get(lift)?.label ?? lift}" — moved that end onto the subprocess itself`,
        });
      }
      // Re-pointing can collapse two flows onto the same pair.
      const key = `${c.sourceId}->${c.targetId}`;
      if (c.sourceId === c.targetId || seen.has(key)) c.type = "__dropped";
      else seen.add(key);
    }
    for (let i = aiConnections.length - 1; i >= 0; i--) {
      if ((aiConnections[i] as { type?: string }).type === "__dropped") aiConnections.splice(i, 1);
    }
  }

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
      id: defaultPoolId, type: "pool", label: "Company", poolType: "white-box",
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
  // A connector touching a Data Object / Data Store / Text Annotation is an
  // ASSOCIATION, not sequence flow — it must NOT influence column order (the AI
  // emits data links as "sequence", so they'd otherwise pull consumers to a new
  // column and leave a gap around the artifact, and can shove a gateway out of
  // topological order relative to its targets). Data artifacts are positioned by
  // R8.02/R8.03 instead. Skip these here, exactly like message flows.
  const DATA_ARTIFACT_TYPES = new Set(["data-object", "data-store", "text-annotation"]);
  const typeById = new Map(aiElements.map((e) => [e.id, e.type]));
  const isDataLink = (c: AiConnection) =>
    DATA_ARTIFACT_TYPES.has(typeById.get(c.sourceId) ?? "") ||
    DATA_ARTIFACT_TYPES.has(typeById.get(c.targetId) ?? "");
  for (const c of aiConnections) {
    if (c.type === "message") continue; // skip message flows for column layout
    if (isDataLink(c)) continue;        // skip data associations for column layout
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

  // ── R55.4: which elements belong to an EDGE-MOUNTED EVENT's sub-path ──
  //
  // An exception path must not compete with the main line for the lane centre.
  // R3.10 below stacks everything sharing a column symmetrically about that
  // centre, and an exception step lands in the same column as the main step
  // that follows its host — so attaching a boundary event silently pushed the
  // MAIN path off its own row. Measured: Task 8/9 at 370 but Task 10 at 323,
  // for no reason other than Task 16 existing beside it.
  //
  // Same walk as R55.3, on the plan graph: forward from the event's target
  // while each step is the exception's alone. A step something else also feeds
  // is where it rejoins, and belongs to the main line from there on.
  const emieSubPathIds = new Set<string>();
  for (const ev of aiElements) {
    if (!ev.boundaryHost) continue;
    const first = (outgoing.get(ev.id) ?? []).filter(c => c.type !== "message")[0];
    let cur: string | undefined = first?.targetId;
    let guard = 0;
    while (cur && guard++ < 200) {
      if (emieSubPathIds.has(cur)) break;
      const feeds = (incoming.get(cur) ?? []).filter(c => c.type !== "message");
      if (feeds.length > 1) break;
      emieSubPathIds.add(cur);
      const nx: AiConnection[] = (outgoing.get(cur) ?? []).filter(c => c.type !== "message");
      if (nx.length !== 1) break;
      cur = nx[0].targetId;
    }
  }
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
    // R6.02c (routing clearance): a Pool/Lane carrying process flow reserves
    // 1/2 Task-height of vertical clearance above the topmost and below the
    // bottommost element it contains (Paul 2026-07-12 — was 2× Task-height, which
    // left lanes very tall with elements floating in the middle). Elements are
    // vertically CENTRED in the band, so this symmetric buffer lands equally top
    // + bottom; the lane hugs its content. Must match VPAD in the overflow-grow
    // pass below (expandContainerToFitChildren) or the lane re-grows asymmetrically.
    const VCLEAR = Math.round(0.5 * taskDef.defaultHeight);
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
      // Each lane needs room for its tallest column stack + 2× Task-height above
      // and below (VCLEAR) — the R6.02c routing-clearance buffer.
      const vertBuffer = VCLEAR;
      const minLaneH = taskDef.defaultHeight + vertBuffer * 2;
      laneHeights.push(Math.max(minLaneH, maxStack * (taskDef.defaultHeight + 30) + vertBuffer * 2));
    }
    if (pLanes.length === 0) laneHeights.push(taskDef.defaultHeight + VCLEAR * 2);

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
        for (const [col, list0] of elsByCol) {
          // R55.4: the main line keeps the centre; an exception path stacks
          // BELOW it instead of splitting it. Order is otherwise unchanged.
          const mainEls = list0.filter(e => !emieSubPathIds.has(e.id));
          const excEls = list0.filter(e => emieSubPathIds.has(e.id));
          const list = mainEls.length > 0 ? [...mainEls, ...excEls] : list0;
          const n = mainEls.length > 0 ? mainEls.length : list.length;
          for (let i = 0; i < list.length; i++) {
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
            const rowOffset = (k: number) => n <= 2
              ? (k - (n - 1) / 2) * stackSpacing
              : (k - 1) * stackSpacing;
            // An exception member sits one row below the lowest main member,
            // so it never shifts the main line. R55.3 gives it its final row
            // once the host's own row is known.
            const stackOffset = i < n
              ? rowOffset(i)
              : rowOffset(n - 1) + (i - n + 1) * stackSpacing;
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
      // Single-row flow: width grows with the children's REAL fitted widths,
      // not a flat 140 per child. A three-line task name fits at 128 wide, so
      // the flat budget left 12px of gap; a four-line one would have overlapped.
      const rowW = normalChildren.reduce((t, c) => {
        const d = getSymbolDefinition(c.type as DiagramElement["type"]);
        return t + autoElementSize(c.type, c.label ?? "", c.taskType as string | undefined, d).w;
      }, 0);
      const rowGaps = Math.max(1, normalChildren.length - 1) * 38;
      neededW = Math.max(
        Math.max(2, normalChildren.length) * CHILD_COL_SPACING,
        rowW + rowGaps,
      ) + EXPANDED_PAD_X * 2;
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
      // Children are sized to their TEXT, exactly as top-level flow elements
      // already are. They used to be pushed at the catalogue default, so a name
      // like "Assess Sales Channel Fit and Distributor Viability" (128×81 when
      // fitted) was drawn in a 102×65 box and spilled outside it — worst inside
      // an expanded subprocess, which is where Paul saw it (2026-08-29).
      //
      // Sizing them makes the EVEN-SPREAD placement unsafe: it divided the
      // usable width by index and assumed every child was 102 wide, so a fitted
      // child could sit only 12px from its neighbour, and a four-line label
      // would overlap outright. So spread by ACTUAL width — the gap is what is
      // left over, shared equally, never less than CHILD_MIN_GAP.
      const sizes = ordered.map((ai) => {
        const d = getSymbolDefinition(ai.type as DiagramElement["type"]);
        return autoElementSize(ai.type, ai.label ?? "", ai.taskType as string | undefined, d);
      });
      const CHILD_MIN_GAP = 38;
      const totalW = sizes.reduce((t, s) => t + s.w, 0);
      const usableW = spEl.width - EXPANDED_PAD_X * 2;
      const gap = n <= 1 ? 0 : Math.max(CHILD_MIN_GAP, (usableW - totalW) / (n - 1));
      // A single child is centred; otherwise the run starts at the left pad and
      // the pen walks right by each child's own width plus the shared gap.
      let penX = n <= 1 ? spEl.width / 2 - (sizes[0]?.w ?? 0) / 2 : EXPANDED_PAD_X;
      for (let i = 0; i < n; i++) {
        const ai = ordered[i];
        const size = sizes[i];
        elements.push({
          id: ai.id, type: ai.type as DiagramElement["type"],
          x: spEl.x + penX,
          y: spEl.y + cyCentre - size.h / 2,
          width: size.w, height: size.h,
          label: ai.label, properties: buildProps(ai), parentId: spEl.id,
          ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
          ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
          ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
        });
        penX += size.w + gap;
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
      // The widest fitted child decides the column pitch for the whole grid,
      // so columns stay aligned and nothing overlaps its neighbour.
      const gridColW = gridChildren.reduce((w, c) => {
        const d = getSymbolDefinition(c.type as DiagramElement["type"]);
        return Math.max(w, autoElementSize(c.type, c.label ?? "", c.taskType as string | undefined, d).w + 38);
      }, 0);
      for (let i = 0; i < gridChildren.length; i++) {
        const ai = gridChildren[i];
        const col = i % CHILD_COLS;
        const row = Math.floor(i / CHILD_COLS) + rowOffset;
        const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
        // Sized to its text, like every other activity. The column PITCH stays
        // fixed so the grid keeps its shape; a child wider than the pitch is
        // centred in its cell and eats into the gap rather than the neighbour.
        const size = autoElementSize(ai.type, ai.label ?? "", ai.taskType as string | undefined, def);
        const pitch = Math.max(CHILD_COL_SPACING, gridColW);
        const cx = EXPANDED_PAD_X + col * pitch + pitch / 2;
        const cy = EXPANDED_PAD_Y + row * CHILD_ROW_SPACING + CHILD_ROW_SPACING / 2;
        elements.push({
          id: ai.id, type: ai.type as DiagramElement["type"],
          x: spEl.x + cx - size.w / 2,
          y: spEl.y + cy - size.h / 2,
          width: size.w, height: size.h,
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
          ex = host.x + host.width - 2 * W - i * (W + 10);
          ey = host.y - H / 2;
        } else { // bottom
          ex = host.x + host.width - 2 * W - i * (W + 10);
          ey = host.y + host.height - H / 2;
        }
        elements.push({
          id: ev.id, type: ev.type as DiagramElement["type"],
          x: ex, y: ey, width: W, height: H,
          label: ev.label,
          // R7.02: store boundarySide on the placed element so the wiring
          // pass can exit outgoing connectors from the connection point
          // furthest from the host edge the event is mounted on.
          properties: {
            ...buildProps(ev),
            boundarySide: side,
            // R7.05: an edge-mounted intermediate event's label defaults to the
            // OUTWARD side, biased WEST — so its outgoing sequence connector can
            // leave the event's outward edge cleanly (Paul 2026-08-19). R8.16
            // refines / de-overlaps this later using the wrapped height.
            ...(ev.type === "intermediate-event" ? boundaryLabelOffset(side, W, H) : {}),
          },
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
    // WHERE THESE GO, and why not a lane of their own. Dropping them at x=50
    // outside every pool is what made V06.08 read as a rendering fault rather
    // than a data one. A synthetic "Unplaced" LANE would be tidier on the canvas
    // and worse everywhere else: `entityLists/buildFromBpmn` turns Lane into an
    // OrgUnit in the organisation hierarchy, and `simulation/assemble` reads a
    // lane as the performer of its work — so a fake lane becomes a fake
    // department and a fake resource pool, in features nobody was looking at.
    //
    // So they go into a REAL container — the white-box pool's first lane, below
    // its content — and carry an annotation saying why. Marked, not disguised.
    const host = elements.find((e) => e.type === "lane" && whiteBoxPools.some((p) => e.parentId === p.id))
      ?? elements.find((e) => e.type === "pool" && whiteBoxPools.some((p) => p.id === e.id));
    const siblings = host ? elements.filter((e) => e.parentId === host.id) : [];
    // Placed AFTER the flow, on its row — not beneath it. Anything below the last
    // element pushes past the lane's bottom edge, and the lane hugs its content
    // (R6.02c), so it would hang outside the very container it was put in.
    let floatX = siblings.length ? Math.max(...siblings.map((e) => e.x + e.width)) + 90 : (host ? host.x + 90 : 50);
    const floatY = siblings.length
      ? Math.round(siblings.reduce((t, e) => t + e.y + e.height / 2, 0) / siblings.length)
      : (host ? host.y + 40 : 100);
    for (const ai of unplacedEls) {
      const def = getSymbolDefinition(ai.type as DiagramElement["type"]);
      const size = autoElementSize(ai.type, ai.label ?? "", ai.taskType as string | undefined, def);
      elements.push({
        id: ai.id, type: ai.type as DiagramElement["type"],
        x: floatX, y: Math.round(floatY - size.h / 2), width: size.w, height: size.h,
        label: ai.label, properties: buildProps(ai),
        ...(host ? { parentId: host.id } : {}),
        ...(ai.taskType ? { taskType: ai.taskType as DiagramElement["taskType"] } : {}),
        ...(ai.gatewayType ? { gatewayType: ai.gatewayType as DiagramElement["gatewayType"] } : {}),
        ...(ai.eventType ? { eventType: ai.eventType as DiagramElement["eventType"] } : {}),
      });
      // Say WHAT it was carrying, not just that it failed. "nothing placed it"
      // is true and useless: V06.08 came back with eighteen of them and no way
      // to tell whether the plan named a container that was fine, a container
      // that was dropped, or no container at all. The four fields below are
      // exactly what every placement pass keys off.
      const carried = [
        ai.pool ? `pool=${ai.pool}` : null,
        ai.lane ? `lane=${ai.lane}` : null,
        ai.parentSubprocess ? `parentSubprocess=${ai.parentSubprocess}` : null,
        ai.boundaryHost ? `boundaryHost=${ai.boundaryHost}` : null,
      ].filter(Boolean).join(", ") || "no pool, lane, parentSubprocess or boundaryHost";
      diagnose({
        kind: "unplaced", elementId: ai.id, label: ai.label ?? "",
        detail: host
          ? `nothing placed it (${carried}); parked at the end of "${host.label ?? host.type}"`
          : `nothing placed it (${carried}), and there is no white-box pool to park it in`,
      });
      floatX += def.defaultWidth + 40;
    }
  }

  // An Expanded Subprocess with nothing in it is always a fault — either its
  // children named it wrongly (see the dangling-reference pass) or the plan
  // never gave it any. It draws as an empty box and reads as a bug.
  for (const ep of elements) {
    if (ep.type !== "subprocess-expanded") continue;
    if (elements.some((e) => e.parentId === ep.id && !e.boundaryHostId)) continue;
    diagnose({ kind: "empty-subprocess", elementId: ep.id, label: ep.label ?? "", detail: "no children — it will draw as an empty box" });
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
  function fitLanesToChildren(hug = false) {
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
    // Final-pass "hug": size each lane band to hug its content EXACTLY (shrink
    // OR grow), leaving 1 Task-height of clearance top & bottom. The initial
    // lane sizing reserves `maxStack × (taskH+30)`, which badly over-estimates
    // when a lane's activities spread across many columns instead of stacking
    // in one — leaving hundreds of px of dead space (the "Loan Assessment Team"
    // lane was 1151px tall for 486px of content). This collapses that. It runs
    // as the very last layout mutation, right before connectors route once, so
    // there's no re-routing and same-lane horizontal flow is preserved (both
    // endpoints of a same-lane connector move by the same dy).
    const HUG_VPAD = getSymbolDefinition("task").defaultHeight;   // 1 × Task-height
    const LANE_FLOOR = getSymbolDefinition("task").defaultHeight + HUG_VPAD * 2;
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
        if (hug) {
          const top = minY - HUG_VPAD;
          let h = (maxY + HUG_VPAD) - top;
          if (h < LANE_FLOOR) h = LANE_FLOOR;   // never thinner than one Task + clearance
          lane.y = top;
          lane.height = h;
        } else {
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
    // R6.02c: keep 1/2 Task-height of clearance below the lowest child (matching
    // the top clearance built into lane sizing / VCLEAR) so overflow growth stays
    // symmetric and the lane hugs its content.
    const VPAD = Math.round(0.5 * getSymbolDefinition("task").defaultHeight);
    const neededW = maxRight - container.x + PAD;
    const neededH = maxBottom - container.y + VPAD;
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
        snapBoundaryEventToRim(be, nx, ny, nw, nh);
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
  // "_ai_gen_annotation" is skipped. Nothing creates one any more (see the note
  // where R56 used to be), but a diagram generated before that still carries one
  // in its stored data, and re-laying it out must leave it where the author last
  // saw it rather than dragging it to a new position. Runs before connector
  // waypoints are computed so the association routes short.
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
  /** Each decision branch's position in the PLAN, kept because the list below is
   *  re-sorted by target Y and that ordering is a mid-layout artifact: a tall
   *  subprocess has a lower centre than a gateway on the same row purely because
   *  it is tall. R6.26 needs the order a reader meets the branches in. */
  const branchPlanIndex = new Map<AiConnection, number>();
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
    // A branch that ENDS never reaches a merge, and must not veto the pairing.
    // Paul, 2026-09-01: "some sub-paths may end before their Merge." Requiring
    // every branch to arrive silently unpaired any decision with one terminating
    // branch — on "gateway Lanes generation Test 3", "Complexity?" had three
    // branches, two rejoining and one ending at "Complexes Are Too Hard End", so
    // its merge was never levelled and sat 200px below the decision while the
    // two-branch gateways beside it were fine.
    const rejoining = branchMerges.filter(s => s.size > 0);
    if (rejoining.length < 2) return undefined;          // not a join at all
    const common = [...rejoining[0]].filter(m => rejoining.every(s => s.has(m)));
    if (common.length === 0) return undefined;
    const byCol = (a: string, b: string) => (colMap.get(a) ?? 0) - (colMap.get(b) ?? 0);
    // Prefer a merge whose in-degree matches the number of branches that really
    // arrive — which equals the branch count only when none of them end.
    const matching = common.filter(m => {
      const deg = incomingCount.get(m) ?? 0;
      return deg === rejoining.length || deg === outConns.length;
    });
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
        // Move the whole element, not just the box: a task's edge-mounted
        // events are positioned ON its rim, and setting `y` directly left them
        // behind. They then sat 60-100px off the host, looked unattached, and
        // sprang back to the rim the moment the editor touched them (Paul
        // 2026-08-31, V23.01 "Visit overdue" / "Self-read deadline elapsed").
        const dy = (decCentreY + offset - br.height / 2) - br.y;
        if (dy !== 0) { shiftSubtree(br.id, dy); br.y += dy; }
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
    const branchAnchors: { cy: number; parentId?: string }[] = [];
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
        branchAnchors.push({ cy: anchor.y + anchor.height / 2, parentId: anchor.parentId });
        branchParentIds.add(anchor.parentId);
      }
    }

    // Only re-centre when branches genuinely span multiple lanes —
    // otherwise R3.09's predecessor anchor reads better. Require ≥ 2
    // anchors found, and at least one anchor in a different parent
    // from the decision (so we know lanes are actually spanned).
    if (branchAnchorYs.length < 2) continue;
    // Fully cross-lane fan = NONE of the branches stays in the decision's own
    // lane. The diamond would otherwise be clamped to its (upstream) lane, far
    // above the branches. Instead RE-HOME the decision + its paired merge to the
    // MIDDLE branch's lane and align them with that middle element, so the pair
    // reads as owned by the lane its branches actually live in.
    const fullyCrossLane = !branchParentIds.has(dec.parentId);
    const spansMultipleParents = branchParentIds.size > 1 || fullyCrossLane;
    if (!spansMultipleParents) continue;

    const mergeId = findPairedMerge(dec.id);
    const merge = mergeId ? elMap.get(mergeId) : undefined;

    if (fullyCrossLane) {
      // Median branch by Y = the middle element (e.g. "Home Loan" of 3). Re-home
      // the decision + merge to that lane and align them with the middle element,
      // so the pair is owned by (and drawn inside) the lane its branches live in.
      const sorted = [...branchAnchors].sort((a, b) => a.cy - b.cy);
      const mid = sorted[Math.floor((sorted.length - 1) / 2)];
      dec.y = mid.cy - dec.height / 2;
      if (mid.parentId) dec.parentId = mid.parentId;
      if (merge) {
        merge.y = mid.cy - merge.height / 2;
        if (mid.parentId) merge.parentId = mid.parentId;
      }
      continue;
    }

    // Partial cross-lane (some branches stay in the decision's lane): keep the
    // diamond in place, centred on the average branch Y.
    const midY = branchAnchorYs.reduce((s, y) => s + y, 0) / branchAnchorYs.length;
    dec.y = midY - dec.height / 2;
    if (merge) merge.y = midY - merge.height / 2;
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
  // Gaps between a generated data object and its element — 50% longer than the
  // original tight hug (30/20) so the association reads clearly (Paul 2026-07-28).
  const DATA_GAP = 45; // horizontal gap between data and element
  const DATA_VGAP = 30; // vertical gap when above/below the element
  // Track occupied quadrants per associated element so two data objects
  // sharing the same task don't stack on top of each other.
  // Run TWICE: here (so R57 / R6.05 grow the lane to fit the data object) and
  // AGAIN after the element-movement passes below — a data object is parented to
  // the LANE, not to its activity, so when the activity is later shifted the
  // data object wouldn't follow and would strand far from its element. The
  // second pass re-hugs each data object to its associated element's FINAL
  // position (Paul 2026-07-12).
  function positionDataObjectsR802() {
  const usedQuadrants = new Map<string, Set<"UL" | "LL" | "UR" | "LR">>();
  for (const el of elements) {
    if (el.type !== "data-object") continue;
    // Find the FIRST connector touching this data object. ANY connector
    // touching a data object IS an association — BPMN forbids real sequence /
    // message flow on data artifacts, and the layout re-types them to
    // associationBPMN later. The AI plan can only emit "sequence" / "message"
    // types (planBpmn), so it sends data links as "sequence"; matching by
    // ENDPOINT (not by excluding those types) is what lets R8.02 find them.
    const links = aiConnections.filter(
      (c) => c.sourceId === el.id || c.targetId === el.id,
    );
    const conn = links[0];
    if (!conn) continue;
    const isOutput = conn.sourceId !== el.id; // element → data → output
    const associatedId = isOutput ? conn.sourceId : conn.targetId;
    const associated = elMap.get(associatedId);
    if (!associated) continue;
    // Stamp the role property so rendering reflects placement.
    //
    // A data object that is BOTH written and read — an element → data
    // association AND a data → element one — is neither an input nor an output,
    // and carries NO marker (Paul, 2026-08-29; V06.08 had four wrongly showing
    // the output marker). The role used to be read off whichever association
    // happened to be first in the list, which for a read/write object is
    // arbitrary.
    const writtenTo = links.some((c) => c.targetId === el.id); // element → data
    const readFrom = links.some((c) => c.sourceId === el.id);  // data → element
    const role = writtenTo && readFrom ? undefined : writtenTo ? "output" : "input";
    const props = { ...el.properties };
    if (role) props.role = role; else delete props.role;
    el.properties = props;
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
  }
  positionDataObjectsR802();

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
    // Every connector touching a data store is an association (see R8.02 note);
    // match by ENDPOINT, not by excluding "sequence"/"message", so the AI's
    // sequence-typed data links are found.
    const conns = aiConnections.filter(
      (c) => c.sourceId === el.id || c.targetId === el.id,
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

  // ── R55.2: every path is given its own ROW, hierarchically ──
  //
  // R55 fans a decision's immediate targets around ITS OWN centre with a fixed
  // spacing. That is right for one level and wrong for two: a nested decision has
  // no idea the rows above and below are already spoken for, so its sub-paths
  // land on their uncles. Measured on a two-level example: path 2.1 sat exactly
  // on path 1, and 2.3 exactly on path 3.
  //
  // `analysePaths` builds the path tree — 1, 2, 2.1, 2.3 — and allocates rows by
  // an in-order walk, which is the order Paul drew (2026-09-01): everything
  // above, the trunk, everything below. The middle branch keeps the trunk so the
  // main line runs straight through, and a path that ENDS instead of rejoining
  // its merge owns a row like any other.
  //
  // Only same-container paths are moved, as R55 already restricted itself to:
  // a branch that crosses into another lane belongs to that lane's own stacking.
  const pathStackOwns = new Set<string>();
  {
    const DATA_T = new Set(["data-object", "data-store", "text-annotation"]);
    // autoConns are built later; the plan's own flows are what define the paths.
    const edges = [...aiConnections]
      .filter(c => c.type !== "message"
        && !DATA_T.has(elMap.get(c.sourceId)?.type ?? "")
        && !DATA_T.has(elMap.get(c.targetId)?.type ?? ""))
      .map(c => ({ sourceId: c.sourceId, targetId: c.targetId, label: c.label ?? null }));

    // The trunk keeps the row the flow already has, so this re-arranges branches
    // without dragging the main line somewhere new.
    const firstDecision = elements.find(e => isDecisionGateway(e));
    if (firstDecision) {
      const analysis = analysePaths({
        elements: elements.map(e => ({ id: e.id, height: e.height, type: e.type, parentId: e.parentId })),
        edges,
        isDecision: (id) => { const e = elMap.get(id); return !!e && isDecisionGateway(e); },
        mergeFor: (id) => findPairedMerge(id),
        trunkRow: firstDecision.y + firstDecision.height / 2,
        // R55.3: an edge-mounted event opens an exception path, which takes a
        // row of its own in this stack rather than being positioned relative to
        // its host afterwards and hoping the row is free.
        boundaryEventsOn: (id) => elements
          .filter(e => e.boundaryHostId === id && (outgoing.get(e.id) ?? []).some(c => c.type !== "message"))
          .map(e => ({
            id: e.id,
            side: ((e.properties?.boundarySide as string | undefined) ?? "bottom") === "top"
              ? "top" as const : "bottom" as const,
          })),
      });

      let moved = false;
      for (const [elId] of analysis.pathOf) {
        const el = elMap.get(elId);
        // Per ELEMENT, not per path id. Path ids are not unique — every root
        // walk is called "trunk" and independent forks both number their
        // children 1, 2, 3 — so looking a row up by id returns whichever path
        // was written last. That is what put the start event at the bottom of
        // the lane across the V23 diagrams.
        const row = analysis.rowOfElement.get(elId);
        if (!el || row === undefined) continue;
        if (isGateway(el)) continue;                       // R8.01/R8.24 own gateway Y
        if (el.parentId !== firstDecision.parentId) continue;  // another lane's business
        pathStackOwns.add(el.id);                          // R55.3 must not re-place it
        const dy = row - (el.y + el.height / 2);
        if (Math.abs(dy) < 0.5) continue;
        shiftSubtree(el.id, dy);                           // boundary events travel too
        el.y += dy;
        moved = true;
      }

      // Re-grow the owning container. Spreading paths onto their own rows makes
      // the stack TALLER than whatever the container was sized for, and the lane
      // fit below only grows lane BANDS — a pool with no lanes of its own would
      // otherwise be left with its top row hanging outside it.
      if (moved && firstDecision.parentId) {
        const owner = elMap.get(firstDecision.parentId);
        if (owner?.type === "pool" || owner?.type === "lane") {
          // A lane is grown by `fitLanesToChildren` immediately below, which does
          // cover the top edge. A POOL WITHOUT LANES has nothing that does —
          // `expandContainerToFitChildren` only ever grows right and bottom,
          // because until now nothing pushed a child ABOVE its container. The
          // topmost path does exactly that, so it is handled here.
          if (owner.type === "pool" && !elements.some(e => e.type === "lane" && e.parentId === owner.id)) {
            const kids = elements.filter(e => e.parentId === owner.id);
            const top = Math.min(...kids.map(e => e.y));
            const need = (owner.y + 30) - top;
            if (need > 0) { owner.y -= need; owner.height += need; }
          }
          expandContainerToFitChildren(owner.id, owner.type);
          restackPoolsR52();               // growth may have closed a pool gap
        }
      }
    }
  }

  // ── R55.3: an edge-mounted event's sub-path takes a ROW OF ITS OWN ──
  //
  // Paul, 2026-09-01: "EMIEs often further divide a path and then are reunited,
  // or not at the gateway Merge!" In his lanes drawing Event 2 hangs off Task 9
  // and its exception path — Task 16, "Error Occurred End" — runs on its OWN
  // line below Path 3, never on top of it.
  //
  // R55.2 cannot reach this. It only moves elements sharing the FIRST decision's
  // container, so an exception path in another lane is out of scope, and that
  // lane's own centring then drops it on the same row as the path it branches
  // off. Measured on the lanes example before this pass: "SHARE A ROW: Path 3
  // (Mkt) and EMIE sub-path at 719" — one line carrying two paths.
  //
  // The sub-path goes to the side the event is already mounted on, so the flow
  // leaves the event in the direction it faces. A step that something else also
  // feeds is where the exception REJOINS the main line: it belongs to that line,
  // so the walk stops there rather than dragging the shared tail down with it.
  {
    const SUBPATH_GAP = 34;
    for (const ev of elements) {
      if (!ev.boundaryHostId) continue;
      const host = elMap.get(ev.boundaryHostId);
      if (!host) continue;
      const firstOut = (outgoing.get(ev.id) ?? []).filter(c => c.type !== "message")[0];
      if (!firstOut) continue;

      const chain: DiagramElement[] = [];
      const seen = new Set<string>();
      let cur = elMap.get(firstOut.targetId);
      let guard = 0;
      while (cur && guard++ < 200) {
        if (seen.has(cur.id)) break;
        if (cur.parentId !== host.parentId) break;        // another lane's stacking
        if (isGateway(cur)) break;                        // R8.01/R8.24 own gateway Y
        const feeds = (incoming.get(cur.id) ?? []).filter(c => c.type !== "message");
        if (feeds.length > 1) break;                      // rejoins the main line here
        seen.add(cur.id);
        chain.push(cur);
        const nx = (outgoing.get(cur.id) ?? []).filter(c => c.type !== "message");
        if (nx.length !== 1) break;
        cur = elMap.get(nx[0].targetId);
      }
      if (chain.length === 0) continue;
      // Where the path stack already gave these elements a row, it wins: it
      // knows what the neighbouring rows hold, and this rule does not. Placing
      // the sub-path relative to its host without asking what occupies that row
      // is what drew Task 16 over Task 6 in "Gateway EIME Test 2". This is now
      // the fallback for containers the stack does not cover.
      if (chain.every(e => pathStackOwns.has(e.id))) continue;

      // The stored side is authoritative (R7.02 stamps it at placement); where
      // it is absent, the event is already sitting on the rim, so read it off
      // the geometry rather than guessing a default.
      const stored = ev.properties?.boundarySide as string | undefined;
      const above = (ev.y + ev.height / 2) < (host.y + host.height / 2);
      const side = (stored ? stored === "top" : above) ? -1 : 1;
      const hostRow = host.y + host.height / 2;
      const tallest = Math.max(...chain.map(e => e.height));
      const want = hostRow + side * (host.height / 2 + SUBPATH_GAP + tallest / 2);
      for (const el of chain) {
        const dy = want - (el.y + el.height / 2);
        if (Math.abs(dy) < 0.5) continue;
        shiftSubtree(el.id, dy);                          // its own edge events travel too
        el.y += dy;
      }
    }
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
      branchPlanIndex.set(c, list.length);
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
  // then connect"). Extracted so it can re-run after the Start/End tightening
  // pass (which drags an EP's internal end-event left, otherwise leaving the EP
  // box slack on the right — R8.20).
  function wrapEpsToChildren() {
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
      // R8.27 — the box must enclose each child's rendered LABEL too, not just
      // its shape. An event inside an EP draws its name BELOW itself, so hugging
      // to shapes alone left a three-line name hanging through the EP's bottom
      // edge (Paul 2026-08-31). `externalLabelBox` returns null for a task,
      // whose name is inside its own box, so this only extends where it should.
      const ext = kids.map(c => {
        const b = { l: c.x, t: c.y, r: c.x + c.width, b: c.y + c.height };
        const lb = externalLabelBox(c);
        if (lb) {
          b.l = Math.min(b.l, lb.x); b.t = Math.min(b.t, lb.y);
          b.r = Math.max(b.r, lb.x + lb.w); b.b = Math.max(b.b, lb.y + lb.h);
        }
        return b;
      });
      const minX = Math.min(...ext.map(b => b.l));
      const minY = Math.min(...ext.map(b => b.t));
      const maxX = Math.max(...ext.map(b => b.r));
      const maxY = Math.max(...ext.map(b => b.b));
      const nx = minX - SIDE_PAD, ny = minY - TOP_PAD;
      const nw = (maxX + SIDE_PAD) - nx, nh = (maxY + SIDE_PAD) - ny;
      if (Math.abs(nx - ep.x) <= 0.5 && Math.abs(ny - ep.y) <= 0.5
        && Math.abs(nw - ep.width) <= 0.5 && Math.abs(nh - ep.height) <= 0.5) continue;
      ep.x = nx; ep.y = ny; ep.width = nw; ep.height = nh;
      // Re-snap edge-mounted boundary events onto the new rim.
      for (const be of elements) {
        if (be.boundaryHostId !== ep.id) continue;
        snapBoundaryEventToRim(be, nx, ny, nw, nh);
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
  wrapEpsToChildren();

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
      const gc = colMap.get(g.id);
      for (const sid of incoming.get(g.id) ?? []) {
        const s = elById.get(sid);
        if (!s) continue;
        // Skip LOOP-BACK sources: a rework/iteration edge feeds the merge from a
        // node at the merge's own column or beyond (a back-edge). It isn't an
        // upstream branch, so pushing the merge to its right would shove the merge
        // PAST its own loop — tearing a huge horizontal gap. Genuine upstream
        // branches (incl. a wide wrapped EP) sit at a smaller column and still count.
        const sc = colMap.get(sid);
        if (sc !== undefined && gc !== undefined && sc >= gc) continue;
        maxRight = Math.max(maxRight, s.x + s.width);
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
  function applyUniformPoolWidth() {
    const POOL_PAD = 50;
    const topPools = elements.filter(e => e.type === "pool" && !e.parentId);
    if (topPools.length === 0) return;
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
    if (!isFinite(maxRight)) return;
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
  applyUniformPoolWidth();

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

    // A link between a Compensation event and a Compensation activity is a directed
    // Association (dashed, open arrow) — never a sequence flow.
    const isCompensationAssoc =
      (src.eventType === "compensation" && tgt.properties?.isForCompensation === true) ||
      (tgt.eventType === "compensation" && src.properties?.isForCompensation === true);
    const isAssociation = DATA_ASSOC_TYPES.has(src.type) || DATA_ASSOC_TYPES.has(tgt.type) || isCompensationAssoc;
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

      // Gateway wiring (catalog R6.26–R6.29 · legacy code tags R6.16/R6.17/R6.19):
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
          // R3.10/R3.11 (decision side): a Decision gateway (any type) attaches from
          // its TOP connection point to a target above it and its BOTTOM point to a
          // target below it (index 0 → top, index ≥ 2 → bottom; middles → right). For
          // n=2 the top/bottom choice is made ONLY when the target is actually above/
          // below the gateway box — a target level with the gateway exits "right" so
          // the route doesn't jog up/down INTO the target body, and the branch label
          // doesn't pile onto the gateway (surfaced by book-trip-allornothing).
          const list = decisionOutgoings.get(src.id) ?? [];
          const idx = list.indexOf(c);
          const n = list.length;
          if (idx < 0 || n <= 1) srcSide = "right";
          else if (n === 2) {
            // R6.26 (n = 2): the two branches take TOP and BOTTOM — never the
            // same vertex, and not "right", because Paul's order is top, then
            // bottom, and only then the middle-right point (2026-08-31).
            //
            // This used to send a branch level with the gateway out to the
            // right, on the reasoning that top/bottom would jog the route into
            // a target sitting on the same row. Both branches were level here,
            // so both answered the same way and the two flows left the diamond
            // from one point, stacked on each other. R8.26 removes the original
            // hazard from the other end: a branch's subprocess is now placed on
            // the side its branch leaves from, so there is no body in the way.
            //
            // A target that CLEARS the diamond keeps its natural direction;
            // otherwise the branches take top and bottom in the order the plan
            // lists them, which is the order a reader meets them.
            // Order comes from the PLAN, not from target Y: at this point the
            // targets are still provisionally placed, and a tall subprocess has
            // a lower centre than the gateway merely because it is tall — which
            // is how both branches came to read as "below" and answer the same.
            // The exception is a pair that genuinely straddles the gateway, one
            // clearly above and one clearly below, where the geometry is real
            // and should win.
            const other = list[1 - idx];
            const otherTgt = other ? elMap.get(other.targetId) : undefined;
            const otherCy = otherTgt ? otherTgt.y + otherTgt.height / 2 : tgtCy;
            const above = (y: number) => y < src.y - 10;
            const below = (y: number) => y > src.y + src.height + 10;
            const straddles = (above(tgtCy) && below(otherCy)) || (below(tgtCy) && above(otherCy));
            srcSide = straddles
              ? (above(tgtCy) ? "top" : "bottom")
              : ((branchPlanIndex.get(c) ?? idx) === 0 ? "top" : "bottom");
          }
          // R6.27 (n ≥ 3): branches are sorted by target Y; assign vertices
          // round-robin in groups of three — top / right / bottom, then repeat
          // for the next three, so doubled-up branches reuse the same three
          // vertices in vertical order (Paul 2026-08-20). Flows sharing a vertex
          // fan out from it (R6.29).
          else srcSide = (["top", "right", "bottom"] as const)[idx % 3];
        } else if (srcIsMerge) {
          // R6.28 — a merge's outgoing flow leaves by the RIGHT vertex, and in
          // any case never by one an incoming flow already occupies. Paul
          // (2026-08-31): "always the right-hand vertex, or any of the top,
          // bottom, right-hand vertices that are not used."
          //
          // The incoming sides are assigned by this same pass, so which vertices
          // are taken is known rather than guessed. They never claim `right`
          // today, so this resolves to `right` — it is written as a search so a
          // future change to the incoming rule cannot silently produce a shared
          // vertex, which is the fault this replaces.
          const inList = mergeIncomings.get(src.id) ?? [];
          const usedByIncoming = new Set<string>();
          if (inList.length <= 1) usedByIncoming.add("left");
          else if (inList.length === 2) { usedByIncoming.add("top"); usedByIncoming.add("bottom"); }
          else for (let k = 0; k < inList.length; k++) {
            usedByIncoming.add((["top", "left", "bottom"] as const)[k % 3]);
          }
          srcSide = (["right", "top", "bottom"] as const).find(v => !usedByIncoming.has(v)) ?? "right";
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
          // R6.28 (n ≥ 3): mirror of the decision — sorted by source Y,
          // round-robin top / left / bottom in groups of three.
          else tgtSide = (["top", "left", "bottom"] as const)[idx % 3];
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
        const s = sideFacing(tgt, _srcCx, _srcCy);
        // Issue 4: a connector FROM a Decision gateway always attaches to the
        // target's nearest VERTICAL boundary (left/right), never top/bottom —
        // so every branch reads horizontally out of the gateway. Overrides the
        // generic R3.06 top/bottom choice for an above/below event target.
        tgtSide = (isDecisionGateway(src) && (s === "top" || s === "bottom"))
          ? (_srcCx <= _tgtCx ? "left" : "right")
          : s;
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
        !EVENT_TYPES.has(src.type) && !EVENT_TYPES.has(tgt.type) &&
        // A MERGE gateway's outgoing vertex belongs to R6.28, not to this rule.
        // The staple fires on "target is to the left of source", and at this
        // point in the layout the merge's follower often still IS to its left —
        // later passes move it right, but the side was already stapled to
        // bottom→bottom and is never revisited. That put the outgoing flow on a
        // vertex an incoming flow was already using (Paul 2026-08-31). The
        // comment on the event rules above already says gateways have their own
        // side rules; this is that exclusion applied where it was missing.
        !isMergeGateway(src)
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
      // NOTE: the corner-aware exit side (issue 2) is re-derived from FINAL
      // geometry in the computedConnectors pass below (pickBoundaryEventSide) —
      // it can't be decided here because the EP re-tighten hasn't run yet.
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
    // Associations route "direct" (short diagonal) EXCEPT the compensation
    // association, which — like a sequence flow — routes rectilinearly.
    const routingTypeFinal: "rectilinear" | "direct" =
      connType === "associationBPMN" && !isCompensationAssoc ? "direct" : "rectilinear";

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
      // R6.29: A gateway is a DIAMOND — its only valid attachment points are its
      // four vertices (offset 0.5 on each side). Never spread gateway ends off the
      // vertex: any other offset lands mid-edge on the sloped diamond, which
      // reads as "the connector isn't joined to the vertex, just near it"
      // (Paul 2026-07-12). Multiple flows on the same face share the vertex —
      // BPMN-correct, they fan out from it.
      if (el.type === "gateway") {
        for (const e of ends) { if (e.isSource) e.c.sourceOffsetAlong = 0.5; else e.c.targetOffsetAlong = 0.5; }
        continue;
      }
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

    /** Is `maybeAncestorId` a container of `id`? (Containers never obstruct.) */
    const isAncestorOf = (maybeAncestorId: string, id: string): boolean => {
      let cur = byIdSE.get(id);
      for (let d = 0; cur?.parentId && d < 16; d++) {
        if (cur.parentId === maybeAncestorId) return true;
        cur = byIdSE.get(cur.parentId);
      }
      return false;
    };

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
        // Main pool: move the first element AND everything downstream of it,
        // the way the EP branch already moves its whole inner flow.
        //
        // Moving the first element ALONE closes the gap after the Start and
        // opens an identical one at the very next link — V06.06 came back with
        // 1,524px of nothing between "Review Solution Design Scope" and
        // "Retrieve Design Specifications", and the Start-to-first gap sitting
        // at exactly MAX_CONN, which is this rule's fingerprint. The hole was
        // not removed, it was relocated one link along.
        const moved = new Set<string>();
        {
          const stack = [t.id];
          while (stack.length) {
            const id = stack.pop()!;
            if (moved.has(id)) continue;
            for (const m of movableWith(id)) moved.add(m);
            // Boundary events ride their host — they hang off boundaryHostId,
            // not parentId, so a subtree walk alone leaves them behind.
            for (const be of elements) if (be.boundaryHostId === id) moved.add(be.id);
            for (const c of connectors) {
              if (c.type === "sequence" && c.sourceId === id && !moved.has(c.targetId)) stack.push(c.targetId);
            }
          }
        }
        moved.delete(s.id); // the Start is the anchor, it never moves here
        // Clamp the slide so nothing that is moving runs into something that is
        // not. The Start itself is one such obstacle, and on a clean flow it is
        // the binding one — which reproduces the old distance exactly.
        let limit = dx;
        for (const id of moved) {
          const m = byIdSE.get(id);
          if (!m) continue;
          for (const o of elements) {
            if (moved.has(o.id) || o.id === m.id) continue;
            if (o.type === "pool" || o.type === "lane" || o.type === "sublane") continue;
            if (isAncestorOf(o.id, m.id)) continue;      // its own container
            if (o.x + o.width > m.x) continue;            // not to its left
            if (!(m.y < o.y + o.height && o.y < m.y + m.height)) continue; // different row
            limit = Math.min(limit, m.x - (o.x + o.width) - MAX_CONN);
          }
        }
        if (limit > 0) shiftX(moved, -limit);
      }
    }

    // R8.18 — pull each End event left to hug its last element (pool + EP).
    //
    // The pull is CLAMPED by what already occupies the space it would move
    // through. An End event's predecessor on the sequence flow is not
    // necessarily the rightmost thing on its row: an element the model left off
    // the chain (a stray task inside an EP, a branch that never rejoins, a
    // second End event hanging off a mid-flow task) sits between them. Pulling
    // the End back to `predecessor + 70` then drops it straight on top of that
    // element — the −93px and −17px overlaps seen inside V06's Expanded
    // Subprocesses. Hug the predecessor, but never move left past a sibling.
    for (const e of elements) {
      if (e.type !== "end-event" || e.boundaryHostId) continue;
      const ins = connectors.filter((c) => c.type === "sequence" && c.targetId === e.id);
      let maxRight = -Infinity;
      for (const c of ins) {
        const src = byIdSE.get(c.sourceId);
        if (src && src.id !== e.id) maxRight = Math.max(maxRight, src.x + src.width);
      }
      if (!isFinite(maxRight)) continue;
      // Anything sharing the End's row, left of it, that the pull would cross.
      for (const o of elements) {
        if (o.id === e.id || o.parentId !== e.parentId) continue;
        if (o.boundaryHostId) continue;
        if (o.type === "data-object" || o.type === "data-store" || o.type === "text-annotation") continue; // inert
        if (o.x >= e.x) continue;                        // already right of the End
        if (!(e.y < o.y + o.height && o.y < e.y + e.height)) continue; // different row
        maxRight = Math.max(maxRight, o.x + o.width);
      }
      if (e.x - maxRight > MAX_CONN) e.x = maxRight + MAX_CONN;
    }
  }

  // ── R8.20: re-tighten EP boxes after Start/End tightening ── the pass above can
  // drag an EP's internal End event LEFT to hug its predecessor, leaving the EP
  // box slack on the right (a large empty gap). Re-hug every EP to its rightmost
  // real child now (and re-snap its boundary events onto the corrected rim).
  wrapEpsToChildren();

  const LANE_EDGE_PAD = 8;

  /** The lane band an element belongs to — by container chain, else by the
   *  band its centre sits in (a boundary event has no parentId of its own). */
  const laneBandFor = (el: DiagramElement): DiagramElement | undefined => {
    let p: string | undefined = el.boundaryHostId ?? el.parentId;
    for (let guard = 0; p && guard < 20; guard++) {
      const c = elMap.get(p);
      if (!c) break;
      if (c.type === "lane" || c.type === "sublane") return c;
      p = c.parentId;
    }
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    return elements.find(l => (l.type === "lane" || l.type === "sublane")
      && cx >= l.x && cx <= l.x + l.width && cy >= l.y && cy <= l.y + l.height);
  };

  /** Grow a lane band (with its pool, and the bands stacked after it) so the
   *  span [top, bottom] fits. Growing upward leaves the band's own children
   *  where they are — the band expands around them, as fitLanesToChildren does. */
  const growLaneBandToContain = (band: DiagramElement, top: number, bottom: number) => {
    const dTop = Math.max(0, band.y - top);
    const dBot = Math.max(0, bottom - (band.y + band.height));
    if (dTop === 0 && dBot === 0) return;
    const oldY = band.y;
    band.y -= dTop;
    band.height += dTop + dBot;
    const pool = band.parentId ? elMap.get(band.parentId) : undefined;
    if (pool) {
      for (const s of elements) {
        if (s.type !== band.type || s.parentId !== pool.id || s.id === band.id) continue;
        if (s.y <= oldY) continue;                       // only the bands BELOW move
        s.y += dTop + dBot;
        shiftSubtree(s.id, dTop + dBot);
      }
      pool.y -= dTop;
      pool.height += dTop + dBot;
      restackPoolsR52();                                 // R8.03: pools may now overlap
    }
  };

  // ── R8.16: nudge event labels clear of other elements + other event labels ──
  // Event labels (especially edge-mounted/boundary events) default to a fixed
  // offset; when that lands the label on top of a neighbouring element or another
  // event's label, slide it to the first candidate offset that is clear. Only
  // labelOffsetX/Y change — labels don't affect routing — so this is safe, and a
  // label that already clears is left untouched. Guarded by B33.
  {
    const LH = 14; // label line height (matches SymbolRenderer + B33)
    const EVT = new Set(["start-event", "end-event", "intermediate-event"]);
    const BODY = new Set([
      "task", "subprocess", "subprocess-expanded", "start-event", "end-event",
      "intermediate-event", "gateway", "data-object", "data-store",
    ]);
    const byIdLbl = new Map(elements.map((e) => [e.id, e]));
    const isAncestor = (anc: DiagramElement, node: DiagramElement): boolean => {
      let cur: DiagramElement | undefined = node;
      for (let i = 0; i < 32 && cur; i++) {
        const nid = cur.boundaryHostId ?? cur.parentId;
        if (!nid) return false;
        if (nid === anc.id) return true;
        cur = byIdLbl.get(nid);
      }
      return false;
    };
    type R = { x: number; y: number; w: number; h: number };
    const hit = (a: R, b: R, tol: number) =>
      Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tol &&
      Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tol;
    const bodies = elements.filter((e) => BODY.has(e.type));
    const labelRect = (e: DiagramElement, ox: number, oy: number, lw: number, lh: number): R => ({
      x: e.x + e.width / 2 + ox - lw / 2, y: e.y + e.height + oy, w: lw, h: lh,
    });
    const placed: R[] = [];
    const TOL = 2;
    for (const e of elements) {
      const label = (e.label ?? "").trim();
      if (!EVT.has(e.type) || !label) continue;
      const lw = (e.properties?.labelWidth as number | undefined) ?? 80;
      const lh = Math.max(1, wrapText(label, lw).length) * LH;
      const curOx = (e.properties?.labelOffsetX as number | undefined) ?? 0;
      const curOy = (e.properties?.labelOffsetY as number | undefined) ?? 7;
      // Preference order: keep current, then outward candidates. For an
      // edge-mounted (boundary) event the label is biased to its OUTWARD side —
      // never 'below' a top-mounted event (that lands on the host body / under
      // the connector). NW is preferred on a top-mounted event so the outgoing
      // sequence connector leaves the event's top edge cleanly (R7.05).
      const bside = e.boundaryHostId
        ? (e.properties?.boundarySide as string | undefined)
        : undefined;
      const nwX = -(e.width / 2 + lw / 2 + 6);
      const neX =  (e.width / 2 + lw / 2 + 6);
      const upY = -(e.height + lh / 2 + 6);
      const dnY =  e.height + 10;
      let candidates: [number, number][];
      if (bside === "top") {
        candidates = [[curOx, curOy], [nwX, upY], [0, -(e.height + lh + 6)], [neX, upY]];
      } else if (bside === "bottom") {
        candidates = [[curOx, curOy], [nwX, dnY], [0, dnY], [neX, dnY]];
      } else if (bside === "left") {
        candidates = [[curOx, curOy], [nwX, -6], [0, -(e.height + lh + 6)], [0, dnY]];
      } else if (bside === "right") {
        candidates = [[curOx, curOy], [neX, -6], [0, -(e.height + lh + 6)], [0, dnY]];
      } else {
        candidates = [
          [curOx, curOy],
          [0, e.height + 10],
          [0, -(e.height + lh + 6)],
          [e.width / 2 + lw / 2 + 6, -(e.height / 2 + lh / 2)],
          [-(e.width / 2 + lw / 2 + 6), -(e.height / 2 + lh / 2)],
          [0, e.height + lh + 18],
        ];
      }
      const clears = (ox: number, oy: number): boolean => {
        const box = labelRect(e, ox, oy, lw, lh);
        for (const ob of bodies) {
          if (ob.id === e.id || isAncestor(ob, e) || e.boundaryHostId === ob.id) continue;
          if (hit(box, { x: ob.x, y: ob.y, w: ob.width, h: ob.height }, TOL)) return false;
        }
        for (const p of placed) if (hit(box, p, TOL)) return false;
        return true;
      };
      let chosen = candidates[0];
      if (!clears(chosen[0], chosen[1])) {
        const found = candidates.find(([ox, oy]) => clears(ox, oy));
        if (found) chosen = found;
      }
      e.properties = { ...e.properties, labelOffsetX: chosen[0], labelOffsetY: chosen[1] };
      placed.push(labelRect(e, chosen[0], chosen[1], lw, lh));
    }
  }

  // ── R8.21: Global left-to-right flow enforcement ── a wide element (e.g. an
  // EP) gets its SAME-lane successors shifted right to clear it (R6.25 etc.), but
  // that displacement is not propagated to CROSS-LANE flow successors — so a
  // decision pushed right past a wide EP can end up RIGHT of the branch-target
  // tasks it feeds in other lanes, reversing the flow. Enforce that every
  // NON-LOOP sequence edge runs left-to-right: relax each edge s→t so
  // t.x ≥ s.x + s.width + GAP, shifting t (with its descendants + boundary
  // events) right and letting the shift cascade forward. Loop/back edges (the
  // only legitimate right-to-left flow) are skipped. An element inside an EP
  // rides with its EP; a boundary event rides with its host.
  {
    const LR_GAP = 60;
    const elById = new Map(elements.map((e) => [e.id, e]));
    const DATA_A = new Set(["data-object", "data-store", "text-annotation"]);
    const isDataLink = (c: { sourceId: string; targetId: string }) =>
      DATA_A.has(elById.get(c.sourceId)?.type ?? "") || DATA_A.has(elById.get(c.targetId)?.type ?? "");
    const outEdges = new Map<string, string[]>();
    const seqEdges: { s: string; t: string }[] = [];
    for (const c of [...aiConnections, ...autoConns]) {
      if (c.type === "message" || isDataLink(c)) continue;
      if (!elById.has(c.sourceId) || !elById.has(c.targetId)) continue;
      const a = outEdges.get(c.sourceId); if (a) a.push(c.targetId); else outEdges.set(c.sourceId, [c.targetId]);
      seqEdges.push({ s: c.sourceId, t: c.targetId });
    }
    // The element that actually moves for a given node: ride up through EP parents
    // and boundary hosts to the top-level flow element.
    const topLevelOf = (id: string): string => {
      let cur: DiagramElement | undefined = elById.get(id); let guard = 0;
      while (cur && guard++ < 16) {
        if (cur.boundaryHostId && elById.has(cur.boundaryHostId)) { cur = elById.get(cur.boundaryHostId); continue; }
        const p = cur.parentId ? elById.get(cur.parentId) : undefined;
        if (p && p.type === "subprocess-expanded") { cur = p; continue; }
        break;
      }
      return cur?.id ?? id;
    };
    // Back-edge (cycle) detection — loops are the only legitimate R→L flow.
    // The relaxation below shifts TOP-LEVEL elements (an EP-internal node rides
    // its EP), so cycles must be detected on the SAME collapsed graph. An
    // EP-internal element feeding an external gateway that loops back INTO the EP
    // is a 2-cycle (sp1 ↔ gateway) that ONLY exists after collapsing — a raw-id
    // DFS misses it (the EP node is a sink), leaving R8.21 to cascade both nodes
    // rightward every pass until the cap: the ~14,000px empty-band bug
    // (V04.01 Workforce Planning). Detect + skip it on the collapsed graph.
    const backEdge = new Set<string>();
    {
      const cOut = new Map<string, string[]>();
      for (const { s, t } of seqEdges) {
        const cs = topLevelOf(s), ct = topLevelOf(t);
        if (cs === ct) continue;                         // internal edge — no shift
        const a = cOut.get(cs);
        if (a) { if (!a.includes(ct)) a.push(ct); } else cOut.set(cs, [ct]);
      }
      const WHITE = 0, GRAY = 1, BLACK = 2; const colour = new Map<string, number>();
      for (const root of cOut.keys()) {
        if ((colour.get(root) ?? WHITE) !== WHITE) continue;
        const st: { id: string; i: number }[] = [{ id: root, i: 0 }]; colour.set(root, GRAY);
        while (st.length) {
          const f = st[st.length - 1]; const outs = cOut.get(f.id) ?? [];
          if (f.i >= outs.length) { colour.set(f.id, BLACK); st.pop(); continue; }
          const t = outs[f.i++]; const tc = colour.get(t) ?? WHITE;
          if (tc === GRAY) backEdge.add(`${f.id}->${t}`);
          else if (tc === WHITE) { colour.set(t, GRAY); st.push({ id: t, i: 0 }); }
        }
      }
    }
    const kidsByParent = new Map<string, DiagramElement[]>();
    for (const e of elements) { if (!e.parentId) continue; const a = kidsByParent.get(e.parentId); if (a) a.push(e); else kidsByParent.set(e.parentId, [e]); }
    const descOf = (rootId: string): string[] => { const out: string[] = []; const st = [rootId]; while (st.length) { const c = st.pop()!; for (const k of kidsByParent.get(c) ?? []) { out.push(k.id); st.push(k.id); } } return out; };
    const shiftRight = (rootId: string, dx: number) => {
      const set = new Set<string>([rootId, ...descOf(rootId)]);
      for (const e of elements) if (e.boundaryHostId && set.has(e.boundaryHostId)) set.add(e.id);
      for (const e of elements) if (set.has(e.id)) e.x += dx;
    };
    const cap = seqEdges.length + 4;
    for (let pass = 0; pass < cap; pass++) {
      let moved = false;
      for (const { s, t } of seqEdges) {
        const cs = topLevelOf(s), ct = topLevelOf(t);
        if (cs === ct || backEdge.has(`${cs}->${ct}`)) continue;
        const sm = elById.get(cs), tm = elById.get(ct);
        if (!sm || !tm) continue;
        const need = (sm.x + sm.width + LR_GAP) - tm.x;
        if (need > 0.5) { shiftRight(tm.id, need); moved = true; }
      }
      if (!moved) break;
    }
  }
  // ── R8.22: Horizontal void compaction ── the exact mirror of the vertical
  // band compaction below, and needed for the same reason.
  //
  // R8.21 above only ever pushes RIGHT: it relaxes every forward edge until
  // t.x ≥ s.x + s.width + LR_GAP, and nothing ever pulls the result back. So a
  // single element ranked far right — by a wide EP that later shrank, by a
  // message flow to a black-box pool, by a merge relocation — drags the whole
  // remaining flow with it and leaves a band of nothing behind. Measured on the
  // 2026-08-29 regenerations: 1,488px between "Review Solution Design Scope" and
  // "Retrieve Design Specifications" (V06.06) and 1,622px between "Review
  // Business Case Assumptions" and "Retrieve Customer Data From CRM" (V06.08),
  // both with NOTHING in the span in any lane or pool.
  //
  // Sweep every top-level flow element left→right; where the gap between the
  // running occupied-right and the next element exceeds MIN_VOID, pull that
  // element AND everything right of it left so the gap becomes TARGET_GAP. The
  // whole block moves by the same dx, so nothing inside it collides, and the
  // band was empty across the WHOLE diagram so nothing to the left is disturbed.
  // A gap with anything in it — a parallel branch in another lane, a gateway
  // spanning a wide EP — is left alone: it is carrying content, not slack.
  closeFlowVoids(elements);

  // Re-apply uniform pool width to enclose anything the L→R sweep pushed past the
  // previous right edge (keeps R5.08: all pools one width, tight to content).
  applyUniformPoolWidth();

  // Re-hug data objects to their associated element's FINAL position (activities
  // may have moved during the gateway / start-end tightening passes above), then
  // re-fit the lanes so any nudged data object is still enclosed.
  positionDataObjectsR802();

  // ── Vertical lane compaction (issue 1) ── the branch/column stacking can
  // strand a lower cluster of tasks far below its predecessors, leaving a large
  // EMPTY vertical band inside a lane (Paul's "Principal Consultants" case: a top
  // cluster, ~400px of nothing, then a bottom cluster). Sweep each lane top→down;
  // when the gap between the running occupied-bottom and the next child exceeds
  // MIN_BAND, pull that child AND everything below it in the lane UP so the gap
  // shrinks to TARGET_GAP. Whole clusters move together (same dy) so nothing
  // inside collides, and the band was empty so nothing above is disturbed. The
  // FINAL hug + restack below then re-tighten the (now shorter) lanes. Data
  // objects / EP internals / boundary events ride with their element.
  {
    const taskH = getSymbolDefinition("task").defaultHeight;
    const MIN_BAND = Math.round(2.0 * taskH);   // only close bands clearly larger than a normal row
    const TARGET_GAP = Math.round(1.2 * taskH); // leave ~one normal row of space
    const kidsByParent = new Map<string, DiagramElement[]>();
    for (const e of elements) { if (!e.parentId) continue; const a = kidsByParent.get(e.parentId); if (a) a.push(e); else kidsByParent.set(e.parentId, [e]); }
    const descOf = (rootId: string): string[] => { const out: string[] = []; const st = [rootId]; while (st.length) { const c = st.pop()!; for (const k of kidsByParent.get(c) ?? []) { out.push(k.id); st.push(k.id); } } return out; };
    const shiftUp = (rootIds: string[], dy: number) => {
      const full = new Set<string>(rootIds);
      for (const id of rootIds) for (const d of descOf(id)) full.add(d);
      for (const e of elements) if (e.boundaryHostId && full.has(e.boundaryHostId)) full.add(e.id);
      for (const e of elements) if (full.has(e.id)) e.y -= dy;
    };
    for (const lane of elements.filter(e => e.type === "lane")) {
      const kids = (kidsByParent.get(lane.id) ?? []).filter(e => e.type !== "lane" && e.type !== "sublane").sort((a, b) => a.y - b.y);
      if (kids.length < 2) continue;
      let occBottom = kids[0].y + kids[0].height;
      for (let i = 1; i < kids.length; i++) {
        const band = kids[i].y - occBottom;
        if (band > MIN_BAND) shiftUp(kids.slice(i).map(k => k.id), band - TARGET_GAP);
        occBottom = Math.max(occBottom, kids[i].y + kids[i].height);
      }
    }
  }

  fitLanesToChildren(true);   // FINAL pass: hug each lane to its content (±½ Task-height)
  // The final lane hug shrinks a white-box pool, which would otherwise leave an
  // over-wide vertical gap to the black-box pool below it. Re-stack all pools to
  // the fixed POOL_GAP now so every inter-pool gap is exactly 1.5 × Task height.
  // (Message-flow labels are re-placed from the FINAL routed geometry below, so
  // moving the pools here does NOT leave the labels stale.)
  restackPoolsR52();

  // ── The gateway end-game, in the one order that works ──
  //
  // Each of these reads a position the one before it settles, and every earlier
  // siting of them reproduced the bug they exist to fix.
  //
  //   R8.32 centres a decision on its branches, so it must run after the LANE
  //   passes stop moving those branches. Sited straight after the path rows it
  //   saw "Type?" at 387 and computed 387 — a perfect no-op — while the drawing
  //   ended at 630 and the rule wanted 429 (Paul, "gateway Lanes generation
  //   Test 3"). Moved to just before the branch vertices it still read 546,
  //   because the final lane hug had yet to run.
  //
  //   R8.26 then displaces a branch's subprocess RELATIVE TO the gateway, so it
  //   has to follow. It cannot simply run first: moving the branch targets is
  //   the very thing R8.32 measures, and reading a target that R8.26 had already
  //   moved would be circular.
  //
  // Hence: lanes settle, gateways centre, then the vertices and their
  // subprocesses follow from a gateway that has stopped moving.
  // ── R8.32: a decision and its merge sit in the MIDDLE OF THEIR PATHS ──
  //
  // Paul's rule (2026-09-01): "halfway between the top boundary of the highest
  // path's initial element and the bottom boundary of the lowest path's initial
  // element". Note it is measured on the BOUNDARIES, not the centres — with
  // branches of different heights those are not the same point, and the boundary
  // reading is the one that looks centred between the paths.
  //
  // R8.01 already computed a midpoint, but it ran BEFORE the paths were given
  // their rows, so its answer described a diagram that no longer exists: in
  // "Gateway Lanes generation Test 1" every gateway sat at 423 while its paths
  // spread from 291 to 955, up to 200px adrift. R8.24 then faithfully aligned
  // each merge to its decision's stale row. Re-deriving it here, from FINAL
  // positions, is what makes both correct — R8.24 still does the merges.
  //
  // Unconditional, unlike R8.01, which only fired for a cross-lane spread. Paths
  // now always take rows of their own, so there is always a spread to centre on.
  {
    for (const dec of elements) {
      if (!isDecisionGateway(dec)) continue;
      const targets = (outgoing.get(dec.id) ?? [])
        .filter(c => c.type !== "message")
        .map(c => elMap.get(c.targetId))
        .filter((e): e is DiagramElement => !!e);
      if (targets.length < 2) continue;
      const top = Math.min(...targets.map(t => t.y));
      const bottom = Math.max(...targets.map(t => t.y + t.height));
      const centre = (top + bottom) / 2;
      const wantY = centre - dec.height / 2;
      if (Math.abs(dec.y - wantY) > 0.5) dec.y = wantY;
      // The merge takes the same line. R8.24 re-asserts this later, but doing it
      // here keeps the pair consistent for every pass in between.
      const mergeId = findPairedMerge(dec.id);
      const merge = mergeId ? elMap.get(mergeId) : undefined;
      if (merge) merge.y = centre - merge.height / 2;
    }
  }

  // ── Decide each decision gateway's branch VERTICES, once ──
  // Two things depend on this answer: where the branch's target sits (R8.26,
  // just below) and which point the connector leaves the diamond from (R6.26,
  // after the connectors are built). Deciding it in one place means they cannot
  // disagree — and the ORDER matters, because the target's position now follows
  // the branch, so a rule that read the target's position would be circular.
  //
  // Paul's preference (2026-08-31): top, then bottom, then the middle-right
  // vertex; only a FOURTH branch may double up, on the vertex nearest its target.
  const branchVertex = new Map<string, "top" | "bottom" | "right">();
  for (const c of connectors) {
    const src = elMap.get(c.sourceId);
    if (c.type !== "sequence" || !src || !isDecisionGateway(src)) continue;
    if (c.sourceSide === "top" || c.sourceSide === "bottom" || c.sourceSide === "right") {
      branchVertex.set(`${c.sourceId}->${c.targetId}`, c.sourceSide);
    }
  }

  // ── R8.26: a branch's Expanded Subprocess sits UPPER- or LOWER-right of its
  // gateway, never level with it ──
  // The column engine puts an EP in the next column at the row's height, so a
  // gateway's loop-back subprocess sat directly beside it and the branch had to
  // squeeze past the box it was heading for. Displacing the EP to the side the
  // branch leaves from lets the connector run out, across and in — and makes the
  // two branches visibly different shapes (Paul 2026-08-31).
  //
  // The EP clears the gateway's CENTRE LINE rather than the whole diamond: full
  // separation would throw a 131px box a long way off the row and stretch the
  // lane around it for no extra clarity.
  {
    for (const [key, side] of branchVertex) {
      if (side === "right") continue;
      const sep = key.indexOf("->");
      const gw = elMap.get(key.slice(0, sep));
      const ep = elMap.get(key.slice(sep + 2));
      if (!gw || !ep || ep.type !== "subprocess-expanded") continue;
      const gcy = gw.y + gw.height / 2;
      const wantY = side === "top" ? gcy - ep.height : gcy;
      const dy = wantY - ep.y;
      if (Math.abs(dy) < 1) continue;
      shiftSubtree(ep.id, dy);      // children and boundary events travel with it
      ep.y += dy;                   // shiftSubtree does not move the root
    }
  }

  // ── R8.33: the flow AFTER a merge returns to the merge's line ──
  //
  // Paul, 2026-09-02: "Task 15 should continue in Lane's middle path i.e. level
  // with Task 5, Gateway 'Complexity?', Task 11, Task 12, and the associated
  // Merge." Task 15 follows the nested merge, so the path model already puts it
  // on the trunk — and R55.2 does place it there.
  //
  // An earlier pass then aligns the post-merge chain to the merge's Y, which is
  // right in intent but runs a thousand lines before R8.32 gives the merge its
  // final row. So the chain faithfully followed a merge that later moved: Task
  // 15 tracked the gateway from 353 to 776, R8.32 corrected the gateway to 575,
  // and Task 15 was left behind on a row nothing else occupied.
  //
  // Re-assert the Y half here, where the merge has stopped moving. Y only — the
  // X snugging belongs with the void sweep and must not be redone.
  for (const merge of elements) {
    if (!isMergeGateway(merge)) continue;
    const mergeCy = merge.y + merge.height / 2;
    const seen = new Set<string>([merge.id]);
    const oneOut = (id: string) => {
      const o = (outgoing.get(id) ?? []).filter(c => c.type !== "message");
      return o.length === 1 ? o[0].targetId : undefined;
    };
    let curId = oneOut(merge.id);
    while (curId && !seen.has(curId)) {
      seen.add(curId);
      const el = elMap.get(curId);
      if (!el) break;
      if ((incoming.get(curId) ?? []).filter(c => c.type !== "message").length !== 1) break;  // a join
      if (el.parentId !== merge.parentId) break;                                              // another lane
      if (isGateway(el)) break;                                                               // owns its own Y
      const dy = mergeCy - (el.y + el.height / 2);
      if (Math.abs(dy) > 0.5) { shiftSubtree(el.id, dy); el.y += dy; }
      curId = oneOut(curId);
    }
  }
  // ── R8.23: data-artifact label de-overlap ── two data objects / stores that
  // each picked a slot relative to their OWN element can end up close enough that
  // their (wider-than-box) labels collide (e.g. "Credit Report" + "Assessment
  // Summary"). Nudge SAME-LANE data artifacts apart horizontally within the free
  // band they occupy — labels overhang the box sideways, so widening the x-gap
  // clears them without touching flow elements or lane heights. Clamp to the
  // lane's right edge so nothing is pushed out of its pool.
  {
    const arts = elements
      .filter(e => (e.type === "data-object" || e.type === "data-store"))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    // Measured, not guessed — the same box SymbolRenderer draws. The fixed
    // 34px-each-side / 16px-below estimate this replaces was wrong in both
    // directions: too wide for a short name, far too shallow for a wrapped one.
    const foot = (e: DiagramElement) => {
      const base = { l: e.x, r: e.x + e.width, t: e.y, b: e.y + e.height };
      const lb = externalLabelBox(e);
      if (!lb) return base;
      return {
        l: Math.min(base.l, lb.x), r: Math.max(base.r, lb.x + lb.w),
        t: base.t, b: Math.max(base.b, lb.y + lb.h),
      };
    };
    for (let i = 0; i < arts.length; i++) {
      for (let j = i + 1; j < arts.length; j++) {
        const a = arts[i], b = arts[j];
        if (a.parentId !== b.parentId) continue;            // only within the same lane/EP
        const A = foot(a), B = foot(b);
        const xOv = Math.min(A.r, B.r) - Math.max(A.l, B.l);
        const yOv = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        if (xOv <= 0 || yOv <= 0) continue;
        // Push the right-hand artifact right by the label overlap, clamped inside
        // the lane. If it can't fit, push the left one left by the shortfall.
        const right = b.x >= a.x ? b : a;
        const left = right === b ? a : b;
        const lane = right.parentId ? elMap.get(right.parentId) : undefined;
        // Keep the artifact's own label inside the lane, not just its box.
        const rightLb = externalLabelBox(right);
        const overhang = rightLb ? Math.max(0, rightLb.x + rightLb.w - (right.x + right.width)) : 0;
        const laneRight = lane ? lane.x + lane.width - overhang : Infinity;
        const room = laneRight - (right.x + right.width);
        const push = Math.min(xOv, Math.max(0, room));
        right.x += push;
        if (push < xOv) left.x -= (xOv - push);             // spill the remainder leftwards
      }
    }
  }

  // ── Issue 5: move a data artifact OUT of an EP it sits inside (final tidy) ──
  // A Data Object / Store placed inside an Expanded Subprocess crowds the EP's
  // flow (e.g. "Lending Policy" wedged among the tasks). Move it vertically
  // OUTSIDE the EP's nearest boundary — above the top or below the bottom — and
  // re-home it to the EP's container so the EP interior stays clean. Data
  // artifacts are NOT sequence-routing obstacles, so this can't perturb any
  // connector; the association line to its element simply crosses the EP edge.
  {
    const isArt = (t: string) => t === "data-object" || t === "data-store";
    const EPGAP = 24;
    const LINE_H = 14;
    for (const art of elements) {
      if (!isArt(art.type)) continue;
      let cur: DiagramElement | undefined = art.parentId ? elMap.get(art.parentId) : undefined;
      let ep: DiagramElement | undefined; let guard = 0;
      while (cur && guard++ < 12) {
        if (cur.type === "subprocess-expanded") { ep = cur; break; }
        cur = cur.parentId ? elMap.get(cur.parentId) : undefined;
      }
      if (!ep) continue;
      // The artifact's LABEL sits BELOW its box, so placing the box above the EP
      // still leaves the label overhanging toward (or into) the EP. Clear the
      // WHOLE label + box off the EP boundary (issue 2): above → subtract the
      // label height so box+label are fully above; below → the label already
      // hangs further away from the EP.
      const labelH = Math.max(1, (art.label ?? "").split("\n").length) * LINE_H + 6;
      const acy = art.y + art.height / 2;
      art.y = Math.abs(acy - ep.y) <= Math.abs(acy - (ep.y + ep.height))
        ? ep.y - EPGAP - labelH - art.height  // above: box + label fully clear of the EP top
        : ep.y + ep.height + EPGAP;            // below: box clears; label hangs further down
      art.x = Math.max(ep.x, Math.min(ep.x + ep.width - art.width, art.x)); // keep within the EP's x-span
      art.parentId = ep.parentId;             // re-home to the EP's container (lane/pool)
    }
  }

  // ── Data-artifact overlap clearance (issue 2) ── keep every Data Object /
  // Store (and its whole label) clear of ALL other elements, not just its own EP
  // (e.g. a data object overlapping a Start event). If a data artifact's
  // footprint (box + label, with the label's sideways overhang) overlaps a flow
  // element or another artifact, nudge it vertically clear — prefer UP — bounded
  // and clamped inside its pool; drop below only when it can't fit above. Its OWN
  // associated element is excluded (the artifact is meant to sit beside it). Data
  // artifacts are not routing obstacles, so this can't perturb any connector.
  {
    const isArt2 = (t: string) => t === "data-object" || t === "data-store";
    const FLOW = new Set(["task", "subprocess", "subprocess-expanded", "start-event", "end-event", "intermediate-event", "gateway"]);
    const PAD = 8;
    // The footprint is the shape UNION its rendered label box.
    //
    // This used to approximate the label as `split("\n").length` lines — which
    // counts hard newlines, of which a generated name has none. So "Transformation
    // Logic and Model Definition" measured as ONE line, 20px, when it renders as
    // FOUR, 56px, and this pass cleared an overlap it could not see. That is why
    // three labels sat across the tasks beneath them in V25.05 (Paul 2026-08-31).
    // `externalLabelBox` wraps the text exactly as SymbolRenderer does.
    const foot = (e: DiagramElement) => {
      const base = { l: e.x, r: e.x + e.width, t: e.y, b: e.y + e.height };
      if (!isArt2(e.type)) return base;
      const lb = externalLabelBox(e);
      if (!lb) return base;
      return {
        l: Math.min(base.l, lb.x), r: Math.max(base.r, lb.x + lb.w),
        t: base.t, b: Math.max(base.b, lb.y + lb.h),
      };
    };
    const ov = (a: { l: number; r: number; t: number; b: number }, b: { l: number; r: number; t: number; b: number }) =>
      a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    const poolOf2 = (e: DiagramElement): DiagramElement | undefined => { let cur: DiagramElement | undefined = e; let g = 0; while (cur && g++ < 12) { if (cur.type === "pool") return cur; cur = cur.parentId ? elMap.get(cur.parentId) : undefined; } return undefined; };
    const allConns = [...aiConnections, ...autoConns];
    const assocOf = (artId: string) => { const c = allConns.find(x => x.sourceId === artId || x.targetId === artId); return c ? (c.sourceId === artId ? c.targetId : c.sourceId) : undefined; };
    const obstacles = elements.filter(e => (FLOW.has(e.type) || isArt2(e.type)) && !e.boundaryHostId);
    for (const art of elements) {
      if (!isArt2(art.type)) continue;
      const pool = poolOf2(art);
      const assoc = assocOf(art.id);
      for (let step = 0; step < 6; step++) {
        const af = foot(art);
        const clash = obstacles.find(o => o.id !== art.id && o.id !== assoc
          && !(isArt2(o.type) && o.id < art.id)   // resolve each artifact-artifact pair once
          && ov(af, foot(o)));
        if (!clash) break;
        const of = foot(clash);
        const newY = art.y - (af.b - of.t + PAD);  // move the whole footprint above the obstacle
        art.y = (pool && newY < pool.y + 4) ? of.b + PAD : newY; // can't fit above → drop below
      }
    }
  }

  // ── Issue 3: place a boundary event's TERMINAL exit target next to the event ──
  // An element reached only from an EP edge-mounted event (e.g. an End event
  // "Lapse Application" off a "10 working days" timer) is placed by the column
  // engine far from the event, giving a long detour connector. Move such a
  // target — only a terminal one (no outgoing sequence flow, so nothing
  // downstream is disturbed) — just OUTSIDE the event's outer side, aligned, so
  // the connector is a short straight line out of the host. Runs before routing.
  {
    const seqConns = [...aiConnections, ...autoConns].filter(c => c.type !== "message");
    const hasOutgoing = (id: string) => seqConns.some(c => c.sourceId === id);
    const G = Math.round(0.6 * getSymbolDefinition("task").defaultHeight);
    const BOUNDARY_EXIT_CLEARANCE = 0.75 * getSymbolDefinition("end-event").defaultHeight;
    // Room to leave between the exit target and the lane edge. Not merely
    // "inside the lane": a loop-back branch routes UNDER this target, and it
    // needs a channel of its own plus the same ¾-event-height margin from the
    // lane edge that R6.30 asks of every horizontal run. Eight pixels left the
    // two fighting over the same band and the branch finished on the lane edge.
    const LANE_EDGE_PAD = Math.round(BOUNDARY_EXIT_CLEARANCE) + 13;

    /** The lane band an element belongs to — by container chain, else by the
     *  band its centre sits in (a boundary event has no parentId of its own). */
    const laneBandFor = (el: DiagramElement): DiagramElement | undefined => {
      let p: string | undefined = el.boundaryHostId ?? el.parentId;
      for (let guard = 0; p && guard < 20; guard++) {
        const c = elMap.get(p);
        if (!c) break;
        if (c.type === "lane" || c.type === "sublane") return c;
        p = c.parentId;
      }
      const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
      return elements.find(l => (l.type === "lane" || l.type === "sublane")
        && cx >= l.x && cx <= l.x + l.width && cy >= l.y && cy <= l.y + l.height);
    };

    /** Grow a lane band (with its pool, and the bands stacked after it) so the
     *  span [top, bottom] fits. Growing upward leaves the band's own children
     *  where they are — the band expands around them, as fitLanesToChildren does. */
    const growLaneBandToContain = (band: DiagramElement, top: number, bottom: number) => {
      const dTop = Math.max(0, band.y - top);
      const dBot = Math.max(0, bottom - (band.y + band.height));
      if (dTop === 0 && dBot === 0) return;
      const oldY = band.y;
      band.y -= dTop;
      band.height += dTop + dBot;
      const pool = band.parentId ? elMap.get(band.parentId) : undefined;
      if (pool) {
        for (const s of elements) {
          if (s.type !== band.type || s.parentId !== pool.id || s.id === band.id) continue;
          if (s.y <= oldY) continue;                       // only the bands BELOW move
          s.y += dTop + dBot;
          shiftSubtree(s.id, dTop + dBot);
        }
        pool.y -= dTop;
        pool.height += dTop + dBot;
        restackPoolsR52();                                 // R8.03: pools may now overlap
      }
    };
    for (const ev of elements) {
      if (!ev.boundaryHostId || ev.type !== "intermediate-event") continue;
      const c = seqConns.find(x => x.sourceId === ev.id);
      if (!c) continue;
      const tgt = elMap.get(c.targetId);
      const host = elMap.get(ev.boundaryHostId);
      if (!tgt || !host) continue;
      if (hasOutgoing(tgt.id)) continue;                 // only reposition a terminal target
      const tcx = tgt.x + tgt.width / 2, tcy = tgt.y + tgt.height / 2;
      const inside = tcx > host.x && tcx < host.x + host.width && tcy > host.y && tcy < host.y + host.height;
      if (inside) continue;                              // must be an EP exit
      const side = pickBoundaryEventSide(ev, tgt, elements);
      const cy = ev.y + ev.height / 2 - tgt.height / 2;
      if (side === "right")       { tgt.x = ev.x + ev.width + G; tgt.y = cy; }
      else if (side === "left")   { tgt.x = ev.x - G - tgt.width; tgt.y = cy; }
      else {
        // R7.07 — a TOP- or BOTTOM-mounted EMIE puts its target out to the
        // RIGHT as well as clear of the mounted edge, so the exit reads as a
        // short "L" (out of the rim, then across) instead of a bare vertical
        // spike dropped straight below the host (Paul 2026-08-31).
        //
        // Straight-down was also how the target ended up OUTSIDE the lane: it
        // was pushed a full task-gap below an EP that already sat near the
        // lane floor, and `fitLanesToChildren` cannot rescue it because
        // NON_LANE_BOUND deliberately excludes events from lane fitting — a
        // gateway riding a cross-lane midpoint depends on that exclusion. So
        // the containment has to be enforced HERE, at the one placement that
        // moves an event outside its band.
        const clear = BOUNDARY_EXIT_CLEARANCE;            // ¾ of an event height
        tgt.x = ev.x + ev.width + G;
        const wantCy = side === "bottom" ? ev.y + ev.height + clear : ev.y - clear;
        tgt.y = wantCy - tgt.height / 2;

        // Keep it fully inside the EMIE's own lane. Clamping is enough while
        // the band has room; when it hasn't, the lane grows rather than the
        // target being shoved back over the host it just exited.
        const band = laneBandFor(ev);
        if (band) {
          const lo = band.y + LANE_EDGE_PAD;
          const hi = band.y + band.height - LANE_EDGE_PAD - tgt.height;
          if (hi >= lo) tgt.y = Math.min(Math.max(tgt.y, lo), hi);
          const minGap = 8;                                // still recognisably an L
          const overshootsDown = side === "bottom" && tgt.y < ev.y + ev.height + minGap;
          const overshootsUp   = side === "top"    && tgt.y + tgt.height > ev.y - minGap;
          if (hi < lo || overshootsDown || overshootsUp) {
            tgt.y = wantCy - tgt.height / 2;
            growLaneBandToContain(band, tgt.y - LANE_EDGE_PAD, tgt.y + tgt.height + LANE_EDGE_PAD);
          }
        }

        // R7.07(b) — and its label sits to the RIGHT of it. The general
        // event-label pass (B33) prefers below/above and runs BEFORE this
        // block, so it decided against a position this element no longer
        // has; for an exit target "above" is the worst of the options, since
        // that is where the host EP it just escaped from is. Set it here,
        // after the move, where the geometry is final.
        const lw = (tgt.properties?.labelWidth as number | undefined) ?? 80;
        if ((tgt.label ?? "").trim()) {
          const lh = Math.max(1, wrapText(tgt.label ?? "", lw).length) * 14;
          tgt.properties = {
            ...tgt.properties,
            labelOffsetX: tgt.width / 2 + lw / 2 + 6,
            labelOffsetY: -(tgt.height / 2 + lh / 2),
            labelWidth: lw,
          };
        }
      }
    }
  }

  // ── Issue 7: a final End event sits NEAR its immediate predecessor ──
  // A process-level End event with a SINGLE incoming sequence flow is aligned to
  // its predecessor's row (Y) and follows the predecessor's lane, rather than
  // floating at some lane's vertical centre. End events are NON_LANE_BOUND (they
  // never stretch a lane) so this can't disturb lane heights. A multi-incoming
  // End (a merge into it) keeps its balanced position. Runs before routing.
  {
    const seqIns = (id: string) => [...aiConnections, ...autoConns].filter(c => c.type !== "message" && c.targetId === id);
    for (const e of elements) {
      if (e.type !== "end-event" || e.boundaryHostId || e.parentId === undefined) continue;
      const parent = elMap.get(e.parentId);
      if (!parent || (parent.type !== "lane" && parent.type !== "pool")) continue; // top-level only, not EP-internal
      const ins = seqIns(e.id);
      if (ins.length !== 1) continue;
      const pred = elMap.get(ins[0].sourceId);
      if (!pred || pred.id === e.id || pred.boundaryHostId) continue;
      // NOT when the predecessor is a DECISION: the End event is then one branch
      // of a fan, and its row belongs to the branch layout. Pulling it onto the
      // gateway's own row drops it into the middle of the fan, on top of the
      // sibling branch — V23.01 drew "Meter reads acquired" over "Return
      // rejected reads", 33px apart, having been a clear 85px before this pass.
      const predOut = [...aiConnections, ...autoConns]
        .filter(c => c.type !== "message" && c.sourceId === pred.id);
      if (predOut.length > 1) continue;
      // Follow the predecessor's lane, and align to its row.
      if (pred.parentId && (elMap.get(pred.parentId)?.type === "lane")) e.parentId = pred.parentId;
      e.y = pred.y + pred.height / 2 - e.height / 2;
    }
  }

  // ── R7.06: mount each EMIE on the host side that FACES its outgoing target ──
  // so the outbound sequence connector exits DIRECTLY toward the target instead
  // of detouring up-and-over the host. Paul: "on top if the connector goes to an
  // element to the top-right, on the bottom if it goes to the bottom-right."
  // Chooses top vs bottom by the target's vertical position relative to the host
  // centre, re-mounts with one-event-width corner clearance (R7.04), and refreshes
  // the outward label side (R7.05). Only for intermediate events whose flow LEAVES
  // the host; an explicit left/right mount is respected.
  for (const ev of elements) {
    if (ev.type !== "intermediate-event" || !ev.boundaryHostId) continue;
    const host = elMap.get(ev.boundaryHostId);
    if (!host) continue;
    const outSeq = [...aiConnections, ...autoConns].find(
      (c) => c.type !== "message" && c.sourceId === ev.id,
    );
    if (!outSeq) continue;
    const tgt = elMap.get(outSeq.targetId);
    if (!tgt) continue;
    const tcx = tgt.x + tgt.width / 2, tcy = tgt.y + tgt.height / 2;
    // Target inside the host = an interrupt returning inward; leave it mounted.
    if (tcx > host.x && tcx < host.x + host.width && tcy > host.y && tcy < host.y + host.height) continue;
    const cur = ev.properties?.boundarySide as string | undefined;
    if (cur !== "top" && cur !== "bottom") continue; // respect an explicit L/R mount
    // Only re-face when the target is CLEARLY above/below the host box. A target
    // roughly level with the host (exiting to the side) keeps its mounted side —
    // flipping on a hairline vertical difference would fight a deliberate mount.
    const want =
      tcy > host.y + host.height ? "bottom"
      : tcy < host.y ? "top"
      : cur;
    if (want === cur) continue;
    ev.properties = { ...ev.properties, boundarySide: want, ...boundaryLabelOffset(want, ev.width, ev.height) };
    snapBoundaryEventToRim(ev, host.x, host.y, host.width, host.height);
  }
  // ── R8.24: FINAL decision/merge levelling ── R8.01 aligns a decision and its
  // paired merge gateway to the branch midpoint mid-layout, but the later
  // lane-centring passes can pull each gateway back toward its OWN lane band —
  // leaving the merge no longer level with its decision whenever the two live in
  // different lanes (a cross-lane fork/join, e.g. a decision in the Sales lane
  // rejoining in the Front Office lane). Re-assert the pairing here, as the LAST
  // Y-affecting step before routing, so a paired merge is ALWAYS drawn on its
  // decision's centre-Y. Anchors the merge to the decision (the decision keeps
  // its placed Y). Gateways are lane-independent, so moving the merge across a
  // band never stretches a lane (R57 has already sized them).
  for (const dec of elements) {
    if (!isDecisionGateway(dec)) continue;
    const mergeId = findPairedMerge(dec.id);
    if (!mergeId) continue;
    const merge = elMap.get(mergeId);
    if (!merge) continue;
    const decCy = dec.y + dec.height / 2;
    const wantY = decCy - merge.height / 2;
    if (Math.abs(merge.y - wantY) > 0.5) merge.y = wantY;
  }
  // ── R6.31: a merge's INBOUND vertices follow FINAL geometry ──
  //
  // Paul, 2026-09-02: "The Merge associated with Gateway 'Complexity?' should
  // have Task 12 connected to the left-hand vertex when placed correctly."
  //
  // A diamond offers three inbound points and they mean something: TOP for a
  // path arriving from above, LEFT for one arriving level, BOTTOM from below.
  // The two-inbound case ignored that and split them top/bottom by list index,
  // so a branch running straight into the merge on its own row still bent up or
  // down to reach a corner.
  //
  // Late, and necessarily so: the sides are first chosen while the connectors
  // are built, which is long before R8.32 gives the gateway its final row, and a
  // vertex picked from a position that later changes is a guess. Three or more
  // arrivals keep the round-robin Paul chose in R6.28.
  for (const merge of elements) {
    if (!isMergeGateway(merge)) continue;
    const ins = connectors.filter(c => c.type === "sequence" && c.targetId === merge.id);
    if (ins.length !== 2) continue;
    const mcy = merge.y + merge.height / 2;
    const LEVEL = merge.height / 2 + 6;                 // within the diamond's own band
    const info = ins.map(c => {
      const src = elMap.get(c.sourceId);
      return { c, dy: src ? (src.y + src.height / 2) - mcy : 0 };
    });
    const level = info.filter(i => Math.abs(i.dy) <= LEVEL);
    // Exactly one arrives level: it takes the left vertex and the other takes
    // the corner it is genuinely on. Both level, or neither, has no better
    // answer than the existing top/bottom split — leave those alone.
    if (level.length !== 1) continue;
    for (const i of info) {
      i.c.targetSide = (i === level[0] ? "left" : i.dy > 0 ? "bottom" : "top") as Connector["targetSide"];
      i.c.targetOffsetAlong = 0.5;                      // R6.30: on the vertex, not near it
    }
  }

  phase(`connectors built (${connectors.length})`);

  // Compute waypoints for all connectors
  const computedConnectors = connectors.map((conn, i) => {
    const tConn = Date.now();
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    // Issue 2: re-derive a boundary intermediate event's exit side from FINAL
    // geometry (the build-time R7.02 side is stale once the EP re-tighten moved
    // the event onto a corner). The corner-aware pickBoundaryEventSide exits the
    // connector TOWARD its target instead of doubling back around the host.
    if (conn.type === "sequence" && src.boundaryHostId && src.type === "intermediate-event") {
      const s = pickBoundaryEventSide(src, tgt, elements);
      if (s) conn.sourceSide = s as Connector["sourceSide"];
      // Also re-face the target's attachment toward the (final-position) event,
      // so a target moved next to the event (issue 3) is entered on the facing
      // side rather than a stale build-time side.
      const ecx = src.x + src.width / 2, ecy = src.y + src.height / 2;
      const tcx = tgt.x + tgt.width / 2, tcy = tgt.y + tgt.height / 2;
      const dx = ecx - tcx, dy = ecy - tcy;
      const nx = Math.abs(dx) / (tgt.width / 2 || 1), ny = Math.abs(dy) / (tgt.height / 2 || 1);
      conn.targetSide = (nx >= ny ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top")) as Connector["targetSide"];
    }
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

  // ── R05.10: message flows sharing a vertical line are separated ──
  // A message flow drops from its task's centre to the pool it talks to, so two
  // tasks stacked in the SAME COLUMN send their flows down the same x — one line
  // drawn over another, with no way to tell which is which. In V23.01 "Interval
  // data request" ran down x=511 while "Self-read request" ran UP the same x
  // (Paul 2026-08-31).
  //
  // Only the spine moves, and only as far as the task's own edge allows: the
  // endpoint has to stay on the shape it leaves, so a 107px-wide task can give
  // about 40px each way and a pool effectively any amount.
  {
    const STEP = 26, EDGE_MARGIN = 10, TOL = 6;
    type Run = { c: Connector; i: number; x: number; y1: number; y2: number };
    const runs: Run[] = [];
    for (const c of computedConnectors) {
      if (c.type !== "messageBPMN") continue;
      const w = c.waypoints ?? [];
      // The spine = the longest vertical segment, which is the part that spans
      // the gap between pools and the part that visibly collides.
      let best: Run | null = null;
      for (let i = 0; i < w.length - 1; i++) {
        if (Math.abs(w[i].x - w[i + 1].x) > 1) continue;
        const len = Math.abs(w[i].y - w[i + 1].y);
        if (len < 20) continue;
        if (!best || len > best.y2 - best.y1) {
          best = { c, i, x: w[i].x, y1: Math.min(w[i].y, w[i + 1].y), y2: Math.max(w[i].y, w[i + 1].y) };
        }
      }
      if (best) runs.push(best);
    }
    // Group spines that share an x, then keep only the groups that actually
    // overlap vertically — two flows on the same x at different heights are not
    // drawn on top of each other and must not be disturbed.
    const groups: Run[][] = [];
    for (const r of runs) {
      const g = groups.find(g => Math.abs(g[0].x - r.x) <= TOL
        && g.some(o => Math.min(o.y2, r.y2) - Math.max(o.y1, r.y1) > 0));
      if (g) g.push(r); else groups.push([r]);
    }
    for (const g of groups) {
      if (g.length < 2) continue;
      g.sort((a, b) => a.y1 - b.y1 || a.c.id.localeCompare(b.c.id));   // stable
      for (let k = 0; k < g.length; k++) {
        const want = (k - (g.length - 1) / 2) * STEP;
        if (want === 0) continue;
        const c = g[k].c;
        const w = c.waypoints ?? [];
        if (!w.length) continue;
        // How far may this flow slide before an endpoint leaves its element?
        let room = Math.abs(want);
        for (const endId of [c.sourceId, c.targetId]) {
          const el = elMap.get(endId);
          if (!el || el.type === "pool") continue;      // a pool is wide enough
          const p = endId === c.sourceId ? w[0] : w[w.length - 1];
          const lo = el.x + EDGE_MARGIN, hi = el.x + el.width - EDGE_MARGIN;
          room = Math.min(room, want > 0 ? Math.max(0, hi - p.x) : Math.max(0, p.x - lo));
        }
        const dx = Math.sign(want) * room;
        if (dx === 0) continue;
        c.waypoints = w.map(p => ({ ...p, x: p.x + dx }));
      }
    }
  }

  // ── R8.31: REPEAT a data artifact beside a remote consumer ──
  // A Data Object written early and read late produces one line crossing the
  // whole diagram, and nothing about routing or label placement can rescue it.
  // BPMN allows the same artifact to appear more than once for exactly this
  // reason, and the normal practice is either to repeat it or to park it midway
  // in a lane of its own; Paul chose repetition for generation (2026-08-31).
  //
  // Parentage is unchanged in kind: each copy inherits the container of the
  // element it serves, which is the rule R8.02 already applies. Data artifacts
  // are not owned by a lane the way an activity is, but they still carry a
  // parent, and this keeps that as it was.
  //
  // Runs after routing because it needs real distances, and it is safe there:
  // a data artifact is not a routing obstacle, so adding one cannot change
  // anybody else's path. Only the re-pointed association is re-routed. It sits
  // before R8.30 so the copies are lifted clear like any other artifact.
  {
    const ART = new Set(["data-object", "data-store"]);
    const LONG_PX = 600, LONG_FRACTION = 0.2;
    const NEAR = 400;         // two consumers this close share one copy
    const nodes = elements.filter(e => !["pool", "lane", "sublane"].includes(e.type));
    const diagramW = nodes.length
      ? Math.max(...nodes.map(e => e.x + e.width)) - Math.min(...nodes.map(e => e.x))
      : 0;
    const centre = (e: DiagramElement) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });
    const added: DiagramElement[] = [];
    if (diagramW > 0) {
      for (const art of [...elements]) {
        if (!ART.has(art.type)) continue;
        const links = computedConnectors.filter(c => c.sourceId === art.id || c.targetId === art.id);
        if (links.length < 2) continue;      // a single consumer has nothing to split from
        const ac = centre(art);
        // Copies made for THIS artifact, so two remote consumers standing near
        // each other share one rather than each getting their own.
        const copies: { el: DiagramElement; at: { x: number; y: number } }[] = [];
        let n = 0;
        for (const c of links) {
          const farId = c.sourceId === art.id ? c.targetId : c.sourceId;
          const far = elMap.get(farId);
          if (!far || ART.has(far.type)) continue;
          const fc = centre(far);
          const dist = Math.hypot(fc.x - ac.x, fc.y - ac.y);
          if (dist <= LONG_PX || dist < diagramW * LONG_FRACTION) continue;

          let copy = copies.find(k => Math.hypot(k.at.x - fc.x, k.at.y - fc.y) < NEAR)?.el;
          if (!copy) {
            // Placed by R8.02's own rule: a value READ by the element sits to
            // its upper-left, one WRITTEN by it to the upper-right.
            const isOutput = c.sourceId !== art.id;
            copy = {
              ...art,
              id: `${art.id}__at_${++n}_${farId}`,
              properties: { ...art.properties },
              x: isOutput ? far.x + far.width + DATA_GAP : far.x - art.width - DATA_GAP,
              y: far.y - art.height - DATA_VGAP,
              parentId: far.parentId,          // the container rule, unchanged
            };
            elements.push(copy);
            elMap.set(copy.id, copy);
            added.push(copy);
            copies.push({ el: copy, at: fc });
          }
          // Re-point this association at the copy and route it afresh.
          const i = computedConnectors.indexOf(c);
          const re = c.sourceId === art.id
            ? { ...c, sourceId: copy.id }
            : { ...c, targetId: copy.id };
          const s = elMap.get(re.sourceId), t = elMap.get(re.targetId);
          if (s && t) {
            try {
              const r = computeWaypoints(s, t, elements, re.sourceSide, re.targetSide, re.routingType, 0.5, 0.5);
              computedConnectors[i] = { ...re, waypoints: r.waypoints,
                sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
            } catch { computedConnectors[i] = re; }
          } else {
            computedConnectors[i] = re;
          }
        }
      }
    }
    // Splitting changes what each copy is: the original may now only be WRITTEN
    // and a copy only READ. R8.02's marker rule keys off exactly that, so the
    // role has to be re-derived or a copy keeps a marker that is no longer true.
    if (added.length > 0) {
      for (const a of [...added, ...elements.filter(e => ART.has(e.type))]) {
        const mine = computedConnectors.filter(c => c.sourceId === a.id || c.targetId === a.id);
        if (mine.length === 0) continue;
        const writtenTo = mine.some(c => c.targetId === a.id);   // element → data
        const readFrom = mine.some(c => c.sourceId === a.id);    // data → element
        const role = writtenTo && readFrom ? undefined : writtenTo ? "output" : "input";
        const props = { ...a.properties };
        if (role) props.role = role; else delete props.role;
        a.properties = props;
      }
    }
  }

  // ── R8.30: lift a data artifact clear of the CONNECTORS under its label ──
  // R8.02's clearance pass lifts an artifact off the elements below it, but it
  // runs before routing, so it has never been able to see a connector. Paul's
  // rule was "elements OR connectors below them" from the start (2026-08-31);
  // only the elements half could be implemented where that pass sits. The first
  // data object's name was landing across the flow out of the start event.
  //
  // Safe to do after routing because a data artifact is NOT a routing obstacle —
  // moving one cannot change anybody else's path. Its OWN associations are
  // re-routed below, which is all that its move affects.
  {
    const ARTIFACT = new Set(["data-object", "data-store"]);
    const BODY = new Set([
      "task", "subprocess", "subprocess-expanded", "start-event", "end-event",
      "intermediate-event", "gateway", "data-object", "data-store",
    ]);
    const SEG_PAD = 4, STEP = 6, MAX_LIFT = 90, GAP = 4;
    type Box = { x: number; y: number; w: number; h: number };
    const clash = (a: Box, b: Box) =>
      Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
      Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
    const moved: DiagramElement[] = [];
    for (const art of elements) {
      if (!ARTIFACT.has(art.type)) continue;
      // Segments that could obstruct: everything except this artifact's own
      // links and the data associations, which can span the whole diagram.
      const segs: Box[] = [];
      for (const c of computedConnectors) {
        if (c.type === "associationBPMN") continue;
        if (c.sourceId === art.id || c.targetId === art.id) continue;
        const w = c.waypoints ?? [];
        for (let i = 0; i < w.length - 1; i++) {
          segs.push({
            x: Math.min(w[i].x, w[i + 1].x) - SEG_PAD, y: Math.min(w[i].y, w[i + 1].y) - SEG_PAD,
            w: Math.abs(w[i].x - w[i + 1].x) + SEG_PAD * 2,
            h: Math.abs(w[i].y - w[i + 1].y) + SEG_PAD * 2,
          });
        }
      }
      const clearAt = (dy: number, dx = 0): boolean => {
        const b = externalLabelBox({ ...art, x: art.x + dx, y: art.y - dy } as DiagramElement);
        if (!b) return true;
        const shape = { x: art.x + dx, y: art.y - dy, w: art.width, h: art.height };
        for (const s of segs) if (clash(b, s) || clash(shape, s)) return false;
        for (const ob of elements) {
          if (ob.id === art.id || !BODY.has(ob.type)) continue;
          const obBox = { x: ob.x, y: ob.y, w: ob.width, h: ob.height };
          if (clash(b, obBox) || clash(shape, obBox)) return false;
        }
        return true;
      };
      if (clearAt(0)) continue;
      // Step upward to the first position that clears everything. Upward only:
      // an artifact belongs above the row it serves, and dropping it into the
      // flow to escape a line would be the worse answer.
      //
      // The lift is capped by the room ALREADY in the band. It must never grow
      // the lane: growing a band moves the pool and restacks the lanes, so every
      // element in them shifts — and the connectors were routed before this pass
      // and are not recomputed. Doing that detached 18 of 38 connectors in
      // V23.04, which is a far worse fault than the label overlap it was
      // trying to relieve. If the room is not there, the artifact stays where it
      // is and the scanner reports the overlap.
      const band = laneBandFor(art);
      const room = band ? art.y - (band.y + LANE_EDGE_PAD) : Number.POSITIVE_INFINITY;
      if (room <= 0) continue;
      let found: number | null = null;
      let sideways = 0;
      for (let dy = STEP; dy <= MAX_LIFT; dy += STEP) {
        if (dy + GAP > room) break;                     // no more room above
        if (clearAt(dy)) { found = dy + GAP; break; }
      }
      // A vertical connector run is NARROW. When there is no room to rise above
      // one — and paths on separate rows make such runs longer and more common —
      // a small step sideways clears it, and keeps the artifact beside the
      // element it serves rather than abandoning the attempt.
      if (found === null) {
        outer:
        for (const dx of [-30, 30, -60, 60]) {
          for (let dy = 0; dy <= Math.min(MAX_LIFT, Math.max(0, room)); dy += STEP) {
            if (clearAt(dy, dx)) { found = dy > 0 ? dy + GAP : 0; sideways = dx; break outer; }
          }
        }
      }
      if (found === null && sideways === 0) continue;    // nowhere better; leave it
      art.y -= found ?? 0;
      art.x += sideways;
      moved.push(art);
    }
    // Re-route only what moved: the associations touching a lifted artifact.
    if (moved.length > 0) {
      const ids = new Set(moved.map((a) => a.id));
      for (let i = 0; i < computedConnectors.length; i++) {
        const c = computedConnectors[i];
        if (!ids.has(c.sourceId) && !ids.has(c.targetId)) continue;
        const s = elMap.get(c.sourceId), t = elMap.get(c.targetId);
        if (!s || !t) continue;
        try {
          const r = computeWaypoints(s, t, elements, c.sourceSide, c.targetSide, c.routingType, 0.5, 0.5);
          computedConnectors[i] = { ...c, waypoints: r.waypoints,
            sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
        } catch { /* keep the existing path rather than lose it */ }
      }
    }
  }

  // ── R8.36: a data artifact and ITS LABEL end up clear of every element ──
  //
  // The clearance pass earlier already measures a data artifact as box UNION
  // label — but R8.30 and R8.31 move artifacts AFTER it, to lift them off
  // connectors and to repeat one beside a remote consumer, and either can put
  // the label back over something. V23.08 finished with the label "Agency
  // Referral Package" lying across the task "Write-off Recommendation".
  //
  // Re-assert it here, once the artifacts have stopped moving. Prefer UP, as
  // the earlier pass does. Data artifacts are not routing obstacles, so moving
  // one cannot perturb a connector.
  {
    const isArt = (t: string) => t === "data-object" || t === "data-store";
    const FLOW = new Set(["task", "subprocess", "subprocess-expanded", "start-event",
      "end-event", "intermediate-event", "gateway"]);
    const PAD = 8;
    const foot = (e: DiagramElement) => {
      const base = { l: e.x, r: e.x + e.width, t: e.y, b: e.y + e.height };
      const lb = isArt(e.type) ? externalLabelBox(e) : null;
      return lb ? { l: Math.min(base.l, lb.x), r: Math.max(base.r, lb.x + lb.w),
                    t: base.t, b: Math.max(base.b, lb.y + lb.h) } : base;
    };
    type R = { l: number; r: number; t: number; b: number };
    const ov = (a: R, b: R) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    // Other DATA ARTIFACTS count as obstacles too — the pair that actually
    // collided in V23.08 were two data objects, and a list of flow types alone
    // could never see it.
    const bodies = elements.filter(e => (FLOW.has(e.type) || isArt(e.type)) && !e.boundaryHostId)
      .map(e => ({ id: e.id, r: { l: e.x, r: e.x + e.width, t: e.y, b: e.y + e.height } }));
    const allC = [...aiConnections, ...autoConns];
    for (const art of elements) {
      if (!isArt(art.type)) continue;
      const linked = allC.find(c => c.sourceId === art.id || c.targetId === art.id);
      const partner = linked ? (linked.sourceId === art.id ? linked.targetId : linked.sourceId) : undefined;
      // An artifact may sit BESIDE the element it annotates — that is the point
      // of it — so its box is allowed to encroach on that partner. Its LABEL is
      // not: text drawn across the task it describes is exactly the complaint.
      // So the partner is exempt from the footprint test but not the label test.
      const clashes = () => bodies.some(b => {
        if (b.id === art.id) return false;
        if (ov(foot(art), b.r) && b.id !== partner) return true;
        const lb = externalLabelBox(art);
        return !!lb && ov({ l: lb.x, r: lb.x + lb.w, t: lb.y, b: lb.y + lb.h }, b.r);
      });
      if (!clashes()) continue;
      const y0 = art.y;
      let done = false;
      for (let step = 1; step <= 8 && !done; step++) {
        for (const dir of [-1, 1]) {
          art.y = y0 + dir * step * (art.height + PAD);
          if (!clashes()) { done = true; break; }
        }
      }
      if (!done) art.y = y0;                       // no better spot: leave it be
    }
  }
  // ── R8.29: FINAL event-label placement, against the routed diagram ──
  // R8.16 nudges event labels clear of other elements, but it runs long before
  // the diagram is finished: the exit-target placement, the branch-subprocess
  // move, the lane hug and the pool restack all shift elements AFTER it, so its
  // answer is computed against geometry that no longer exists. And it only ever
  // treats element BODIES as obstacles — connectors do not exist when it runs,
  // so a label could never be nudged off a connector at all.
  //
  // That is why the scanner reported event-label overlaps on freshly generated
  // diagrams: the generator was not blind to the rule, it was checking against
  // the wrong picture (Paul 2026-08-31, end-event labels sitting on a gateway
  // and on the connector feeding it). This pass is the final word — same
  // preference order, but everything is now in its finished position and
  // connector segments count as obstacles.
  //
  // Only labelOffsetX/Y move, so nothing re-routes. A label inside an Expanded
  // Subprocess is kept inside it: R8.27 already sized the box around the label
  // where it was, and moving it out would trade one defect for another.
  {
    const LH = 14;
    const EVT = new Set(["start-event", "end-event", "intermediate-event"]);
    const BODY = new Set([
      "task", "subprocess", "subprocess-expanded", "start-event", "end-event",
      "intermediate-event", "gateway", "data-object", "data-store",
    ]);
    type R = { x: number; y: number; w: number; h: number };
    const hit = (a: R, b: R, tol: number) =>
      Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tol &&
      Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tol;
    const isAnc = (anc: DiagramElement, node: DiagramElement): boolean => {
      let cur: DiagramElement | undefined = node;
      for (let i = 0; i < 32 && cur; i++) {
        const nid = cur.boundaryHostId ?? cur.parentId;
        if (!nid) return false;
        if (nid === anc.id) return true;
        cur = elMap.get(nid);
      }
      return false;
    };
    /** The EP an element lives inside, if any — its label must stay within it. */
    const epOf = (e: DiagramElement): DiagramElement | undefined => {
      let cur: DiagramElement | undefined = e.parentId ? elMap.get(e.parentId) : undefined;
      for (let i = 0; i < 16 && cur; i++) {
        if (cur.type === "subprocess-expanded") return cur;
        cur = cur.parentId ? elMap.get(cur.parentId) : undefined;
      }
      return undefined;
    };
    const bodies = elements.filter((e) => BODY.has(e.type));
    /** Every connector segment as a thin rectangle, with its endpoints, so a
     *  label can be tested against the lines as well as the boxes. */
    const SEG_PAD = 4;   // half the visual weight of a line plus a little air
    const segs: { a: string; b: string; r: R }[] = [];
    for (const c of computedConnectors) {
      // Data associations are excluded. One runs the full width of a diagram
      // when an object written early is read late, and it crosses everything on
      // the way — dodging it is neither possible nor worth it, and a label that
      // tried would be chased somewhere worse. Sequence and message flows are
      // what a label must stay off.
      if (c.type === "associationBPMN") continue;
      const w = c.waypoints ?? [];
      for (let i = 0; i < w.length - 1; i++) {
        const x1 = Math.min(w[i].x, w[i + 1].x), x2 = Math.max(w[i].x, w[i + 1].x);
        const y1 = Math.min(w[i].y, w[i + 1].y), y2 = Math.max(w[i].y, w[i + 1].y);
        // Inflate the segment to a real thickness: the line, plus the breathing
        // room text needs beside it. Without this a horizontal run is a 0px-tall
        // rectangle, the overlap test needs more than TOL px of penetration on
        // BOTH axes, and a connector could never register as an obstacle at all
        // — the collision test silently did nothing.
        segs.push({
          a: c.sourceId, b: c.targetId,
          r: { x: x1 - SEG_PAD, y: y1 - SEG_PAD, w: (x2 - x1) + SEG_PAD * 2, h: (y2 - y1) + SEG_PAD * 2 },
        });
      }
    }
    const labelRect = (e: DiagramElement, ox: number, oy: number, lw: number, lh: number): R => ({
      x: e.x + e.width / 2 + ox - lw / 2, y: e.y + e.height + oy, w: lw, h: lh,
    });
    const placed: R[] = [];
    const TOL = 2;
    for (const e of elements) {
      const label = (e.label ?? "").trim();
      if (!EVT.has(e.type) || !label) continue;
      const col = (e.properties?.labelWidth as number | undefined) ?? 80;
      // Measure the RENDERED text, the same box the scanner and the renderer
      // use. Testing the full 80px column reports collisions a reader cannot see,
      // and this pass would then nudge a clear label onto something real.
      const { w: lw, h: lh } = externalLabelSize(label, col);
      const curOx = (e.properties?.labelOffsetX as number | undefined) ?? 0;
      const curOy = (e.properties?.labelOffsetY as number | undefined) ?? 7;
      const bside = e.boundaryHostId ? (e.properties?.boundarySide as string | undefined) : undefined;
      const nwX = -(e.width / 2 + lw / 2 + 6);
      const neX = (e.width / 2 + lw / 2 + 6);
      const upY = -(e.height + lh / 2 + 6);
      const dnY = e.height + 10;
      // Current first, so a label that already reads well is never moved — this
      // is what preserves R7.07(b)'s "to the right of the exit target" while
      // still giving it somewhere to go when the right is occupied.
      const candidates: [number, number][] =
        bside === "top" ? [[curOx, curOy], [nwX, upY], [0, -(e.height + lh + 6)], [neX, upY]]
        : bside === "bottom" ? [[curOx, curOy], [nwX, dnY], [0, dnY], [neX, dnY]]
        : bside === "left" ? [[curOx, curOy], [nwX, -6], [0, -(e.height + lh + 6)], [0, dnY]]
        : bside === "right" ? [[curOx, curOy], [neX, -6], [0, -(e.height + lh + 6)], [0, dnY]]
        : [
            [curOx, curOy],
            [neX, -(e.height / 2 + lh / 2)],   // right, vertically centred
            [nwX, -(e.height / 2 + lh / 2)],   // left
            [0, dnY],                          // below
            [0, -(e.height + lh + 6)],         // above
            [neX, dnY], [nwX, dnY],            // the diagonals, last
            [0, e.height + lh + 18],
          ];
      const ep = epOf(e);
      const clears = (ox: number, oy: number): boolean => {
        const box = labelRect(e, ox, oy, lw, lh);
        if (ep && (box.x < ep.x || box.y < ep.y
          || box.x + box.w > ep.x + ep.width || box.y + box.h > ep.y + ep.height)) return false;
        for (const ob of bodies) {
          if (ob.id === e.id || isAnc(ob, e) || e.boundaryHostId === ob.id) continue;
          if (hit(box, { x: ob.x, y: ob.y, w: ob.width, h: ob.height }, TOL)) return false;
        }
        for (const s of segs) {
          // A label sits beside its OWN flow by construction — that is not a clash.
          if (s.a === e.id || s.b === e.id) continue;
          if (hit(box, s.r, TOL)) return false;
        }
        for (const p of placed) if (hit(box, p, TOL)) return false;
        return true;
      };
      // Try the preferred position, then SLIDE it vertically in half-line steps
      // before abandoning that side. A blocked label is usually blocked by a
      // single line — a loop-back branch running under the row — and the gap
      // beside the event is a few pixels short rather than absent. Nudging keeps
      // the label beside the event it names; jumping to another side to gain 7px
      // moves it somewhere the reader has to hunt for.
      const NUDGE_STEP = 7, NUDGE_MAX = 56;
      const nudges: number[] = [0];
      for (let d = NUDGE_STEP; d <= NUDGE_MAX; d += NUDGE_STEP) nudges.push(-d, d);
      let chosen: [number, number] | undefined;
      for (const dy of nudges) {
        if (clears(candidates[0][0], candidates[0][1] + dy)) {
          chosen = [candidates[0][0], candidates[0][1] + dy];
          break;
        }
      }
      // Still blocked — the first clear alternative side, else keep the
      // preferred one: a label with nowhere to go reads better beside its own
      // event than flung across the diagram, and the scanner reports it.
      if (!chosen) chosen = candidates.slice(1).find(([ox, oy]) => clears(ox, oy)) ?? candidates[0];
      e.properties = { ...e.properties, labelOffsetX: chosen[0], labelOffsetY: chosen[1] };
      placed.push(labelRect(e, chosen[0], chosen[1], lw, lh));
    }
  }

  // ── R05.09: message-flow label placement from FINAL routed geometry ──
  // The build-time label offsets (R05.05) are stale — the L→R sweep, lane hug and
  // pool restack all move elements AFTER them. Recompute every messageBPMN label
  // here from its FINAL waypoints: it sits in the gap adjacent to the black-box
  // pool it attaches to (half a POOL_GAP in, toward the other pool), CENTRED on
  // its connector (offsetX = 0). Two labels on the same pool sharing a connector-x
  // stagger in half-line steps. The anchor is the leader midpoint — identical to
  // the runtime computeMsgBpmnLabelOffsets — so the stored offset renders true.
  {
    const containingPool = (el: DiagramElement): DiagramElement | undefined => {
      if (el.type === "pool") return el;
      let cur: DiagramElement | undefined = el;
      for (let i = 0; i < 10 && cur; i++) {
        if (!cur.parentId) break;
        const p = elements.find(e => e.id === cur!.parentId);
        if (!p) break;
        if (p.type === "pool") return p;
        cur = p;
      }
      return undefined;
    };
    const LINE_H = 14, W = 80, HALF = LINE_H / 2;
    // Track each placed label's RENDERED width, not the nominal column: two
    // labels only need staggering when their real boxes would meet.
    const track: { bbpId: string; cx: number; w: number }[] = [];
    for (const conn of computedConnectors) {
      if (conn.type !== "messageBPMN") continue;
      const wps = conn.waypoints;
      if (!wps || wps.length < 4) continue;
      const src = elMap.get(conn.sourceId), tgt = elMap.get(conn.targetId);
      if (!src || !tgt) continue;
      const srcPool = containingPool(src), tgtPool = containingPool(tgt);
      if (!srcPool || !tgtPool) continue;
      // Anchor = midpoint of the leader endpoints (matches the renderer + the
      // runtime re-anchor), NOT the far element edges.
      const anchorY = (wps[1].y + wps[wps.length - 2].y) / 2;
      const anchorX = (wps[1].x + wps[wps.length - 2].x) / 2;
      const goingDown = conn.sourceSide === "bottom";
      const srcPoolEdgeY = goingDown ? srcPool.y + srcPool.height : srcPool.y;
      const tgtPoolEdgeY = goingDown ? tgtPool.y : tgtPool.y + tgtPool.height;
      const srcBB = ((srcPool.properties.poolType as string | undefined) ?? "black-box") !== "white-box";
      const tgtBB = ((tgtPool.properties.poolType as string | undefined) ?? "black-box") !== "white-box";
      let bbpId: string | null = null, bbpEdgeY = 0, otherEdgeY = 0;
      if (srcBB && !tgtBB) { bbpId = srcPool.id; bbpEdgeY = srcPoolEdgeY; otherEdgeY = tgtPoolEdgeY; }
      else if (tgtBB && !srcBB) { bbpId = tgtPool.id; bbpEdgeY = tgtPoolEdgeY; otherEdgeY = srcPoolEdgeY; }
      else if (srcBB && tgtBB) { bbpId = srcPool.id; bbpEdgeY = srcPoolEdgeY; otherEdgeY = tgtPoolEdgeY; }
      if (bbpId) {
        const gapDir = otherEdgeY >= bbpEdgeY ? 1 : -1;
        const baseCentreY = bbpEdgeY + (POOL_GAP / 2) * gapDir;
        // Overlap is decided on the two labels' REAL half-widths. Comparing the
        // centre gap against a fixed 80 said these two were 132px apart and
        // therefore safe; they are 228px and 210px wide and were drawn one on
        // top of the other.
        const myW = connectorLabelWidth(conn.label ?? "");
        const xClose = track.filter(l =>
          l.bbpId === bbpId && Math.abs(l.cx - anchorX) < (l.w + myW) / 2).length;
        const dir = xClose % 2 === 0 ? -1 : 1;
        const mag = (Math.floor(xClose / 2) + 1) * HALF;
        const edgeNear = bbpEdgeY + HALF * gapDir;
        const edgeFar = bbpEdgeY + (POOL_GAP - HALF) * gapDir;
        const lo = Math.min(edgeNear, edgeFar), hi = Math.max(edgeNear, edgeFar);
        const cy = Math.max(lo, Math.min(hi, baseCentreY + dir * mag));
        conn.labelOffsetX = 0;
        conn.labelOffsetY = cy - anchorY - 7;
        conn.labelWidth = W;
        track.push({ bbpId, cx: anchorX, w: myW });
      } else {
        const gapCentreY = (srcPoolEdgeY + tgtPoolEdgeY) / 2;
        conn.labelOffsetX = 20;
        conn.labelOffsetY = gapCentreY - anchorY - 7;
      }
    }
  }

  // ── Every edge-mounted intermediate event is INTERRUPTING ──────────────────
  //
  // Paul, 2026-08-27: "all edge-mounted intermediate events must be interrupting
  // in generated BPMN diagrams." Enforced here rather than asked for in the
  // prompt, because a rule the model can forget is not a rule — and this one is
  // cheap to guarantee.
  //
  // SCOPE, which is the whole subtlety. This applies ONLY to intermediate events
  // carrying a boundaryHostId — events mounted on an activity's edge. It must NOT
  // touch the non-interrupting START event that R6.11 places INSIDE an Event
  // Expanded Subprocess: that one is internal (parentId, never boundaryHostId),
  // and its non-interrupting flavour is what says the inner tasks run in parallel
  // with the outer ones. Forcing that to interrupting would silently change what
  // every event subprocess means.
  //
  // Done as one pass over the finished element list rather than at each
  // construction site: boundary events are built in several places, including the
  // EP tidy-up that adopts a stray intermediate event sitting on an EP edge, and
  // a pass cannot be forgotten by whichever path runs next.
  for (const el of elements) {
    if (el.type !== "intermediate-event" || !el.boundaryHostId) continue;
    const props = (el.properties ?? {}) as Record<string, unknown>;
    if (props.interruptionType === "interrupting") continue;
    el.properties = { ...props, interruptionType: "interrupting" };
  }

  // The generated diagram carries NO "AI Generated" annotation.
  //
  // It used to: an R56 text-annotation pinned above the process start event,
  // naming the prompt. That was once the only way to see where a diagram came
  // from. It is not any more — a generated diagram stores its prompt on
  // `data.aiGeneration` (promptId, promptName, promptText, model, generatedAt)
  // and the editor surfaces it on demand, so the annotation was duplicating
  // that in ink, on every diagram, permanently. Paul, 2026-08-27: remove it.
  //
  // Diagrams generated BEFORE this still carry the element in their stored
  // data — nothing rewrites them, so an old diagram keeps its annotation.
  const finalConnectors: Connector[] = [...computedConnectors];

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
      // Issue 6: a gateway INSIDE an EP (or any container) must IGNORE its own
      // ancestor containers when placing its label — the label lives inside the
      // EP, so the EP's own box isn't an obstacle for it (otherwise the label is
      // shoved uselessly around its own container).
      const ancestors = new Set<string>();
      { let cur: DiagramElement | undefined = g; let guard = 0;
        while (cur?.parentId && guard++ < 12) { ancestors.add(cur.parentId); cur = elements.find(e => e.id === cur!.parentId); } }
      const near = elements.filter(e => e.id !== g.id && !ancestors.has(e.id) && OBST.has(e.type)
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
      // R5.09b: another element's LABEL is an obstacle too.
      //
      // The sweep avoided bodies and connector segments but not the text beside
      // them, so a gateway label came to rest neatly on top of a neighbour's
      // name — "Rating output valid?" over the data object "Rated Consumption
      // Record" in V23.03, and "Prior formal notice issued?" under the end
      // event "Account flagged — ineligible…" in V23.08. A label is what the
      // reader is trying to read; it occupies space exactly as a box does.
      const nearLabels = near
        .map(e => externalLabelBox(e))
        .filter((b): b is { x: number; y: number; w: number; h: number } => !!b);
      const clear = (b: { x: number; y: number; w: number; h: number }) =>
        !near.some(e => hitsBox(b, e)) && !segs.some(s => hitsSeg(b, s))
        && !nearLabels.some(l => b.x < l.x + l.w && l.x < b.x + b.w
                              && b.y < l.y + l.h && l.y < b.y + b.h);
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

  applyRepeatMarkers(elements, aiElements);
  // EXPERIMENTAL (SuperAdmin): swap sequence-connector geometry for the C1/C2
  // Test scheme. Element positions + non-sequence connectors are unchanged.
  const outConnectors = opts?.mode === "test"
    ? buildTestConnectors(finalConnectors, elements)
    : finalConnectors;
  return {
    elements,
    connectors: outConnectors,
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
    const size = autoElementSize(ai.type, ai.label ?? "", ai.taskType as string | undefined, def);
    elements.push({
      id, type: ai.type as DiagramElement["type"],
      x: 100 + pos.col * (size.w + 60),
      y: 200 + pos.row * (size.h + 80),
      width: size.w, height: size.h,
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

  applyRepeatMarkers(elements, aiElements);
  return {
    elements, connectors: computed,
    viewport: { x: 0, y: 0, zoom: 0.8 },
    fontSize: 12, connectorFontSize: 10,
  };
}

/**
 * Deterministic top-down layout for AI-generated Standard Flowcharts.
 *
 * Phase 2 of the flowchart AI pipeline: takes a validated (possibly
 * hand-edited) plan of { elements, connections } and lays it out as a clean
 * top-to-bottom flow — longest-path ranking stacks the main spine vertically;
 * decisions that branch place their branches side-by-side in the next rank and
 * re-converge at a merge/target one rank lower. No model call happens here.
 */

import type { DiagramData, DiagramElement, Connector, Point } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";
import { computeWaypoints } from "./routing";
import { wrapText } from "./textMetrics";

export interface AiFcElement {
  id: string;
  type: string;   // free-form AI type, mapped to a flowchart-* symbol below
  label?: string;
  name?: string;
  /** Optional actor / role / system. When any element carries a lane the flow
   *  is laid out as vertical swimlane columns, left-to-right in first-appearance
   *  order (F4.01). */
  lane?: string;
}
export interface AiFcConnection {
  sourceId: string;
  targetId: string;
  label?: string;
}
export interface AiFcPlan {
  elements: AiFcElement[];
  connections: AiFcConnection[];
}

const START_X = 420;   // band centre
const START_Y = 60;
const ROW_GAP = 56;    // vertical gap between ranks
const COL_GAP = 70;    // horizontal gap between nodes sharing a rank

/** Map a free-form AI element type onto a concrete flowchart symbol type. */
function mapType(raw: string): DiagramElement["type"] {
  const k = (raw || "").toLowerCase().replace(/[^a-z]/g, "");
  if (/^(start|begin|terminator|terminal|end|stop|finish)$/.test(k)) return "flowchart-terminator";
  if (/(decision|choice|condition|gateway|branch|ifelse|^if$)/.test(k)) return "flowchart-decision";
  if (/(multidoc|multipledocuments|documents)/.test(k)) return "flowchart-multidoc";
  if (/(document|doc|report)/.test(k)) return "flowchart-document";
  if (/(predefined|subroutine|subprocess|namedprocess)/.test(k)) return "flowchart-predefined";
  if (/(preparation|prep|setup|init)/.test(k)) return "flowchart-preparation";
  if (/(manualinput|keyentry)/.test(k)) return "flowchart-manual-input";
  if (/(manualop|manualoperation|manual)/.test(k)) return "flowchart-manual-op";
  if (/(display|screen|monitor)/.test(k)) return "flowchart-display";
  if (/(delay|wait)/.test(k)) return "flowchart-delay";
  if (/(database|db|datastore|store)/.test(k)) return "flowchart-database";
  if (/(offpage)/.test(k)) return "flowchart-offpage";
  if (/(onpage|connector)/.test(k)) return "flowchart-onpage";
  if (/(parallel|fork|synchron)/.test(k)) return "flowchart-parallel";
  if (/(comment|note|annotation|callout)/.test(k)) return "flowchart-comment";
  if (/(merge|join)/.test(k)) return "flowchart-merge";
  if (/(inputoutput|^io$|input|output|data)/.test(k)) return "flowchart-io";
  // process / action / task / operation / activity / step / anything else
  return "flowchart-process";
}

/** Aspect-locked decision sizing so the label fits the inscribed rect (w/2 × h/2). */
function decisionSize(label: string): { w: number; h: number } {
  const aspect = 120 / 80;
  const lineH = 14, fontSize = 12;
  let w = 120;
  for (let i = 0; i < 60; i++) {
    const lines = wrapText(label || "", w * 0.5, fontSize);
    const h = w / aspect;
    const textH = lines.length * lineH;
    const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 1);
    if (textH + 8 <= h * 0.5 && maxChars * fontSize * 0.55 <= w * 0.5) break;
    w += 8;
  }
  return { w: Math.round(w), h: Math.round(w / aspect) };
}

function sizeFor(type: DiagramElement["type"], label: string): { w: number; h: number } {
  if (type === "flowchart-decision") return decisionSize(label);
  const def = getSymbolDefinition(type);
  // Grow process-like boxes a little for long labels so text isn't clipped.
  const lines = wrapText(label || "", def.defaultWidth - 16, 12);
  const neededH = Math.max(def.defaultHeight, lines.length * 16 + 20);
  return { w: def.defaultWidth, h: neededH };
}

export function layoutFlowchartDiagram(plan: AiFcPlan): DiagramData {
  const aiElements = plan.elements ?? [];
  const aiConnections = plan.connections ?? [];
  if (aiElements.length === 0) {
    return { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 0.8 }, fontSize: 12, connectorFontSize: 10 };
  }

  const ids = aiElements.map((e) => e.id);
  const idSet = new Set(ids);
  const edges = aiConnections.filter((c) => idSet.has(c.sourceId) && idSet.has(c.targetId));
  const outgoing = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of ids) { outgoing.set(id, []); indeg.set(id, 0); }
  for (const c of edges) {
    outgoing.get(c.sourceId)!.push(c.targetId);
    indeg.set(c.targetId, (indeg.get(c.targetId) ?? 0) + 1);
  }

  // Sources: no incoming edges (fall back to first element if all cycle).
  let sources = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  if (sources.length === 0) sources = [ids[0]];

  // Longest-path rank (y-layer). Bounded relaxation is cycle-safe.
  const rank = new Map<string, number>(ids.map((id) => [id, 0]));
  for (let iter = 0; iter < ids.length; iter++) {
    let changed = false;
    for (const c of edges) {
      const nr = (rank.get(c.sourceId) ?? 0) + 1;
      if (nr > (rank.get(c.targetId) ?? 0)) { rank.set(c.targetId, nr); changed = true; }
    }
    if (!changed) break;
  }

  const incoming = new Map<string, string[]>();
  for (const id of ids) incoming.set(id, []);
  for (const c of edges) incoming.get(c.targetId)!.push(c.sourceId);

  // DFS pre-order from sources — a stable starting order that keeps a decision's
  // branches adjacent in x before the crossing-minimisation pass refines it.
  const order = new Map<string, number>();
  let orderCounter = 0;
  const visited = new Set<string>();
  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    order.set(id, orderCounter++);
    for (const next of outgoing.get(id) ?? []) dfs(next);
  }
  for (const s of sources) dfs(s);
  for (const id of ids) if (!visited.has(id)) { order.set(id, orderCounter++); } // strays last

  // Group elements by rank (y-layer).
  const aiById = new Map(aiElements.map((e) => [e.id, e]));
  const byRank = new Map<number, string[]>();
  for (const e of aiElements) {
    const r = rank.get(e.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(e.id);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);

  // F4.03 — crossing minimisation. Seed each rank's order from the DFS order,
  // then run a few barycenter sweeps (down using upper neighbours, up using
  // lower neighbours): a node drifts toward the average position of its
  // neighbours in the adjacent rank, which untangles flowline crossings.
  const rankOrder = new Map<number, string[]>();
  for (const r of ranks) {
    rankOrder.set(r, [...byRank.get(r)!].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
  }
  const pos = new Map<string, number>();
  for (const r of ranks) rankOrder.get(r)!.forEach((id, i) => pos.set(id, i));
  const SWEEPS = 4;
  for (let s = 0; s < SWEEPS; s++) {
    const down = s % 2 === 0;
    const seq = down ? ranks : [...ranks].reverse();
    for (const r of seq) {
      const arr = rankOrder.get(r)!;
      const bary = new Map<string, number>();
      for (let i = 0; i < arr.length; i++) {
        const id = arr[i];
        const ns = (down ? incoming.get(id)! : outgoing.get(id)!);
        const vals = ns.map((n) => pos.get(n)).filter((v): v is number => v !== undefined);
        bary.set(id, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : (pos.get(id) ?? i));
      }
      const sorted = arr
        .map((id, i) => ({ id, i }))
        .sort((a, b) => (bary.get(a.id)! - bary.get(b.id)!) || (a.i - b.i))
        .map((o) => o.id);
      rankOrder.set(r, sorted);
      sorted.forEach((id, i) => pos.set(id, i));
    }
  }

  // Size every element up front (shared by both placement modes).
  const sizeById = new Map<string, { w: number; h: number }>();
  const typeById = new Map<string, DiagramElement["type"]>();
  for (const e of aiElements) {
    const type = mapType(e.type);
    typeById.set(e.id, type);
    sizeById.set(e.id, sizeFor(type, e.label ?? e.name ?? ""));
  }

  // F4.01 — swimlane mode kicks in when any element carries a lane.
  const laneOf = new Map<string, string>();
  for (const e of aiElements) { const l = (e.lane ?? "").trim(); if (l) laneOf.set(e.id, l); }
  const laneOrder: string[] = [];
  for (const e of aiElements) { const l = (e.lane ?? "").trim(); if (l && !laneOrder.includes(l)) laneOrder.push(l); }
  const swimlaneMode = laneOrder.length > 0;

  const elements: DiagramElement[] = [];

  if (swimlaneMode) {
    const MIN_LANE_W = 180, LANE_PAD = 30, HEADER_H = 36, LANE_START_X = 60;
    const laneNameFor = (id: string) => laneOf.get(id) ?? laneOrder[0];

    // Bucket each rank's elements by lane (preserving the crossing-min order).
    const laneRankIds = new Map<string, Map<number, string[]>>();
    for (const l of laneOrder) laneRankIds.set(l, new Map());
    for (const r of ranks) {
      for (const id of rankOrder.get(r)!) {
        const m = laneRankIds.get(laneNameFor(id))!;
        (m.get(r) ?? m.set(r, []).get(r)!).push(id);
      }
    }

    // Lane widths from the widest per-rank content; cumulative left positions.
    const laneWidth = new Map<string, number>();
    for (const l of laneOrder) {
      let maxRowW = 0;
      for (const [, idsIn] of laneRankIds.get(l)!) {
        const w = idsIn.reduce((sum, id) => sum + sizeById.get(id)!.w, 0) + COL_GAP * (idsIn.length - 1);
        maxRowW = Math.max(maxRowW, w);
      }
      laneWidth.set(l, Math.max(MIN_LANE_W, maxRowW + LANE_PAD * 2));
    }
    const laneLeft = new Map<string, number>();
    { let x = LANE_START_X; for (const l of laneOrder) { laneLeft.set(l, x); x += laneWidth.get(l)!; } }
    const laneCenter = (l: string) => laneLeft.get(l)! + laneWidth.get(l)! / 2;

    // Row Y positions (rank → top + height), then total band height.
    const contentTop = START_Y + HEADER_H + 20;
    const rankY = new Map<number, number>(), rankH = new Map<number, number>();
    { let y = contentTop; for (const r of ranks) { const h = Math.max(...rankOrder.get(r)!.map((id) => sizeById.get(id)!.h)); rankY.set(r, y); rankH.set(r, h); y += h + ROW_GAP; } }
    let bandH = HEADER_H + 20 + 10; for (const r of ranks) bandH += (rankH.get(r) ?? 0) + ROW_GAP;

    // Column elements first so they render behind the flow.
    const colIdByLane = new Map<string, string>();
    laneOrder.forEach((l, i) => {
      const id = `vlane-${i + 1}`;
      colIdByLane.set(l, id);
      elements.push({
        id, type: "flowchart-vswimlane",
        x: Math.round(laneLeft.get(l)!), y: START_Y,
        width: Math.round(laneWidth.get(l)!), height: Math.round(bandH),
        label: l, properties: {},
      });
    });

    // Flow elements: y by rank, x centred within their lane column.
    for (const r of ranks) {
      const y0 = rankY.get(r)!, rh = rankH.get(r)!;
      for (const l of laneOrder) {
        const idsIn = laneRankIds.get(l)!.get(r) ?? [];
        if (idsIn.length === 0) continue;
        const sizes = idsIn.map((id) => sizeById.get(id)!);
        const groupW = sizes.reduce((sum, z) => sum + z.w, 0) + COL_GAP * (idsIn.length - 1);
        let x = laneCenter(l) - groupW / 2;
        idsIn.forEach((id, i) => {
          const e = aiById.get(id)!, s = sizes[i];
          elements.push({
            id, type: typeById.get(id)!,
            x: Math.round(x), y: Math.round(y0 + (rh - s.h) / 2),
            width: s.w, height: s.h,
            label: e.label ?? e.name ?? "", properties: {},
            parentId: colIdByLane.get(l)!,
          });
          x += s.w + COL_GAP;
        });
      }
    }
  } else {
    // Centred top-down layout — each rank's row is centred on the band axis,
    // ordered by the crossing-minimised rankOrder.
    let cursorY = START_Y;
    for (const r of ranks) {
      const rowIds = rankOrder.get(r)!;
      const sizes = rowIds.map((id) => sizeById.get(id)!);
      const rowH = Math.max(...sizes.map((s) => s.h));
      const totalW = sizes.reduce((sum, s) => sum + s.w, 0) + COL_GAP * (rowIds.length - 1);
      let x = START_X - totalW / 2;
      rowIds.forEach((id, i) => {
        const e = aiById.get(id)!, s = sizes[i];
        elements.push({
          id, type: typeById.get(id)!,
          x: Math.round(x), y: Math.round(cursorY + (rowH - s.h) / 2),
          width: s.w, height: s.h,
          label: e.label ?? e.name ?? "", properties: {},
        });
        x += s.w + COL_GAP;
      });
      cursorY += rowH + ROW_GAP;
    }
  }

  // Connectors — flowlines, rectilinear, source→target arrowheads.
  const elMap = new Map(elements.map((e) => [e.id, e]));
  const outCount = new Map<string, number>();
  for (const c of edges) outCount.set(c.sourceId, (outCount.get(c.sourceId) ?? 0) + 1);

  const connectors: Connector[] = [];
  for (const c of edges) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;
    const srcCx = src.x + src.width / 2, tgtCx = tgt.x + tgt.width / 2;
    const srcCy = src.y + src.height / 2, tgtCy = tgt.y + tgt.height / 2;

    const srcIsBranchingDecision =
      src.type === "flowchart-decision" && (outCount.get(src.id) ?? 0) >= 2;

    let srcSide: string, tgtSide: string;
    if (srcIsBranchingDecision) {
      // F4.02 — a branching Decision exits its LEFT / RIGHT diamond points; a
      // branch heading roughly straight down (or back up) keeps bottom/top.
      const dx = tgtCx - srcCx;
      srcSide = Math.abs(dx) < src.width * 0.3
        ? (tgtCy >= srcCy ? "bottom" : "top")
        : (dx > 0 ? "right" : "left");
      tgtSide = tgtCy >= srcCy ? "top" : "bottom";
    } else if (Math.abs(tgtCy - srcCy) >= Math.abs(tgtCx - srcCx)) {
      srcSide = tgtCy >= srcCy ? "bottom" : "top";
      tgtSide = tgtCy >= srcCy ? "top" : "bottom";
    } else {
      srcSide = tgtCx > srcCx ? "right" : "left";
      tgtSide = tgtCx > srcCx ? "left" : "right";
    }

    // F4.05 — flowlines converging on a Merge from above attach to its TOP edge
    // (the per-line offset is fanned out in a second pass below).
    if (tgt.type === "flowchart-merge" && tgtCy >= srcCy) {
      tgtSide = "top";
      if (!srcIsBranchingDecision) srcSide = "bottom";
    }

    const hasLabel = !!(c.label && c.label.trim().length > 0);
    const conn: Connector = {
      id: `conn-${c.sourceId}-${c.targetId}`,
      sourceId: c.sourceId, targetId: c.targetId,
      sourceSide: srcSide as Connector["sourceSide"],
      targetSide: tgtSide as Connector["targetSide"],
      type: "flowline",
      directionType: "directed",
      routingType: "rectilinear",
      sourceInvisibleLeader: false,
      targetInvisibleLeader: false,
      waypoints: [] as Point[],
      label: c.label ?? "",
      ...(hasLabel ? { labelAnchor: "source" as const } : {}),
    } as Connector;
    connectors.push(conn);
  }

  // F4.05 — when several flowlines converge on a Merge's top edge, fan their
  // attachment points out across that edge (ordered left→right by source x) so
  // the arrowheads sit slightly apart instead of overlapping at the centre.
  const mergeInputs = new Map<string, Connector[]>();
  for (const conn of connectors) {
    const tgt = elMap.get(conn.targetId);
    if (tgt?.type === "flowchart-merge" && conn.targetSide === "top") {
      const list = mergeInputs.get(conn.targetId) ?? mergeInputs.set(conn.targetId, []).get(conn.targetId)!;
      list.push(conn);
    }
  }
  for (const [, group] of mergeInputs) {
    if (group.length < 2) continue;
    group.sort((a, b) => {
      const sa = elMap.get(a.sourceId)!, sb = elMap.get(b.sourceId)!;
      return (sa.x + sa.width / 2) - (sb.x + sb.width / 2);
    });
    group.forEach((conn, i) => { conn.targetOffsetAlong = (i + 1) / (group.length + 1); });
  }

  // Swimlane columns must NOT act as routing obstacles — flowlines cross lane
  // boundaries freely.
  const obstacles = elements.filter((e) => e.type !== "flowchart-vswimlane");
  const computed = connectors.map((conn) => {
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    try {
      const r = computeWaypoints(
        src, tgt, obstacles, conn.sourceSide, conn.targetSide, conn.routingType,
        conn.sourceOffsetAlong ?? 0.5, conn.targetOffsetAlong ?? 0.5,
      );
      return { ...conn, waypoints: r.waypoints, sourceInvisibleLeader: r.sourceInvisibleLeader, targetInvisibleLeader: r.targetInvisibleLeader };
    } catch { return conn; }
  });

  return {
    elements,
    connectors: computed,
    viewport: { x: 0, y: 0, zoom: 0.8 },
    fontSize: 12,
    connectorFontSize: 10,
  };
}

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

  // DFS pre-order from sources to keep a decision's branches adjacent in x.
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

  // Build element rects, grouped by rank.
  const byRank = new Map<number, AiFcElement[]>();
  for (const e of aiElements) {
    const r = rank.get(e.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(e);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);

  const elements: DiagramElement[] = [];
  const sizeById = new Map<string, { w: number; h: number }>();
  let cursorY = START_Y;
  for (const r of ranks) {
    const row = byRank.get(r)!.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const sizes = row.map((e) => {
      const type = mapType(e.type);
      const label = e.label ?? e.name ?? "";
      const s = sizeFor(type, label);
      sizeById.set(e.id, s);
      return s;
    });
    const rowH = Math.max(...sizes.map((s) => s.h));
    const totalW = sizes.reduce((sum, s) => sum + s.w, 0) + COL_GAP * (row.length - 1);
    let x = START_X - totalW / 2;
    for (let i = 0; i < row.length; i++) {
      const e = row[i];
      const s = sizes[i];
      const type = mapType(e.type);
      elements.push({
        id: e.id, type,
        x: Math.round(x), y: Math.round(cursorY + (rowH - s.h) / 2),
        width: s.w, height: s.h,
        label: e.label ?? e.name ?? "",
        properties: {},
      });
      x += s.w + COL_GAP;
    }
    cursorY += rowH + ROW_GAP;
  }

  // Connectors — flowlines, rectilinear, source→target arrowheads.
  const elMap = new Map(elements.map((e) => [e.id, e]));
  const connectors: Connector[] = [];
  for (const c of edges) {
    const src = elMap.get(c.sourceId);
    const tgt = elMap.get(c.targetId);
    if (!src || !tgt) continue;
    const srcCx = src.x + src.width / 2, tgtCx = tgt.x + tgt.width / 2;
    const srcCy = src.y + src.height / 2, tgtCy = tgt.y + tgt.height / 2;
    let srcSide: string, tgtSide: string;
    if (Math.abs(tgtCy - srcCy) >= Math.abs(tgtCx - srcCx)) {
      srcSide = tgtCy >= srcCy ? "bottom" : "top";
      tgtSide = tgtCy >= srcCy ? "top" : "bottom";
    } else {
      srcSide = tgtCx > srcCx ? "right" : "left";
      tgtSide = tgtCx > srcCx ? "left" : "right";
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

  const computed = connectors.map((conn) => {
    const src = elMap.get(conn.sourceId);
    const tgt = elMap.get(conn.targetId);
    if (!src || !tgt) return conn;
    try {
      const r = computeWaypoints(src, tgt, elements, conn.sourceSide, conn.targetSide, conn.routingType, 0.5, 0.5);
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

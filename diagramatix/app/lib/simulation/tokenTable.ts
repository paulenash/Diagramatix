/**
 * Build the token-trace TABLE from a replay trace: one row per token, one column
 * per visited element, each cell the TIME SPENT there (with wait / service split
 * and visit count), plus a total flow time, an outcome, and summary statistics.
 *
 * Pure + data-only (reads the trace the replay already produced), so it's easy to
 * unit-test and cheap to recompute when the user opens the table.
 */

import type { TraceEvent } from "./engine";

export interface NodeMeta { label: string; kind: string; team?: string }
export interface TokenCell { time: number; wait: number; service: number; visits: number; firstEnter: number }
export interface TokenRow {
  id: string; num: number; cells: Record<string, TokenCell>;
  start: number; end: number; total: number;
  outcome: string; completed: boolean; hitBoundary: boolean;
}
export interface ColMeta { id: string; label: string; kind: string; team?: string }
export interface ElementStat { id: string; label: string; count: number; avgTime: number; avgWait: number; maxTime: number }
export interface TokenTable {
  rows: TokenRow[];
  cols: ColMeta[];
  maxCellTime: number; // for the heatmap tint
  stats: {
    tokens: number; completed: number; interrupted: number;
    flow: { avg: number; median: number; p90: number; min: number; max: number } | null;
    perElement: ElementStat[];
    outcomes: { label: string; count: number }[];
  };
}

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function buildTokenTable(trace: TraceEvent[], nodeMeta: Map<string, NodeMeta>): TokenTable {
  const byToken = new Map<string, TraceEvent[]>();
  for (const ev of trace) {
    if (ev.kind === "fire" || !ev.tokenId) continue; // element flashes aren't token moves
    (byToken.get(ev.tokenId) ?? byToken.set(ev.tokenId, []).get(ev.tokenId)!).push(ev);
  }

  const rows: TokenRow[] = [];
  const colFirst = new Map<string, number[]>(); // nodeId → first-enter times (column order)
  let maxCellTime = 0;

  for (const [id, evs] of byToken) {
    evs.sort((a, b) => a.t - b.t);
    // Position-defining events (spawn + enter) — each carries the node the token
    // is now at. It stays until the next such event (or its exit).
    const pos = evs.filter((e) => (e.kind === "spawn" || e.kind === "enter") && e.nodeId);
    if (pos.length === 0) continue;
    const exitEv = evs.find((e) => e.kind === "exit");
    const exitT = exitEv ? exitEv.t : evs[evs.length - 1].t;
    const cells: Record<string, TokenCell> = {};

    for (let i = 0; i < pos.length; i++) {
      const nodeId = pos[i].nodeId as string;
      const tEnter = pos[i].t;
      const tLeave = i + 1 < pos.length ? pos[i + 1].t : exitT;
      // Wait vs service: a "service" event within the visit splits the two;
      // otherwise the whole visit is dwell (delays, un-resourced tasks).
      const svc = evs.find((e) => e.kind === "service" && e.nodeId === nodeId && e.t >= tEnter && e.t <= tLeave);
      const wait = svc ? svc.t - tEnter : 0;
      const service = svc ? tLeave - svc.t : tLeave - tEnter;
      const time = tLeave - tEnter;
      const c = cells[nodeId] ?? (cells[nodeId] = { time: 0, wait: 0, service: 0, visits: 0, firstEnter: tEnter });
      c.time += time; c.wait += wait; c.service += service; c.visits += 1; c.firstEnter = Math.min(c.firstEnter, tEnter);
      if (c.time > maxCellTime) maxCellTime = c.time;
      (colFirst.get(nodeId) ?? colFirst.set(nodeId, []).get(nodeId)!).push(tEnter);
    }

    const start = pos[0].t;
    const lastNode = pos[pos.length - 1].nodeId as string;
    const completed = nodeMeta.get(lastNode)?.kind === "sink";
    const outcome = completed ? (nodeMeta.get(lastNode)?.label || lastNode) : "interrupted";
    const hitBoundary = !completed; // an interrupted token was diverted by a boundary event
    rows.push({ id, num: 0, cells, start, end: exitT, total: exitT - start, outcome, completed, hitBoundary });
  }

  rows.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1)); // arrival order
  rows.forEach((r, i) => (r.num = i + 1));

  const cols: ColMeta[] = [...colFirst.keys()]
    .map((cid) => ({ cid, ord: avg(colFirst.get(cid)!), meta: nodeMeta.get(cid) }))
    .sort((a, b) => a.ord - b.ord) // flow order
    .map(({ cid, meta }) => ({ id: cid, label: meta?.label || cid, kind: meta?.kind || "?", team: meta?.team }));

  const completedRows = rows.filter((r) => r.completed);
  const flows = completedRows.map((r) => r.total).sort((a, b) => a - b);
  const flow = flows.length
    ? { avg: avg(flows), median: quantile(flows, 0.5), p90: quantile(flows, 0.9), min: flows[0], max: flows[flows.length - 1] }
    : null;
  const perElement: ElementStat[] = cols.map((c) => {
    const cs = rows.map((r) => r.cells[c.id]).filter(Boolean) as TokenCell[];
    return {
      id: c.id, label: c.label, count: cs.length,
      avgTime: avg(cs.map((x) => x.time)), avgWait: avg(cs.map((x) => x.wait)),
      maxTime: cs.length ? Math.max(...cs.map((x) => x.time)) : 0,
    };
  });
  const outCount = new Map<string, number>();
  for (const r of rows) outCount.set(r.outcome, (outCount.get(r.outcome) ?? 0) + 1);
  const outcomes = [...outCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  return { rows, cols, maxCellTime, stats: { tokens: rows.length, completed: completedRows.length, interrupted: rows.length - completedRows.length, flow, perElement, outcomes } };
}

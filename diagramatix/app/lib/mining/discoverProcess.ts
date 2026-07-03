/**
 * Process discovery: variants -> a directly-follows graph (DFG) -> a BPMN plan
 * (`{AiElement[], AiConnection[]}`) that `layoutBpmnDiagram` renders. Splits (a
 * node with >1 successor) and merges (>1 predecessor) become exclusive gateways,
 * so the result is proper, readable BPMN AND simulatable (the engine routes on
 * gateways). Frequency filtering trims rare edges to tame spaghetti. Pure.
 */
import type { Variant } from "./types";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

// A SOH control char separates the two activities in an edge key so it can never
// collide with a character inside an activity name.
const SEP = String.fromCharCode(1);
export const edgeKey = (from: string, to: string): string => from + SEP + to;
const splitKey = (k: string): [string, string] => { const i = k.indexOf(SEP); return [k.slice(0, i), k.slice(i + 1)]; };

/** Directly-follows graph aggregated over the variants (weighted by frequency). */
export interface Dfg {
  nodes: Map<string, number>;   // activity -> occurrences
  edges: Map<string, number>;   // edgeKey(a,b) -> directly-follows count
  starts: Map<string, number>;  // first activity per case -> count
  ends: Map<string, number>;    // last activity per case -> count
}

export function buildDfg(variants: Variant[]): Dfg {
  const nodes = new Map<string, number>();
  const edges = new Map<string, number>();
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  for (const v of variants) {
    const acts = v.events.filter(Boolean);
    if (acts.length === 0) continue;
    bump(starts, acts[0], v.count);
    bump(ends, acts[acts.length - 1], v.count);
    for (let i = 0; i < acts.length; i++) {
      bump(nodes, acts[i], v.count);
      if (i > 0) bump(edges, edgeKey(acts[i - 1], acts[i]), v.count);
    }
  }
  return { nodes, edges, starts, ends };
}

export interface DiscoverOptions {
  /** Drop directly-follows edges below this fraction (0..1) of the busiest edge. */
  edgeThreshold?: number;
}

export interface DiscoveredProcess {
  plan: { elements: AiElement[]; connections: AiConnection[] };
  dfg: Dfg;
  keptActivities: string[];
}

const START = "__start", END = "__end";

function uniqueId(label: string, used: Set<string>): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "n";
  let id = base, i = 2;
  while (used.has(id)) id = `${base}-${i++}`;
  used.add(id);
  return id;
}

export function discoverProcess(variants: Variant[], opts: DiscoverOptions = {}): DiscoveredProcess {
  const dfg = buildDfg(variants);
  const maxEdge = Math.max(1, ...dfg.edges.values());
  const thr = (opts.edgeThreshold ?? 0) * maxEdge;

  const kept = [...dfg.edges].filter(([, c]) => c >= thr).map(([k, c]) => { const [s, t] = splitKey(k); return { s, t, c }; });
  const keptActs = new Set<string>();
  for (const e of kept) { keptActs.add(e.s); keptActs.add(e.t); }
  for (const a of dfg.starts.keys()) keptActs.add(a);
  for (const a of dfg.ends.keys()) keptActs.add(a);

  const used = new Set<string>([START, END]);
  const idOf = new Map<string, string>();
  for (const a of keptActs) idOf.set(a, uniqueId(a, used));
  const nodeId = (n: string) => (n === START ? START : n === END ? END : idOf.get(n)!);

  // Unified edge list (incl. start/end pseudo-edges) drives gateway placement.
  type E = { u: string; v: string; c: number };
  const all: E[] = [];
  for (const [a, c] of dfg.starts) if (keptActs.has(a)) all.push({ u: START, v: a, c });
  for (const [a, c] of dfg.ends) if (keptActs.has(a)) all.push({ u: a, v: END, c });
  for (const e of kept) all.push({ u: e.s, v: e.t, c: e.c });

  const outDeg = new Map<string, number>(), inDeg = new Map<string, number>();
  for (const e of all) { outDeg.set(e.u, (outDeg.get(e.u) ?? 0) + 1); inDeg.set(e.v, (inDeg.get(e.v) ?? 0) + 1); }

  const POOL = "pool_mined";
  const elements: AiElement[] = [
    { id: POOL, type: "pool", label: "Discovered process", poolType: "white-box" },
    { id: START, type: "start-event", label: "", pool: POOL },
    { id: END, type: "end-event", label: "", pool: POOL },
  ];
  for (const a of keptActs) elements.push({ id: idOf.get(a)!, type: "task", label: a, pool: POOL });

  const connections: AiConnection[] = [];
  const splitGw = new Map<string, string>(), mergeGw = new Map<string, string>();
  for (const [n, d] of outDeg) if (d > 1) {
    const g = uniqueId("gw", used);
    splitGw.set(n, g);
    elements.push({ id: g, type: "gateway", gatewayType: "exclusive", label: "", pool: POOL });
    connections.push({ sourceId: nodeId(n), targetId: g, type: "sequence" });
  }
  for (const [n, d] of inDeg) if (d > 1) {
    const g = uniqueId("gw", used);
    mergeGw.set(n, g);
    elements.push({ id: g, type: "gateway", gatewayType: "exclusive", label: "", pool: POOL });
    connections.push({ sourceId: g, targetId: nodeId(n), type: "sequence" });
  }
  for (const e of all) {
    const from = splitGw.get(e.u) ?? nodeId(e.u);
    const to = mergeGw.get(e.v) ?? nodeId(e.v);
    connections.push({ sourceId: from, targetId: to, type: "sequence", label: String(e.c) });
  }

  return { plan: { elements, connections }, dfg, keptActivities: [...keptActs] };
}

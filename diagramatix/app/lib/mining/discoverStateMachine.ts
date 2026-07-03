/**
 * State-machine discovery: the entity's STATE sequences (from the log's explicit
 * state column) → a candidate UML state machine. Distinct states become `state`
 * nodes; consecutive states become `transition` connectors labelled with the
 * triggering activity; the first state per case is entered from an initial
 * pseudostate, terminal states flow to a final state. Laid out + routed by the
 * shared `layoutGenericDiagram`, then the transition connectors get their formal
 * event data — the same shape a hand-drawn reference State-Machine uses, so the
 * user can edit it and promote it to the reference.
 */
import type { Variant } from "./types";
import type { DiagramData } from "@/app/lib/diagram/types";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";

const SEP = String.fromCharCode(1);
const INIT = "__init", FINAL = "__final";

export interface SmTransition { from: string; to: string; events: string[]; count: number }

export interface StateMachinePlan {
  elements: { id: string; type: string; label: string }[];
  connections: { sourceId: string; targetId: string; label: string; type: string }[];
  transitions: SmTransition[];
}

function slugger() {
  const used = new Set<string>([INIT, FINAL]);
  const map = new Map<string, string>();
  return (label: string): string => {
    const cached = map.get(label);
    if (cached) return cached;
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "s";
    let id = base, i = 2;
    while (used.has(id)) id = `${base}-${i++}`;
    used.add(id); map.set(label, id);
    return id;
  };
}

/** Pure: variants → the state-machine plan (states, event-labelled transitions). */
export function buildStateMachinePlan(variants: Variant[]): StateMachinePlan {
  const states = new Set<string>();
  const trans = new Map<string, { from: string; to: string; events: Map<string, number>; count: number }>();
  const entry = new Map<string, Map<string, number>>();  // first state → entry event → count
  const terminal = new Set<string>();
  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  for (const v of variants) {
    const st = v.states, ev = v.events;
    if (st.length === 0) continue;
    for (const s of st) if (s) states.add(s);
    if (st[0]) bump(entry.get(st[0]) ?? entry.set(st[0], new Map()).get(st[0])!, ev[0] ?? "", v.count);
    for (let i = 1; i < st.length; i++) {
      const from = st[i - 1], to = st[i];
      if (!from || !to) continue;
      const key = `${from}${SEP}${to}`;
      const t = trans.get(key) ?? { from, to, events: new Map<string, number>(), count: 0 };
      bump(t.events, ev[i] ?? "", v.count); t.count += v.count;
      trans.set(key, t);
    }
    const last = st[st.length - 1];
    if (last) terminal.add(last);
  }

  const id = slugger();
  const elements: StateMachinePlan["elements"] = [
    { id: INIT, type: "initial-state", label: "" },
    { id: FINAL, type: "final-state", label: "" },
  ];
  for (const s of states) elements.push({ id: id(s), type: "state", label: s });

  const connections: StateMachinePlan["connections"] = [];
  const transitions: SmTransition[] = [];
  for (const [s, em] of entry) {
    connections.push({ sourceId: INIT, targetId: id(s), label: [...em.keys()].filter(Boolean).join(" / "), type: "transition" });
  }
  for (const t of trans.values()) {
    const events = [...t.events.keys()].filter(Boolean);
    connections.push({ sourceId: id(t.from), targetId: id(t.to), label: events.join(" / "), type: "transition" });
    transitions.push({ from: t.from, to: t.to, events, count: t.count });
  }
  for (const s of terminal) connections.push({ sourceId: id(s), targetId: FINAL, label: "", type: "transition" });

  return { elements, connections, transitions };
}

/** Full discovered state-machine DiagramData (positioned + routed). */
export function discoverStateMachine(variants: Variant[]): DiagramData {
  const plan = buildStateMachinePlan(variants);
  const data = layoutGenericDiagram({ elements: plan.elements, connections: plan.connections }, "state-machine");
  for (const c of data.connectors) {
    if (c.type === "transition" && c.label) {
      c.labelMode = "formal";
      c.transitionEvent = c.label;
    }
  }
  return data;
}

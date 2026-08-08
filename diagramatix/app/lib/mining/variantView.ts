/**
 * Pure helpers for the Variant explorer: map a variant's activity sequence onto
 * the discovered BPMN element/connector ids (to isolate its path on the model)
 * and diff two variants' activity sets. No DB, no React.
 */
import type { DiagramData } from "@/app/lib/diagram/types";
import type { Variant } from "./types";

/** First element id per activity label (discovered activities are unique-labelled). */
export function activityElementIds(data: DiagramData): Map<string, string> {
  const m = new Map<string, string>();
  for (const el of data.elements) {
    const k = (el.label ?? "").trim();
    if (k && !m.has(k)) m.set(k, el.id);
  }
  return m;
}

/** The set of element + connector ids that make up one variant's path through the
 *  discovered model — including the GATEWAYS the path routes through (so the
 *  highlighted path is fully connected) and the start/end events. Used to
 *  emphasise that path on the full model. */
export function variantPathIds(data: DiagramData, events: string[]): Set<string> {
  const map = activityElementIds(data);
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const outConns = new Map<string, DiagramData["connectors"]>();
  for (const c of data.connectors) (outConns.get(c.sourceId) ?? outConns.set(c.sourceId, []).get(c.sourceId)!).push(c);
  const isTask = (id: string) => { const e = byId.get(id); return !!e && (e.type === "task" || e.type === "subprocess" || e.type === "subprocess-expanded"); };
  const ids = new Set<string>();

  // Shortest route from `from` to `to`, passing only THROUGH non-task nodes
  // (gateways/events) — collects the intermediate elements + connectors so the
  // highlight stays connected even when activities are wired via a gateway.
  const route = (from: string, to: string) => {
    const prev = new Map<string, { conn: string; from: string }>();
    const q = [from]; const seen = new Set([from]);
    while (q.length) {
      const n = q.shift()!;
      if (n === to) {
        let cur = to;
        while (cur !== from) { const p = prev.get(cur)!; ids.add(cur); ids.add(p.conn); cur = p.from; }
        ids.add(from);
        return true;
      }
      for (const c of outConns.get(n) ?? []) {
        const t = c.targetId;
        if (seen.has(t) || (t !== to && isTask(t))) continue; // don't pass through OTHER tasks
        seen.add(t); prev.set(t, { conn: c.id, from: n }); q.push(t);
      }
    }
    return false;
  };

  const seq = events.map((a) => map.get(a)).filter((x): x is string => !!x);
  seq.forEach((id) => ids.add(id));
  for (let i = 0; i < seq.length - 1; i++) route(seq[i], seq[i + 1]);
  if (seq.length) {
    for (const s of data.elements.filter((e) => e.type === "start-event")) if (route(s.id, seq[0])) break;
    for (const e of data.elements.filter((e) => e.type === "end-event")) if (route(seq[seq.length - 1], e.id)) break;
  }
  return ids;
}

export interface VariantDiff { onlyA: string[]; onlyB: string[]; common: string[] }

/** Activity-set diff between two variants (which steps are unique to each). */
export function variantDiff(a: string[], b: string[]): VariantDiff {
  const sa = new Set(a), sb = new Set(b);
  return {
    onlyA: [...sa].filter((x) => !sb.has(x)),
    onlyB: [...sb].filter((x) => !sa.has(x)),
    common: [...sa].filter((x) => sb.has(x)),
  };
}

/** Pareto rows: each variant with its share + running cumulative share. */
export function variantPareto(variants: Variant[]): { idx: number; count: number; share: number; cumulative: number; events: string[] }[] {
  const total = variants.reduce((s, v) => s + v.count, 0) || 1;
  let cum = 0;
  return variants.map((v, idx) => {
    const share = v.count / total;
    cum += share;
    return { idx, count: v.count, share, cumulative: cum, events: v.events };
  });
}

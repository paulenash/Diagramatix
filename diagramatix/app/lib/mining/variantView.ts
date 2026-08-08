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
 *  discovered model (including the start/end events + their connectors), for use as
 *  `visibleIds` on ReplayDiagramBackdrop to isolate that path. */
export function variantPathIds(data: DiagramData, events: string[]): Set<string> {
  const map = activityElementIds(data);
  const ids = new Set<string>();
  const seq = events.map((a) => map.get(a)).filter((x): x is string => !!x);
  seq.forEach((id) => ids.add(id));
  const conn = (s: string, t: string) => data.connectors.find((c) => c.sourceId === s && c.targetId === t);
  for (let i = 0; i < seq.length - 1; i++) { const c = conn(seq[i], seq[i + 1]); if (c) ids.add(c.id); }
  if (seq.length) {
    for (const s of data.elements.filter((e) => e.type === "start-event")) {
      const c = conn(s.id, seq[0]); if (c) { ids.add(s.id); ids.add(c.id); }
    }
    for (const e of data.elements.filter((e) => e.type === "end-event")) {
      const c = conn(seq[seq.length - 1], e.id); if (c) { ids.add(e.id); ids.add(c.id); }
    }
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

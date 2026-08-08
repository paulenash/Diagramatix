/**
 * Enrich a sparse event log from the project's own models:
 *  - RESOURCE/team ← the Process Diagram (activity → task → its lane).
 *  - STATE         ← the reference State Machine (activity → transition → target state).
 * Match log activities to the model by LABEL (exact, then fuzzy token-overlap) so a
 * log whose activity names align with the documented model gets teams/states filled
 * in. Returns an editable preview (per-activity value + how it matched) — the caller
 * confirms before import. Pure — no DB, no React.
 */
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const TASK = new Set(["task", "subprocess", "subprocess-expanded"]);
const STATE_EL = new Set(["state", "composite-state", "submachine", "initial-state", "final-state"]);

/** Normalise a label for matching: line breaks → spaces, lowercase, strip punctuation. */
export function normLabel(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
const tokens = (s: string) => new Set(normLabel(s).split(" ").filter(Boolean));
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Best model key for a log activity: exact (normalised), else best fuzzy ≥ threshold. */
function bestMatch(activity: string, keys: string[], threshold = 0.5): { key: string; exact: boolean } | null {
  const n = normLabel(activity);
  const exact = keys.find((k) => normLabel(k) === n);
  if (exact) return { key: exact, exact: true };
  const at = tokens(activity);
  let best: { key: string; score: number } | null = null;
  for (const k of keys) { const s = jaccard(at, tokens(k)); if (s > (best?.score ?? 0)) best = { key: k, score: s }; }
  return best && best.score >= threshold ? { key: best.key, exact: false } : null;
}

/** Model task label → nearest containing lane/pool label. */
export function activityLaneMap(bpmn: DiagramData): Record<string, string> {
  const byId = new Map(bpmn.elements.map((e) => [e.id, e]));
  const laneOf = (el: DiagramElement): string | undefined => {
    let cur: DiagramElement | undefined = el.parentId ? byId.get(el.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.type === "lane" || cur.type === "pool") { const l = (cur.label ?? "").replace(/\s+/g, " ").trim(); if (l) return l; }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };
  const map: Record<string, string> = {};
  for (const el of bpmn.elements) {
    if (!TASK.has(el.type)) continue;
    const label = (el.label ?? "").replace(/\s+/g, " ").trim();
    const lane = laneOf(el);
    if (label && lane && !(label in map)) map[label] = lane;
  }
  return map;
}

/** State-Machine transition label (activity) → target state label. */
export function activityStateMap(sm: DiagramData): Record<string, string> {
  const byId = new Map(sm.elements.map((e) => [e.id, e]));
  const map: Record<string, string> = {};
  for (const c of sm.connectors) {
    const label = (c.label ?? "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    const target = byId.get(c.targetId);
    const state = (target?.label ?? "").replace(/\s+/g, " ").trim();
    if (target && STATE_EL.has(target.type) && state && !(label in map)) map[label] = state; // first wins
  }
  return map;
}

export interface EnrichRow { activity: string; value: string; matched: string; exact: boolean }
export interface Enrichment { map: Record<string, string>; rows: EnrichRow[]; unmatched: string[] }

/** Match each log activity to a model label → value; returns per-activity preview. */
function enrichFrom(logActivities: string[], model: Record<string, string>): Enrichment {
  const keys = Object.keys(model);
  const map: Record<string, string> = {};
  const rows: EnrichRow[] = [];
  const unmatched: string[] = [];
  for (const act of logActivities) {
    const m = bestMatch(act, keys);
    if (m) { map[act] = model[m.key]; rows.push({ activity: act, value: model[m.key], matched: m.key, exact: m.exact }); }
    else unmatched.push(act);
  }
  return { map, rows, unmatched };
}

/** activity → team, from the Process Diagram's lanes. */
export function enrichResources(logActivities: string[], bpmn: DiagramData): Enrichment {
  return enrichFrom(logActivities, activityLaneMap(bpmn));
}
/** activity → state, from the reference State Machine's transitions. */
export function enrichStates(logActivities: string[], sm: DiagramData): Enrichment {
  return enrichFrom(logActivities, activityStateMap(sm));
}

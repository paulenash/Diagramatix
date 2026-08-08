/**
 * Annotate an AI-curated BPMN's connectors with the mined directly-follows
 * frequency (as `transitionCount`), so calibrateSimulation can derive gateway
 * branch probabilities and the count badges render — the AI model otherwise
 * carries no frequencies at all. Best-effort by activity LABEL (so it relies on
 * AI discovery keeping the log's activity names); a connector whose endpoints
 * don't resolve to log activities is left unannotated. Pure — no DB, no React.
 */
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import type { Variant } from "./types";

const END = "__DGX_END__";
const key = (a: string, b: string) => JSON.stringify([a, b]);
const isTask = (e?: DiagramElement) => !!e && (e.type === "task" || e.type === "subprocess" || e.type === "subprocess-expanded");

export function annotateGatewayFrequencies(data: DiagramData, variants: Variant[]): DiagramData {
  // Mined directly-follows counts + per-activity end counts.
  const df = new Map<string, number>();
  const ends = new Map<string, number>();
  for (const v of variants) {
    const es = v.events ?? [];
    for (let i = 0; i < es.length - 1; i++) { const k = key(es[i], es[i + 1]); df.set(k, (df.get(k) ?? 0) + v.count); }
    if (es.length) ends.set(es[es.length - 1], (ends.get(es[es.length - 1]) ?? 0) + v.count);
  }

  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const ins = new Map<string, string[]>();
  const outs = new Map<string, string[]>();
  for (const c of data.connectors) {
    (ins.get(c.targetId) ?? ins.set(c.targetId, []).get(c.targetId)!).push(c.sourceId);
    (outs.get(c.sourceId) ?? outs.set(c.sourceId, []).get(c.sourceId)!).push(c.targetId);
  }
  // Nearest upstream / downstream ACTIVITY label, walking through gateways.
  const upLabel = (id: string, depth = 0): string | null => {
    const e = byId.get(id);
    if (isTask(e)) return (e!.label ?? "").trim() || null;
    if (depth > 8) return null;
    for (const s of ins.get(id) ?? []) { const l = upLabel(s, depth + 1); if (l) return l; }
    return null;
  };
  const downLabel = (id: string, depth = 0): string | null => {
    const e = byId.get(id);
    if (e?.type === "end-event") return END;
    if (isTask(e)) return (e!.label ?? "").trim() || null;
    if (depth > 8) return null;
    for (const t of outs.get(id) ?? []) { const l = downLabel(t, depth + 1); if (l) return l; }
    return null;
  };

  const connectors = data.connectors.map((c) => {
    const up = upLabel(c.sourceId), down = downLabel(c.targetId);
    if (!up || !down) return c;
    const count = down === END ? (ends.get(up) ?? 0) : (df.get(key(up, down)) ?? 0);
    return count > 0 ? { ...c, transitionCount: count } : c;
  });
  return { ...data, connectors };
}

/**
 * Mark the discovered state machine's transition connectors that a conformance
 * reference disallows — an observed transition NOT present in the reference — so
 * the editor renders their count badge in red. Legal transitions are cleared.
 * Pure; matches states by label (same basis as checkTransitionConformance).
 */
import type { DiagramData } from "@/app/lib/diagram/types";
import type { TransitionStat } from "./transitionConformance";

const SEP = String.fromCharCode(1);
// Same basis as checkTransitionConformance: match state labels case- AND
// whitespace-insensitively (collapse internal newlines from a wrapped label).
const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function flagIllegalTransitions(data: DiagramData, stats: TransitionStat[]): DiagramData {
  const illegal = new Set<string>();
  for (const s of stats) if (!s.inReference) illegal.add(norm(s.from) + SEP + norm(s.to));

  const labelById = new Map<string, string>();
  for (const e of data.elements) labelById.set(e.id, norm(e.label ?? ""));

  const connectors = data.connectors.map((c) => {
    if (c.type !== "transition") return c;
    const from = labelById.get(c.sourceId) ?? "";
    const to = labelById.get(c.targetId) ?? "";
    // Only real state→state transitions can be illegal (init/final have no label).
    const bad = !!from && !!to && illegal.has(from + SEP + to);
    return { ...c, transitionIllegal: bad };
  });
  return { ...data, connectors };
}

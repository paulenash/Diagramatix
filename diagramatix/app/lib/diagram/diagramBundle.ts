/**
 * SuperAdmin diagram "bundle" export/import — a self-contained package that
 * carries EVERYTHING about one AI-generated diagram so it can be transferred
 * between environments and re-imported intact:
 *   • the diagram itself (data + colorConfig + displayMode + aiComparison)
 *   • its linked Prompt (text + planJson — the editable 2-phase AI Plan)
 *   • the per-model comparison diagrams referenced by aiComparison
 *
 * A diagram's AI footprint is spread across `Diagram.data` (embeds an
 * `aiGeneration` snapshot with a `promptId`), the `Diagram.aiComparison` JSON
 * column (whose `models[].diagramId` point at the per-model diagram rows), and
 * the `Prompt` row. On import everything gets NEW ids, so those cross-references
 * must be rewritten — that's what `remapDiagramData` / `remapAiComparison` do.
 *
 * Shared by the export route (app/api/admin/diagram-bundle/[id]) and the import
 * route (app/api/admin/import-diagram-bundle). Pure + framework-free so the remap
 * helpers are unit-testable.
 */

export const BUNDLE_KIND = "diagram-bundle" as const;
export const BUNDLE_VERSION = "1.0" as const;

export interface BundledDiagram {
  /** id in the SOURCE environment — used only to remap references, never reused. */
  originalId: string;
  name: string;
  type: string;
  data: unknown;
  colorConfig: unknown;
  displayMode: string;
}

export interface BundledPrompt {
  originalId: string;
  name: string;
  text: string;
  diagramType: string;
  planJson: unknown | null;
  planUpdatedAt: string | null;
}

export interface DiagramBundle {
  bundleVersion: string;
  kind: typeof BUNDLE_KIND;
  schemaVersion: string;
  appVersion: string;
  exportedAt: string;
  /** The main diagram, plus its aiComparison JSON column (verbatim from source). */
  diagram: BundledDiagram & { aiComparison: unknown };
  /** The linked Prompt, or null when the diagram wasn't AI-generated. */
  prompt: BundledPrompt | null;
  /** Per-model comparison diagrams referenced by aiComparison.models[].diagramId. */
  comparisonDiagrams: BundledDiagram[];
}

/** True when `x` is a plausible diagram bundle envelope (used by the import route). */
export function isDiagramBundle(x: unknown): x is DiagramBundle {
  if (!x || typeof x !== "object") return false;
  const b = x as Record<string, unknown>;
  return b.kind === BUNDLE_KIND && !!b.diagram && typeof b.diagram === "object";
}

/**
 * Rewrite the embedded `aiGeneration.promptId` inside a diagram's `data` JSON to
 * the newly-created Prompt id. Returns a NEW object (does not mutate input). The
 * prompt snapshot (`promptName`/`promptText`) is left as-is. Defensive: no-ops
 * when there's no aiGeneration block or the old id isn't in the map.
 */
export function remapDiagramData(data: unknown, promptIdMap: Map<string, string>): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  const gen = d.aiGeneration;
  if (!gen || typeof gen !== "object") return data;
  const oldId = (gen as Record<string, unknown>).promptId;
  if (typeof oldId !== "string") return data;
  const newId = promptIdMap.get(oldId);
  if (!newId) return data;
  return { ...d, aiGeneration: { ...(gen as Record<string, unknown>), promptId: newId } };
}

/**
 * Rewrite `models[].diagramId` inside an aiComparison matrix to the remapped
 * per-model diagram ids. Any id not in the map is blanked (its per-model diagram
 * wasn't in the bundle), so no reference dangles. Returns a NEW object.
 */
export function remapAiComparison(aiComparison: unknown, diagramIdMap: Map<string, string>): unknown {
  if (!aiComparison || typeof aiComparison !== "object") return aiComparison;
  const c = aiComparison as Record<string, unknown>;
  if (!Array.isArray(c.models)) return aiComparison;
  const models = c.models.map((m) => {
    if (!m || typeof m !== "object") return m;
    const mm = m as Record<string, unknown>;
    if (typeof mm.diagramId !== "string") return m;
    return { ...mm, diagramId: diagramIdMap.get(mm.diagramId) ?? "" };
  });
  return { ...c, models };
}

/** Collect the per-model diagram ids referenced by an aiComparison matrix. */
export function comparisonDiagramIds(aiComparison: unknown): string[] {
  if (!aiComparison || typeof aiComparison !== "object") return [];
  const c = aiComparison as Record<string, unknown>;
  if (!Array.isArray(c.models)) return [];
  const ids: string[] = [];
  for (const m of c.models) {
    const id = m && typeof m === "object" ? (m as Record<string, unknown>).diagramId : undefined;
    if (typeof id === "string" && id) ids.push(id);
  }
  return ids;
}

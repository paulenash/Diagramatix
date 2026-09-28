/**
 * SuperAdmin diagram "bundle" export/import — a self-contained package that
 * carries EVERYTHING about one AI-generated diagram so it can be transferred
 * between environments and re-imported intact:
 *   • the diagram itself (data + colorConfig + displayMode + aiComparison)
 *   • its linked Prompt (text + planJson — the editable 2-phase AI Plan)
 *   • the per-model comparison diagrams referenced by aiComparison
 *   • the image each was AI-generated from, when it was kept (AiSourceImage —
 *     Paul, 2026-09-28: "Add image to diagram-bundle"), since 1.1
 *
 * A diagram's AI footprint is spread across `Diagram.data` (embeds an
 * `aiGeneration` snapshot with a `promptId`), the `Diagram.aiComparison` JSON
 * column (whose `models[].diagramId` point at the per-model diagram rows), and
 * the `Prompt` row, and `aiGeneration.sourceImage.id` names an `AiSourceImage`
 * row. On import everything gets NEW ids, so those cross-references must be
 * rewritten — that's what `remapDiagramData` / `remapAiComparison` do.
 *
 * Shared by the export route (app/api/admin/diagram-bundle/[id]) and the import
 * route (app/api/admin/import-diagram-bundle). Pure + framework-free so the remap
 * helpers are unit-testable.
 */

export const BUNDLE_KIND = "diagram-bundle" as const;
/** 1.1 adds `sourceImages` (optional — a 1.0 bundle imports exactly as before). */
export const BUNDLE_VERSION = "1.1" as const;

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

/** A kept source image (AiSourceImage), carried whole. */
export interface BundledSourceImage {
  /** id in the SOURCE environment — used only to remap references, never reused. */
  originalId: string;
  name: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  /** The bytes, base64. The importer checks the type and size again and recomputes the hash. */
  data: string;
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
  /** The images the diagram (and any comparison diagram) was generated from — absent before 1.1. */
  sourceImages?: BundledSourceImage[];
}

/** True when `x` is a plausible diagram bundle envelope (used by the import route). */
export function isDiagramBundle(x: unknown): x is DiagramBundle {
  if (!x || typeof x !== "object") return false;
  const b = x as Record<string, unknown>;
  return b.kind === BUNDLE_KIND && !!b.diagram && typeof b.diagram === "object";
}

/**
 * Rewrite the embedded `aiGeneration.promptId` — and `aiGeneration.sourceImage.id`
 * — inside a diagram's `data` JSON to the newly-created rows' ids. Returns a NEW
 * object (does not mutate input). The prompt snapshot (`promptName`/`promptText`)
 * and the image's name and size are left as-is. Defensive: an id not in its map
 * is left alone, and there is nothing to do without an aiGeneration block.
 */
export function remapDiagramData(
  data: unknown,
  promptIdMap: Map<string, string>,
  imageIdMap: Map<string, string> = new Map(),
): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  const gen = d.aiGeneration;
  if (!gen || typeof gen !== "object") return data;
  const g = gen as Record<string, unknown>;
  const oldPrompt = typeof g.promptId === "string" ? g.promptId : undefined;
  const newPrompt = oldPrompt ? promptIdMap.get(oldPrompt) : undefined;
  const img = g.sourceImage && typeof g.sourceImage === "object" ? (g.sourceImage as Record<string, unknown>) : undefined;
  const oldImage = typeof img?.id === "string" ? img.id : undefined;
  const newImage = oldImage ? imageIdMap.get(oldImage) : undefined;
  if (!newPrompt && !newImage) return data;
  return {
    ...d,
    aiGeneration: {
      ...g,
      ...(newPrompt ? { promptId: newPrompt } : {}),
      ...(newImage ? { sourceImage: { ...img, id: newImage } } : {}),
    },
  };
}

/** The kept source image a diagram's data names (data.aiGeneration.sourceImage.id), if any. */
export function sourceImageIdOf(data: unknown): string | null {
  const gen = data && typeof data === "object" ? (data as Record<string, unknown>).aiGeneration : undefined;
  const img = gen && typeof gen === "object" ? (gen as Record<string, unknown>).sourceImage : undefined;
  const id = img && typeof img === "object" ? (img as Record<string, unknown>).id : undefined;
  return typeof id === "string" && id ? id : null;
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

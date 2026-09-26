/**
 * The single-diagram JSON export envelope: the file "Export as JSON" writes and
 * both Import JSON paths read.
 *
 * ONE builder, because the envelope was written out by hand in the editor's
 * export and again in its SharePoint save, and a voice-debug snapshot now needs
 * it too. Paul, 2026-09-26: "Make the snapshots in Voice Assist JSON, not SVG.
 * These can be better used for diagnosis." A snapshot is worth downloading only
 * if Import JSON opens it, and the way to be sure of that is for it to be
 * written by the same code as every other JSON export.
 *
 * What the two importers check, so this shape has to satisfy both:
 *   • the editor (`DiagramEditor.tsx` handleImportFile): a non-empty `diagrams`
 *     array whose first entry has an object `data`;
 *   • a project (`ProjectDetailClient.tsx` handleImportFile): a `project` and a
 *     `diagrams`;
 *   • both: a `schemaVersion` that `checkSchemaCompatibility` accepts.
 *
 * Pure: no DOM, no network. The caller resolves `appVersion` (the editor asks
 * `/api/schema` for the deployed product version).
 */
import { SCHEMA_VERSION, type DiagramData, type DiagramType } from "./types";
import type { SymbolColorConfig } from "./colors";
import type { DisplayMode } from "./displayMode";

/** One diagram inside the envelope, by the field names both importers read. */
export interface EnvelopeDiagram {
  originalId: string | null;
  name: string;
  type: DiagramType;
  data: DiagramData;
  colorConfig: SymbolColorConfig;
  displayMode: DisplayMode;
}

export interface SingleDiagramEnvelope {
  schemaVersion: string;
  appVersion: string;
  exportedAt: string;
  project: { name: string; description: string; ownerName: string; colorConfig: Record<string, string> };
  diagrams: EnvelopeDiagram[];
  pcfAttribution?: string;
}

export function singleDiagramEnvelope(
  diagram: EnvelopeDiagram,
  opts: { appVersion: string; exportedAt?: string; pcfAttribution?: string },
): SingleDiagramEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: opts.appVersion,
    exportedAt: opts.exportedAt ?? new Date().toISOString(),
    project: { name: "(single diagram)", description: "", ownerName: "", colorConfig: {} },
    diagrams: [{
      originalId: diagram.originalId,
      name: diagram.name,
      type: diagram.type,
      data: diagram.data,
      colorConfig: diagram.colorConfig,
      displayMode: diagram.displayMode,
    }],
    ...(opts.pcfAttribution ? { pcfAttribution: opts.pcfAttribution } : {}),
  };
}

/** Pretty-printed, as every JSON export has always been: it is a file people open. */
export function serialiseEnvelope(envelope: SingleDiagramEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

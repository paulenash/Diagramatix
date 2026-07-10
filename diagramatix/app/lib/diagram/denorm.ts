/**
 * Denormalise the browse/governance fields the Process Portal needs out of a
 * diagram's `data` JSON onto flat `Diagram` columns — so the Portal's category
 * facet + search + procedure-doc link are DB-native and don't require loading
 * every diagram's `data`. Called on every data-changing save (and by the
 * one-off backfill) so the columns stay in step with `DiagramData.pcf` /
 * `DiagramData.procedureDoc`.
 */
import type { DiagramData } from "./types";
import { extractDiagramEntities, type EntityRef } from "./extractEntities";

export interface DiagramDenorm {
  pcfId: number | null;
  pcfHierarchyId: string | null;
  pcfName: string | null;
  procedureDocUrl: string | null;
  procedureDocName: string | null;
  /** Raw org entities (pools/lanes/systems) referenced by the diagram — the
   *  Portal canonicalises these against the Org Entity Lists at read time. */
  entityRefs: EntityRef[];
}

export function deriveDiagramDenorm(data: unknown): DiagramDenorm {
  const d = (data ?? {}) as Partial<DiagramData>;
  const pcf = d.pcf;
  const proc = d.procedureDoc;
  const url = proc?.url?.trim() || null;
  return {
    pcfId: typeof pcf?.pcfId === "number" ? pcf.pcfId : null,
    pcfHierarchyId: pcf?.hierarchyId?.trim() || null,
    pcfName: pcf?.name?.trim() || null,
    procedureDocUrl: url,
    // Fall back to the URL as the display name so a link without a label still
    // shows something clickable in the Portal.
    procedureDocName: url ? (proc?.name?.trim() || url) : null,
    entityRefs: extractDiagramEntities(data),
  };
}

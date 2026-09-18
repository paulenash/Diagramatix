/**
 * Writing a diagram's `data` column from the mining pipeline.
 *
 * The same Prisma 7 constraint as `runStore.ts`: a JSON column cannot be written
 * through the model input, so it is raw SQL. The mining code did this in five
 * places, each spelling the statement out, and the next phase to re-discover a
 * diagram in place would have made six.
 *
 * Deliberately tiny and deliberately mining-only — the editor has its own,
 * much larger, save path with autosave, versioning and conflict handling, and
 * nothing here should look like an invitation to bypass it.
 */

import { setDiagramData } from "@/app/lib/diagram/updateDiagramData";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * Overwrite a discovered diagram's contents in place.
 *
 * The statement itself now comes from `updateDiagramData.ts`, which is the one
 * place that knows what a write of `Diagram.data` has to set (DATA-40). This
 * module keeps its own name because the mining pipeline calls it from six
 * places, and because it stays deliberately unconditional: mining regenerates a
 * discovered diagram wholesale, so there is nothing of the caller's to preserve
 * and no version for it to hold. A caller that has read the blob and is amending
 * it wants `updateDiagramData` instead.
 */
export async function writeDiagramData(diagramId: string, data: DiagramData): Promise<void> {
  await setDiagramData(diagramId, data);
}

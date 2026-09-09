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

import { pgPool } from "@/app/lib/db";
import type { DiagramData } from "@/app/lib/diagram/types";

/** Overwrite a discovered diagram's contents in place. */
export async function writeDiagramData(diagramId: string, data: DiagramData): Promise<void> {
  await pgPool.query(
    'UPDATE "Diagram" SET data = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
    [JSON.stringify(data), diagramId],
  );
}

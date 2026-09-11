/**
 * Backfill Prompt.useCount / lastUsedAt / modelUsed from the diagrams that were
 * generated before the columns existed.
 *
 *   npx tsx scripts/backfill-prompt-usage.ts                              # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/backfill-prompt-usage.ts    # prod
 *
 * Going forward the count is recorded at generation, which is cheap and exact.
 * This is the one-off that gives those counts a HISTORY — without it every
 * prompt reads as "never used" on the day the feature ships, which is the worst
 * possible answer: it is confidently wrong, and it is wrong in the direction
 * that invites someone to delete work they still rely on.
 *
 * A diagram records its generation in `data.aiGeneration` (promptId, model,
 * generatedAt). That is JSON, so the scan reads it with raw SQL rather than
 * through Prisma's model types.
 *
 * Idempotent: it SETS the counts from the diagrams rather than incrementing, so
 * running it twice gives the same answer.
 */
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const pool = new Pool({ connectionString: url, max: 1 });
  const dryRun = process.argv.includes("--dry-run");

  try {
    // Every diagram that names a prompt, with the model and time it was made.
    const { rows } = await pool.query<{
      promptId: string; model: string | null; generatedAt: string | null;
    }>(`
      SELECT data->'aiGeneration'->>'promptId'    AS "promptId",
             data->'aiGeneration'->>'model'       AS "model",
             data->'aiGeneration'->>'generatedAt' AS "generatedAt"
        FROM "Diagram"
       WHERE data->'aiGeneration'->>'promptId' IS NOT NULL
    `);

    // Fold to one row per prompt: how many diagrams, the most recent, its model.
    const byPrompt = new Map<string, { count: number; last: Date | null; model: string | null }>();
    for (const r of rows) {
      const at = r.generatedAt ? new Date(r.generatedAt) : null;
      const cur = byPrompt.get(r.promptId) ?? { count: 0, last: null, model: null };
      cur.count += 1;
      if (at && !isNaN(at.getTime()) && (!cur.last || at > cur.last)) {
        cur.last = at;
        cur.model = r.model ?? cur.model;
      }
      byPrompt.set(r.promptId, cur);
    }

    console.log(`${rows.length} generated diagram(s) reference ${byPrompt.size} prompt(s).`);
    if (dryRun) {
      for (const [id, v] of [...byPrompt].slice(0, 20)) {
        console.log(`  ${id}  used ${v.count}×  last ${v.last?.toISOString() ?? "unknown"}  ${v.model ?? ""}`);
      }
      if (byPrompt.size > 20) console.log(`  …and ${byPrompt.size - 20} more`);
      console.log("Dry run — nothing written.");
      return;
    }

    let updated = 0, missing = 0;
    for (const [id, v] of byPrompt) {
      // SET rather than increment, so a second run is a no-op rather than a
      // doubling. `updatedAt` is deliberately untouched: using a prompt is not
      // editing it, and conflating the two makes "last modified" useless.
      const { rowCount } = await pool.query(
        `UPDATE "Prompt"
            SET "useCount"   = $1,
                "lastUsedAt" = COALESCE($2::timestamptz, "lastUsedAt"),
                "modelUsed"  = COALESCE($3, "modelUsed")
          WHERE id = $4`,
        [v.count, v.last?.toISOString() ?? null, v.model, id],
      );
      if (rowCount === 1) updated++; else missing++;
    }

    console.log(`Updated ${updated} prompt(s).`);
    // A diagram can outlive the prompt it was generated from — that is not an
    // error, but it should be visible rather than inferred from a short count.
    if (missing) console.log(`${missing} referenced prompt(s) no longer exist (the diagram outlived them).`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

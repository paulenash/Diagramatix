/**
 * One-off cleanup: collapse duplicate SYSTEM-DEFAULT DiagramRules rows.
 *
 * Prod ended up with >1 row per category at (isDefault=true, userId NULL,
 * orgId NULL) — the @@unique([category,userId,orgId]) constraint was not
 * enforced. That makes findFirst({isDefault:true}) non-deterministic. This keeps
 * the canonical `default-<category>` row and deletes the other duplicates —
 * but ONLY when a duplicate is BYTE-IDENTICAL to the canonical row, so nothing
 * is ever lost. Non-identical duplicates are reported and left for manual merge.
 *
 *   DATABASE_URL="<target>" node scripts/collapse-duplicate-default-rules.cjs          # dry-run
 *   DATABASE_URL="<target>" node scripts/collapse-duplicate-default-rules.cjs --apply  # delete
 */
const pg = require("pg");
const TGT = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
const APPLY = process.argv.includes("--apply");

(async () => {
  console.log(`TARGET: ${TGT.replace(/\/\/[^@]*@/, "//***@")}   ${APPLY ? "[APPLY]" : "[DRY-RUN]"}\n`);
  const pool = new pg.Pool({ connectionString: TGT, max: 1 });
  const { rows } = await pool.query(
    `SELECT id, category, rules FROM "DiagramRules" WHERE "isDefault"=true AND "userId" IS NULL AND "orgId" IS NULL ORDER BY category`,
  );
  const byCat = new Map();
  for (const r of rows) { if (!byCat.has(r.category)) byCat.set(r.category, []); byCat.get(r.category).push(r); }

  let deleted = 0, skipped = 0;
  for (const [cat, rs] of byCat) {
    if (rs.length < 2) continue;
    const canonicalId = `default-${cat}`;
    const canonical = rs.find((r) => r.id === canonicalId);
    if (!canonical) { console.log(`SKIP  ${cat}: no canonical ${canonicalId} row present — leaving as-is`); skipped++; continue; }
    for (const dup of rs.filter((r) => r.id !== canonicalId)) {
      if (dup.rules !== canonical.rules) {
        console.log(`SKIP  ${cat}: duplicate ${dup.id} is NOT identical to ${canonicalId} — manual review`);
        skipped++;
        continue;
      }
      console.log(`${APPLY ? "DELETE" : "would delete"}  ${cat}: ${dup.id}  (identical to ${canonicalId})`);
      if (APPLY) { await pool.query(`DELETE FROM "DiagramRules" WHERE id=$1`, [dup.id]); deleted++; }
    }
  }
  console.log(APPLY ? `\nDeleted ${deleted} duplicate row(s), skipped ${skipped}.` : `\nDRY-RUN — nothing deleted. Re-run with --apply.`);
  await pool.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });

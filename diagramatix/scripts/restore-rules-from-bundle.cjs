/**
 * Interim recovery: restore admin AI Rules (DiagramRules) from a `.diag-rules`
 * export bundle, LOSSLESSLY. For each category it only overwrites the live
 * default row when every rule-id currently in the DB is ALSO present in the
 * bundle (i.e. the bundle is a superset) — so a restore can only ADD rules
 * back, never drop one. Categories where that can't be guaranteed are SKIPPED
 * and reported, to be recovered from the Azure point-in-time backup instead.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   # local (default DB):
 *   node scripts/restore-rules-from-bundle.cjs "C:/Users/paul/Downloads/2026-06-24T19-50-12-631Z.diag-rules"
 *   # prod:
 *   DATABASE_URL="<prod url>" node scripts/restore-rules-from-bundle.cjs "<bundle path>"
 *
 * The new "assist" category is never touched (it post-dates every bundle).
 * Nothing is deleted; only the `rules` text of matched default rows is updated.
 */
const fs = require("fs");
const pg = require("pg");

const BUNDLE = process.argv[2] || process.env.BUNDLE;
if (!BUNDLE) {
  console.error("Usage: node scripts/restore-rules-from-bundle.cjs <bundle.diag-rules>");
  process.exit(1);
}
const SKIP_CATEGORIES = new Set(["assist"]); // new; not in any bundle

const idsOf = (t) => new Set((String(t).match(/^[A-Z]\d+(?:\.\d+)*:/gm) || []).map((s) => s.replace(/:$/, "")));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix",
  max: 1,
});

(async () => {
  const bundle = JSON.parse(fs.readFileSync(BUNDLE, "utf8"));
  if (!Array.isArray(bundle.rules)) throw new Error("not a .diag-rules bundle (no rules[])");
  console.log(`Bundle: ${BUNDLE}`);
  console.log(`  exportedAt=${bundle.exportedAt} by=${bundle.exportedBy} categories=${bundle.rules.length}\n`);

  const { rows: current } = await pool.query(`SELECT category, rules FROM "DiagramRules" WHERE "isDefault"=true`);
  const curByCat = new Map(current.map((r) => [r.category, r.rules]));

  let restored = 0, skipped = 0;
  for (const b of bundle.rules) {
    if (b.userId || b.orgId) continue;                 // only system default rows
    if (SKIP_CATEGORIES.has(b.category)) { console.log(`SKIP  ${b.category} (protected / newer than bundle)`); continue; }
    const curText = curByCat.get(b.category);
    const curIds = idsOf(curText ?? "");
    const bunIds = idsOf(b.rules);
    const missing = [...curIds].filter((id) => !bunIds.has(id));   // in DB but NOT in bundle → would be lost
    if (curText !== undefined && missing.length > 0) {
      console.log(`SKIP  ${b.category}: bundle is NOT a superset (${missing.length} live rules absent: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}) → recover via PITR`);
      skipped++;
      continue;
    }
    const added = [...bunIds].filter((id) => !curIds.has(id));
    await pool.query(
      `INSERT INTO "DiagramRules" (id, category, rules, "isDefault", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,true,NOW(),NOW())
       ON CONFLICT (id) DO UPDATE SET rules=EXCLUDED.rules, "updatedAt"=NOW()`,
      [`default-${b.category}`, b.category, b.rules],
    );
    console.log(`OK    ${b.category}: ${curIds.size} → ${bunIds.size} rules (+${added.length}${added.length ? ": " + added.join(", ") : ""})`);
    restored++;
  }
  console.log(`\nRestored ${restored} categor${restored === 1 ? "y" : "ies"}, skipped ${skipped}.`);
  await pool.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });

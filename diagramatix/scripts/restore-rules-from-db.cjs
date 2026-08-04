/**
 * Full recovery: reapply admin AI Rules (DiagramRules) from a RESTORED database
 * (e.g. an Azure point-in-time-restore server holding the pre-accident state)
 * into a target database, LOSSLESSLY.
 *
 *   SOURCE_DATABASE_URL — the restored / PITR server to read the good rules FROM
 *   DATABASE_URL        — the target to write INTO (current prod, or local)
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   # reapply into PROD:
 *   SOURCE_DATABASE_URL="postgres://…restored-server…?sslmode=require" \
 *   DATABASE_URL="postgres://…current-prod…?sslmode=require" \
 *     node scripts/restore-rules-from-db.cjs
 *   # then reapply into LOCAL (same SOURCE, default local target):
 *   SOURCE_DATABASE_URL="postgres://…restored-server…?sslmode=require" \
 *     node scripts/restore-rules-from-db.cjs
 *
 * Safety, per category:
 *   • The restored version overwrites the target ONLY when it is a SUPERSET of
 *     the target's live rule-ids — so recovery can only ADD rules back, never
 *     drop one. (The restore point is after all legitimate July edits, so the
 *     restored set is the authoritative full set.)
 *   • If the TARGET holds a rule-id the restored version lacks (unexpected — a
 *     rule newer than the restore point), that category is SKIPPED and reported
 *     LOUDLY for manual merge, rather than silently losing it.
 *   • Categories absent from the source (e.g. the newer "assist" category) are
 *     left untouched. Pass --force to overwrite even non-superset categories
 *     (last resort — read the warning first).
 */
const pg = require("pg");

const SRC = process.env.SOURCE_DATABASE_URL;
if (!SRC) { console.error("SOURCE_DATABASE_URL (the restored/PITR server) is required."); process.exit(1); }
const TGT = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
const FORCE = process.argv.includes("--force");

const idsOf = (t) => new Set((String(t).match(/^[A-Z]\d+(?:\.\d+)*:/gm) || []).map((s) => s.replace(/:$/, "")));

const src = new pg.Pool({ connectionString: SRC, max: 1 });
const tgt = new pg.Pool({ connectionString: TGT, max: 1 });

(async () => {
  const maskedTgt = TGT.replace(/\/\/[^@]*@/, "//***@");
  const maskedSrc = SRC.replace(/\/\/[^@]*@/, "//***@");
  console.log(`SOURCE (restored): ${maskedSrc}`);
  console.log(`TARGET           : ${maskedTgt}${FORCE ? "   [FORCE]" : ""}\n`);

  const { rows: sourceRows } = await src.query(
    `SELECT category, rules FROM "DiagramRules" WHERE "isDefault"=true AND "userId" IS NULL AND "orgId" IS NULL ORDER BY category`,
  );
  const { rows: targetRows } = await tgt.query(
    `SELECT category, rules FROM "DiagramRules" WHERE "isDefault"=true AND "userId" IS NULL AND "orgId" IS NULL`,
  );
  const tgtByCat = new Map(targetRows.map((r) => [r.category, r.rules]));

  let applied = 0, skipped = 0;
  for (const s of sourceRows) {
    const srcIds = idsOf(s.rules);
    const curText = tgtByCat.get(s.category);
    const curIds = idsOf(curText ?? "");
    const lostIfApplied = [...curIds].filter((id) => !srcIds.has(id)); // in TARGET, missing from SOURCE
    if (!FORCE && curText !== undefined && lostIfApplied.length > 0) {
      console.log(`SKIP  ${s.category}: restored set is NOT a superset — target has ${lostIfApplied.length} rule(s) the restore lacks: ${lostIfApplied.join(", ")}`);
      console.log(`        (rerun with --force to take the restored version anyway, or merge by hand)`);
      skipped++;
      continue;
    }
    const gained = [...srcIds].filter((id) => !curIds.has(id));
    await tgt.query(
      `INSERT INTO "DiagramRules" (id, category, rules, "isDefault", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,true,NOW(),NOW())
       ON CONFLICT (id) DO UPDATE SET rules=EXCLUDED.rules, "updatedAt"=NOW()`,
      [`default-${s.category}`, s.category, s.rules],
    );
    console.log(`OK    ${s.category}: ${curIds.size} → ${srcIds.size} rules (+${gained.length}${gained.length ? ": " + gained.join(", ") : ""})`);
    applied++;
  }
  console.log(`\nApplied ${applied} categor${applied === 1 ? "y" : "ies"}, skipped ${skipped}.`);
  console.log(`(Categories absent from the source — e.g. "assist" — were left untouched.)`);
  await src.end(); await tgt.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });

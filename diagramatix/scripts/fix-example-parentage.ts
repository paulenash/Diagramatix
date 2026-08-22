/**
 * Scan every EXAMPLE catalogue package (Simulation, Process Mining, Risk &
 * Control) for container-ownership problems — the B47 "parentage" rule — and
 * emit the SQL that repairs them.
 *
 * Why examples matter: they are adopted verbatim into a learner's project, so a
 * wrong owner is inherited by every copy. The damage is invisible on the canvas
 * but real in output: the BPMN export puts the element in the wrong swimlane and
 * the simulator bills its work to the wrong team.
 *
 * READ-ONLY by default. It never writes to the database it is pointed at; it
 * prints a report and writes a .sql file for review.
 *
 * The generated SQL is SURGICAL and GUARDED: one jsonb_set per fix, addressing
 * the element by array path, with a WHERE clause asserting the element id AND
 * its current parent at that exact path. If prod's array order differs at all,
 * the statement matches nothing and does nothing — it cannot corrupt a package.
 *
 * Run (report + SQL for the CURRENT database):
 *   cd diagramatix
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   npx tsx scripts/fix-example-parentage.ts
 *
 * Point it at prod to generate SQL matching PROD's exact packages (still
 * read-only — nothing is written):
 *   DATABASE_URL="<PROD_CONNECTION_STRING>" npx tsx scripts/fix-example-parentage.ts
 *
 * Then review the .sql it wrote and run it against prod yourself.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../app/lib/db";
import { parentageRepairs, type DiagramLike } from "../app/lib/diagram/checks/diagramChecks";
import type { DiagramData } from "../app/lib/diagram/types";

interface Row { id: string; slug: string; title: string; package: unknown }
const TABLES = [
  { table: "SimulationExample", label: "Simulation" },
  { table: "MiningExample", label: "Process Mining" },
  { table: "RiskControlExample", label: "Risk & Controls" },
] as const;

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** A JSON scalar for jsonb_set's value argument. */
const sqlJson = (v: string | undefined) => (v === undefined ? `'null'::jsonb` : `${sqlStr(JSON.stringify(v))}::jsonb`);

interface Fix { table: string; slug: string; diagram: string; elId: string; from?: string; to?: string; note: string }

/**
 * The portable repair: a single DO block that LOCATES each element by id rather
 * than by array position, so it does not depend on the target's arrays being
 * ordered like the database this was generated from. It can be pasted straight
 * into prod without running this script there. Each fix is guarded on the
 * element's CURRENT parent, so it is idempotent (a second run finds nothing to
 * do) and cannot touch an element that has since been corrected by hand.
 */
function buildPortableSql(fixes: Fix[]): string {
  const q = (s: string | undefined) => (s === undefined ? "NULL" : `'${s.replace(/'/g, "''")}'`);
  const rows = fixes.map((f, i) =>
    `      (${q(f.table)}, ${q(f.slug)}, ${q(f.diagram)}, ${q(f.elId)}, ${q(f.from)}, ${q(f.to)})${i === fixes.length - 1 ? "" : ","}` +
    `  -- ${f.note}`,
  );
  return `-- Repair container ownership (B47 parentage) in the example catalogues.
-- PORTABLE: elements are found by id, not by array position, so this is safe to
-- run on any environment regardless of how its packages are ordered.
-- Idempotent: each fix only applies while the element still has the OLD parent.
-- Wrapped in a transaction; RAISE NOTICE reports what it did.
BEGIN;

DO $$
DECLARE
  f       RECORD;
  pkg     jsonb;
  di      int;
  ei      int;
  changed boolean;
  applied int := 0;
  skipped int := 0;
BEGIN
  FOR f IN
    SELECT * FROM (VALUES
${rows.join("\n")}
    ) AS t(tbl, slug, diagram_name, el_id, old_parent, new_parent)
  LOOP
    EXECUTE format('SELECT package FROM %I WHERE slug = $1', f.tbl) INTO pkg USING f.slug;
    IF pkg IS NULL THEN
      RAISE NOTICE 'SKIP  %.% — row not found', f.tbl, f.slug;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    changed := false;
    FOR di IN 0 .. COALESCE(jsonb_array_length(pkg -> 'diagrams'), 0) - 1 LOOP
      -- Element ids are unique only WITHIN a diagram, so match the diagram by
      -- name too: two diagrams in one package can legitimately share an id.
      CONTINUE WHEN pkg #>> ARRAY['diagrams', di::text, 'name'] IS DISTINCT FROM f.diagram_name;
      FOR ei IN 0 .. COALESCE(jsonb_array_length(pkg -> 'diagrams' -> di -> 'data' -> 'elements'), 0) - 1 LOOP
        IF pkg #>> ARRAY['diagrams', di::text, 'data', 'elements', ei::text, 'id'] = f.el_id
           AND pkg #>> ARRAY['diagrams', di::text, 'data', 'elements', ei::text, 'parentId']
               IS NOT DISTINCT FROM f.old_parent
        THEN
          IF f.new_parent IS NULL THEN
            pkg := pkg #- ARRAY['diagrams', di::text, 'data', 'elements', ei::text, 'parentId'];
          ELSE
            pkg := jsonb_set(pkg,
                     ARRAY['diagrams', di::text, 'data', 'elements', ei::text, 'parentId'],
                     to_jsonb(f.new_parent), true);
          END IF;
          changed := true;
        END IF;
      END LOOP;
    END LOOP;

    IF changed THEN
      EXECUTE format('UPDATE %I SET package = $1, "updatedAt" = NOW() WHERE slug = $2', f.tbl)
        USING pkg, f.slug;
      applied := applied + 1;
      RAISE NOTICE 'FIXED %.% / % — % : % -> %', f.tbl, f.slug, f.diagram_name, f.el_id,
        COALESCE(f.old_parent, '(none)'), COALESCE(f.new_parent, '(none)');
    ELSE
      skipped := skipped + 1;
      RAISE NOTICE 'NO-OP %.% / % — % (already correct, or parent differs)', f.tbl, f.slug, f.diagram_name, f.el_id;
    END IF;
  END LOOP;

  RAISE NOTICE '--- applied % fix(es), % skipped ---', applied, skipped;
END $$;

COMMIT;
`;
}

async function main() {
  const statements: string[] = [];
  const fixes: Fix[] = [];
  let scannedDiagrams = 0, totalFixes = 0, affectedExamples = 0;

  for (const { table, label } of TABLES) {
    let rows: Row[] = [];
    try {
      rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT id, slug, title, package FROM "${table}" ORDER BY slug`);
    } catch (err) {
      console.log(`\n### ${label} (${table}) — SKIPPED: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    console.log(`\n### ${label} (${table}) — ${rows.length} example(s)`);

    for (const row of rows) {
      const pkg = row.package as { diagrams?: { name?: string; data?: DiagramData }[] } | null;
      const diagrams = Array.isArray(pkg?.diagrams) ? pkg!.diagrams! : [];
      const perExample: string[] = [];

      diagrams.forEach((d, di) => {
        const data = d?.data;
        if (!data || !Array.isArray(data.elements)) return;
        scannedDiagrams++;
        const repairs = parentageRepairs(data as unknown as DiagramLike);
        if (repairs.length === 0) return;

        // Element index within THIS diagram's elements array — the jsonb path.
        const indexOf = new Map(data.elements.map((e, i) => [e.id, i]));
        for (const r of repairs) {
          const ei = indexOf.get(r.id);
          if (ei === undefined) continue;
          const el = data.elements[ei];
          const path = `{diagrams,${di},data,elements,${ei}`;
          // Guard on BOTH the element id and its current parent at this exact
          // path, so a package whose arrays are ordered differently is skipped
          // rather than mis-patched.
          const parentGuard = r.from === undefined
            ? `(package #> '${path},parentId}') IS NULL OR package #>> '${path},parentId}' IS NULL`
            : `package #>> '${path},parentId}' = ${sqlStr(r.from)}`;
          perExample.push(
            `UPDATE "${table}" SET package = jsonb_set(package, '${path},parentId}', ${sqlJson(r.to)}, true), "updatedAt" = NOW()\n` +
            ` WHERE slug = ${sqlStr(row.slug)}\n` +
            `   AND package #>> '${path},id}' = ${sqlStr(r.id)}\n` +
            `   AND (${parentGuard});`,
          );
          const name = (el.label || r.id).replace(/\s+/g, " ").slice(0, 40);
          console.log(`  · ${row.slug} / "${d.name ?? `diagram ${di}`}" — ${el.type} "${name}": ${r.from ?? "(none)"} → ${r.to ?? "(none)"}`);
          fixes.push({ table, slug: row.slug, diagram: d.name ?? "", elId: r.id, from: r.from, to: r.to, note: `${el.type} "${name}"` });
          totalFixes++;
        }
      });

      if (perExample.length) {
        affectedExamples++;
        statements.push(`-- ${label}: ${row.title} (${row.slug}) — ${perExample.length} fix(es)`, ...perExample, "");
      }
    }
  }

  console.log(`\n=== scanned ${scannedDiagrams} diagram(s); ${totalFixes} fix(es) across ${affectedExamples} example(s) ===`);

  if (!statements.length) {
    console.log("Nothing to repair — every example's ownership is already correct.");
    return;
  }
  const out = [
    "-- Repair container ownership (B47 parentage) in the example catalogues.",
    "-- Generated by scripts/fix-example-parentage.ts — review before running.",
    "-- Every statement is guarded on the element id AND its current parent at",
    "-- that exact JSON path, so it no-ops if the package differs. Safe to re-run.",
    "BEGIN;",
    "",
    ...statements,
    "COMMIT;",
    "",
  ].join("\n");
  const file = "scripts/sql/fix-example-parentage.sql";
  writeFileSync(file, out, "utf8");
  const portable = "scripts/sql/fix-example-parentage-portable.sql";
  writeFileSync(portable, buildPortableSql(fixes), "utf8");
  console.log(`\nSQL written to:`);
  console.log(`  ${portable}   <- run this one (finds elements by id; order-independent)`);
  console.log(`  ${file}   (path-addressed equivalent, generated from THIS database)`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

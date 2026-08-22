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

async function main() {
  const statements: string[] = [];
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
  console.log(`\nSQL written to ${file}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

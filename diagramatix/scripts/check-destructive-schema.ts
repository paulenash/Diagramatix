/**
 * OPS-01 — deploy gate. Run between `prisma migrate diff` and
 * `prisma db push --accept-data-loss` in .github/workflows/azure-deploy.yml.
 *
 *   npx prisma migrate diff --from-config-datasource \
 *     --to-schema prisma/schema.prisma --script > schema-diff.sql
 *   tsx scripts/check-destructive-schema.ts schema-diff.sql
 *
 * Exit 0  — nothing destructive, or the override is set.
 * Exit 1  — destructive statements found; the deploy stops before the push.
 *
 * The override is `ALLOW_DESTRUCTIVE_SCHEMA_CHANGE=true`, which the workflow
 * only ever sets from the `workflow_dispatch` input. That makes an intentional
 * destructive release a deliberate manual act with a name attached to it,
 * rather than something a merge can do by accident.
 *
 * Reads the SQL from the file named in argv[2], or from stdin when there is
 * no argument.
 */
import { readFileSync } from "node:fs";
import {
  findDestructiveStatements,
  describeDestructiveStatements,
} from "../app/lib/deploy/destructiveSchema";

const OVERRIDE = "ALLOW_DESTRUCTIVE_SCHEMA_CHANGE";

function readInput(): string {
  const path = process.argv[2];
  if (path) return readFileSync(path, "utf8");
  return readFileSync(0, "utf8");
}

function main(): number {
  const sql = readInput();
  const trimmed = sql.trim();

  if (trimmed === "" || /^-- This is an empty migration\.?$/im.test(trimmed)) {
    console.log("Schema is already in sync — nothing to apply.");
    return 0;
  }

  console.log("Pending schema change:");
  console.log("----------------------------------------------------------------");
  console.log(trimmed);
  console.log("----------------------------------------------------------------");

  const found = findDestructiveStatements(sql);
  if (found.length === 0) {
    console.log("Additive only — no statement destroys existing data. Proceeding.");
    return 0;
  }

  console.error(describeDestructiveStatements(found));

  if (process.env[OVERRIDE] === "true") {
    console.error("");
    console.error(`${OVERRIDE}=true — override accepted, applying anyway.`);
    return 0;
  }

  return 1;
}

process.exit(main());

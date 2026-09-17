/**
 * OPS-01 — the gate that stands between `prisma db push --accept-data-loss`
 * and the production database.
 *
 * The deploy applies the schema unattended. `--accept-data-loss` is not
 * optional here (Prisma treats every new unique constraint as a possible data
 * loss), so the flag that is supposed to mean "I have thought about this" is
 * permanently on. A column rename in `prisma/schema.prisma` reads as a drop
 * plus an add, and would silently delete the old column's data on prod the
 * moment the commit landed on main. Nothing in the pipeline looked at the SQL.
 *
 * This module reads the SQL that `prisma migrate diff` says it is about to run
 * and reports the statements that destroy data. It is deliberately pure and
 * string-only: no database, no Prisma client, so it is cheap to test and the
 * rule that protects production is provable from a unit test.
 *
 * What counts as destructive is "data that exists now will not exist after".
 * Dropping a constraint, a default, a NOT NULL or an index removes a rule, not
 * a row, so those are allowed through — otherwise the gate would cry wolf on
 * ordinary additive releases and get switched off.
 */

export type DestructiveKind =
  | "drop-table"
  | "drop-column"
  | "drop-schema"
  | "drop-database"
  | "truncate"
  | "drop-type"
  | "change-column-type";

export interface DestructiveStatement {
  /** Which class of destruction this is. */
  kind: DestructiveKind;
  /** The statement itself, whitespace-collapsed onto one line. */
  statement: string;
  /** Plain English, for the log the operator reads at 2am. */
  what: string;
}

/** Ordered so the most severe kind wins when one statement matches several. */
const RULES: ReadonlyArray<{ kind: DestructiveKind; re: RegExp; what: string }> = [
  {
    kind: "drop-database",
    re: /\bDROP\s+DATABASE\b/i,
    what: "drops an entire database",
  },
  {
    kind: "drop-schema",
    re: /\bDROP\s+SCHEMA\b/i,
    what: "drops an entire schema and everything in it",
  },
  {
    kind: "drop-table",
    re: /\bDROP\s+TABLE\b/i,
    what: "drops a table and every row in it",
  },
  {
    kind: "truncate",
    re: /\bTRUNCATE\b/i,
    what: "empties a table",
  },
  {
    kind: "drop-column",
    re: /\bDROP\s+COLUMN\b/i,
    what: "drops a column and every value stored in it",
  },
  {
    kind: "drop-type",
    re: /\bDROP\s+TYPE\b/i,
    what: "drops an enum type, which fails or cascades if any row still uses it",
  },
  {
    kind: "change-column-type",
    re: /\bALTER\s+COLUMN\b[\s\S]*?\b(?:SET\s+DATA\s+)?TYPE\b/i,
    what: "changes a column's type, which can truncate or reject existing values",
  },
];

/**
 * Remove `--` line comments and `/* *\/` block comments.
 *
 * Prisma puts its own warnings in comments ("You are about to drop the
 * column ..."), and a comment that merely talks about dropping a table must
 * not trip the gate — only an executable statement counts.
 */
export function stripSqlComments(sql: string): string {
  // Block comments first: a `--` inside one is not a line comment.
  const withoutBlocks = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  return withoutBlocks.replace(/--[^\n]*/g, " ");
}

/**
 * Blank out single-quoted string literals, keeping the quotes so the statement
 * still parses by eye. A literal containing the words of a destructive command
 * is data, not an instruction.
 */
export function stripSqlStrings(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

/** Split on semicolons and drop the empties. Prisma emits one statement per line. */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

/**
 * The whole point of the module: what in this SQL destroys data?
 *
 * Returns one entry per (statement, kind) so a single `ALTER TABLE` that both
 * drops a column and retypes another is reported twice, once for each reason.
 */
export function findDestructiveStatements(sql: string): DestructiveStatement[] {
  const cleaned = stripSqlStrings(stripSqlComments(sql));
  const found: DestructiveStatement[] = [];

  for (const statement of splitSqlStatements(cleaned)) {
    for (const rule of RULES) {
      if (rule.re.test(statement)) {
        found.push({ kind: rule.kind, statement, what: rule.what });
      }
    }
  }

  return found;
}

/** True when the SQL would run without destroying anything. */
export function isSchemaChangeSafe(sql: string): boolean {
  return findDestructiveStatements(sql).length === 0;
}

/**
 * The message the deploy log shows. Written for someone who has to decide, in
 * a hurry, whether to re-dispatch with the override.
 */
export function describeDestructiveStatements(found: DestructiveStatement[]): string {
  if (found.length === 0) return "No destructive statements in the pending schema change.";

  const lines = [
    `Refusing to apply the schema: ${found.length} destructive statement${found.length === 1 ? "" : "s"} found.`,
    "",
  ];
  for (const f of found) {
    lines.push(`  [${f.kind}] ${f.what}`);
    lines.push(`      ${f.statement};`);
  }
  lines.push("");
  lines.push("If this is intended — you have a backup, or the data is genuinely disposable —");
  lines.push("re-run this deploy from the Actions tab with 'allow_destructive_schema_change' set to true.");
  lines.push("If it is NOT intended, it is almost certainly a renamed field in prisma/schema.prisma:");
  lines.push("a rename reads as a drop plus an add, and the old column's data goes with it.");
  return lines.join("\n");
}

/**
 * The two seeds must plant the same list.
 *
 * There are two ways to seed the Skills catalog — `scripts/seed-skills.ts` and
 * `scripts/seed-skills.sql` — because prod is sometimes reached with tsx and
 * sometimes with a psql session. Two lists that drift apart would give an org a
 * different vocabulary depending on which route somebody happened to use, and
 * nothing would ever say so: both runs succeed, both report a count, and the
 * counts even match for a while.
 *
 * So neither file is the source of truth over the other; they are checked
 * against each other.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const TS = fs.readFileSync(path.join(ROOT, "scripts/seed-skills.ts"), "utf8");
const SQL = fs.readFileSync(path.join(ROOT, "scripts/seed-skills.sql"), "utf8");

/** Skill names from the TS seed's SEED array. */
function tsNames(): string[] {
  const block = TS.slice(TS.indexOf("const SEED"), TS.indexOf("async function main"));
  return [...block.matchAll(/\{\s*name:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Skill names from the SQL seed's VALUES rows. */
function sqlNames(): string[] {
  const start = SQL.indexOf("INSERT INTO _seed_skills");
  const block = SQL.slice(start, SQL.indexOf(";", start));
  return [...block.matchAll(/\(\s*\d+,\s*'([^']+)'/g)].map((m) => m[1]);
}

describe("the TS and SQL skill seeds agree", () => {
  it("T4252 — both seeds plant exactly the same skills, in the same order", () => {
    const a = tsNames();
    const b = sqlNames();

    // Guard the scan itself: a regex that matched nothing would make this test
    // pass by comparing two empty lists.
    expect(a.length, "no skills parsed out of seed-skills.ts").toBeGreaterThan(10);
    expect(b.length, "no skills parsed out of seed-skills.sql").toBeGreaterThan(10);

    expect(b).toEqual(a);
  });

  it("T4253 — the SQL supplies the two columns Prisma fills and Postgres will not", () => {
    // `id` (@default(cuid())) and `updatedAt` (@updatedAt) are applied by the
    // CLIENT; neither column has a database default. Omit either and every row
    // fails NOT NULL — loudly, but on prod, mid-seed.
    const insert = SQL.slice(SQL.indexOf('INSERT INTO "Skill"'));
    expect(insert).toMatch(/INSERT INTO "Skill" \([^)]*\bid\b/);
    expect(insert).toMatch(/INSERT INTO "Skill" \([^)]*"updatedAt"/);
  });

  it("T4254 — both seeds are insert-only and skip an org that already has a list", () => {
    // A seed that rewrites a live catalog replaces somebody's curated vocabulary
    // with ours, silently, on a deploy.
    expect(SQL).toContain("WHERE NOT EXISTS");
    expect(SQL).toMatch(/ON CONFLICT \("orgId", name\) DO NOTHING/);
    expect(SQL, "an UPDATE would overwrite a curated list").not.toMatch(/UPDATE\s+"Skill"/i);
    expect(SQL, "a DELETE would discard one").not.toMatch(/DELETE\s+FROM\s+"Skill"/i);

    expect(TS).toMatch(/if \(existing > 0\)/);
    expect(TS).toContain("skipDuplicates: true");
  });
});

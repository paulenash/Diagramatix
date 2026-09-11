/**
 * The seed SQL has to RUN.
 *
 * This test exists because the other one did not catch a broken file. T4252
 * checks that the two seeds name the same skills, and it does that by pulling
 * names out with a regex — which matched perfectly while the generated SQL was
 * missing every comma between its columns:
 *
 *     ( 0, 'Approval Authority'  'Authority'  'Mandated to…'),
 *
 * Invalid SQL, a green test, and a file somebody had been told they could run
 * against production. A parser that only looks for the shape it expects will
 * find that shape in something Postgres refuses outright.
 *
 * So this one executes the real file against the real database and rolls it
 * back. Nothing else proves the file works.
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pgPool } from "@/app/lib/db";

const SQL_PATH = path.resolve(__dirname, "..", "..", "scripts", "seed-skills.sql");
const SQL = fs.readFileSync(SQL_PATH, "utf8");
const PROBE_ORG = "test-org-seed-sql-probe";

afterAll(async () => {
  const c = await pgPool.connect();
  try {
    await c.query(`DELETE FROM "Skill" WHERE "orgId" = $1`, [PROBE_ORG]);
    await c.query(`DELETE FROM "Org" WHERE id = $1`, [PROBE_ORG]);
  } finally { c.release(); }
});

describe("scripts/seed-skills.sql actually runs", () => {
  it("T4259 — the file executes, seeds a fresh org, and keeps nothing on rollback", async () => {
    const c = await pgPool.connect();
    try {
      // A fresh org exercises the WHERE NOT EXISTS branch — the one that does
      // the inserting. Running only against orgs that already have skills would
      // pass without a single row being written.
      await c.query(`INSERT INTO "Org" (id, name) VALUES ($1, 'Seed SQL Probe') ON CONFLICT (id) DO NOTHING`, [PROBE_ORG]);

      // The file manages its own transaction; swap the COMMIT so the probe
      // leaves nothing behind whatever happens next.
      const rolledBack = SQL.replace(/^COMMIT;\s*$/m, "ROLLBACK;");
      expect(rolledBack, "the file must end in COMMIT for real use").not.toBe(SQL);

      const results = await c.query(rolledBack) as unknown as { rows: Record<string, unknown>[] }[];
      const tables = (Array.isArray(results) ? results : [results]).filter((r) => r.rows?.length);

      // The dry-run SELECT comes first, the post-insert counts last.
      const dryRun = tables[0].rows.find((r) => r.org === "Seed SQL Probe");
      expect(dryRun, "the dry-run SELECT did not report the probe org").toBeTruthy();
      expect(String(dryRun!.action)).toContain("would seed");

      const after = tables[tables.length - 1].rows.find((r) => r.org === "Seed SQL Probe");
      expect(Number(after!.skills), "the insert planted nothing").toBe(20);

      // Rolled back: the probe org must hold nothing.
      const kept = await c.query(`SELECT COUNT(*)::int AS n FROM "Skill" WHERE "orgId" = $1`, [PROBE_ORG]);
      expect(kept.rows[0].n).toBe(0);
    } finally { c.release(); }
  });

  it("T4260 — every seeded row carries a description", async () => {
    // Paul, 2026-09-12: "Why do some skill have descriptions and other not?"
    // Because they were written inconsistently. A description answers the only
    // question a skill is ever asked — who qualifies — and the screen renders it
    // inline, so a half-described list reads as missing data rather than as a
    // choice.
    const rows = [...SQL.matchAll(/^\s*\(\s*\d+,\s*('(?:[^']|'')*'),\s*('(?:[^']|'')*'),\s*(NULL|'(?:[^']|'')*')\)/gm)];
    expect(rows.length, "no VALUES rows parsed — has the file's shape changed?").toBe(20);
    const undescribed = rows.filter((m) => m[3] === "NULL").map((m) => m[1]);
    expect(undescribed, "every seeded skill needs a description").toEqual([]);
  });
});

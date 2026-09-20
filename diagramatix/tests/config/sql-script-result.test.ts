/**
 * T4589-T4590 — a script pasted into the Database tile must say what it did.
 *
 * Paul went looking for the Voice Assist SQL files on 2026-09-20, which turned
 * up two things. The first was a path confusion. The second was worse: the
 * tile could not have reported the seed properly if he had run it.
 *
 * `pgPool.query(sql)` with no params uses the simple query protocol, which
 * takes several statements in one string — and node-postgres then returns an
 * ARRAY of results, with `raw.rows` undefined. The route read `raw.rows ?? []`,
 * so a 14-statement seed that had fully run and COMMITTED displayed:
 *
 *     undefined completed — 0 row(s) affected
 *
 * Identical to a script that did nothing. That is the worst possible answer
 * from the one tool used to change production data, and it is exactly the kind
 * of thing that is never noticed until it matters.
 *
 * Measured against the real driver before any of this was written:
 *     "SELECT 1"           → isArray false, rows [{a:1}]
 *     "SELECT 1; SELECT 2" → isArray true,  rows undefined, length 2
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { flattenQueryResult } from "@/app/lib/admin/sqlResult";

const SQL_DIR = join(process.cwd(), "scripts", "sql");
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const r = (command: string, rows: unknown[] = [], rowCount = rows.length) =>
  ({ command, rows, rowCount, fields: rows.length ? [{ name: "n", dataTypeID: 23 }] : [] });

describe("T4589 — one statement, or fourteen, both report honestly", () => {
  it("passes a single result straight through", () => {
    const out = flattenQueryResult(r("SELECT", [{ n: 1 }]));
    expect(out.rows).toEqual([{ n: 1 }]);
    expect(out.command).toBe("SELECT");
    expect(out.statements, "one statement needs no breakdown").toBeUndefined();
  });

  it("shows the last statement that RETURNED ROWS, not simply the last one", () => {
    // The verification SELECT is not always the final statement — a script may
    // close with a COMMIT or a SET after it. Taking "the last statement" would
    // then show an empty COMMIT and hide the evidence, so the two rules have to
    // be told apart by a fixture where they disagree.
    const out = flattenQueryResult([
      r("BEGIN"), r("UPDATE", [], 33),
      r("SELECT", [{ n: 1, verdict: "present" }]),
      r("COMMIT"),
    ]);
    expect(out.rows).toEqual([{ n: 1, verdict: "present" }]);
    expect(out.command, "the COMMIT would have shown nothing").toBe("SELECT");
  });

  it("still names the final statement when nothing returned rows", () => {
    const out = flattenQueryResult([r("BEGIN"), r("UPDATE", [], 2), r("COMMIT")]);
    expect(out.command).toBe("COMMIT");
    expect(out.rows).toEqual([]);
  });

  it("lists every statement, so a write-only script is not silent", () => {
    const out = flattenQueryResult([r("BEGIN"), r("UPDATE", [], 33), r("COMMIT")]);
    expect(out.statements).toEqual([
      { command: "BEGIN", rowCount: 0 },
      { command: "UPDATE", rowCount: 33 },
      { command: "COMMIT", rowCount: 0 },
    ]);
    // The defect verbatim: this used to be `[]` / 0 / undefined for the WHOLE
    // script, which read as "nothing happened".
    expect(out.command, "the last statement still names itself").toBe("COMMIT");
  });

  it("survives what the driver actually sends for a non-SELECT", () => {
    // `rows` undefined and `rowCount` null are both real driver outputs.
    const out = flattenQueryResult([
      { command: "BEGIN", rowCount: null },
      { command: "UPDATE", rowCount: 2 },
    ]);
    expect(out.rows).toEqual([]);
    expect(out.statements).toEqual([
      { command: "BEGIN", rowCount: 0 },
      { command: "UPDATE", rowCount: 2 },
    ]);
  });

  it("is what the route returns — a pure helper nobody calls fixes nothing", () => {
    const route = read("app", "api", "admin", "database", "route.ts");
    expect(route).toContain("flattenQueryResult(result)");
    expect(route, "the old read is what produced the silent no-op")
      .not.toMatch(/rows:\s*result\.rows\s*\?\?\s*\[\]/);
  });

  it("is surfaced in the tile, not just in the payload", () => {
    const client = read("app", "(dashboard)", "dashboard", "admin", "database", "DatabaseClient.tsx");
    expect(client).toMatch(/queryResult\?\.statements/);
    expect(client, "and the single-statement message must not also fire")
      .toMatch(/!queryResult\.statements/);
  });
});

describe("T4590 — a seed proves itself in the same paste", () => {
  const seeds = readdirSync(SQL_DIR).filter((f) => f.startsWith("seed-") && f.endsWith(".sql"));

  it("finds the seeds, so an empty sweep cannot pass vacuously", () => {
    expect(seeds.length).toBeGreaterThan(0);
  });

  it("ends with a verification SELECT, placed AFTER the COMMIT", () => {
    // Before the COMMIT it would report what the transaction was ABOUT to do;
    // after it, what was actually committed. Only one of those is evidence.
    for (const f of seeds) {
      const sql = readFileSync(join(SQL_DIR, f), "utf8");
      const commit = sql.lastIndexOf("COMMIT;");
      if (commit === -1) continue;                 // a seed with no transaction
      const after = sql.slice(commit);
      expect(after, `${f}: nothing after COMMIT proves it ran`).toMatch(/\bSELECT\b/i);
    }
  });

  it("the Voice Assist seed's check covers every claim its header makes", () => {
    const sql = readFileSync(join(SQL_DIR, "seed-voice-assist-content.sql"), "utf8");
    const after = sql.slice(sql.lastIndexOf("COMMIT;"));
    for (const claim of [
      "User Guide chapter", "User Guide sections", "Tech Notes chapter", "Tech Notes sections",
      "Mislabelled sections", "Feature rows (draft)", "Feature rows (published)",
      "Old name still present", "voice-assist availability", "nl-assist availability",
    ]) {
      expect(after, `the trailing check must report "${claim}"`).toContain(claim);
    }
  });

  it("is wrapped in a transaction, so a failure leaves nothing half-applied", () => {
    const sql = readFileSync(join(SQL_DIR, "seed-voice-assist-content.sql"), "utf8");
    expect(sql.indexOf("BEGIN;")).toBeGreaterThan(-1);
    expect(sql.lastIndexOf("COMMIT;")).toBeGreaterThan(sql.indexOf("BEGIN;"));
  });
});

/**
 * Phase 0.6 — the one place a run's JSON columns are written.
 *
 * `runPatchSql` is the whole of the risk: eleven hand-written UPDATE statements
 * became one generator, so the generator has to be right about the three things
 * the hand-written versions could each get wrong — which columns are touched,
 * which placeholder each value binds to, and the difference between "leave this
 * column alone" and "write NULL into it".
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runPatchSql, type RunPatch } from "@/app/lib/mining/runStore";

/** The value bound to a column, found by reading the placeholder out of the SQL. */
function valueOf(sql: { text: string; values: unknown[] }, column: string): unknown {
  const m = new RegExp(`"${column}" = \\$(\\d+)`).exec(sql.text);
  if (!m) throw new Error(`${column} is not in: ${sql.text}`);
  return sql.values[Number(m[1]) - 1];
}

describe("Phase 0.6 — building the run UPDATE", () => {
  it("T3681 - only the columns in the patch are written", () => {
    const sql = runPatchSql("run-1", { stats: { cases: 3 } })!;
    expect(sql.text).toContain('"stats" = $1::jsonb');
    for (const other of ["mapping", "variants", "performance", "analytics", "governance", "conformance", "kpiConfig"]) {
      expect(sql.text).not.toContain(`"${other}"`);
    }
  });

  it("T3682 - an ABSENT column is left alone; an explicit null writes NULL", () => {
    // The distinction the hand-written statements kept losing. kpiConfig must
    // survive a live refresh (absent), and governance must be clearable when a
    // re-import finds no GRC columns (null).
    const absent = runPatchSql("run-1", { stats: {} })!;
    expect(absent.text).not.toContain('"kpiConfig"');

    const explicit = runPatchSql("run-1", { governance: null })!;
    expect(explicit.text).toContain('"governance" = $1::jsonb');
    expect(valueOf(explicit, "governance")).toBeNull();
  });

  it("T3683 - every value binds to its own placeholder, and the id binds last", () => {
    // An off-by-one here writes the variants into the stats column. Nothing in
    // the old form would have caught it.
    const patch: RunPatch = {
      mapping: { caseId: "c" }, stats: { cases: 1 }, variants: [{ v: 1 }],
      performance: { clockUnit: "hour" }, analytics: { a: 1 }, governance: { g: 1 },
    };
    const sql = runPatchSql("run-42", patch)!;
    expect(JSON.parse(valueOf(sql, "mapping") as string)).toEqual(patch.mapping);
    expect(JSON.parse(valueOf(sql, "stats") as string)).toEqual(patch.stats);
    expect(JSON.parse(valueOf(sql, "variants") as string)).toEqual(patch.variants);
    expect(JSON.parse(valueOf(sql, "performance") as string)).toEqual(patch.performance);
    expect(JSON.parse(valueOf(sql, "analytics") as string)).toEqual(patch.analytics);
    expect(JSON.parse(valueOf(sql, "governance") as string)).toEqual(patch.governance);
    expect(sql.values[sql.values.length - 1]).toBe("run-42");
    expect(sql.text).toContain(`WHERE id = $${sql.values.length}`);
  });

  it("T3684 - JSON columns are stringified and cast; the scalar id is neither", () => {
    const sql = runPatchSql("run-1", { conformance: { fitness: 0.9 }, referenceSmId: "diag-7" })!;
    expect(typeof valueOf(sql, "conformance")).toBe("string");
    expect(sql.text).toContain("::jsonb");
    // referenceSmId is a text column — stringifying it would store `"diag-7"`
    // WITH the quotes and quietly break every reference lookup.
    expect(valueOf(sql, "referenceSmId")).toBe("diag-7");
    expect(sql.text).toContain('"referenceSmId" = $');
    expect(sql.text).not.toMatch(/"referenceSmId" = \$\d+::jsonb/);
  });

  it("T3685 - conformance and its reference are written in ONE statement", () => {
    // Two statements can half-apply. A run whose result and reference disagree
    // is worse than either being stale.
    const sql = runPatchSql("run-1", { conformance: { fitness: 1 }, referenceSmId: "diag-7" })!;
    expect(sql.text.match(/UPDATE /g)).toHaveLength(1);
    expect(sql.text).toContain('"conformance"');
    expect(sql.text).toContain('"referenceSmId"');
  });

  it("T3686 - clearing a reference writes NULL, not the string \"null\"", () => {
    const sql = runPatchSql("run-1", { referenceSmId: null })!;
    expect(valueOf(sql, "referenceSmId")).toBeNull();
  });

  it("T3687 - camelCase columns are quoted, or Postgres folds them to lower case", () => {
    const sql = runPatchSql("run-1", { kpiConfig: { slaMs: 1 } })!;
    expect(sql.text).toContain('"kpiConfig"');
    expect(sql.text).not.toMatch(/[^"]kpiconfig/i);
  });

  it("T3688 - updatedAt always moves, on every patch", () => {
    expect(runPatchSql("run-1", { stats: {} })!.text).toContain('"updatedAt" = NOW()');
  });

  it("T3689 - an empty patch produces NO statement rather than a broken one", () => {
    // `UPDATE ... SET "updatedAt" = NOW()` on every run is not what a caller
    // with nothing to say meant, and `SET , "updatedAt"` would not parse.
    expect(runPatchSql("run-1", {})).toBeNull();
    expect(runPatchSql("run-1", { stats: undefined })).toBeNull();
  });

  it("T3690 - the run id is bound, never interpolated", () => {
    const sql = runPatchSql("'; DROP TABLE \"ProcessMiningRun\"; --", { stats: {} })!;
    expect(sql.text).not.toContain("DROP TABLE");
    expect(sql.values[sql.values.length - 1]).toContain("DROP TABLE");
  });
});

/** The statement no file but runStore.ts may contain. A plain string, not a
 *  regex: an escaping slip in the pattern makes a guard like this match nothing
 *  and pass forever, which is worse than not having it. */
const WRITE = `UPDATE "ProcessMiningRun"`;

/** Every .ts file under app/, excluding the generated Prisma client. */
function appFiles(dir = "app", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "generated" || entry === "node_modules") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) appFiles(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("Phase 0.6 — nothing writes a run's JSON behind the helper's back", () => {
  it("T3691 - the only UPDATE of ProcessMiningRun is the one runStore builds", () => {
    // The point of the helper is not tidiness — it is that the NEXT phase adds
    // another write site. Phases 1, 6 and 9 each do. A twelfth hand-written
    // statement would compile, pass every other test, and reintroduce exactly
    // the mistakes this replaced, so the file tree is the check.
    const offenders = appFiles()
      .filter((f) => f !== join("app", "lib", "mining", "runStore.ts"))
      .filter((f) => readFileSync(f, "utf8").includes(WRITE));
    expect(offenders).toEqual([]);
  });

  it("T3755 - and mining never writes a diagram's data by hand either", () => {
    // The same hazard, one table over: re-discovering a diagram in place was
    // spelled out in five places. Scoped to the mining paths — the editor has
    // its own, much larger save path and is none of this test's business.
    const DIAGRAM_WRITE = 'UPDATE "Diagram" SET data';
    const offenders = appFiles()
      .filter((f) => f.includes(join("lib", "mining")) || f.includes(`${join("mining", "runs")}`))
      .filter((f) => f !== join("app", "lib", "mining", "diagramStore.ts"))
      .filter((f) => readFileSync(f, "utf8").includes(DIAGRAM_WRITE));
    expect(offenders).toEqual([]);
  });
});

/**
 * T5260 — the User Guide's Simulation distributions table lists Lognormal, with when and why to prefer it (Paul, 2026-10-06).
 * The text lives in the database; this is the idempotent SQL patch for the in-app Database tile (proven locally, run twice: UPDATE 1 x3, then 0)
 * and the one-off seed script that would otherwise put the old table back.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sample } from "@/app/lib/simulation/distributions";

const sql = readFileSync("scripts/sql/patch-ug-simulation-lognormal-2026-10-06.sql", "utf8");
const seed = readFileSync("scripts/add-user-guide-distributions.ts", "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("T5260 the Lognormal documentation", () => {
  it("the table gets a Lognormal row with its parameters (mean and sd of the times themselves) and what it is for", () => {
    expect(sql).toContain("| **Lognormal** | `mean`, `sd` |");
    expect(sql).toContain("not of their logarithms");
    expect(seed).toContain("| **Lognormal** | \\`mean\\`, \\`sd\\` |");
  });
  it("says when and why to prefer it: right-skewed work, the tail Normal and Triangular cannot give, and when not to bother", () => {
    for (const text of [sql, seed]) {
      expect(text).toContain("**When to prefer Lognormal**");
      expect(text).toContain("right-skewed");
      expect(text).toContain("understate the rare long cases");
      expect(text).toContain("**When not.**");
    }
  });
  it("the Tasks bullet points at it, in the patch and in the seed", () => {
    expect(sql).toContain("**Lognormal** when real work has a long tail of slow cases");
    expect(seed).toContain("**Lognormal** when real work has a long tail of slow cases");
  });
  it("the patch is safe: one section, guarded, nothing deleted, report after the commit", () => {
    expect((code.match(/^\s*UPDATE "HelpSection"/gm) ?? []).length).toBe(3);
    expect(code).toContain("NOT LIKE '%| **Lognormal** |%'");
    expect(code).toContain("NOT LIKE '%When to prefer Lognormal**%'");
    expect(code).not.toMatch(/^\s*(DELETE\s+FROM|DROP\s+|TRUNCATE\s+)/im);
    expect(code.indexOf("COMMIT;")).toBeLessThan(code.indexOf("SELECT\n"));
  });
  it("what the guide claims about the distribution is true of the simulator: lognormal(mean, sd) has that mean, a right skew and no negatives", () => {
    let s = 1;
    const rng = { next: () => { s = (s * 16807) % 2147483647; return s / 2147483647; } };
    const xs = Array.from({ length: 40000 }, () => sample({ kind: "lognormal", mean: 30, sd: 20 }, rng as never));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sorted = [...xs].sort((a, b) => a - b);
    expect(mean).toBeGreaterThan(28.5);
    expect(mean).toBeLessThan(31.5);
    expect(sorted[0]).toBeGreaterThanOrEqual(0);
    expect(sorted[Math.floor(xs.length / 2)]).toBeLessThan(mean);          // median below the mean: a right-skewed tail
    expect(sorted[xs.length - 1]).toBeGreaterThan(3 * mean);               // …and the occasional very long case
  });
});

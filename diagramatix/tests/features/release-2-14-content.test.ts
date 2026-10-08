/**
 * T5292 — the release 2.14 content SQL (Steps 10-12 of "update everything") is safe to run, safe to re-run, and says what it did
 * (Paul, 2026-10-09: scripts must report whether they were already run).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PRODUCT_VERSION, SCHEMA_VERSION } from "@/app/lib/diagram/types";

const sql = readFileSync("scripts/sql/publish-release-2-14-content.sql", "utf8");
const BODY = sql.slice(sql.indexOf("BEGIN;"));

describe("T5292 release 2.14 content SQL", () => {
  it("is the content for the version that is in the code, with one build number everywhere", () => {
    expect(PRODUCT_VERSION).toBe("2.14");
    expect(SCHEMA_VERSION).toBe("49");                                  // no XSD change this release
    const builds = new Set(sql.match(/2\.14\.\d+/g));
    expect([...builds]).toHaveLength(1);                                // the one number to check against the live badge
    expect(sql).toContain("This guide covers version **2.14.2938**");
  });

  it("is non-destructive: nothing is deleted or truncated, only the two temporary objects are dropped, and every insert is guarded", () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    const drops = sql.match(/\bDROP\s+\w+\s+(IF EXISTS\s+)?\S+/gi) ?? [];
    expect(drops.every((d) => /_r214_/.test(d))).toBe(true);
    // five INSERTs (chapters, sections, features, tech chapter, tech sections), each guarded by its own NOT EXISTS
    expect(BODY.split(/\bINSERT INTO\b/).slice(1)).toHaveLength(5);
    expect(BODY.match(/WHERE NOT EXISTS/g)!.length).toBe(5);
  });

  it("adds exactly what the report counts: 5 guide chapters, 22 guide sections, 4 draft features, 1 tech chapter, 6 tech sections (+ the version line = 39)", () => {
    const guideSlugs = ["process-repository-projects", "org-process-repository", "ai-generate-checks", "diagram-badges", "manage-subscription"];
    const sections = [...sql.matchAll(/^\s*\('([a-z-]+)', \d+, '/gm)].filter((m) => guideSlugs.includes(m[1]));
    expect(sections).toHaveLength(22);
    expect(new Set(sections.map((m) => m[1]))).toEqual(new Set(guideSlugs));
    expect([...sql.matchAll(/^\s*\(\d, '[^']+', \$T\$/gm)]).toHaveLength(6);
    expect([...sql.matchAll(/\$F\$,\s*91\d\)/g)]).toHaveLength(4);
    expect(1 + 5 + 22 + 4 + 1 + 6).toBe(39);
    expect(sql.match(/= 39\b/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("features arrive as DRAFTS (publishing to /features stays Paul's call) and the result row says what happened", () => {
    expect(BODY).not.toMatch(/"publishedAt"\s*=\s*NOW\(\)/);
    for (const word of ["ALREADY APPLIED", "APPLIED NOW", "NOT FULLY APPLIED"]) expect(sql).toContain(word);
  });

  it("the release is recorded: the history entry, the changelog header and the product version agree", () => {
    const hist = readFileSync("VERSION_HISTORY.md", "utf8");
    expect(hist).toMatch(/^## 2\.14\.2938 — 2026-10-09 — /m);
    expect(readFileSync("schema/SCHEMA_CHANGELOG.md", "utf8")).toContain("**Product version:** `2.14`");
  });
});

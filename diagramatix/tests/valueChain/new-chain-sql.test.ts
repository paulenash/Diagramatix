/**
 * T5303 — the two idempotent SQL files that come with "Create a New Value Chain" (Paul, 2026-10-10): the Feature Availability cells and the
 * documentation. Each must be safe to run twice and must SAY what it did (ALREADY APPLIED / APPLIED NOW / NOT APPLIED).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const feature = readFileSync("scripts/sql/patch-create-value-chain-feature.sql", "utf8");
const docs = readFileSync("scripts/sql/publish-create-new-value-chain-docs.sql", "utf8");

describe("T5303 the Feature Availability seed", () => {
  it("sets Expert and Enterprise available and the three lower levels hidden, in one reporting statement", () => {
    for (const [lvl, st] of [["free", "hidden"], ["introductory", "hidden"], ["professional", "hidden"], ["expert", "available"], ["enterprise", "available"]]) {
      expect(feature).toMatch(new RegExp(`\\('${lvl}',\\s+'create-value-chain',\\s+'${st}'\\)`));
    }
    for (const word of ["ALREADY APPLIED", "APPLIED NOW", "NOT APPLIED"]) expect(feature).toContain(word);
    expect(feature).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+TABLE\b/i);
    expect(feature).toContain('ON CONFLICT ("levelId", "featureKey")');
  });
  it("agrees with the JSON seed the grid is built from", () => {
    const seed = JSON.parse(readFileSync("menus_and_features/feature-availability.seed.json", "utf8")) as { rows: { key: string; states: Record<string, string> }[] };
    expect(seed.rows.find((r) => r.key === "create-value-chain")!.states).toEqual({
      free: "hidden", introductory: "hidden", professional: "hidden", expert: "available", enterprise: "available",
    });
  });
});

describe("T5303 the documentation SQL", () => {
  const body = docs.slice(docs.indexOf("BEGIN;"));
  it("is non-destructive and adds each piece only where it is missing", () => {
    expect(docs).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
    expect(docs).not.toMatch(/\bUPDATE\b/);                                       // it does not touch the version line or any existing text
    const inserts = body.split(/\bINSERT INTO\b/).slice(1);
    expect(inserts).toHaveLength(5);                                              // chapter, sections, feature, tech chapter, tech sections
    expect(body.match(/WHERE NOT EXISTS/g)!.length).toBe(5);
  });
  it("adds exactly what the report counts: 1 chapter, 6 sections, 1 feature, 1 tech chapter, 5 tech sections = 14", () => {
    const userBlock = body.slice(body.indexOf("1. User Guide"), body.indexOf("2. Features catalog"));
    const techBlock = body.slice(body.indexOf("3. Technical Notes"));
    expect([...userBlock.matchAll(/^\s+\((\d), '[^']+', \$B\$/gm)]).toHaveLength(6);
    expect([...techBlock.matchAll(/^\s+\((\d), '[^']+', \$T\$/gm)]).toHaveLength(5);
    expect(body).toContain("'Create a New Value Chain', 'Describe a value chain");
    expect(1 + 6 + 1 + 1 + 5).toBe(14);
    expect(docs.match(/= 14\b/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it("the feature arrives as a DRAFT and the result row says what happened", () => {
    expect(body).not.toMatch(/"publishedAt"\s*=\s*NOW\(\)/);
    for (const word of ["ALREADY APPLIED", "APPLIED NOW", "NOT FULLY APPLIED"]) expect(docs).toContain(word);
  });
  it("says what the feature actually does (the numbers and rules the code enforces)", () => {
    for (const fact of ["5 to 12", "7 to 16 prompts", "C01, C02", "Expert", "one AI attempt", "OrgAdmin", "SuperAdmin"]) expect(docs, fact).toContain(fact);
  });
});

/**
 * T5259 — AI Model Selection, slice 6 (Paul, 2026-10-05): the DB-held documentation as an idempotent SQL patch for the in-app Database tile.
 * (Proven against the local database in a rolled-back transaction, run twice: three inserts, then none.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("scripts/sql/patch-ai-model-selection-docs-2026-10-05.sql", "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("T5259 the documentation patch", () => {
  it("adds one OrgAdmin section, one SuperAdmin section and one Technical Notes section, each only when its heading is not there", () => {
    expect(sql).toContain("'AI Models for your organisation'");
    expect(sql).toContain("ch.collection = 'user-guide' AND ch.slug = 'org-admin'");
    expect(sql).toContain("'AI model lists per organisation'");
    expect(sql).toContain("ch.collection = 'user-guide' AND ch.slug = 'admin-roles'");
    expect(sql).toContain("'Per-Org AI models — one resolver'");
    expect(sql).toContain("ch.collection = 'tech-design' AND ch.slug = 'ai-generation'");
    expect(sql.match(/AND NOT EXISTS \(SELECT 1 FROM "HelpSection" s WHERE s\."chapterId" = ch\.id AND s\.heading = /g)?.length).toBe(3);
  });
  it("is safe on the live database: a transaction, inserts only, reports after the commit", () => {
    expect(code).toContain("BEGIN;");
    expect(code.indexOf("COMMIT;")).toBeLessThan(code.indexOf("SELECT\n"));
    expect(code).not.toMatch(/^\s*(UPDATE|DELETE\s+FROM|DROP\s+|TRUNCATE\s+)/im);
  });
  it("what it says matches the rules", () => {
    expect(sql).toContain("Your people never choose a model, and never see which one is in use.");
    expect(sql).toContain("An **empty** list means \"use the global setting\"");
    expect(sql).toContain("When you are **acting as** a customer level, pickers and model names are hidden");
    expect(sql).toContain("`resolveOrgModel({ purpose?, hasImage?, orgId? })`");
    expect(sql).toContain("`chooseModel` returns the model in force for everyone but a SuperAdmin");
  });
});

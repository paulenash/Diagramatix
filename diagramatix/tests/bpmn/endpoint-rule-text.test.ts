/**
 * T5241 — the endpoint rule is written down (slice 6 of new features/connector-endpoints-plan-2026-10-03.md): rule R8.41 in
 * the seeded BPMN rules and in an idempotent SQL patch for the live database, plus the User Guide and Technical Notes
 * sections — and the code that enforces it names the rule. The patch text and the seed text must say the same thing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const seed = readFileSync("scripts/seed-diagram-rules.cjs", "utf8");
const sql = readFileSync("scripts/sql/patch-rule-r8-41-one-connector-per-point.sql", "utf8");

/** The rule line as the seed writes it (a JS string with \n and \" escapes) → plain text. */
function ruleFromSeed(): string {
  const at = seed.indexOf("R8.41:");
  const end = seed.indexOf('"', seed.indexOf("stays exactly as drawn.", at));
  return (JSON.parse(`"${seed.slice(at, end)}"`) as string).split("\nR8.42:")[0];   // R8.42 is appended to the same string
}
function ruleFromSql(): string {
  const m = sql.match(/\$NEW\$(R8\.41:[\s\S]*?)\$NEW\$/);
  return m ? m[1] : "";
}

describe("T5241 R8.41 — the rule text", () => {
  it("is in the seeded BPMN rules, in Group 8 (the code-backed layout group), after R8.39", () => {
    expect(seed).toContain("R8.41:");
    expect(seed.indexOf("R8.41:")).toBeGreaterThan(seed.indexOf("R8.39:"));
    expect(seed.indexOf("Group 8: Auto-Layout Placement")).toBeLessThan(seed.indexOf("R8.41:"));
  });
  it("the seed and the SQL patch say exactly the same thing (one rule, one place)", () => {
    expect(ruleFromSql().trim()).toBe(ruleFromSeed().trim());
  });
  it("it states the whole rule: spacing by element, the order, gateways exempt, every way a connector is made, heal on load, as drawn", () => {
    const t = ruleFromSql();
    for (const needle of ["8 px", "3 px", "24 px", "Gateway is exempt", "NL Assist", "template", "AI generation", "only the connectors a change touches move",
      "one Undo restores", "stays exactly as drawn", "in the order of the elements they reach"]) expect(t, needle).toContain(needle);
  });
});

describe("T5241 the SQL patch is safe to run on the live database", () => {
  it("is idempotent and never reseeds: guarded by NOT LIKE / NOT EXISTS, appends only when Group 8 is the last group", () => {
    expect(sql).toContain("AND rules NOT LIKE '%R8.41:%'");
    expect(sql).toContain("LIKE 'Group 8: Auto-Layout Placement%'");
    expect(sql.match(/NOT EXISTS/g)?.length).toBe(2);                     // one per help section
    expect(sql).toMatch(/NEVER A RESEED/);
    expect(sql).not.toContain("DELETE FROM");                          // it deletes nothing
    expect(sql).not.toContain("TRUNCATE");
  });
  it("reports its own result after the commit", () => {
    expect(sql.indexOf("COMMIT;")).toBeLessThan(sql.indexOf("AS verdict"));
    expect(sql).toContain("each there exactly once");
  });
  it("adds one User Guide section (Connectors & Routing) and one Technical Notes section (Diagram Model & Canvas)", () => {
    expect(sql).toContain("ch.collection = 'user-guide' AND ch.slug = 'connectors'");
    expect(sql).toContain("ch.collection = 'tech-design' AND ch.slug = 'diagram-canvas'");
    expect(sql).toContain("One connector per attachment point");
    expect(sql).toContain("Connector attachment points — one allocator");
    expect(sql).toContain("**flash green**");
    expect(sql).toContain("Undo");
    expect(sql).toContain("endpointSpread.ts");
    expect(sql).toContain("T5234");
  });
});

describe("T5241 the code names the rule", () => {
  it("generation and the shared-point check refer to R8.41, and the check still exempts a gateway's forced doubling", () => {
    expect(readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8")).toContain("R8.41 (replaces R5.06 / R8.11 / R8.12)");
    const check = readFileSync("app/lib/diagram/checks/layoutViolations.ts", "utf8");
    expect(check).toContain("R8.41");
    expect(check).toContain("const unavoidable");           // gateways with more than three on an axis: still exempt by decision
  });
});

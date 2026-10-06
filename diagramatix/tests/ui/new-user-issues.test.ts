/**
 * T5269 — new-user issues (Paul, 2026-10-06): the Create account button stays disabled until the page moves on, and the Feature
 * Availability grid names the prerequisite that is capping a cell (Simulator Examples needs Simulator) with a one-click fix.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("T5269 register page", () => {
  const src = readFileSync("app/(auth)/register/page.tsx", "utf8");
  it("only re-enables the button on failure, and ignores a second submit while one is running", () => {
    expect(src).toContain("if (loading) return;");
    expect(src).toMatch(/if \(!res\.ok\) \{\s*setLoading\(false\);/);
    expect(src.match(/setLoading\(false\)/g)?.length).toBe(1);
    expect(src).toContain("disabled={loading}");
  });
});

describe("T5269 Feature Availability grid", () => {
  const src = readFileSync("app/(dashboard)/dashboard/admin/feature-availability/FeatureAvailabilityEditor.tsx", "utf8");
  it("says which prerequisite caps a cell and offers to make it Available", () => {
    expect(src).toContain("blockedBy(");
    expect(src).toContain("make it Available");
    expect(src).toContain('setCell(l.id, need, "available")');
  });
});
